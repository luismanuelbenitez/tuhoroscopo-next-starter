import { NextRequest, NextResponse } from "next/server";
import { restSupabase } from "@/lib/asistenteParte";
import { sincronizar } from "@/lib/metaAds/sync";

// Sincronización Meta Ads (2026-11-02), cada hora por Vercel Cron (ver
// vercel.json). Solo LEE de Meta. Cada hora: últimos 3 días; a las 6:00 de
// Uruguay (9:00 UTC) los últimos 28, porque Meta corrige compras atribuidas
// con atraso. Vercel manda "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const dias = new Date().getUTCHours() === 9 ? 28 : 3;
  const r = await sincronizar(rest, { dias, origen: "cron" });
  // Sin clave cargada todavía: no es un error del cron.
  return NextResponse.json(r, { status: r.ok || r.motivo === "sin_configurar" ? 200 : 502 });
}
