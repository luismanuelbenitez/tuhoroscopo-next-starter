// Cliente de la API de Google Ads — SOLO LECTURA (2026-11-04).
//
// Único punto de contacto con Google Ads. Solo hace consultas GAQL (SELECT)
// con googleAds:search. REGLA MÁXIMA (lib/reglaMaxima.ts): cada pedido pasa
// por asegurarSoloLectura() y cada consulta por asegurarConsultaGaql(); no
// existe ninguna función que cree, edite, pause o cambie presupuestos.
// Desde septiembre de 2026 Google no usa token de desarrollador: el acceso es
// del proyecto de Google Cloud ("Tu Oraculo Ads", nivel Explorer).
//
// Variables (Vercel y .env.local): GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
// GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC 404-786-5231),
// GOOGLE_ADS_CUSTOMER_ID (cuenta de anuncios 315-139-7440). Opcional:
// GOOGLE_ADS_API_VERSION (por defecto v26).

import { asegurarConsultaGaql, asegurarSoloLectura } from "@/lib/reglaMaxima";

const VERSION = process.env.GOOGLE_ADS_API_VERSION || "v26";
const BASE = `https://googleads.googleapis.com/${VERSION}`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleAdsConfig { clientId: string; clientSecret: string; refreshToken: string; mcc: string; cuenta: string }

const limpiar = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "").trim() ?? "";
const digitos = (v: string | undefined) => limpiar(v).replace(/\D/g, "");

export function googleAdsConfig(): GoogleAdsConfig | null {
  const c = {
    clientId: limpiar(process.env.GOOGLE_ADS_CLIENT_ID), clientSecret: limpiar(process.env.GOOGLE_ADS_CLIENT_SECRET),
    refreshToken: limpiar(process.env.GOOGLE_ADS_REFRESH_TOKEN),
    mcc: digitos(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID), cuenta: digitos(process.env.GOOGLE_ADS_CUSTOMER_ID),
  };
  if (!c.clientId || !c.clientSecret || !c.refreshToken || !/^\d{10}$/.test(c.cuenta)) return null;
  return c;
}

export class GoogleAdsError extends Error {
  constructor(mensaje: string, public status: number | null = null) { super(mensaje); this.name = "GoogleAdsError"; }
}

// El acceso dura ~1 h: se guarda en memoria de la instancia y se renueva antes de vencer.
let acceso: { token: string; vence: number } | null = null;
async function tokenDeAcceso(cfg: GoogleAdsConfig): Promise<string> {
  if (acceso && acceso.vence > Date.now() + 60_000) return acceso.token;
  asegurarSoloLectura("google", "POST", TOKEN_URL);
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) {
    const motivo = j.error === "invalid_grant" ? "la autorización venció o se revocó: hay que volver a correr scripts/google-ads-autorizar.mjs" : (j.error_description ?? j.error ?? `HTTP ${r.status}`);
    throw new GoogleAdsError(`No se pudo renovar el acceso a Google: ${motivo}`, r.status);
  }
  acceso = { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return acceso.token;
}

function mensajeError(cuerpo: unknown, status: number): string {
  const e = (cuerpo as { error?: { message?: string; details?: { errors?: { message?: string; errorCode?: Record<string, string> }[] }[] } })?.error;
  const det = e?.details?.flatMap((d) => d.errors ?? []).map((x) => `${Object.values(x.errorCode ?? {}).join("/")}: ${x.message}`).filter(Boolean).join(" · ");
  return det || e?.message || `HTTP ${status}`;
}

/** Consulta GAQL (solo SELECT). Sigue la paginación (tope: 20 páginas). */
export async function consultar<T = Record<string, unknown>>(cfg: GoogleAdsConfig, query: string): Promise<T[]> {
  asegurarConsultaGaql(query);
  const url = `${BASE}/customers/${cfg.cuenta}/googleAds:search`;
  asegurarSoloLectura("google", "POST", url);
  const filas: T[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 20; i++) {
    const headers: Record<string, string> = { Authorization: `Bearer ${await tokenDeAcceso(cfg)}`, "Content-Type": "application/json" };
    if (/^\d{10}$/.test(cfg.mcc)) headers["login-customer-id"] = cfg.mcc;
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }), cache: "no-store" });
    const cuerpo = await r.json().catch(() => null);
    if (!r.ok) throw new GoogleAdsError(mensajeError(cuerpo, r.status), r.status);
    filas.push(...(((cuerpo as { results?: T[] })?.results) ?? []));
    pageToken = (cuerpo as { nextPageToken?: string })?.nextPageToken;
    if (!pageToken) break;
  }
  return filas;
}
