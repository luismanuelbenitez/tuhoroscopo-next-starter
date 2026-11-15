// ============================================================
// ef_tarot_campanas_runner — Motor de campañas (2026-10-19)
//
// Lo llama pg_cron cada 15 minutos (job tarot_campanas_runner) y, a mano,
// el admin ("Ejecutar ahora"). Por cada campaña ACTIVA:
//   1. Encola los candidatos vencidos (tarot_campana_feedback_candidatos):
//      una fila por campaña × orden, única → nunca dos pedidos por orden.
//   2. Si está dentro de la ventana horaria y del límite diario, envía los
//      pendientes (y reintenta errores con backoff hasta max_intentos).
//
// Campañas en borrador / pausada / finalizada: no se toca nada; los
// pendientes quedan esperando (no se pierden).
//
// modo_envio = 'simulado' (default): todo el circuito corre (token, costos
// en 0, métricas) pero NUNCA se llama a Meta. 'real' además respeta
// tarot_configuracion.whatsapp_modo (sandbox → simula) y whatsapp_destinos
// ('lista' → solo números autorizados).
//
// Envío real: template de Meta (mensaje.template_nombre) con {{1}} = nombre
// de pila y botón URL dinámico = token. El mensaje queda registrado en
// tarot_whatsapp_mensajes (outbound) → ef_webhook_whatsapp_events ya
// actualiza entregado/leído por whatsapp_message_id, sin cambios.
//
// Autoaislada a propósito (no importa _shared/*): esos módulos tienen
// divergencias repo/producción documentadas.
//
// 2026-11-14 — Campañas MANUALES (seleccion = 'manual'): Manuel elige a quién
// y dispara desde el admin. El motor no busca candidatos: solo manda los
// envíos 'pendiente' (en orden, en horario, con el tope diario) y, cuando no
// queda nada por mandar, marca la campaña como finalizada. Tipos:
//   feedback_experiencia → plantilla con {{1}} nombre + botón /opinion/<token>
//   cupon_descuento      → plantilla con {{1}} nombre, {{2}} descuento,
//                          {{3}} código, {{4}} vence + botón /beneficio/<token>
// Acciones extra (body.accion), siempre por pedido del admin:
//   'prueba'          → manda la plantilla SOLO al número de prueba
//                        (tarot_configuracion.campanas_telefono_prueba)
//   'plantilla'       → estado de la plantilla en Meta
//   'plantilla_crear' → la manda a aprobación de Meta (no envía mensajes)
// ============================================================

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
// Graph API: misma versión que _shared/wa-graph.ts (no se importa: esta
// función es autoaislada). 2026-10-21: v18.0 → v26.0.
const GRAPH_BASE = Deno.env.get("WHATSAPP_GRAPH_BASE") || "https://graph.facebook.com/v26.0";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const WHATSAPP_PHONE_NUMBER_ID  = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const WHATSAPP_TAROT_TOKEN_PROD = Deno.env.get("WHATSAPP_TAROT_TOKEN_PROD") ?? "";
const FN = "ef_tarot_campanas_runner";

const MAX_ENVIOS_POR_CORRIDA = 20;
const BACKOFF_REINTENTO_MIN  = 30;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Campana {
  id: string;
  slug: string;
  nombre: string;
  tipo: string;
  estado: string;
  canal: string;
  modo_envio: "simulado" | "real";
  disparador: Record<string, unknown>;
  mensaje: Record<string, unknown>;
  ventana_horaria: { desde?: number; hasta?: number; zona?: string };
  limite_diario: number;
  max_intentos: number;
  costo_estimado_por_envio: number | null;
  costo_moneda: string;
  seleccion?: "automatica" | "manual";
  codigo_descuento_id?: string | null;
}

// ── Plantillas de Meta por tipo (categoría MARKETING: Meta no nos permite
// UTILITY). El texto vive en Meta una vez aprobada; acá queda el que se manda
// a aprobación y el que se usa para la vista previa y la bandeja.
const PLANTILLAS: Record<string, { nombre: string; cuerpo: string; boton: string; url: string; ejemplo: string[] }> = {
  feedback_experiencia: {
    nombre: "tu_oraculo_feedback_v1",
    cuerpo: "Hola, {{1}} 🌙\n\nGracias por confiar en Tu Oráculo para tu lectura. ¿Nos contás cómo te fue? Te lleva menos de un minuto y nos ayuda mucho a mejorar.",
    boton: "Dejar mi opinión",
    url: "https://tuoraculo.uy/opinion/",
    ejemplo: ["Paula"],
  },
  cupon_descuento: {
    nombre: "tu_oraculo_cupon_v1",
    cuerpo: "Hola, {{1}} ✨\n\nGracias por tu lectura con Tu Oráculo. Te regalamos {{2}} de descuento en tu próxima tirada con el código {{3}}.\n\nVale hasta el {{4}}.",
    boton: "Usar mi descuento",
    url: "https://tuoraculo.uy/beneficio/",
    ejemplo: ["Paula", "20 %", "GRACIAS20", "31/12"],
  },
};

interface DatosCupon { codigo: string; descuento: string; vence: string }

async function datosCupon(c: Campana): Promise<DatosCupon | null> {
  if (!c.codigo_descuento_id) return null;
  const { data: d } = await supabase.from("tarot_codigos_descuento")
    .select("codigo, tipo_descuento, valor_descuento, fecha_fin, activo").eq("id", c.codigo_descuento_id).maybeSingle();
  if (!d || !d.activo) return null;
  const v = Number(d.valor_descuento);
  const descuento = d.tipo_descuento === "porcentaje" ? `${v} %` : `$${v.toLocaleString("es-UY")}`;
  const vence = d.fecha_fin
    ? new Intl.DateTimeFormat("es-UY", { day: "2-digit", month: "2-digit", timeZone: "America/Montevideo" }).format(new Date(d.fecha_fin))
    : "31/12"; // el admin exige fecha de vencimiento al crear el cupón
  return { codigo: d.codigo, descuento, vence };
}

function rellenar(cuerpo: string, valores: string[]): string {
  return cuerpo.replace(/\{\{(\d)\}\}/g, (_, n) => valores[Number(n) - 1] ?? "");
}

interface Candidato {
  orden_id: string;
  cliente_id: string | null;
  telefono: string;
  entregada_at: string;
  abierta_at: string | null;
  motivo: string;
  programado_para: string;
  vencido: boolean;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function log(evento: string, nivel: "info" | "warning" | "error", mensaje: string, payload: Record<string, unknown> = {}, ordenId: string | null = null) {
  try {
    await supabase.from("tarot_logs").insert({ orden_id: ordenId, evento, nivel, mensaje, payload, funcion_origen: FN });
  } catch (e) {
    console.error("tarot_logs insert falló:", e);
  }
}

async function funnel(ordenId: string, eventName: string, metadata: Record<string, unknown>) {
  try {
    await supabase.from("funnel_events").insert({
      order_id: ordenId, event_name: eventName,
      product_id: "tarot_campanas", product_name: "Campaña de feedback",
      path: "/opinion", metadata,
    });
  } catch { /* best-effort */ }
}

// ── Token de la mini web (mismo esquema que tarot_accesos_web) ──────────────
function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function generarToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function horaLocal(zona: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: zona }).format(new Date());
  return Number(h);
}

function inicioDiaISO(zona: string): string {
  // Medianoche local de hoy expresada en UTC (zonas sin DST, ej. Montevideo).
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
  const offsetMin = (() => {
    const local = new Date(ahora.toLocaleString("en-US", { timeZone: zona }));
    const utc = new Date(ahora.toLocaleString("en-US", { timeZone: "UTC" }));
    return Math.round((local.getTime() - utc.getTime()) / 60000);
  })();
  return new Date(new Date(`${partes}T00:00:00Z`).getTime() - offsetMin * 60000).toISOString();
}

function nombrePila(nombre: string | null): string {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primero || /\d|@/.test(primero)) return "";
  return primero.charAt(0).toLocaleUpperCase("es") + primero.slice(1).toLocaleLowerCase("es");
}

async function configWA(): Promise<{ modo: string; destinos: string; autorizados: string[] }> {
  const { data } = await supabase.from("tarot_configuracion").select("clave, valor")
    .in("clave", ["whatsapp_modo", "whatsapp_destinos", "whatsapp_numeros_autorizados_prueba"]);
  const cfg = Object.fromEntries((data ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  return {
    modo: (cfg.whatsapp_modo ?? "sandbox").trim(),
    destinos: (cfg.whatsapp_destinos ?? "todos").trim(),
    autorizados: String(cfg.whatsapp_numeros_autorizados_prueba ?? "").split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean),
  };
}

// Registro en la bandeja de WhatsApp (outbound) — el webhook de estados ya
// actualiza tarot_whatsapp_mensajes por whatsapp_message_id.
// 2026-10-21: el teléfono se guarda con "+" (igual que la ingesta y
// tarot_clientes; antes iba sin "+" y un mismo contacto quedaba en DOS
// conversaciones), origen 'campana', y se aplican los avisos de Meta que
// hayan llegado antes de registrar el wamid (tarot_wa_reconciliar_status).
async function registrarEnBandeja(telefono: string, clienteId: string | null, ordenId: string, texto: string, wamid: string): Promise<string | null> {
  try {
    const digitos = telefono.replace(/\D/g, "");
    const telNorm = `+${digitos}`;
    let { data: conv } = await supabase.from("tarot_whatsapp_conversaciones")
      .select("id").in("telefono_normalizado", [telNorm, digitos])
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!conv) {
      const ins = await supabase.from("tarot_whatsapp_conversaciones")
        .insert({ telefono_normalizado: telNorm, cliente_id: clienteId, orden_id: ordenId, estado: "abierta" })
        .select("id").single();
      conv = ins.data;
    }
    if (!conv) return null;
    const ahora = new Date().toISOString();
    const { data: msg } = await supabase.from("tarot_whatsapp_mensajes").insert({
      conversacion_id: conv.id, whatsapp_message_id: wamid, direccion: "outbound", tipo: "text", origen: "campana",
      texto, estado: "enviado", enviado_at: ahora, timestamp_whatsapp: ahora,
    }).select("id").single();
    if (msg?.id) await supabase.rpc("tarot_wa_reconciliar_status", { p_mensaje_id: msg.id });
    await supabase.from("tarot_whatsapp_conversaciones").update({
      ultimo_mensaje_at: ahora, ultimo_mensaje_preview: texto.slice(0, 120), ultimo_mensaje_direccion: "outbound", updated_at: ahora,
    }).eq("id", conv.id);
    return msg?.id ?? null;
  } catch (e) {
    await log("campana_bandeja_error", "warning", "No se pudo registrar el envío en la bandeja de WhatsApp", { error: String(e) }, ordenId);
    return null;
  }
}

// Valores de las variables del cuerpo según el tipo de campaña.
function variablesCuerpo(c: Campana, nombre: string, cupon: DatosCupon | null): string[] {
  const n = nombre || "👋";
  if (c.tipo === "cupon_descuento" && cupon) return [n, cupon.descuento, cupon.codigo, cupon.vence];
  return [n];
}

function textoPreviewDe(c: Campana, nombre: string, cupon: DatosCupon | null): string {
  const p = PLANTILLAS[c.tipo];
  if (!p) return `Hola${nombre ? `, ${nombre}` : ""}.`;
  return `${rellenar(p.cuerpo, variablesCuerpo(c, nombre, cupon))}\n[${p.boton}]`;
}

async function enviarTemplate(c: Campana, telefono: string, nombre: string, token: string, cupon: DatosCupon | null) {
  const plantilla = String(c.mensaje.template_nombre ?? PLANTILLAS[c.tipo]?.nombre ?? "");
  const idioma = String(c.mensaje.template_idioma ?? "es");
  if (!plantilla) return { ok: false, error: "mensaje.template_nombre no configurado" };
  if (c.tipo === "cupon_descuento" && !cupon) return { ok: false, error: "la campaña no tiene un cupón activo" };
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TAROT_TOKEN_PROD) return { ok: false, error: "credenciales de WhatsApp no configuradas" };
  const body = {
    messaging_product: "whatsapp",
    to: telefono.replace(/^\+/, ""),
    type: "template",
    template: {
      name: plantilla,
      language: { code: idioma },
      components: [
        { type: "body", parameters: variablesCuerpo(c, nombre, cupon).map((text) => ({ type: "text", text })) },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: token }] },
      ],
    },
  };
  try {
    const res = await fetch(`${GRAPH_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TAROT_TOKEN_PROD}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { code?: number; message?: string } };
    if (res.ok && data.messages?.[0]?.id) return { ok: true, wamid: data.messages[0].id };
    return { ok: false, error: `${data.error?.code ?? res.status}: ${data.error?.message ?? "error de WhatsApp"}`.slice(0, 300) };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300) };
  }
}

async function procesarCampana(c: Campana, opts: { devolverTokensSimulados: boolean }) {
  const resumen: Record<string, unknown> = { campana: c.slug, encolados: 0, enviados: 0, simulados: 0, errores: 0, descartados: 0 };
  const tokensQA: { orden_id: string; token: string }[] = [];

  const manual = c.seleccion === "manual";

  // 1. Encolar candidatos vencidos (solo campañas automáticas: en las
  //    manuales la cola la arma el admin al disparar).
  if (!manual) {
    const { data: cands, error: errCand } = await supabase.rpc("tarot_campana_feedback_candidatos", { p_campana_id: c.id });
    if (errCand) {
      await log("campana_candidatos_error", "error", `Error calculando candidatos de ${c.slug}`, { error: errCand.message });
      return { ...resumen, error: errCand.message };
    }
    for (const k of (cands ?? []) as Candidato[]) {
      if (!k.vencido) continue;
      const { data: ins } = await supabase.from("tarot_campana_envios").upsert({
        campana_id: c.id, orden_id: k.orden_id, cliente_id: k.cliente_id, estado: "pendiente",
        motivo_disparo: k.motivo, entregada_at: k.entregada_at, abierta_at: k.abierta_at,
        programado_para: k.programado_para, es_prueba: false, telefono: k.telefono,
      }, { onConflict: "campana_id,orden_id,es_prueba", ignoreDuplicates: true }).select("id");
      if (ins && ins.length > 0) {
        resumen.encolados = (resumen.encolados as number) + 1;
        await funnel(k.orden_id, "campaign_eligible", { campana_id: c.id, motivo: k.motivo });
      }
    }
  }

  const resultado = await enviarCola(c, resumen, opts, tokensQA);
  if (manual) await cerrarSiTermino(c);
  return resultado;
}

// Campaña manual: cuando no queda nada por mandar (ni pendientes ni errores
// con reintentos disponibles), queda finalizada.
async function cerrarSiTermino(c: Campana) {
  const { count } = await supabase.from("tarot_campana_envios")
    .select("id", { count: "exact", head: true })
    .eq("campana_id", c.id).eq("es_prueba", false)
    .or(`estado.in.(pendiente,enviando),and(estado.eq.error,intentos.lt.${c.max_intentos})`);
  if ((count ?? 0) === 0) {
    await supabase.from("tarot_campanas").update({ estado: "finalizada", finalizada_at: new Date().toISOString(), actualizado_por: FN })
      .eq("id", c.id).eq("estado", "activa");
    await log("campana_finalizada", "info", `Campaña ${c.slug}: terminó de enviar`, { campana_id: c.id });
  }
}

async function enviarCola(c: Campana, resumen: Record<string, unknown>, opts: { devolverTokensSimulados: boolean }, tokensQA: { orden_id: string; token: string }[]) {

  // 2. Ventana horaria
  const zona = c.ventana_horaria?.zona ?? "America/Montevideo";
  const desde = Number(c.ventana_horaria?.desde ?? 10);
  const hasta = Number(c.ventana_horaria?.hasta ?? 21);
  const hora = horaLocal(zona);
  if (hora < desde || hora >= hasta) {
    return { ...resumen, fuera_de_ventana: true, hora_local: hora };
  }

  // 3. Límite diario
  const { count: enviadosHoy } = await supabase.from("tarot_campana_envios")
    .select("id", { count: "exact", head: true })
    .eq("campana_id", c.id).eq("es_prueba", false).eq("estado", "enviado").gte("enviado_at", inicioDiaISO(zona));
  const cupo = Math.min(MAX_ENVIOS_POR_CORRIDA, c.limite_diario - (enviadosHoy ?? 0));
  if (cupo <= 0) return { ...resumen, limite_diario_alcanzado: true };

  // 4. Pendientes + errores reintentables (con backoff)
  const corte = new Date(Date.now() - BACKOFF_REINTENTO_MIN * 60000).toISOString();
  const { data: cola } = await supabase.from("tarot_campana_envios")
    .select("id, orden_id, cliente_id, estado, intentos")
    .eq("campana_id", c.id).eq("es_prueba", false)
    .or(`estado.eq.pendiente,and(estado.eq.error,intentos.lt.${c.max_intentos},ultimo_intento_at.lt.${corte})`)
    .order("programado_para", { ascending: true })
    .limit(cupo);

  const wa = await configWA();
  const diasLink = Number(c.disparador.dias_validez_link ?? 30);
  const cupon = c.tipo === "cupon_descuento" ? await datosCupon(c) : null;
  if (c.tipo === "cupon_descuento" && !cupon) {
    await log("campana_sin_cupon", "error", `Campaña ${c.slug}: el cupón no existe o está inactivo; no se envía nada`, { campana_id: c.id });
    return { ...resumen, error: "cupon_inactivo" };
  }

  for (const item of cola ?? []) {
    // Reclamo atómico: solo una corrida procesa cada envío.
    const { data: reclamado } = await supabase.from("tarot_campana_envios")
      .update({ estado: "enviando", intentos: (item.intentos ?? 0) + 1, ultimo_intento_at: new Date().toISOString() })
      .eq("id", item.id).eq("estado", item.estado).eq("intentos", item.intentos ?? 0)
      .select("id");
    if (!reclamado || reclamado.length === 0) continue;

    const { data: orden } = await supabase.from("tarot_ordenes")
      .select("id, estado, nombre_snapshot, telefono_snapshot").eq("id", item.orden_id).maybeSingle();
    if (!orden?.telefono_snapshot || !["entregado", "entregado_simulado"].includes(orden.estado)) {
      await supabase.from("tarot_campana_envios").update({ estado: "descartado", ultimo_error: "orden ya no elegible" }).eq("id", item.id);
      resumen.descartados = (resumen.descartados as number) + 1;
      continue;
    }

    const token = generarToken();
    const tokenHash = await sha256Hex(token);
    const expira = new Date(Date.now() + diasLink * 86400000).toISOString();
    const nombre = nombrePila(orden.nombre_snapshot);
    const textoPreview = textoPreviewDe(c, nombre, cupon);
    const telDigits = orden.telefono_snapshot.replace(/\D/g, "");

    const simulado = c.modo_envio !== "real" || wa.modo !== "production";
    if (!simulado && wa.destinos === "lista" && !wa.autorizados.includes(telDigits)) {
      await supabase.from("tarot_campana_envios").update({ estado: "descartado", ultimo_error: "whatsapp_destinos=lista: número no autorizado" }).eq("id", item.id);
      await log("campana_destino_no_autorizado", "warning", "Envío de campaña descartado: whatsapp_destinos=lista y el número no está autorizado", { campana: c.slug }, item.orden_id);
      resumen.descartados = (resumen.descartados as number) + 1;
      continue;
    }

    let wamid: string | null = null;
    let mensajeId: string | null = null;
    if (simulado) {
      wamid = `sandbox_${crypto.randomUUID()}`;
    } else {
      const r = await enviarTemplate(c, orden.telefono_snapshot, nombre, token, cupon);
      if (!r.ok) {
        await supabase.from("tarot_campana_envios").update({ estado: "error", ultimo_error: r.error }).eq("id", item.id);
        await log("campana_envio_error", "error", `Error enviando campaña ${c.slug}`, { error: r.error, intento: (item.intentos ?? 0) + 1 }, item.orden_id);
        resumen.errores = (resumen.errores as number) + 1;
        continue;
      }
      wamid = r.wamid!;
      mensajeId = await registrarEnBandeja(orden.telefono_snapshot, item.cliente_id, item.orden_id, textoPreview, wamid);
    }

    const ahora = new Date().toISOString();
    await supabase.from("tarot_campana_envios").update({
      estado: "enviado", enviado_at: ahora, ultimo_error: null, simulado,
      wa_message_id: wamid, whatsapp_mensaje_id: mensajeId,
      token_hash: tokenHash, token_expira_at: expira,
      costo_estimado: simulado ? 0 : c.costo_estimado_por_envio, costo_moneda: c.costo_moneda,
    }).eq("id", item.id);
    await funnel(item.orden_id, "campaign_sent", { campana_id: c.id, simulado });
    if (simulado) {
      resumen.simulados = (resumen.simulados as number) + 1;
      if (opts.devolverTokensSimulados) tokensQA.push({ orden_id: item.orden_id, token });
    } else {
      resumen.enviados = (resumen.enviados as number) + 1;
    }
  }

  return opts.devolverTokensSimulados ? { ...resumen, tokens_simulados: tokensQA } : resumen;
}

// ── Plantillas en Meta ──────────────────────────────────────────────────────
async function wabaId(): Promise<string | null> {
  const { data } = await supabase.from("tarot_configuracion").select("valor").eq("clave", "whatsapp_waba_id").maybeSingle();
  return data?.valor ? String(data.valor) : null;
}

async function estadoPlantilla(c: Campana) {
  const p = PLANTILLAS[c.tipo];
  if (!p) return { ok: false, motivo: "tipo_sin_plantilla" };
  const nombre = String(c.mensaje.template_nombre ?? p.nombre);
  const idioma = String(c.mensaje.template_idioma ?? "es");
  const base = { nombre, idioma, cuerpo: p.cuerpo, boton: p.boton, ejemplo: rellenar(p.cuerpo, p.ejemplo) };
  const waba = await wabaId();
  if (!waba || !WHATSAPP_TAROT_TOKEN_PROD) return { ok: false, ...base, estado: "error", detalle: "falta whatsapp_waba_id o token" };
  try {
    const res = await fetch(`${GRAPH_BASE}/${waba}/message_templates?name=${encodeURIComponent(nombre)}&fields=name,status,category,language,rejected_reason`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TAROT_TOKEN_PROD}` },
    });
    const data = await res.json().catch(() => ({})) as { data?: Array<Record<string, unknown>>; error?: { message?: string } };
    if (!res.ok) return { ok: false, ...base, estado: "error", detalle: data.error?.message ?? `HTTP ${res.status}` };
    const t = (data.data ?? []).find((x) => x.name === nombre && x.language === idioma);
    if (!t) return { ok: true, ...base, estado: "NO_CREADA" };
    return { ok: true, ...base, estado: String(t.status ?? "DESCONOCIDO"), categoria: t.category ?? null, motivo_rechazo: t.rejected_reason ?? null };
  } catch (e) {
    return { ok: false, ...base, estado: "error", detalle: String(e).slice(0, 200) };
  }
}

// Manda la plantilla a aprobación de Meta. No envía ningún mensaje.
async function crearPlantilla(c: Campana) {
  const p = PLANTILLAS[c.tipo];
  if (!p) return { ok: false, motivo: "tipo_sin_plantilla" };
  const nombre = String(c.mensaje.template_nombre ?? p.nombre);
  const idioma = String(c.mensaje.template_idioma ?? "es");
  const actual = await estadoPlantilla(c) as Record<string, unknown>;
  if (actual.estado !== "NO_CREADA") return { ...actual, motivo: actual.ok ? "ya_existe" : "error_consulta" };
  const waba = await wabaId();
  const res = await fetch(`${GRAPH_BASE}/${waba}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TAROT_TOKEN_PROD}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: nombre, language: idioma, category: "MARKETING",
      components: [
        { type: "BODY", text: p.cuerpo, example: { body_text: [p.ejemplo] } },
        { type: "BUTTONS", buttons: [{ type: "URL", text: p.boton, url: `${p.url}{{1}}`, example: [`${p.url}ejemplo123`] }] },
      ],
    }),
  });
  const data = await res.json().catch(() => ({})) as { id?: string; status?: string; error?: { message?: string; error_user_msg?: string } };
  await log(res.ok ? "campana_plantilla_solicitada" : "campana_plantilla_error", res.ok ? "info" : "error",
    res.ok ? `Plantilla ${nombre} enviada a revisión de Meta` : `Meta rechazó crear la plantilla ${nombre}`,
    { campana_id: c.id, http_status: res.status, estado: data.status ?? null, error: data.error?.message ?? null });
  if (!res.ok) return { ok: false, motivo: "meta_error", detalle: data.error?.error_user_msg ?? data.error?.message ?? `HTTP ${res.status}` };
  return { ...(await estadoPlantilla(c)), ok: true };
}

// ── Prueba: la plantilla real, SOLO al número de prueba ─────────────────────
async function enviarPrueba(c: Campana) {
  if (!PLANTILLAS[c.tipo]) return { ok: false, motivo: "tipo_sin_plantilla" };
  const { data: cfgTel } = await supabase.from("tarot_configuracion").select("valor").eq("clave", "campanas_telefono_prueba").maybeSingle();
  const dig = String(cfgTel?.valor ?? "").replace(/\D/g, "");
  if (!dig) return { ok: false, motivo: "sin_telefono_prueba" };
  const wa = await configWA();
  if (wa.modo !== "production") return { ok: false, motivo: "whatsapp_sandbox", detalle: "WhatsApp está en modo sandbox: no se puede mandar la prueba." };

  // La prueba se asocia a la última orden de ese mismo número (las de Manuel).
  const { data: orden } = await supabase.from("tarot_ordenes")
    .select("id, cliente_id, nombre_snapshot, telefono_snapshot")
    .in("telefono_snapshot", [`+${dig}`, dig])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!orden) return { ok: false, motivo: "sin_orden_de_prueba", detalle: "El número de prueba no tiene ninguna orden." };
  if (orden.telefono_snapshot.replace(/\D/g, "") !== dig) return { ok: false, motivo: "telefono_no_coincide" };

  const cupon = c.tipo === "cupon_descuento" ? await datosCupon(c) : null;
  if (c.tipo === "cupon_descuento" && !cupon) return { ok: false, motivo: "cupon_inactivo", detalle: "La campaña no tiene un cupón activo." };

  const token = generarToken();
  const tokenHash = await sha256Hex(token);
  const diasLink = Number(c.disparador?.dias_validez_link ?? 30);
  const expira = new Date(Date.now() + diasLink * 86400000).toISOString();
  const nombre = nombrePila(orden.nombre_snapshot);

  // Una sola fila de prueba por campaña: si ya había, se reutiliza (y se borra
  // la opinión de prueba anterior, para poder volver a responder).
  const { data: previa } = await supabase.from("tarot_campana_envios").select("id")
    .eq("campana_id", c.id).eq("es_prueba", true).maybeSingle();
  if (previa) {
    const { data: resp } = await supabase.from("tarot_feedback_respuestas").select("id").eq("envio_id", previa.id).maybeSingle();
    if (resp) {
      await supabase.from("tarot_feedback_respuestas").update({ testimonio_id: null }).eq("id", resp.id);
      await supabase.from("tarot_testimonios").delete().eq("feedback_respuesta_id", resp.id).eq("publicado", false);
      await supabase.from("tarot_feedback_respuestas").delete().eq("id", resp.id);
    }
  }
  const fila = {
    campana_id: c.id, orden_id: orden.id, cliente_id: orden.cliente_id, es_prueba: true, motivo_disparo: "prueba",
    estado: "enviando", telefono: `+${dig}`, nombre: orden.nombre_snapshot, intentos: 1, ultimo_intento_at: new Date().toISOString(),
    token_hash: tokenHash, token_expira_at: expira, primera_visita_at: null, visitas: 0, respondido_at: null, ultimo_error: null,
  };
  const { data: envio, error: errEnvio } = previa
    ? await supabase.from("tarot_campana_envios").update(fila).eq("id", previa.id).select("id").single()
    : await supabase.from("tarot_campana_envios").insert(fila).select("id").single();
  if (errEnvio || !envio) return { ok: false, motivo: "db_error", detalle: errEnvio?.message };

  const r = await enviarTemplate(c, orden.telefono_snapshot, nombre, token, cupon);
  if (!r.ok) {
    await supabase.from("tarot_campana_envios").update({ estado: "error", ultimo_error: r.error }).eq("id", envio.id);
    await log("campana_prueba_error", "error", `Prueba de campaña ${c.slug} falló`, { error: r.error, campana_id: c.id });
    return { ok: false, motivo: "meta_error", detalle: r.error };
  }
  const mensajeId = await registrarEnBandeja(orden.telefono_snapshot, orden.cliente_id, orden.id, textoPreviewDe(c, nombre, cupon), r.wamid!);
  await supabase.from("tarot_campana_envios").update({
    estado: "enviado", enviado_at: new Date().toISOString(), simulado: false, wa_message_id: r.wamid, whatsapp_mensaje_id: mensajeId,
    costo_estimado: c.costo_estimado_por_envio, costo_moneda: c.costo_moneda,
  }).eq("id", envio.id);
  await log("campana_prueba_enviada", "info", `Prueba de campaña ${c.slug} enviada al número de prueba`, { campana_id: c.id });
  return { ok: true, enviado_a: `+${dig.slice(0, 3)}…${dig.slice(-3)}` };
}

serve(async (req) => {
  if (req.headers.get("x-internal-key") !== TAROT_INTERNAL_KEY || !TAROT_INTERNAL_KEY) {
    return json({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return json({ ok: false, motivo: "metodo_no_permitido" }, 405);
  const body = await req.json().catch(() => ({})) as { campana_id?: string; devolver_tokens_simulados?: boolean; accion?: string };

  if (body.accion === "prueba" || body.accion === "plantilla" || body.accion === "plantilla_crear") {
    if (!body.campana_id) return json({ ok: false, motivo: "falta_campana" }, 400);
    const { data: c } = await supabase.from("tarot_campanas").select("*").eq("id", body.campana_id).maybeSingle();
    if (!c) return json({ ok: false, motivo: "no_encontrada" }, 404);
    if (body.accion === "prueba") return json(await enviarPrueba(c as Campana));
    if (body.accion === "plantilla") return json(await estadoPlantilla(c as Campana));
    return json(await crearPlantilla(c as Campana));
  }

  let q = supabase.from("tarot_campanas").select("*").eq("estado", "activa");
  if (body.campana_id) q = q.eq("id", body.campana_id);
  const { data: campanas, error } = await q;
  if (error) return json({ ok: false, motivo: "error_query", detalle: error.message }, 500);

  const resultados = [];
  for (const c of (campanas ?? []) as Campana[]) {
    if (!PLANTILLAS[c.tipo] || c.canal !== "whatsapp") continue; // tipos implementados: feedback y cupón
    // El cupón solo existe como campaña manual.
    if (c.tipo === "cupon_descuento" && c.seleccion !== "manual") continue;
    // Tokens crudos solo para campañas SIMULADAS y solo si se piden (QA).
    const devolver = body.devolver_tokens_simulados === true && c.modo_envio === "simulado";
    const r = await procesarCampana(c, { devolverTokensSimulados: devolver });
    const { tokens_simulados: _omit, ...paraGuardar } = r as Record<string, unknown>;
    await supabase.from("tarot_campanas").update({
      ultima_ejecucion_at: new Date().toISOString(), ultima_ejecucion_resumen: paraGuardar,
    }).eq("id", c.id);
    resultados.push(r);
  }
  return json({ ok: true, campanas: resultados });
});
