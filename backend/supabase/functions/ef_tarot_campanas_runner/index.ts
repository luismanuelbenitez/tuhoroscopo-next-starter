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

async function enviarTemplate(c: Campana, telefono: string, nombre: string, token: string) {
  const plantilla = String(c.mensaje.template_nombre ?? "");
  const idioma = String(c.mensaje.template_idioma ?? "es");
  if (!plantilla) return { ok: false, error: "mensaje.template_nombre no configurado" };
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TAROT_TOKEN_PROD) return { ok: false, error: "credenciales de WhatsApp no configuradas" };
  const body = {
    messaging_product: "whatsapp",
    to: telefono.replace(/^\+/, ""),
    type: "template",
    template: {
      name: plantilla,
      language: { code: idioma },
      components: [
        { type: "body", parameters: [{ type: "text", text: nombre || "👋" }] },
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

  // 1. Encolar candidatos vencidos
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
      programado_para: k.programado_para,
    }, { onConflict: "campana_id,orden_id", ignoreDuplicates: true }).select("id");
    if (ins && ins.length > 0) {
      resumen.encolados = (resumen.encolados as number) + 1;
      await funnel(k.orden_id, "campaign_eligible", { campana_id: c.id, motivo: k.motivo });
    }
  }

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
    .eq("campana_id", c.id).eq("estado", "enviado").gte("enviado_at", inicioDiaISO(zona));
  const cupo = Math.min(MAX_ENVIOS_POR_CORRIDA, c.limite_diario - (enviadosHoy ?? 0));
  if (cupo <= 0) return { ...resumen, limite_diario_alcanzado: true };

  // 4. Pendientes + errores reintentables (con backoff)
  const corte = new Date(Date.now() - BACKOFF_REINTENTO_MIN * 60000).toISOString();
  const { data: cola } = await supabase.from("tarot_campana_envios")
    .select("id, orden_id, cliente_id, estado, intentos")
    .eq("campana_id", c.id)
    .or(`estado.eq.pendiente,and(estado.eq.error,intentos.lt.${c.max_intentos},ultimo_intento_at.lt.${corte})`)
    .order("programado_para", { ascending: true })
    .limit(cupo);

  const wa = await configWA();
  const diasLink = Number(c.disparador.dias_validez_link ?? 30);
  const urlBase = String(c.mensaje.url_base ?? "https://tuoraculo.uy/opinion/");

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
    const textoPreview = `Hola${nombre ? `, ${nombre}` : ""}. ¿Cómo fue tu experiencia con tu lectura? → ${urlBase}…`;
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
      const r = await enviarTemplate(c, orden.telefono_snapshot, nombre, token);
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

serve(async (req) => {
  if (req.headers.get("x-internal-key") !== TAROT_INTERNAL_KEY || !TAROT_INTERNAL_KEY) {
    return json({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return json({ ok: false, motivo: "metodo_no_permitido" }, 405);
  const body = await req.json().catch(() => ({})) as { campana_id?: string; devolver_tokens_simulados?: boolean };

  let q = supabase.from("tarot_campanas").select("*").eq("estado", "activa");
  if (body.campana_id) q = q.eq("id", body.campana_id);
  const { data: campanas, error } = await q;
  if (error) return json({ ok: false, motivo: "error_query", detalle: error.message }, 500);

  const resultados = [];
  for (const c of (campanas ?? []) as Campana[]) {
    if (c.tipo !== "feedback_experiencia" || c.canal !== "whatsapp") continue; // único tipo implementado
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
