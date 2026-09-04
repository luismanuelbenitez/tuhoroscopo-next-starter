import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnvOrError(): { supabaseUrl: string; internalKey: string; serviceRoleKey: string } | NextResponse {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !internalKey || !serviceRoleKey)
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  return { supabaseUrl, internalKey, serviceRoleKey };
}

async function proxy(accion: string, ordenId: string, operador: string, env: { supabaseUrl: string; internalKey: string; serviceRoleKey: string }) {
  const res = await fetch(`${env.supabaseUrl}/functions/v1/ef_tarot_admin_orden_experiencia`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "x-internal-key": env.internalKey,
    },
    body: JSON.stringify({ orden_id: ordenId, accion, operador }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ ok: false, motivo: "respuesta_invalida" }));
  return NextResponse.json(data, { status: res.status });
}

// Estado actual del acceso web (creado/vence/estado) — se llama al abrir el detalle.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnvOrError();
  if (env instanceof NextResponse) return env;

  try {
    return await proxy("estado", params.id, session.admin?.usuario ?? "admin", env);
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

// Acciones: generar_acceso | ver_imagen | regenerar_imagen
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnvOrError();
  if (env instanceof NextResponse) return env;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "json_invalido" }, { status: 400 });
  }

  const accion = typeof body.accion === "string" ? body.accion : "";
  if (!["generar_acceso", "ver_imagen", "regenerar_imagen"].includes(accion)) {
    return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
  }

  try {
    return await proxy(accion, params.id, session.admin?.usuario ?? "admin", env);
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
