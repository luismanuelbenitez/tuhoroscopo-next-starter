// ============================================================================
// ef_tarot_debug_whatsapp_status — SOLO QA/admin, temporal.
// ============================================================================
//
// Construye un evento `statuses[]` con el schema oficial de WhatsApp Cloud
// API (mismo shape que un webhook real de Meta) y lo entrega directo a
// ef_webhook_whatsapp_events (CAPA 1 — el webhook REAL registrado en Meta,
// donde vive la propagación de statuses hacia tarot_whatsapp_mensajes /
// tarot_envios_whatsapp desde el sprint 2026-09-06). A diferencia del
// debug de mensajes inbound (ef_tarot_debug_whatsapp_inbound, que entrega
// directo a CAPA 2 porque ahí vive la lógica de negocio), acá el target
// correcto ES CAPA 1: la propagación de statuses no pasa por CAPA 2 en
// absoluto.
//
// Solo tiene sentido simular el status de un mensaje outbound que ya
// existe en tarot_whatsapp_mensajes (whatsapp_message_id real, incluido
// uno "simulado" de sandbox — el status en sí también queda simulado, ver
// docs/modules/whatsapp-inbox.md).
//
// Gateada por x-internal-key (TAROT_INTERNAL_KEY) — nunca la llama el
// pipeline real, solo la ruta admin protegida por sesión.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const STATUSES_VALIDOS = ["sent", "delivered", "read", "failed"] as const;
type StatusValido = typeof STATUSES_VALIDOS[number];

function construirPayloadStatus(waMessageId: string, status: StatusValido, errorCode?: string, errorTitle?: string) {
  const st: Record<string, unknown> = {
    id: waMessageId,
    status,
    timestamp: String(Math.floor(Date.now() / 1000)),
    recipient_id: "DEBUG_RECIPIENT",
  };
  if (status === "failed") {
    st.errors = [{ code: errorCode ? Number(errorCode) || 0 : 470, title: errorTitle ?? "Simulación de fallo (debug)" }];
  }
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
          statuses: [st],
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

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, motivo: "json_invalido" }, 400); }

  const waMessageId = typeof body.whatsapp_message_id === "string" ? body.whatsapp_message_id.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!waMessageId) return jsonResponse({ ok: false, motivo: "whatsapp_message_id_requerido" }, 400);
  if (!STATUSES_VALIDOS.includes(status as StatusValido)) {
    return jsonResponse({ ok: false, motivo: "status_invalido", validos: STATUSES_VALIDOS }, 400);
  }

  const errorCode = typeof body.error_code === "string" ? body.error_code : undefined;
  const errorTitle = typeof body.error_title === "string" ? body.error_title : undefined;
  const payload = construirPayloadStatus(waMessageId, status as StatusValido, errorCode, errorTitle);

  const eventsUrl = `${SUPABASE_URL}/functions/v1/ef_webhook_whatsapp_events`;
  let res: Response;
  try {
    res = await fetch(eventsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return jsonResponse({ ok: false, motivo: "fetch_error", detalle: String(e) }, 502);
  }
  const text = await res.text();

  return jsonResponse({ ok: true, whatsapp_message_id: waMessageId, status, capa1_http_status: res.status, capa1_response: text, payload_meta_simulado: payload });
});
