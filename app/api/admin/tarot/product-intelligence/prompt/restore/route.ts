import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function hdrs(serviceRoleKey: string, extra?: Record<string, string>) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    ...extra,
  };
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }

  const { version_id, motivo } = body as { version_id?: string; motivo?: string };
  if (!version_id) return NextResponse.json({ ok: false, motivo: "version_id_requerido" }, { status: 400 });
  if (!motivo || String(motivo).trim().length === 0) {
    return NextResponse.json({ ok: false, motivo: "motivo_requerido" }, { status: 400 });
  }

  // 1. Fetch current active config
  const rConfig = await fetch(
    `${supabaseUrl}/rest/v1/tarot_producto_config?activa=eq.true` +
      `&select=id,nombre,version,prompt_sistema,prompt_usuario_template,ia_modelo,ia_max_tokens,ia_temperatura,` +
      `max_words_interpretacion,max_words_consejo,max_words_resumen,max_words_mensaje_final,max_words_proximo_paso` +
      `&limit=1`,
    { headers: hdrs(serviceRoleKey), cache: "no-store" },
  );
  const configArr = await rConfig.json().catch(() => []);
  const config = Array.isArray(configArr) && configArr.length > 0 ? configArr[0] : null;
  if (!config) return NextResponse.json({ ok: false, motivo: "config_activa_no_encontrada" }, { status: 500 });

  // 2. Snapshot current active config
  const snapshot = {
    label: `Snapshot antes de restaurar — ${new Date().toLocaleDateString("es-UY")}`,
    prompt_sistema: config.prompt_sistema,
    prompt_usuario_template: config.prompt_usuario_template,
    ia_modelo: config.ia_modelo ?? null,
    ia_max_tokens: config.ia_max_tokens ?? null,
    ia_temperatura: config.ia_temperatura ?? null,
    max_words_interpretacion: config.max_words_interpretacion ?? null,
    max_words_consejo: config.max_words_consejo ?? null,
    max_words_resumen: config.max_words_resumen ?? null,
    max_words_mensaje_final: config.max_words_mensaje_final ?? null,
    max_words_proximo_paso: config.max_words_proximo_paso ?? null,
    estado: "guardada",
    motivo_cambio: `Snapshot automático antes de restaurar versión ${version_id}`,
    producto_config_id: config.id,
  };
  const rSnapshot = await fetch(
    `${supabaseUrl}/rest/v1/tarot_prompt_versiones`,
    {
      method: "POST",
      headers: hdrs(serviceRoleKey, { Prefer: "return=minimal" }),
      body: JSON.stringify(snapshot),
      cache: "no-store",
    },
  );
  if (!rSnapshot.ok) {
    return NextResponse.json({ ok: false, motivo: "snapshot_fallido" }, { status: 500 });
  }

  // 3. Fetch target version
  const rVersion = await fetch(
    `${supabaseUrl}/rest/v1/tarot_prompt_versiones?id=eq.${encodeURIComponent(String(version_id))}` +
      `&select=id,label,prompt_sistema,prompt_usuario_template&limit=1`,
    { headers: hdrs(serviceRoleKey), cache: "no-store" },
  );
  const versionArr = await rVersion.json().catch(() => []);
  const target = Array.isArray(versionArr) && versionArr.length > 0 ? versionArr[0] : null;
  if (!target) return NextResponse.json({ ok: false, motivo: "version_no_encontrada" }, { status: 404 });

  // 4. PATCH active config with target version's prompts
  const patch = {
    prompt_sistema: target.prompt_sistema,
    prompt_usuario_template: target.prompt_usuario_template,
  };
  const rPatch = await fetch(
    `${supabaseUrl}/rest/v1/tarot_producto_config?id=eq.${encodeURIComponent(config.id)}`,
    {
      method: "PATCH",
      headers: hdrs(serviceRoleKey, { Prefer: "return=minimal" }),
      body: JSON.stringify(patch),
      cache: "no-store",
    },
  );
  if (!rPatch.ok) {
    return NextResponse.json({ ok: false, motivo: "patch_fallido" }, { status: 500 });
  }

  // Registrar qué versión quedó activa (trazabilidad)
  await fetch(
    `${supabaseUrl}/rest/v1/tarot_producto_config?id=eq.${encodeURIComponent(config.id)}`,
    {
      method: "PATCH",
      headers: hdrs(serviceRoleKey, { Prefer: "return=minimal" }),
      body: JSON.stringify({ current_prompt_version_id: version_id }),
      cache: "no-store",
    },
  ).catch(() => { /* no fatal — restore ya se aplicó */ });

  return NextResponse.json({ ok: true, restoredLabel: target.label });
}
