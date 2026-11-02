import { createHash } from "crypto";
import { leer, leerTodo, metaConfig, MetaError, type MetaConfig } from "@/lib/metaAds/graph";

// Sincronización Meta Ads → Supabase (2026-11-02). Solo lee de Meta.
// Trae cuenta, configuración completa de campañas / conjuntos / anuncios,
// rendimiento diario por anuncio (total y por ubicación) y por hora, y lo
// guarda con una sola llamada a meta_ads_guardar (una transacción).

// Campos pedidos a Meta. La configuración se guarda COMPLETA (config jsonb)
// para poder analizarla después sin capturas.
const CAMPOS_CUENTA = "id,name,account_status,disable_reason,currency,timezone_name,amount_spent,spend_cap,balance,business_name,min_daily_budget,funding_source_details";
const CAMPOS_CAMPANA = "id,name,objective,status,configured_status,effective_status,buying_type,daily_budget,lifetime_budget,budget_remaining,bid_strategy,spend_cap,special_ad_categories,start_time,stop_time,created_time,updated_time,issues_info,smart_promotion_type,is_budget_schedule_enabled";
const CAMPOS_CONJUNTO = "id,name,campaign_id,status,configured_status,effective_status,daily_budget,lifetime_budget,budget_remaining,bid_strategy,bid_amount,billing_event,optimization_goal,promoted_object,targeting,attribution_spec,destination_type,pacing_type,start_time,end_time,created_time,updated_time,issues_info,learning_stage_info,daily_min_spend_target,daily_spend_cap";
const CAMPOS_ANUNCIO = "id,name,adset_id,campaign_id,status,configured_status,effective_status,created_time,updated_time,issues_info,ad_review_feedback,tracking_specs,conversion_specs,preview_shareable_link,creative{id,name,title,body,object_type,call_to_action_type,url_tags,link_url,video_id,image_hash,object_story_spec,asset_feed_spec,instagram_permalink_url,effective_object_story_id,degrees_of_freedom_spec}";
const CAMPOS_RENDIMIENTO = "date_start,ad_id,adset_id,campaign_id,spend,impressions,reach,frequency,clicks,inline_link_clicks,actions,action_values,cpm,ctr,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_avg_time_watched_actions";
const ESTADOS_TODOS = ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO", "ARCHIVED"];

// Montos de la cuenta y presupuestos vienen en la unidad mínima (centavos),
// salvo monedas sin decimales. El gasto de los informes ya viene en unidades.
const SIN_DECIMALES = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);
const montoCuenta = (v: unknown, moneda: string): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n / (SIN_DECIMALES.has(moneda) ? 1 : 100) : null;
};
const num = (v: unknown): number | null => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

type Fila = Record<string, unknown>;

// Fecha "hoy" en el huso de la cuenta publicitaria.
function fechaEn(tz: string, desplazamientoDias = 0): string {
  const d = new Date(Date.now() + desplazamientoDias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Huella de configuración: excluye lo que cambia solo (estado, restante,
// avisos, URLs firmadas) para registrar únicamente cambios hechos a mano.
const VOLATILES = new Set(["status", "configured_status", "effective_status", "budget_remaining", "issues_info", "ad_review_feedback",
  "learning_stage_info", "updated_time", "thumbnail_url", "image_url", "preview_shareable_link", "picture"]);
function estable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(estable);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as Fila).filter((k) => !VOLATILES.has(k)).sort().map((k) => [k, estable((v as Fila)[k])]));
  }
  return v;
}
const huella = (config: Fila) => createHash("sha256").update(JSON.stringify(estable(config))).digest("hex").slice(0, 32);

// utm_campaign / utm_content salen de los parámetros de URL del anuncio
// (url_tags del creativo). {{ad.name}} se resuelve con el nombre del anuncio.
function utms(anuncio: Fila): { utm_campaign: string | null; utm_content: string | null } {
  const creativo = (anuncio.creative ?? {}) as Fila;
  const spec = (creativo.object_story_spec ?? {}) as Fila;
  const enlaces = [
    creativo.url_tags, creativo.link_url,
    (spec.link_data as Fila | undefined)?.link,
    ((spec.video_data as Fila | undefined)?.call_to_action as Fila | undefined)?.value
      ? (((spec.video_data as Fila).call_to_action as Fila).value as Fila).link : undefined,
  ].filter((x): x is string => typeof x === "string");
  const params = new URLSearchParams();
  for (const e of enlaces) {
    const q = e.includes("?") ? e.slice(e.indexOf("?") + 1) : e;
    new URLSearchParams(q).forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  }
  const resolver = (v: string | null) => (v ? v.replace(/\{\{ad\.name\}\}/g, String(anuncio.name ?? "")).trim() || null : null);
  const campana = resolver(params.get("utm_campaign"));
  return { utm_campaign: campana && !campana.includes("{{") ? campana.toLowerCase() : null, utm_content: resolver(params.get("utm_content")) };
}

function accion(lista: unknown, tipos: string[]): number {
  const arr = Array.isArray(lista) ? (lista as { action_type: string; value: string }[]) : [];
  for (const t of tipos) {
    const a = arr.find((x) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}
const COMPRA = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const INICIO_PAGO = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];

function filaRendimiento(r: Fila, ubicacion: string) {
  return {
    fecha: r.date_start, anuncio_id: r.ad_id, ubicacion, campana_id: r.campaign_id, conjunto_id: r.adset_id,
    gasto: num(r.spend) ?? 0, impresiones: num(r.impressions) ?? 0,
    alcance: ubicacion === "total" ? num(r.reach) : null, frecuencia: ubicacion === "total" ? num(r.frequency) : null,
    clics: num(r.clicks) ?? 0, clics_enlace: num(r.inline_link_clicks) ?? 0,
    vistas_pagina: accion(r.actions, ["landing_page_view", "omni_landing_page_view"]),
    inicios_pago: accion(r.actions, INICIO_PAGO), compras: accion(r.actions, COMPRA),
    valor_compras: accion(r.action_values, COMPRA), reproducciones_3s: accion(r.actions, ["video_view"]) || null,
    metricas: r,
  };
}

export interface ResultadoSync {
  payload: Record<string, unknown>;
  resumen: { cuenta: string; moneda: string; desde: string; hasta: string; campanas: number; conjuntos: number; anuncios: number; filas_rendimiento: number; horas: number };
}

// Arma todo lo que se guarda. `dias` = cuántos días hacia atrás (incluye hoy).
export async function leerMeta(cfg: MetaConfig, dias: number): Promise<ResultadoSync> {
  const c = await leer<Fila>(cfg, cfg.cuenta, { fields: CAMPOS_CUENTA });
  const moneda = String(c.currency ?? "USD");
  const tz = String(c.timezone_name ?? "America/Montevideo");
  const hasta = fechaEn(tz);
  const desde = fechaEn(tz, -(Math.max(1, dias) - 1));
  const filtro = [{ field: "effective_status", operator: "IN", value: ESTADOS_TODOS }];

  const [campanas, conjuntos, anuncios] = await Promise.all([
    leerTodo<Fila>(cfg, `${cfg.cuenta}/campaigns`, { fields: CAMPOS_CAMPANA, filtering: filtro }),
    leerTodo<Fila>(cfg, `${cfg.cuenta}/adsets`, { fields: CAMPOS_CONJUNTO, filtering: filtro }),
    leerTodo<Fila>(cfg, `${cfg.cuenta}/ads`, { fields: CAMPOS_ANUNCIO, filtering: filtro }),
  ]);

  const rango = { since: desde, until: hasta };
  const ayer = fechaEn(tz, -1);
  const [total, ubic, horas] = await Promise.all([
    leerTodo<Fila>(cfg, `${cfg.cuenta}/insights`, { level: "ad", time_increment: 1, time_range: rango, fields: CAMPOS_RENDIMIENTO }),
    leerTodo<Fila>(cfg, `${cfg.cuenta}/insights`, { level: "ad", time_increment: 1, time_range: rango, breakdowns: "publisher_platform,platform_position",
      fields: "date_start,ad_id,adset_id,campaign_id,spend,impressions,clicks,inline_link_clicks,actions,action_values" }),
    leerTodo<Fila>(cfg, `${cfg.cuenta}/insights`, { level: "account", time_increment: 1, time_range: { since: ayer, until: hasta },
      breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone", fields: "date_start,spend,impressions,clicks,inline_link_clicks" }),
  ]);

  const presupuestos = (o: Fila) => ({
    presupuesto_diario: montoCuenta(o.daily_budget, moneda), presupuesto_total: montoCuenta(o.lifetime_budget, moneda),
    presupuesto_restante: montoCuenta(o.budget_remaining, moneda),
  });
  const problemas = (o: Fila) => {
    const p = { issues_info: o.issues_info, ad_review_feedback: o.ad_review_feedback, learning_stage_info: o.learning_stage_info };
    return Object.values(p).some((x) => x !== undefined) ? p : null;
  };
  const base = (o: Fila, nivel: string) => ({
    id: o.id, nivel, cuenta_id: cfg.cuenta, nombre: o.name, estado: o.status ?? o.configured_status ?? null,
    estado_efectivo: o.effective_status ?? null, config: o, problemas: problemas(o), huella: huella(o), actualizado_meta: o.updated_time ?? null,
  });

  const objetos = [
    ...campanas.map((o) => ({ ...base(o, "campana"), campana_id: o.id, ...presupuestos(o), inicio: o.start_time ?? null, fin: o.stop_time ?? null })),
    ...conjuntos.map((o) => ({ ...base(o, "conjunto"), campana_id: o.campaign_id, conjunto_id: o.id, ...presupuestos(o), inicio: o.start_time ?? null, fin: o.end_time ?? null })),
    ...anuncios.map((o) => ({ ...base(o, "anuncio"), campana_id: o.campaign_id, conjunto_id: o.adset_id, ...utms(o) })),
  ];
  // Campañas y conjuntos heredan el utm_campaign de sus anuncios.
  const utmPor = new Map<string, string>();
  for (const a of objetos) if (a.nivel === "anuncio" && "utm_campaign" in a && a.utm_campaign) {
    utmPor.set(String(a.campana_id), a.utm_campaign); utmPor.set(String(a.conjunto_id), a.utm_campaign);
  }
  for (const o of objetos) if (o.nivel !== "anuncio") (o as Fila).utm_campaign = utmPor.get(String(o.id)) ?? null;

  const rendimiento = [
    ...total.map((r) => filaRendimiento(r, "total")),
    ...ubic.map((r) => filaRendimiento(r, `${r.publisher_platform ?? "?"}:${r.platform_position ?? "?"}`)),
  ];
  const filasHoras = horas.map((h) => ({
    fecha: h.date_start, hora: Number(String(h.hourly_stats_aggregated_by_advertiser_time_zone ?? "0").slice(0, 2)),
    gasto: num(h.spend) ?? 0, impresiones: num(h.impressions) ?? 0, clics: num(h.clicks) ?? 0, clics_enlace: num(h.inline_link_clicks) ?? 0,
  }));

  const cuenta = {
    id: c.id ?? cfg.cuenta, nombre: c.name ?? null, moneda, zona_horaria: tz, estado: num(c.account_status), motivo_deshabilitada: num(c.disable_reason),
    gastado_total: montoCuenta(c.amount_spent, moneda), limite_gasto: montoCuenta(c.spend_cap, moneda) || null, saldo: montoCuenta(c.balance, moneda), datos: c,
  };
  return {
    payload: { desde, hasta, cuenta, objetos, rendimiento, horas: filasHoras },
    resumen: { cuenta: String(cuenta.id), moneda, desde, hasta, campanas: campanas.length, conjuntos: conjuntos.length, anuncios: anuncios.length, filas_rendimiento: rendimiento.length, horas: filasHoras.length },
  };
}

// ── Guardado (REST de Supabase con la clave de servicio) ────────────────────
type Rest = (q: string, init?: RequestInit) => Promise<unknown>;

export async function sincronizar(rest: Rest, opciones: { dias: number; origen: "cron" | "manual" | "inicial" }) {
  const cfg = metaConfig();
  if (!cfg) return { ok: false as const, motivo: "sin_configurar" };
  const [registro] = (await rest("meta_ads_sync", {
    method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ origen: opciones.origen }),
  })) as { id: number }[];
  const cerrar = (campos: Record<string, unknown>) =>
    rest(`meta_ads_sync?id=eq.${registro.id}`, { method: "PATCH", body: JSON.stringify({ ...campos, terminado_at: new Date().toISOString() }) });
  try {
    const { payload, resumen } = await leerMeta(cfg, opciones.dias);
    const guardado = await rest("rpc/meta_ads_guardar", { method: "POST", body: JSON.stringify({ p: payload }) });
    await cerrar({ ok: true, desde: resumen.desde, hasta: resumen.hasta, conteos: { ...resumen, guardado } });
    return { ok: true as const, resumen, guardado };
  } catch (e) {
    let motivo = e instanceof Error ? e.message : String(e);
    // Sin permiso sobre la cuenta: se informa qué cuentas SÍ ve la clave, para
    // distinguir un número de cuenta equivocado de un permiso faltante.
    if (e instanceof MetaError && e.codigo === 200) {
      const visibles = await leerTodo<Fila>(cfg, "me/adaccounts", { fields: "account_id,name" })
        .then((l) => (l.length ? l.map((c) => `${c.name} (${c.account_id})`).join(", ") : "ninguna"))
        .catch((x) => `no se pudo consultar (${x instanceof Error ? x.message.slice(0, 120) : "error"})`);
      motivo += ` · Cuenta configurada: ${cfg.cuenta}. La clave puede ver: ${visibles}`;
    }
    await cerrar({ ok: false, error: motivo.slice(0, 500) }).catch(() => {});
    return { ok: false as const, motivo };
  }
}
