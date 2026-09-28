import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  const internalKey    = process.env.TAROT_INTERNAL_KEY;
  if (!supabaseUrl || !serviceRoleKey || !internalKey) return null;
  return { supabaseUrl, serviceRoleKey, internalKey };
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, error: "config_error" }, { status: 500 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }

  const texto = String(body.texto ?? "").trim();
  if (!texto) return NextResponse.json({ ok: false, error: "TEXTO_REQUERIDO" }, { status: 400 });

  const res = await fetch(`${env.supabaseUrl}/functions/v1/ef_tarot_generar_audio_resumen`, {
    method: "POST",
    headers: {
      "Content-Type":   "application/json",
      Authorization:    `Bearer ${env.serviceRoleKey}`,
      "x-internal-key": env.internalKey,
    },
    body: JSON.stringify({
      modo: "test",
      texto,
      voz: body.voz,
      instrucciones: body.instrucciones,
      modelo: body.modelo,
      velocidad: body.velocidad,
    }),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({ ok: false, error: "respuesta_invalida" }));
  return NextResponse.json(data, { status: res.status });
}
