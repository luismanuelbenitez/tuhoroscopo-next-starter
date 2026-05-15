import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type RawLog = {
  id?: number;
  nombre_funcion?: string | null;
  fecha_ejecucion?: string | null;
  resultado?: string | null;
  detalle?: Record<string, unknown> | null;
  exito?: boolean | null;
  creado_por?: string | null;
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
  const efBody: Record<string, unknown> = { log: false };

  const nombreFuncion = searchParams.get("nombre_funcion")?.trim();
  if (nombreFuncion) efBody.nombre_funcion = nombreFuncion;

  const resultado = searchParams.get("resultado")?.trim();
  if (resultado) efBody.resultado = resultado;

  const buscar = searchParams.get("buscar")?.trim();
  if (buscar) efBody.buscar = buscar;

  if (searchParams.get("solo_errores") === "true") efBody.solo_errores = true;
  if (searchParams.get("solo_exitos") === "true") efBody.solo_exitos = true;

  const fechaDesde = searchParams.get("fecha_desde")?.trim();
  if (fechaDesde) efBody.fecha_desde = fechaDesde;

  const fechaHasta = searchParams.get("fecha_hasta")?.trim();
  if (fechaHasta) efBody.fecha_hasta = fechaHasta;

  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  efBody.limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;

  const offsetRaw = parseInt(searchParams.get("offset") ?? "0", 10);
  efBody.offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const efUrl = `${supabaseUrl}/functions/v1/ef_admin_listar_logs`;

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

  // log_funciones contains only system/operational data — no user PII.
  // Pass all fields through. detalle is JSONB from internal function calls.
  const logs = Array.isArray(data.logs)
    ? (data.logs as RawLog[]).map((l) => ({
        id: l.id ?? 0,
        nombre_funcion: l.nombre_funcion ?? "",
        fecha_ejecucion: l.fecha_ejecucion ?? null,
        resultado: l.resultado ?? "",
        detalle: l.detalle ?? null,
        exito: l.exito ?? null,
        creado_por: l.creado_por ?? null,
      }))
    : [];

  return NextResponse.json({
    ok: data.ok ?? false,
    healthy: data.healthy ?? true,
    paginacion: data.paginacion ?? null,
    conteos_pagina: data.conteos_pagina ?? {},
    logs,
    warnings: data.warnings ?? [],
  });
}
