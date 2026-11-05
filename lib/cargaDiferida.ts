// Scripts de terceros (Meta Pixel, Google Analytics, Google Ads) después de
// que la página se ve (2026-11-05, Manuel: objetivo 2,5 s de LCP móvil en
// /tarot). Lighthouse: bloqueaban el hilo principal 400–700 ms justo
// mientras se pintaba la portada.
//
// Los stubs de cola (window.fbq, window.gtag/dataLayer) se siguen creando
// al instante, así ningún evento se pierde: quedan encolados hasta que el
// SDK real carga. Lo único que se difiere es la descarga del SDK.
//
// En el embudo de pago (checkout, estado, gracias) se cargan como antes, sin
// esperar: ahí se disparan InitiateCheckout y la compra, y no se arriesga
// perder una conversión si la persona cierra rápido.
export const RUTAS_SIN_DIFERIR = ["/tarot/checkout", "/tarot/estado", "/tarot/gracias"];

// Misma lógica como texto, para los <Script> inline del layout.
export function jsCargarScript(src: string): string {
  return `(function(){var s=${JSON.stringify(src)};function c(){var t=document.createElement('script');t.async=true;t.src=s;document.head.appendChild(t);}var p=location.pathname,r=${JSON.stringify(RUTAS_SIN_DIFERIR)};if(r.some(function(x){return p===x||p.indexOf(x+'/')===0;})){c();return;}function l(){if('requestIdleCallback' in window)requestIdleCallback(c,{timeout:3000});else setTimeout(c,1500);}if(document.readyState==='complete')l();else addEventListener('load',l,{once:true});})();`;
}

export function cargarScript(src: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const cargar = () => {
    const t = document.createElement("script");
    t.async = true;
    t.src = src;
    document.head.appendChild(t);
  };
  const p = location.pathname;
  if (RUTAS_SIN_DIFERIR.some((x) => p === x || p.startsWith(x + "/"))) return cargar();
  const alCargar = () => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(cargar, { timeout: 3000 });
    else setTimeout(cargar, 1500);
  };
  if (document.readyState === "complete") alCargar();
  else window.addEventListener("load", alCargar, { once: true });
}
