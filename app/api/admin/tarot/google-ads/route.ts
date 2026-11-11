import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { COMPRA_ACTIVA, GOOGLE_ADS_ID } from "@/lib/googleAds";
import { medirSiCorresponde, sincronizarGoogleAds } from "@/lib/googleAdsApi/sync";

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
    const desde = new Date(Date.now() - 3 * 3600_000 - (dias - 1) * 86_400_000).toISOString().slice(0, 10);
    const [panel, pasos, datos, porDia, sync, tc, version] = await Promise.all([
      rest("rpc/google_ads_panel", { method: "POST", body: JSON.stringify({ p_dias: dias }) }),
      rest("admin_pendientes?origen_ref=like.gads_*&select=id,titulo,estado,enlace,origen_ref&order=titulo.asc"),
      rest("google_ads_datos?select=clave,datos,synced_at"),
      rest(`google_ads_rendimiento?fecha=gte.${desde}&select=fecha,campana_id,impresiones,clics,costo,conversiones,cuota_impresiones,perdida_por_presupuesto,perdida_por_ranking&order=fecha.asc`),
      rest("google_ads_sync?select=iniciado_at,terminado_at,ok,error&order=iniciado_at.desc&limit=1"),
      rest("tarot_configuracion?clave=eq.tipo_cambio_usd_uyu&select=valor"),
      // Calidad por palabra que informa Google (versión vigente del histórico).
      rest("ads_config_historial?plataforma=eq.google&vigente_hasta=is.null&select=version,vigente_desde,diagnostico&limit=1").catch(() => []),
    ]);
    const foto = Object.fromEntries((datos as { clave: string; datos: unknown }[]).map((x) => [x.clave, x.datos]));
    // Ranking de Google (2026-11-10): para el ritmo de gasto hace falta lo
    // gastado desde que arrancó cada campaña, no solo en el período elegido.
    const ranking = (foto.ranking ?? null) as { campanas?: { id: string; inicio: string | null }[] } | null;
    const inicio = (ranking?.campanas ?? []).map((c) => c.inicio?.slice(0, 10)).filter(Boolean).sort()[0];
    const gastoTotal = inicio
      ? ((await rest(`google_ads_rendimiento?fecha=gte.${inicio}&select=fecha,campana_id,costo,clics&order=fecha.asc`).catch(() => [])) as { fecha: string; campana_id: string; costo: number; clics: number }[])
      : [];
    const cuenta = foto.cuenta
      ? {
          conectada: true, ultima_lectura: sync?.[0] ?? null, tipo_cambio: Number(tc?.[0]?.valor) || 40, campanas: foto.campanas ?? [], por_dia: porDia,
          palabras: foto.palabras_30d ?? null, terminos: foto.terminos_30d ?? null,
          // Página de destino (2026-11-05): lo que Google opina de ella por
          // palabra, sus clics por página y la velocidad medida con PageSpeed.
          destino: {
            version: version?.[0]?.version ?? null, desde: version?.[0]?.vigente_desde ?? null,
            calidad: ((version?.[0]?.diagnostico as { calidad_palabras?: unknown[] } | undefined)?.calidad_palabras ?? []),
            paginas: foto.paginas_destino_30d ?? null, velocidad: foto.velocidad_pagina ?? null,
            clave_pagespeed: !!process.env.PAGESPEED_API_KEY?.trim(),
          },
          ranking: ranking ? { ...ranking, gasto_dias: gastoTotal } : null,
        }
      : { conectada: false, ultima_lectura: sync?.[0] ?? null };
    const medicion = { etiqueta: !!GOOGLE_ADS_ID, compra: COMPRA_ACTIVA };
    // Pasos "n/6" en orden; los sueltos (ej. la palabra negativa) al final.
    const orden = (t: string) => Number(/(\d+)\/\d+/.exec(t)?.[1] ?? 99);
    const pasosOrdenados = (pasos as { titulo: string }[]).sort((a, b) => orden(a.titulo) - orden(b.titulo));
    return NextResponse.json({ ok: true, medicion, pasos: pasosOrdenados, cuenta, ...(panel as Record<string, unknown>) });
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
