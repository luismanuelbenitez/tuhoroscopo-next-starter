// ============================================================================
// ef_tarot_admin_whatsapp — Bandeja de WhatsApp para el Admin (Tarot)
// ============================================================================
//
// Fuente única de datos para /admin/tarot/whatsapp. Lee/escribe
// tarot_whatsapp_conversaciones / tarot_whatsapp_mensajes (inbound poblado
// por ef_webhook_whatsapp_inbound; outbound poblado acá mismo — ver
// docs/modules/whatsapp-inbox.md).
//
// Acciones (POST body: { accion, ... }):
//   - listar:              filtros + búsqueda + paginación
//   - contador_no_leidos:  total global de no_leidos (badge del nav)
//   - detalle:             conversación + ventana 24h + mensajes + envíos outbound reales
//   - marcar_leido:        no_leidos = 0
//   - marcar_no_leido:     no_leidos = max(no_leidos, 1)
//   - responder:           { conversacion_id, texto } — texto libre, solo si hay ventana 24h activa
//   - reintentar:          { mensaje_id } — reintenta un outbound en estado 'error'
//   - eventos_resumen / eventos_listar / evento_detalle: visibilidad de TODO lo que
//     llega al webhook de Meta (whatsapp_webhook_events), no solo mensajes de clientes
//
// VENTANA 24H (sprint 2026-09-06): WhatsApp Cloud API solo permite texto
// libre dentro de las 24h desde el ÚLTIMO mensaje inbound real del cliente
// (ventana de servicio al cliente). Se calcula siempre server-side —el
// frontend puede mostrarla, pero nunca es la fuente de verdad— y se
// revalida en cada intento de envío/reintento, no solo al abrir la
// conversación.
//
// MODO SANDBOX (reutiliza tarot_configuracion.whatsapp_modo, la MISMA
// governance que ya usa ef_tarot_enviar_whatsapp para el pipeline de
// entrega): si no está en "production", el envío se SIMULA — nunca se
// llama a la Cloud API real, el mensaje queda en estado 'simulado' (nunca
// 'enviado' — esa distinción ya es una regla innegociable en este proyecto,
// ver tarot_envios_whatsapp). Así el sprint cierra sin depender de que Meta
// haya aprobado Production.
//
// SEGURIDAD: x-internal-key. Nunca expone tokens/secrets de Meta. No
// acepta teléfono arbitrario desde el frontend — siempre se resuelve
// server-side desde la conversación. Logs sin texto completo del mensaje.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
// Token de producción de Tarot (2026-09-25): antes usaba WHATSAPP_TOKEN legacy, ya revocado
// (error 190 al responder). Mismo criterio que ef_tarot_enviar_whatsapp; el legacy queda solo como fallback.
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TAROT_TOKEN_PROD") || Deno.env.get("WHATSAPP_TOKEN") || "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const FN = "ef_tarot_admin_whatsapp";
const TEXTO_MAX_LEN = 4096; // límite de WhatsApp Cloud API para mensajes de texto

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function soloDigitos(v: string): string { return (v ?? "").replace(/\D/g, ""); }

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function texto(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().substring(0, max);
  return t ? t : null;
}

async function log(evento: string, nivel: "info" | "warning" | "error", mensaje: string, payload: Record<string, unknown> = {}) {
  try {
    await supabase.from("tarot_logs").insert({ evento, nivel, mensaje, payload, funcion_origen: FN });
  } catch { /* non-blocking */ }
}

// "+598912345678" → "+598 91 *** 678" — enmascarado para la lista cuando no
// hay nombre conocido. Nunca se enmascara en el detalle (ahí el admin ya
// abrió la conversación deliberadamente).
function enmascararTelefono(tel: string): string {
  const soloDigitos = tel.replace(/\D/g, "");
  if (soloDigitos.length < 6) return tel;
  const inicio = tel.slice(0, tel.length - soloDigitos.length + 4); // prefijo + 2 dígitos
  const fin = soloDigitos.slice(-3);
  return `${inicio}***${fin}`;
}

interface ConversacionRow {
  id: string;
  telefono_normalizado: string;
  cliente_id: string | null;
  orden_id: string | null;
  wa_contact_name: string | null;
  estado: string;
  no_leidos: number;
  ultimo_mensaje_at: string | null;
  ultimo_mensaje_preview: string | null;
  ultimo_mensaje_direccion: string | null;
  created_at: string;
  updated_at: string;
}

interface Ventana24h {
  activa: boolean;
  ultimo_inbound_at: string | null;
  expira_at: string | null;
  segundos_restantes: number | null;
}

// Referencia = último mensaje INBOUND real de la conversación (no el
// último mensaje en general — un outbound nuestro no reabre ni extiende
// la ventana, solo un mensaje nuevo del cliente lo hace).
async function calcularVentana24h(conversacionId: string): Promise<Ventana24h> {
  const { data } = await supabase
    .from("tarot_whatsapp_mensajes")
    .select("timestamp_whatsapp")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "inbound")
    .order("timestamp_whatsapp", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ultimoInboundAt = data?.timestamp_whatsapp as string | undefined;
  if (!ultimoInboundAt) {
    return { activa: false, ultimo_inbound_at: null, expira_at: null, segundos_restantes: null };
  }
  const expiraAtMs = new Date(ultimoInboundAt).getTime() + 24 * 3600 * 1000;
  const segundosRestantes = Math.floor((expiraAtMs - Date.now()) / 1000);
  return {
    activa: segundosRestantes > 0,
    ultimo_inbound_at: ultimoInboundAt,
    expira_at: new Date(expiraAtMs).toISOString(),
    segundos_restantes: Math.max(0, segundosRestantes),
  };
}

// true = sandbox (o config ausente — por seguridad, nunca se asume
// production por defecto). Misma fuente de verdad que ef_tarot_enviar_whatsapp.
async function esModoSandbox(): Promise<boolean> {
  const { data } = await supabase
    .from("tarot_configuracion")
    .select("clave, valor")
    .in("clave", ["whatsapp_modo", "mp_modo"]);
  const cfg = Object.fromEntries((data ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  return (cfg.whatsapp_modo ?? cfg.mp_modo) !== "production";
}

interface ResultadoEnvioWA {
  ok: boolean;
  simulado: boolean;
  waMessageId: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  errorDetalle: string | null;
}

async function enviarWhatsappTexto(telefono: string, mensajeTexto: string): Promise<ResultadoEnvioWA> {
  if (await esModoSandbox()) {
    return { ok: true, simulado: true, waMessageId: `sandbox_${crypto.randomUUID()}`, httpStatus: null, errorCode: null, errorDetalle: null };
  }
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, simulado: false, waMessageId: null, httpStatus: null, errorCode: "config_error", errorDetalle: "WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados" };
  }
  const telefonoDest = telefono.replace(/^\+/, "");
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to: telefonoDest, type: "text", text: { body: mensajeTexto } }),
    });
    const data = await res.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { code?: number; message?: string } };
    if (res.ok && data?.messages?.[0]?.id) {
      return { ok: true, simulado: false, waMessageId: data.messages[0].id, httpStatus: res.status, errorCode: null, errorDetalle: null };
    }
    return {
      ok: false, simulado: false, waMessageId: null, httpStatus: res.status,
      errorCode: String(data?.error?.code ?? res.status),
      errorDetalle: (data?.error?.message ?? "Error desconocido de WhatsApp").substring(0, 300),
    };
  } catch (e) {
    return { ok: false, simulado: false, waMessageId: null, httpStatus: null, errorCode: "exception", errorDetalle: String(e).substring(0, 300) };
  }
}

// Único punto de escritura para un intento de outbound — usado por
// "responder" (mensaje nuevo) y "reintentar" (mismo texto, intento nuevo,
// NUNCA reutiliza whatsapp_message_id ni la fila anterior — ver docs).
async function ejecutarEnvioOutbound(conversacionId: string, telefonoDestino: string, mensajeTexto: string) {
  const { data: fila, error: insErr } = await supabase
    .from("tarot_whatsapp_mensajes")
    .insert({ conversacion_id: conversacionId, direccion: "outbound", tipo: "text", texto: mensajeTexto, estado: "preparando" })
    .select("id")
    .single();
  if (insErr || !fila) {
    return { ok: false, motivo: "error_registro_intento", detalle: insErr?.message };
  }

  await log("wa_outbound_preparando", "info", "Preparando envío outbound", { conversacion_id: conversacionId, mensaje_id: fila.id, longitud_texto: mensajeTexto.length });

  const envio = await enviarWhatsappTexto(telefonoDestino, mensajeTexto);
  const estadoFinal = envio.ok ? (envio.simulado ? "simulado" : "enviado") : "error";
  const ahora = new Date().toISOString();

  await supabase.from("tarot_whatsapp_mensajes").update({
    whatsapp_message_id: envio.waMessageId,
    estado: estadoFinal,
    enviado_at: envio.ok ? ahora : null,
    error_code: envio.errorCode,
    error_detalle: envio.errorDetalle,
  }).eq("id", fila.id);

  if (envio.ok) {
    const preview = mensajeTexto.length > 200 ? mensajeTexto.slice(0, 200) : mensajeTexto;
    await supabase.rpc("tarot_wa_registrar_mensaje_outbound", {
      p_conversacion_id: conversacionId,
      p_timestamp: ahora,
      p_preview: preview,
    });
    await log("wa_outbound_enviado", "info",
      envio.simulado ? "Envío simulado (sandbox) — no es un envío real" : "Envío outbound aceptado por Meta",
      { conversacion_id: conversacionId, mensaje_id: fila.id, simulado: envio.simulado, wa_message_id: envio.waMessageId });
  } else {
    await log("wa_outbound_error", "error", "Error al enviar outbound",
      { conversacion_id: conversacionId, mensaje_id: fila.id, http_status: envio.httpStatus, error_code: envio.errorCode });
  }

  return {
    ok: envio.ok,
    motivo: envio.ok ? undefined : "envio_fallido",
    mensaje_id: fila.id,
    estado: estadoFinal,
    wa_message_id: envio.waMessageId,
    simulado: envio.simulado,
    error_code: envio.errorCode,
    error_detalle: envio.errorDetalle,
  };
}

const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 200;

// ── Eventos del webhook de Meta (visibilidad admin, 2026-09-25) ─────────────
// Campos de Meta que afectan la operación (plantillas, calidad, cuenta).
const EVENTOS_IMPORTANTES = new Set([
  "message_template_status_update", "message_template_quality_update", "template_category_update",
  "template_correct_category_detection", "phone_number_quality_update", "phone_number_name_update",
  "account_update", "account_alerts", "account_review_update", "account_settings_update",
  "business_status_update", "business_capability_update", "security",
]);

type Json = Record<string, unknown>;
function valorDe(payload: unknown): Json {
  const p = payload as { entry?: Array<{ changes?: Array<{ value?: Json }> }> } | null;
  return (p?.entry?.[0]?.changes?.[0]?.value ?? {}) as Json;
}
function s(v: unknown): string { return typeof v === "string" ? v : v == null ? "" : String(v); }

function severidadEvento(tipo: string, payload: unknown): { nivel: "critico" | "atencion" | "info"; titulo: string } {
  const v = valorDe(payload);
  switch (tipo) {
    case "message_template_status_update": {
      const ev = s(v.event).toUpperCase();
      const nombre = s(v.message_template_name);
      const malo = ["REJECTED", "PAUSED", "DISABLED", "FLAGGED"].includes(ev);
      return { nivel: malo ? "critico" : "info", titulo: `Plantilla ${nombre || ""} → ${ev || "actualización"}`.trim() };
    }
    case "message_template_quality_update": {
      const nuevo = s(v.new_quality_score).toUpperCase();
      return { nivel: nuevo === "RED" ? "critico" : nuevo === "YELLOW" ? "atencion" : "info", titulo: `Calidad de plantilla ${s(v.message_template_name)}: ${s(v.previous_quality_score)} → ${nuevo}` };
    }
    case "phone_number_quality_update": {
      const ev = s(v.event).toUpperCase();
      return { nivel: ev === "DOWNGRADE" || ev === "FLAGGED" ? "atencion" : "info", titulo: `Calidad/límite del número: ${ev || "actualización"}` };
    }
    case "account_alerts": {
      const sev = s(v.alert_severity).toUpperCase();
      return { nivel: sev === "CRITICAL" ? "critico" : "atencion", titulo: `Alerta de cuenta${sev ? ` (${sev})` : ""}` };
    }
    case "account_update": {
      const ev = s(v.event).toUpperCase();
      const malo = /BAN|RESTRICT|VIOLATION|DISABLE/.test(ev);
      return { nivel: malo ? "critico" : "info", titulo: `Cuenta: ${ev || "actualización"}` };
    }
    case "account_review_update":
      return { nivel: "atencion", titulo: `Revisión de cuenta: ${s(v.decision) || "actualización"}` };
    default:
      return { nivel: "info", titulo: tipo };
  }
}

function resumenLegibleEvento(f: {
  tipo_evento: string | null; es_evento_mensaje: boolean; es_evento_status: boolean; status: string | null;
  message_type: string | null; from_number: string | null; payload: unknown;
}): string {
  const v = valorDe(f.payload);
  if (f.es_evento_status) {
    const st = (Array.isArray(v.statuses) ? v.statuses[0] : null) as Json | null;
    const err = (Array.isArray(st?.errors) ? (st!.errors as Json[])[0] : null) as Json | null;
    return `Mensaje ${s(f.status) || s(st?.status)} → ${s(st?.recipient_id)}${err ? ` · error ${s(err.code)}: ${s(err.title)}` : ""}`;
  }
  if (f.es_evento_mensaje) {
    const m = (Array.isArray(v.messages) ? v.messages[0] : null) as Json | null;
    const txt = s((m?.text as Json | undefined)?.body).replace(/\s+/g, " ").slice(0, 90);
    return `${s(f.message_type) || s(m?.type) || "mensaje"} de ${s(f.from_number)}${txt ? ` · "${txt}"` : ""}`;
  }
  switch (f.tipo_evento) {
    case "message_template_status_update": return [s(v.message_template_name), s(v.event), s(v.reason)].filter(Boolean).join(" · ");
    case "message_template_quality_update": return `${s(v.message_template_name)} · ${s(v.previous_quality_score)} → ${s(v.new_quality_score)}`;
    case "phone_number_quality_update": return [s(v.display_phone_number), s(v.event), s(v.current_limit)].filter(Boolean).join(" · ");
    case "account_alerts": return [s(v.alert_type), s(v.alert_description)].filter(Boolean).join(" · ");
    case "account_update": return [s(v.event), s(v.phone_number)].filter(Boolean).join(" · ");
    case "account_review_update": return s(v.decision);
  }
  const simples = Object.entries(v).filter(([, x]) => typeof x === "string" || typeof x === "number").slice(0, 4).map(([k, x]) => `${k}: ${x}`);
  return simples.join(" · ") || "(sin detalle — abrí el evento para ver el JSON)";
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, motivo: "json_invalido" }, 400); }

  const accion = texto(body.accion, 50);

  // ── contador_no_leidos ──────────────────────────────────────────────────
  if (accion === "contador_no_leidos") {
    const { count, error } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id", { count: "exact", head: true })
      .gt("no_leidos", 0);
    if (error) return jsonResponse({ ok: false, motivo: "error_query", detalle: error.message }, 500);
    return jsonResponse({ ok: true, conversaciones_no_leidas: count ?? 0 });
  }

  // ── listar ───────────────────────────────────────────────────────────────
  // (2026-09-25) Lista UNIFICADA de contactos: conversaciones (el cliente
  // escribió) + clientes a los que SOLO les enviamos la tirada
  // (tarot_envios_whatsapp). Se resuelve en lectura — no se escribe nada en
  // tarot_whatsapp_mensajes ni se toca el pipeline de entrega.
  if (accion === "listar") {
    const filtro = texto(body.filtro, 20) ?? "todos"; // todos | no_leidos | con_orden | sin_orden | solo_envios | con_problemas
    const busqueda = texto(body.busqueda, 100)?.toLowerCase() ?? null;
    const incluirSimulados = body.incluir_simulados === true;
    const limitRaw = Number(body.limit ?? LIMIT_DEFAULT);
    const limit = Number.isFinite(limitRaw) ? Math.min(LIMIT_MAX, Math.max(1, limitRaw)) : LIMIT_DEFAULT;
    const offsetRaw = Number(body.offset ?? 0);
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    const [convsRes, enviosRes] = await Promise.all([
      supabase.from("tarot_whatsapp_conversaciones")
        .select("id, telefono_normalizado, cliente_id, orden_id, wa_contact_name, estado, no_leidos, ultimo_mensaje_at, ultimo_mensaje_preview, ultimo_mensaje_direccion")
        .limit(2000),
      supabase.from("tarot_envios_whatsapp")
        .select("id, orden_id, telefono_destino, estado, wa_status, wa_error_code, enviado_at, entregado_at, leido_at, created_at")
        .order("created_at", { ascending: false })
        .limit(3000),
    ]);
    if (convsRes.error) return jsonResponse({ ok: false, motivo: "error_query", detalle: convsRes.error.message }, 500);
    if (enviosRes.error) return jsonResponse({ ok: false, motivo: "error_query", detalle: enviosRes.error.message }, 500);

    type EnvioRow = { id: string; orden_id: string; telefono_destino: string; estado: string; wa_status: string | null; wa_error_code: string | null; enviado_at: string | null; entregado_at: string | null; leido_at: string | null; created_at: string };
    type Contacto = { key: string; conv: ConversacionRow | null; ultimoEnvio: EnvioRow | null; nEnvios: number };
    const contactos = new Map<string, Contacto>();
    for (const c of (convsRes.data ?? []) as ConversacionRow[]) {
      contactos.set(soloDigitos(c.telefono_normalizado), { key: soloDigitos(c.telefono_normalizado), conv: c, ultimoEnvio: null, nEnvios: 0 });
    }
    for (const e of ((enviosRes.data ?? []) as EnvioRow[])) {
      if (!incluirSimulados && e.estado === "simulado") continue;
      const key = soloDigitos(e.telefono_destino);
      if (!key) continue;
      const c = contactos.get(key) ?? { key, conv: null, ultimoEnvio: null, nEnvios: 0 };
      c.nEnvios++;
      if (!c.ultimoEnvio) c.ultimoEnvio = e; // ya vienen ordenados desc → el primero es el último
      contactos.set(key, c);
    }

    // Enriquecimiento batch (órdenes y clientes).
    const lista = [...contactos.values()];
    const ordenIds = [...new Set(lista.flatMap((c) => [c.conv?.orden_id, c.ultimoEnvio?.orden_id]).filter(Boolean))] as string[];
    const ordenesRes = ordenIds.length
      ? await supabase.from("tarot_ordenes").select("id, external_reference, estado, cliente_id, nombre_snapshot").in("id", ordenIds)
      : { data: [] };
    const ordenPorId = new Map((ordenesRes.data ?? []).map((o: { id: string; external_reference: string | null; estado: string; cliente_id: string | null; nombre_snapshot: string | null }) => [o.id, o]));
    const clienteIds = [...new Set([
      ...lista.map((c) => c.conv?.cliente_id),
      ...[...ordenPorId.values()].map((o) => o.cliente_id),
    ].filter(Boolean))] as string[];
    const clientesRes = clienteIds.length
      ? await supabase.from("tarot_clientes").select("id, nombre_completo").in("id", clienteIds)
      : { data: [] };
    const nombrePorCliente = new Map((clientesRes.data ?? []).map((c: { id: string; nombre_completo: string }) => [c.id, c.nombre_completo]));

    const hace15min = Date.now() - 15 * 60000;
    let filas = lista.map((c) => {
      const ordenId = c.ultimoEnvio?.orden_id ?? c.conv?.orden_id ?? null;
      const orden = ordenId ? ordenPorId.get(ordenId) ?? null : null;
      const nombre = (c.conv?.cliente_id ? nombrePorCliente.get(c.conv.cliente_id) : null)
        ?? (orden?.cliente_id ? nombrePorCliente.get(orden.cliente_id) : null)
        ?? c.conv?.wa_contact_name ?? orden?.nombre_snapshot ?? null;
      const tel = c.conv?.telefono_normalizado ?? `+${c.key}`;
      const envioTs = c.ultimoEnvio ? new Date(c.ultimoEnvio.enviado_at ?? c.ultimoEnvio.created_at).getTime() : 0;
      const convTs = c.conv?.ultimo_mensaje_at ? new Date(c.conv.ultimo_mensaje_at).getTime() : 0;
      const ganaEnvio = envioTs > convTs;
      const e = c.ultimoEnvio;
      const problema = !!e && (e.estado === "error" || (e.estado === "enviando" && new Date(e.created_at).getTime() < hace15min));
      return {
        id: c.conv?.id ?? `tel:${c.key}`,
        tiene_conversacion: !!c.conv,
        telefono: nombre ? tel : enmascararTelefono(tel),
        nombre,
        cliente_id: c.conv?.cliente_id ?? orden?.cliente_id ?? null,
        orden_id: ordenId,
        orden_ref: orden?.external_reference ?? null,
        orden_estado: orden?.estado ?? null,
        ultimo_mensaje_at: new Date(Math.max(envioTs, convTs) || Date.now()).toISOString(),
        ultimo_mensaje_preview: ganaEnvio ? "Tu tirada enviada" : (c.conv?.ultimo_mensaje_preview ?? null),
        ultimo_mensaje_direccion: ganaEnvio ? "outbound" : (c.conv?.ultimo_mensaje_direccion ?? null),
        no_leidos: c.conv?.no_leidos ?? 0,
        n_envios: c.nEnvios,
        con_problema: problema,
        ultimo_envio: e ? {
          estado: e.estado, wa_status: e.wa_status, enviado_at: e.enviado_at, entregado_at: e.entregado_at,
          leido_at: e.leido_at, error_code: e.wa_error_code, simulado: e.estado === "simulado",
        } : null,
      };
    });

    if (filtro === "no_leidos") filas = filas.filter((f) => f.no_leidos > 0);
    else if (filtro === "con_orden") filas = filas.filter((f) => !!f.orden_id);
    else if (filtro === "sin_orden") filas = filas.filter((f) => !f.orden_id);
    else if (filtro === "solo_envios") filas = filas.filter((f) => f.n_envios > 0);
    else if (filtro === "con_problemas") filas = filas.filter((f) => f.con_problema);
    if (busqueda) {
      filas = filas.filter((f) =>
        (f.nombre ?? "").toLowerCase().includes(busqueda) ||
        soloDigitos(f.telefono).includes(soloDigitos(busqueda) || "\u0000") ||
        (f.orden_ref ?? "").toLowerCase().includes(busqueda));
    }
    filas.sort((a, b) => new Date(b.ultimo_mensaje_at).getTime() - new Date(a.ultimo_mensaje_at).getTime());

    const total = filas.length;
    const conversaciones = filas.slice(offset, offset + limit);
    const noLeidosTotal = (convsRes.data ?? []).filter((c: { no_leidos: number }) => c.no_leidos > 0).length;

    return jsonResponse({
      ok: true,
      conversaciones,
      paginacion: { total, limit, offset, next_offset: total > offset + limit ? offset + limit : null },
      no_leidos_total: noLeidosTotal,
    });
  }

  // ── detalle ──────────────────────────────────────────────────────────────
  // conversacion_id puede ser un uuid o "tel:<digitos>" (contacto al que solo
  // se le enviaron mensajes y todavía no escribió).
  if (accion === "detalle") {
    const idEntrada = texto(body.conversacion_id, 100);
    if (!idEntrada) return jsonResponse({ ok: false, motivo: "conversacion_id_requerido" }, 400);

    const COLS = "id, telefono_normalizado, cliente_id, orden_id, wa_contact_name, estado, no_leidos, ultimo_mensaje_at, created_at";
    let conv: { id: string; telefono_normalizado: string; cliente_id: string | null; orden_id: string | null; wa_contact_name: string | null; estado: string; no_leidos: number; ultimo_mensaje_at: string | null; created_at: string } | null = null;
    let telDigitos = "";
    if (idEntrada.startsWith("tel:")) {
      telDigitos = soloDigitos(idEntrada.slice(4));
      if (!telDigitos) return jsonResponse({ ok: false, motivo: "telefono_invalido" }, 400);
      const { data } = await supabase.from("tarot_whatsapp_conversaciones").select(COLS)
        .in("telefono_normalizado", [`+${telDigitos}`, telDigitos]).maybeSingle();
      conv = data ?? null;
    } else {
      const { data, error: convErr } = await supabase.from("tarot_whatsapp_conversaciones").select(COLS).eq("id", idEntrada).maybeSingle();
      if (convErr) return jsonResponse({ ok: false, motivo: "error_query", detalle: convErr.message }, 500);
      if (!data) return jsonResponse({ ok: false, motivo: "conversacion_no_encontrada" }, 404);
      conv = data;
      telDigitos = soloDigitos(data.telefono_normalizado);
    }

    // Todos los envíos de la tirada a ESTE teléfono (todas sus órdenes).
    const { data: envios } = await supabase.from("tarot_envios_whatsapp")
      .select("id, orden_id, estado, wa_status, numero_intento, es_reenvio, wa_message_id, wa_error_code, wa_error_mensaje, enviado_at, entregado_at, leido_at, created_at")
      .in("telefono_destino", [telDigitos, `+${telDigitos}`])
      .order("created_at", { ascending: true });
    const listaEnvios = envios ?? [];

    const ordenIds = [...new Set([conv?.orden_id, ...listaEnvios.map((e) => e.orden_id)].filter(Boolean))] as string[];
    const ordenesRes = ordenIds.length
      ? await supabase.from("tarot_ordenes").select("id, external_reference, estado, tema, created_at, cliente_id, nombre_snapshot").in("id", ordenIds)
      : { data: [] };
    const ordenPorId = new Map((ordenesRes.data ?? []).map((o: { id: string; external_reference: string | null; estado: string; tema: string; created_at: string; cliente_id: string | null; nombre_snapshot: string | null }) => [o.id, o]));
    const ordenPrincipal = (conv?.orden_id ? ordenPorId.get(conv.orden_id) : null) ?? (listaEnvios.length ? ordenPorId.get(listaEnvios[listaEnvios.length - 1].orden_id) : null) ?? null;
    const clienteIdRes = conv?.cliente_id ?? ordenPrincipal?.cliente_id ?? null;

    const [mensajesRes, clienteRes, ventana, sandbox] = await Promise.all([
      conv
        ? supabase.from("tarot_whatsapp_mensajes")
            .select("id, whatsapp_message_id, direccion, tipo, texto, media_id, mime_type, filename, payload_meta, timestamp_whatsapp, estado, enviado_at, error_code, error_detalle, created_at")
            .eq("conversacion_id", conv.id).order("timestamp_whatsapp", { ascending: true })
        : Promise.resolve({ data: [] }),
      clienteIdRes
        ? supabase.from("tarot_clientes").select("id, nombre_completo, telefono, email").eq("id", clienteIdRes).maybeSingle()
        : Promise.resolve({ data: null }),
      conv ? calcularVentana24h(conv.id) : Promise.resolve({ activa: false, ultimo_inbound_at: null, expira_at: null, segundos_restantes: null } as Ventana24h),
      esModoSandbox(),
    ]);
    const mensajes = (mensajesRes.data ?? []) as Array<{ tipo: string; payload_meta: Record<string, unknown> | null; timestamp_whatsapp: string | null; created_at: string }>;

    // Reacciones del cliente, agrupadas por el mensaje (wamid) al que reaccionó.
    const reaccionesPorWamid = new Map<string, Array<{ emoji: string | null; at: string }>>();
    for (const m of mensajes) {
      if (m.tipo !== "reaction") continue;
      const wamid = typeof m.payload_meta?.message_id === "string" ? m.payload_meta.message_id : null;
      if (!wamid) continue;
      const arr = reaccionesPorWamid.get(wamid) ?? [];
      arr.push({ emoji: typeof m.payload_meta?.emoji === "string" ? m.payload_meta.emoji : null, at: m.timestamp_whatsapp ?? m.created_at });
      reaccionesPorWamid.set(wamid, arr);
    }

    const enviosWhatsapp = listaEnvios.map((e) => {
      const o = ordenPorId.get(e.orden_id) ?? null;
      return {
        ...e,
        orden_ref: o?.external_reference ?? null,
        reacciones: e.wa_message_id ? (reaccionesPorWamid.get(e.wa_message_id) ?? []) : [],
      };
    });

    return jsonResponse({
      ok: true,
      conversacion: conv ? {
        id: conv.id, telefono: conv.telefono_normalizado, cliente_id: conv.cliente_id, orden_id: conv.orden_id,
        wa_contact_name: conv.wa_contact_name, no_leidos: conv.no_leidos,
      } : null,
      contacto: { telefono: conv?.telefono_normalizado ?? `+${telDigitos}`, nombre: clienteRes.data?.nombre_completo ?? conv?.wa_contact_name ?? ordenPrincipal?.nombre_snapshot ?? null },
      ventana_24h: ventana,
      modo_sandbox: sandbox,
      cliente: clienteRes.data ?? null,
      orden: ordenPrincipal,
      mensajes: mensajesRes.data ?? [],
      envios_whatsapp: enviosWhatsapp,
      envios_whatsapp_orden: enviosWhatsapp, // compat con la versión anterior del componente
    });
  }

  // ── marcar_leido / marcar_no_leido ──────────────────────────────────────
  if (accion === "marcar_leido" || accion === "marcar_no_leido") {
    const conversacionId = texto(body.conversacion_id, 100);
    if (!conversacionId) return jsonResponse({ ok: false, motivo: "conversacion_id_requerido" }, 400);

    const nuevoValor = accion === "marcar_leido" ? 0 : 1;
    const { error } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .update({ no_leidos: nuevoValor, updated_at: new Date().toISOString() })
      .eq("id", conversacionId);
    if (error) return jsonResponse({ ok: false, motivo: "error_update", detalle: error.message }, 500);

    return jsonResponse({ ok: true, no_leidos: nuevoValor });
  }

  // ── responder ────────────────────────────────────────────────────────────
  if (accion === "responder") {
    const conversacionId = texto(body.conversacion_id, 100);
    if (!conversacionId) return jsonResponse({ ok: false, motivo: "conversacion_id_requerido" }, 400);

    const mensajeTexto = typeof body.texto === "string" ? body.texto.trim() : "";
    if (!mensajeTexto) return jsonResponse({ ok: false, motivo: "texto_requerido" }, 400);
    if (mensajeTexto.length > TEXTO_MAX_LEN) {
      return jsonResponse({ ok: false, motivo: "texto_demasiado_largo", limite: TEXTO_MAX_LEN }, 400);
    }

    // El teléfono SIEMPRE se resuelve server-side desde la conversación —
    // nunca se acepta uno arbitrario del frontend.
    const { data: conv, error: convErr } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id, telefono_normalizado")
      .eq("id", conversacionId)
      .maybeSingle();
    if (convErr) return jsonResponse({ ok: false, motivo: "error_query", detalle: convErr.message }, 500);
    if (!conv) return jsonResponse({ ok: false, motivo: "conversacion_no_encontrada" }, 404);

    // Revalidación server-side de la ventana 24h — el frontend puede
    // deshabilitar el composer, pero esto es lo que realmente decide.
    const ventana = await calcularVentana24h(conversacionId);
    if (!ventana.activa) {
      return jsonResponse({ ok: false, motivo: "ventana_24h_vencida", ventana_24h: ventana }, 409);
    }

    const resultado = await ejecutarEnvioOutbound(conversacionId, conv.telefono_normalizado, mensajeTexto);
    return jsonResponse(resultado, resultado.ok ? 200 : 502);
  }

  // ── reintentar ───────────────────────────────────────────────────────────
  if (accion === "reintentar") {
    const mensajeId = texto(body.mensaje_id, 100);
    if (!mensajeId) return jsonResponse({ ok: false, motivo: "mensaje_id_requerido" }, 400);

    const { data: original, error: origErr } = await supabase
      .from("tarot_whatsapp_mensajes")
      .select("id, conversacion_id, texto, estado, direccion")
      .eq("id", mensajeId)
      .maybeSingle();
    if (origErr) return jsonResponse({ ok: false, motivo: "error_query", detalle: origErr.message }, 500);
    if (!original) return jsonResponse({ ok: false, motivo: "mensaje_no_encontrado" }, 404);
    if (original.direccion !== "outbound") return jsonResponse({ ok: false, motivo: "solo_se_reintenta_outbound" }, 400);
    if (original.estado !== "error") return jsonResponse({ ok: false, motivo: "solo_se_reintenta_estado_error" }, 400);
    if (!original.texto) return jsonResponse({ ok: false, motivo: "mensaje_sin_texto" }, 400);

    const { data: conv, error: convErr } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id, telefono_normalizado")
      .eq("id", original.conversacion_id)
      .maybeSingle();
    if (convErr) return jsonResponse({ ok: false, motivo: "error_query", detalle: convErr.message }, 500);
    if (!conv) return jsonResponse({ ok: false, motivo: "conversacion_no_encontrada" }, 404);

    const ventana = await calcularVentana24h(original.conversacion_id);
    if (!ventana.activa) {
      return jsonResponse({ ok: false, motivo: "ventana_24h_vencida", ventana_24h: ventana }, 409);
    }

    // Intento NUEVO (nueva fila, nunca reutiliza whatsapp_message_id ni
    // pisa la fila original con error) — la fila original queda como
    // evidencia auditable del intento fallido.
    const resultado = await ejecutarEnvioOutbound(original.conversacion_id, conv.telefono_normalizado, original.texto);
    await log("wa_outbound_reintentado", "info", "Reintento de envío outbound",
      { conversacion_id: original.conversacion_id, mensaje_original_id: mensajeId, mensaje_nuevo_id: resultado.mensaje_id });

    return jsonResponse(resultado, resultado.ok ? 200 : 502);
  }

  // ── eventos_resumen / eventos_listar / evento_detalle (2026-09-25) ──────
  // Visibilidad de TODO lo que Meta manda al webhook (whatsapp_webhook_events),
  // no solo los mensajes de clientes: estados de entrega, plantillas
  // pausadas/rechazadas, calidad del número, alertas de cuenta, etc.
  if (accion === "eventos_resumen") {
    const desde7d = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await supabase
      .from("whatsapp_webhook_events")
      .select("id, created_at, tipo_evento, es_evento_mensaje, es_evento_status, payload")
      .gte("created_at", desde7d)
      .order("created_at", { ascending: false })
      .limit(3000);
    if (error) return jsonResponse({ ok: false, motivo: "error_query", detalle: error.message }, 500);
    const filas = data ?? [];
    const hace24h = Date.now() - 86400000;
    const porTipo: Record<string, { ult24h: number; ult7d: number }> = {};
    let importantes7d = 0, atencion7d = 0;
    for (const f of filas) {
      const t = f.tipo_evento ?? "desconocido";
      porTipo[t] ??= { ult24h: 0, ult7d: 0 };
      porTipo[t].ult7d++;
      if (new Date(f.created_at).getTime() >= hace24h) porTipo[t].ult24h++;
      if (EVENTOS_IMPORTANTES.has(t)) {
        importantes7d++;
        if (severidadEvento(t, f.payload).nivel !== "info") atencion7d++;
      }
    }
    const { data: ultimo } = await supabase.from("whatsapp_webhook_events")
      .select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: ultMsg } = await supabase.from("whatsapp_webhook_events")
      .select("created_at").eq("es_evento_mensaje", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: ultSt } = await supabase.from("whatsapp_webhook_events")
      .select("created_at").eq("es_evento_status", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return jsonResponse({
      ok: true,
      ultimo_evento_at: ultimo?.created_at ?? null,
      ultimo_mensaje_entrante_at: ultMsg?.created_at ?? null,
      ultimo_estado_entrega_at: ultSt?.created_at ?? null,
      eventos_7d: filas.length,
      importantes_7d: importantes7d,
      requieren_atencion_7d: atencion7d,
      por_tipo: porTipo,
    });
  }

  if (accion === "eventos_listar") {
    const categoria = texto(body.categoria, 20) ?? "todos"; // todos | importantes | mensajes | estados | otros
    const limitRaw = Number(body.limit ?? LIMIT_DEFAULT);
    const limit = Number.isFinite(limitRaw) ? Math.min(LIMIT_MAX, Math.max(1, limitRaw)) : LIMIT_DEFAULT;
    const offsetRaw = Number(body.offset ?? 0);
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
    const lista = `(${[...EVENTOS_IMPORTANTES].join(",")})`;

    let q = supabase.from("whatsapp_webhook_events")
      .select("id, created_at, tipo_evento, es_evento_mensaje, es_evento_status, status, message_type, from_number, phone_number_id, display_phone_number, processing_status, processing_error, inbound_http_status, payload", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (categoria === "importantes") q = q.in("tipo_evento", [...EVENTOS_IMPORTANTES]);
    else if (categoria === "mensajes") q = q.eq("es_evento_mensaje", true);
    else if (categoria === "estados") q = q.eq("es_evento_status", true);
    else if (categoria === "otros") q = q.eq("es_evento_mensaje", false).eq("es_evento_status", false).not("tipo_evento", "in", lista);

    const { data, error, count } = await q;
    if (error) return jsonResponse({ ok: false, motivo: "error_query", detalle: error.message }, 500);
    const total = count ?? 0;
    const eventos = (data ?? []).map((f) => {
      const t = f.tipo_evento ?? "desconocido";
      const sev = severidadEvento(t, f.payload);
      return {
        id: f.id, created_at: f.created_at, tipo_evento: t,
        categoria: f.es_evento_mensaje ? "mensaje" : f.es_evento_status ? "estado" : EVENTOS_IMPORTANTES.has(t) ? "importante" : "otro",
        severidad: sev.nivel, titulo: sev.titulo,
        resumen: resumenLegibleEvento(f),
        phone_number_id: f.phone_number_id, display_phone_number: f.display_phone_number,
        processing_status: f.processing_status, processing_error: f.processing_error,
        inbound_http_status: f.inbound_http_status,
      };
    });
    return jsonResponse({ ok: true, eventos, paginacion: { total, limit, offset, next_offset: offset + limit < total ? offset + limit : null } });
  }

  if (accion === "evento_detalle") {
    const id = texto(body.id, 60);
    if (!id) return jsonResponse({ ok: false, motivo: "id_requerido" }, 400);
    const { data, error } = await supabase.from("whatsapp_webhook_events")
      .select("id, created_at, tipo_evento, payload, processing_status, processing_error, inbound_called, inbound_http_status, inbound_response")
      .eq("id", id).maybeSingle();
    if (error) return jsonResponse({ ok: false, motivo: "error_query", detalle: error.message }, 500);
    if (!data) return jsonResponse({ ok: false, motivo: "no_encontrado" }, 404);
    return jsonResponse({ ok: true, evento: data }); // sin headers (pueden traer la firma de Meta)
  }

  return jsonResponse({ ok: false, motivo: "accion_invalida" }, 400);
});
