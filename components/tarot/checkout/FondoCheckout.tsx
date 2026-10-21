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

export function FondoCheckout() {
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
      <div aria-hidden="true" className="hidden md:block" style={{ ...capa, width: "min(1280px, 100%)", aspectRatio: "2560 / 2400", backgroundImage: `url(${urlOptimizada(`${DIR}/fondo-checkout-desktop.webp`, 1920)})` }} />
      {/* Pie: escena baja (velas, cristales) apoyada abajo, se funde hacia
          arriba — cubre lo que la escena principal no alcanza. Misma imagen
          que el cierre de /lectura (copiada a esta carpeta). */}
      <div aria-hidden="true" className="md:hidden" style={{ ...pie, width: "100%", aspectRatio: "780 / 900", backgroundImage: `url(${urlOptimizada(`${DIR}/fondo-pie-mobile.webp`, 828)})` }} />
      <div aria-hidden="true" className="hidden md:block" style={{ ...pie, width: "min(1280px, 100%)", aspectRatio: "1920 / 960", backgroundImage: `url(${urlOptimizada(`${DIR}/fondo-pie-desktop.webp`, 1920)})` }} />
    </>
  );
}
