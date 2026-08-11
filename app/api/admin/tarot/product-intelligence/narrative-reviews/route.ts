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

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const { searchParams } = req.nextUrl;
  const lecturaId = searchParams.get("lectura_id");

  let url = `${supabaseUrl}/rest/v1/tarot_narrative_reviews` +
    `?select=id,lectura_id,comprension,personalizacion,narrativa,descubrimiento,consejos,` +
    `mensaje_final_eval,riesgos,frase_memorable,observaciones,evaluador,prompt_version,fecha,created_at` +
    `&order=created_at.desc`;

  if (lecturaId) url += `&lectura_id=eq.${encodeURIComponent(lecturaId)}`;

  const res = await fetch(url, { headers: hdrs(serviceRoleKey), cache: "no-store" });
  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 502 });

  const reviews = await res.json().catch(() => []);
  return NextResponse.json({ ok: true, reviews });
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }

  if (!body.lectura_id) return NextResponse.json({ ok: false, motivo: "lectura_id_requerido" }, { status: 400 });

  const ESCALAS = ["Excelente", "Bueno", "Aceptable", "Débil"] as const;

  const insert: Record<string, unknown> = {
    lectura_id: String(body.lectura_id),
    evaluador: body.evaluador ? String(body.evaluador) : null,
    prompt_version: body.prompt_version ? String(body.prompt_version) : null,
    fecha: body.fecha ? String(body.fecha) : new Date().toISOString().slice(0, 10),
    frase_memorable: body.frase_memorable ? String(body.frase_memorable) : null,
    riesgos: body.riesgos ? String(body.riesgos) : null,
    observaciones: body.observaciones ? String(body.observaciones) : null,
  };

  for (const dim of ["comprension", "personalizacion", "narrativa", "descubrimiento", "consejos", "mensaje_final_eval"] as const) {
    insert[dim] = ESCALAS.includes(body[dim] as typeof ESCALAS[number]) ? String(body[dim]) : null;
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_narrative_reviews`,
    {
      method: "POST",
      headers: hdrs(serviceRoleKey, { Prefer: "return=representation" }),
      body: JSON.stringify(insert),
      cache: "no-store",
    },
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error", detalle: data?.message }, { status: 500 });
  return NextResponse.json({ ok: true, review: Array.isArray(data) ? data[0] : data });
}
