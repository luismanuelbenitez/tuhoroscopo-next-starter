import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const EDGE_BASE          = process.env.NEXT_PUBLIC_EDGE_BASE ?? "";
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY  ?? "";
  const TAROT_INTERNAL_KEY  = process.env.TAROT_INTERNAL_KEY   ?? "";

  if (!EDGE_BASE || !SUPABASE_SECRET_KEY || !TAROT_INTERNAL_KEY) {
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, motivo: "json_invalido" }, { status: 400 });
  }

  try {
    const efRes = await fetch(`${EDGE_BASE}/ef_tarot_laboratorio`, {
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "Authorization":  `Bearer ${SUPABASE_SECRET_KEY}`,
        "x-internal-key": TAROT_INTERNAL_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await efRes.json().catch(() => ({ ok: false, motivo: "respuesta_no_json" }));
    return NextResponse.json(data, { status: efRes.ok ? 200 : efRes.status });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, motivo: "ef_network_error", detalle: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
