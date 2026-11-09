import Script from "next/script";
import { GOOGLE_ADS_ID } from "@/lib/googleAds";
import { jsCargarScript } from "@/lib/cargaDiferida";

// Etiqueta de Google Ads en todas las páginas (2026-11-04): guarda el clic
// del anuncio (gclid) al llegar, para atribuirle la compra que ocurre
// después en /tarot/estado. Convive con GA4: comparten window.gtag y
// dataLayer. Sin NEXT_PUBLIC_GOOGLE_ADS_ID válido no se carga nada.
//
// 2026-11-05: gtag.js baja después de que la página se ve (fuera del embudo
// de pago, ver lib/cargaDiferida.ts). window.gtag y dataLayer se crean al
// instante y encolan config y eventos hasta que carga.
//
// 2026-11-09 (Nivel de Calidad de Google Ads): GA4 y Ads bajaban cada uno su
// propio gtag.js (~170 KB cada uno) y Ads además el contenedor de GA: 3
// descargas. Una sola biblioteca atiende los dos `config` (la de la otra
// cuenta baja como contenedor liviano), así que las dos etiquetas piden la
// misma dirección y el registro de cargaDiferida la descarga una vez.
const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;

export function GoogleAdsTag() {
  if (!GOOGLE_ADS_ID) return null;
  return (
    <Script
      id="google-ads-config"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments);};gtag('js',new Date());gtag('config','${GOOGLE_ADS_ID}');${jsCargarScript(GTAG_SRC)}`,
      }}
    />
  );
}

// GA4 con el mismo esquema (reemplaza a GoogleAnalytics de
// @next/third-parties, que cargaba gtag.js apenas la página era interactiva).
export function GoogleAnalyticsTag({ gaId }: { gaId: string }) {
  if (!/^G-[A-Z0-9]{4,20}$/.test(gaId)) return null;
  return (
    <Script
      id="google-analytics-config"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments);};gtag('js',new Date());gtag('config','${gaId}');${jsCargarScript(GTAG_SRC)}`,
      }}
    />
  );
}
