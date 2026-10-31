import { NextRequest, NextResponse } from "next/server";
import { generarParte, restSupabase } from "@/lib/asistenteParte";

// Parte diario del Asistente CEO (2026-10-31). Lo dispara Vercel Cron todos
// los días a las 8:00 de Uruguay (11:00 UTC, ver vercel.json). Vercel manda
// "Authorization: Bearer <CRON_SECRET>"; sin CRON_SECRET configurado no corre.
// Solo lee datos y manda el parte al email de Manuel.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const r = await generarParte(rest, "diario", true);
    return NextResponse.json({ ok: true, id: r.id, estado: r.chequeo.estado_general, email_enviado: !!r.email_enviado_at, email_error: r.email_error });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
