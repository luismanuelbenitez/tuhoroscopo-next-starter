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

function nextCode(existing: string[]): string {
  const nums = existing
    .map((c) => parseInt(c.replace("NI-", ""), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `NI-${String(max + 1).padStart(3, "0")}`;
}

export async function GET(_req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_narrative_rules` +
      `?select=id,codigo,titulo,problema_observado,regla_narrativa,justificacion,impacto_esperado,` +
      `estado,fuente,caso_benchmark,version_prompt,created_at,updated_at` +
      `&order=codigo.asc`,
    { headers: hdrs(serviceRoleKey), cache: "no-store" },
  );

  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 502 });
  const rules = await res.json().catch(() => []);
  return NextResponse.json({ ok: true, rules });
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }

  const required = ["titulo", "problema_observado", "regla_narrativa", "justificacion", "impacto_esperado"];
  for (const f of required) {
    if (!body[f]) return NextResponse.json({ ok: false, motivo: `campo_requerido:${f}` }, { status: 400 });
  }

  // Auto-generate code if not provided
  let codigo = body.codigo ? String(body.codigo).trim() : null;
  if (!codigo) {
    const rCodigos = await fetch(
      `${supabaseUrl}/rest/v1/tarot_narrative_rules?select=codigo&order=codigo.asc`,
      { headers: hdrs(serviceRoleKey), cache: "no-store" },
    );
    const codArr = await rCodigos.json().catch(() => []);
    const existingCodes = Array.isArray(codArr) ? codArr.map((r: { codigo: string }) => r.codigo) : [];
    codigo = nextCode(existingCodes);
  }

  const insert = {
    codigo,
    titulo: String(body.titulo).trim(),
    problema_observado: String(body.problema_observado).trim(),
    regla_narrativa: String(body.regla_narrativa).trim(),
    justificacion: String(body.justificacion).trim(),
    impacto_esperado: String(body.impacto_esperado).trim(),
    estado: "Propuesta",
    fuente: body.fuente ? String(body.fuente).trim() : null,
    caso_benchmark: body.caso_benchmark ? String(body.caso_benchmark).trim() : null,
    version_prompt: null,
  };

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_narrative_rules`,
    {
      method: "POST",
      headers: hdrs(serviceRoleKey, { Prefer: "return=representation" }),
      body: JSON.stringify(insert),
      cache: "no-store",
    },
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error", detalle: data?.message }, { status: 500 });
  return NextResponse.json({ ok: true, rule: Array.isArray(data) ? data[0] : data });
}
