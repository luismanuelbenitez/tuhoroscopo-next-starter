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
// terminaba a ~1200 px dejando el medio liso. Ahí va al ancho del header y de
// Home (960 px), fundida a los costados, y la escena se repite hacia abajo.
// Estética pareja (2026-11-02): en escritorio TODAS las variantes (checkout
// incluido, a 1280 px) funden los costados como la Home; el celular no cambia.
// Misma medida que la escena de la Home (EscenarioV2): 4/3 del ancho maestro
// de 960 (1280 px) con los costados fundidos un 12 %.
const ANCHO_ANGOSTO = "calc(min(960px, 100%) * 4 / 3)";
const MASCARA_LATERAL = "linear-gradient(90deg, transparent 0, #000 12%, #000 88%, transparent 100%)";
const conLaterales = (vertical: string) => ({
  maskImage: `${vertical}, ${MASCARA_LATERAL}`,
  WebkitMaskImage: `${vertical}, ${MASCARA_LATERAL}`,
  maskComposite: "intersect",
  WebkitMaskComposite: "source-in",
}) as const;

// Tramo medio (2026-11-02, imagen generada para esto): decoración solo a los
// costados, centro oscuro. Se repite hacia abajo entre la escena y el pie; una
// copia normal y la siguiente espejada de izquierda a derecha (nunca boca
// abajo) para que no se note la repetición. Cada copia se funde arriba y abajo
// y se superpone un poco con la anterior. Lo que pasa del largo de la página
// lo recorta el contenedor.
const MEDIO_DESKTOP = urlOptimizada(`${DIR}/fondo-medio-desktop.webp`, 1920);
const MEDIO_MOBILE = urlOptimizada(`${DIR}/fondo-medio-mobile.webp`, 828);
const MASCARA_MEDIO = "linear-gradient(180deg, transparent 0, #000 12%, #000 88%, transparent 100%)";
const TRAMOS_DESKTOP = 12;
const TRAMOS_MOBILE = 10;

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
          mobile terminaba a ~2200 px y el resto quedaba liso. Misma imagen,
          derecha, empieza donde la primera se desvanece y se funde en ambos
          extremos. En páginas cortas el contenedor la recorta. */}
      {/* Checkout: la misma escena repetida una vez. Páginas `angosto`: tramo medio. */}
      {!angosto && <div aria-hidden="true" className="md:hidden" style={{ ...capa, top: "calc(100vw * 4.85)", width: "100%", aspectRatio: "780 / 4400", backgroundImage: `url(${FONDO_CHECKOUT_MOBILE})`, maskImage: MASCARA_CONTINUACION, WebkitMaskImage: MASCARA_CONTINUACION, opacity: 0.85 }} />}
      {angosto && Array.from({ length: TRAMOS_MOBILE }, (_, k) => (
        <div key={`m${k}`} aria-hidden="true" className="md:hidden" style={{ ...capa, top: `calc(100vw * ${(4.7 + 1.32 * k).toFixed(2)})`, width: "100%", aspectRatio: "780 / 1170", backgroundImage: `url(${MEDIO_MOBILE})`, maskImage: MASCARA_MEDIO, WebkitMaskImage: MASCARA_MEDIO, transform: `translateX(-50%)${k % 2 ? " scaleX(-1)" : ""}` }} />
      ))}
      <div aria-hidden="true" className="hidden md:block" style={{ ...capa, width: ANCHO_ANGOSTO, aspectRatio: "2560 / 2400", backgroundImage: `url(${urlOptimizada(`${DIR}/fondo-checkout-desktop.webp`, 1920)})`, ...conLaterales(MASCARA) }} />
      {angosto && Array.from({ length: TRAMOS_DESKTOP }, (_, k) => (
        <div key={`d${k}`} aria-hidden="true" className="hidden md:block" style={{ ...capa, top: `calc(min(960px, 100vw) * ${((4 / 3) * (0.8 + 0.59 * k)).toFixed(3)})`, width: ANCHO_ANGOSTO, aspectRatio: "1536 / 1024", backgroundImage: `url(${MEDIO_DESKTOP})`, transform: `translateX(-50%)${k % 2 ? " scaleX(-1)" : ""}`, ...conLaterales(MASCARA_MEDIO) }} />
      ))}
      {/* Pie: escena baja (velas, cristales) apoyada abajo, se funde hacia
          arriba — cubre lo que la escena principal no alcanza. Misma imagen
          que el cierre de /lectura (copiada a esta carpeta). */}
      <div aria-hidden="true" className="md:hidden" style={{ ...pie, width: "100%", aspectRatio: "780 / 900", backgroundImage: `url(${urlOptimizada(`${DIR}/fondo-pie-mobile.webp`, 828)})` }} />
      <div aria-hidden="true" className="hidden md:block" style={{ ...pie, width: ANCHO_ANGOSTO, aspectRatio: "1920 / 960", backgroundImage: `url(${urlOptimizada(`${DIR}/fondo-pie-desktop.webp`, 1920)})`, ...conLaterales(MASCARA_PIE) }} />
    </>
  );
}
