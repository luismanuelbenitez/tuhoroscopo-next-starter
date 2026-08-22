/**
 * lib/metaPixel.ts — Meta Pixel (browser) para Tu Oráculo.
 *
 * V1 — solo Pixel de browser, sin Conversions API ni Advanced Matching
 * (decisión explícita, ver docs/product/DECISIONS.md 2026-08-22).
 *
 * Best-effort: nunca lanza, nunca bloquea el flujo del usuario. Si el Pixel
 * no está inicializado (NEXT_PUBLIC_META_PIXEL_ID ausente, o el script
 * todavía no cargó), estas funciones son no-ops silenciosos.
 *
 * SIN PII: nunca enviar nombre, teléfono, email, fecha de nacimiento ni
 * — muy especialmente — la pregunta de Tarot, ni como parámetro estándar
 * ni como custom_data ni en ninguna URL.
 *
 * Mismo producto/taxonomía que lib/analytics.ts (PRODUCTS.tarot) — no se
 * inventa un content_id nuevo para Meta.
 */
import { PRODUCTS } from '@/lib/analytics';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function fbqCall(...args: unknown[]): void {
  try {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq(...args);
    }
  } catch { /* best-effort */ }
}

/** Se llama una vez al montar el Pixel y en cada cambio de ruta (SPA). */
export function metaPageView(): void {
  fbqCall('track', 'PageView');
}

/** Visita relevante a la landing de Tu Tirada. */
export function metaViewContent(valuePeso?: number): void {
  fbqCall('track', 'ViewContent', {
    content_type: 'product',
    content_ids:  [PRODUCTS.tarot.item_id],
    currency:     'UYU',
    value:        valuePeso ?? 0,
  });
}

/** Usuario aterrizó en /tarot/checkout con un precio verificado. */
export function metaInitiateCheckout(valuePeso: number): void {
  fbqCall('track', 'InitiateCheckout', {
    content_type: 'product',
    content_ids:  [PRODUCTS.tarot.item_id],
    currency:     'UYU',
    value:        valuePeso,
  });
}

/**
 * Compra confirmada — SOLO debe llamarse cuando el servidor ya confirmó
 * can_fire_purchase: true (mismo gate server-side que trackPurchase() de
 * GA4, ver /api/tarot/log-retorno). eventId = external_reference de la
 * orden: identifica el Purchase de forma estable y queda disponible para
 * deduplicación Pixel+CAPI si algún día se implementa Conversions API
 * (no implementado en este sprint).
 */
export function metaPurchase(params: {
  eventId:  string;
  value:    number;
  currency?: string;
}): void {
  fbqCall(
    'track',
    'Purchase',
    {
      content_type: 'product',
      content_ids:  [PRODUCTS.tarot.item_id],
      currency:     params.currency ?? 'UYU',
      value:        params.value,
    },
    { eventID: params.eventId },
  );
}
