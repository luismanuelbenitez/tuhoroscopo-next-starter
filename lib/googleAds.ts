// Conversión de compra en Google Ads (2026-11-04). Para que Google aprenda
// qué búsquedas terminan en venta. Se activa solo con dos variables de Vercel:
//   NEXT_PUBLIC_GOOGLE_ADS_ID           → "AW-123456789" (ID de la cuenta)
//   NEXT_PUBLIC_GOOGLE_ADS_COMPRA_LABEL → etiqueta de la acción "Compra"
// Sin ellas no se carga nada. Se validan con formato estricto porque van
// dentro de un script en la página.

//
// 2026-11-05: en producción la etiqueta nunca se cargaba (las variables de
// Vercel no pasaban el formato: espacio, comillas o entorno equivocado).
// Se limpian y, si faltan, se usan los de la cuenta 315-139-7440 leídos por
// la API (no son secretos: van igual en el HTML público).
const limpiar = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "");
const ID = limpiar(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID);
const LABEL = limpiar(process.env.NEXT_PUBLIC_GOOGLE_ADS_COMPRA_LABEL);

export const GOOGLE_ADS_ID = /^AW-\d{6,15}$/.test(ID) ? ID : "AW-965019966";
const COMPRA_LABEL = /^[A-Za-z0-9_-]{6,40}$/.test(LABEL) ? LABEL : "mx6yCP-3r7AdEL6SlMwD";
/** Para el tablero: la conversión de compra se envía (ID y etiqueta válidos). */
export const COMPRA_ACTIVA = !!GOOGLE_ADS_ID && !!COMPRA_LABEL;

/**
 * Compra confirmada. Mismo gate que GA4 y Meta (TarotEstadoContent): solo
 * cuando el servidor confirmó un pago real y no reportado antes
 * (analytics_purchase_sent_at). transaction_id evita que Google la cuente dos
 * veces si la página se recarga.
 */
export function googleAdsCompra(params: { transactionId: string; value: number; currency?: string }): void {
  try {
    if (!GOOGLE_ADS_ID || !COMPRA_LABEL || typeof window === "undefined") return;
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag !== "function") return;
    gtag("event", "conversion", {
      send_to: `${GOOGLE_ADS_ID}/${COMPRA_LABEL}`,
      value: params.value,
      currency: params.currency ?? "UYU",
      transaction_id: params.transactionId,
    });
  } catch { /* best-effort */ }
}

// Acción secundaria "Inicio de checkout" (2026-11-05): solo para observar en
// Google Ads qué búsquedas llegan al checkout (las compras son pocas para
// juzgar palabras). No es principal: Google no la usa para pujar.
const INICIO_CHECKOUT_LABEL = "_tmuCKau67IdEL6SlMwD";

/** Llegada a /tarot/checkout. Mismo punto que begin_checkout de GA4 y
 *  checkout_started del embudo. Crea la cola de gtag si todavía no existe
 *  (el checkout puede montar antes que el script del layout). */
export function googleAdsInicioCheckout(value: number): void {
  try {
    if (!GOOGLE_ADS_ID || typeof window === "undefined") return;
    const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    // eslint-disable-next-line prefer-rest-params
    w.gtag = w.gtag || function () { w.dataLayer!.push(arguments); };
    w.gtag("event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${INICIO_CHECKOUT_LABEL}`, value, currency: "UYU" });
  } catch { /* best-effort */ }
}
