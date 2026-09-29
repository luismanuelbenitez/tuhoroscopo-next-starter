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
interface AudioEstadoResp {
  estado: string;
  voz: string | null;
  modelo: string | null;
  caracteres: number | null;
  intentos: number;
  generado_at: string | null;
  error: string | null;
  costo_usd_estimado: number | null;
  signedUrl: string | null;
}

// Costo estimado (2026-09-29): OpenAI no devuelve un conteo de
// tokens/costo verificable en la respuesta de /v1/audio/speech (a
// diferencia de chat completions) — en vez de inventar un número, se
// calcula a partir de una tasa cargada manualmente por el usuario en
// tarot_configuracion (tts_costo_por_1000_caracteres_usd, mismo patrón
// que tipo_cambio_usd_uyu). Sin esa tasa, se devuelve null y el
// frontend muestra "No disponible" — nunca un costo no verificado.
async function leerTasaCostoAudio(
  env: { supabaseUrl: string; serviceRoleKey: string },
): Promise<number | null> {
  const res = await fetch(
    `${env.supabaseUrl}/rest/v1/tarot_configuracion?clave=eq.tts_costo_por_1000_caracteres_usd&select=valor`,
    { headers: { Authorization: `Bearer ${env.serviceRoleKey}`, apikey: env.serviceRoleKey }, cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  const valor = Number(rows?.[0]?.valor);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

async function leerAudioEstado(
  ordenId: string,
  env: { supabaseUrl: string; serviceRoleKey: string },
): Promise<AudioEstadoResp> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.serviceRoleKey}`,
    apikey: env.serviceRoleKey,
  };
  const vacio: AudioEstadoResp = {
    estado: "no_generado", voz: null, modelo: null, caracteres: null,
    intentos: 0, generado_at: null, error: null, costo_usd_estimado: null, signedUrl: null,
  };

  const res = await fetch(
    `${env.supabaseUrl}/rest/v1/tarot_lecturas?orden_id=eq.${ordenId}&es_vigente=eq.true&select=audio_resumen_estado,audio_resumen_storage_path,audio_resumen_voz,audio_resumen_modelo,audio_resumen_caracteres,audio_resumen_intentos,audio_resumen_generado_at,audio_resumen_error`,
    { headers, cache: "no-store" },
  );
  if (!res.ok) return vacio;

  const rows = await res.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return vacio;

  const caracteres = (row.audio_resumen_caracteres as number | null) ?? null;
  const tasa = caracteres ? await leerTasaCostoAudio(env) : null;
  const costoUsdEstimado = caracteres && tasa ? Number(((caracteres / 1000) * tasa).toFixed(6)) : null;

  const base: AudioEstadoResp = {
    estado: row.audio_resumen_estado ?? "no_generado",
    voz: row.audio_resumen_voz ?? null,
    modelo: row.audio_resumen_modelo ?? null,
    caracteres,
    intentos: (row.audio_resumen_intentos as number | null) ?? 0,
    generado_at: row.audio_resumen_generado_at ?? null,
    error: row.audio_resumen_error ?? null,
    costo_usd_estimado: costoUsdEstimado,
    signedUrl: null,
  };

  const path = row.audio_resumen_storage_path as string | undefined;
  if (base.estado !== "listo" || !path) return base;

  const signRes = await fetch(`${env.supabaseUrl}/storage/v1/object/sign/tarot-assets/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ expiresIn: 24 * 3600 }),
  });
  if (!signRes.ok) return base;
  const signData = await signRes.json().catch(() => null);
  base.signedUrl = signData?.signedURL ? `${env.supabaseUrl}/storage/v1${signData.signedURL}` : null;
  return base;
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
