import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function hdrs(serviceRoleKey: string) {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_prompt_versiones?id=eq.${encodeURIComponent(params.id)}` +
      `&select=id,label,descripcion,estado,motivo_cambio,prompt_sistema,prompt_usuario_template,` +
      `ia_modelo,ia_max_tokens,ia_temperatura,created_at`,
    { headers: hdrs(serviceRoleKey), cache: "no-store" },
  );

  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 502 });
  const arr = await res.json().catch(() => []);
  const version = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;

  if (!version) return NextResponse.json({ ok: false, motivo: "version_no_encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true, version });
}
