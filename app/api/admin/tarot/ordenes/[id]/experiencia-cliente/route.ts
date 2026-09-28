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

async function proxy(
  accion: string, ordenId: string, operador: string,
  env: { supabaseUrl: string; internalKey: string; serviceRoleKey: string },
  extra: Record<string, unknown> = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${env.supabaseUrl}/functions/v1/ef_tarot_admin_orden_experiencia`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "x-internal-key": env.internalKey,
    },
    body: JSON.stringify({ orden_id: ordenId, accion, operador, ...extra }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ ok: false, motivo: "respuesta_invalida" }));
  return { status: res.status, data };
}

// Audio narrado del Resumen (TTS OpenAI, feature opcional — ver
// docs/product/DECISIONS.md). Consultado directo por REST (no vía Edge
// Function) a propósito: ef_tarot_admin_orden_experiencia arrastra un
// import pesado (~300KB, el fondo horneado del cabezal de WhatsApp) que
// no vale la pena redesplegar por esta lectura simple. Nunca genera
// nada, solo lee estado y firma una URL si ya está listo.
async function leerAudioEstado(
  ordenId: string,
  env: { supabaseUrl: string; serviceRoleKey: string },
): Promise<{ estado: string; voz: string | null; signedUrl: string | null }> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.serviceRoleKey}`,
    apikey: env.serviceRoleKey,
  };
  const res = await fetch(
    `${env.supabaseUrl}/rest/v1/tarot_lecturas?orden_id=eq.${ordenId}&es_vigente=eq.true&select=audio_resumen_estado,audio_resumen_storage_path,audio_resumen_voz`,
    { headers, cache: "no-store" },
  );
  if (!res.ok) return { estado: "no_generado", voz: null, signedUrl: null };

  const rows = await res.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  const estado = row?.audio_resumen_estado ?? "no_generado";
  const voz = row?.audio_resumen_voz ?? null;
  const path = row?.audio_resumen_storage_path as string | undefined;

  if (estado !== "listo" || !path) return { estado, voz, signedUrl: null };

  const signRes = await fetch(`${env.supabaseUrl}/storage/v1/object/sign/tarot-assets/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ expiresIn: 24 * 3600 }),
  });
  if (!signRes.ok) return { estado, voz, signedUrl: null };
  const signData = await signRes.json().catch(() => null);
  const signedUrl = signData?.signedURL ? `${env.supabaseUrl}/storage/v1${signData.signedURL}` : null;
  return { estado, voz, signedUrl };
}

// Estado actual del acceso web (creado/vence/estado) — se llama al abrir el detalle.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnvOrError();
  if (env instanceof NextResponse) return env;

  try {
    const { status, data } = await proxy("estado", params.id, session.admin?.usuario ?? "admin", env);
    if (data.ok) {
      data.audio = await leerAudioEstado(params.id, env);
    }
    return NextResponse.json(data, { status });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

// Acciones: generar_acceso | ver_imagen | regenerar_imagen | preview_email
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
  if (!["generar_acceso", "ver_imagen", "regenerar_imagen", "preview_email"].includes(accion)) {
    return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
  }

  // preview_email admite un token opcional (ya generado en esta sesión por
  // el propio admin vía "generar_acceso") para mostrar links funcionales —
  // nunca se crea un acceso nuevo acá.
  const extra = accion === "preview_email" && typeof body.token === "string" ? { token: body.token } : {};

  try {
    const { status, data } = await proxy(accion, params.id, session.admin?.usuario ?? "admin", env, extra);
    return NextResponse.json(data, { status });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
