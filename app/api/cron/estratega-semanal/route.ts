import { NextRequest, NextResponse } from "next/server";
import { restSupabase } from "@/lib/asistenteParte";
import { claveAnalista } from "@/lib/analista/informe";
import { generarInformeSemanal, lunesDeLaSemana } from "@/lib/estratega/motor";

// Informe semanal del Estratega de anuncios (2026-11-04): los lunes a las
// 9:00 de Uruguay (12:00 UTC, ver vercel.json). Queda en Admin → Estratega;
// no se manda por email. Si ya hay uno de esta semana, no hace nada.
// Vercel manda "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  if (!claveAnalista()) return NextResponse.json({ ok: true, motivo: "sin_clave" });
  const semana = lunesDeLaSemana();
  const ya = await rest(`estratega_informes?semana=eq.${semana}&estado=in.(generando,listo)&select=id`);
  if ((ya as unknown[]).length) return NextResponse.json({ ok: true, motivo: "ya_hecho" });
  const [fila] = await rest("estratega_informes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ semana, origen: "cron" }) });
  await generarInformeSemanal(rest, fila.id);
  return NextResponse.json({ ok: true, informe: fila.id });
}
