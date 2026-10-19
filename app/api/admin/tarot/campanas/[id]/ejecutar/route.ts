import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { ejecutarAhora } from "@/lib/adminCampanas";

export const dynamic = "force-dynamic";

// "Ejecutar ahora": corre el motor para ESTA campaña (solo hace algo si está
// activa; respeta modo de envío, ventana horaria y límite diario).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const r = await ejecutarAhora(params.id);
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
