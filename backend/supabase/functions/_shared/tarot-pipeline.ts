// ============================================================
// _shared/tarot-pipeline.ts — Pipeline post-cobro canónico TTC
//
// Pasos comunes a ef_tarot_webhook_mp (approved) y
// ef_tarot_confirmar_cobro_manual:
//   1. Transición tarot_ordenes → pago_confirmado
//   1.5. Registro administrativo interno de la venta (idempotente por
//        constraint de BD, ver _shared/tarot-facturacion.ts — NO es un
//        comprobante fiscal)
//   2. Alerta nueva_venta (fire-and-forget)
//   3. Analytics funnel_events (event_name parametrizado)
//   4. Dispatch ef_tarot_generar_lectura (fire-and-forget)
//   5. Dispatch ef_tarot_aplicar_codigo si hay código reservado (fire-and-forget)
//
// NO hace: auth, validación de pago MP, actualización de campos
// mp_* ni cobro_manual_*. Eso lo hace cada EF llamador.
// ============================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { dispararAlerta } from "./tarot-alertas.ts";
import { crearRegistroFacturacion } from "./tarot-facturacion.ts";

export interface PipelineEnv {
  supabaseUrl:    string;
  serviceRoleKey: string;
  internalKey:    string;
  funcionOrigen:  string;
}

export interface PipelinePostCobroParams {
  ordenId:           string;
  clienteId:         string;
  externalReference: string | null;
  funnelSessionId:   string | null;
  monto:             number | null;
  moneda:            string | null;
  analyticsEvent:    string;
  analyticsMetadata: Record<string, unknown>;
  mpPaymentId:       string | null; // null para cobro manual
  ahora:             string;
}

async function logFunnelEvent(
  supabase: SupabaseClient,
  event: {
    order_id:    string;
    session_id?: string | null;
    event_name:  string;
    value?:      number | null;
    currency?:   string | null;
    metadata?:   Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("funnel_events").insert({
      order_id:     event.order_id,
      session_id:   event.session_id ?? null,
      event_name:   event.event_name,
      product_id:   "tarot_one_shot",
      product_name: "Lectura de tarot personalizada",
      value:        event.value    ?? null,
      currency:     event.currency ?? "UYU",
      metadata:     event.metadata ?? {},
    });
    if (error) {
      console.warn("[pipeline] funnel_events insert failed", {
        event_name: event.event_name,
        order_id:   event.order_id,
        error:      error.message,
      });
    }
  } catch (err) {
    console.warn("[pipeline] funnel_events unexpected error", {
      event_name: event.event_name,
      order_id:   event.order_id,
      error:      err,
    });
  }
}

export async function ejecutarPipelinePostCobro(
  supabase: SupabaseClient,
  env: PipelineEnv,
  params: PipelinePostCobroParams,
): Promise<void> {
  const {
    ordenId, clienteId, externalReference, funnelSessionId,
    monto, moneda, analyticsEvent, analyticsMetadata,
    mpPaymentId, ahora,
  } = params;

  // 1. Transición de estado → pago_confirmado
  await supabase
    .from("tarot_ordenes")
    .update({ estado: "pago_confirmado", updated_at: ahora })
    .eq("id", ordenId);

  // 1.5. Registro administrativo interno de la venta — awaited (no
  // fire-and-forget) porque es barato y queremos que exista apenas termine
  // el pipeline, pero internamente nunca lanza ni bloquea nada más abajo.
  await crearRegistroFacturacion(supabase, ordenId);

  // 2. Fetch cliente para la alerta
  const { data: cliente } = await supabase
    .from("tarot_clientes")
    .select("nombre_completo")
    .eq("id", clienteId)
    .maybeSingle();

  // 3. Alerta nueva_venta (fire-and-forget — nunca bloquea el pipeline)
  // mpPaymentId === null es la señal ya existente de "cobro manual, no
  // Mercado Pago" (ver comentario en PipelinePostCobroParams) — se reusa acá
  // para que la alerta no confunda un cobro manual de prueba/sandbox con una
  // venta real (ver auditoría "Juan Felipe González", 2026-08-28).
  dispararAlerta(supabase, "nueva_venta", {
    ordenId,
    ordenRef:      externalReference ?? undefined,
    clienteNombre: cliente?.nombre_completo ?? "—",
    importe:       String(monto ?? "—"),
    moneda:        moneda ?? "UYU",
    fecha:         ahora,
    esCobroManual: mpPaymentId === null,
  }).catch(() => {});

  // 4. Analytics funnel_events
  await logFunnelEvent(supabase, {
    order_id:   ordenId,
    session_id: funnelSessionId,
    event_name: analyticsEvent,
    value:      monto,
    currency:   moneda ?? "UYU",
    metadata:   analyticsMetadata,
  });

  // 5. Fire-and-forget: generar lectura
  fetch(`${env.supabaseUrl}/functions/v1/ef_tarot_generar_lectura`, {
    method: "POST",
    headers: {
      "Content-Type":   "application/json",
      Authorization:    `Bearer ${env.serviceRoleKey}`,
      "x-internal-key": env.internalKey,
    },
    body: JSON.stringify({ orden_id: ordenId }),
  }).catch((err: unknown) => {
    console.warn(`[${env.funcionOrigen}] lectura_dispatch_error`, { error: String(err) });
  });

  // 6. Fire-and-forget: aplicar código de descuento si hay uno reservado
  const { data: usoReservado } = await supabase
    .from("tarot_codigos_descuento_usos")
    .select("id")
    .eq("orden_id", ordenId)
    .eq("estado_uso", "reservado")
    .maybeSingle();

  if (usoReservado?.id) {
    fetch(`${env.supabaseUrl}/functions/v1/ef_tarot_aplicar_codigo`, {
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        Authorization:    `Bearer ${env.serviceRoleKey}`,
        "x-internal-key": env.internalKey,
      },
      body: JSON.stringify({ uso_id: usoReservado.id, mp_payment_id: mpPaymentId }),
    }).catch((err: unknown) => {
      console.warn(`[${env.funcionOrigen}] aplicar_codigo_dispatch_error`, { error: String(err) });
    });
  }
}
