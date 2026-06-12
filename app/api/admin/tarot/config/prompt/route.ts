import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function headers(serviceRoleKey: string, extra?: Record<string, string>) {
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
    `${supabaseUrl}/rest/v1/tarot_producto_config?activa=eq.true&select=id,slug,nombre,version,activa,idioma,prompt_sistema,prompt_usuario_template,max_words_interpretacion,max_words_consejo,max_words_resumen,max_words_mensaje_final,max_words_proximo_paso,ia_modelo,ia_max_tokens,ia_temperatura,notas,updated_at&order=created_at.asc&limit=10`,
    { headers: headers(serviceRoleKey), cache: "no-store" },
  );

  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 502 });
  const rows = await res.json().catch(() => []);

  return NextResponse.json({ ok: true, configs: rows });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }

  const id = body.id as string;
  if (!id) return NextResponse.json({ ok: false, motivo: "id_requerido" }, { status: 400 });

  const patch: Record<string, unknown> = {};

  if (body.prompt_sistema !== undefined)         patch.prompt_sistema         = String(body.prompt_sistema);
  if (body.prompt_usuario_template !== undefined) patch.prompt_usuario_template = String(body.prompt_usuario_template);
  if (body.nombre !== undefined)                 patch.nombre                 = String(body.nombre).trim();
  if (body.notas !== undefined)                  patch.notas                  = body.notas ? String(body.notas).trim() : null;

  const wordFields = ["max_words_interpretacion", "max_words_consejo", "max_words_resumen", "max_words_mensaje_final", "max_words_proximo_paso"] as const;
  for (const field of wordFields) {
    if (body[field] !== undefined) {
      const v = Number(body[field]);
      if (v > 0) patch[field] = v;
    }
  }

  // IA overrides — null limpia el override (usa tarot_configuracion como fallback)
  if (body.ia_modelo !== undefined)      patch.ia_modelo      = body.ia_modelo      ? String(body.ia_modelo).trim()  : null;
  if (body.ia_max_tokens !== undefined)  patch.ia_max_tokens  = body.ia_max_tokens  ? Number(body.ia_max_tokens)     : null;
  if (body.ia_temperatura !== undefined) patch.ia_temperatura = body.ia_temperatura ? Number(body.ia_temperatura)    : null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, motivo: "sin_cambios" }, { status: 400 });
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_producto_config?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: headers(serviceRoleKey, { Prefer: "return=representation" }),
      body: JSON.stringify(patch),
      cache: "no-store",
    },
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: data?.message ?? `HTTP ${res.status}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, config: Array.isArray(data) ? data[0] : data });
}
