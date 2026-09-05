// ============================================================================
// ef_tarot_debug_whatsapp_inbound — SOLO QA/admin, temporal.
// ============================================================================
//
// Meta todavía no aprobó la empresa para WhatsApp Production (o el admin
// quiere probar sin depender de un número real). Esta función construye un
// payload con el schema OFICIAL de WhatsApp Cloud API (mismo shape que un
// webhook real de Meta) y lo entrega directo a ef_webhook_whatsapp_inbound
// (CAPA 2 — misma lógica de negocio que un mensaje real), usando
// WHATSAPP_INTERNAL_KEY como lo hace CAPA 1 en producción.
//
// No pasa por CAPA 1 (ef_webhook_whatsapp_events) — esa capa es un pass-
// through delgado (log + reenvío + validación de firma opcional) sin
// lógica de negocio propia; se audita por lectura de código, no hace falta
// inyectar tráfico ahí. Lo que SÍ importa probar con datos reales es la
// asociación cliente/orden, la deduplicación y el manejo por tipo — eso
// vive en CAPA 2, y es exactamente lo que esta función ejercita.
//
// Soporta inyectar VARIOS mensajes en un solo payload (mismo array
// value.messages[] que mandaría Meta) para probar el caso "más de un
// mensaje por webhook" — llama a CAPA 2 una vez por mensaje, igual que
// hace CAPA 1 en producción.
//
// Gateada por x-internal-key (TAROT_INTERNAL_KEY) — nunca la llama el
// pipeline real, solo la ruta admin protegida por sesión. Candidata a
// borrarse (o dejar, es inerte y sin costo) una vez Production esté
// habilitado y validado con tráfico real.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY_SUPABASE") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

interface MensajeDebug {
  tipo: "text" | "reaction" | "image" | "document" | "audio" | "video" | "sticker" | "location" | "contact" | "interactive" | "unknown";
  texto?: string;
  media_id?: string;
  mime_type?: string;
  filename?: string;
  latitude?: number;
  longitude?: number;
  nombre_contacto?: string;
  telefono_contacto?: string;
  interactive_reply_id?: string;
  interactive_reply_title?: string;
  raw_type?: string; // solo para tipo "unknown", simula un type no soportado por Meta a futuro
}

function construirMensajeMeta(m: MensajeDebug, index: number, telefono: string) {
  const id = `wamid.DEBUG_${crypto.randomUUID()}_${index}`;
  const base = { from: telefono, id, timestamp: String(Math.floor(Date.now() / 1000)) };

  switch (m.tipo) {
    case "text":
      return { ...base, type: "text", text: { body: m.texto ?? "Mensaje de prueba" } };
    case "reaction":
      return { ...base, type: "reaction", reaction: { emoji: "👍", message_id: `wamid.DEBUG_${crypto.randomUUID()}` } };
    case "image":
    case "video":
    case "sticker":
      return { ...base, type: m.tipo, [m.tipo]: { id: m.media_id ?? `MEDIA_DEBUG_${crypto.randomUUID()}`, mime_type: m.mime_type ?? "image/jpeg", caption: m.texto ?? null } };
    case "document":
      return { ...base, type: "document", document: { id: m.media_id ?? `MEDIA_DEBUG_${crypto.randomUUID()}`, mime_type: m.mime_type ?? "application/pdf", filename: m.filename ?? "documento.pdf", caption: m.texto ?? null } };
    case "audio":
      return { ...base, type: "audio", audio: { id: m.media_id ?? `MEDIA_DEBUG_${crypto.randomUUID()}`, mime_type: m.mime_type ?? "audio/ogg" } };
    case "location":
      return { ...base, type: "location", location: { latitude: m.latitude ?? -34.9011, longitude: m.longitude ?? -56.1645, name: "Montevideo", address: "Uruguay" } };
    case "contact":
      return { ...base, type: "contacts", contacts: [{ name: { formatted_name: m.nombre_contacto ?? "Contacto de prueba" }, phones: [{ phone: m.telefono_contacto ?? "+59899999999" }] }] };
    case "interactive":
      return { ...base, type: "interactive", interactive: { type: "button_reply", button_reply: { id: m.interactive_reply_id ?? "opcion_1", title: m.interactive_reply_title ?? "Opción 1" } } };
    default:
      // "unknown": tipo real de Meta que todavía no mapeamos explícitamente.
      return { ...base, type: m.raw_type ?? "unsupported_future_type" };
  }
}

function construirPayloadMeta(mensajes: MensajeDebug[], telefono: string, nombreContacto: string | null) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "DEBUG_WABA_ID",
      time: Math.floor(Date.now() / 1000),
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "000000000", phone_number_id: WHATSAPP_PHONE_NUMBER_ID || "DEBUG_PHONE_NUMBER_ID" },
          contacts: nombreContacto ? [{ profile: { name: nombreContacto }, wa_id: telefono.replace(/^\+/, "") }] : [],
          messages: mensajes.map((m, i) => construirMensajeMeta(m, i, telefono.replace(/^\+/, ""))),
        },
      }],
    }],
  };
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);
  if (!WHATSAPP_INTERNAL_KEY) return jsonResponse({ ok: false, motivo: "whatsapp_internal_key_no_configurada" }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, motivo: "json_invalido" }, 400); }

  const telefono = typeof body.telefono === "string" ? body.telefono.trim() : "";
  if (!telefono || !/^\+\d{8,15}$/.test(telefono)) {
    return jsonResponse({ ok: false, motivo: "telefono_invalido", hint: "Formato E.164, ej: +598912345678" }, 400);
  }

  const mensajesInput = Array.isArray(body.mensajes) ? body.mensajes as MensajeDebug[] : [body as unknown as MensajeDebug];
  if (mensajesInput.length === 0) return jsonResponse({ ok: false, motivo: "mensajes_requeridos" }, 400);

  const nombreContacto = typeof body.nombre_contacto === "string" ? body.nombre_contacto : null;
  const payload = construirPayloadMeta(mensajesInput, telefono, nombreContacto);

  const inboundUrl = `${SUPABASE_URL}/functions/v1/ef_webhook_whatsapp_inbound`;
  const resultados = [];
  for (let i = 0; i < mensajesInput.length; i++) {
    try {
      const res = await fetch(inboundUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": WHATSAPP_INTERNAL_KEY,
          ...(SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY } : {}),
        },
        body: JSON.stringify({ payload, id_evento: null, message_index: i }),
      });
      const data = await res.json().catch(() => ({}));
      resultados.push({ message_index: i, http_status: res.status, body: data });
    } catch (e) {
      resultados.push({ message_index: i, http_status: 0, body: { error: String(e) } });
    }
  }

  return jsonResponse({ ok: true, telefono, cantidad_mensajes: mensajesInput.length, payload_meta_simulado: payload, resultados });
});
