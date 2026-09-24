// ============================================================================
// ef_tarot_debug_whatsapp_numero — SOLO QA/admin, temporal, diagnóstico.
//
// Consulta directa (GET, sin efectos secundarios) a la API de Meta para
// revelar a qué número de teléfono real corresponde el
// WHATSAPP_PHONE_NUMBER_ID configurado hoy en Supabase Secrets, usando el
// WHATSAPP_TAROT_TOKEN_PROD ya confirmado como válido. Objetivo puntual:
// diagnosticar el error 132001 ("Template name does not exist in the
// translation") del 2026-09-24 — el template tu_tirada_lista_v1 está
// "Activa" en Meta Business Manager, así que la hipótesis es que
// WHATSAPP_PHONE_NUMBER_ID apunta a una cuenta/número de WhatsApp Business
// distinto de aquel donde vive ese template.
//
// Gateada por x-internal-key (TAROT_INTERNAL_KEY) — nunca la llama el
// pipeline real.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const WHATSAPP_TAROT_TOKEN_PROD = Deno.env.get("WHATSAPP_TAROT_TOKEN_PROD") ?? "";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }

  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TAROT_TOKEN_PROD) {
    return jsonResponse({ ok: false, motivo: "config_faltante",
      whatsapp_phone_number_id_configurado: Boolean(WHATSAPP_PHONE_NUMBER_ID),
      whatsapp_tarot_token_prod_configurado: Boolean(WHATSAPP_TAROT_TOKEN_PROD) }, 500);
  }

  // 1) Identidad del número configurado.
  const numeroRes = await fetch(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${WHATSAPP_TAROT_TOKEN_PROD}` } },
  );
  const numeroData = await numeroRes.json().catch(() => ({}));

  // 2) WABA dueño de ese número (para poder listar templates después).
  const wabaRes = await fetch(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}?fields=whatsapp_business_account`,
    { headers: { Authorization: `Bearer ${WHATSAPP_TAROT_TOKEN_PROD}` } },
  );
  const wabaData = await wabaRes.json().catch(() => ({}));
  const wabaId = (wabaData as { whatsapp_business_account?: { id?: string } })?.whatsapp_business_account?.id ?? null;

  // 3) Si se resolvió el WABA, buscar el template puntual ahí.
  let templateData: unknown = null;
  let templateHttpStatus: number | null = null;
  if (wabaId) {
    const tplRes = await fetch(
      `https://graph.facebook.com/v18.0/${wabaId}/message_templates?name=tu_tirada_lista_v1`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TAROT_TOKEN_PROD}` } },
    );
    templateHttpStatus = tplRes.status;
    templateData = await tplRes.json().catch(() => ({}));
  }

  return jsonResponse({
    ok: true,
    numero_configurado: { http_status: numeroRes.status, data: numeroData },
    waba: { http_status: wabaRes.status, data: wabaData, waba_id: wabaId },
    template_tu_tirada_lista_v1_en_ese_waba: { http_status: templateHttpStatus, data: templateData },
  });
});
