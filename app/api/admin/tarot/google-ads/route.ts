import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { medirSiCorresponde, sincronizarGoogleAds } from "@/lib/googleAdsApi/sync";
import { leerPanelGoogleAds } from "@/lib/googleAdsApi/panel";

// Google Ads (2026-11-04), solo lectura. Lo que la web mide de las visitas de
// anuncios de Google (rpc google_ads_panel) + si la medición de compras está
// activa + los pasos pendientes. Desde el 5/11 también "cuenta": lo que la API
// de Google Ads leyó de la cuenta (gasto, campañas, palabras y búsquedas;
// tablas google_ads_*, sincronizadas cada hora).
export const dynamic = "force-dynamic";
export const maxDuration = 300; // "Leer ahora" y "Medir ahora" (PageSpeed tarda hasta ~60 s)

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias")) || 14, 1), 90);
    return NextResponse.json(await leerPanelGoogleAds(rest, dias));
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST {accion:"sincronizar", dias}: lee la cuenta de Google Ads ahora (solo
// lectura, REGLA MÁXIMA). Lo mismo que hace el cron cada hora.
// POST {accion:"medir_pagina"}: mide ya la velocidad de /tarot (PageSpeed).
export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as { accion?: string; dias?: number };
  if (b.accion === "medir_pagina") {
    const v = await medirSiCorresponde(rest, true);
    const ok = v != null && (v.movil.rendimiento != null || v.escritorio.rendimiento != null);
    return NextResponse.json({ ok, velocidad: v, motivo: ok ? undefined : v?.movil.error ?? "sin_datos" });
  }
  if (b.accion !== "sincronizar") return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
  const r = await sincronizarGoogleAds(rest, { dias: Math.min(Math.max(Number(b.dias) || 3, 1), 90), origen: "manual" });
  return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "sin_configurar" ? 400 : 502 });
}
