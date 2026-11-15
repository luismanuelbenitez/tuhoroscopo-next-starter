import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { db, disparar } from "@/lib/adminCampanas";

export const dynamic = "force-dynamic";

// Disparo de una campaña manual (clic de Manuel con confirmación). Body:
// { confirmacion: <cantidad de personas que vio en pantalla> }.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { confirmacion?: unknown };
  const r = await disparar(supabase, params.id, body.confirmacion, "admin_panel");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
