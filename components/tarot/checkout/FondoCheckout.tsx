import { urlOptimizada } from "@/lib/imagen";

// Fondo del checkout: escena de 1280 de ancho centrada detrás del contenido
// de 960 (adornos — sol, luna, velas, mazo — en los costados). Mobile: escena
// vertical con adornos en los bordes. Imágenes en
// public/img/tarot/contenedores/checkout/. El final se funde con el degradé
// liso de la página.
const DIR = "/img/tarot/contenedores/checkout";
// Paquete SEO 2: los fondos se piden al optimizador de Next (AVIF/WebP al
// ancho útil) en vez del archivo original (mobile 780×4400 = 351 KB, es el
// LCP de las páginas SEO/institucionales en celular). Misma imagen.
export const FONDO_CHECKOUT_MOBILE = urlOptimizada(`${DIR}/fondo-checkout-mobile.webp`, 828);
const MASCARA = "linear-gradient(180deg, #000 0, #000 80%, transparent 100%)";
const MASCARA_CONTINUACION = "linear-gradient(180deg, transparent 0, #000 14%, #000 78%, transparent 100%)";

// Páginas SEO por tema (2026-11-02, `angosto`): en escritorio la escena del
// checkout (1280 px) se veía más ancha que el escenario de Home y /tarot, y
// terminaba a ~1200 px dejando el medio liso. Ahí va a 1100 px, fundida a los
// costados, y con una continuación espejada. El checkout queda como estaba.
const ANCHO_ANGOSTO = "min(1100px, 100%)";
const MASCARA_LATERAL = "linear-gradient(90deg, transparent 0, #000 10%, #000 90%, transparent 100%)";
const conLaterales = (vertical: string) => ({
  maskImage: `${vertical}, ${MASCARA_LATERAL}`,
  WebkitMaskImage: `${vertical}, ${MASCARA_LATERAL}`,
  maskComposite: "intersect",
  WebkitMaskComposite: "source-in",
}) as const;

export function FondoCheckout({ angosto = false }: { angosto?: boolean } = {}) {
  const capa = {
    position: "absolute",
    top: 0,
    left: "50%",
    transform: "translateX(-50%)",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center top",
    backgroundSize: "100% 100%",
    pointerEvents: "none",
    maskImage: MASCARA,
    WebkitMaskImage: MASCARA,
  } as const;
  const MASCARA_PIE = "linear-gradient(0deg, #000 0, #000 55%, transparent 100%)";
  const pie = {
    position: "absolute",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    backgroundRepeat: "no-repeat",
    backgroundSize: "100% 100%",
    pointerEvents: "none",
    maskImage: MASCARA_PIE,
    WebkitMaskImage: MASCARA_PIE,
  } as const;
  return (
    <>
      <div aria-hidden="true" className="md:hidden" style={{ ...capa, width: "100%", aspectRatio: "780 / 4400", backgroundImage: `url(${FONDO_CHECKOUT_MOBILE})` }} />
      {/* Continuación (2026-11-02): en páginas largas (SEO, FAQ) la escena
          mobile terminaba a ~2200 px y el resto quedaba liso. Misma imagen
          espejada en vertical, empieza donde la primera se desvanece y se
          funde en ambos extremos. En páginas cortas el contenedor la recorta. */}
      <div aria-hidden="true" className="md:hidden" style={{ ...capa, top: "calc(100vw * 4.85)", width: "100%", aspectRatio: "780 / 4400", backgroundImage: `url(${FONDO_CHECKOUT_MOBILE})`, transform: "translateX(-50%) scaleY(-1)", maskImage: MASCARA_CONTINUACION, WebkitMaskImage: MASCARA_CONTINUACION, opacity: 0.85 }} />
      <div aria-hidden="true" className="hidden md:block" style={{ ...capa, width: angosto ? ANCHO_ANGOSTO : "min(1280px, 100%)", aspectRatio: "2560 / 2400", backgroundImage: `url(${urlOptimizada(`${DIR}/fondo-checkout-desktop.webp`, 1920)})`, ...(angosto ? conLaterales(MASCARA) : {}) }} />
      {/* Continuaciones: tantas como haga falta para páginas largas, alternando
          el espejado para que los bordes coincidan; el resto se recorta. */}
      {angosto && [1, 2, 3].map((k) => (
        <div key={k} aria-hidden="true" className="hidden md:block" style={{ ...capa, top: `calc(min(1100px, 100vw) * ${(0.8 * k).toFixed(1)})`, width: ANCHO_ANGOSTO, aspectRatio: "2560 / 2400", backgroundImage: `url(${urlOptimizada(`${DIR}/fondo-checkout-desktop.webp`, 1920)})`, transform: `translateX(-50%) scaleY(${k % 2 ? -1 : 1})`, opacity: 0.85, ...conLaterales(MASCARA_CONTINUACION) }} />
      ))}
      {/* Pie: escena baja (velas, cristales) apoyada abajo, se funde hacia
          arriba — cubre lo que la escena principal no alcanza. Misma imagen
          que el cierre de /lectura (copiada a esta carpeta). */}
      <div aria-hidden="true" className="md:hidden" style={{ ...pie, width: "100%", aspectRatio: "780 / 900", backgroundImage: `url(${urlOptimizada(`${DIR}/fondo-pie-mobile.webp`, 828)})` }} />
      <div aria-hidden="true" className="hidden md:block" style={{ ...pie, width: angosto ? ANCHO_ANGOSTO : "min(1280px, 100%)", aspectRatio: "1920 / 960", backgroundImage: `url(${urlOptimizada(`${DIR}/fondo-pie-desktop.webp`, 1920)})`, ...(angosto ? conLaterales(MASCARA_PIE) : {}) }} />
    </>
  );
}
