import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  return NextResponse.json({
    ok: true,
    env: {
      TAROT_INTERNAL_KEY: !!process.env.TAROT_INTERNAL_KEY,
      TAROT_INTERNAL_KEY_len: process.env.TAROT_INTERNAL_KEY?.length ?? 0,
      WHATSAPP_INTERNAL_KEY: !!process.env.WHATSAPP_INTERNAL_KEY,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      SESSION_SECRET: !!process.env.SESSION_SECRET,
    },
  });
}
