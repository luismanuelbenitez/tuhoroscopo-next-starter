/**
 * lib/analytics.ts — Tu Oráculo analytics layer
 *
 * Best-effort: nunca lanza, nunca bloquea el flujo del usuario.
 * GA4: sin PII — sin nombres, teléfonos, emails ni texto personal.
 * Eventos internos: se persisten en funnel_events vía /api/analytics/event.
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

// ── Anonymous session ID (por tab, no persiste entre tabs) ────────────────

const SESSION_SS_KEY = 'tuo_fsid';

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = sessionStorage.getItem(SESSION_SS_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_SS_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

// ── GA4 ───────────────────────────────────────────────────────────────────

function ga(event: string, params?: Record<string, unknown>): void {
  try {
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', event, params);
    }
  } catch { /* best-effort */ }
}

// ── Evento interno (persistido en funnel_events, sin límite de PII) ───────

function internalEvent(eventName: string, extra: Record<string, unknown> = {}): void {
  try {
    fetch('/api/analytics/event', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify({
        event_name: eventName,
        session_id: getOrCreateSessionId(),
        path:       typeof window !== 'undefined' ? window.location.pathname : undefined,
        ...extra,
      }),
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ });
  } catch { /* non-blocking */ }
}

// ── API pública ───────────────────────────────────────────────────────────

/** Evento GA4 genérico. */
export function trackEvent(eventName: string, params?: Record<string, unknown>): void {
  ga(eventName, params);
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
