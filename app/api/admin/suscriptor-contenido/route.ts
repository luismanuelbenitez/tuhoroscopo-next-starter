import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

// Generates today's premium content for a specific subscriber via
// ef_generar_contenido_premium_on_demand. The EF is fire-and-forget
// (no await) because IA generation can take 5-15s.
export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "body_invalido" }, { status: 400 });
  }

  const idRaw = body.id_suscriptor;
  const idNum =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string"
      ? parseInt(idRaw, 10)
      : NaN;

  if (!Number.isFinite(idNum) || !Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json(
      { ok: false, motivo: "id_suscriptor_invalido" },
      { status: 400 },
    );
  }

  const efUrl = `${supabaseUrl}/functions/v1/ef_generar_contenido_premium_on_demand`;

  // Fire-and-forget — IA generation takes 5-15s; admin gets instant feedback
  fetch(efUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ id_suscriptor: idNum }),
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    id_suscriptor: idNum,
    mensaje:
      "Generación de contenido iniciada. Puede tomar 10-20 segundos. Refresca el detalle del suscriptor para verificar.",
  });
}
