import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { GOOGLE_ADS_ID } from "@/lib/googleAds";
import { sincronizarGoogleAds } from "@/lib/googleAdsApi/sync";

// Google Ads (2026-11-04), solo lectura. Sin conexión a la API de Google Ads:
// lo que la web mide de las visitas de anuncios de Google (rpc google_ads_panel)
// + si la medición de compras está activa + los pasos pendientes para activarla.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias")) || 14, 1), 90);
    const [panel, pasos] = await Promise.all([
      rest("rpc/google_ads_panel", { method: "POST", body: JSON.stringify({ p_dias: dias }) }),
      rest("admin_pendientes?origen_ref=like.gads_*&select=id,titulo,estado,enlace,origen_ref&order=titulo.asc"),
    ]);
    const medicion = {
      etiqueta: !!GOOGLE_ADS_ID,
      compra: !!GOOGLE_ADS_ID && /^[A-Za-z0-9_-]{6,40}$/.test(process.env.NEXT_PUBLIC_GOOGLE_ADS_COMPRA_LABEL ?? ""),
    };
    // Pasos "n/6" en orden; los sueltos (ej. la palabra negativa) al final.
    const orden = (t: string) => Number(/(\d+)\/\d+/.exec(t)?.[1] ?? 99);
    const pasosOrdenados = (pasos as { titulo: string }[]).sort((a, b) => orden(a.titulo) - orden(b.titulo));
    return NextResponse.json({ ok: true, medicion, pasos: pasosOrdenados, ...(panel as Record<string, unknown>) });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST {accion:"sincronizar", dias}: lee la cuenta de Google Ads ahora (solo
// lectura, REGLA MÁXIMA). Lo mismo que hace el cron cada hora.
export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as { accion?: string; dias?: number };
  if (b.accion !== "sincronizar") return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
  const r = await sincronizarGoogleAds(rest, { dias: Math.min(Math.max(Number(b.dias) || 3, 1), 90), origen: "manual" });
  return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "sin_configurar" ? 400 : 502 });
}
