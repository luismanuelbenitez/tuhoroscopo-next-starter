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

interface FbqStub {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: FbqStub;
}

declare global {
  interface Window {
    fbq?: FbqStub;
    _fbq?: FbqStub;
  }
}

// NEXT_PUBLIC_* se inlinea en build time — disponible en cualquier módulo
// cliente sin prop-drilling. Mismo valor que ya lee app/layout.tsx para
// decidir si monta <MetaPixel>.
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/**
 * Garantiza que window.fbq exista como el stub de cola oficial de Meta y
 * que fbevents.js esté cargándose — el MISMO bootstrap que ya trae el
 * <Script> inline de components/MetaPixel.tsx, con el mismo guard
 * `if (f.fbq) return` que usa Meta — así que da igual cuál de los dos
 * corra primero: el segundo en ejecutarse encuentra `window.fbq` ya
 * definido y no hace nada (no recarga fbevents.js, no crea un segundo
 * stub, no duplica nada).
 *
 * Por qué hace falta ACÁ también, no solo en el <Script> del layout
 * (hallazgo real, 2026-09-21): no hay garantía de orden entre el
 * useEffect de un componente cualquiera (p.ej. TarotEstadoContent
 * disparando metaPurchase() casi al montar /tarot/gracias) y el
 * scheduling de un <Script strategy="afterInteractive"> de OTRO
 * componente (MetaPixel, montado en el layout raíz) — son colas
 * independientes de Next.js/React. Confirmado en una orden real: el gate
 * atómico del servidor concedía el claim de Purchase correctamente, pero
 * si `window.fbq` todavía no existía en el instante exacto de la llamada,
 * fbqCall() lo descartaba en silencio (sin cola, sin reintento) — el
 * evento se perdía para siempre, porque el claim de backend ya no se
 * vuelve a conceder. Con este bootstrap, aunque fbevents.js todavía no
 * haya terminado de cargar, `window.fbq` ya es una función real (el stub
 * de cola) y el evento se encola correctamente hasta que el SDK real
 * esté listo para procesarlo — nunca se pierde por timing.
 */
function ensurePixelBootstrap(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.fbq) return; // ya bootstrapeado — por este mismo código o por <MetaPixel>

  const stub = function (this: FbqStub, ...args: unknown[]) {
    if (stub.callMethod) stub.callMethod(...args);
    else stub.queue.push(args);
  } as FbqStub;
  stub.queue = [];
  stub.loaded = true;
  stub.version = '2.0';
  stub.push = stub;

  window.fbq = stub;
  if (!window._fbq) window._fbq = stub;

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const firstScript = document.getElementsByTagName('script')[0];
  firstScript?.parentNode?.insertBefore(script, firstScript);
}

/**
 * Confirmado en producción (2026-08-22, evidencia real de Meta Test
 * Events): todos los eventos disparados vía fbq() — no solo PageView,
 * también InitiateCheckout con params por lo demás correctos — llegaban a
 * Meta con la URL de la primera página cargada en la sesión (ej. "/"),
 * nunca con la URL real donde el evento ocurrió. Causa: el Pixel de Meta
 * fija su contexto de página (URL) al momento de fbq('init', ...), que en
 * una SPA solo se ejecuta una vez (el snippet base no vuelve a correr en
 * navegación client-side) — y no lo refresca solo. Re-invocar
 * fbq('init', pixelId) con el MISMO Pixel ID es idempotente para Meta (no
 * crea una instancia ni un evento duplicado — documentado así por Meta,
 * es el mecanismo estándar para múltiples inits del mismo pixel) y fuerza
 * a releer document.location antes de cada evento. Se hace acá, en el
 * único punto por el que pasan todos los track() de nuestro código, en
 * vez de en cada call site — una sola implementación, no un wrapper nuevo.
 *
 * Reconfirmado 2026-09-21 (auditoría de Purchase): NO se elimina este
 * re-init por evento. Quitarlo reintroduciría exactamente el bug de URL
 * incorrecta ya demostrado con evidencia real de Meta Test Events el
 * 2026-08-22 (afectaba a PageView Y a InitiateCheckout, no solo a
 * PageView) — no es una precaución teórica, es un fix ya comprobado. El
 * costo de mantenerlo es nulo: re-invocar init con el mismo Pixel ID no
 * recarga el SDK ni duplica eventos (ensurePixelBootstrap() de arriba ya
 * es lo único responsable de eso, y corre como mucho una vez).
 */
function fbqCall(...args: unknown[]): void {
  try {
    if (typeof window === 'undefined' || !PIXEL_ID) return;
    ensurePixelBootstrap();
    if (typeof window.fbq === 'function') {
      window.fbq('init', PIXEL_ID);
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
