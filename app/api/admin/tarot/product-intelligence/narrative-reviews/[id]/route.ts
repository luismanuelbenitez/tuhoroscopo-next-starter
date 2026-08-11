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

  const ESCALAS = ["Excelente", "Bueno", "Aceptable", "Débil"] as const;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  for (const dim of ["comprension", "personalizacion", "narrativa", "descubrimiento", "consejos", "mensaje_final_eval"] as const) {
    if (body[dim] !== undefined) {
      patch[dim] = ESCALAS.includes(body[dim] as typeof ESCALAS[number]) ? String(body[dim]) : null;
    }
  }
  if (body.riesgos !== undefined) patch.riesgos = body.riesgos ? String(body.riesgos) : null;
  if (body.frase_memorable !== undefined) patch.frase_memorable = body.frase_memorable ? String(body.frase_memorable) : null;
  if (body.observaciones !== undefined) patch.observaciones = body.observaciones ? String(body.observaciones) : null;
  if (body.prompt_version !== undefined) patch.prompt_version = body.prompt_version ? String(body.prompt_version) : null;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_narrative_reviews?id=eq.${encodeURIComponent(params.id)}`,
    {
      method: "PATCH",
      headers: hdrs(serviceRoleKey, { Prefer: "return=representation" }),
      body: JSON.stringify(patch),
      cache: "no-store",
    },
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true, review: Array.isArray(data) ? data[0] : data });
}
