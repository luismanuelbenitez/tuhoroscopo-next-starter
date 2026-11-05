import { NextRequest, NextResponse } from "next/server";
import { restSupabase } from "@/lib/asistenteParte";
import { sincronizarGoogleAds } from "@/lib/googleAdsApi/sync";

// Sincronización Google Ads (2026-11-04), cada hora por Vercel Cron (ver
// vercel.json). SOLO LEE de Google (REGLA MÁXIMA, lib/reglaMaxima.ts). Cada
// hora: últimos 3 días; a las 6:00 de Uruguay (9:00 UTC) los últimos 30,
// porque Google ajusta conversiones con atraso.
// Vercel manda "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const r = await sincronizarGoogleAds(rest, { dias: new Date().getUTCHours() === 9 ? 30 : 3, origen: "cron" });
  return NextResponse.json(r, { status: r.ok || r.motivo === "sin_configurar" ? 200 : 502 });
}
