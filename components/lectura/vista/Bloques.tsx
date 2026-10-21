"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ArrowRight, BookOpen, Sparkles, Mail, KeyRound, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CartaPublica } from "@/lib/tarotLecturaPublica";
import { AmbientAudioControls } from "@/components/lectura/AmbientAudio";
import { ResumenAudioControls } from "@/components/lectura/ResumenAudioControls";
import { DIR, SERIF, CREMA, GOLD, TINTA, TINTA_SUAVE, TINTA_TEXTO, PERGAMINO_TARJETA, PERGAMINO_CLASES, CartaConMarco } from "./Base";

// Bloques interactivos de /lectura bajo el hero (rediseño 2026-10-18).
// Solo presentación: los "Leer / Ver" despliegan contenido que ya llegó con
// la lectura (no hay pedidos nuevos ni lógica de negocio). Los botones de
// audio son los componentes existentes, con una piel clara.

// Mismo patrón que IconoConFallback (components/home/): si el archivo nuevo
// no existe todavía, se muestra el reemplazo — así cada ilustración aparece
// sola al subirla.
function ImagenConFallback({ src, fallback, size }: { src: string; fallback: ReactNode; size: number }) {
  const ref = useRef<HTMLImageElement>(null);
  const [falló, setFalló] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFalló(true);
  }, [src]);
  if (falló) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} alt="" aria-hidden="true" width={size} height={size} style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }} onError={() => setFalló(true)} />;
}

function Ilustracion({ src, medallon, Icon, size }: { src: string; medallon: string | null; Icon: LucideIcon; size: number }) {
  const icono = (
    <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: size, height: size, background: "radial-gradient(circle at 40% 35%, #2a1648, #0c0718)", border: `2px solid ${GOLD}` }}>
      <Icon size={size * 0.42} style={{ color: GOLD }} />
    </span>
  );
  return (
    <ImagenConFallback
      src={src}
      size={size}
      fallback={medallon ? <ImagenConFallback src={medallon} size={size} fallback={icono} /> : icono}
    />
  );
}

const BOTON_OSCURO =
  "inline-flex items-center justify-center gap-2 rounded-full min-h-[40px] px-5 text-[13.5px] font-semibold text-[#F5EFE0] bg-[linear-gradient(180deg,#22164a,#120b2a)] border border-[rgba(231,184,71,0.55)] shadow-[0_4px_14px_rgba(20,10,40,0.35)] transition hover:brightness-125";

// ── Resumen ───────────────────────────────────────────────────────────

const PAN = `${DIR}/contenedores/paneles`;

export function ResumenBloque({ resumen, audioResumenUrl }: { resumen: string; audioResumenUrl: string | null }) {
  const [abierto, setAbierto] = useState(false);

  const botones = (
    <>
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-controls="resumen-texto" className={BOTON_OSCURO}>
        <BookOpen size={16} style={{ color: GOLD }} />
        {abierto ? "Ocultar resumen" : "Ver resumen"}
      </button>
      <ResumenAudioControls audioUrl={audioResumenUrl} variante="pergamino" />
      <AmbientAudioControls variante="pergamino" />
    </>
  );

  const titulo = (
    <h2 style={{ fontFamily: SERIF, fontWeight: 700, lineHeight: 1.1, color: TINTA }} className="text-[25px] lg:text-[31px]">
      Resumen de tu lectura
    </h2>
  );
  const intro = (
    <p className="text-[13px] lg:text-[14px] leading-snug" style={{ color: TINTA_SUAVE }}>
      Acá vas a encontrar una síntesis de tu lectura, con los mensajes principales y la energía general que se revela en tus cartas.
    </p>
  );

  return (
    <section id="resumen" className="scroll-mt-4">
      {/* Desktop (≥1024): pergamino horizontal 1760×400, sol y luna en la
          imagen; contenido en la franja central libre (x 19%–81%). */}
      <div className="hidden lg:block relative w-full" style={{ aspectRatio: "1760 / 400", backgroundImage: `url(${PAN}/pergamino-resumen-desktop.webp)`, backgroundSize: "100% 100%", filter: "drop-shadow(0 14px 30px rgba(0,0,0,0.45))" }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-[17%] pt-[2.5%] gap-1.5 [&_button]:!px-3.5 [&_button]:!text-[13px] [&_button]:!min-h-[38px]">
          {titulo}
          <div className="max-w-[480px]">{intro}</div>
          <div className="mt-2 flex items-center justify-center gap-2 flex-nowrap">{botones}</div>
        </div>
      </div>

      {/* Mobile/tablet: pergamino 780×720 (sol y luna arriba en las esquinas).
          2026-10-21: grilla de una celda con dos capas — un espaciador con la
          proporción del pergamino y el contenido. La celda toma la altura
          MAYOR: conserva 780×720 cuando todo entra y crece cuando no (en
          pantallas angostas el último botón quedaba sobre el borde). */}
      <div className="lg:hidden relative w-full max-w-[480px] mx-auto grid grid-cols-[minmax(0,1fr)]" style={{ backgroundImage: `url(${PAN}/pergamino-resumen-mobile.webp)`, backgroundSize: "100% 100%", filter: "drop-shadow(0 14px 30px rgba(0,0,0,0.45))" }}>
        <div aria-hidden="true" className="[grid-area:1/1]" style={{ aspectRatio: "780 / 720" }} />
        <div className="[grid-area:1/1] flex flex-col items-center text-center px-[11%] pt-[9%] pb-[11%]">
          <div className="px-[16%]">{titulo}</div>
          <div className="mt-2">{intro}</div>
          <div className="mt-4 w-full flex flex-col items-stretch gap-2 [&>*]:w-full [&_button]:w-full">{botones}</div>
        </div>
      </div>

      <div id="resumen-texto" hidden={!abierto} className="mt-4">
        <div style={PERGAMINO_TARJETA} className={`${PERGAMINO_CLASES} px-1 md:px-6`}>
          <p className="text-[17px] md:text-[18px] leading-[1.75] whitespace-pre-line" style={{ fontFamily: SERIF, fontWeight: 700, color: "#160a03" }}>
            {resumen}
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Carta por carta (acordeón) ────────────────────────────────────────

// Etiquetas cortas canónicas (iguales a /tarot) + bajada de cada posición.
const POSICIONES: Record<number, { t: string; d: string }> = {
  1: { t: "Momento actual", d: "El momento que estás viviendo" },
  2: { t: "Desafío", d: "Lo que puede estar frenando el avance" },
  3: { t: "Lo que no ves", d: "Lo que influye desde un lugar menos evidente" },
  4: { t: "Consejo", d: "Una orientación práctica para tu momento" },
  5: { t: "Lo que viene", d: "Hacia dónde se mueve la energía" },
};

export function CartaPorCarta({ cartas }: { cartas: CartaPublica[] }) {
  // Las cartas del hero enlazan a #carta-N: al llegar ese hash, se abre la
  // fila correspondiente (un <details> no se abre solo con un ancla).
  useEffect(() => {
    function abrirDesdeHash() {
      const id = window.location.hash.slice(1);
      if (!id.startsWith("carta-")) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    abrirDesdeHash();
    window.addEventListener("hashchange", abrirDesdeHash);
    return () => window.removeEventListener("hashchange", abrirDesdeHash);
  }, []);

  return (
    <section aria-labelledby="titulo-cartas">
      <div className="text-center mb-5 md:mb-6">
        <div className="flex items-center justify-center gap-4">
          <span aria-hidden="true" className="hidden sm:block h-px w-16 md:w-28" style={{ background: "linear-gradient(90deg, transparent, rgba(240,197,90,0.6))" }} />
          <h2 id="titulo-cartas" style={{ fontFamily: SERIF, fontWeight: 700, lineHeight: 1.1, color: CREMA }} className="text-[26px] md:text-[32px]">
            Tu lectura, carta por carta
          </h2>
          <span aria-hidden="true" className="hidden sm:block h-px w-16 md:w-28" style={{ background: "linear-gradient(270deg, transparent, rgba(240,197,90,0.6))" }} />
        </div>
        <p className="mt-1.5 text-[13.5px]" style={{ color: "rgba(245,239,224,0.72)" }}>
          Explorá en detalle el mensaje de cada una de tus cartas.
        </p>
      </div>

      <div className="space-y-3">
        {cartas.map((c) => {
          const pos = POSICIONES[c.posicion];
          const invertida = c.orientacion === "invertida";
          return (
            <details
              key={c.posicion}
              id={`carta-${c.posicion}`}
              className="group rounded-[18px] scroll-mt-4 transition-[border-color,box-shadow] duration-300 border border-[rgba(240,197,90,0.32)] open:border-[rgba(240,197,90,0.55)] open:shadow-[0_18px_44px_rgba(0,0,0,0.5),0_0_0_1px_rgba(240,197,90,0.06)] [&::-webkit-details-marker]:hidden"
              style={{
                // Panel sólido: el fondo decorativo de la página no compite con el texto.
                background: "linear-gradient(180deg, rgba(24,11,42,0.95) 0%, rgba(14,7,26,0.96) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,235,170,0.07)",
              }}
            >
              <summary className="flex items-center gap-3.5 md:gap-5 px-3.5 md:px-6 py-3 md:py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden outline-none focus-visible:ring-2 focus-visible:ring-[#F0C55A]/60 rounded-[18px]">
                {/* Miniatura: se oculta al desplegar (la carta grande ya se ve abajo). */}
                <CartaConMarco src={c.imagen_url} alt={c.nombre_carta} invertida={invertida} ancho={36} grosor={1.5} radio={3} className="group-open:hidden" />
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-[10.5px] md:text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
                    {c.posicion} · {pos?.t ?? `Carta ${c.posicion}`}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2.5 flex-wrap">
                    <span className="text-[19px] md:text-[22px] leading-tight" style={{ fontFamily: SERIF, fontWeight: 700, color: CREMA }}>
                      {c.nombre_carta}
                    </span>
                    <BadgeOrientacion orientacion={c.orientacion} />
                  </span>
                </span>
                {/* Control existente del <details>: solo piel (aro + rotación). */}
                <span
                  aria-hidden="true"
                  className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full border border-[rgba(240,197,90,0.45)] transition-colors duration-300 group-hover:bg-[rgba(240,197,90,0.08)] group-open:bg-[rgba(240,197,90,0.10)]"
                >
                  <ChevronDown size={18} className="transition-transform duration-300 group-open:rotate-180" style={{ color: GOLD }} />
                </span>
              </summary>

              {/* Contenido abierto. Desktop: carta | filete | interpretación.
                  Mobile: carta centrada → nombre/orientación → interpretación. */}
              <div className="px-5 pb-7 pt-2 md:px-9 md:pb-9 md:pt-3">
                <div aria-hidden="true" className="h-px mb-6 md:mb-7" style={{ background: "linear-gradient(90deg, transparent, rgba(240,197,90,0.35), transparent)" }} />
                <div className="md:flex md:items-start">
                  <figure className="shrink-0 flex flex-col items-center md:w-[180px]">
                    {/* Carta viva solo en la carta grande (la fila cerrada no la monta). */}
                    <div className="carta-viva rounded-[8px]">
                      <CartaConMarco src={c.imagen_url} alt={c.nombre_carta} invertida={invertida} ancho={150} grosor={3} radio={8} />
                      <span aria-hidden="true" className="carta-viva-brillo" />
                    </div>
                  </figure>
                  <div aria-hidden="true" className="hidden md:block self-stretch w-px mx-9" style={{ background: "linear-gradient(180deg, transparent, rgba(240,197,90,0.35) 15%, rgba(240,197,90,0.35) 85%, transparent)" }} />
                  <div className="mt-6 md:mt-0 min-w-0 md:max-w-[650px]">
                    <p className="mb-4 text-[14px] italic" style={{ fontFamily: SERIF, fontWeight: 600, color: "rgba(245,239,224,0.7)" }}>
                      {pos?.d}
                    </p>
                    <p className="text-[17px] md:text-[17.5px] leading-[1.72]" style={{ color: "#EFE6D2" }}>
                      {c.interpretacion}
                    </p>
                  </div>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

// Badge de orientación: muestra el valor que ya llega ("derecha" /
// "invertida"); no interpreta ni deriva nada.
function BadgeOrientacion({ orientacion }: { orientacion: string }) {
  if (!orientacion) return null;
  const invertida = orientacion === "invertida";
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.16em] leading-none"
      style={invertida
        ? { color: "#F3DFA5", border: "1px solid rgba(240,197,90,0.55)", background: "rgba(240,197,90,0.10)" }
        : { color: "rgba(245,239,224,0.7)", border: "1px solid rgba(245,239,224,0.25)" }}
    >
      {orientacion}
    </span>
  );
}

// ── Tarjetas de pergamino (mensaje / claves / PDF / otra lectura) ─────

function TarjetaPergamino({
  id, ilustracion, titulo, descripcion, accion, children,
}: { id: string; ilustracion: ReactNode; titulo: string; descripcion: ReactNode; accion: ReactNode; children?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4">
      <div style={PERGAMINO_TARJETA} className={`${PERGAMINO_CLASES} px-0 py-0 md:px-2`}>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="shrink-0">{ilustracion}</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[22px] md:text-[27px]" style={{ fontFamily: SERIF, fontWeight: 700, lineHeight: 1.12, color: TINTA }}>{titulo}</h2>
            <div className="mt-1 text-[13px] md:text-[14px] leading-snug" style={{ color: TINTA_SUAVE }}>{descripcion}</div>
          </div>
          <div className="hidden md:block shrink-0">{accion}</div>
        </div>
        {/* Mobile (2026-10-21): la acción en su propia fila, centrada — dentro
            de la columna de texto (~155 px) el botón se montaba sobre el borde. */}
        <div className="mt-4 flex justify-center md:hidden">{accion}</div>
        {children}
      </div>
    </section>
  );
}

function BotonDesplegar({ abierto, onClick, textoCerrado, controla }: { abierto: boolean; onClick: () => void; textoCerrado: string; controla: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={abierto} aria-controls={controla} className={BOTON_OSCURO}>
      {abierto ? "Ocultar" : textoCerrado}
      <ArrowRight size={15} className={`transition-transform ${abierto ? "rotate-90" : ""}`} style={{ color: GOLD }} />
    </button>
  );
}

export function MensajeBloque({ mensaje }: { mensaje: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <TarjetaPergamino
      id="mensaje"
      ilustracion={<Ilustracion src={`${PAN}/ilustracion-mensaje.webp`} medallon={null} Icon={Mail} size={88} />}
      titulo="Mensaje personal"
      descripcion="Una reflexión final para acompañarte en este momento de tu camino."
      accion={<BotonDesplegar abierto={abierto} onClick={() => setAbierto((v) => !v)} textoCerrado="Leer mi mensaje" controla="mensaje-texto" />}
    >
      <div id="mensaje-texto" hidden={!abierto} className="mt-4 pt-4 border-t border-[rgba(120,85,30,0.3)]">
        <p className="text-[18px] md:text-[19px] leading-[1.75] text-center px-1 md:px-8" style={{ fontFamily: SERIF, fontWeight: 700, color: "#160a03" }}>
          {mensaje}
        </p>
      </div>
    </TarjetaPergamino>
  );
}

export function ClavesBloque({ pasos }: { pasos: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const n = pasos.length;
  return (
    <TarjetaPergamino
      id="claves"
      ilustracion={<Ilustracion src={`${PAN}/ilustracion-claves.webp`} medallon={null} Icon={KeyRound} size={88} />}
      titulo={n === 1 ? "1 clave para avanzar" : `${n} claves para avanzar`}
      descripcion="Recomendaciones prácticas para integrar lo que apareció en tu lectura a tu día a día."
      accion={<BotonDesplegar abierto={abierto} onClick={() => setAbierto((v) => !v)} textoCerrado="Ver mis claves" controla="claves-lista" />}
    >
      <ol id="claves-lista" hidden={!abierto} className="mt-4 pt-4 border-t border-[rgba(120,85,30,0.3)] space-y-3.5 md:px-6">
        {pasos.map((paso, i) => (
          <li key={i} className="flex gap-3.5">
            <span
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[15px] font-bold"
              style={{ background: "linear-gradient(180deg,#22164a,#120b2a)", color: GOLD, fontFamily: SERIF, fontVariantNumeric: "lining-nums", lineHeight: 1 }}
            >
              {i + 1}
            </span>
            <p className="pt-0.5 text-[15.5px] leading-relaxed" style={{ color: TINTA_TEXTO }}>{paso}</p>
          </li>
        ))}
      </ol>
    </TarjetaPergamino>
  );
}

export function PdfBloque({ pdfHref, venceTexto }: { pdfHref: string; venceTexto: string | null }) {
  return (
    <TarjetaPergamino
      id="pdf"
      ilustracion={<Ilustracion src={`${PAN}/ilustracion-pdf.webp`} medallon={null} Icon={FileText} size={88} />}
      titulo="Tu lectura en PDF"
      descripcion={
        <>
          Guardá tu lectura completa con las 5 cartas, el resumen, el mensaje y las claves.
          {venceTexto && <span className="block mt-1 text-[12.5px]" style={{ color: "#7a6448" }}>Disponible online hasta el {venceTexto}. El PDF es tuyo para siempre.</span>}
        </>
      }
      accion={
        <a href={pdfHref} className={BOTON_OSCURO}>
          Descargar PDF <ArrowRight size={15} style={{ color: GOLD }} />
        </a>
      }
    />
  );
}

// "Hacer otra lectura" → checkout a precio normal, con nombre y fecha
// precargados. Sin cupón: el 20% (VOLVE20) queda solo para la pantalla de
// acceso vencido (decisión de Manuel 2026-10-18). WhatsApp/email no viajan
// en la URL (datos personales).
export function OtraLecturaBloque({ nombre, nacimiento }: { nombre: string | null; nacimiento: string | null }) {
  const params = new URLSearchParams();
  if (nombre) params.set("nombre", nombre);
  if (nacimiento) params.set("nacimiento", nacimiento);
  params.set("utm_source", "lectura");
  params.set("utm_medium", "web");
  params.set("utm_campaign", "otra-lectura");
  const href = `/tarot/checkout?${params.toString()}`;

  return (
    <TarjetaPergamino
      id="otra-lectura"
      ilustracion={<Ilustracion src={`${PAN}/ilustracion-otra-lectura.webp`} medallon={null} Icon={Sparkles} size={88} />}
      titulo="¿Querés hacer otra lectura?"
      descripcion="Cada pregunta abre una nueva mirada."
      accion={
        <a
          href={href}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full min-h-[44px] px-6 text-[14.5px] font-bold transition hover:brightness-105"
          style={{ background: "linear-gradient(135deg, #c8980e 0%, #FFCE4D 60%, #e8bc3a 100%)", color: "#180e00", boxShadow: "0 4px 16px rgba(240,197,90,0.30)" }}
        >
          Hacer otra lectura <ArrowRight size={16} />
        </a>
      }
    />
  );
}
