// Inteligencia de visitantes (2026-10-22) — clasificación en el servidor.
//
// Del user agent y el referrer se derivan SOLO campos agregables (tipo de
// dispositivo, SO, navegador, navegador interno de Instagram/Facebook, fuente).
// El user agent completo y la IP no se guardan. Sin dependencias: regex
// simples sobre las familias que importan para el negocio.

export type Dispositivo = "movil" | "tablet" | "escritorio";

export interface Tecnico {
  device_type: Dispositivo;
  os: string;
  browser: string;
  in_app: "instagram" | "facebook" | null;
  es_bot: boolean;
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp\/|curl|wget|python-requests|axios|node-fetch|go-http/i;

export function analizarUserAgent(ua: string): Tecnico {
  const u = ua || "";
  const in_app = /Instagram/i.test(u) ? "instagram" : /FBAN|FBAV|FB_IAB|FBIOS/i.test(u) ? "facebook" : null;

  let os = "Otro";
  if (/iPhone|iPod/i.test(u)) os = "iOS";
  else if (/iPad/i.test(u) || (/Macintosh/i.test(u) && /Mobile/i.test(u))) os = "iPadOS";
  else if (/Android/i.test(u)) os = "Android";
  else if (/Windows/i.test(u)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(u)) os = "macOS";
  else if (/CrOS/i.test(u)) os = "ChromeOS";
  else if (/Linux/i.test(u)) os = "Linux";

  let browser = "Otro";
  if (/SamsungBrowser/i.test(u)) browser = "Samsung Internet";
  else if (/Edg\//i.test(u)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(u)) browser = "Opera";
  else if (/Firefox|FxiOS/i.test(u)) browser = "Firefox";
  else if (/CriOS|Chrome\//i.test(u)) browser = "Chrome";
  else if (/Safari\//i.test(u)) browser = "Safari";

  let device_type: Dispositivo = "escritorio";
  if (os === "iPadOS" || (/Android/i.test(u) && !/Mobile/i.test(u)) || /Tablet/i.test(u)) device_type = "tablet";
  else if (/Mobi|iPhone|iPod|Android/i.test(u)) device_type = "movil";

  return { device_type, os, browser, in_app, es_bot: BOT.test(u) };
}

const BUSCADORES = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|yandex|baidu)\./i;

/** Host del referrer (sin "www."), o null. */
export function hostReferrer(referrer: string | undefined | null): string | null {
  if (!referrer) return null;
  try { return new URL(referrer).hostname.replace(/^www\./, "").slice(0, 120); } catch { return null; }
}

/**
 * Fuente de la sesión, en categorías útiles para decidir:
 * Meta Ads · Google Ads · Instagram · Facebook · Google orgánico · Otros buscadores ·
 * WhatsApp · Email · Campaña (otra) · Referencia · Directo.
 */
export function clasificarFuente(p: {
  utm_source?: string | null; utm_medium?: string | null; referrerHost: string | null;
  fbclid?: boolean; gclid?: boolean; in_app: string | null;
}): string {
  const src = (p.utm_source ?? "").toLowerCase();
  const med = (p.utm_medium ?? "").toLowerCase();
  const pago = /cpc|ppc|paid|ads?$|cpm|paidsocial|paid_social/.test(med);
  const esMeta = /^(facebook|fb|instagram|ig|meta|an|messenger)$/.test(src);
  if ((esMeta && (pago || p.fbclid)) || (src === "meta")) return "Meta Ads";
  if (p.gclid || (src === "google" && pago)) return "Google Ads";
  if (src === "whatsapp" || src === "wa") return "WhatsApp";
  if (src === "email" || med === "email") return "Email";
  if (esMeta || p.fbclid) {
    if (/instagram|^ig$/.test(src) || p.in_app === "instagram") return "Instagram";
    return "Facebook";
  }
  if (src) return "Campaña (otra)";

  const h = p.referrerHost ?? "";
  if (/(^|\.)instagram\.com$/.test(h)) return "Instagram";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(h)) return "Facebook";
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(h)) return "WhatsApp";
  if (/(^|\.)google\./.test(h)) return "Google orgánico";
  if (BUSCADORES.test(h)) return "Otros buscadores";
  if (h) return "Referencia";
  // Los navegadores internos de Instagram/Facebook muchas veces no mandan referrer.
  if (p.in_app === "instagram") return "Instagram";
  if (p.in_app === "facebook") return "Facebook";
  return "Directo";
}
