import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

function getEnvOrError(): { supabaseUrl: string; internalKey: string; serviceRoleKey: string } | NextResponse {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "SUPABASE_URL no configurada" }, { status: 500 });
  if (!internalKey)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "TAROT_INTERNAL_KEY no configurada" }, { status: 500 });
  if (!serviceRoleKey)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "SUPABASE_SECRET_KEY no configurada" }, { status: 500 });
  return { supabaseUrl, internalKey, serviceRoleKey };
}

async function callEF(
  efUrl: string,
  internalKey: string,
  serviceRoleKey: string,
  efBody: Record<string, unknown>,
): Promise<Response> {
  return fetch(efUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "x-internal-key": internalKey,
    },
    body: JSON.stringify(efBody),
    cache: "no-store",
  });
}

// vista=ordenes (default) -> UNA fila por orden con WA+Email resumidos, para /admin/tarot/entregas.
// vista=eventos -> feed plano de intentos individuales, para el widget del dashboard.
export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnvOrError();
  if (env instanceof NextResponse) return env;
  const { supabaseUrl, internalKey, serviceRoleKey } = env;

  const { searchParams } = req.nextUrl;
  const vista = searchParams.get("vista") === "eventos" ? "eventos" : "ordenes";
  const efBody: Record<string, unknown> = { vista };

  const orden_id = searchParams.get("orden_id");
  if (orden_id) efBody.orden_id = orden_id;

  const canal = searchParams.get("canal");
  if (canal) efBody.canal = canal;

  if (vista === "eventos") {
    const estado = searchParams.get("estado");
    if (estado) efBody.estado = estado;
  } else {
    const estado_general = searchParams.get("estado_general");
    if (estado_general) efBody.estado_general = estado_general;
  }

  const solo_reenvios = searchParams.get("solo_reenvios");
  if (solo_reenvios === "true") efBody.solo_reenvios = true;

  const fecha_desde = searchParams.get("fecha_desde");
  if (fecha_desde) efBody.fecha_desde = fecha_desde;

  const fecha_hasta = searchParams.get("fecha_hasta");
  if (fecha_hasta) efBody.fecha_hasta = fecha_hasta;

  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  efBody.limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;

  const offsetRaw = parseInt(searchParams.get("offset") ?? "0", 10);
  efBody.offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  let res: Response;
  try {
    res = await callEF(`${supabaseUrl}/functions/v1/ef_tarot_admin_listar_entregas`, internalKey, serviceRoleKey, efBody);
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  if (!res.ok) {
    let efMotivo: string | null = null;
    try { const err = await res.json(); efMotivo = err.motivo ?? err.error ?? null; } catch { /* noop */ }
    return NextResponse.json(
      { ok: false, motivo: "ef_error", detalle: efMotivo ? `EF devolvió: ${efMotivo} (HTTP ${res.status})` : `Error ${res.status}`, efStatus: res.status },
      { status: 502 },
    );
  }

  const data = await res.json();
  return NextResponse.json({
    ok: data.ok ?? false,
    vista: data.vista ?? vista,
    paginacion: data.paginacion ?? null,
    ordenes: data.ordenes ?? [],
    entregas: data.entregas ?? [],
  });
}
