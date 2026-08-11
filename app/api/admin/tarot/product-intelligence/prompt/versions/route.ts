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

export async function GET(_req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_prompt_versiones?select=id,label,descripcion,estado,motivo_cambio,benchmark_resultado,benchmark_casos_aprobados,ia_modelo,created_at&order=created_at.desc&limit=50`,
    { headers: hdrs(serviceRoleKey), cache: "no-store" },
  );

  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 502 });
  const versions = await res.json().catch(() => []);

  return NextResponse.json({ ok: true, versions });
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }

  const required = ["prompt_sistema", "prompt_usuario_template", "motivo_cambio", "label"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ ok: false, motivo: `campo_requerido:${field}` }, { status: 400 });
    }
  }

  const insert: Record<string, unknown> = {
    label:                    String(body.label).trim(),
    descripcion:              body.descripcion ? String(body.descripcion).trim() : null,
    prompt_sistema:           String(body.prompt_sistema),
    prompt_usuario_template:  String(body.prompt_usuario_template),
    ia_modelo:                body.ia_modelo ?? null,
    ia_max_tokens:            body.ia_max_tokens ? Number(body.ia_max_tokens) : null,
    ia_temperatura:           body.ia_temperatura ? Number(body.ia_temperatura) : null,
    max_words_interpretacion: body.max_words_interpretacion ? Number(body.max_words_interpretacion) : null,
    max_words_consejo:        body.max_words_consejo ? Number(body.max_words_consejo) : null,
    max_words_resumen:        body.max_words_resumen ? Number(body.max_words_resumen) : null,
    max_words_mensaje_final:  body.max_words_mensaje_final ? Number(body.max_words_mensaje_final) : null,
    max_words_proximo_paso:   body.max_words_proximo_paso ? Number(body.max_words_proximo_paso) : null,
    estado:                   "guardada",
    motivo_cambio:            String(body.motivo_cambio).trim(),
    producto_config_id:       body.producto_config_id ?? null,
  };

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_prompt_versiones`,
    {
      method: "POST",
      headers: hdrs(serviceRoleKey, { Prefer: "return=representation" }),
      body: JSON.stringify(insert),
      cache: "no-store",
    },
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: data?.message ?? `HTTP ${res.status}` }, { status: 500 });
  }

  const newVersion = Array.isArray(data) ? data[0] : data;

  // Marcar esta versión como la activa en tarot_producto_config
  if (newVersion?.id) {
    await fetch(
      `${supabaseUrl}/rest/v1/tarot_producto_config?activa=eq.true`,
      {
        method: "PATCH",
        headers: hdrs(serviceRoleKey, { Prefer: "return=minimal" }),
        body: JSON.stringify({ current_prompt_version_id: newVersion.id }),
        cache: "no-store",
      },
    ).catch(() => { /* no fatal si falla — la versión ya fue guardada */ });
  }

  return NextResponse.json({ ok: true, version: newVersion });
}
