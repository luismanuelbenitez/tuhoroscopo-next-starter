// Sincronización Google Ads (2026-11-04): SOLO LEE la cuenta de anuncios y la
// guarda en google_ads_rendimiento (por día y campaña) y google_ads_datos
// (cuenta, campañas, palabras clave y términos de búsqueda de 30 días).
// REGLA MÁXIMA: usa solo lib/googleAdsApi/api.ts (consultas SELECT).

import { consultar, googleAdsConfig, GoogleAdsError } from "@/lib/googleAdsApi/api";
import { estable, registrarHistorial, type CampanaHistorial } from "@/lib/adsHistorial";

type Rest = (q: string, init?: RequestInit) => Promise<any>;
type Fila = Record<string, any>;

// ── Configuración completa para el histórico (ads_config_historial) ─────────
// La configuración que se elige a mano (define la huella) va aparte del
// diagnóstico que Google cambia solo (nivel de calidad, fuerza del anuncio,
// recomendaciones, aprendizaje).
const NO_REMOVIDA = "campaign.status != 'REMOVED'";
async function leerConfiguracion(q: (gaql: string) => Promise<Fila[]>) {
  const [campanas, criterios, grupos, palabras, anuncios, recursos, conversiones, recomendaciones] = await Promise.all([
    q(`SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.primary_status, campaign.primary_status_reasons, campaign.advertising_channel_type, campaign.advertising_channel_sub_type, campaign.bidding_strategy_type, campaign.target_spend.cpc_bid_ceiling_micros, campaign.target_spend.target_spend_micros, campaign.manual_cpc.enhanced_cpc_enabled, campaign.maximize_conversions.target_cpa_micros, campaign.maximize_conversion_value.target_roas, campaign.target_cpa.target_cpa_micros, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network, campaign.network_settings.target_partner_search_network, campaign.geo_target_type_setting.positive_geo_target_type, campaign.geo_target_type_setting.negative_geo_target_type, campaign.start_date_time, campaign.end_date_time, campaign.final_url_suffix, campaign.tracking_url_template, campaign.campaign_budget, campaign.optimization_score FROM campaign WHERE ${NO_REMOVIDA}`),
    q(`SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.status, campaign_criterion.bid_modifier, campaign_criterion.location.geo_target_constant, campaign_criterion.language.language_constant, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type, campaign_criterion.device.type, campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.end_hour, campaign_criterion.age_range.type, campaign_criterion.gender.type FROM campaign_criterion WHERE ${NO_REMOVIDA}`),
    q(`SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ad_group.type, ad_group.cpc_bid_micros, ad_group.final_url_suffix, ad_group.tracking_url_template FROM ad_group WHERE ${NO_REMOVIDA} AND ad_group.status != 'REMOVED'`),
    q(`SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.type, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros, ad_group_criterion.final_urls, ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score, ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr, ad_group_criterion.system_serving_status, ad_group_criterion.approval_status FROM ad_group_criterion WHERE ${NO_REMOVIDA} AND ad_group_criterion.status != 'REMOVED'`),
    q(`SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_url_suffix, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2, ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE ${NO_REMOVIDA} AND ad_group_ad.status != 'REMOVED'`),
    q(`SELECT campaign.id, campaign.status, campaign_asset.field_type, campaign_asset.status, asset.id, asset.type, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2, asset.callout_asset.callout_text, asset.structured_snippet_asset.header, asset.structured_snippet_asset.values, asset.final_urls FROM campaign_asset WHERE ${NO_REMOVIDA} AND campaign_asset.status != 'REMOVED'`),
    q("SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.category, conversion_action.primary_for_goal, conversion_action.counting_type, conversion_action.click_through_lookback_window_days, conversion_action.value_settings.default_value, conversion_action.value_settings.default_currency_code, conversion_action.attribution_model_settings.attribution_model FROM conversion_action WHERE conversion_action.status != 'REMOVED'"),
    q("SELECT recommendation.type, recommendation.campaign, recommendation.dismissed FROM recommendation"),
  ]);
  return { campanas, criterios, grupos, palabras, anuncios, recursos, conversiones, recomendaciones };
}

const SIN_RECURSO = new Set(["resourceName", "assetPerformanceLabel", "policySummaryInfo"]);
const limpio = (v: unknown) => estable(v, SIN_RECURSO) as Fila;
const LUGARES: Record<string, string> = { "2858": "Uruguay", "2032": "Argentina", "2076": "Brasil", "2724": "España", "2484": "México" };
const PUJAS: Record<string, string> = { TARGET_SPEND: "Maximizar clics", MAXIMIZE_CONVERSIONS: "Maximizar conversiones", MAXIMIZE_CONVERSION_VALUE: "Maximizar valor", MANUAL_CPC: "CPC manual", TARGET_CPA: "CPA objetivo" };
const usd = (micros: unknown) => (micros == null ? null : `US$ ${plata(micros)}`);
const porTexto = (a: Fila, b: Fila) => String(a.id).localeCompare(String(b.id));

function historialGoogle(f: Awaited<ReturnType<typeof leerConfiguracion>>, cliente: Fila, presupuestoDe: Map<unknown, Fila>): CampanaHistorial[] {
  const conversiones = f.conversiones.map((r) => limpio(r.conversionAction)).sort(porTexto);
  return f.campanas.map((r) => {
    const c = r.campaign ?? {};
    const id = String(c.id);
    const deCampana = (lista: Fila[]) => lista.filter((x) => String(x.campaign?.id) === id);
    const b = presupuestoDe.get(c.campaignBudget) ?? {};
    const criterios = deCampana(f.criterios).map((x): Fila => ({ id: String(x.campaignCriterion?.criterionId), ...limpio(x.campaignCriterion) })).sort(porTexto);
    const grupos = deCampana(f.grupos).map((x): Fila => ({ id: String(x.adGroup?.id), ...limpio(x.adGroup) })).sort(porTexto);
    const kw = deCampana(f.palabras);
    const palabras = kw.map((x) => {
      const k = x.adGroupCriterion ?? {};
      return { id: `${x.adGroup?.id}~${k.criterionId}`, grupo: String(x.adGroup?.id), tipo: k.type, texto: k.keyword?.text ?? null, concordancia: k.keyword?.matchType ?? null, estado: k.status, negativa: !!k.negative, cpc_micros: k.cpcBidMicros ?? null, urls: k.finalUrls ?? null };
    }).sort(porTexto);
    const ads = deCampana(f.anuncios);
    const anuncios = ads.map((x): Fila => {
      const a = x.adGroupAd?.ad ?? {};
      return { id: String(a.id), grupo: String(x.adGroup?.id), estado: x.adGroupAd?.status, tipo: a.type, urls: a.finalUrls ?? null, sufijo: a.finalUrlSuffix ?? null, ...limpio({ rsa: a.responsiveSearchAd ?? null }) };
    }).sort(porTexto);
    const recursos = deCampana(f.recursos).map((x): Fila => ({ id: `${x.campaignAsset?.fieldType}~${x.asset?.id}`, tipo: x.campaignAsset?.fieldType, estado: x.campaignAsset?.status, ...limpio({ asset: x.asset }) })).sort(porTexto);
    const campana = limpio({ ...c, servingStatus: undefined, primaryStatus: undefined, primaryStatusReasons: undefined, optimizationScore: undefined });
    for (const k of Object.keys(campana)) if (campana[k] === undefined) delete campana[k];

    const activas = palabras.filter((p) => p.tipo === "KEYWORD" && !p.negativa && p.estado === "ENABLED");
    const negativas = [...criterios.filter((x) => x.type === "KEYWORD" && x.negative).map((x) => `${(x.keyword as Fila)?.text} (${(x.keyword as Fila)?.matchType})`),
      ...palabras.filter((p) => p.negativa).map((p) => `${p.texto} (${p.concordancia}, grupo)`)];
    const contar = (l: string[]) => Object.entries(l.reduce<Record<string, number>>((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {})).map(([k, v]) => `${v} ${k}`).join(", ");
    const resumen = {
      estado: c.status, tipo: [c.advertisingChannelType, c.advertisingChannelSubType].filter(Boolean).join(" · "),
      puja: `${PUJAS[c.biddingStrategyType] ?? c.biddingStrategyType}${c.targetSpend?.cpcBidCeilingMicros ? ` · tope por clic ${usd(c.targetSpend.cpcBidCeilingMicros)}` : " · sin tope por clic"}${c.maximizeConversions?.targetCpaMicros ? ` · CPA objetivo ${usd(c.maximizeConversions.targetCpaMicros)}` : ""}`,
      presupuesto: b.totalAmountMicros ? `${usd(b.totalAmountMicros)} en total (${b.period})` : b.amountMicros ? `${usd(b.amountMicros)} por día` : null,
      fechas: `${c.startDateTime ?? "?"} → ${c.endDateTime ?? "sin fin"}`,
      redes: [c.networkSettings?.targetGoogleSearch && "Búsqueda de Google", c.networkSettings?.targetSearchNetwork && "Socios de búsqueda", c.networkSettings?.targetContentNetwork && "Display"].filter(Boolean).join(", "),
      lugares: criterios.filter((x) => x.type === "LOCATION").map((x) => { const g = String((x.location as Fila)?.geoTargetConstant ?? "").split("/").pop() ?? ""; return `${x.negative ? "excluye " : ""}${LUGARES[g] ?? g}`; }).join(", ") || "todo el mundo",
      tipo_ubicacion: c.geoTargetTypeSetting?.positiveGeoTargetType === "PRESENCE" ? "Personas que están en el lugar" : "Personas que están o se interesan en el lugar",
      idiomas: criterios.filter((x) => x.type === "LANGUAGE").length ? criterios.filter((x) => x.type === "LANGUAGE").map((x) => String((x.language as Fila)?.languageConstant)).join(", ") : "todos",
      dispositivos: criterios.filter((x) => x.type === "DEVICE").map((x) => `${(x.device as Fila)?.type}${x.bidModifier != null ? ` ×${x.bidModifier}` : ""}`).join(", ") || "todos",
      horario: criterios.filter((x) => x.type === "AD_SCHEDULE").length ? `${criterios.filter((x) => x.type === "AD_SCHEDULE").length} franjas` : "todo el día",
      grupos: grupos.map((g) => `${g.name} (${g.status})`),
      palabras_activas: `${activas.length} (${contar(activas.map((p) => String(p.concordancia)))})`,
      palabras_pausadas: palabras.filter((p) => p.tipo === "KEYWORD" && p.estado === "PAUSED").map((p) => p.texto),
      negativas,
      anuncios: anuncios.map((a) => ({ estado: a.estado, url: (a.urls as string[] | null)?.[0] ?? null, titulos: ((a.rsa as Fila)?.headlines as Fila[] | undefined)?.length ?? 0, descripciones: ((a.rsa as Fila)?.descriptions as Fila[] | undefined)?.length ?? 0 })),
      recursos: contar(recursos.filter((x) => x.estado === "ENABLED").map((x) => String(x.tipo))),
      sufijo_url: c.finalUrlSuffix ?? anuncios[0]?.sufijo ?? null,
      conversiones: conversiones.map((x) => `${x.name} (${x.category}, ${x.primaryForGoal ? "principal" : "secundaria"}, valor por defecto ${(x.valueSettings as Fila)?.defaultValue ?? "-"} ${(x.valueSettings as Fila)?.defaultCurrencyCode ?? ""}, ${x.countingType})`),
    };
    const diagnostico = {
      estado_principal: c.primaryStatus ?? null, motivos: c.primaryStatusReasons ?? [], sirviendo: c.servingStatus ?? null, nivel_optimizacion: c.optimizationScore ?? null,
      calidad_palabras: kw.filter((x) => x.adGroupCriterion?.type === "KEYWORD" && !x.adGroupCriterion?.negative).map((x) => {
        const k = x.adGroupCriterion; const qi = k.qualityInfo ?? {};
        return { texto: k.keyword?.text, concordancia: k.keyword?.matchType, estado: k.status, nivel_calidad: qi.qualityScore ?? null, ctr_esperado: qi.searchPredictedCtr ?? null, relevancia_anuncio: qi.creativeQualityScore ?? null, experiencia_pagina: qi.postClickQualityScore ?? null, sirve: k.systemServingStatus ?? null, aprobacion: k.approvalStatus ?? null };
      }),
      anuncios: ads.map((x) => ({ id: String(x.adGroupAd?.ad?.id), fuerza: x.adGroupAd?.adStrength ?? null, aprobacion: x.adGroupAd?.policySummary?.approvalStatus ?? null,
        rendimiento_titulos: (x.adGroupAd?.ad?.responsiveSearchAd?.headlines ?? []).map((h: Fila) => [h.text, h.assetPerformanceLabel]) })),
      recomendaciones: f.recomendaciones.filter((x) => String(x.recommendation?.campaign ?? "").endsWith(`/${id}`) && !x.recommendation?.dismissed).map((x) => x.recommendation?.type),
    };
    return {
      campana_id: id, nombre: c.name ?? null, estado: c.status ?? null,
      utm_campaign: (/utm_campaign=([^&]+)/.exec(String(c.finalUrlSuffix ?? anuncios[0]?.sufijo ?? ""))?.[1] ?? "").toLowerCase() || null,
      config: { campana, presupuesto: limpio(b), segmentacion: criterios, grupos, palabras, anuncios, recursos, conversiones, cuenta: limpio({ autoTaggingEnabled: cliente.autoTaggingEnabled, trackingUrlTemplate: cliente.trackingUrlTemplate ?? null, finalUrlSuffix: cliente.finalUrlSuffix ?? null }) },
      resumen, diagnostico,
      desde: c.startDateTime ? `${String(c.startDateTime).replace(" ", "T")}-03:00` : null,
    };
  });
}

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
    const [cuenta, campanas, presupuestos, porDia, palabras, terminos, fondo] = await Promise.all([
      q("SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.auto_tagging_enabled, customer.tracking_url_template, customer.final_url_suffix, customer.optimization_score FROM customer"),
      q("SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.campaign_budget, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network FROM campaign WHERE campaign.status != 'REMOVED'"),
      q("SELECT campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.delivery_method, campaign_budget.period FROM campaign_budget"),
      q(`SELECT segments.date, campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE segments.date BETWEEN '${desde}' AND '${hasta}'`),
      q(`SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.negative, ad_group.name, campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.average_cpc FROM keyword_view WHERE segments.date BETWEEN '${desde30}' AND '${hasta}'`),
      q(`SELECT search_term_view.search_term, search_term_view.status, campaign.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '${desde30}' AND '${hasta}'`),
      leerConfiguracion(q),
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
    // Histórico de configuración: no frena la sincronización si falla.
    const historial = await registrarHistorial(rest, "google", historialGoogle(fondo, cuenta[0]?.customer ?? {}, presupuestoDe))
      .catch((e) => ({ error: e instanceof Error ? e.message.slice(0, 200) : String(e) }));
    await rest(`google_ads_sync?id=eq.${log.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ok: true, terminado_at: ahora, consultas, ...("error" in historial ? { error: `historial: ${historial.error}` } : {}) }) });
    return { ok: true as const, dias, campanas: fotoCampanas.length, filas_dia: filasDia.length, palabras: fotoPalabras.length, terminos: fotoTerminos.length, historial };
  } catch (e: unknown) {
    const mensaje = (e instanceof GoogleAdsError || e instanceof Error ? e.message : String(e)).slice(0, 500);
    await rest(`google_ads_sync?id=eq.${log.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ok: false, terminado_at: new Date().toISOString(), error: mensaje, consultas }) }).catch(() => {});
    return { ok: false as const, motivo: "error", detalle: mensaje };
  }
}
