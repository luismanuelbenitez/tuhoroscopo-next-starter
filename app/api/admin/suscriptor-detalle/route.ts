import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type RawSuscriptor = {
  id?: number;
  nombre?: string;
  email?: string;
  whatsapp?: string;
  signo?: string;
  tipo_suscripcion?: string;
  estado_suscripcion?: string;
  contenido_preferido?: string;
  fecha_alta?: string | null;
  fecha_inicio_premium?: string | null;
  fecha_vencimiento_premium?: string | null;
  fecha_baja?: string | null;
  motivo_baja?: string | null;
  auto_renovacion_activa?: boolean;
  premium_activo?: boolean;
  whatsapp_confirmado?: boolean;
  fecha_confirmacion_whatsapp?: string | null;
  estado_mensaje?: string | null;
  creado_en?: string;
  actualizado_en?: string;
};

type RawSuscripcion = {
  id?: string | number;
  estado?: string;
  provisional?: boolean;
  auto_renovacion_activa?: boolean;
  preapproval_status_mp?: string | null;
  fecha_creacion?: string | null;
  fecha_activacion_provisional?: string | null;
  fecha_activacion_definitiva?: string | null;
  fecha_vencimiento_actual?: string | null;
  fecha_cancelacion?: string | null;
  reason?: string | null;
  currency_id?: string;
  amount?: number;
  frequency?: number;
  frequency_type?: string;
  codigo_descuento?: string | null;
  descuento_estado?: string | null;
  created_at?: string;
  updated_at?: string;
};

type RawMensaje = {
  tipo_mensaje?: string;
  estado?: string;
  canal_envio?: string | null;
  nombre_plantilla?: string | null;
  fecha_enviado?: string | null;
  fecha_creado?: string;
  intentos?: number;
  ultimo_error?: string | null;
  fecha_ultimo_intento?: string | null;
  fecha_envio_programada?: string | null;
};

type RawMensajeFallido = {
  tipo_mensaje?: string;
  estado?: string;
  nombre_plantilla?: string | null;
  intentos?: number;
  ultimo_error?: string | null;
  fecha_creado?: string;
  fecha_ultimo_intento?: string | null;
};

type RawContenido = {
  fecha_creacion?: string;
  generado?: boolean;
  ciclo_semana?: number | null;
  fecha_envio_programada?: string | null;
  fecha_envio_real?: string | null;
  tipo?: string;
  estado_envio?: string;
  ultimo_error?: string | null;
  contenido_preferido?: string | null;
  numero?: number | null;
  origen_generacion?: string | null;
};

type RawPago = {
  fecha_pago?: string | null;
  status?: string;
  amount?: number;
  currency?: string;
  medio_pago?: string | null;
  tipo_pago?: string | null;
  procesado?: boolean;
  created_at?: string;
};

type RawDescuento = {
  codigo?: string;
  estado_uso?: string;
  moneda?: string | null;
  precio_original?: number | null;
  precio_aplicado?: number | null;
  valor_descuento_aplicado?: number | null;
  precio_primera_cuota?: number | null;
  precio_recurrente_normal?: number | null;
  dias_gratis_aplicados?: number | null;
  meses_gratis_aplicados?: number | null;
  fecha_aplicacion?: string | null;
  creado_en?: string;
};

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.WHATSAPP_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", detalle: "SUPABASE_URL no configurada" },
      { status: 500 }
    );
  }
  if (!internalKey) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", detalle: "WHATSAPP_INTERNAL_KEY no configurada" },
      { status: 500 }
    );
  }
  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", detalle: "SUPABASE_SERVICE_ROLE_KEY no configurada" },
      { status: 500 }
    );
  }

  const { searchParams } = req.nextUrl;
  const idRaw = searchParams.get("id");
  const idSuscriptor = idRaw ? parseInt(idRaw, 10) : NaN;

  if (!idRaw || !Number.isFinite(idSuscriptor)) {
    return NextResponse.json(
      { ok: false, motivo: "parametro_invalido", detalle: "id debe ser un entero válido" },
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
        "Authorization": `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify({ id_suscriptor: idSuscriptor, log: false }),
      cache: "no-store",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, motivo: "fetch_error", detalle: msg },
      { status: 502 }
    );
  }

  if (!res.ok) {
    let efMotivo: string | null = null;
    try {
      const errData = await res.json();
      efMotivo = errData.motivo ?? errData.message ?? errData.error ?? null;
    } catch {
      // sin JSON
    }
    return NextResponse.json(
      {
        ok: false,
        motivo: "ef_error",
        detalle: efMotivo
          ? `EF devolvió: ${efMotivo} (HTTP ${res.status})`
          : `Error ${res.status} desde Edge Function`,
        efStatus: res.status,
      },
      { status: 502 }
    );
  }

  const data = await res.json();

  if (!data.encontrado) {
    return NextResponse.json({ ok: true, encontrado: false });
  }

  // Sanitize suscriptor — exclude: telefono, preapproval_id, preapproval_status,
  // preapproval_actualizado_en, preapproval_init_point, mp_payer_email, mp_payer_id,
  // primer_envio_premium_enviado, fecha_primer_envio_premium, bienvenida_enviada, creado_por, origen
  const s = (data.suscriptor ?? {}) as RawSuscriptor;
  const suscriptor = {
    id: s.id ?? 0,
    nombre: s.nombre ?? "",
    email: s.email ?? "",
    whatsapp: s.whatsapp ?? "",
    signo: s.signo ?? "",
    tipo_suscripcion: s.tipo_suscripcion ?? "",
    estado_suscripcion: s.estado_suscripcion ?? "",
    contenido_preferido: s.contenido_preferido ?? "",
    fecha_alta: s.fecha_alta ?? null,
    fecha_inicio_premium: s.fecha_inicio_premium ?? null,
    fecha_vencimiento_premium: s.fecha_vencimiento_premium ?? null,
    fecha_baja: s.fecha_baja ?? null,
    motivo_baja: s.motivo_baja ?? null,
    auto_renovacion_activa: s.auto_renovacion_activa ?? false,
    premium_activo: s.premium_activo ?? false,
    whatsapp_confirmado: s.whatsapp_confirmado ?? false,
    fecha_confirmacion_whatsapp: s.fecha_confirmacion_whatsapp ?? null,
    estado_mensaje: s.estado_mensaje ?? null,
    creado_en: s.creado_en ?? "",
    actualizado_en: s.actualizado_en ?? "",
  };

  // Sanitize suscripcion_actual — exclude: suscriptor_id, provider, preapproval_id,
  // external_reference, payer_email, payer_id, init_point, sandbox_init_point, back_url,
  // codigo_descuento_id, descuento_metadata
  const sa = data.suscripcion_actual as RawSuscripcion | null;
  const suscripcion_actual = sa
    ? {
        id: sa.id ?? null,
        estado: sa.estado ?? "",
        provisional: sa.provisional ?? false,
        auto_renovacion_activa: sa.auto_renovacion_activa ?? false,
        preapproval_status_mp: sa.preapproval_status_mp ?? null,
        fecha_creacion: sa.fecha_creacion ?? null,
        fecha_activacion_provisional: sa.fecha_activacion_provisional ?? null,
        fecha_activacion_definitiva: sa.fecha_activacion_definitiva ?? null,
        fecha_vencimiento_actual: sa.fecha_vencimiento_actual ?? null,
        fecha_cancelacion: sa.fecha_cancelacion ?? null,
        reason: sa.reason ?? null,
        currency_id: sa.currency_id ?? "",
        amount: sa.amount ?? 0,
        frequency: sa.frequency ?? 0,
        frequency_type: sa.frequency_type ?? "",
        codigo_descuento: sa.codigo_descuento ?? null,
        descuento_estado: sa.descuento_estado ?? null,
        created_at: sa.created_at ?? "",
        updated_at: sa.updated_at ?? "",
      }
    : null;

  // Sanitize ultimos_mensajes — exclude: id, whatsapp_destino, id_contenido,
  // resultado_envio, mensaje_id_whatsapp, reintentar_despues, fecha_delivered, fecha_read, fecha_hora
  const ultimos_mensajes = Array.isArray(data.ultimos_mensajes)
    ? (data.ultimos_mensajes as RawMensaje[]).map((m) => ({
        tipo_mensaje: m.tipo_mensaje ?? "",
        estado: m.estado ?? "",
        canal_envio: m.canal_envio ?? null,
        nombre_plantilla: m.nombre_plantilla ?? null,
        fecha_enviado: m.fecha_enviado ?? null,
        fecha_creado: m.fecha_creado ?? "",
        intentos: m.intentos ?? 0,
        ultimo_error: m.ultimo_error ?? null,
        fecha_ultimo_intento: m.fecha_ultimo_intento ?? null,
        fecha_envio_programada: m.fecha_envio_programada ?? null,
      }))
    : [];

  // Sanitize mensajes_fallidos — exclude: id
  const mensajes_fallidos = Array.isArray(data.mensajes_fallidos)
    ? (data.mensajes_fallidos as RawMensajeFallido[]).map((m) => ({
        tipo_mensaje: m.tipo_mensaje ?? "",
        estado: m.estado ?? "",
        nombre_plantilla: m.nombre_plantilla ?? null,
        intentos: m.intentos ?? 0,
        ultimo_error: m.ultimo_error ?? null,
        fecha_creado: m.fecha_creado ?? "",
        fecha_ultimo_intento: m.fecha_ultimo_intento ?? null,
      }))
    : [];

  // Sanitize contenido_premium_reciente — exclude: id, id_suscriptor, generado_por,
  // resultado, mensaje_id_whatsapp, canal, reintentar_despues, color, emocion_dominante, meta_generacion
  const contenido_premium_reciente = Array.isArray(data.contenido_premium_reciente)
    ? (data.contenido_premium_reciente as RawContenido[]).map((c) => ({
        fecha_creacion: c.fecha_creacion ?? "",
        generado: c.generado ?? false,
        ciclo_semana: c.ciclo_semana ?? null,
        fecha_envio_programada: c.fecha_envio_programada ?? null,
        fecha_envio_real: c.fecha_envio_real ?? null,
        tipo: c.tipo ?? "",
        estado_envio: c.estado_envio ?? "",
        ultimo_error: c.ultimo_error ?? null,
        contenido_preferido: c.contenido_preferido ?? null,
        numero: c.numero ?? null,
        origen_generacion: c.origen_generacion ?? null,
      }))
    : [];

  // Sanitize pagos_recientes — exclude: id_pago, mp_payment_id, provider_event_id,
  // suscriptor_id, preapproval_id, provider_payment_id
  const pagos_recientes = Array.isArray(data.pagos_recientes)
    ? (data.pagos_recientes as RawPago[]).map((p) => ({
        fecha_pago: p.fecha_pago ?? null,
        status: p.status ?? "",
        amount: p.amount ?? 0,
        currency: p.currency ?? "",
        medio_pago: p.medio_pago ?? null,
        tipo_pago: p.tipo_pago ?? null,
        procesado: p.procesado ?? false,
        created_at: p.created_at ?? "",
      }))
    : [];

  // Sanitize descuentos_usados — exclude: id, preapproval_id, payment_id, creado_por
  const descuentos_usados = Array.isArray(data.descuentos_usados)
    ? (data.descuentos_usados as RawDescuento[]).map((d) => ({
        codigo: d.codigo ?? "",
        estado_uso: d.estado_uso ?? "",
        moneda: d.moneda ?? null,
        precio_original: d.precio_original ?? null,
        precio_aplicado: d.precio_aplicado ?? null,
        valor_descuento_aplicado: d.valor_descuento_aplicado ?? null,
        precio_primera_cuota: d.precio_primera_cuota ?? null,
        precio_recurrente_normal: d.precio_recurrente_normal ?? null,
        dias_gratis_aplicados: d.dias_gratis_aplicados ?? null,
        meses_gratis_aplicados: d.meses_gratis_aplicados ?? null,
        fecha_aplicacion: d.fecha_aplicacion ?? null,
        creado_en: d.creado_en ?? "",
      }))
    : [];

  return NextResponse.json({
    ok: data.ok ?? false,
    healthy: data.healthy ?? false,
    encontrado: true,
    criterio_busqueda: data.criterio_busqueda ?? null,
    diagnostico: data.diagnostico ?? null,
    warnings: data.warnings ?? [],
    suscriptor,
    suscripcion_actual,
    ultimos_mensajes,
    mensajes_fallidos,
    contenido_premium_reciente,
    pagos_recientes,
    descuentos_usados,
  });
}
