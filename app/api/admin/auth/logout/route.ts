import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { AdminSession, adminSessionOptions } from "@/lib/adminSessionOptions";

export async function POST() {
  const session = await getIronSession<AdminSession>(cookies(), adminSessionOptions);
  session.destroy();
  return NextResponse.json({ ok: true });
}
