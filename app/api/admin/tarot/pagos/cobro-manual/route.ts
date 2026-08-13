import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

const MOTIVOS_VALIDOS = new Set([
  "pago_sandbox_no_procesado",
  "pago_otro_medio",
  "ajuste_administrativo",
  "otro",
]);

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "json_invalido" }, { status: 400 });
  }

  const orden_id   = typeof body.orden_id   === "string" ? body.orden_id.trim()   : "";
  const motivo     = typeof body.motivo     === "string" ? body.motivo.trim()     : "";
  const observacion = typeof body.observacion === "string" ? body.observacion.trim() : null;

  if (!orden_id) {
    return NextResponse.json({ ok: false, motivo: "orden_id_requerido" }, { status: 400 });
  }
  if (!MOTIVOS_VALIDOS.has(motivo)) {
    return NextResponse.json({ ok: false, motivo: "motivo_invalido" }, { status: 400 });
  }

  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  const internalKey    = process.env.TAROT_INTERNAL_KEY;

  if (!supabaseUrl || !serviceRoleKey || !internalKey) {
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  }

  try {
    const efRes = await fetch(`${supabaseUrl}/functions/v1/ef_tarot_confirmar_cobro_manual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify({
        orden_id,
        motivo,
        observacion: observacion || null,
        cobrado_por: session.admin?.usuario ?? "admin",
      }),
    });

    const data = await efRes.json().catch(() => ({ ok: false, motivo: "respuesta_invalida" }));
    return NextResponse.json(data, { status: efRes.status });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, motivo: "ef_no_disponible", detalle: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
