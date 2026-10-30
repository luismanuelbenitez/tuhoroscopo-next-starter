import type { ReactNode } from "react";
import { fluido, urlOptimizada } from "@/lib/imagen";

const DESKTOP = fluido("/img/home/general/fondo-home-desktop.webp", 793, 1983, "(max-width: 960px) 100vw, 960px");
const MOBILE = fluido("/img/home/general/fondo-home-mobile.webp", 463, 3392, "100vw", { prioridad: true });
const CHECKOUT = "/img/tarot/contenedores/checkout";
const LECTURA = "/img/lectura/contenedores/paneles";

// A diferencia de HomeBackgroundStage (que estira el fondo a todo el alto
// con object-fit: cover), acá el fondo va con su proporción natural, pegado
// arriba, y se funde a oscuro al final: la v2 es más larga y con cover el
// recorte se comía la escena de la portada (velas, libros, carta).
// Debajo se encadenan escenas de las otras páginas para que la home no
// quede lisa a mitad de camino (solo desktop): la del checkout (sol, luna,
// velas, mazo), el terciopelo de /lectura y, al final, el pie de /faq
// (velas y cristales, también en mobile). Todas se funden por los cuatro
// lados para que no se vean cortes rectos contra el fondo liso.
const FADE_LADOS = "linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%)";
const CSS = `
@media (min-width: 768px) {
  .esc-v2-portada {
    -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 82%, transparent 100%), linear-gradient(90deg, transparent 0%, #000 9%, #000 91%, transparent 100%) !important;
    -webkit-mask-composite: source-in;
    mask-image: linear-gradient(180deg, #000 0%, #000 82%, transparent 100%), linear-gradient(90deg, transparent 0%, #000 9%, #000 91%, transparent 100%) !important;
    mask-composite: intersect;
  }
}`;

function mascara(vertical: string) {
  return {
    maskImage: `${vertical}, ${FADE_LADOS}`,
    WebkitMaskImage: `${vertical}, ${FADE_LADOS}`,
    maskComposite: "intersect",
    WebkitMaskComposite: "source-in",
  } as const;
}

export function EscenarioV2({ children }: { children: ReactNode }) {
  const fundido = "linear-gradient(180deg, #000 0%, #000 82%, transparent 100%)";
  const fundidoAmbos = "linear-gradient(180deg, transparent 0%, #000 30%, #000 72%, transparent 100%)";
  const fundidoPie = "linear-gradient(0deg, #000 0, #000 55%, transparent 100%)";
  const capa = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundRepeat: "no-repeat",
    backgroundSize: "100% 100%",
    pointerEvents: "none",
  } as const;
  return (
    <div className="relative">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div
        aria-hidden="true"
        className="hidden md:block"
        style={{
          ...capa, top: 2150, width: "min(1280px, 100vw)", aspectRatio: "2560 / 2400",
          backgroundImage: `url(${urlOptimizada(`${CHECKOUT}/fondo-checkout-desktop.webp`, 1920)})`,
          ...mascara(fundidoAmbos),
        }}
      />
      {/* Terciopelo con velas de /lectura: rellena el tramo de Confianza y
          "Muy pronto", entre la escena del checkout y el pie. */}
      <div
        aria-hidden="true"
        className="hidden md:block"
        style={{
          ...capa, top: 3100, height: 1500, width: "min(1280px, 100vw)",
          backgroundImage: `url(${urlOptimizada(`${LECTURA}/fondo-pagina-desktop.webp`, 1920)})`,
          backgroundSize: "100% auto", backgroundPosition: "center 45%", opacity: 0.6,
          ...mascara(fundidoAmbos),
        }}
      />
      <div
        aria-hidden="true"
        className="md:hidden"
        style={{
          ...capa, bottom: 0, width: "100%", aspectRatio: "780 / 900",
          backgroundImage: `url(${urlOptimizada(`${CHECKOUT}/fondo-pie-mobile.webp`, 828)})`,
          maskImage: fundidoPie, WebkitMaskImage: fundidoPie,
        }}
      />
      <div
        aria-hidden="true"
        className="hidden md:block"
        style={{
          ...capa, bottom: 0, width: "min(1280px, 100vw)", aspectRatio: "1920 / 960",
          backgroundImage: `url(${urlOptimizada(`${CHECKOUT}/fondo-pie-desktop.webp`, 1920)})`,
          ...mascara(fundidoPie),
        }}
      />
      <picture>
        <source media="(min-width: 768px)" srcSet={DESKTOP.srcSet} sizes={DESKTOP.sizes} />
        <img
          {...MOBILE}
          alt=""
          aria-hidden="true"
          className="esc-v2-portada"
          style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "auto",
            maskImage: fundido, WebkitMaskImage: fundido,
          }}
        />
      </picture>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(6,4,14,0.46) 0%, rgba(6,4,14,0.22) 8%, rgba(6,4,14,0.06) 15%, transparent 20%)",
        }}
      />
      {children}
    </div>
  );
}
