import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { db, audienciaManual, guardarSeleccion } from "@/lib/adminCampanas";

export const dynamic = "force-dynamic";

// Personas que se pueden elegir para una campaña manual (una por teléfono,
// con al menos una lectura entregada).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    return NextResponse.json({ ok: true, personas: await audienciaManual(supabase, params.id) });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// PUT { telefonos: string[] } → guarda la selección. No envía nada.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { telefonos?: unknown };
  const r = await guardarSeleccion(supabase, params.id, body.telefonos, "admin_panel");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
