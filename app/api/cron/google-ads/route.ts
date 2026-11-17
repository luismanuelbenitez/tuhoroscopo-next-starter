import { NextRequest, NextResponse } from "next/server";
import { restSupabase } from "@/lib/asistenteParte";
import { sincronizarGoogleAds } from "@/lib/googleAdsApi/sync";
import { consultarMercado } from "@/lib/googleAdsApi/mercado";
import { avisarVentasGoogle } from "@/lib/googleAdsApi/ventasServidor";

// Sincronización Google Ads (2026-11-04), cada hora por Vercel Cron (ver
// vercel.json). SOLO LEE de Google Ads (REGLA MÁXIMA, lib/reglaMaxima.ts); lo
// único que manda es el aviso de ventas (ventasServidor.ts, 2026-11-17). Cada
// hora: últimos 3 días; a las 6:00 de Uruguay (9:00 UTC) los últimos 30,
// porque Google ajusta conversiones con atraso.
// Vercel manda "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
// 300 s (2026-11-05): una vez por día también mide la velocidad de /tarot con PageSpeed.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const ahora = new Date();
  const r = await sincronizarGoogleAds(rest, { dias: ahora.getUTCHours() === 9 ? 30 : 3, origen: "cron" });
  // Palabras del mercado (2026-11-15): los lunes a las 7:15 de Uruguay se
  // actualiza cuánta gente busca cada frase (Planificador, solo lectura).
  // Sin acceso Basic, Google lo rechaza y queda anotado en el panel.
  if (ahora.getUTCDay() === 1 && ahora.getUTCHours() === 10) {
    await consultarMercado(rest, "uy").catch(() => null);
    await consultarMercado(rest, "us").catch(() => null);
  }
  // Ventas (2026-11-17): cada hora se le avisan a Google las compras aprobadas
  // por MP que vinieron de un anuncio, aunque la compradora no haya vuelto a
  // la web. Si falla, no corta la sincronización: se reintenta la hora siguiente.
  const ventas = await avisarVentasGoogle(rest).catch((e: unknown) => ({ ok: false, motivo: e instanceof Error ? e.message.slice(0, 200) : "error", enviadas: 0, errores: 0 }));
  return NextResponse.json({ ...r, ventas }, { status: r.ok || r.motivo === "sin_configurar" ? 200 : 502 });
}
