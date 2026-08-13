import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const { searchParams } = new URL(req.url);
  const filtro = searchParams.get("filtro") ?? "all";
  const limit  = Math.min(Number(searchParams.get("limit") ?? "50"), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);

  const params = new URLSearchParams({
    select: "id,tipo_alerta,severidad,titulo,mensaje,orden_id,metadata,creada_at,leida_at",
    order: "creada_at.desc",
    limit: String(limit),
    offset: String(offset),
  });

  if (filtro === "ventas")    params.set("tipo_alerta", "eq.nueva_venta");
  if (filtro === "warnings")  params.set("severidad",   "eq.warning");
  if (filtro === "errores")   params.set("severidad",   "eq.error");
  if (filtro === "no_leidas") params.set("leida_at",    "is.null");

  const res = await fetch(`${supabaseUrl}/rest/v1/tarot_alertas_eventos?${params}`, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      Prefer: "count=exact",
    },
    cache: "no-store",
  });

  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 502 });

  const eventos = await res.json().catch(() => []);
  const contentRange = res.headers.get("content-range");
  const total = contentRange ? parseInt(contentRange.split("/")[1] ?? "0", 10) : undefined;

  return NextResponse.json({ ok: true, eventos, total });
}
