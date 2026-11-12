// Scripts de terceros (Meta Pixel, Google Analytics, Google Ads) después de
// que la página se ve (2026-11-05, Manuel: objetivo 2,5 s de LCP móvil en
// /tarot). Lighthouse: bloqueaban el hilo principal 400–700 ms justo
// mientras se pintaba la portada.
//
// Los stubs de cola (window.fbq, window.gtag/dataLayer) se siguen creando
// al instante, así ningún evento se pierde: quedan encolados hasta que el
// SDK real carga. Lo único que se difiere es la descarga del SDK.
//
// En /tarot/estado y /tarot/gracias se cargan como antes, sin esperar: ahí se
// dispara la compra y no se arriesga perderla si la persona cierra rápido.
//
// 2026-11-06 (auditoría del checkout): el checkout también difiere. Con los
// SDKs de entrada tenía LCP de 5,1–5,7 s y los botones del tema respondían
// recién a los ~4,5 s en 4G lento. Lo único que se dispara ahí antes de irse
// es InitiateCheckout al ir a Mercado Pago: el botón llama a
// cargarDiferidosYa() y espera a los SDKs (esperarTerceros) antes de salir.
export const RUTAS_SIN_DIFERIR = ["/tarot/estado", "/tarot/gracias"];

// 2026-11-11 (auditoría, Manuel: "la velocidad nos está matando"): en el
// checkout, Google y Meta bloqueaban el hilo principal ~1 s justo mientras la
// persona elige el tema (Lighthouse móvil 70, interactiva a los 9 s). Ahí se
// espera a la primera interacción (toque, tecla) o a 10 s, lo que pase
// antes. No aplica a /tarot: ahí gtag guarda el gclid del anuncio al entrar.
export const RUTAS_ESPERAN_INTERACCION = ["/tarot/checkout"];
const ESPERA_MAX_MS = 10_000;

// Registro compartido (window.__thcDiferidos): src → función que lo carga
// una sola vez. Lo usan tanto los <Script> inline como cargarScript().
type Registro = Record<string, () => void>;
const registro = (): Registro => {
  const w = window as unknown as { __thcDiferidos?: Registro };
  return (w.__thcDiferidos ??= {});
};

// Misma lógica como texto, para los <Script> inline del layout.
export function jsCargarScript(src: string): string {
  return `(function(){var s=${JSON.stringify(src)},w=window,R=w.__thcDiferidos=w.__thcDiferidos||{};if(R[s])return;var h=false;function c(){if(h)return;h=true;var t=document.createElement('script');t.async=true;t.src=s;document.head.appendChild(t);}R[s]=c;var p=location.pathname,r=${JSON.stringify(RUTAS_SIN_DIFERIR)};if(r.some(function(x){return p===x||p.indexOf(x+'/')===0;})){c();return;}var q=${JSON.stringify(RUTAS_ESPERAN_INTERACCION)};if(q.some(function(x){return p===x||p.indexOf(x+'/')===0;})){var ev=['pointerdown','keydown','touchstart'],z=function(){ev.forEach(function(e){removeEventListener(e,z,true)});if('requestIdleCallback' in window)requestIdleCallback(c,{timeout:1500});else setTimeout(c,300);};ev.forEach(function(e){addEventListener(e,z,{capture:true,passive:true,once:true})});setTimeout(c,${ESPERA_MAX_MS});return;}function l(){if('requestIdleCallback' in window)requestIdleCallback(c,{timeout:3000});else setTimeout(c,1500);}if(document.readyState==='complete')l();else addEventListener('load',l,{once:true});})();`;
}

export function cargarScript(src: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const R = registro();
  if (R[src]) return;
  let hecho = false;
  const cargar = () => {
    if (hecho) return;
    hecho = true;
    const t = document.createElement("script");
    t.async = true;
    t.src = src;
    document.head.appendChild(t);
  };
  R[src] = cargar;
  const p = location.pathname;
  if (RUTAS_SIN_DIFERIR.some((x) => p === x || p.startsWith(x + "/"))) return cargar();
  if (RUTAS_ESPERAN_INTERACCION.some((x) => p === x || p.startsWith(x + "/"))) {
    const eventos = ["pointerdown", "keydown", "touchstart"] as const;
    const alInteractuar = () => {
      eventos.forEach((e) => window.removeEventListener(e, alInteractuar, true));
      if ("requestIdleCallback" in window) window.requestIdleCallback(cargar, { timeout: 1500 });
      else setTimeout(cargar, 300);
    };
    eventos.forEach((e) => window.addEventListener(e, alInteractuar, { capture: true, passive: true, once: true }));
    setTimeout(cargar, ESPERA_MAX_MS);
    return;
  }
  const alCargar = () => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(cargar, { timeout: 3000 });
    else setTimeout(cargar, 1500);
  };
  if (document.readyState === "complete") alCargar();
  else window.addEventListener("load", alCargar, { once: true });
}

/** Descarga ya los SDKs que todavía estén esperando (no hace nada con los ya cargados). */
export function cargarDiferidosYa(): void {
  try {
    if (typeof window === "undefined") return;
    Object.values(registro()).forEach((cargar) => cargar());
  } catch { /* best-effort */ }
}

/**
 * Espera a que los SDKs reales estén activos (o hasta maxMs): fbevents.js
 * define fbq.callMethod y gtag.js crea google_tag_manager. Así los eventos
 * encolados salen antes de navegar. Nunca rechaza ni bloquea más de maxMs.
 */
export function esperarTerceros(maxMs: number): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { fbq?: { callMethod?: unknown }; dataLayer?: unknown[]; google_tag_manager?: unknown };
  const listos = () => (!w.fbq || !!w.fbq.callMethod) && (!w.dataLayer || !!w.google_tag_manager);
  return new Promise((resolver) => {
    const fin = Date.now() + maxMs;
    const mirar = () => (listos() || Date.now() >= fin ? resolver() : setTimeout(mirar, 80));
    mirar();
  });
}
