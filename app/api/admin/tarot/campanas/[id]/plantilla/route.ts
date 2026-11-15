import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { accionMotor } from "@/lib/adminCampanas";

export const dynamic = "force-dynamic";

// GET: estado de la plantilla de WhatsApp de la campaña en Meta.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  return NextResponse.json(await accionMotor(params.id, "plantilla"));
}

// POST: la manda a aprobación de Meta (no envía mensajes a nadie).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const r = await accionMotor(params.id, "plantilla_crear");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
