"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link2, Headphones, FileText, MessageCircle, Mail, Music, Download, Play, type LucideIcon } from "lucide-react";
import { GOLD, SERIF, CREMA, CTA_GRADIENT } from "@/components/home/theme";
import { CelularMock, DocumentoMock } from "@/components/tarot/Mockups";
import { fijo, fluido } from "@/lib/imagen";

// Imágenes del bloque (las genera Manuel). Cada una tiene un reemplazo
// mientras el archivo no exista (ImagenConFallback), así el bloque nunca se
// ve roto y cada imagen aparece sola al subirla, sin tocar código.
const DIR = "/img/tarot/contenedores/asi-se-vive";
// Paquete SEO 2: carga optimizada (ancho real, AVIF/WebP, diferida).
type CargaImg = ReturnType<typeof fijo>;
const IMG = {
  separador: `${DIR}/separador_inicial.webp`,
  // Captura REAL de /lectura (mobile 390×700 @3x, encuadre que deja ver el
  // pergamino "Resumen de tu lectura" al pie) de la lectura demo "Paula"
  // (2026-10-22), recortada a la proporción de la pantalla de telefono.webp.
  // Las cartas se cambiaron solo en la captura por cartas positivas del mazo
  // propio (decisión de Manuel para piezas públicas).
  pantallaLecturaReal: `${DIR}/pantalla-lectura-real.webp`,
  ilustracionAudio: `${DIR}/ilustracion-audio.webp`,
  ilustracionPdf: `${DIR}/ilustracion-pdf.webp`,
  iconoLectura: `${DIR}/icono-lectura-online.webp`,
  iconoAudio: `${DIR}/icono-audio.webp`,
  iconoPdf: `${DIR}/icono-pdf.webp`,
  fondoCardLectura: `${DIR}/fondo-card-lectura.webp`,
  fondoCardAudio: `${DIR}/fondo-card-audio.webp`,
  fondoCardPdf: `${DIR}/fondo-card-pdf.webp`,
};

// Borde "caro, no llamativo" (spec de Manuel 2026-10-16): filete dorado
// fino + sombra suave + highlight interior apenas visible. La central se
// distingue solo un poco (borde más luminoso, sombra apenas mayor).
const BORDE = {
  normal: {
    border: "1px solid rgba(231,184,71,0.55)",
    boxShadow: "0 0 0 1px rgba(231,184,71,0.08), 0 12px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,235,170,0.08)",
  },
  destacado: {
    border: "1px solid rgba(231,184,71,0.75)",
    boxShadow: "0 0 0 1px rgba(231,184,71,0.12), 0 16px 48px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,235,170,0.10)",
  },
};
const RADIO = 18;

// Mismo patrón que IconoConFallback (components/home/): además de onError se
// chequea el estado real del <img> después de montar, porque un 404 muy
// rápido puede dispararse antes de que React conecte el listener.
function ImagenConFallback({ src, fallback, alt = "", style, className, carga }: { src: string; fallback: ReactNode; alt?: string; style?: CSSProperties; className?: string; carga?: CargaImg }) {
  const ref = useRef<HTMLImageElement>(null);
  const [falló, setFalló] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFalló(true);
  }, [src]);

  if (falló) return <>{fallback}</>;
  return <img ref={ref} src={src} {...carga} alt={alt} aria-hidden={alt ? undefined : true} className={className} style={style} onError={() => setFalló(true)} />;
}

// ── Piezas ────────────────────────────────────────────────────────────

// Los 3 medallones tienen que verse idénticos en tamaño de aro. En los
// archivos (512×512) el aro no ocupa lo mismo — `aro` es su diámetro
// visible medido por píxeles — así que cada imagen se escala para que el
// aro mida ARO px en pantalla en las tres.
const ARO = 79;

function Medallon({ src, aro, Icon }: { src: string; aro: number; Icon: LucideIcon }) {
  const lado = Math.round((ARO * 512) / aro);
  return (
    <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center" style={{ top: -ARO / 2, width: ARO, height: ARO }}>
      <ImagenConFallback
        src={src}
        carga={fijo(src, lado)}
        style={{ width: lado, height: lado, maxWidth: "none", flexShrink: 0, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}
        fallback={
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: ARO, height: ARO, background: "radial-gradient(circle at 40% 35%, #2a1648, #0c0718)", border: `2px solid ${GOLD}` }}
          >
            <Icon size={34} style={{ color: GOLD }} />
          </div>
        }
      />
    </div>
  );
}

// Zona del asset principal (celular / audio / PDF): mismo alto fijo en las
// 3 tarjetas en desktop, así cae en la misma franja vertical. La imagen se
// muestra en su proporción real, contenida en esa zona.
function Ilustracion({ src, fallback }: { src: string; fallback: ReactNode }) {
  return (
    <div className="w-full mt-auto flex items-center justify-center md:h-[230px]">
      <ImagenConFallback
        src={src}
        // ilustracion-audio.webp es 960×614 (pergamino + panel real sonando, 2026-10-22) y se pinta a ≤340 px de ancho
        carga={fluido(src, 960, 614, "(max-width: 767px) 340px, 260px")}
        style={{ display: "block", width: "auto", height: "auto", maxWidth: "100%", maxHeight: 230 }}
        fallback={
          <div className="relative w-full h-full flex items-center justify-center" style={{ minHeight: 200 }}>
            {fallback}
          </div>
        }
      />
    </div>
  );
}

// Reproductor hecho con código: reemplazo mientras no exista
// ilustracion-audio.webp. Sin duración total para no inventar un dato.
function Reproductor() {
  const barras = [6, 12, 9, 18, 24, 14, 28, 20, 11, 22, 30, 16, 9, 19, 26, 12, 8, 15, 21, 10, 6];
  return (
    <div
      className="w-[86%] rounded-2xl px-4 py-4"
      style={{ background: "rgba(10,6,20,0.82)", border: "1px solid rgba(231,184,71,0.45)", boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }}
    >
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 46, height: 46, border: `2px solid ${GOLD}` }}>
          <Play size={20} style={{ color: GOLD, fill: GOLD, marginLeft: 3 }} />
        </span>
        <div className="flex items-center gap-[3px] flex-1" style={{ height: 32 }}>
          {barras.map((h, i) => (
            <span key={i} className="flex-1" style={{ height: h, borderRadius: 2, background: i < 7 ? GOLD : "rgba(240,197,90,0.45)" }} />
          ))}
        </div>
      </div>
      <div className="mt-3 h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.15)" }}>
        <div className="h-full rounded-full" style={{ width: "33%", background: GOLD }} />
      </div>
    </div>
  );
}

// Representación del botón real de la lectura — no es un link (se ve como
// botón porque así lo encuentra el cliente cuando abre su lectura). Los dos
// botones del bloque usan exactamente este estilo.
function BotonVisual({ Icon, children }: { Icon: LucideIcon; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center justify-center gap-2.5 w-full rounded-full text-[15px]"
      style={{ height: 46, fontFamily: SERIF, fontWeight: 700, color: CREMA, background: "linear-gradient(180deg, #2a1648, #170c2c)", border: "1px solid rgba(231,184,71,0.75)" }}
    >
      <Icon size={17} style={{ color: GOLD }} />
      {children}
    </span>
  );
}

interface Bloque {
  fondo: string;
  icono: string;
  aro: number;
  Icon: LucideIcon;
  t: string;
  sub?: string;
  d: string;
  destacado?: boolean;
  ilustracion: ReactNode;
  boton?: ReactNode;
}

// Leer → Escuchar → Conservar. Copy final aprobado por Manuel (2026-10-16):
// "link personal" (el acceso es por link/token), nunca "espacio privado".
const BLOQUES: Bloque[] = [
  {
    fondo: IMG.fondoCardLectura,
    icono: IMG.iconoLectura,
    aro: 388,
    Icon: Link2,
    t: "Tu lectura online",
    sub: "Acceso por link personal",
    d: "Recibís por WhatsApp o email un link personal para acceder a tu lectura y explorarla completa, carta por carta, desde tu celular o computadora.",
    // Esta card no tiene botón: el teléfono ocupa también ese hueco
    // (md:-mb compensa mt-4 + 46px del slot del botón), así se ve más
    // grande sin cambiar el alto de la card ni la alineación con las otras.
    ilustracion: (
      <div className="w-full mt-auto flex items-end justify-center md:h-[292px] md:-mb-[62px]">
        <CelularMock
          pantalla="lectura"
          src={IMG.pantallaLecturaReal}
          alt="La lectura online real en el celular: tu nombre, tu consulta y tus 5 cartas reveladas"
          style={{ height: "100%", maxHeight: 292, width: "auto" }}
          className="h-[260px] md:h-full"
        />
      </div>
    ),
  },
  {
    fondo: IMG.fondoCardAudio,
    icono: IMG.iconoAudio,
    aro: 397,
    Icon: Headphones,
    t: "Resumen en audio",
    sub: "con voz de IA",
    d: "Escuchá el resumen de tu lectura cuando quieras y, si lo deseás, activá la música ambiental para vivir una experiencia más inmersiva.",
    destacado: true,
    // La imagen de Manuel ya trae el reproductor completo: el hecho con
    // código queda solo como reemplazo si el archivo no está.
    ilustracion: <Ilustracion src={IMG.ilustracionAudio} fallback={<Reproductor />} />,
    boton: <BotonVisual Icon={Music}>Ambientar mi lectura</BotonVisual>,
  },
  {
    fondo: IMG.fondoCardPdf,
    icono: IMG.iconoPdf,
    aro: 413,
    Icon: FileText,
    t: "Mensaje personal, claves y tu PDF",
    d: "Además de la interpretación de tus cartas, recibís un mensaje personal y 3 claves para avanzar. También podés descargar tu PDF completo para conservar tu lectura.",
    // Las 3 páginas REALES del PDF (lectura demo "Paula", cartas positivas)
    // en abanico abierto hacia arriba (2026-10-22). Si el archivo faltara,
    // vuelve al mock de una hoja.
    ilustracion: (
      <div className="w-full mt-auto flex items-center justify-center md:h-[230px]">
        <ImagenConFallback
          src={IMG.ilustracionPdf}
          alt="Tu lectura en PDF: portada con tus cinco cartas, la lectura carta por carta y el mensaje final"
          carga={fluido(IMG.ilustracionPdf, 760, 701, "(max-width: 767px) 300px, 250px")}
          style={{ display: "block", width: "auto", height: "auto", maxWidth: "100%", maxHeight: 230 }}
          fallback={
            <div className="relative w-full h-full flex items-center justify-center" style={{ minHeight: 200 }}>
              <DocumentoMock alt="Tu lectura en PDF: la página con tus cinco cartas" style={{ width: "42%" }} />
            </div>
          }
        />
      </div>
    ),
    boton: <BotonVisual Icon={Download}>Ver / descargar PDF</BotonVisual>,
  },
];

// Las 3 tarjetas comparten la misma grilla interna en desktop:
//   pt 76 (medallón + aire, y lugar del badge en la central)
//   encabezado min-h 60 (título de 2 líneas ≈ título de 1 línea + subtítulo)
//   texto → zona de asset (230, al pie) → zona de botón (46, también en la
//   card 1 aunque no tenga botón, para que el asset quede a la misma altura).
// Mobile (pendiente de rediseño): se mantiene el flujo simple de antes.
function Tarjeta({ fondo, icono, aro, Icon, t, sub, d, destacado, ilustracion, boton }: Bloque) {
  return (
    <div
      className="relative px-5 pb-5 pt-14 md:pt-[76px] flex flex-col items-center text-center"
      style={{
        borderRadius: RADIO,
        background: "linear-gradient(180deg, rgba(20,11,38,0.94) 0%, rgba(10,6,20,0.94) 100%)",
        ...(destacado ? BORDE.destacado : BORDE.normal),
      }}
    >
      {/* Fondo propio de la tarjeta. Capa aparte con overflow-hidden: el
          medallón sobresale por arriba y no debe recortarse. */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none" style={{ borderRadius: RADIO }}>
        {/* fondo-card-*.webp: 902×1744 (~410 KB) pintado a ≤370 px */}
        <ImagenConFallback src={fondo} carga={fluido(fondo, 902, 1744, "(max-width: 767px) 92vw, 290px")} fallback={null} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <Medallon src={icono} aro={aro} Icon={Icon} />

      {destacado && (
        // Desktop: posicionado, para no empujar el contenido de la central
        // (mismo inicio vertical que las otras dos). Mobile: en flujo.
        <span
          className="relative md:absolute md:left-1/2 md:-translate-x-1/2 md:top-[46px] mb-2 md:mb-0 inline-block rounded-full px-3.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] whitespace-nowrap"
          style={{ background: CTA_GRADIENT, color: "#180e00" }}
        >
          Lo más especial
        </span>
      )}

      {/* relative: el contenido en flujo tiene que pintar ENCIMA de la capa
          de fondo (posicionada) — mismo bug documentado en BackgroundStage. */}
      <div className="relative flex flex-col items-center w-full flex-1">
        <div className="md:min-h-[60px] flex flex-col items-center">
          <h3 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, lineHeight: 1.15, color: CREMA }}>{t}</h3>
          {sub && (
            <p className="mt-1 text-[15px]" style={{ fontFamily: SERIF, fontWeight: 600, lineHeight: 1.3, color: "#E6D3A3" }}>
              {sub}
            </p>
          )}
        </div>
        <p className="mt-3 mb-4 text-[14.5px] max-w-[250px]" style={{ lineHeight: 1.6, color: "rgba(255,255,255,0.85)" }}>
          {d}
        </p>

        {ilustracion}
        <div className="w-full mt-4 md:h-[46px]">{boton}</div>
      </div>
    </div>
  );
}

function CapsulaEntrega() {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="hidden md:inline text-[13px]" style={{ color: GOLD }}>✦</span>
      <div
        className="inline-flex items-center gap-3 rounded-full px-5 py-2.5"
        style={{ background: "rgba(10,6,20,0.80)", border: "1px solid rgba(231,184,71,0.75)" }}
      >
        <MessageCircle size={20} style={{ color: GOLD, flexShrink: 0 }} />
        <Mail size={20} style={{ color: GOLD, flexShrink: 0 }} />
        <span className="text-left" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 17, color: CREMA }}>
          Te llega por WhatsApp y/o email con tu link personal.
        </span>
      </div>
      <span className="hidden md:inline text-[13px]" style={{ color: GOLD }}>✦</span>
    </div>
  );
}

// Bloque central de venta: muestra la experiencia real (lectura online,
// resumen en audio, PDF), no solo la promesa. Todo el texto es HTML; las
// imágenes son solo ilustración (ver IMG arriba).
export function AsiSeViveTarot() {
  return (
    <section className="relative px-5 md:px-8 py-14 max-w-[960px] mx-auto text-center">
      {/* Separador con estrella (archivo 660×220, la estrella ocupa la franja
          central ~90px de alto). Caja con la proporción de esa franja +
          object-fit:cover: muestra solo la línea y la estrella. */}
      <img
        {...fijo(IMG.separador, 480, 160)}
        alt=""
        aria-hidden="true"
        className="block mx-auto mb-4"
        style={{ width: "min(480px, 80%)", aspectRatio: "660 / 90", objectFit: "cover", objectPosition: "center" }}
      />

      <h2
        className="uppercase"
        style={{
          fontFamily: SERIF,
          fontWeight: 700,
          fontSize: "clamp(1.9rem, 4.2vw, 2.8rem)",
          lineHeight: 1.05,
          letterSpacing: "0.03em",
          color: "#fff",
          textShadow: "0 2px 14px rgba(0,0,0,0.55)",
        }}
      >
        Así vivís la experiencia
      </h2>
      <p className="mt-2" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "clamp(1.15rem, 2.2vw, 1.45rem)", color: "#fff" }}>
        Explorá tu lectura online, escuchá el resumen y descargá tu PDF para conservarla.
      </p>

      {/* Cápsula de entrega, con código: la imagen btn-whatsapp-email.webp
          dice "espacio privado" (descartado — el acceso es por link
          personal). Se vuelve a usar imagen cuando se re-exporte. */}
      <div className="mt-5">
        <CapsulaEntrega />
      </div>

      {/* mt grande: los medallones sobresalen 40px por encima de cada tarjeta. */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-16 items-stretch">
        {BLOQUES.map((b) => (
          <Tarjeta key={b.t} {...b} />
        ))}
      </div>
    </section>
  );
}
