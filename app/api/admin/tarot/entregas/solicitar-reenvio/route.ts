import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

function getEnv(): { supabaseUrl: string; internalKey: string; serviceRoleKey: string } | null {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !internalKey || !serviceRoleKey) return null;
  return { supabaseUrl, internalKey, serviceRoleKey };
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error", detalle: "Variables de entorno faltantes" }, { status: 500 });
  const { supabaseUrl, internalKey, serviceRoleKey } = env;

  let body: { orden_id?: string; canal?: string; motivo?: string; motivo_detalle?: string } = {};
  try { body = await req.json(); } catch { /* body vacío */ }

  const { orden_id, canal, motivo, motivo_detalle } = body;
  if (!orden_id || !canal || !motivo) {
    return NextResponse.json({ ok: false, motivo_error: "orden_id_canal_y_motivo_requeridos" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/ef_tarot_solicitar_reenvio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify({
        orden_id, canal, motivo, motivo_detalle,
        solicitado_por: session.admin?.usuario ?? "admin",
      }),
      cache: "no-store",
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
