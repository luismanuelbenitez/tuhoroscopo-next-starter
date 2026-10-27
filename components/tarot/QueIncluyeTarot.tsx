"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Carousel } from "@/components/home/Carousel";
import { SERIF } from "@/components/home/theme";
import { fijo, fluido } from "@/lib/imagen";

const BASE = "/img/tarot/contenedores/que-incluye";

// Paleta de texto sobre el pergamino (desktop) — nunca blanco ni gris
// lavado adentro del pergamino, siempre estos tres tonos sólidos.
const COLOR_TITULO = "#241426";    // violeta/negro muy oscuro
const COLOR_SECUNDARIO = "#5A4632"; // marrón oscuro
const COLOR_ACENTO = "#A9791F";     // dorado ocre
// Mobile (sin pergamino: el fondo es el cielo oscuro). Los colores de arriba
// son para tinta sobre pergamino y en mobile no se leían (2026-10-27).
const MOVIL_TITULO = "#F6EAD2";                    // crema
const MOVIL_TEXTO = "rgba(246,234,210,0.80)";      // crema atenuado
const MOVIL_ACENTO = "#F0C55A";                    // dorado de marca

// Mobile todavía sin pergamino propio (se decidió resolver mobile después,
// adaptando desktop) — FondoConFallback no renderiza nada si 404, así que
// mientras tanto el bloque mobile queda sin pergamino, sin romperse.
const PERGAMINO_DESKTOP = `${BASE}/pergamino-desktop.webp`;
// pergamino-mobile.webp nunca se subió (daba 404 y el bloque mobile se
// mostraba sin pergamino): ya no se pide. Mismo resultado visual.

// Cartas reales del mazo personalizado (THC Tarot), elegidas por ser
// visualmente lindas y de carga positiva: La Estrella, La Fuerza, La
// Sacerdotisa, El Sol, El Mundo — no es la tirada real de nadie, es solo
// para ilustrar cada posición en esta landing.
// `e`: etiqueta corta bajo la carta (nombres canónicos de la landing).
// `eDesktop`: la misma con el salto de línea fijado ("\n"), para que en
// desktop corte parejo dentro del ancho de la carta. `t` queda como alt.
const POSICIONES = [
  { img: "carta-tu-momento-actual.jpg", t: "Tu momento actual", e: "Momento actual", eDesktop: "Momento\nactual" },
  { img: "carta-el-desafio.jpg", t: "El desafío", e: "Desafío", eDesktop: "Desafío" },
  { img: "carta-lo-que-no-estas-viendo.jpg", t: "Lo que no estás viendo", e: "Lo que no ves", eDesktop: "Lo que\nno ves" },
  { img: "carta-consejo-para-avanzar.jpg", t: "Consejo para avanzar", e: "Consejo", eDesktop: "Consejo" },
  { img: "carta-lo-que-viene.jpg", t: "Lo que viene", e: "Lo que viene", eDesktop: "Lo que\nviene" },
];

// Lo que conecta las 5 cartas — mapea 1:1 con los campos reales de la
// lectura (resumen_lectura, mensaje_final, proximos_pasos).
//
// Tarjeta = medallón (imagen) + título y descripción en HTML real — el
// texto quemado en imágenes apaisadas se leía a ~9px dentro del marco.
// `img` es SOLO el círculo con el ícono (cuadrado, fondo transparente).
const CONECTA = [
  { img: "resumen-lectura.webp", t: "Resumen de tu lectura", d: "La historia que cuentan tus cinco cartas cuando las miramos juntas." },
  { img: "mensajepersonal.webp", t: "Mensaje personal", d: "Una reflexión final enfocada en tu consulta y en tu momento." },
  { img: "3claves.webp", t: "3 claves para avanzar", d: "Ideas concretas para llevar lo que apareció en la lectura a tu día a día." },
];

function Medallon({ img, size }: { img: string; size: string }) {
  return (
    <img
      // Paquete SEO 2: 512 px → se pinta a ≤52 px
      {...fijo(`${BASE}/${img}`, 56)}
      alt=""
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0, objectFit: "contain", filter: "drop-shadow(0 3px 6px rgba(40,20,0,0.30))" }}
    />
  );
}

// ── Desktop: todo medido en proporción al ancho del pergamino ──────────
// El pergamino es una imagen cuadrada que escala con el ancho de la
// sección; si el contenido se mide en px fijos, a cualquier ancho distinto
// de 960 los textos y cartas terminan encima de los adornos (estrella de
// arriba, soles de los costados, esquinas). Con container queries (`cqw`,
// 1cqw = 1% del ancho de la sección) el contenido escala junto con la
// imagen y siempre cae en la misma zona libre.
//
// `u(px)` traduce una medida pensada a 960px de ancho a cqw. Zona libre del
// pergamino a 960px (medida sobre la imagen): estrella superior hasta
// y≈145, estrella inferior desde y≈796, soles laterales hasta x≈142 y
// desde x≈818 (entre y≈398 y 520), esquinas inferiores desde y≈735.
const u = (px: number) => `${(px / 9.6).toFixed(3)}cqw`;

// Marco dorado metálico hecho con código: el degradé es el "borde" (el
// padding deja ver solo un filete), la carta va adentro con esquinas
// apenas más chicas para que el marco acompañe el redondeo.
const MARCO_DORADO = "linear-gradient(145deg, #8a6420 0%, #f3d27a 22%, #b8862b 45%, #fbe39a 62%, #9c7224 82%, #e9c56a 100%)";

function CartaConMarco({ img, alt, grosor, radio }: { img: string; alt: string; grosor: string; radio: string }) {
  return (
    <div style={{ width: "100%", padding: grosor, borderRadius: radio, background: MARCO_DORADO, boxShadow: "0 6px 18px rgba(40,20,0,0.30), 0 0 0 1px rgba(90,60,10,0.35)" }}>
      <img
        // Paquete SEO 2: 767×1151 (~150 KB) → se pinta a ≤202 px de ancho
        {...fluido(`${BASE}/${img}`, 767, 1151, "(max-width: 767px) 210px, 130px")}
        alt={alt}
        style={{ display: "block", width: "100%", aspectRatio: "2 / 3", objectFit: "cover", borderRadius: `calc(${radio} - ${grosor})` }}
      />
    </div>
  );
}

const ETIQUETA: CSSProperties = { fontFamily: SERIF, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: COLOR_TITULO, lineHeight: 1.1 };

function PosicionCardDesktop({ img, t, eDesktop }: (typeof POSICIONES)[number]) {
  return (
    <div className="text-center flex flex-col items-center">
      <CartaConMarco img={img} alt={t} grosor={u(3.5)} radio={u(8)} />
      <p style={{ ...ETIQUETA, fontSize: u(16), marginTop: u(10), whiteSpace: "pre-line" }}>{eDesktop}</p>
    </div>
  );
}

function PosicionCardMobile({ img, t, e }: (typeof POSICIONES)[number]) {
  return (
    <div className="text-center flex flex-col items-center" style={{ width: "min(78vw, 210px)" }}>
      <CartaConMarco img={img} alt={t} grosor="4px" radio="10px" />
      <p className="mt-3" style={{ ...ETIQUETA, fontSize: 18, color: MOVIL_ACENTO }}>{e}</p>
    </div>
  );
}

// Sin fondo propio (nada de "pergamino sobre pergamino"): solo un velo
// cálido muy suave y un filete dorado, para que se lea como parte del
// mismo pergamino.
function TarjetaConectaDesktop({ img, t, d }: (typeof CONECTA)[number]) {
  return (
    <div
      // items-start: los 3 títulos arrancan a la misma altura aunque las
      // descripciones tengan distinta cantidad de líneas.
      className="flex items-start text-left"
      style={{
        gap: u(9),
        padding: `${u(12)} ${u(12)}`,
        borderRadius: u(10),
        border: "1px solid rgba(169,121,31,0.50)",
        background: "rgba(255,248,230,0.35)",
      }}
    >
      <Medallon img={img} size={u(46)} />
      <div className="min-w-0">
        {/* lining-nums: en Cormorant los números son "de estilo antiguo"
            (el 3 baja de la línea y se ve más chico) — sin esto "3 claves
            para avanzar" parece de otra tipografía/tamaño. nowrap + 16px:
            los tres títulos en una sola línea, así se leen iguales. */}
        <p className="whitespace-nowrap" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: u(16), lineHeight: 1.15, color: COLOR_TITULO, marginBottom: u(3), fontVariantNumeric: "lining-nums" }}>{t}</p>
        <p style={{ fontSize: u(11.5), lineHeight: 1.35, color: COLOR_SECUNDARIO }}>{d}</p>
      </div>
    </div>
  );
}

// Mismo patrón robusto que IconoConFallback (components/home/): un <img
// onError> solo no alcanza si el 404 es muy rápido, puede dispararse antes
// de que React conecte el listener (desajuste de hidratación) — por eso
// también se chequea el estado real post-montaje.
//
// Sin object-fit ni caja con alto fijo: la imagen vive en flujo normal
// (width:100%, height:auto, su proporción real) apilada en la MISMA celda
// de grid que el contenido (grid-area 1/1 en ambos). Así nunca se recorta
// ni se estira.
function FondoConFallback({ src, carga }: { src: string; carga?: ReturnType<typeof fluido> }) {
  const ref = useRef<HTMLImageElement>(null);
  const [falló, setFalló] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFalló(true);
  }, [src]);

  if (falló) return null;

  return (
    <img
      ref={ref}
      src={src}
      {...carga}
      alt=""
      aria-hidden="true"
      style={{ gridArea: "1 / 1", alignSelf: "start", width: "100%", height: "auto" }}
      onError={() => setFalló(true)}
    />
  );
}

// Sin px-5/md:px-8 (a diferencia de los demás bloques): el pergamino debe
// ocupar el ancho TOTAL del escenario (960px, el mismo ancho que el fondo
// de la página), no el ancho de contenido con gutter lateral que usa el
// resto de las secciones.
export function QueIncluyeTarot() {
  return (
    <section className="relative max-w-[960px] mx-auto">
      {/* ── Desktop ── grid-cols-1 = repeat(1, minmax(0,1fr)): la columna
          respeta el ancho real del contenedor en vez de inflarse con el
          contenido más ancho. */}
      <div className="hidden md:grid grid-cols-1 text-center" style={{ containerType: "inline-size" }}>
        <FondoConFallback src={PERGAMINO_DESKTOP} carga={fluido(PERGAMINO_DESKTOP, 1254, 1254, "(max-width: 960px) 100vw, 960px")} />

        <div style={{ gridArea: "1 / 1", alignSelf: "start", padding: `${u(190)} ${u(120)} 0` }}>
          <p className="font-bold uppercase" style={{ color: COLOR_ACENTO, letterSpacing: "0.18em", fontSize: u(11), marginBottom: u(8) }}>
            Tarot, posición por posición
          </p>
          <h2 style={{ color: COLOR_TITULO, fontWeight: 800, fontSize: u(36), lineHeight: 1.15, marginBottom: u(10) }}>
            ¿Qué incluye la lectura?
          </h2>
          <p className="mx-auto" style={{ color: COLOR_SECUNDARIO, fontSize: u(14), lineHeight: 1.6, maxWidth: u(560), marginBottom: u(34) }}>
            Una lectura personalizada de 5 cartas. Interpretamos cada carta según su posición y
            después conectamos toda la lectura en un resumen, un mensaje personal y 3 claves para
            avanzar.
          </p>

          {/* 5 columnas de 122 (a 960px): la fila queda entre x≈147 y 813,
              adentro de los soles laterales. */}
          <div className="grid" style={{ gridTemplateColumns: `repeat(5, ${u(122)})`, columnGap: u(14), justifyContent: "center" }}>
            {POSICIONES.map((p) => (
              <PosicionCardDesktop key={p.t} {...p} />
            ))}
          </div>

          <p className="font-bold uppercase tracking-wide" style={{ color: COLOR_ACENTO, fontSize: u(13), marginTop: u(22), marginBottom: u(12) }}>
            ✦ Y las cinco cartas se conectan en... ✦
          </p>

          {/* 3 tarjetas en fila, 740 de ancho total (x≈110–850): adentro
              de las estrellitas del filete lateral y terminando antes de
              las esquinas inferiores del pergamino. */}
          <div className="grid grid-cols-3 mx-auto items-stretch" style={{ width: u(740), columnGap: u(12) }}>
            {CONECTA.map((c) => (
              <TarjetaConectaDesktop key={c.t} {...c} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile ── (pendiente de rediseño: todavía sin pergamino propio) */}
      <div className="md:hidden grid grid-cols-1 text-center">

        <div className="px-6 py-12" style={{ gridArea: "1 / 1", alignSelf: "start" }}>
          <p className="text-[11px] font-bold uppercase mb-4" style={{ color: MOVIL_ACENTO, letterSpacing: "0.18em" }}>
            Tu tarot, posición por posición
          </p>
          <h2 className="text-3xl mb-5" style={{ color: MOVIL_TITULO, fontWeight: 800, textShadow: "0 2px 14px rgba(0,0,0,0.6)" }}>¿Qué incluye tu Tarot?</h2>
          <p className="text-[13px] leading-relaxed mb-14 max-w-md mx-auto" style={{ color: MOVIL_TEXTO, textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>
            Una lectura personalizada de 5 cartas. Interpretamos cada carta según su posición y
            después conectamos toda la lectura en un resumen, un mensaje personal y 3 claves para
            avanzar.
          </p>

          <Carousel showArrows={false}>
            {POSICIONES.map((p) => <PosicionCardMobile key={p.t} {...p} />)}
          </Carousel>

          <p className="text-[13px] font-bold uppercase tracking-wide mt-20 mb-10" style={{ color: MOVIL_ACENTO }}>
            ✦ Y las cinco cartas se conectan en... ✦
          </p>

          {/* Mínimo para no romper con los medallones; el diseño mobile
              real se resuelve en la etapa móvil. */}
          <div className="flex flex-col gap-3 max-w-[420px] mx-auto">
            {CONECTA.map(({ img, t, d }) => (
              <div key={img} className="flex items-center gap-3 text-left rounded-xl px-4 py-3" style={{ border: "1px solid rgba(240,197,90,0.45)", background: "rgba(16,8,30,0.82)", boxShadow: "0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,235,170,0.08)" }}>
                <Medallon img={img} size="52px" />
                <div className="min-w-0">
                  <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, lineHeight: 1.15, color: MOVIL_TITULO, fontVariantNumeric: "lining-nums" }}>{t}</p>
                  <p className="text-[13px] leading-snug mt-0.5" style={{ color: MOVIL_TEXTO }}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
