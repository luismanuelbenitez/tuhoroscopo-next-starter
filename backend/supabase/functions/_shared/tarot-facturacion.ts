// ============================================================
// _shared/tarot-facturacion.ts — Registro administrativo interno de ventas
//
// NO es un comprobante fiscal. Es un asiento de control de negocio que se
// puede asociar después a una boleta/factura emitida fuera del sistema.
// Ver docs/modules/facturacion-interna.md.
//
// crearRegistroFacturacion() es llamada por _shared/tarot-pipeline.ts,
// UNA sola vez, justo después de la transición de la orden a
// 'pago_confirmado' — el mismo punto para Mercado Pago (ef_tarot_webhook_mp)
// y cobro manual (ef_tarot_confirmar_cobro_manual). Idempotente por
// constraint de base de datos (tarot_registros_facturacion.orden_id es
// UNIQUE), no por lógica de aplicación: si el webhook de MP llega dos
// veces, o si hay una carrera entre MP y un cobro manual, el segundo
// insert simplemente falla por la constraint y se ignora silenciosamente
// — nunca lanza, nunca bloquea el resto del pipeline (lectura, PDF, etc.).
// ============================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const PRODUCTO_CODIGO = "tarot_one_shot";
const PRODUCTO_NOMBRE = "Lectura de tarot personalizada";

/**
 * Crea el registro de facturación de una orden recién cobrada. Se auto-
 * contiene: solo necesita el orden_id, vuelve a consultar todo lo demás
 * (orden, pago, descuento aplicado) directamente de la base — así el
 * pipeline post-cobro no necesita pasarle datos adicionales y este módulo
 * queda aislado del resto del sistema comercial.
 */
export async function crearRegistroFacturacion(
  supabase: SupabaseClient,
  ordenId: string,
): Promise<void> {
  try {
    const { data: orden } = await supabase
      .from("tarot_ordenes")
      .select("id, cliente_id, precio_cobrado, moneda, tema, nombre_snapshot, email_snapshot, telefono_snapshot")
      .eq("id", ordenId)
      .maybeSingle();

    if (!orden) return; // orden inexistente — no debería pasar acá, pero no es motivo de excepción

    const { data: pago } = await supabase
      .from("tarot_pagos")
      .select("id, mp_payment_id, cobro_manual, cobro_manual_por, cobro_manual_motivo")
      .eq("orden_id", ordenId)
      .maybeSingle();

    // El código de descuento fija precio_original/precio_aplicado/descuento
    // en el momento de la RESERVA (ef_tarot_aplicar_codigo solo consume el
    // cupo más tarde, de forma asíncrona) — por eso se busca por orden_id
    // sin filtrar por estado_uso: el valor comercial ya está fijado apenas
    // se reserva, no hace falta esperar a que se marque "aplicado".
    const { data: usoDescuento } = await supabase
      .from("tarot_codigos_descuento_usos")
      .select("precio_original, precio_aplicado, descuento_aplicado")
      .eq("orden_id", ordenId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const importeBruto = usoDescuento?.precio_original ?? orden.precio_cobrado ?? 0;
    const descuento = usoDescuento?.descuento_aplicado ?? 0;
    const importeNeto = usoDescuento?.precio_aplicado ?? orden.precio_cobrado ?? 0;

    const medioPago = pago?.mp_payment_id ? "mercado_pago" : "manual";
    const proveedorPago = pago?.mp_payment_id ? "mercadopago" : "admin";
    const referenciaPago = pago?.mp_payment_id
      ?? (pago?.cobro_manual_por ? `${pago.cobro_manual_por} (${pago.cobro_manual_motivo ?? "sin motivo"})` : null);

    const datosClienteSnapshot = {
      nombre: orden.nombre_snapshot ?? null,
      email: orden.email_snapshot ?? null,
      telefono: orden.telefono_snapshot ?? null,
    };

    const { error } = await supabase.from("tarot_registros_facturacion").insert({
      orden_id: ordenId,
      cliente_id: orden.cliente_id,
      pago_id: pago?.id ?? null,
      producto_codigo: PRODUCTO_CODIGO,
      producto_nombre_snapshot: PRODUCTO_NOMBRE,
      concepto: PRODUCTO_NOMBRE,
      moneda: orden.moneda ?? "UYU",
      importe_bruto: importeBruto,
      descuento,
      importe_neto: importeNeto,
      medio_pago: medioPago,
      proveedor_pago: proveedorPago,
      referencia_pago: referenciaPago,
      datos_cliente_snapshot: datosClienteSnapshot,
      creado_por: "system",
    });

    // Código 23505 = unique_violation (orden_id ya tiene registro) — la
    // idempotencia esperada, no un error real. Cualquier otro error se
    // loguea pero tampoco se relanza: crear el registro de facturación
    // nunca debe bloquear la generación de la lectura ni el resto del pipeline.
    if (error && error.code !== "23505") {
      console.warn("[tarot-facturacion] crearRegistroFacturacion falló", { ordenId, error: error.message });
    }
  } catch (err) {
    console.warn("[tarot-facturacion] crearRegistroFacturacion excepción", { ordenId, error: String(err) });
  }
}
