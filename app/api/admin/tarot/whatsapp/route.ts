import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnvOrError(): { supabaseUrl: string; internalKey: string; serviceRoleKey: string } | NextResponse {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !internalKey || !serviceRoleKey)
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  return { supabaseUrl, internalKey, serviceRoleKey };
}

async function callEF(env: { supabaseUrl: string; internalKey: string; serviceRoleKey: string }, body: Record<string, unknown>) {
  return fetch(`${env.supabaseUrl}/functions/v1/ef_tarot_admin_whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "x-internal-key": env.internalKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

// ?solo_contador=true -> badge del nav (accion: contador_no_leidos)
// si no -> listado con filtros/búsqueda/paginación (accion: listar)
export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnvOrError();
  if (env instanceof NextResponse) return env;

  const { searchParams } = req.nextUrl;

  if (searchParams.get("solo_contador") === "true") {
    let res: Response;
    try {
      res = await callEF(env, { accion: "contador_no_leidos" });
    } catch (e: unknown) {
      return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }

  const body: Record<string, unknown> = { accion: "listar" };
  const filtro = searchParams.get("filtro");
  if (filtro) body.filtro = filtro;
  const busqueda = searchParams.get("busqueda");
  if (busqueda) body.busqueda = busqueda;
  const limit = searchParams.get("limit");
  if (limit) body.limit = parseInt(limit, 10);
  const offset = searchParams.get("offset");
  if (offset) body.offset = parseInt(offset, 10);

  let res: Response;
  try {
    res = await callEF(env, body);
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
