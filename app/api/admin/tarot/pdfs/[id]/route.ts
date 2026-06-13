import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function restHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, apikey: key };
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
  const { id } = params;

  const h = restHeaders(serviceRoleKey);

  const arr = await fetch(
    `${supabaseUrl}/rest/v1/tarot_pdfs?id=eq.${id}&select=*`,
    { headers: h, cache: "no-store" },
  ).then((r) => (r.ok ? r.json().catch(() => []) : []));

  const pdf = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  if (!pdf) {
    return NextResponse.json({ ok: false, motivo: "pdf_no_encontrado" }, { status: 404 });
  }

  // Fetch orden state for reintentar context
  const ordenArr = await fetch(
    `${supabaseUrl}/rest/v1/tarot_ordenes?id=eq.${pdf.orden_id}&select=id,estado`,
    { headers: h, cache: "no-store" },
  ).then((r) => (r.ok ? r.json().catch(() => []) : []));

  const orden = Array.isArray(ordenArr) && ordenArr.length > 0 ? ordenArr[0] : null;

  return NextResponse.json({ ok: true, pdf, orden });
}
