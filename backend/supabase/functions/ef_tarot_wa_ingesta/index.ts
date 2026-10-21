// ============================================================================
// ef_tarot_wa_ingesta — Bandeja de WhatsApp de Tu Oráculo (P0, 2026-10-21)
// ============================================================================
//
// Llamada por ef_webhook_whatsapp_events (CAPA 1) UNA VEZ POR MENSAJE de
// value.messages[], con el mismo contrato que CAPA 2:
//   { payload: <webhook de Meta>, id_evento, message_index }
//   header x-internal-key = TAROT_WA_INGESTA_KEY
//
// AUTENTICACIÓN (2026-10-21): se publica con --no-verify-jwt, así que la
// URL es alcanzable desde Internet. Lo único que la protege es una clave
// DEDICADA (TAROT_WA_INGESTA_KEY, 32 bytes aleatorios, solo en los secrets
// de Supabase — nunca en el repo ni en logs), comparada en tiempo constante.
// Sin clave configurada o con una clave corta, la función rechaza todo
// (falla cerrada). Quien no tenga la clave recibe 401 sin tocar la base.
//
// Responsabilidades (y nada más):
//   1) Persistir el mensaje en tarot_whatsapp_conversaciones/_mensajes para
//      CUALQUIER número. Cliente y orden son enriquecimiento opcional, nunca
//      requisito (un desconocido también es una conversación).
//   2) Deduplicar por whatsapp_message_id (UNIQUE): un reintento de Meta no
//      duplica el mensaje, no suma no leídos y no vuelve a responder.
//   3) Regla de respuesta automática (ver aplicarAutoRespuesta).
//
// La lógica heredada de Horóscopo (BAJA, menú, confirmación de número) sigue
// en ef_webhook_whatsapp_inbound (CAPA 2), que ya no toca nada de Tarot.
//
// Reacciones: se guardan como fila tipo 'reaction' con payload_meta
// { emoji, message_id } (emoji null = quitó la reacción — Meta omite el campo).
// No suman no leídos, no cambian el resumen de la conversación y nunca
// disparan respuestas.
//
// Media: solo metadata (media_id, mime, filename). La descarga es a demanda
// desde el Admin vía ef_tarot_whatsapp_media (con allowlist de tipos).
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const FN = "ef_tarot_wa_ingesta";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INGESTA_KEY = Deno.env.get("TAROT_WA_INGESTA_KEY") ?? "";
const INGESTA_KEY_MIN = 32;
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TAROT_TOKEN_PROD") || Deno.env.get("WHATSAPP_TOKEN") || "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
// Base de la Graph API. Misma versión que el resto del sistema hoy (v18.0;
// su actualización es un pendiente de P1). Configurable solo para QA local.
const GRAPH_BASE = Deno.env.get("WHATSAPP_GRAPH_BASE") || "https://graph.facebook.com/v18.0";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function log(evento: string, nivel: "info" | "warning" | "error", mensaje: string, payload: Record<string, unknown> = {}, clienteId: string | null = null) {
  try {
    await supabase.from("tarot_logs").insert({ cliente_id: clienteId, evento, nivel, mensaje, payload, funcion_origen: FN });
  } catch { /* no bloquea */ }
}

// Comparación en tiempo constante (sobre SHA-256 de ambos valores, así el
// largo tampoco filtra información).
async function claveValida(recibida: string | null): Promise<boolean> {
  if (INGESTA_KEY.length < INGESTA_KEY_MIN || !recibida) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(recibida)),
    crypto.subtle.digest("SHA-256", enc.encode(INGESTA_KEY)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// "598..." (wa_id de Meta) → "+598..." — misma regla que CAPA 2 y que
// tarot_clientes.telefono.
function normalizarNumero(waId: unknown): string | null {
  if (typeof waId !== "string") return null;
  const limpio = waId.trim();
  if (!/^\+?\d{6,20}$/.test(limpio)) return null;
  return limpio.startsWith("+") ? limpio : `+${limpio}`;
}

function epochAISO(ts: unknown): string | null {
  if (ts == null) return null;
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  const d = new Date(n < 1e12 ? n * 1000 : n);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const str = (v: unknown, max = 4000): string | null => (typeof v === "string" && v.length ? v.slice(0, max) : null);

type Parsed = {
  wamid: string;
  from: string | null;
  tipo: string;
  texto: string | null;
  mediaId: string | null;
  mimeType: string | null;
  filename: string | null;
  payloadMeta: Record<string, unknown> | null;
  contextoWamid: string | null;
  timestampISO: string | null;
  profileName: string | null;
};

// Tipos del schema oficial de Cloud API. Todo lo desconocido se guarda igual
// como 'unknown' (nunca se pierde un mensaje por no reconocer su tipo).
function parsear(payload: any, indice: number): Parsed | null {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const msg = Array.isArray(value?.messages) ? value.messages[indice] : null;
  if (!msg || typeof msg.id !== "string") return null;
  const type = typeof msg.type === "string" ? msg.type : "unknown";
  const base: Parsed = {
    wamid: msg.id,
    from: msg.from ?? value?.contacts?.[0]?.wa_id ?? null,
    tipo: "unknown",
    texto: null,
    mediaId: null,
    mimeType: null,
    filename: null,
    payloadMeta: null,
    contextoWamid: str(msg.context?.id, 200),
    timestampISO: epochAISO(msg.timestamp),
    profileName: str(value?.contacts?.[0]?.profile?.name, 120),
  };
  switch (type) {
    case "text":
      return { ...base, tipo: "text", texto: str(msg.text?.body) };
    case "reaction":
      // Meta OMITE `emoji` cuando el usuario quita la reacción.
      return { ...base, tipo: "reaction", payloadMeta: { emoji: str(msg.reaction?.emoji, 32), message_id: str(msg.reaction?.message_id, 200) } };
    case "image": case "document": case "audio": case "video": case "sticker": {
      const m = msg[type] ?? {};
      return { ...base, tipo: type, texto: str(m.caption), mediaId: str(m.id, 200), mimeType: str(m.mime_type, 120), filename: str(m.filename, 200) };
    }
    case "location":
      return { ...base, tipo: "location", payloadMeta: {
        latitude: typeof msg.location?.latitude === "number" ? msg.location.latitude : null,
        longitude: typeof msg.location?.longitude === "number" ? msg.location.longitude : null,
        name: str(msg.location?.name, 200), address: str(msg.location?.address, 300),
      } };
    case "contacts": {
      const c = Array.isArray(msg.contacts) ? msg.contacts[0] : null;
      return { ...base, tipo: "contact", payloadMeta: { nombre: str(c?.name?.formatted_name, 200), telefono: str(c?.phones?.[0]?.phone, 40) } };
    }
    case "interactive": {
      const r = msg.interactive?.button_reply ?? msg.interactive?.list_reply ?? null;
      return { ...base, tipo: "interactive", texto: str(r?.title, 500), payloadMeta: { interactive_type: str(msg.interactive?.type, 40), reply_id: str(r?.id, 200) } };
    }
    case "button":
      return { ...base, tipo: "button", texto: str(msg.button?.text, 500), payloadMeta: { payload: str(msg.button?.payload, 500) } };
    default:
      return { ...base, tipo: "unknown", payloadMeta: { rawType: type } };
  }
}

const PREVIEW: Record<string, string> = {
  image: "📷 Imagen", document: "📄 Documento", audio: "🎵 Audio", video: "🎬 Video", sticker: "😀 Sticker",
  location: "📍 Ubicación", contact: "👤 Contacto", interactive: "Respuesta a botón/lista", button: "Respuesta a botón",
  unknown: "Mensaje no reconocido",
};

// Orden a asociar a un cliente conocido — misma regla que tenía CAPA 2:
// nunca inventa; 2+ órdenes dentro de 24 h = ambigua → no se asocia.
async function resolverOrden(clienteId: string): Promise<string | null> {
  const { data } = await supabase.from("tarot_ordenes").select("id, created_at")
    .eq("cliente_id", clienteId).order("created_at", { ascending: false }).limit(2);
  if (!data || data.length === 0) return null;
  if (data.length === 1) return data[0].id;
  const horas = Math.abs(new Date(data[0].created_at).getTime() - new Date(data[1].created_at).getTime()) / 3600000;
  return horas < 24 ? null : data[0].id;
}

async function esModoSandbox(): Promise<boolean> {
  const { data } = await supabase.from("tarot_configuracion").select("clave, valor").in("clave", ["whatsapp_modo", "mp_modo"]);
  const cfg = Object.fromEntries((data ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  return (cfg.whatsapp_modo ?? cfg.mp_modo) !== "production";
}

// ── Respuesta automática ────────────────────────────────────────────────────
// Reglas (decisión de Manuel, 2026-10-21):
//   - nunca a reacciones (ni a quitar una reacción) ni a tipos no reconocidos;
//   - solo si el mensaje es genuinamente nuevo (no reintentos de Meta);
//   - máximo 1 por conversación cada 24 h, y nunca si el admin respondió a
//     mano en las últimas 24 h — reclamo atómico en SQL (sin carreras);
//   - no a números suscriptores de Horóscopo (CAPA 2 les responde lo suyo);
//   - nunca a mensajes con más de 1 h (reproceso de eventos viejos o entrega
//     tardía de Meta: responder "recibimos tu mensaje" horas después es absurdo);
//   - respeta whatsapp_modo: fuera de production se SIMULA (nunca llega a Meta);
//   - queda en el hilo como outbound con origen 'automatico';
//   - comunica que respondemos por este mismo WhatsApp (no deriva al email).
const TIPOS_SIN_RESPUESTA = new Set(["reaction", "unknown"]);

// Texto aprobado por Manuel (2026-10-21).
function textoAutoRespuesta(nombre: string | null) {
  return `Hola${nombre ? ` ${nombre}` : ""} ✨ Gracias por escribirnos a Tu Oráculo. ` +
    `Recibimos tu mensaje y te respondemos por acá en cuanto podamos.`;
}

const ANTIGUEDAD_MAX_MS = 60 * 60 * 1000;

async function aplicarAutoRespuesta(p: { conversacionId: string; telefono: string; tipo: string; timestampISO: string | null; primerNombre: string | null; clienteId: string | null }) {
  if (TIPOS_SIN_RESPUESTA.has(p.tipo)) return { auto: "no_aplica_tipo" };
  if (!p.timestampISO || Date.now() - new Date(p.timestampISO).getTime() > ANTIGUEDAD_MAX_MS) return { auto: "no_aplica_mensaje_viejo" };

  const { count: esSuscriptor } = await supabase.from("suscriptores")
    .select("id", { count: "exact", head: true }).eq("whatsapp", p.telefono);
  if ((esSuscriptor ?? 0) > 0) return { auto: "no_aplica_suscriptor_horoscopo" };

  const { data: gano, error: errReclamo } = await supabase.rpc("tarot_wa_reclamar_auto_respuesta", { p_conversacion_id: p.conversacionId });
  if (errReclamo) {
    await log("wa_auto_respuesta_error", "error", "No se pudo reclamar la respuesta automática", { conversacion_id: p.conversacionId, error: errReclamo.message }, p.clienteId);
    return { auto: "error_reclamo" };
  }
  if (!gano) return { auto: "omitida_tope_24h_o_admin_activo" };

  const cuerpo = textoAutoRespuesta(p.primerNombre);
  const { data: fila, error: insErr } = await supabase.from("tarot_whatsapp_mensajes").insert({
    conversacion_id: p.conversacionId, direccion: "outbound", tipo: "text", origen: "automatico",
    texto: cuerpo, estado: "preparando",
  }).select("id").single();
  if (insErr || !fila) {
    await log("wa_auto_respuesta_error", "error", "No se pudo registrar la respuesta automática", { conversacion_id: p.conversacionId, error: insErr?.message }, p.clienteId);
    return { auto: "error_registro" };
  }

  let estado = "error"; let wamid: string | null = null; let errorCode: string | null = null; let errorDetalle: string | null = null;
  if (await esModoSandbox()) {
    estado = "simulado"; wamid = `sandbox_${crypto.randomUUID()}`;
  } else if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    errorCode = "config_error"; errorDetalle = "Credenciales de WhatsApp no configuradas";
  } else {
    try {
      const res = await fetch(`${GRAPH_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_TOKEN}` },
        body: JSON.stringify({ messaging_product: "whatsapp", to: p.telefono.replace(/^\+/, ""), type: "text", text: { body: cuerpo } }),
      });
      const data = await res.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { code?: number; message?: string } };
      if (res.ok && data?.messages?.[0]?.id) { estado = "enviado"; wamid = data.messages[0].id; }
      else { errorCode = String(data?.error?.code ?? res.status); errorDetalle = (data?.error?.message ?? "Error de WhatsApp").slice(0, 300); }
    } catch (e) {
      errorCode = "exception"; errorDetalle = String(e).slice(0, 300);
    }
  }

  const ahora = new Date().toISOString();
  await supabase.from("tarot_whatsapp_mensajes").update({
    whatsapp_message_id: wamid, estado, enviado_at: estado === "error" ? null : ahora, error_code: errorCode, error_detalle: errorDetalle,
  }).eq("id", fila.id);
  if (estado !== "error") {
    await supabase.rpc("tarot_wa_registrar_mensaje_outbound", { p_conversacion_id: p.conversacionId, p_timestamp: ahora, p_preview: cuerpo.slice(0, 200) });
  }
  await log(estado === "error" ? "wa_auto_respuesta_error" : "wa_auto_respuesta", estado === "error" ? "error" : "info",
    estado === "simulado" ? "Respuesta automática simulada (sandbox)" : estado === "enviado" ? "Respuesta automática enviada" : "Respuesta automática falló",
    { conversacion_id: p.conversacionId, mensaje_id: fila.id, estado, error_code: errorCode }, p.clienteId);
  return { auto: estado };
}

// ── Handler ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (!(await claveValida(req.headers.get("x-internal-key")))) {
    return json({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return json({ ok: false, motivo: "metodo_no_permitido" }, 405);

  let body: any = null;
  try { body = await req.json(); } catch { return json({ ok: false, motivo: "json_invalido" }, 400); }
  const indice = Number.isInteger(body?.message_index) ? body.message_index : 0;
  const idEvento = body?.id_evento ?? null;

  const m = parsear(body?.payload ?? body, indice);
  if (!m) return json({ ok: true, resultado: "sin_mensaje" });
  const telefono = normalizarNumero(m.from);
  if (!telefono) {
    await log("wa_ingesta_numero_invalido", "warning", "Mensaje sin número válido", { wamid: m.wamid, id_evento: idEvento });
    return json({ ok: true, resultado: "numero_invalido" });
  }

  // Enriquecimiento opcional: cliente conocido y su orden.
  const { data: cliente } = await supabase.from("tarot_clientes").select("id, nombre_completo")
    .eq("telefono", telefono).is("deleted_at", null).maybeSingle();
  const ordenId = cliente ? await resolverOrden(cliente.id) : null;

  const { data: conversacionId, error: errConv } = await supabase.rpc("tarot_wa_obtener_o_crear_conversacion", {
    p_telefono: telefono, p_cliente_id: cliente?.id ?? null, p_orden_id: ordenId, p_wa_contact_name: m.profileName,
  });
  if (errConv || !conversacionId) {
    await log("wa_ingesta_conversacion_error", "error", "No se pudo crear/obtener la conversación", { wamid: m.wamid, error: errConv?.message, id_evento: idEvento }, cliente?.id ?? null);
    return json({ ok: false, motivo: "error_conversacion" }, 500); // 500 → CAPA 1 lo registra como error (el crudo queda para reprocesar)
  }

  const { error: errMsg } = await supabase.from("tarot_whatsapp_mensajes").insert({
    conversacion_id: conversacionId, whatsapp_message_id: m.wamid, direccion: "inbound", origen: "cliente",
    tipo: m.tipo, texto: m.texto, media_id: m.mediaId, mime_type: m.mimeType, filename: m.filename,
    payload_meta: m.payloadMeta, contexto_wamid: m.contextoWamid, timestamp_whatsapp: m.timestampISO,
  });
  if (errMsg) {
    if (errMsg.code === "23505") return json({ ok: true, resultado: "duplicado", conversacion_id: conversacionId });
    await log("wa_ingesta_mensaje_error", "error", "No se pudo persistir el mensaje", { wamid: m.wamid, tipo: m.tipo, error: errMsg.message, id_evento: idEvento }, cliente?.id ?? null);
    return json({ ok: false, motivo: "error_mensaje" }, 500);
  }

  // Las reacciones no son "mensajes nuevos": no suman no leídos ni cambian
  // el resumen de la conversación.
  if (m.tipo !== "reaction") {
    await supabase.rpc("tarot_wa_registrar_mensaje_inbound", {
      p_conversacion_id: conversacionId, p_timestamp: m.timestampISO,
      p_preview: (m.texto ?? PREVIEW[m.tipo] ?? "Mensaje").slice(0, 200),
    });
  }

  const primerNombre = cliente?.nombre_completo ? cliente.nombre_completo.trim().split(/\s+/)[0] : null;
  const auto = await aplicarAutoRespuesta({ conversacionId, telefono, tipo: m.tipo, timestampISO: m.timestampISO, primerNombre, clienteId: cliente?.id ?? null });

  return json({ ok: true, resultado: "registrado", conversacion_id: conversacionId, tipo: m.tipo, con_cliente: !!cliente, ...auto });
});
