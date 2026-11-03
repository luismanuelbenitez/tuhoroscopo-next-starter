"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Info } from "lucide-react";
import { SERIF } from "@/components/home/theme";
import { fijo, fluido, urlOptimizada } from "@/lib/imagen";

// Variantes móviles del bloque 2 de /tarot (2026-11-03, a revisar en
// /pruebas/tarot). Manuel: "¿Qué incluye tu Tarot?" describe mal la
// experiencia, la descripción no contrasta con el fondo y el carrusel de
// cartas no representa lo que se vive. Tres caminos:
//   A · Abanico que se revela   (las cartas se dan vuelta, como en la lectura)
//   B · Recorrido carta por carta (línea vertical, cada carta gira al llegar)
//   C · Tu lectura en el celular  (pantalla real desplazándose sola)
// Producción no cambia hasta elegir una.

const BASE = "/img/tarot/contenedores/que-incluye";
const DORSO = "/img/lectura/contenedores/cabezal/dorso-carta.webp";
const MARCO_DORADO = "linear-gradient(145deg, #8a6420 0%, #f3d27a 22%, #b8862b 45%, #fbe39a 62%, #9c7224 82%, #e9c56a 100%)";

// Contraste (Manuel 2026-11-03): sobre el fondo ilustrado, texto crema
// sólido, más grande y con velo oscuro local detrás.
const CREMA = "#F6EAD2";
const DORADO = "#F0C55A";
const SOMBRA = "0 2px 12px rgba(0,0,0,0.85)";
const VELO: CSSProperties = { background: "radial-gradient(ellipse 75% 60% at 50% 50%, rgba(8,4,16,0.82), rgba(8,4,16,0.55) 60%, transparent 85%)" };

export const POSICIONES = [
  { img: "carta-tu-momento-actual.jpg", nombre: "La Estrella", t: "Momento actual", q: "Lo que estás viviendo hoy." },
  { img: "carta-el-desafio.jpg", nombre: "La Fuerza", t: "Desafío", q: "Lo que hoy te frena." },
  { img: "carta-lo-que-no-estas-viendo.jpg", nombre: "La Sacerdotisa", t: "Lo que no ves", q: "Lo que influye sin que lo notes." },
  { img: "carta-consejo-para-avanzar.jpg", nombre: "El Sol", t: "Consejo", q: "Qué te conviene hacer ahora." },
  { img: "carta-lo-que-viene.jpg", nombre: "El Mundo", t: "Lo que viene", q: "Hacia dónde se mueve todo." },
];

const CIERRE = [
  { img: "resumen-lectura.webp", t: "Resumen en audio", d: "Tus 5 cartas juntas, contadas en voz." },
  { img: "mensajepersonal.webp", t: "Mensaje personal", d: "Una reflexión para tu momento." },
  { img: "3claves.webp", t: "3 claves para avanzar", d: "Ideas concretas para tu día a día." },
];

// Una vez que el elemento entra en pantalla (umbral configurable) queda en true.
function useEnVista<T extends HTMLElement>(umbral = 0.5) {
  const ref = useRef<T>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisto(true); return; }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisto(true); obs.disconnect(); } }, { threshold: umbral });
    obs.observe(el);
    return () => obs.disconnect();
  }, [umbral]);
  return [ref, visto] as const;
}

function CartaGiratoria({ img, alt, revelada, demora, ancho }: { img: string; alt: string; revelada: boolean; demora: number; ancho: string }) {
  const cara: CSSProperties = { position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", borderRadius: 8 };
  return (
    <div className="relative shrink-0" style={{ width: ancho, perspective: 900 }}>
      <div
        className="relative w-full motion-reduce:!transition-none"
        style={{ aspectRatio: "2 / 3", transformStyle: "preserve-3d", transition: "transform 1100ms cubic-bezier(.25,.6,.25,1)", transitionDelay: `${demora}ms`, transform: revelada ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        <div aria-hidden="true" style={{ ...cara, backgroundImage: `url(${urlOptimizada(DORSO, 256)})`, backgroundSize: "100% 100%", border: "2px solid rgba(240,197,90,0.75)", boxShadow: "0 8px 22px rgba(0,0,0,0.55)" }} />
        <div style={{ ...cara, transform: "rotateY(180deg)", padding: 3, background: MARCO_DORADO, boxShadow: "0 8px 22px rgba(0,0,0,0.55), 0 0 20px rgba(240,197,90,0.3)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...fluido(`${BASE}/${img}`, 767, 1151, "160px")} alt={alt} loading="lazy" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", borderRadius: 5 }} />
        </div>
      </div>
    </div>
  );
}

function Encabezado({ eyebrow, titulo, children }: { eyebrow: string; titulo: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <div aria-hidden="true" className="absolute -inset-x-4 -inset-y-6" style={VELO} />
      <div className="relative">
        <p className="text-[12px] font-bold uppercase" style={{ color: DORADO, letterSpacing: "0.2em", textShadow: SOMBRA }}>{eyebrow}</p>
        <h2 className="mt-2" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 34, lineHeight: 1.08, color: CREMA, textShadow: SOMBRA }}>{titulo}</h2>
        <p className="mt-3 mx-auto max-w-[340px] text-[16px] leading-relaxed font-medium" style={{ color: CREMA, textShadow: SOMBRA }}>{children}</p>
      </div>
    </div>
  );
}

function Medallon({ img }: { img: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...fijo(`${BASE}/${img}`, 56)} alt="" aria-hidden="true" loading="lazy" style={{ width: 50, height: 50, flexShrink: 0, objectFit: "contain" }} />;
}

function Cierre({ titulo }: { titulo: string }) {
  return (
    <div className="mt-10">
      <p className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: DORADO, textShadow: SOMBRA }}>✦ {titulo} ✦</p>
      <div className="mt-4 flex flex-col gap-2.5 max-w-[420px] mx-auto text-left">
        {CIERRE.map(({ img, t, d }) => (
          <div key={t} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ border: "1px solid rgba(240,197,90,0.45)", background: "rgba(14,7,26,0.9)" }}>
            <Medallon img={img} />
            <div className="min-w-0">
              <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: 1.15, color: CREMA, fontVariantNumeric: "lining-nums" }}>{t}</p>
              <p className="text-[14px] leading-snug mt-0.5" style={{ color: "rgba(246,234,210,0.85)" }}>{d}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── A · Abanico que se revela ─────────────────────────────────────────
const ABANICO = [{ rot: -9, y: 16 }, { rot: -4.5, y: 5 }, { rot: 0, y: 0 }, { rot: 4.5, y: 5 }, { rot: 9, y: 16 }];

export function VarianteA() {
  const [filaRef, visto] = useEnVista<HTMLDivElement>(0.6);
  return (
    <div className="px-5 py-12 text-center">
      <Encabezado eyebrow="Viví la experiencia" titulo={<>Así se revela<br />tu lectura</>}>
        Hacés tu consulta y aparecen 5 cartas para vos. Cada una responde algo distinto de tu momento.
      </Encabezado>

      <p className="mt-9 text-[12px] font-bold uppercase" style={{ color: DORADO, letterSpacing: "0.18em", textShadow: SOMBRA }}>Tu tarot, posición por posición</p>
      <div ref={filaRef} className="mt-5 flex justify-center items-start">
        {POSICIONES.map((p, i) => (
          <div key={p.t} className="-mx-[3px]" style={{ transform: `translateY(${ABANICO[i].y}px) rotate(${ABANICO[i].rot}deg)` }}>
            <CartaGiratoria img={p.img} alt={p.nombre} revelada={visto} demora={i * 320} ancho="min(18vw, 74px)" />
          </div>
        ))}
      </div>

      <ol className="mt-8 max-w-[420px] mx-auto text-left rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(240,197,90,0.4)", background: "rgba(14,7,26,0.9)" }}>
        {POSICIONES.map((p, i) => (
          <li
            key={p.t}
            className="flex items-center gap-3 px-4 py-3 motion-reduce:!opacity-100 motion-reduce:!transform-none"
            style={{ borderTop: i ? "1px solid rgba(240,197,90,0.15)" : undefined, opacity: visto ? 1 : 0, transform: visto ? "none" : "translateY(6px)", transition: "opacity 500ms, transform 500ms", transitionDelay: `${900 + i * 320}ms` }}
          >
            <span className="shrink-0 flex items-center justify-center rounded-full text-[14px] font-bold" style={{ width: 28, height: 28, background: "rgba(240,197,90,0.15)", border: `1px solid ${DORADO}`, color: DORADO }}>{i + 1}</span>
            <div className="min-w-0">
              <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: 1.1, color: CREMA }}>{p.t}</p>
              <p className="text-[14px] leading-snug" style={{ color: "rgba(246,234,210,0.85)" }}>{p.q}</p>
            </div>
          </li>
        ))}
      </ol>

      <Cierre titulo="Y al final, todo se une en" />
    </div>
  );
}

// ── B · Recorrido carta por carta ─────────────────────────────────────
function PasoB({ p, i }: { p: (typeof POSICIONES)[number]; i: number }) {
  const [ref, visto] = useEnVista<HTMLLIElement>(0.7);
  return (
    <li ref={ref} className="relative flex items-center gap-4 pl-1">
      <CartaGiratoria img={p.img} alt={p.nombre} revelada={visto} demora={0} ancho="78px" />
      <div className="min-w-0 text-left">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ color: DORADO }}>Carta {i + 1}</p>
        <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 23, lineHeight: 1.1, color: CREMA }}>{p.t}</p>
        <p className="mt-0.5 text-[15px] leading-snug" style={{ color: "rgba(246,234,210,0.88)" }}>{p.q}</p>
      </div>
    </li>
  );
}

export function VarianteB() {
  return (
    <div className="px-5 py-12 text-center">
      <Encabezado eyebrow="Viví la experiencia" titulo={<>Tu lectura,<br />carta por carta</>}>
        5 cartas, cada una en su lugar. Así se arma la respuesta a tu consulta.
      </Encabezado>

      <p className="mt-9 text-[12px] font-bold uppercase" style={{ color: DORADO, letterSpacing: "0.18em", textShadow: SOMBRA }}>Tu tarot, posición por posición</p>
      <div className="relative mt-5 max-w-[400px] mx-auto rounded-2xl px-4 py-5" style={{ border: "1px solid rgba(240,197,90,0.4)", background: "rgba(14,7,26,0.88)" }}>
        {/* Hilo dorado que une las 5 cartas */}
        <div aria-hidden="true" className="absolute left-[55px] top-8 bottom-8 w-px" style={{ background: "linear-gradient(180deg, transparent, rgba(240,197,90,0.6) 10%, rgba(240,197,90,0.6) 90%, transparent)" }} />
        <ol className="relative flex flex-col gap-5">
          {POSICIONES.map((p, i) => <PasoB key={p.t} p={p} i={i} />)}
        </ol>
      </div>

      <Cierre titulo="Y las 5 cartas se unen en" />
    </div>
  );
}

// ── C · Tu lectura en el celular ──────────────────────────────────────
export function VarianteC() {
  const [ref, visto] = useEnVista<HTMLDivElement>(0.4);
  return (
    <div className="px-5 py-12 text-center">
      <style>{`
        @keyframes recorrerLectura { 0%, 8% { transform: translateY(0); } 92%, 100% { transform: translateY(calc(-100% + 440px)); } }
        @media (prefers-reduced-motion: reduce) { .recorrer-lectura { animation: none !important; } }
      `}</style>
      <Encabezado eyebrow="Viví la experiencia" titulo={<>Así la vas a ver<br />en tu celular</>}>
        Te llega un link por WhatsApp. Lo abrís y tus 5 cartas se revelan, con su interpretación y el resumen en audio.
      </Encabezado>

      <div ref={ref} className="relative mt-8 mx-auto" style={{ width: 232 }}>
        {/* Marco de teléfono hecho con código */}
        <div className="relative rounded-[34px] p-[9px]" style={{ background: "linear-gradient(160deg, #3a2a52, #120a22)", border: "1px solid rgba(240,197,90,0.55)", boxShadow: "0 24px 60px rgba(0,0,0,0.6), 0 0 40px rgba(240,197,90,0.18)" }}>
          <div className="relative overflow-hidden rounded-[26px]" style={{ height: 440, background: "#0b0818" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/img/tarot/que-incluye-v2/lectura-celular.webp"
              alt="Lectura de ejemplo abierta en un celular: nombre, 5 cartas, resumen y carta por carta"
              loading="lazy"
              className="recorrer-lectura block w-full h-auto"
              style={{ animation: visto ? "recorrerLectura 16s ease-in-out 0.6s infinite alternate" : "none" }}
            />
          </div>
          <div aria-hidden="true" className="absolute top-[14px] left-1/2 -translate-x-1/2 h-[18px] w-[74px] rounded-full" style={{ background: "#07040e" }} />
        </div>
        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "rgba(246,234,210,0.75)" }}>
          <Info size={13} style={{ color: DORADO }} /> Ejemplo · Paula es un personaje ficticio
        </p>
      </div>

      <p className="mt-8 text-[12px] font-bold uppercase" style={{ color: DORADO, letterSpacing: "0.18em", textShadow: SOMBRA }}>Tu tarot, posición por posición</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2 max-w-[400px] mx-auto">
        {POSICIONES.map((p, i) => (
          <span key={p.t} className="rounded-full px-3.5 py-1.5 text-[14px] font-semibold" style={{ background: "rgba(14,7,26,0.9)", border: "1px solid rgba(240,197,90,0.45)", color: CREMA }}>
            <span style={{ color: DORADO }}>{i + 1}</span> · {p.t}
          </span>
        ))}
      </div>


      <Cierre titulo="Y además recibís" />
    </div>
  );
}
