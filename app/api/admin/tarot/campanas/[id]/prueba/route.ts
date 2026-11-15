import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { accionMotor } from "@/lib/adminCampanas";

export const dynamic = "force-dynamic";

// Prueba: manda la plantilla real SOLO al número de prueba de campañas
// (tarot_configuracion.campanas_telefono_prueba). Nunca a clientes.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const r = await accionMotor(params.id, "prueba");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
