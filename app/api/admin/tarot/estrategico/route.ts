import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { calcularEstrategico, PERIODOS } from "@/lib/estrategico";

// Dashboard estratégico (2026-10-31). El cálculo vive en lib/estrategico.ts.

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !key) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (q: string) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${q}`, { headers, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  const p = parseInt(req.nextUrl.searchParams.get("periodo") ?? "7", 10);
  const periodo = PERIODOS.has(p) ? p : 7;
  const incluir = req.nextUrl.searchParams.get("incluir") === "1";
  try {
    return NextResponse.json(await calcularEstrategico(get, periodo, incluir));
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
