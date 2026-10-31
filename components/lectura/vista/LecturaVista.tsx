import type { LecturaPublica } from "@/lib/tarotLecturaPublica";
import Link from "next/link";
import { preload } from "react-dom";
import { urlOptimizada } from "@/lib/imagen";
import { DIR, SERIF, GOLD, FondoLectura, FONDO_PAGINA, EstilosCartaViva } from "./Base";
import { HeroLectura } from "./HeroLectura";
import { ResumenBloque, CartaPorCarta, MensajeBloque, ClavesBloque, PdfBloque, OtraLecturaBloque } from "./Bloques";

// Vista de /lectura/[token] — SOLO presentación (rediseño 2026-10-18, sobre el
// mockup de Manuel). Recibe exactamente lo que la página ya resolvía
// (contrato LecturaPublica + URL del audio + href del PDF); no busca datos ni
// decide estados: eso sigue en app/lectura/[token]/page.tsx, sin cambios.

// Vencimiento del acceso online, formateado desde expira_at (dato que ya
// trae la lectura; la expiración la decide el backend). Si no es una fecha
// válida, no se muestra.
function fechaVencimiento(expiraAt: string): string | null {
  const d = new Date(expiraAt);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-UY", { day: "numeric", month: "long", timeZone: "America/Montevideo" });
}

// Signo solar desde "YYYY-MM-DD" (fechas de corte tropicales habituales).
const SIGNOS: [number, string][] = [
  [120, "Capricornio"], [219, "Acuario"], [321, "Piscis"], [420, "Aries"], [521, "Tauro"], [621, "Géminis"],
  [723, "Cáncer"], [823, "Leo"], [923, "Virgo"], [1023, "Libra"], [1122, "Escorpio"], [1222, "Sagitario"], [1231, "Capricornio"],
];
function signoSolar(fecha: string | null | undefined): string | null {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(fecha ?? "");
  if (!m) return null;
  const md = Number(m[1]) * 100 + Number(m[2]);
  const signo = SIGNOS.find(([hasta]) => md < hasta)?.[1] ?? "Capricornio";
  return `Signo ${signo}`;
}

// Escena de fondo continua: imagen del cabezal arriba y, pegada justo debajo,
// la continuación (paneles/fondo-pagina-*), ambas a 100% del ancho. El
// empalme se ubica en la altura real de la imagen del cabezal a ese ancho
// (desktop 1280/1920 = 66.667cqw; mobile 1600/780 = 205.128cqw), así no hay
// costura aunque el cabezal mida más que la imagen. Las imágenes ya terminan
// fundidas en #0b0818; debajo sigue el degradé liso de la página.
const CAB = `${DIR}/contenedores/cabezal`;
const PAN = `${DIR}/contenedores/paneles`;

// GPT no reproduce exactamente el borde inferior del cabezal, así que el
// empalme es un fundido cruzado: el fondo de página arranca un poco antes del
// final del cabezal (solape) y el cabezal se desvanece en ese tramo.
// Desktop: cabezal 66.667cqw de alto, solape 10cqw (~96px a 960).
// Mobile:  cabezal 205.128cqw de alto, solape 25cqw (~98px a 390).
// El fondo de página también se funde en su tramo final (alto de imagen:
// desktop 208.333cqw, mobile 564.103cqw), para no cortar en seco.
function Capa({ src, top, mascara, className }: { src: string; top: string; mascara?: string; className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-x-0 bottom-0 pointer-events-none ${className}`}
      style={{
        top,
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% auto",
        backgroundPosition: "0 0",
        ...(mascara ? { maskImage: mascara, WebkitMaskImage: mascara, maskSize: "100% auto", WebkitMaskSize: "100% auto", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" } : {}),
      }}
    />
  );
}

function Cierre({ src, className }: { src: string; className: string }) {
  const mascara = "linear-gradient(0deg, #000 0, #000 55%, transparent 100%)";
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-x-0 bottom-0 pointer-events-none ${className}`}
      style={{
        height: "50cqw",
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% auto",
        backgroundPosition: "bottom center",
        maskImage: mascara,
        WebkitMaskImage: mascara,
      }}
    />
  );
}

function EscenarioLectura() {
  // Máscaras con la proporción exacta de cada imagen del cabezal (opaco hasta
  // donde empieza el solape, transparente al final de la imagen).
  const mascaraDesktop = "linear-gradient(180deg, #000 0, #000 calc(56.667cqw), transparent calc(66.667cqw))";
  const mascaraMobile = "linear-gradient(180deg, #000 0, #000 calc(180.128cqw), transparent calc(205.128cqw))";
  return (
    <>
      <Capa className="md:hidden" src={urlOptimizada(`${PAN}/fondo-pagina-mobile.webp`, 828)} top="180.128cqw" mascara="linear-gradient(180deg, #000 0, #000 484cqw, transparent 564cqw)" />
      <Capa className="md:hidden" src={urlOptimizada(`${CAB}/escenario-hero-mobile.webp`, 828)} top="0" mascara={mascaraMobile} />
      <Capa className="hidden md:block" src={urlOptimizada(`${PAN}/fondo-pagina-desktop.webp`, 1920)} top="56.667cqw" mascara="linear-gradient(180deg, #000 0, #000 168cqw, transparent 208.333cqw)" />
      <Capa className="hidden md:block" src={urlOptimizada(`${CAB}/escenario-hero-desktop.webp`, 1920)} top="0" mascara={mascaraDesktop} />
      {/* Cierre: escena baja apoyada en el pie de la página que sube hasta
          donde llegue y se funde hacia arriba (paneles/fondo-cierre-*.webp).
          Si el archivo no existe, no se ve nada. */}
      <Cierre className="md:hidden" src={urlOptimizada(`${PAN}/fondo-cierre-mobile.webp`, 828)} />
      <Cierre className="hidden md:block" src={urlOptimizada(`${PAN}/fondo-cierre-desktop.webp`, 1920)} />
    </>
  );
}

// Footer mínimo de /lectura: marca + copyright + 3 links legales (rutas
// existentes). Sin navegación, redes ni CTA — no es el footer comercial.
const LINKS_LEGALES = [
  { href: "/politica-de-privacidad", label: "Privacidad" },
  { href: "/terminos-del-servicio", label: "Términos del servicio" },
  { href: "/contacto", label: "Contacto" },
];

function PieLectura() {
  return (
    <footer className="relative !mt-16 md:!mt-20 pt-8 md:pt-9 text-center">
      <div aria-hidden="true" className="absolute top-0 inset-x-[8%] h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(240,197,90,0.22), transparent)" }} />
      {/* Velo local solo detrás del texto: el fondo de cierre tiene velas y
          cristales justo en esta zona (sobre todo en mobile). */}
      <div aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 top-4 w-[min(560px,100%)] h-[170px] pointer-events-none" style={{ background: "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(8,4,16,0.78), rgba(8,4,16,0.45) 55%, transparent 80%)" }} />
      <div className="relative flex items-center justify-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/logo/logo-isotipo-96.webp" alt="" aria-hidden="true" width={26} height={26} style={{ width: 26, height: 26, opacity: 0.9 }} />
        <span className="text-[14px] font-bold uppercase leading-none" style={{ fontFamily: SERIF, letterSpacing: "0.08em", color: GOLD }}>Tu Oráculo</span>
      </div>
      <nav aria-label="Información legal" className="relative mt-4 mx-auto max-w-[250px] md:max-w-none flex flex-wrap items-center justify-center gap-x-4 md:gap-x-2.5 gap-y-1 text-[12.5px]" style={{ color: "rgba(245,239,224,0.55)" }}>
        {LINKS_LEGALES.map((l, i) => (
          <span key={l.href} className="flex items-center gap-2.5">
            {i > 0 && <span aria-hidden="true" className="hidden md:inline" style={{ color: "rgba(240,197,90,0.4)" }}>·</span>}
            <Link href={l.href as never} className="hover:text-[#F5EFE0] transition-colors">{l.label}</Link>
          </span>
        ))}
      </nav>
      <p className="relative mt-3 mx-auto max-w-[220px] md:max-w-none text-[11.5px] leading-relaxed" style={{ color: "rgba(245,239,224,0.42)" }}>
        © {new Date().getFullYear()} Tu Oráculo · Todos los derechos reservados.
      </p>
    </footer>
  );
}

export function LecturaVista({
  lectura, audioResumenUrl, pdfHref, fontClass,
}: { lectura: LecturaPublica; audioResumenUrl: string | null; pdfHref: string; fontClass: string }) {
  // La escena del cabezal es el LCP y, al ser un fondo CSS, el navegador la
  // descubre tarde: se precarga (misma URL optimizada que usa la capa).
  preload(urlOptimizada(`${CAB}/escenario-hero-mobile.webp`, 828), { as: "image", media: "(max-width: 767px)", fetchPriority: "high" });
  preload(urlOptimizada(`${CAB}/escenario-hero-desktop.webp`, 1920), { as: "image", media: "(min-width: 768px)", fetchPriority: "high" });
  // Fecha de nacimiento opcional ("YYYY-MM-DD"): en la portada se muestra
  // solo el signo, no la fecha completa — el link se reenvía o se muestra en
  // pantalla y la fecha es un dato personal (auditoría UX 2026-10-30, L3).
  const fechaNacimiento = signoSolar(lectura.fecha_nacimiento);
  const pasos = lectura.proximos_pasos ?? [];

  return (
    <main className={`${fontClass} min-h-screen relative`} style={{ background: FONDO_PAGINA, color: "#F0F1F5" }}>
      <FondoLectura />
      <EstilosCartaViva />

      {/* Mismo ancho maestro que Home y /tarot (960). container-type: la capa
          de escena mide su empalme en cqw (= ancho de este contenedor). */}
      <div className="relative mx-auto max-w-[960px]" style={{ containerType: "inline-size" }}>
        <EscenarioLectura />
        <HeroLectura
          nombre={(lectura.nombre?.trim() ?? "") || "Tu lectura"}
          fechaNacimiento={fechaNacimiento}
          pregunta={lectura.pregunta?.trim() || null}
          cartas={lectura.cartas}
          conAudio={audioResumenUrl !== null}
        />

        <div id="tu-lectura" className="relative px-4 md:px-10 pt-4 pb-10 md:pb-12 scroll-mt-2 space-y-10 md:space-y-12">
          <ResumenBloque resumen={lectura.resumen_lectura} audioResumenUrl={audioResumenUrl} />
          <CartaPorCarta cartas={lectura.cartas} />
          <div className="space-y-4 md:space-y-5">
            <MensajeBloque mensaje={lectura.mensaje_final} />
            {pasos.length > 0 && <ClavesBloque pasos={pasos} />}
            <PdfBloque pdfHref={pdfHref} venceTexto={fechaVencimiento(lectura.expira_at)} />
            <OtraLecturaBloque nombre={lectura.nombre?.trim() || null} nacimiento={lectura.fecha_nacimiento ?? null} />
          </div>
          <PieLectura />
        </div>
      </div>
    </main>
  );
}
