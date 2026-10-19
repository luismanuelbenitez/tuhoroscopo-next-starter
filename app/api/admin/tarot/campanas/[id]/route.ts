import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { db, detalleCampana, cambiarEstado, actualizarConfig } from "@/lib/adminCampanas";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const detalle = await detalleCampana(supabase, params.id);
    if (!detalle) return NextResponse.json({ ok: false, motivo: "no_encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true, ...detalle });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// PATCH { accion: "activar" | "pausar" | "finalizar" } o { accion: "config", ...campos }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const operador = "admin_panel";
  const accion = String(body.accion ?? "");
  const r = accion === "config"
    ? await actualizarConfig(supabase, params.id, body, operador)
    : await cambiarEstado(supabase, params.id, accion, operador);
  return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "no_encontrada" ? 404 : 400 });
}
