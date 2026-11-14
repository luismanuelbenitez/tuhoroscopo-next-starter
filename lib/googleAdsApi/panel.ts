import type { Rest } from "@/lib/asistenteParte";
import { COMPRA_ACTIVA, GOOGLE_ADS_ID } from "@/lib/googleAds";

// Lectura del panel de Google Ads (2026-11-14, sacada de la ruta
// /api/admin/tarot/google-ads para que la use también el módulo de
// gobernanza). Solo lectura: rpc google_ads_panel (lo que mide la web de las
// visitas de Google) + la foto de la cuenta que guarda el sync cada hora.

export async function leerPanelGoogleAds(rest: Rest, dias: number) {
  const desde = new Date(Date.now() - 3 * 3600_000 - (dias - 1) * 86_400_000).toISOString().slice(0, 10);
  const [panel, pasos, datos, porDia, sync, tc, version, embudoCheckout] = await Promise.all([
    rest("rpc/google_ads_panel", { method: "POST", body: JSON.stringify({ p_dias: dias }) }),
    rest("admin_pendientes?origen_ref=like.gads_*&select=id,titulo,estado,enlace,origen_ref&order=titulo.asc"),
    rest("google_ads_datos?select=clave,datos,synced_at"),
    rest(`google_ads_rendimiento?fecha=gte.${desde}&select=fecha,campana_id,impresiones,clics,costo,conversiones,cuota_impresiones,perdida_por_presupuesto,perdida_por_ranking&order=fecha.asc`),
    rest("google_ads_sync?select=iniciado_at,terminado_at,ok,error&order=iniciado_at.desc&limit=1"),
    rest("tarot_configuracion?clave=eq.tipo_cambio_usd_uyu&select=valor"),
    // Calidad por palabra que informa Google (versión vigente del histórico).
    rest("ads_config_historial?plataforma=eq.google&vigente_hasta=is.null&select=version,vigente_desde,diagnostico&limit=1").catch(() => []),
    // Embudo del checkout paso a paso (2026-11-12): tema → nombre → WhatsApp → Mercado Pago → compra.
    rest("rpc/google_ads_embudo_checkout", { method: "POST", body: JSON.stringify({ p_dias: dias }) }).catch(() => null),
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
  return { ok: true as const, medicion, pasos: pasosOrdenados, cuenta, embudo_checkout: embudoCheckout, ...(panel as Record<string, unknown>) };
}
