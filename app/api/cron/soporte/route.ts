import { NextRequest, NextResponse } from "next/server";
import { restSupabase } from "@/lib/asistenteParte";
import { procesarPendientes } from "@/lib/soporte/motor";

// Soporte Automatizado · etapa 1 (2026-11-16): cada 5 minutos (vercel.json)
// revisa si alguna clienta espera respuesta y arma el borrador. NO ENVÍA NADA.
// Hasta 5 casos por vuelta, para acotar el gasto de IA.
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
  const r = await procesarPendientes(rest, { max: 5, origen: "cron" });
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
