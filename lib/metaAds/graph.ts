// Cliente de la API de anuncios de Meta — SOLO LECTURA (2026-11-02).
//
// Único punto de contacto con Meta Ads. Solo hace GET: no existe ninguna
// función que cree, edite o pause nada, y además la clave (usuario del
// sistema con permiso ads_read) no lo permitiría. La clave viaja en el
// encabezado Authorization, nunca en la URL, así no queda en registros.
//
// Variables (Vercel): META_ADS_TOKEN, META_ADS_ACCOUNT_ID (act_… o solo el
// número). Opcional: META_ADS_GRAPH_VERSION. META_ADS_GRAPH_BASE solo se
// respeta fuera de producción (pruebas contra un servidor simulado).

const VERSION = process.env.META_ADS_GRAPH_VERSION || "v26.0";
const BASE_OFICIAL = `https://graph.facebook.com/${VERSION}`;

export function graphBase(): string {
  const alt = process.env.META_ADS_GRAPH_BASE;
  return alt && process.env.VERCEL_ENV !== "production" ? alt.replace(/\/$/, "") : BASE_OFICIAL;
}

export interface MetaConfig { token: string; cuenta: string }

export function metaConfig(): MetaConfig | null {
  const token = process.env.META_ADS_TOKEN?.trim();
  const id = process.env.META_ADS_ACCOUNT_ID?.trim().replace(/^act_/, "");
  if (!token || !id || !/^\d{5,25}$/.test(id)) return null;
  return { token, cuenta: `act_${id}` };
}

export class MetaError extends Error {
  constructor(message: string, readonly codigo?: number, readonly subcodigo?: number) { super(message); }
}

// Mensaje legible y sin datos sensibles (la clave nunca está en la URL).
function errorDe(status: number, cuerpo: unknown): MetaError {
  const e = (cuerpo as { error?: { message?: string; code?: number; error_subcode?: number } })?.error;
  return new MetaError(`Meta ${status}: ${(e?.message ?? "error desconocido").slice(0, 300)}`, e?.code, e?.error_subcode);
}

type Params = Record<string, string | number | boolean | object | undefined>;

function armarUrl(ruta: string, params: Params): string {
  const u = new URL(`${graphBase()}/${ruta.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    u.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return u.toString();
}

async function pedir(url: string, token: string): Promise<Record<string, unknown>> {
  // Las páginas siguientes las arma Meta: solo se siguen si son del mismo host.
  if (new URL(url).host !== new URL(graphBase()).host) throw new MetaError("Paginación hacia otro host: descartada");
  for (let intento = 0; ; intento++) {
    const r = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const cuerpo = await r.json().catch(() => null);
    if (r.ok && cuerpo) return cuerpo as Record<string, unknown>;
    const err = errorDe(r.status, cuerpo);
    // Límite de frecuencia o error transitorio: un par de reintentos con espera.
    const transitorio = r.status >= 500 || [1, 2, 4, 17, 32, 613].includes(err.codigo ?? -1);
    if (!transitorio || intento >= 2) throw err;
    await new Promise((ok) => setTimeout(ok, 1500 * (intento + 1)));
  }
}

export async function leer<T = Record<string, unknown>>(cfg: MetaConfig, ruta: string, params: Params = {}): Promise<T> {
  return (await pedir(armarUrl(ruta, params), cfg.token)) as T;
}

// Lista completa siguiendo la paginación (tope de seguridad: 50 páginas).
export async function leerTodo<T = Record<string, unknown>>(cfg: MetaConfig, ruta: string, params: Params = {}): Promise<T[]> {
  const filas: T[] = [];
  let url: string | null = armarUrl(ruta, { limit: 200, ...params });
  for (let i = 0; url && i < 50; i++) {
    const r = await pedir(url, cfg.token);
    filas.push(...((r.data as T[]) ?? []));
    url = ((r.paging as { next?: string } | undefined)?.next) ?? null;
  }
  return filas;
}
