import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type RawMensaje = {
  id?: number;
  tipo_mensaje?: string;
  estado?: string;
  id_suscriptor?: number | null;
  id_contenido?: number | null;
  canal_envio?: string | null;
  intentos?: number;
  ultimo_error?: string | null;
  reintentar_despues?: string | null;
  fecha_creado?: string;
  fecha_enviado?: string | null;
  nombre_plantilla?: string | null;
  fecha_envio_programada?: string | null;
  fecha_ultimo_intento?: string | null;
  mensaje_id_whatsapp?: string | null;
  metadata?: Record<string, unknown> | null;
  fecha_hora?: string | null;
  fecha_delivered?: string | null;
  fecha_read?: string | null;
};

type RawSuscriptor = {
  id?: number;
  nombre?: string;
  email?: string;
  signo?: string;
  estado_suscripcion?: string;
  premium_activo?: boolean;
  whatsapp_confirmado?: boolean;
  estado_mensaje?: string | null;
  fecha_inicio_premium?: string | null;
  fecha_vencimiento_premium?: string | null;
  auto_renovacion_activa?: boolean;
};

type RawContenido = {
  id?: number;
  tipo?: string;
  estado_envio?: string;
  fecha_envio_programada?: string | null;
  fecha_envio_real?: string | null;
  generado?: boolean;
  ciclo_semana?: number | null;
  ultimo_error?: string | null;
};

type RawReintento = {
  reintentable?: boolean;
  requiere_forzar?: boolean;
  motivo?: string;
  recomendacion?: string;
};

type RawLog = {
  nombre_funcion?: string;
  fecha_ejecucion?: string;
  resultado?: string;
  exito?: boolean;
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
  const idMensaje = idRaw ? parseInt(idRaw, 10) : NaN;

  if (!idRaw || !Number.isFinite(idMensaje)) {
    return NextResponse.json(
      { ok: false, motivo: "parametro_invalido", detalle: "id debe ser un entero válido" },
      { status: 400 }
    );
  }

  const efUrl = `${supabaseUrl}/functions/v1/ef_admin_ver_mensaje`;

  let res: Response;
  try {
    res = await fetch(efUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify({ id_mensaje: idMensaje, log: false }),
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

  // Sanitize mensaje — exclude: whatsapp_destino (PII phone), resultado_envio (internal WA metadata)
  const m = (data.mensaje ?? {}) as RawMensaje;
  const mensaje = {
    id: m.id ?? 0,
    tipo_mensaje: m.tipo_mensaje ?? "",
    estado: m.estado ?? "",
    id_suscriptor: m.id_suscriptor ?? null,
    id_contenido: m.id_contenido ?? null,
    canal_envio: m.canal_envio ?? null,
    intentos: m.intentos ?? 0,
    ultimo_error: m.ultimo_error ?? null,
    reintentar_despues: m.reintentar_despues ?? null,
    fecha_creado: m.fecha_creado ?? "",
    fecha_enviado: m.fecha_enviado ?? null,
    fecha_delivered: m.fecha_delivered ?? null,
    fecha_read: m.fecha_read ?? null,
    nombre_plantilla: m.nombre_plantilla ?? null,
    fecha_envio_programada: m.fecha_envio_programada ?? null,
    fecha_ultimo_intento: m.fecha_ultimo_intento ?? null,
    mensaje_id_whatsapp: m.mensaje_id_whatsapp ?? null,
    metadata: m.metadata ?? null,
  };

  // Sanitize suscriptor — keep operational context only, exclude PII fields:
  // whatsapp, telefono, email, preapproval_id, preapproval_status, mp_payer_email,
  // primer_envio_premium_enviado, bienvenida_enviada, creado_por
  const rawSus = data.suscriptor as RawSuscriptor | null;
  const suscriptor = rawSus
    ? {
        id: rawSus.id ?? null,
        nombre: rawSus.nombre ?? "",
        signo: rawSus.signo ?? "",
        estado_suscripcion: rawSus.estado_suscripcion ?? "",
        premium_activo: rawSus.premium_activo ?? false,
        whatsapp_confirmado: rawSus.whatsapp_confirmado ?? false,
        estado_mensaje: rawSus.estado_mensaje ?? null,
        fecha_vencimiento_premium: rawSus.fecha_vencimiento_premium ?? null,
        auto_renovacion_activa: rawSus.auto_renovacion_activa ?? false,
      }
    : null;

  // Sanitize contenido_premium — keep status fields, exclude large content blobs:
  // contenido (text), resultado, meta_generacion, mensaje_id_whatsapp, canal, enviado_por, color
  const rawCont = data.contenido_premium as RawContenido | null;
  const contenido_premium = rawCont
    ? {
        id: rawCont.id ?? null,
        tipo: rawCont.tipo ?? "",
        estado_envio: rawCont.estado_envio ?? "",
        fecha_envio_programada: rawCont.fecha_envio_programada ?? null,
        fecha_envio_real: rawCont.fecha_envio_real ?? null,
        generado: rawCont.generado ?? false,
        ciclo_semana: rawCont.ciclo_semana ?? null,
        ultimo_error: rawCont.ultimo_error ?? null,
      }
    : null;

  // Sanitize reintento — no PII, pass through
  const rawRein = data.reintento as RawReintento | null;
  const reintento = rawRein
    ? {
        reintentable: rawRein.reintentable ?? false,
        requiere_forzar: rawRein.requiere_forzar ?? false,
        motivo: rawRein.motivo ?? "",
        recomendacion: rawRein.recomendacion ?? "",
      }
    : null;

  // Sanitize logs_relacionados — exclude detalle (may contain internal data), keep summary fields
  const logs_relacionados = Array.isArray(data.logs_relacionados)
    ? (data.logs_relacionados as RawLog[]).slice(0, 10).map((l) => ({
        nombre_funcion: l.nombre_funcion ?? "",
        fecha_ejecucion: l.fecha_ejecucion ?? "",
        resultado: l.resultado ?? "",
        exito: l.exito ?? false,
      }))
    : [];

  return NextResponse.json({
    ok: data.ok ?? false,
    healthy: data.healthy ?? false,
    encontrado: true,
    id_mensaje: idMensaje,
    mensaje,
    suscriptor,
    contenido_premium,
    reintento,
    logs_relacionados,
    warnings: data.warnings ?? [],
  });
}
