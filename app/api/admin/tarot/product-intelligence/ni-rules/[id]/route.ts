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

const ESTADOS = ["Propuesta", "Aprobada", "Implementada", "Deprecada"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.titulo !== undefined) patch.titulo = String(body.titulo).trim();
  if (body.problema_observado !== undefined) patch.problema_observado = String(body.problema_observado).trim();
  if (body.regla_narrativa !== undefined) patch.regla_narrativa = String(body.regla_narrativa).trim();
  if (body.justificacion !== undefined) patch.justificacion = String(body.justificacion).trim();
  if (body.impacto_esperado !== undefined) patch.impacto_esperado = String(body.impacto_esperado).trim();
  if (body.fuente !== undefined) patch.fuente = body.fuente ? String(body.fuente).trim() : null;
  if (body.caso_benchmark !== undefined) patch.caso_benchmark = body.caso_benchmark ? String(body.caso_benchmark).trim() : null;
  if (body.version_prompt !== undefined) patch.version_prompt = body.version_prompt ? String(body.version_prompt).trim() : null;
  if (body.estado !== undefined) {
    if (!ESTADOS.includes(body.estado as typeof ESTADOS[number])) {
      return NextResponse.json({ ok: false, motivo: "estado_invalido" }, { status: 400 });
    }
    patch.estado = String(body.estado);
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ ok: false, motivo: "sin_cambios" }, { status: 400 });
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_narrative_rules?id=eq.${encodeURIComponent(params.id)}`,
    {
      method: "PATCH",
      headers: hdrs(serviceRoleKey, { Prefer: "return=representation" }),
      body: JSON.stringify(patch),
      cache: "no-store",
    },
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true, rule: Array.isArray(data) ? data[0] : data });
}
