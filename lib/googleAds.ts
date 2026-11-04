// Conversión de compra en Google Ads (2026-11-04). Para que Google aprenda
// qué búsquedas terminan en venta. Se activa solo con dos variables de Vercel:
//   NEXT_PUBLIC_GOOGLE_ADS_ID           → "AW-123456789" (ID de la cuenta)
//   NEXT_PUBLIC_GOOGLE_ADS_COMPRA_LABEL → etiqueta de la acción "Compra"
// Sin ellas no se carga nada. Se validan con formato estricto porque van
// dentro de un script en la página.

const ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";
const LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_COMPRA_LABEL ?? "";

export const GOOGLE_ADS_ID = /^AW-\d{6,15}$/.test(ID) ? ID : null;
const COMPRA_LABEL = /^[A-Za-z0-9_-]{6,40}$/.test(LABEL) ? LABEL : null;

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
