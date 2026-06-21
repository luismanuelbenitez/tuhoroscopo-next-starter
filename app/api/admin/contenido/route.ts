import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type RawDiagnostico = {
  healthy?: boolean;
  warnings?: string[];
  estado_resumen?: string;
  accion_sugerida?: string;
};

type RawContenido = {
  id?: number;
  id_suscriptor?: number | null;
  contenido?: string | null;
  fecha_creacion?: string;
  generado?: boolean;
  generado_por?: string | null;
  resultado?: string | null;
  ciclo_semana?: number | null;
  emocion_dominante?: string | null;
  fecha_envio_programada?: string | null;
  fecha_envio_real?: string | null;
  tipo?: string | null;
  estado_envio?: string | null;
  mensaje_id_whatsapp?: string | null;
  ultimo_error?: string | null;
  canal?: string | null;
  reintentar_despues?: string | null;
  enviado_por?: string | null;
  color?: string | null;
  contenido_preferido?: string | null;
  numero?: number | null;
  origen_generacion?: string | null;
  meta_generacion?: Record<string, unknown> | null;
  tokens_input?: number | null;
  tokens_output?: number | null;
  costo_estimado?: number | null;
  modelo_ia?: string | null;
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

  const estadoEnvio = searchParams.get("estado_envio")?.trim();
  if (estadoEnvio) efBody.estado_envio = estadoEnvio;

  const tipo = searchParams.get("tipo")?.trim();
  if (tipo) efBody.tipo = tipo;

  if (searchParams.get("solo_pendientes") === "true") efBody.solo_pendientes = true;
  if (searchParams.get("solo_con_error") === "true") efBody.solo_con_error = true;

  const fechaDesde = searchParams.get("fecha_desde")?.trim();
  if (fechaDesde) efBody.fecha_desde = fechaDesde;

  const fechaHasta = searchParams.get("fecha_hasta")?.trim();
  if (fechaHasta) efBody.fecha_hasta = fechaHasta;

  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  efBody.limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;

  const offsetRaw = parseInt(searchParams.get("offset") ?? "0", 10);
  efBody.offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const efUrl = `${supabaseUrl}/functions/v1/ef_admin_listar_contenido_premium`;

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

  // No PII fields in contenido_premium — the EF does not join suscriptores.
  // id_suscriptor is just an integer reference. Safe to return all operational fields.
  const contenido = Array.isArray(data.contenido)
    ? (data.contenido as RawContenido[]).map((c) => ({
        id: c.id ?? 0,
        id_suscriptor: c.id_suscriptor ?? null,
        contenido: c.contenido ?? null,
        fecha_creacion: c.fecha_creacion ?? "",
        generado: c.generado ?? false,
        generado_por: c.generado_por ?? null,
        resultado: c.resultado ?? null,
        ciclo_semana: c.ciclo_semana ?? null,
        emocion_dominante: c.emocion_dominante ?? null,
        fecha_envio_programada: c.fecha_envio_programada ?? null,
        fecha_envio_real: c.fecha_envio_real ?? null,
        tipo: c.tipo ?? "",
        estado_envio: c.estado_envio ?? "",
        mensaje_id_whatsapp: c.mensaje_id_whatsapp ?? null,
        ultimo_error: c.ultimo_error ?? null,
        canal: c.canal ?? null,
        reintentar_despues: c.reintentar_despues ?? null,
        enviado_por: c.enviado_por ?? null,
        color: c.color ?? null,
        contenido_preferido: c.contenido_preferido ?? null,
        numero: c.numero ?? null,
        origen_generacion: c.origen_generacion ?? null,
        meta_generacion: c.meta_generacion ?? null,
        tokens_input: c.tokens_input ?? null,
        tokens_output: c.tokens_output ?? null,
        costo_estimado: c.costo_estimado ?? null,
        modelo_ia: c.modelo_ia ?? null,
        diagnostico_admin: c.diagnostico_admin
          ? {
              healthy: c.diagnostico_admin.healthy ?? true,
              warnings: c.diagnostico_admin.warnings ?? [],
              estado_resumen: c.diagnostico_admin.estado_resumen ?? "",
              accion_sugerida: c.diagnostico_admin.accion_sugerida ?? "",
            }
          : null,
      }))
    : [];

  return NextResponse.json({
    ok: data.ok ?? false,
    healthy: data.healthy ?? false,
    paginacion: data.paginacion ?? null,
    conteos_pagina: data.conteos_pagina ?? {},
    contenido,
    warnings: data.warnings ?? [],
  });
}
