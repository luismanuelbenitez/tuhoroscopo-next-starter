import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type RawSuscriptor = {
  id?: string;
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
  premium_activo?: boolean;
  whatsapp_confirmado?: boolean;
  estado_mensaje?: string | null;
  creado_en?: string;
  actualizado_en?: string;
  diagnostico_admin?: {
    healthy?: boolean;
    warnings?: string[];
    estado_resumen?: string;
  };
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

  const buscar = searchParams.get("buscar")?.trim();
  if (buscar) efBody.buscar = buscar;

  const estadoSuscripcion = searchParams.get("estado_suscripcion");
  if (estadoSuscripcion) efBody.estado_suscripcion = estadoSuscripcion;

  const estadoMensaje = searchParams.get("estado_mensaje");
  if (estadoMensaje) efBody.estado_mensaje = estadoMensaje;

  const premiumActivoRaw = searchParams.get("premium_activo");
  if (premiumActivoRaw === "true") efBody.premium_activo = true;
  else if (premiumActivoRaw === "false") efBody.premium_activo = false;

  const waConfirmadoRaw = searchParams.get("whatsapp_confirmado");
  if (waConfirmadoRaw === "true") efBody.whatsapp_confirmado = true;
  else if (waConfirmadoRaw === "false") efBody.whatsapp_confirmado = false;

  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  efBody.limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;

  const offsetRaw = parseInt(searchParams.get("offset") ?? "0", 10);
  efBody.offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const efUrl = `${supabaseUrl}/functions/v1/ef_admin_listar_suscriptores`;

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

  // Sanitize: whitelist non-PII operational fields only.
  // Excluded: mp_payer_email, mp_payer_id, preapproval_id, preapproval_init_point,
  //           preapproval_actualizado_en, telefono, creado_por, motivo_baja,
  //           primer_envio_premium_enviado, fecha_primer_envio_premium, bienvenida_enviada
  const suscriptores = Array.isArray(data.suscriptores)
    ? (data.suscriptores as RawSuscriptor[]).map((s) => ({
        id: s.id ?? "",
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
        premium_activo: s.premium_activo ?? false,
        whatsapp_confirmado: s.whatsapp_confirmado ?? false,
        estado_mensaje: s.estado_mensaje ?? null,
        creado_en: s.creado_en ?? "",
        actualizado_en: s.actualizado_en ?? "",
        estado_resumen: s.diagnostico_admin?.estado_resumen ?? "sin_estado",
        warnings: s.diagnostico_admin?.warnings ?? [],
      }))
    : [];

  return NextResponse.json({
    ok: data.ok ?? false,
    paginacion: data.paginacion ?? null,
    suscriptores,
  });
}
