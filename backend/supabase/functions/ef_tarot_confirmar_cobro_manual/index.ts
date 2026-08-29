// ============================================================
// ef_tarot_confirmar_cobro_manual
// Registra un cobro administrativo interno para una orden
// que no fue confirmada por Mercado Pago.
//
// REGLAS CRÍTICAS:
//   1. NUNCA toca campos mp_* — no falsifica pagos de MP.
//   2. Solo actualiza campos cobro_manual_* en tarot_pagos.
//   3. Idempotente: rechaza si orden ya procesada o ya tiene cobro_manual.
//   4. El pipeline post-cobro es canónico: ejecutarPipelinePostCobro().
//   5. Analytics: usa event_name 'payment_approved_manual' (≠ 'payment_approved' de MP).
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { ejecutarPipelinePostCobro } from "../_shared/tarot-pipeline.ts";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FN = "ef_tarot_confirmar_cobro_manual";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Mismos estados que ef_tarot_webhook_mp — no reprocessar si ya avanzó el pipeline
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

const MOTIVOS_VALIDOS = new Set([
  "pago_sandbox_no_procesado",
  "pago_otro_medio",
  "ajuste_administrativo",
  "otro",
]);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizarUUID(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return v;
  return null;
}

async function registrarLog(
  ordenId: string | null,
  evento: string,
  nivel: "debug" | "info" | "warning" | "error" | "critical",
  mensaje: string,
  payload: unknown = {},
) {
  try {
    await supabase.from("tarot_logs").insert({
      orden_id:       ordenId,
      evento,
      nivel,
      mensaje,
      payload:        payload ?? {},
      funcion_origen: FN,
    });
  } catch (e) {
    console.error("tarot_logs insert falló:", e);
  }
}

serve(async (req) => {
  // 1. Auth
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);
  }

  // 2. Body
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return jsonResponse({ ok: false, motivo: "json_invalido" }, 400);
  }

  const orden_id    = normalizarUUID(body.orden_id);
  const motivo      = typeof body.motivo      === "string" ? body.motivo.trim()                          : "";
  const observacion = typeof body.observacion === "string" ? body.observacion.trim().substring(0, 500)  : null;
  const cobrado_por = typeof body.cobrado_por === "string" ? body.cobrado_por.trim().substring(0, 100)  : "admin";

  if (!orden_id) {
    return jsonResponse({ ok: false, motivo: "orden_id_invalido" }, 400);
  }
  if (!MOTIVOS_VALIDOS.has(motivo)) {
    return jsonResponse({ ok: false, motivo: "motivo_invalido", motivos_validos: [...MOTIVOS_VALIDOS] }, 400);
  }

  // 3. Buscar orden
  const { data: orden, error: errOrden } = await supabase
    .from("tarot_ordenes")
    .select("id, estado, cliente_id, external_reference, funnel_session_id, precio_cobrado, moneda")
    .eq("id", orden_id)
    .maybeSingle();

  if (errOrden || !orden?.id) {
    return jsonResponse({ ok: false, motivo: "orden_no_encontrada" }, 404);
  }

  // 4. Idempotencia #1 — estado ya procesado (webhook de MP llegó primero)
  if (ESTADOS_YA_PROCESADOS.has(orden.estado)) {
    await registrarLog(orden_id, "cobro_manual_orden_ya_procesada", "info",
      "cobro_manual ignorado — orden ya en estado procesado",
      { estado_actual: orden.estado, motivo, cobrado_por });
    return jsonResponse({ ok: false, motivo: "orden_ya_procesada", estado_actual: orden.estado }, 409);
  }

  // 5. Buscar pago para idempotencia #2
  const { data: pago, error: errPago } = await supabase
    .from("tarot_pagos")
    .select("id, cobro_manual")
    .eq("orden_id", orden_id)
    .maybeSingle();

  if (errPago) {
    return jsonResponse({ ok: false, motivo: "error_al_buscar_pago" }, 500);
  }

  // 6. Idempotencia #2 — cobro manual ya registrado
  if (pago?.cobro_manual === true) {
    return jsonResponse({ ok: false, motivo: "cobro_manual_ya_registrado" }, 409);
  }

  const ahora = new Date().toISOString();

  // 7. Actualizar tarot_pagos — SOLO campos cobro_manual, jamás campos mp_*
  if (pago?.id) {
    const { error: errUpd } = await supabase
      .from("tarot_pagos")
      .update({
        cobro_manual:             true,
        cobro_manual_motivo:      motivo,
        cobro_manual_observacion: observacion || null,
        cobro_manual_at:          ahora,
        cobro_manual_por:         cobrado_por,
        updated_at:               ahora,
      })
      .eq("id", pago.id);
    if (errUpd) {
      console.error("Error actualizando tarot_pagos:", errUpd.message);
    }
  }

  // 8. Audit log en tarot_logs
  await registrarLog(orden_id, "cobro_manual_confirmado", "info",
    `Cobro manual registrado por ${cobrado_por}`,
    {
      motivo,
      observacion:     observacion || null,
      cobrado_por,
      estado_anterior: orden.estado,
      pago_id:         pago?.id ?? null,
    });

  // 9. Pipeline post-cobro canónico:
  //    estado → pago_confirmado, alerta, analytics, generar_lectura, aplicar_codigo
  await ejecutarPipelinePostCobro(
    supabase,
    {
      supabaseUrl:    SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      internalKey:    TAROT_INTERNAL_KEY,
      funcionOrigen:  FN,
    },
    {
      ordenId:           orden_id,
      clienteId:         orden.cliente_id,
      externalReference: orden.external_reference ?? null,
      funnelSessionId:   orden.funnel_session_id  ?? null,
      monto:             orden.precio_cobrado ? Number(orden.precio_cobrado) : null,
      moneda:            orden.moneda          ?? null,
      analyticsEvent:    "payment_approved_manual",
      analyticsMetadata: {
        external_reference: orden.external_reference ?? null,
        motivo,
        cobrado_por,
        estado_anterior:    orden.estado,
      },
      mpPaymentId: null,
      ahora,
    },
  );

  return jsonResponse({
    ok:          true,
    mensaje:     "Cobro manual registrado. Procesando lectura.",
    orden_id,
    motivo,
    cobrado_por,
  });
});
