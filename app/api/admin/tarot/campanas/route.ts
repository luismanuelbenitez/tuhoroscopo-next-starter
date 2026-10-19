import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { db, listarCampanas } from "@/lib/adminCampanas";

export const dynamic = "force-dynamic";

// Campañas (2026-10-19): listado con métricas, elegibles y costos.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    return NextResponse.json({ ok: true, campanas: await listarCampanas(supabase) });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
