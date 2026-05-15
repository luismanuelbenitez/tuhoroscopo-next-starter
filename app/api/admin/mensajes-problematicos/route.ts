import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type RawDiagnostico = {
  reintentable?: boolean;
  accion_sugerida?: string;
  comentario?: string;
};

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
  diagnostico_admin?: RawDiagnostico;
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

  // Translate GET query params → EF POST body
  const efBody: Record<string, unknown> = { log: false };

  const estado = searchParams.get("estado")?.trim();
  if (estado) efBody.estado = estado;

  const tipoMensaje = searchParams.get("tipo_mensaje")?.trim();
  if (tipoMensaje) efBody.tipo_mensaje = tipoMensaje;

  const idSuscriptorRaw = searchParams.get("id_suscriptor");
  if (idSuscriptorRaw) {
    const n = parseInt(idSuscriptorRaw, 10);
    if (Number.isFinite(n)) efBody.id_suscriptor = n;
  }

  const limitRaw = parseInt(searchParams.get("limit") ?? "20", 10);
  efBody.limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 20;

  const offsetRaw = parseInt(searchParams.get("offset") ?? "0", 10);
  efBody.offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const efUrl = `${supabaseUrl}/functions/v1/ef_admin_listar_mensajes_problematicos`;

  let res: Response;
  try {
    res = await fetch(efUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify(efBody),
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

  // Sanitize mensajes — exclude: whatsapp_destino (PII), mensaje_id_whatsapp (internal),
  // resultado_envio (internal WA metadata), fecha_delivered, fecha_read, fecha_hora
  const mensajes = Array.isArray(data.mensajes)
    ? (data.mensajes as RawMensaje[]).map((m) => ({
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
        nombre_plantilla: m.nombre_plantilla ?? null,
        fecha_envio_programada: m.fecha_envio_programada ?? null,
        fecha_ultimo_intento: m.fecha_ultimo_intento ?? null,
        diagnostico_admin: m.diagnostico_admin
          ? {
              reintentable: m.diagnostico_admin.reintentable ?? false,
              accion_sugerida: m.diagnostico_admin.accion_sugerida ?? "",
              comentario: m.diagnostico_admin.comentario ?? "",
            }
          : null,
      }))
    : [];

  return NextResponse.json({
    ok: data.ok ?? false,
    healthy: data.healthy ?? false,
    paginacion: data.paginacion ?? null,
    conteo_resultado: data.conteo_resultado ?? {},
    filtros: data.filtros ?? null,
    mensajes,
    warnings: data.warnings ?? [],
  });
}
