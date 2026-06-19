import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;

  if (!supabaseUrl || !internalKey) {
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  }

  const efUrl = `${supabaseUrl.replace("https://", "https://")}/functions/v1/ef_admin_check_alertas`.replace(
    /supabase\.co.*/,
    "supabase.co/functions/v1/ef_admin_check_alertas",
  );

  try {
    const res = await fetch(
      `https://bckbpixlaxfxafhvlpbt.supabase.co/functions/v1/ef_admin_check_alertas`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": internalKey,
        },
        body: JSON.stringify({ force: true }),
      },
    );

    const json = await res.json().catch(() => ({ ok: false, error: "invalid_json" }));
    return NextResponse.json(json, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
