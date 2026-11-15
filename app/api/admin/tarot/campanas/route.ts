import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { db, listarCampanas, crearCampana, codigosDisponibles } from "@/lib/adminCampanas";

export const dynamic = "force-dynamic";

// Campañas (2026-10-19): listado con métricas, elegibles y costos.
// 2026-11-14: también los cupones disponibles para una campaña nueva.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const [campanas, codigos] = await Promise.all([listarCampanas(supabase), codigosDisponibles(supabase)]);
    return NextResponse.json({ ok: true, campanas, codigos });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Nueva campaña manual (feedback o cupón). Nace en borrador: no envía nada.
export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await crearCampana(supabase, body, "admin_panel");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
