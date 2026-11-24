// Inteligencia comercial (2026-11-24): fuente ÚNICA del gasto publicitario.
//
// Antes cada pantalla leía solo campaign_costs, donde entra Meta (automático,
// "auto:meta") y lo que se carga a mano. El gasto de Google Ads vive en
// google_ads_rendimiento (lo escribe el sync de la cuenta) y no se contaba:
// Presupuesto y el Panel estratégico mostraban un CAC y un resultado mejores
// que los reales. Desde ahora todos leen el gasto de acá:
//   - Google Ads: google_ads_rendimiento (moneda de la cuenta, USD).
//   - Meta y otros: campaign_costs.
//   - Filas de campaign_costs con plataforma "google" solo cuentan en días
//     que el sync todavía no cubría (evita contar dos veces lo mismo).
// Solo lectura.

import { NOMBRE_CANAL, type Canal } from "./canales";
export type { Canal };

export interface FilaGasto {
  fecha: string; // YYYY-MM-DD (día de la plataforma)
  canal: Canal;
  campana: string; // nombre legible
  monto: number;
  moneda: string; // "USD" | "UYU"
  impresiones: number | null;
  clics: number | null;
  /** Conversiones que informa la plataforma (no son ventas cobradas: sirven para compararlas). */
  conversiones: number | null;
}

type Get = (q: string) => Promise<unknown>;

export async function gastoPublicitario(getRaw: Get, desde: string, monedaGoogle = "USD"): Promise<FilaGasto[]> {
  const get = getRaw as (q: string) => Promise<any>;
  const [google, primeraGoogle, manual, meta, campanas] = (await Promise.all([
    get(`google_ads_rendimiento?fecha=gte.${desde}&select=fecha,campana_id,costo,impresiones,clics,conversiones&order=fecha.asc&limit=10000`),
    get(`google_ads_rendimiento?select=fecha&order=fecha.asc&limit=1`),
    get(`campaign_costs?date=gte.${desde}&select=date,platform,utm_campaign,amount,currency&limit=10000`),
    get(`meta_ads_rendimiento?fecha=gte.${desde}&select=fecha,impresiones,clics_enlace,compras&limit=50000`).catch(() => []),
    get(`google_ads_datos?clave=eq.campanas&select=datos`).catch(() => []),
  ])) as [
    { fecha: string; campana_id: string; costo: number | string; impresiones: number; clics: number; conversiones: number | string | null }[],
    { fecha: string }[],
    { date: string; platform: string | null; utm_campaign: string | null; amount: number | string; currency: string | null }[],
    { fecha: string; impresiones: number | null; clics_enlace: number | null; compras: number | null }[],
    { datos: { id: string; nombre: string }[] | null }[],
  ];

  const nombreCampana = new Map((campanas[0]?.datos ?? []).map((c) => [String(c.id), c.nombre]));
  const syncDesde = primeraGoogle[0]?.fecha ?? null;
  const filas: FilaGasto[] = google.map((g) => ({
    fecha: g.fecha, canal: "google_ads", campana: nombreCampana.get(String(g.campana_id)) ?? `Google Ads ${g.campana_id}`,
    monto: Number(g.costo) || 0, moneda: monedaGoogle, impresiones: g.impresiones ?? 0, clics: g.clics ?? 0,
    conversiones: Number(g.conversiones) || 0,
  }));

  // Impresiones, clics de enlace y compras informadas de Meta por día (el gasto de Meta sale de campaign_costs).
  const metaDia = new Map<string, { impresiones: number; clics: number; compras: number }>();
  for (const m of meta) {
    const d = metaDia.get(m.fecha) ?? { impresiones: 0, clics: 0, compras: 0 };
    d.impresiones += Number(m.impresiones) || 0; d.clics += Number(m.clics_enlace) || 0; d.compras += Number(m.compras) || 0;
    metaDia.set(m.fecha, d);
  }
  const metaUsado = new Set<string>();
  for (const c of manual) {
    const plataforma = (c.platform ?? "").toLowerCase();
    const canal: Canal = plataforma === "google" ? "google_ads" : plataforma === "meta" ? "meta_ads" : "otro";
    if (canal === "google_ads" && syncDesde && c.date >= syncDesde) continue;
    // Impresiones y clics de Meta: una sola vez por día (puede haber varias campañas el mismo día).
    let impresiones: number | null = null, clics: number | null = null, conversiones: number | null = null;
    if (canal === "meta_ads" && !metaUsado.has(c.date) && metaDia.has(c.date)) {
      const m = metaDia.get(c.date)!;
      impresiones = m.impresiones; clics = m.clics; conversiones = m.compras; metaUsado.add(c.date);
    }
    filas.push({ fecha: c.date, canal, campana: c.utm_campaign ?? NOMBRE_CANAL[canal], monto: Number(c.amount) || 0, moneda: c.currency === "USD" ? "USD" : "UYU", impresiones, clics, conversiones });
  }
  return filas;
}
