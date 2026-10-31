"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowRight } from "lucide-react";
import type { CartaPublica } from "@/lib/tarotLecturaPublica";
import { CTA_GRADIENT } from "@/components/home/theme";
import { DIR, SERIF, CREMA, GOLD } from "./Base";
import { urlOptimizada } from "@/lib/imagen";
import { ImgCarta } from "./ImgCarta";

// Hero de /lectura (rediseño visual 2026-10-17). Dos tiempos:
//   1. cinco dorsos + "Revelar mi lectura"
//   2. las cartas se dan vuelta y muestran las cartas REALES de esta lectura
//      (imagen_url, invertida rotada) + "Seguir con mi lectura".
// Se revela siempre al entrar (decisión de Manuel). El estado es solo de
// presentación: el resto de la lectura está accesible igual.
//
// Assets (public/img/lectura/contenedores/cabezal/) con reemplazo provisorio
// vía fondos CSS en capas: si el archivo nuevo no existe, se ve la capa de
// abajo (la escena/pergamino actual o el dorso hecho con código).
const CAB = `${DIR}/contenedores/cabezal`;

const PERGAMINO = `url(${urlOptimizada(`${CAB}/pergamino-nombre.webp`, 828)})`;
const DORSO_PROVISORIO =
  "radial-gradient(circle at 50% 50%, rgba(240,197,90,0.55) 0 14%, transparent 15%), " +
  "radial-gradient(circle at 50% 50%, transparent 0 22%, rgba(240,197,90,0.35) 23% 24%, transparent 25%), " +
  "linear-gradient(160deg, #1c2a5c 0%, #101a3d 55%, #0b1230 100%)";

const MARCO_DORADO = "linear-gradient(145deg, #8a6420 0%, #f3d27a 22%, #b8862b 45%, #fbe39a 62%, #9c7224 82%, #e9c56a 100%)";

// Abanico: leve rotación y arco, igual en dorso y frente.
const ABANICO = [
  { rot: -9, y: 16 },
  { rot: -4.5, y: 5 },
  { rot: 0, y: 0 },
  { rot: 4.5, y: 5 },
  { rot: 9, y: 16 },
];

// Tiempos de la revelación: cada carta gira GIRO_MS y empieza ESCALON_MS
// después de la anterior. El CTA cambia a "Seguir con mi lectura" recién
// cuando terminó de girar la última (REVELADO_MS).
const GIRO_MS = 1300;
const ESCALON_MS = 380;
const REVELADO_MS = GIRO_MS + ESCALON_MS * 4;

function tamanoNombre(nombre: string): string {
  const n = nombre.length;
  if (n <= 12) return "clamp(1.7rem, 7vw, 2.4rem)";
  if (n <= 18) return "clamp(1.4rem, 5.6vw, 2rem)";
  if (n <= 24) return "clamp(1.15rem, 4.6vw, 1.6rem)";
  return "clamp(1rem, 3.8vw, 1.3rem)";
}

function Carta({ carta, i, revelada, viva, sola, onVoltear }: {
  carta: CartaPublica; i: number; revelada: boolean; viva: boolean;
  // sola: esta carta se dio vuelta con su propio clic (gira sin escalón).
  sola: boolean; onVoltear: () => void;
}) {
  const { rot, y } = ABANICO[i] ?? ABANICO[2];
  const cara: CSSProperties = {
    position: "absolute",
    inset: 0,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    borderRadius: 8,
  };
  return (
    <a
      href={revelada ? `#carta-${carta.posicion}` : undefined}
      // Boca abajo, un clic da vuelta solo esta carta (2026-10-20).
      role={revelada ? undefined : "button"}
      aria-label={revelada ? `${carta.nombre_carta}: ir a esta carta` : `Dar vuelta la carta ${carta.posicion}`}
      tabIndex={0}
      onClick={revelada ? undefined : (e) => { e.preventDefault(); onVoltear(); }}
      onKeyDown={revelada ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onVoltear(); } }}
      className={`block shrink-0 ${revelada ? "" : "cursor-pointer"} w-[70px] sm:w-[84px] md:w-[116px] -mx-[3px] md:mx-[6px] outline-none`}
      style={{ transform: `translateY(${y}px) rotate(${rot}deg)` }}
    >
      {/* "Carta viva": envoltorio aparte del flip (nunca se animan juntos:
          `viva` está apagado mientras las cartas giran). */}
      <div
        className={`relative w-full rounded-[8px] ${viva ? "carta-viva" : ""}`}
        // preserve-3d: sin esto, la animación de este envoltorio aplana el
        // 3D del giro y Chrome muestra el dorso aunque la carta esté revelada.
        style={{ perspective: 900, transformStyle: "preserve-3d", ["--cv-delay" as string]: `${-i * 1.7}s` }}
      >
      <div
        className="relative w-full motion-reduce:!transition-none"
        style={{
          aspectRatio: "2 / 3",
          transformStyle: "preserve-3d",
          transition: `transform ${GIRO_MS}ms cubic-bezier(.25,.6,.25,1)`,
          transitionDelay: sola ? "0ms" : `${i * ESCALON_MS}ms`,
          transform: revelada ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Dorso */}
        <div
          aria-hidden="true"
          style={{
            ...cara,
            backgroundImage: `url(${urlOptimizada(`${CAB}/dorso-carta.webp`, 256)}), ${DORSO_PROVISORIO}`,
            backgroundSize: "100% 100%, auto, auto, auto",
            border: "2px solid rgba(240,197,90,0.75)",
            boxShadow: "0 10px 26px rgba(0,0,0,0.55), 0 0 18px rgba(240,197,90,0.15)",
          }}
        />
        {/* Frente: la carta real con marco dorado */}
        <div
          style={{
            ...cara,
            transform: "rotateY(180deg)",
            padding: 3,
            background: MARCO_DORADO,
            boxShadow: "0 10px 26px rgba(0,0,0,0.55), 0 0 22px rgba(240,197,90,0.35)",
          }}
        >
          {carta.imagen_url ? (
            <ImgCarta
              src={carta.imagen_url}
              ancho={256}
              alt={carta.nombre_carta}
              className={carta.orientacion === "invertida" ? "rotate-180" : ""}
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", borderRadius: 5 }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-center px-1" style={{ background: "#0c0718", color: "#8b84a3", borderRadius: 5 }}>
              {carta.nombre_carta}
            </div>
          )}
        </div>
      </div>
      {viva && <span aria-hidden="true" className="carta-viva-brillo" />}
      </div>
    </a>
  );
}

export function HeroLectura({
  nombre, fechaNacimiento, pregunta, cartas, conAudio,
}: { nombre: string; fechaNacimiento: string | null; pregunta: string | null; cartas: CartaPublica[]; conAudio: boolean }) {
  // revelada: arranca el giro de las cartas. completa: las 5 ya están boca
  // arriba → el CTA pasa a "Seguir con mi lectura". Solo estado de esta
  // vista (se revela de nuevo en cada visita, decisión de Manuel).
  const [revelada, setRevelada] = useState(false);
  const [completa, setCompleta] = useState(false);
  // Cartas dadas vuelta de a una con clic (antes de revelar todas) y las que
  // ya terminaron ese giro. Si se dan vuelta las 5, cuenta como revelada.
  const [volteadas, setVolteadas] = useState<ReadonlySet<number>>(new Set());
  const [asentadas, setAsentadas] = useState<ReadonlySet<number>>(new Set());
  const todas = revelada || volteadas.size >= Math.min(5, cartas.length);
  // Carta viva: sobre los dorsos antes de revelar y sobre las cartas reales
  // recién cuando terminó el giro; apagada durante el flip de esa carta.
  const vivaDe = (i: number) => !(revelada || volteadas.has(i)) || completa || asentadas.has(i);

  function voltear(i: number) {
    if (revelada || volteadas.has(i)) return;
    setVolteadas((v) => new Set(v).add(i));
    const sinAnimacion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => setAsentadas((a) => new Set(a).add(i)), sinAnimacion ? 0 : GIRO_MS);
  }

  // El primer scroll hacia abajo revela la lectura, igual que el botón
  // (2026-10-20: igual la va a mirar al bajar).
  useEffect(() => {
    if (todas) return;
    const onScroll = () => { if (window.scrollY > 40) setRevelada(true); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [todas]);

  // Parallax mínimo solo con mouse (desktop): la fila de cartas se corre
  // ±4px / ±2px. Variables CSS vía ref + rAF: sin estado de React ni
  // listeners globales. Sin sensores en mobile.
  const filaRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  function onPointerMove(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse" || rafRef.current !== null) return;
    const { clientX, clientY, currentTarget } = e;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const r = currentTarget.getBoundingClientRect();
      const fila = filaRef.current;
      if (!fila) return;
      fila.style.setProperty("--px", (((clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      fila.style.setProperty("--py", (((clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    });
  }
  function onPointerLeave() {
    filaRef.current?.style.setProperty("--px", "0");
    filaRef.current?.style.setProperty("--py", "0");
  }

  useEffect(() => {
    if (!todas) return;
    const sinAnimacion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Revelado con botón/scroll: espera el escalón completo. Si la última
    // carta se dio vuelta con clic, alcanza con su propio giro.
    const t = window.setTimeout(() => setCompleta(true), sinAnimacion ? 0 : revelada ? REVELADO_MS : GIRO_MS);
    return () => window.clearTimeout(t);
  }, [todas, revelada]);

  return (
    <section className="relative overflow-hidden min-h-[800px] md:min-h-[640px] flex flex-col" aria-label="Tu lectura" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      {/* La escena de fondo vive en LecturaVista (EscenarioLectura): cabezal +
          fondo de página en una sola capa continua, sin costura. */}
      {/* Legibilidad arriba (texto sobre la escena) */}
      <div aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,6,20,0.55) 0%, rgba(10,6,20,0.15) 22%, transparent 45%)" }} />

      {/* Marca: solo logo + nombre, sin navegación */}
      <div className="relative flex items-center justify-center md:justify-start gap-2.5 px-5 md:px-8 pt-4 md:pt-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/logo/logo-isotipo-96.webp" alt="" aria-hidden="true" width={38} height={38} style={{ width: 38, height: 38 }} />
        <span className="text-[17px] md:text-[18px] font-bold uppercase leading-none" style={{ fontFamily: SERIF, letterSpacing: "0.08em", color: GOLD }}>
          Tu Oráculo
        </span>
      </div>

      <div className="relative flex-1 flex flex-col items-center text-center px-4 pt-5 md:pt-4 pb-8">
        {/* Pergamino con el nombre */}
        <div className="relative w-full max-w-[340px] md:max-w-[400px]" style={{ aspectRatio: "512 / 189", backgroundImage: PERGAMINO, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}>
          <p
            className="absolute inset-0 flex items-center justify-center px-[17%] font-bold leading-tight"
            style={{ fontFamily: SERIF, color: "#291408", fontSize: tamanoNombre(nombre) }}
          >
            {nombre}
          </p>
        </div>

        {fechaNacimiento && (
          <p className="mt-2 text-[13px] md:text-[14px] font-normal tracking-[0.04em]" style={{ color: "rgba(245,239,224,0.62)", textShadow: "0 1px 8px rgba(0,0,0,0.7)" }}>
            {fechaNacimiento}
          </p>
        )}

        <h1 className="mt-4" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(1.9rem, 7vw, 2.7rem)", lineHeight: 1.08, color: CREMA, textShadow: "0 2px 14px rgba(0,0,0,0.6)" }}>
          Tu lectura ya está lista
        </h1>
        <p className="mt-2 max-w-[460px] text-[15px] md:text-[16.5px] leading-snug" style={{ fontFamily: SERIF, fontWeight: 600, color: "rgba(245,239,224,0.92)", textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>
          {conAudio
            ? "Explorá tu lectura con interpretaciones claras, un resumen en audio y un mensaje para tu momento."
            : "Explorá tu lectura con interpretaciones claras, un resumen y un mensaje para tu momento."}
        </p>
        {/* Consulta: la pregunta del cliente o, si no escribió, el tema
            (es lo que llega en `pregunta`). Una línea si es corta; si es
            larga, el texto pasa debajo de la etiqueta. */}
        {pregunta && (
          <div
            className="mt-5 inline-flex flex-col sm:flex-row items-center gap-1 sm:gap-4 max-w-[min(100%,620px)] rounded-[22px] px-6 py-2.5 sm:py-3"
            style={{ background: "rgba(10,6,20,0.62)", border: "1px solid rgba(231,184,71,0.55)", boxShadow: "0 6px 22px rgba(0,0,0,0.35)" }}
          >
            <span className="shrink-0 text-[12px] md:text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: GOLD }}>
              Tu consulta
            </span>
            <span className="text-[15.5px] md:text-[17px] font-semibold leading-snug text-center sm:text-left" style={{ color: CREMA }}>
              {pregunta}
            </span>
          </div>
        )}

        {/* Las 5 cartas */}
        <div
          ref={filaRef}
          className="cartas-parallax mt-8 md:mt-7 flex justify-center items-start"
          style={{ minHeight: 150, transform: "translate3d(calc(var(--px, 0) * 4px), calc(var(--py, 0) * 2px), 0)", transition: "transform 700ms ease-out" }}
        >
          {cartas.slice(0, 5).map((c, i) => (
            <Carta
              key={c.posicion} carta={c} i={i}
              revelada={revelada || volteadas.has(i)} viva={vivaDe(i)}
              sola={volteadas.has(i)} onVoltear={() => voltear(i)}
            />
          ))}
        </div>

        <div className="mt-10 md:mt-9">
          {completa ? (
            <a
              href="#tu-lectura"
              className="inline-flex items-center justify-center gap-2.5 rounded-full px-9 min-h-[54px] text-[17px] font-bold transition hover:brightness-105"
              style={{ fontFamily: SERIF, background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 6px 26px rgba(240,197,90,0.40)" }}
            >
              Seguir con mi lectura <ArrowRight size={19} />
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setRevelada(true)}
              disabled={todas}
              aria-busy={todas && !completa}
              className="inline-flex items-center justify-center gap-2.5 rounded-full px-9 min-h-[54px] text-[17px] font-bold transition hover:brightness-105 disabled:cursor-default disabled:hover:brightness-100"
              style={{ fontFamily: SERIF, background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 6px 26px rgba(240,197,90,0.40)" }}
            >
              Revelar mi lectura <ArrowRight size={19} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
