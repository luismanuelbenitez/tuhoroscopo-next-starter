import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

// ============================================================================
// /api/admin/tarot/clientes-unicos
//
// BFF puro hacia ef_tarot_admin_clientes_unicos (Regla 2 de
// docs/ENGINEERING_RULES.md — toda la lógica de agrupación de identidad
// vive en la Edge Function, esta ruta solo reenvía y da forma a la
// respuesta). Ver docs/product/DECISIONS.md 2026-08-22, sprint
// "Módulo Clientes V1".
// ============================================================================

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

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const env = getEnvOrError();
  if (env instanceof NextResponse) return env;
  const { supabaseUrl, internalKey, serviceRoleKey } = env;

  const { searchParams } = req.nextUrl;
  const vista = searchParams.get("vista") ?? "resumen";
  if (!["resumen", "lista", "detalle"].includes(vista)) {
    return NextResponse.json({ ok: false, motivo: "vista_invalida" }, { status: 400 });
  }

  const efBody: Record<string, unknown> = { vista, log: false };

  const periodo = searchParams.get("periodo");
  if (periodo) efBody.periodo = parseInt(periodo, 10);
  const desde = searchParams.get("desde");
  if (desde) efBody.desde = desde;
  const hasta = searchParams.get("hasta");
  if (hasta) efBody.hasta = hasta;

  if (vista === "lista") {
    const buscar = searchParams.get("buscar")?.trim();
    if (buscar) efBody.buscar = buscar;
    const filtro = searchParams.get("filtro");
    if (filtro) efBody.filtro = filtro;
    const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
    efBody.limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;
    const offsetRaw = parseInt(searchParams.get("offset") ?? "0", 10);
    efBody.offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
  }

  if (vista === "detalle") {
    const clienteId = searchParams.get("cliente_id");
    if (!clienteId) {
      return NextResponse.json({ ok: false, motivo: "cliente_id_requerido" }, { status: 400 });
    }
    efBody.cliente_id = clienteId;
  }

  let res: Response;
  try {
    res = await callEF(`${supabaseUrl}/functions/v1/ef_tarot_admin_clientes_unicos`, internalKey, serviceRoleKey, efBody);
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    return NextResponse.json(
      { ok: false, motivo: data?.motivo ?? "ef_error", detalle: data?.error ?? `HTTP ${res.status}`, efStatus: res.status },
      { status: res.status >= 400 && res.status < 600 ? res.status : 502 },
    );
  }

  return NextResponse.json(data);
}
