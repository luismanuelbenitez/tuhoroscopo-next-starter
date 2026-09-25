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

  // 4) Diagnóstico de webhook (2026-09-25): ¿qué APP suscribió el WABA real y
  //    hay un override de webhook a nivel de número? Solo lecturas GET; el
  //    token nunca se devuelve.
  const cab = { headers: { Authorization: `Bearer ${WHATSAPP_TAROT_TOKEN_PROD}` } };
  const [subsRes, cfgRes, dbgRes] = await Promise.all([
    wabaId ? fetch(`https://graph.facebook.com/v18.0/${wabaId}/subscribed_apps`, cab) : Promise.resolve(null),
    fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}?fields=webhook_configuration`, cab),
    fetch(`https://graph.facebook.com/v18.0/debug_token?input_token=${encodeURIComponent(WHATSAPP_TAROT_TOKEN_PROD)}`, cab),
  ]);
  const subs = subsRes ? await subsRes.json().catch(() => ({})) : null;
  const cfg = await cfgRes.json().catch(() => ({}));
  const dbg = (await dbgRes.json().catch(() => ({}))) as { data?: { app_id?: string; application?: string; type?: string; is_valid?: boolean; expires_at?: number; granular_scopes?: Array<{ scope?: string; target_ids?: string[] }> } };
  // WABAs a los que el token tiene acceso (target_ids de whatsapp_business_management).
  const wabaIds = (dbg.data?.granular_scopes ?? []).filter((g) => g.scope === "whatsapp_business_management").flatMap((g) => g.target_ids ?? []);
  const suscripciones = await Promise.all(wabaIds.map(async (id) => {
    const r = await fetch(`https://graph.facebook.com/v18.0/${id}/subscribed_apps`, cab);
    return { waba_id: id, http_status: r.status, data: await r.json().catch(() => ({})) };
  }));

  return jsonResponse({
    ok: true,
    webhook: {
      token_app: { app_id: dbg.data?.app_id ?? null, application: dbg.data?.application ?? null, tipo: dbg.data?.type ?? null, valido: dbg.data?.is_valid ?? null, expira_at: dbg.data?.expires_at ?? null },
      waba_subscribed_apps: { http_status: subsRes?.status ?? null, data: subs },
      wabas_del_token_y_suscripciones: suscripciones,
      numero_webhook_configuration: { http_status: cfgRes.status, data: cfg },
    },
    numero_configurado: { http_status: numeroRes.status, data: numeroData },
    waba: { http_status: wabaRes.status, data: wabaData, waba_id: wabaId },
    template_tu_tirada_lista_v1_en_ese_waba: { http_status: templateHttpStatus, data: templateData },
  });
});
