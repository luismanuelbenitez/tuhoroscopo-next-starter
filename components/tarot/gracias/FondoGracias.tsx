// Fondo de /tarot/gracias: escena de la mesa de terciopelo (cortinas,
// columnas, velas, cristales, cielo con luna), centrada detrás del contenido.
// Desktop 2560×2400 a 4/3 de 960 = 1280 con costados fundidos (2026-11-02: misma medida que la Home); mobile 780×3600. El final se funde con
// el degradé liso de la página. Imágenes en public/img/tarot/contenedores/gracias/.
const DIR = "/img/tarot/contenedores/gracias";
const MASCARA = "linear-gradient(180deg, #000 0, #000 72%, transparent 100%)";
// Escritorio (2026-11-02): costados fundidos, como la Home y el resto del sitio.
const MASCARA_LATERAL = "linear-gradient(90deg, transparent 0, #000 12%, #000 88%, transparent 100%)";
const DESKTOP_LADOS = {
  maskImage: `${MASCARA}, ${MASCARA_LATERAL}`,
  WebkitMaskImage: `${MASCARA}, ${MASCARA_LATERAL}`,
  maskComposite: "intersect",
  WebkitMaskComposite: "source-in",
} as const;

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
      <div aria-hidden="true" className="hidden md:block" style={{ ...capa, width: "calc(min(960px, 100%) * 4 / 3)", aspectRatio: "2560 / 2400", backgroundImage: `url(${DIR}/fondo-gracias-desktop.webp)`, ...DESKTOP_LADOS }} />
    </>
  );
}
