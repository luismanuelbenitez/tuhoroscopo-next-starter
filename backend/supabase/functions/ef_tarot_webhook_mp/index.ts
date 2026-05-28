// ============================================================
// ef_tarot_webhook_mp — Sprint 2
// Endpoint público que recibe notificaciones de Mercado Pago
// para pagos del módulo Tarot.
//
// REGLAS CRÍTICAS:
//   1. Siempre responder "OK" inmediatamente (MP reintenta si no).
//   2. Todo el procesamiento es fire-and-forget.
//   3. Idempotente: si la orden ya fue procesada, ignorar.
//   4. Solo procesa external_reference que empiecen con "TAROT-".
//   5. No toca ninguna tabla del SaaS THC.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FN = "ef_tarot_webhook_mp";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Estados que indican que el pago ya fue procesado en rondas anteriores
const ESTADOS_YA_PROCESADOS = new Set([
  "pago_confirmado",
  "generando_lectura",
  "lectura_lista",
  "generando_pdf",
  "pdf_listo",
  "enviando_whatsapp",
  "entregado",
]);

// ── Logging ──────────────────────────────────────────────────

async function registrarLog(
  ordenId: string | null,
  evento: string,
  nivel: "debug" | "info" | "warning" | "error" | "critical",
  mensaje: string,
  payload: unknown = {},
  ip?: string,
  duracion_ms?: number,
) {
  try {
    await supabase.from("tarot_logs").insert({
      orden_id: ordenId,
      evento,
      nivel,
      mensaje,
      payload: payload ?? {},
      ip: ip ?? null,
      funcion_origen: FN,
      duracion_ms: duracion_ms ?? null,
    });
  } catch (e) {
    console.error("tarot_logs insert falló:", e);
  }
}

// ── Procesamiento del pago ───────────────────────────────────

async function procesarPago(paymentId: string, ip?: string): Promise<void> {
  const t0 = Date.now();

  // 1) Consultar el pago real en la API de MP
  //    Nunca confiamos ciegamente en el payload del webhook.
  if (!MP_ACCESS_TOKEN) {
    console.error("MERCADOPAGO_ACCESS_TOKEN no configurado");
    return;
  }

  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });

  if (!mpRes.ok) {
    await registrarLog(null, "mp_api_error", "error",
      "Error consultando pago en MP", { payment_id: paymentId, status: mpRes.status }, ip);
    return;
  }

  const pay = await mpRes.json().catch(() => null);
  if (!pay) {
    await registrarLog(null, "mp_json_invalido", "error",
      "Respuesta de MP inválida o vacía", { payment_id: paymentId }, ip);
    return;
  }

  const externalRef: string = pay.external_reference ?? "";
  const mpStatus: string = pay.status ?? "";
  const mpStatusDetail: string = pay.status_detail ?? "";

  // 2) Filtro de módulo: solo procesamos órdenes TAROT
  if (!externalRef.startsWith("TAROT-")) {
    // Silencioso: es un pago de otro módulo (suscripciones, etc.)
    return;
  }

  await registrarLog(null, "mp_webhook_recibido", "info",
    "Webhook MP recibido para orden Tarot",
    { payment_id: paymentId, external_reference: externalRef, mp_status: mpStatus }, ip);

  // 3) Buscar la orden en la BD
  const { data: orden, error: errOrden } = await supabase
    .from("tarot_ordenes")
    .select("id, estado, cliente_id")
    .eq("external_reference", externalRef)
    .maybeSingle();

  if (errOrden || !orden?.id) {
    await registrarLog(null, "orden_no_encontrada", "error",
      "Orden no encontrada para external_reference",
      { external_reference: externalRef, payment_id: paymentId }, ip);
    return;
  }

  const ordenId: string = orden.id;

  // 4) IDEMPOTENCIA: si ya fue procesada, no hacer nada
  if (ESTADOS_YA_PROCESADOS.has(orden.estado)) {
    await registrarLog(ordenId, "pago_duplicado_ignorado", "info",
      "Webhook duplicado ignorado — orden ya procesada",
      { estado_actual: orden.estado, payment_id: paymentId }, ip);
    return;
  }

  const ahora = new Date().toISOString();

  // 5) Actualizar tarot_pagos con todos los datos del webhook
  await supabase
    .from("tarot_pagos")
    .update({
      mp_payment_id: String(paymentId),
      mp_external_reference: externalRef,
      mp_status: mpStatus,
      mp_status_detail: mpStatusDetail,
      mp_payment_type: pay.payment_type_id ?? null,
      mp_payment_method_id: pay.payment_method_id ?? null,
      mp_installments: pay.installments ?? 1,
      monto: pay.transaction_amount ?? null,
      moneda: pay.currency_id ?? null,
      ip_pago: pay.payer?.identification?.number ? null : null, // MP no expone IP del pagador
      webhook_payload: pay,           // payload completo sin modificar
      webhook_received_at: ahora,
      updated_at: ahora,
    })
    .eq("orden_id", ordenId);

  // 6) Lógica de negocio según estado de MP
  if (mpStatus === "approved") {
    // ── Pago aprobado ────────────────────────────────────────
    await supabase
      .from("tarot_ordenes")
      .update({ estado: "pago_confirmado", updated_at: ahora })
      .eq("id", ordenId);

    await registrarLog(ordenId, "pago_confirmado", "info",
      "Pago aprobado. Disparando generación de lectura.",
      { payment_id: paymentId, mp_status: mpStatus, duracion_ms: Date.now() - t0 },
      ip, Date.now() - t0);

    // ── Disparar ef_tarot_generar_lectura (fire-and-forget) ──
    // Esta función se implementa en Sprint 3.
    // El dispatch ya está cableado para que al existir funcione sin cambios aquí.
    const lecturaUrl = `${SUPABASE_URL}/functions/v1/ef_tarot_generar_lectura`;
    fetch(lecturaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-internal-key": TAROT_INTERNAL_KEY,
      },
      body: JSON.stringify({ orden_id: ordenId }),
    }).catch(async (err) => {
      await registrarLog(ordenId, "lectura_dispatch_error", "warning",
        "No se pudo disparar ef_tarot_generar_lectura (puede no existir aún)",
        { error: String(err) });
    });

  } else if (mpStatus === "rejected" || mpStatus === "cancelled") {
    // ── Pago rechazado o cancelado ───────────────────────────
    await supabase
      .from("tarot_ordenes")
      .update({ estado: "pago_rechazado", updated_at: ahora })
      .eq("id", ordenId);

    await registrarLog(ordenId, "pago_rechazado", "warning",
      "Pago rechazado o cancelado",
      { payment_id: paymentId, mp_status: mpStatus, mp_status_detail: mpStatusDetail }, ip);

  } else {
    // ── Estado intermedio (pending, in_process, etc.) ────────
    await registrarLog(ordenId, "pago_pendiente", "info",
      `Pago en estado intermedio: ${mpStatus}`,
      { payment_id: paymentId, mp_status: mpStatus }, ip);
  }
}

// ── Router principal ─────────────────────────────────────────

serve(async (req) => {
  // MP envía GET y POST. Cualquier otro método: OK y salir.
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("OK");
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const url = new URL(req.url);

  try {
    // ── Mode 1: IPN clásico (?topic=payment&id=xxx) ──────────
    const topicRaw = url.searchParams.get("topic");
    const idRaw = url.searchParams.get("id");

    if (topicRaw && idRaw) {
      const topic = topicRaw.toLowerCase().trim();
      const id = idRaw.trim();

      // Solo procesamos topic=payment. Ignoramos preapproval y otros
      // (Tarot no usa preapproval).
      if (topic === "payment") {
        procesarPago(id, ip); // fire-and-forget: NO await
      }

      return new Response("OK"); // respuesta inmediata a MP
    }

    // ── Mode 2: Webhook JSON body ({ type, data.id }) ────────
    const raw = await req.text().catch(() => "");
    let payload: Record<string, unknown> = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      // body malformado: igual respondemos OK
    }

    const type = String(payload?.type ?? "").toLowerCase().trim();
    const dataId = String(payload?.data?.id ?? "").trim();

    if (type === "payment" && dataId) {
      procesarPago(dataId, ip); // fire-and-forget: NO await
    }

    return new Response("OK"); // respuesta inmediata a MP

  } catch (err) {
    // Nunca romper la respuesta a MP. Log fatal y OK.
    console.error(`${FN} fatal:`, err);
    return new Response("OK");
  }
});
