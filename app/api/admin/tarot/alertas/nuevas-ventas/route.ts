import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde");
  if (!desde) return NextResponse.json({ ok: false, motivo: "desde_requerido" }, { status: 400 });

  // Basic ISO format validation to prevent injection
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/.test(desde)) {
    return NextResponse.json({ ok: false, motivo: "formato_invalido" }, { status: 400 });
  }

  // Query tarot_pagos for approved payments since the given timestamp.
  // webhook_received_at is set only on the first non-duplicate approved webhook (idempotency guard).
  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_pagos?mp_status=eq.approved&webhook_received_at=gt.${encodeURIComponent(desde)}&select=id`,
    {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      cache: "no-store",
    },
  );

  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 502 });

  const rows: { id: string }[] = await res.json().catch(() => []);
  return NextResponse.json({ ok: true, count: rows.length });
}
