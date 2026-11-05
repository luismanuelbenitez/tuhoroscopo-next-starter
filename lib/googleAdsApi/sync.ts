// Sincronización Google Ads (2026-11-04): SOLO LEE la cuenta de anuncios y la
// guarda en google_ads_rendimiento (por día y campaña) y google_ads_datos
// (cuenta, campañas, palabras clave y términos de búsqueda de 30 días).
// REGLA MÁXIMA: usa solo lib/googleAdsApi/api.ts (consultas SELECT).

import { consultar, googleAdsConfig, GoogleAdsError } from "@/lib/googleAdsApi/api";

type Rest = (q: string, init?: RequestInit) => Promise<any>;
type Fila = Record<string, any>;

const DIA = 86_400_000;
const fechaUy = (t: number) => new Date(t - 3 * 3600_000).toISOString().slice(0, 10);
const plata = (micros: unknown) => Math.round((Number(micros ?? 0) / 1_000_000) * 10000) / 10000;
const n = (v: unknown) => Number(v ?? 0) || 0;
const cuota = (v: unknown) => (v == null ? null : Math.round(Number(v) * 10000) / 10000);

export async function sincronizarGoogleAds(rest: Rest, opciones: { dias?: number; origen?: string } = {}) {
  const cfg = googleAdsConfig();
  if (!cfg) return { ok: false as const, motivo: "sin_configurar" };
  const dias = Math.min(Math.max(opciones.dias ?? 3, 1), 90);
  const [log] = await rest("google_ads_sync", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ origen: opciones.origen ?? "cron" }) });
  const desde = fechaUy(Date.now() - (dias - 1) * DIA), hasta = fechaUy(Date.now());
  const desde30 = fechaUy(Date.now() - 29 * DIA);
  let consultas = 0;
  const q = async (gaql: string) => { consultas++; return consultar<Fila>(cfg, gaql); };

  try {
    const [cuenta, campanas, presupuestos, porDia, palabras, terminos] = await Promise.all([
      q("SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer"),
      q("SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.campaign_budget, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network FROM campaign WHERE campaign.status != 'REMOVED'"),
      q("SELECT campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.delivery_method, campaign_budget.period FROM campaign_budget"),
      q(`SELECT segments.date, campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE segments.date BETWEEN '${desde}' AND '${hasta}'`),
      q(`SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.negative, ad_group.name, campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.average_cpc FROM keyword_view WHERE segments.date BETWEEN '${desde30}' AND '${hasta}'`),
      q(`SELECT search_term_view.search_term, search_term_view.status, campaign.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '${desde30}' AND '${hasta}'`),
    ]);

    const presupuestoDe = new Map(presupuestos.map((p) => [p.campaignBudget?.resourceName, p.campaignBudget]));
    const fotoCampanas = campanas.map((c) => {
      const b = presupuestoDe.get(c.campaign?.campaignBudget);
      return {
        id: c.campaign?.id, nombre: c.campaign?.name, estado: c.campaign?.status,
        estado_principal: c.campaign?.primaryStatus, motivos: c.campaign?.primaryStatusReasons ?? [],
        limitada_por_presupuesto: (c.campaign?.primaryStatusReasons ?? []).includes("BUDGET_CONSTRAINED"),
        tipo: c.campaign?.advertisingChannelType, puja: c.campaign?.biddingStrategyType,
        red_busqueda_partners: c.campaign?.networkSettings?.targetSearchNetwork ?? null,
        red_display: c.campaign?.networkSettings?.targetContentNetwork ?? null,
        presupuesto_diario: b?.amountMicros != null ? plata(b.amountMicros) : null,
        presupuesto_total: b?.totalAmountMicros != null ? plata(b.totalAmountMicros) : null,
        presupuesto_periodo: b?.period ?? null,
      };
    });
    const fotoPalabras = palabras.map((k) => ({
      palabra: k.adGroupCriterion?.keyword?.text, concordancia: k.adGroupCriterion?.keyword?.matchType,
      negativa: !!k.adGroupCriterion?.negative, estado: k.adGroupCriterion?.status, grupo: k.adGroup?.name, campana_id: k.campaign?.id,
      impresiones: n(k.metrics?.impressions), clics: n(k.metrics?.clicks), costo: plata(k.metrics?.costMicros), conversiones: n(k.metrics?.conversions),
    })).sort((a, b) => b.costo - a.costo || b.impresiones - a.impresiones);
    const fotoTerminos = terminos.map((t) => ({
      termino: t.searchTermView?.searchTerm, estado: t.searchTermView?.status, grupo: t.adGroup?.name, campana_id: t.campaign?.id,
      impresiones: n(t.metrics?.impressions), clics: n(t.metrics?.clicks), costo: plata(t.metrics?.costMicros), conversiones: n(t.metrics?.conversions),
    })).sort((a, b) => b.costo - a.costo || b.clics - a.clics || b.impresiones - a.impresiones).slice(0, 300);

    const filasDia = porDia.map((r) => ({
      fecha: r.segments?.date, campana_id: String(r.campaign?.id),
      impresiones: n(r.metrics?.impressions), clics: n(r.metrics?.clicks), costo: plata(r.metrics?.costMicros),
      conversiones: n(r.metrics?.conversions), valor_conversiones: n(r.metrics?.conversionsValue),
      cuota_impresiones: cuota(r.metrics?.searchImpressionShare), perdida_por_presupuesto: cuota(r.metrics?.searchBudgetLostImpressionShare),
      perdida_por_ranking: cuota(r.metrics?.searchRankLostImpressionShare), synced_at: new Date().toISOString(),
    }));
    const upsert = { Prefer: "resolution=merge-duplicates,return=minimal" };
    if (filasDia.length) await rest("google_ads_rendimiento?on_conflict=fecha,campana_id", { method: "POST", headers: upsert, body: JSON.stringify(filasDia) });
    const ahora = new Date().toISOString();
    await rest("google_ads_datos?on_conflict=clave", {
      method: "POST", headers: upsert,
      body: JSON.stringify([
        { clave: "cuenta", datos: cuenta[0]?.customer ?? null, synced_at: ahora },
        { clave: "campanas", datos: fotoCampanas, synced_at: ahora },
        { clave: "palabras_30d", datos: { desde: desde30, hasta, filas: fotoPalabras }, synced_at: ahora },
        { clave: "terminos_30d", datos: { desde: desde30, hasta, filas: fotoTerminos }, synced_at: ahora },
      ]),
    });
    await rest(`google_ads_sync?id=eq.${log.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ok: true, terminado_at: ahora, consultas }) });
    return { ok: true as const, dias, campanas: fotoCampanas.length, filas_dia: filasDia.length, palabras: fotoPalabras.length, terminos: fotoTerminos.length };
  } catch (e: unknown) {
    const mensaje = (e instanceof GoogleAdsError || e instanceof Error ? e.message : String(e)).slice(0, 500);
    await rest(`google_ads_sync?id=eq.${log.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ok: false, terminado_at: new Date().toISOString(), error: mensaje, consultas }) }).catch(() => {});
    return { ok: false as const, motivo: "error", detalle: mensaje };
  }
}
