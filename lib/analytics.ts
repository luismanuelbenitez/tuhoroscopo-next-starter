/**
 * lib/analytics.ts — Tu Oráculo analytics layer
 *
 * Best-effort: nunca lanza, nunca bloquea el flujo del usuario.
 * GA4: sin PII — sin nombres, teléfonos, emails ni texto personal.
 * Eventos internos: se persisten en funnel_events vía /api/analytics/event.
 *
 * Inteligencia de visitantes (2026-10-22):
 *  - Sesión de 30 min de inactividad, compartida entre pestañas (localStorage),
 *    con su procedencia (referrer, UTMs, fbclid/gclid) capturada al iniciar.
 *    Es la MISMA que viaja a la orden (tarot_ordenes.funnel_session_id).
 *  - Visitante anónimo (UUID aleatorio en localStorage) para medir recurrencia.
 *    Sin fingerprinting ni datos personales.
 *  - REGLA: la experiencia nunca espera por la analítica. Los eventos se
 *    encolan y se envían con navigator.sendBeacon (el navegador los manda en
 *    segundo plano, incluso al cerrar la página); fetch keepalive como respaldo.
 *  - Rutas con tokens privados se enmascaran antes de salir del navegador.
 */

export const PRODUCTS = {
  tarot: {
    item_id:       'tarot_one_shot',
    item_name:     'Lectura de tarot personalizada',
    item_category: 'tarot',
  },
  horoscopo: {
    item_id:       'horoscopo_diario',
    item_name:     'Horóscopo diario por WhatsApp',
    item_category: 'horoscopo',
  },
} as const;

export type ProductKey = keyof typeof PRODUCTS;

// ── Attribution / UTM ──────────────────────────────────────────────────────

const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const ATTRIBUTION_LS_KEY = 'tuo_attribution';
const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export interface Attribution {
  utm_source?:   string;
  utm_medium?:   string;
  utm_campaign?: string;
  utm_content?:  string;
  utm_term?:     string;
  referrer?:     string;
  landing_path?: string;
  captured_at:   number;
}

/**
 * Llamar en cada carga de página.
 * Si la URL tiene UTMs → siempre actualiza (nueva campaña).
 * Si no hay UTMs y ya hay atribución válida → la preserva.
 */
export function storeAttributionFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url    = new URL(window.location.href);
    const hasUtm = UTM_FIELDS.some(k => url.searchParams.has(k));

    if (!hasUtm) {
      const existing = getStoredAttribution();
      if (existing) return;
    }

    const attr: Attribution = { captured_at: Date.now(), landing_path: window.location.pathname };
    if (document.referrer) attr.referrer = document.referrer;
    UTM_FIELDS.forEach(k => {
      const v = url.searchParams.get(k);
      if (v) (attr as unknown as Record<string, unknown>)[k] = v;
    });
    localStorage.setItem(ATTRIBUTION_LS_KEY, JSON.stringify(attr));
  } catch { /* non-blocking */ }
}

export function getStoredAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ATTRIBUTION_LS_KEY);
    if (!raw) return null;
    const attr: Attribution = JSON.parse(raw);
    if (Date.now() - attr.captured_at > ATTRIBUTION_TTL_MS) {
      localStorage.removeItem(ATTRIBUTION_LS_KEY);
      return null;
    }
    return attr;
  } catch {
    return null;
  }
}

// ── Rutas privadas: nunca sale un token del navegador ──────────────────────

const RUTAS_CON_TOKEN = [/^\/lectura\/[^/]+/, /^\/opinion\/[^/]+/, /^\/pdf\/[^/]+/, /^\/api\/lectura\/[^/]+/];

/** "/lectura/abc123" → "/lectura/[token]". Recorta a 200 caracteres. */
export function sanitizarPath(path: string): string {
  let p = (path || '/').split('?')[0].split('#')[0];
  for (const re of RUTAS_CON_TOKEN) {
    if (re.test(p)) { p = p.replace(re, (m) => m.split('/').slice(0, -1).join('/') + '/[token]'); break; }
  }
  return p.slice(0, 200) || '/';
}

// ── Sesión (30 min de inactividad) y visitante ──────────────────────────────

const SESION_LS_KEY = 'tuo_ses';
const SESSION_SS_KEY = 'tuo_fsid'; // respaldo si localStorage no está disponible
const VISITANTE_LS_KEY = 'tuo_vid';
const SESION_INACTIVIDAD_MS = 30 * 60 * 1000;

interface ContextoSesion {
  landing_path: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: boolean;
  gclid?: boolean;
}
interface Sesion { id: string; ultimo: number; ctx: ContextoSesion }

function nuevoId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function contextoDeLlegada(): ContextoSesion {
  const url = new URL(window.location.href);
  const ctx: ContextoSesion = { landing_path: sanitizarPath(url.pathname) };
  try {
    // Solo el referrer externo cuenta como procedencia (navegación interna no).
    if (document.referrer && new URL(document.referrer).host !== window.location.host) ctx.referrer = document.referrer.slice(0, 300);
  } catch { /* referrer inválido */ }
  UTM_FIELDS.forEach(k => {
    const v = url.searchParams.get(k);
    if (v) (ctx as unknown as Record<string, unknown>)[k] = v.slice(0, 120);
  });
  if (url.searchParams.has('fbclid')) ctx.fbclid = true;
  if (url.searchParams.has('gclid')) ctx.gclid = true;
  return ctx;
}

function obtenerSesion(): Sesion | null {
  if (typeof window === 'undefined') return null;
  try {
    const ahora = Date.now();
    const raw = localStorage.getItem(SESION_LS_KEY);
    const actual: Sesion | null = raw ? JSON.parse(raw) : null;
    // Una URL de campaña nueva abre sesión nueva aunque la anterior siga viva.
    const llegaConCampana = new URL(window.location.href).searchParams.has('utm_campaign');
    const campanaDistinta = llegaConCampana && actual?.ctx?.utm_campaign !== new URL(window.location.href).searchParams.get('utm_campaign');
    if (actual && ahora - actual.ultimo < SESION_INACTIVIDAD_MS && !campanaDistinta) {
      actual.ultimo = ahora;
      localStorage.setItem(SESION_LS_KEY, JSON.stringify(actual));
      return actual;
    }
    const s: Sesion = { id: nuevoId(), ultimo: ahora, ctx: contextoDeLlegada() };
    localStorage.setItem(SESION_LS_KEY, JSON.stringify(s));
    return s;
  } catch {
    return null;
  }
}

function obtenerVisitante(): string {
  try {
    let v = localStorage.getItem(VISITANTE_LS_KEY);
    if (!v) { v = nuevoId(); localStorage.setItem(VISITANTE_LS_KEY, v); }
    return v;
  } catch {
    return '';
  }
}

/** Id de la sesión actual (el mismo que viaja a la orden). */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  const s = obtenerSesion();
  if (s) return s.id;
  try {
    let id = sessionStorage.getItem(SESSION_SS_KEY);
    if (!id) { id = nuevoId(); sessionStorage.setItem(SESSION_SS_KEY, id); }
    return id;
  } catch {
    return '';
  }
}

function rangoPantalla(): string {
  try {
    const w = window.screen?.width ?? window.innerWidth;
    if (w < 360) return '<360';
    if (w < 414) return '360-413';
    if (w < 768) return '414-767';
    if (w < 1024) return '768-1023';
    if (w < 1440) return '1024-1439';
    return '1440+';
  } catch {
    return '';
  }
}

// ── Cola de eventos (nunca bloquea) ─────────────────────────────────────────

type EventoCola = { event_name: string; path?: string; product_id?: string; product_name?: string; value?: number; currency?: string };
const ENDPOINT = '/api/analytics/event';
const MAX_LOTE = 20;
let cola: EventoCola[] = [];
let temporizador: ReturnType<typeof setTimeout> | null = null;
let escuchando = false;

function enviarLote(): void {
  temporizador = null;
  if (!cola.length) return;
  try {
    const s = obtenerSesion();
    const sessionId = s?.id ?? getOrCreateSessionId();
    if (!sessionId) { cola = []; return; }
    const lote = cola.splice(0, MAX_LOTE);
    const body = JSON.stringify({
      sesion: { session_id: sessionId, visitor_id: obtenerVisitante(), screen_bucket: rangoPantalla(), ...(s?.ctx ?? {}) },
      eventos: lote,
    });
    let enviado = false;
    try {
      enviado = typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
        && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } catch { enviado = false; }
    if (!enviado) {
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
    if (cola.length) enviarLote();
  } catch { /* fire-and-forget */ }
}

function escucharSalida(): void {
  if (escuchando || typeof window === 'undefined') return;
  escuchando = true;
  try {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviarLote(); });
    window.addEventListener('pagehide', enviarLote);
  } catch { /* non-blocking */ }
}

function internalEvent(eventName: string, extra: Omit<EventoCola, 'event_name'> = {}): void {
  try {
    if (typeof window === 'undefined') return;
    if (window.location.pathname.startsWith('/admin')) return;
    escucharSalida();
    cola.push({
      event_name: eventName,
      path: sanitizarPath(extra.path ?? window.location.pathname),
      ...(extra.product_id ? { product_id: extra.product_id } : {}),
      ...(extra.product_name ? { product_name: extra.product_name } : {}),
      ...(typeof extra.value === 'number' ? { value: extra.value } : {}),
      ...(extra.currency ? { currency: extra.currency } : {}),
    });
    // Agrupa los eventos de los próximos 2 s en una sola llamada; al salir de
    // la página se envía lo pendiente en el acto.
    if (cola.length >= MAX_LOTE) enviarLote();
    else if (!temporizador) temporizador = setTimeout(enviarLote, 2000);
  } catch { /* non-blocking */ }
}

// ── GA4 ───────────────────────────────────────────────────────────────────

function ga(event: string, params?: Record<string, unknown>): void {
  try {
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', event, params);
    }
  } catch { /* best-effort */ }
}

// ── API pública ───────────────────────────────────────────────────────────

/** Evento GA4 genérico. */
export function trackEvent(eventName: string, params?: Record<string, unknown>): void {
  ga(eventName, params);
}

/** Página vista (evento interno; el page_view de GA4 sigue siendo automático).
 *  La misma ruta dentro de 1,5 s no se vuelve a contar (re-montajes, doble efecto). */
let ultimaVista: { path: string; t: number } | null = null;
export function trackPageView(path?: string): void {
  const p = sanitizarPath(path ?? (typeof window !== 'undefined' ? window.location.pathname : '/'));
  const ahora = Date.now();
  if (ultimaVista && ultimaVista.path === p && ahora - ultimaVista.t < 1500) return;
  ultimaVista = { path: p, t: ahora };
  internalEvent('page_view', { path: p });
}

/** Landing del producto cargada (view_item en GA4). */
export function trackViewItem(productKey: ProductKey, valuePeso?: number): void {
  const p = PRODUCTS[productKey];
  ga('view_item', {
    currency: 'UYU',
    value:    valuePeso ?? 0,
    items:    [{ ...p, price: valuePeso ?? 0, quantity: 1 }],
  });
  internalEvent('product_viewed', {
    product_id:   p.item_id,
    product_name: p.item_name,
    value:        valuePeso,
    currency:     'UYU',
  });
}

/** El usuario aterrizó en la página de checkout (begin_checkout en GA4). */
export function trackBeginCheckout(productKey: ProductKey, valuePeso: number): void {
  const p = PRODUCTS[productKey];
  ga('begin_checkout', {
    currency: 'UYU',
    value:    valuePeso,
    items:    [{ ...p, price: valuePeso, quantity: 1 }],
  });
  internalEvent('checkout_started', {
    product_id:   p.item_id,
    product_name: p.item_name,
    value:        valuePeso,
    currency:     'UYU',
  });
}

/**
 * Evento purchase de GA4.
 * Solo debe llamarse cuando el servidor confirma can_fire_purchase: true.
 * La deduplicación es responsabilidad del servidor (analytics_purchase_sent_at).
 */
export function trackPurchase(params: {
  transactionId: string;
  productKey:    ProductKey;
  value:         number;
  currency?:     string;
}): void {
  const p = PRODUCTS[params.productKey];
  ga('purchase', {
    transaction_id: params.transactionId,
    currency:       params.currency ?? 'UYU',
    value:          params.value,
    items:          [{ ...p, price: params.value, quantity: 1 }],
  });
}

/** Landing page visualizada (evento interno, page_view de GA4 es automático). */
export function trackLandingViewed(productKey?: ProductKey): void {
  internalEvent('landing_viewed', {
    product_id: productKey ? PRODUCTS[productKey].item_id : undefined,
  });
}

// ── Tráfico propio (pruebas internas) ───────────────────────────────────────

export const COOKIE_INTERNO = 'tuo_interno';

/** true si este navegador está marcado como tráfico propio. */
export function esTraficoInterno(): boolean {
  try {
    return typeof document !== 'undefined' && document.cookie.split('; ').some((c) => c === `${COOKIE_INTERNO}=1`);
  } catch {
    return false;
  }
}

/**
 * ?interno=1 marca este navegador como tráfico propio (1 año); ?interno=0 lo
 * desmarca. Sirve para celulares de prueba. El login del admin lo marca solo.
 */
export function aplicarMarcaInternaDesdeUrl(): void {
  try {
    const v = new URL(window.location.href).searchParams.get('interno');
    if (v === '1') document.cookie = `${COOKIE_INTERNO}=1; Max-Age=${365 * 86400}; Path=/; SameSite=Lax`;
    if (v === '0') document.cookie = `${COOKIE_INTERNO}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch { /* non-blocking */ }
}
