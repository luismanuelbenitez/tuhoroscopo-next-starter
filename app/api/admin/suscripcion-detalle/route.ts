import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

// ---------------------------------------------------------------------------
// Cross-table conciliation alerts
// Computed server-side from the ef_admin_ver_estado_suscriptor response.
// ---------------------------------------------------------------------------
function calcularAlertasConciliacion(
  suscriptor: Record<string, unknown>,
  suscripcionActual: Record<string, unknown> | null,
  pagosRecientes: Record<string, unknown>[]
): Array<{ codigo: string; descripcion: string; nivel: "error" | "warning" | "info" }> {
  const alertas: Array<{ codigo: string; descripcion: string; nivel: "error" | "warning" | "info" }> = [];
  const now = new Date();
  const hace7dias = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const premiumActivo = suscriptor.premium_activo === true;
  const whatsappConfirmado = suscriptor.whatsapp_confirmado === true;
  const fechaVencPerfil = suscriptor.fecha_vencimiento_premium as string | null;

  const estadoSusc = suscripcionActual?.estado as string | null;
  const mpStatus = suscripcionActual?.preapproval_status_mp as string | null;
  const fechaVencActual = suscripcionActual?.fecha_vencimiento_actual as string | null;
  const descuentoEstado = suscripcionActual?.descuento_estado as string | null;

  const suscripcionActiva =
    estadoSusc != null && ["activa", "activa_provisional"].includes(estadoSusc);

  // 1. Pago aprobado reciente pero premium no activo
  const pagoAprobadoReciente = pagosRecientes.some((p) => {
    const status = p.status as string;
    const fecha = (p.created_at ?? p.fecha_pago) as string | null;
    return status === "approved" && fecha != null && new Date(fecha) > hace7dias;
  });
  if (pagoAprobadoReciente && !premiumActivo) {
    alertas.push({
      codigo: "pago_aprobado_sin_premium",
      descripcion:
        "Hay un pago aprobado en los últimos 7 días pero el suscriptor no tiene premium activo.",
      nivel: "error",
    });
  }

  // 2. Premium activo pero suscripción no activa
  if (premiumActivo && suscripcionActual != null && !suscripcionActiva) {
    alertas.push({
      codigo: "premium_activo_sin_suscripcion_activa",
      descripcion: `El suscriptor tiene premium activo pero la suscripción está en estado '${estadoSusc}'.`,
      nivel: "error",
    });
  }

  // 3. Suscripción MP authorized pero estado local inconsistente
  if (mpStatus === "authorized" && suscripcionActual != null && !suscripcionActiva) {
    alertas.push({
      codigo: "mp_authorized_local_inconsistente",
      descripcion: `El status MP es 'authorized' pero el estado local de suscripción es '${estadoSusc}'.`,
      nivel: "error",
    });
  }

  // 4. Suscripción vencida pero premium_activo = true
  if (fechaVencActual != null && new Date(fechaVencActual) < now && premiumActivo) {
    alertas.push({
      codigo: "suscripcion_vencida_premium_activo",
      descripcion:
        "La fecha de vencimiento de la suscripción ya pasó pero el suscriptor todavía tiene premium activo.",
      nivel: "warning",
    });
  }

  // 5. Premium activo sin fecha_vencimiento_premium en perfil suscriptor
  if (premiumActivo && !fechaVencPerfil) {
    alertas.push({
      codigo: "premium_activo_sin_fecha_vencimiento",
      descripcion:
        "El suscriptor tiene premium activo pero no tiene fecha de vencimiento registrada en su perfil.",
      nivel: "warning",
    });
  }

  // 6. Descuento validado o pendiente pero no aplicado
  if (descuentoEstado != null && ["validado", "pendiente_aplicacion"].includes(descuentoEstado)) {
    alertas.push({
      codigo: "descuento_pendiente_aplicacion",
      descripcion: `El descuento tiene estado '${descuentoEstado}' y todavía no fue aplicado.`,
      nivel: "warning",
    });
  }

  // 7. Descuento fallido
  if (descuentoEstado === "fallido") {
    alertas.push({
      codigo: "descuento_fallido",
      descripcion: "El descuento asociado a la suscripción tiene estado 'fallido'.",
      nivel: "warning",
    });
  }

  // 8. Preapproval status problemático
  if (mpStatus != null && ["cancelled", "expired", "paused"].includes(mpStatus)) {
    alertas.push({
      codigo: "preapproval_status_problematico",
      descripcion: `El status de Mercado Pago es '${mpStatus}', lo que puede indicar un problema con la suscripción.`,
      nivel: "warning",
    });
  }

  // 9. Pagos rechazados o pendientes recientes
  const rechazados = pagosRecientes.filter((p) =>
    ["rejected", "cancelled"].includes(p.status as string)
  );
  const pendientes = pagosRecientes.filter((p) => p.status === "pending");
  if (rechazados.length > 0) {
    alertas.push({
      codigo: "pagos_rechazados",
      descripcion: `${rechazados.length} pago(s) con estado rechazado/cancelado en historial reciente.`,
      nivel: "warning",
    });
  }
  if (pendientes.length > 0) {
    alertas.push({
      codigo: "pagos_pendientes",
      descripcion: `${pendientes.length} pago(s) con estado 'pending' en historial reciente.`,
      nivel: "info",
    });
  }

  // 10. Suscriptor sin WhatsApp confirmado pero con suscripción activa
  if (suscripcionActiva && !whatsappConfirmado) {
    alertas.push({
      codigo: "suscripcion_activa_sin_wa_confirmado",
      descripcion:
        "La suscripción está activa pero el suscriptor no tiene WhatsApp confirmado.",
      nivel: "warning",
    });
  }

  return alertas;
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.WHATSAPP_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !internalKey || !serviceRoleKey) {
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  }

  const idRaw = req.nextUrl.searchParams.get("id_suscriptor")?.trim();
  const idNum = idRaw ? parseInt(idRaw, 10) : NaN;
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return NextResponse.json(
      { ok: false, motivo: "id_suscriptor_requerido", detalle: "Pasar id_suscriptor como query param" },
      { status: 400 }
    );
  }

  const efUrl = `${supabaseUrl}/functions/v1/ef_admin_ver_estado_suscriptor`;

  let res: Response;
  try {
    res = await fetch(efUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify({ id_suscriptor: idNum, log: false }),
      cache: "no-store",
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, motivo: "ef_error", efStatus: res.status },
      { status: 502 }
    );
  }

  const raw = await res.json();

  if (!raw.encontrado) {
    return NextResponse.json(
      { ok: false, motivo: "suscriptor_no_encontrado" },
      { status: 404 }
    );
  }

  const sus = (raw.suscriptor ?? {}) as Record<string, unknown>;

  // Sanitize suscriptor: keep operational fields, remove PII not needed for ops
  const suscriptor = {
    id: sus.id,
    nombre: sus.nombre,
    // Mask WhatsApp: show only last 4 digits
    whatsapp: sus.whatsapp ? `*****${String(sus.whatsapp).slice(-4)}` : null,
    signo: sus.signo,
    tipo_suscripcion: sus.tipo_suscripcion,
    estado_suscripcion: sus.estado_suscripcion,
    premium_activo: sus.premium_activo ?? false,
    fecha_vencimiento_premium: sus.fecha_vencimiento_premium,
    fecha_inicio_premium: sus.fecha_inicio_premium,
    whatsapp_confirmado: sus.whatsapp_confirmado ?? false,
    fecha_confirmacion_whatsapp: sus.fecha_confirmacion_whatsapp,
    estado_mensaje: sus.estado_mensaje,
    preapproval_id: sus.preapproval_id,
    preapproval_status: sus.preapproval_status,
    auto_renovacion_activa: sus.auto_renovacion_activa,
    bienvenida_enviada: sus.bienvenida_enviada,
    primer_envio_premium_enviado: sus.primer_envio_premium_enviado,
    creado_en: sus.creado_en,
    actualizado_en: sus.actualizado_en,
  };

  // Sanitize pagos: keep operational, remove raw jsonb and link fields
  const pagosRaw = Array.isArray(raw.pagos_recientes)
    ? (raw.pagos_recientes as Record<string, unknown>[])
    : [];
  const pagos_recientes = pagosRaw.map((p) => ({
    id_pago: p.id_pago,
    fecha_pago: p.fecha_pago,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    medio_pago: p.medio_pago,
    tipo_pago: p.tipo_pago,
    preapproval_id: p.preapproval_id,
    procesado: p.procesado,
    created_at: p.created_at,
  }));

  // Sanitize descuentos_usados
  const descRaw = Array.isArray(raw.descuentos_usados)
    ? (raw.descuentos_usados as Record<string, unknown>[])
    : [];
  const descuentos_usados = descRaw.map((d) => ({
    id: d.id,
    codigo: d.codigo,
    estado_uso: d.estado_uso,
    moneda: d.moneda,
    precio_original: d.precio_original,
    precio_aplicado: d.precio_aplicado,
    valor_descuento_aplicado: d.valor_descuento_aplicado,
    dias_gratis_aplicados: d.dias_gratis_aplicados,
    meses_gratis_aplicados: d.meses_gratis_aplicados,
    fecha_aplicacion: d.fecha_aplicacion,
    creado_en: d.creado_en,
  }));

  const suscripcionActual = (raw.suscripcion_actual as Record<string, unknown> | null) ?? null;

  const suscripcion_actual = suscripcionActual
    ? {
        id: suscripcionActual.id,
        estado: suscripcionActual.estado,
        provisional: suscripcionActual.provisional,
        preapproval_status_mp: suscripcionActual.preapproval_status_mp,
        fecha_vencimiento_actual: suscripcionActual.fecha_vencimiento_actual,
        fecha_activacion_definitiva: suscripcionActual.fecha_activacion_definitiva,
        amount: suscripcionActual.amount,
        currency_id: suscripcionActual.currency_id,
        codigo_descuento: suscripcionActual.codigo_descuento,
        descuento_estado: suscripcionActual.descuento_estado,
      }
    : null;

  // Compute cross-table conciliation alerts
  const alertas_conciliacion = calcularAlertasConciliacion(sus, suscripcionActual, pagosRaw);

  return NextResponse.json({
    ok: true,
    suscriptor,
    suscripcion_actual,
    pagos_recientes,
    descuentos_usados,
    diagnostico: raw.diagnostico ?? null,
    alertas_conciliacion,
    warnings: raw.warnings ?? [],
  });
}
