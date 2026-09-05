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

async function callEF(env: { supabaseUrl: string; internalKey: string; serviceRoleKey: string }, body: Record<string, unknown>) {
  return fetch(`${env.supabaseUrl}/functions/v1/ef_tarot_admin_whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "x-internal-key": env.internalKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

// Detalle de una conversación: mensajes + cliente/orden asociados + envíos WhatsApp reales de la orden.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnvOrError();
  if (env instanceof NextResponse) return env;

  let res: Response;
  try {
    res = await callEF(env, { accion: "detalle", conversacion_id: params.id });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

// Acciones: marcar_leido | marcar_no_leido | responder | reintentar
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
  if (!["marcar_leido", "marcar_no_leido", "responder", "reintentar"].includes(accion)) {
    return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
  }

  // "responder" admite texto; "reintentar" admite mensaje_id — el resto de
  // los campos del body del cliente se ignoran (nunca se reenvía un
  // teléfono arbitrario, eso lo resuelve la EF desde la conversación).
  const extra: Record<string, unknown> = {};
  if (accion === "responder" && typeof body.texto === "string") extra.texto = body.texto;
  if (accion === "reintentar" && typeof body.mensaje_id === "string") extra.mensaje_id = body.mensaje_id;

  let res: Response;
  try {
    res = await callEF(env, { accion, conversacion_id: params.id, ...extra });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
