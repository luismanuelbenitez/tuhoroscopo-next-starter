// Fondo de /tarot/gracias: escena de la mesa de terciopelo (cortinas,
// columnas, velas, cristales, cielo con luna), centrada detrás del contenido.
// Desktop 2560×2400 a 1280 de ancho; mobile 780×3600. El final se funde con
// el degradé liso de la página. Imágenes en public/img/tarot/contenedores/gracias/.
const DIR = "/img/tarot/contenedores/gracias";
const MASCARA = "linear-gradient(180deg, #000 0, #000 72%, transparent 100%)";

export function FondoGracias() {
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
  return (
    <>
      <div aria-hidden="true" className="md:hidden" style={{ ...capa, width: "100%", aspectRatio: "780 / 3600", backgroundImage: `url(${DIR}/fondo-gracias-mobile.webp)` }} />
      <div aria-hidden="true" className="hidden md:block" style={{ ...capa, width: "min(1280px, 100%)", aspectRatio: "2560 / 2400", backgroundImage: `url(${DIR}/fondo-gracias-desktop.webp)` }} />
    </>
  );
}
