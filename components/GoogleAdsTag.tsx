import Script from "next/script";
import { GOOGLE_ADS_ID } from "@/lib/googleAds";

// Etiqueta de Google Ads en todas las páginas (2026-11-04): guarda el clic
// del anuncio (gclid) al llegar, para atribuirle la compra que ocurre
// después en /tarot/estado. Convive con GA4: comparten window.gtag y
// dataLayer. Sin NEXT_PUBLIC_GOOGLE_ADS_ID válido no se carga nada.
export function GoogleAdsTag() {
  if (!GOOGLE_ADS_ID) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`} strategy="afterInteractive" />
      <Script
        id="google-ads-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments);};gtag('js',new Date());gtag('config','${GOOGLE_ADS_ID}');`,
        }}
      />
    </>
  );
}
