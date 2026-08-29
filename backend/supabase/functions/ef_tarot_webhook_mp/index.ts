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
import { ejecutarPipelinePostCobro } from "../_shared/tarot-pipeline.ts";
import { dispararAlerta } from "../_shared/tarot-alertas.ts";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MP_ACCESS_TOKEN           = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
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
  "entregado_simulado",
]);

// logFunnelEvent se mantiene aquí para los paths MP-específicos: rejected y pending
async function logFunnelEvent(event: {
  order_id:      string;
  session_id?:   string | null;
  event_name:    string;
  product_id?:   string | null;
  product_name?: string | null;
  value?:        number | null;
  currency?:     string | null;
  metadata?:     Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await supabase.from("funnel_events").insert({
      order_id:     event.order_id,
      session_id:   event.session_id   ?? null,
      event_name:   event.event_name,
      product_id:   event.product_id   ?? "tarot_one_shot",
      product_name: event.product_name ?? "Lectura de tarot personalizada",
      value:        event.value        ?? null,
      currency:     event.currency     ?? "UYU",
      metadata:     event.metadata     ?? {},
    });
    if (error) {
      console.warn("[analytics] funnel_events insert failed", {
        event_name: event.event_name,
        order_id:   event.order_id,
        error:      error.message,
      });
    }
  } catch (err) {
    console.warn("[analytics] funnel_events unexpected error", {
      event_name: event.event_name,
      order_id:   event.order_id,
      error:      err,
    });
  }
}

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
  if (nivel === "debug") {
    try {
      const { data: dbgCfg } = await supabase
        .from("tarot_configuracion").select("valor").eq("clave", "debug_mode").maybeSingle();
      if (dbgCfg?.valor !== "true") return;
    } catch { return; }
  }
  try {
    await supabase.from("tarot_logs").insert({
      orden_id:       ordenId,
      evento,
      nivel,
      mensaje,
      payload:        payload ?? {},
      ip:             ip ?? null,
      funcion_origen: FN,
      duracion_ms:    duracion_ms ?? null,
    });
  } catch (e) {
    console.error("tarot_logs insert falló:", e);
  }
}

// ── Validación de coherencia de monto ────────────────────────
//
// El cliente nunca es autoridad sobre el precio (ver docs/product/
// DECISIONS.md 2026-08-17/18): tarot_ordenes.precio_cobrado es el
// snapshot comercial server-side tomado en ef_tarot_crear_orden.
// Antes de disparar el pipeline post-cobro, comparamos ese valor
// contra pay.transaction_amount (lo que MP realmente aprobó) — nunca
// con igualdad floating-point ingenua, sino en centavos enteros para
// evitar falsos negativos por representación decimal.

function aCentavos(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function montoCoherente(
  montoOrden: number | string | null | undefined,
  monedaOrden: string | null | undefined,
  montoMp: number | string | null | undefined,
  monedaMp: string | null | undefined,
): boolean {
  const centavosOrden = aCentavos(montoOrden);
  const centavosMp    = aCentavos(montoMp);
  if (centavosOrden === null || centavosMp === null) return false;
  if (centavosOrden !== centavosMp) return false;
  if ((monedaOrden ?? "").toUpperCase() !== (monedaMp ?? "").toUpperCase()) return false;
  return true;
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

  const externalRef: string    = pay.external_reference ?? "";
  const mpStatus: string       = pay.status ?? "";
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
    .select("id, estado, cliente_id, funnel_session_id, precio_cobrado, moneda, external_reference")
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

  // 5) Actualizar tarot_pagos con todos los datos del webhook MP
  await supabase
    .from("tarot_pagos")
    .update({
      mp_payment_id:        String(paymentId),
      mp_external_reference: externalRef,
      mp_status:             mpStatus,
      mp_status_detail:      mpStatusDetail,
      mp_payment_type:       pay.payment_type_id ?? null,
      mp_payment_method_id:  pay.payment_method_id ?? null,
      mp_installments:       pay.installments ?? 1,
      monto:                 pay.transaction_amount ?? null,
      moneda:                pay.currency_id ?? null,
      ip_pago:               null,
      webhook_payload:       pay,
      webhook_received_at:   ahora,
      updated_at:            ahora,
    })
    .eq("orden_id", ordenId);

  // 6) Lógica de negocio según estado de MP
  if (mpStatus === "approved") {
    // ── Validar coherencia de monto ANTES de disparar el pipeline ─────
    // El cliente nunca es autoridad sobre el precio — precio_cobrado es
    // el snapshot comercial server-side de la orden (ef_tarot_crear_orden).
    // Un pago aprobado con monto/moneda distinto NUNCA dispara generación
    // ni entrega en silencio.
    const coherente = montoCoherente(
      orden.precio_cobrado, orden.moneda,
      pay.transaction_amount, pay.currency_id,
    );

    if (!coherente) {
      await supabase
        .from("tarot_ordenes")
        .update({ estado: "error_critico", updated_at: ahora })
        .eq("id", ordenId);

      await registrarLog(ordenId, "pago_monto_incoherente", "critical",
        "Monto aprobado por MP no coincide con precio_cobrado de la orden — pipeline detenido, requiere revisión manual",
        {
          payment_id:         paymentId,
          precio_cobrado:     orden.precio_cobrado,
          moneda_orden:       orden.moneda,
          transaction_amount: pay.transaction_amount,
          moneda_mp:          pay.currency_id,
        },
        ip, Date.now() - t0);

      await dispararAlerta(supabase, "pago_monto_incoherente", {
        ordenId,
        ordenRef: externalRef,
        error: `Orden ${orden.precio_cobrado} ${orden.moneda} vs MP ${pay.transaction_amount} ${pay.currency_id} (payment_id ${paymentId})`,
        fecha: ahora,
      }).catch(() => {});

      return; // NO dispara ejecutarPipelinePostCobro — evidencia ya persistida en tarot_pagos (paso 5)
    }

    // ── Pago aprobado y coherente ────────────────────────────
    await registrarLog(ordenId, "pago_confirmado", "info",
      "Pago aprobado. Disparando generación de lectura.",
      { payment_id: paymentId, mp_status: mpStatus, duracion_ms: Date.now() - t0 },
      ip, Date.now() - t0);

    await ejecutarPipelinePostCobro(
      supabase,
      {
        supabaseUrl:    SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        internalKey:    TAROT_INTERNAL_KEY,
        funcionOrigen:  FN,
      },
      {
        ordenId,
        clienteId:         orden.cliente_id,
        externalReference: externalRef,
        funnelSessionId:   orden.funnel_session_id ?? null,
        monto:             pay.transaction_amount ?? null,
        moneda:            pay.currency_id ?? null,
        analyticsEvent:    "payment_approved",
        analyticsMetadata: {
          mp_payment_id:      String(paymentId),
          external_reference: externalRef,
          mp_status:          mpStatus,
          mp_status_detail:   mpStatusDetail,
        },
        mpPaymentId: String(paymentId),
        ahora,
      },
    );

  } else if (mpStatus === "rejected" || mpStatus === "cancelled") {
    // ── Pago rechazado o cancelado ───────────────────────────
    await supabase
      .from("tarot_ordenes")
      .update({ estado: "pago_rechazado", updated_at: ahora })
      .eq("id", ordenId);

    await registrarLog(ordenId, "pago_rechazado", "warning",
      "Pago rechazado o cancelado",
      { payment_id: paymentId, mp_status: mpStatus, mp_status_detail: mpStatusDetail }, ip);

    await logFunnelEvent({
      order_id:   ordenId,
      session_id: orden.funnel_session_id ?? null,
      event_name: "payment_rejected",
      metadata: {
        mp_payment_id:      String(paymentId),
        external_reference: externalRef,
        mp_status:          mpStatus,
        mp_status_detail:   mpStatusDetail,
      },
    });

    // ── Liberar código de descuento reservado si existe ──────
    const { data: usoReservadoRej } = await supabase
      .from("tarot_codigos_descuento_usos")
      .select("id")
      .eq("orden_id", ordenId)
      .eq("estado_uso", "reservado")
      .maybeSingle();

    if (usoReservadoRej?.id) {
      fetch(`${SUPABASE_URL}/functions/v1/ef_tarot_liberar_codigo`, {
        method: "POST",
        headers: {
          "Content-Type":   "application/json",
          Authorization:    `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "x-internal-key": TAROT_INTERNAL_KEY,
        },
        body: JSON.stringify({
          uso_id: usoReservadoRej.id,
          motivo: mpStatus === "rejected" ? "pago_rechazado" : "orden_cancelada",
        }),
      }).catch(async (err) => {
        await registrarLog(ordenId, "liberar_codigo_dispatch_error", "warning",
          "No se pudo disparar ef_tarot_liberar_codigo",
          { error: String(err) });
      });
    }

  } else {
    // ── Estado intermedio (pending, in_process, etc.) ────────
    await registrarLog(ordenId, "pago_pendiente", "info",
      `Pago en estado intermedio: ${mpStatus}`,
      { payment_id: paymentId, mp_status: mpStatus }, ip);

    await logFunnelEvent({
      order_id:   ordenId,
      session_id: orden.funnel_session_id ?? null,
      event_name: "payment_pending",
      metadata: {
        mp_payment_id:      String(paymentId),
        external_reference: externalRef,
        mp_status:          mpStatus,
      },
    });
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
    const idRaw    = url.searchParams.get("id");

    if (topicRaw && idRaw) {
      const topic = topicRaw.toLowerCase().trim();
      const id    = idRaw.trim();

      // Solo procesamos topic=payment. Ignoramos preapproval y otros.
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

    const type   = String(payload?.type    ?? "").toLowerCase().trim();
    const dataId = String((payload?.data as Record<string, unknown> | undefined)?.id ?? "").trim();

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
