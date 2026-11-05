// Velocidad de la página de destino de Google Ads (2026-11-05). Google Ads no
// informa su "puntaje de velocidad móvil" con tan pocos clics, así que se mide
// con PageSpeed Insights (el mismo motor, Lighthouse) una vez por día desde la
// sincronización horaria. Con PAGESPEED_API_KEY (gratis, Google Cloud) usa su
// propio cupo; sin clave usa el cupo compartido, que a veces se agota.
// Solo lectura: no toca la cuenta ni la web.

export const URL_DESTINO = "https://tuoraculo.uy/tarot";

export interface MedicionDispositivo {
  rendimiento: number | null;
  lcp_ms: number | null;
  fcp_ms: number | null;
  tbt_ms: number | null;
  cls: number | null;
  // Datos de visitantes reales de Chrome (CrUX), si Google tiene suficientes.
  real: { lcp_ms: number | null; categoria: string | null } | null;
  error?: string;
}
export interface VelocidadPagina {
  url: string;
  medido_at: string;
  movil: MedicionDispositivo;
  escritorio: MedicionDispositivo;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function medir(url: string, estrategia: "mobile" | "desktop"): Promise<MedicionDispositivo> {
  const clave = process.env.PAGESPEED_API_KEY?.trim();
  // utm_source=pagespeed: estas visitas se marcan internas en el embudo.
  const destino = `${url}?utm_source=pagespeed`;
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(destino)}&strategy=${estrategia}&category=performance${clave ? `&key=${clave}` : ""}`;
  try {
    const r = await fetch(api, { cache: "no-store", signal: AbortSignal.timeout(90_000) });
    const j = await r.json();
    if (!r.ok || j.error) {
      const msg = String(j.error?.message ?? r.status);
      return { rendimiento: null, lcp_ms: null, fcp_ms: null, tbt_ms: null, cls: null, real: null, error: /quota/i.test(msg) ? "cupo_agotado" : msg.slice(0, 160) };
    }
    const a = j.lighthouseResult?.audits ?? {};
    const real = j.loadingExperience?.metrics?.LARGEST_CONTENTFUL_PAINT_MS;
    return {
      rendimiento: num(j.lighthouseResult?.categories?.performance?.score) != null ? Math.round(j.lighthouseResult.categories.performance.score * 100) : null,
      lcp_ms: num(a["largest-contentful-paint"]?.numericValue),
      fcp_ms: num(a["first-contentful-paint"]?.numericValue),
      tbt_ms: num(a["total-blocking-time"]?.numericValue),
      cls: num(a["cumulative-layout-shift"]?.numericValue),
      real: real ? { lcp_ms: num(real.percentile), categoria: real.category ?? null } : null,
    };
  } catch (e) {
    return { rendimiento: null, lcp_ms: null, fcp_ms: null, tbt_ms: null, cls: null, real: null, error: e instanceof Error ? e.message.slice(0, 160) : "error" };
  }
}

export async function medirVelocidad(url = URL_DESTINO): Promise<VelocidadPagina> {
  const [movil, escritorio] = await Promise.all([medir(url, "mobile"), medir(url, "desktop")]);
  return { url, medido_at: new Date().toISOString(), movil, escritorio };
}
