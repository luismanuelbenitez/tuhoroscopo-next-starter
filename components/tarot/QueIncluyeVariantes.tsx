"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Info, BookOpen, Headphones, Music, Pause, ArrowRight, Mail, KeyRound, FileText } from "lucide-react";
import { CartaPorCarta, TarjetaPergamino, Ilustracion, BotonDesplegar } from "@/components/lectura/vista/Bloques";
import { EstilosCartaViva, TINTA_TEXTO } from "@/components/lectura/vista/Base";
import Link from "next/link";
import type { Route } from "next";
import { trackDemo } from "@/lib/analytics";
import { LECTURA_EJEMPLO, AUDIO_EJEMPLO } from "@/lib/tarot/lecturaEjemplo";
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

// srcCompleto: ruta propia (cartas de la lectura de ejemplo); si no, img es
// un archivo de la carpeta del bloque.
function CartaGiratoria({ img, alt, revelada, demora, ancho, srcCompleto }: { img: string; alt: string; revelada: boolean; demora: number; ancho: string; srcCompleto?: string }) {
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
          <img {...(srcCompleto ? { src: urlOptimizada(srcCompleto, 256) } : fluido(`${BASE}/${img}`, 767, 1151, "160px"))} alt={alt} loading="lazy" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", borderRadius: 5 }} />
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
        <p className="text-[13.5px] font-bold uppercase" style={{ color: DORADO, letterSpacing: "0.18em", textShadow: SOMBRA }}>{eyebrow}</p>
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

function Cierre({ titulo, items = CIERRE }: { titulo: string; items?: typeof CIERRE }) {
  return (
    <div className="mt-10">
      <p className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: DORADO, textShadow: SOMBRA }}>✦ {titulo} ✦</p>
      <div className="mt-4 flex flex-col gap-2.5 max-w-[420px] mx-auto text-left">
        {items.map(({ img, t, d }) => (
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

// Audio con un solo <audio> por botón, sin autoplay (en la landing nunca suena
// nada sin un toque). Ambientación: misma música que /lectura, en loop y
// con fundido de entrada a volumen bajo.
function useAudio(src: string, { loop = false, volumen = 1, fade = false } = {}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [sonando, setSonando] = useState(false);
  useEffect(() => () => ref.current?.pause(), []);
  async function toggle(): Promise<boolean> {
    if (sonando) { ref.current?.pause(); setSonando(false); return false; }
    if (!ref.current) {
      const a = new Audio(src);
      a.preload = "none";
      a.loop = loop;
      a.onended = () => setSonando(false);
      ref.current = a;
    }
    const a = ref.current;
    try {
      a.volume = fade ? 0 : volumen;
      await a.play();
      setSonando(true);
      if (fade) {
        const t0 = performance.now();
        const paso = (now: number) => { const k = Math.min(1, (now - t0) / 2600); a.volume = k * volumen; if (k < 1) requestAnimationFrame(paso); };
        requestAnimationFrame(paso);
      }
      return true;
    } catch { setSonando(false); return false; }
  }
  return { sonando, toggle };
}

const PERGAMINO_RESUMEN = "/img/lectura/contenedores/paneles/pergamino-resumen-mobile.webp";
const BOTON_OSCURO = "w-full inline-flex items-center justify-center gap-2 rounded-full min-h-[46px] px-5 text-[15px] font-semibold text-[#F5EFE0] bg-[linear-gradient(180deg,#22164a,#120b2a)] border border-[rgba(231,184,71,0.55)] shadow-[0_4px_14px_rgba(20,10,40,0.35)]";
const BOTON_CLARO = "w-full inline-flex items-center justify-center gap-2 rounded-full min-h-[46px] px-5 text-[15px] font-semibold text-[#4a3522] border border-[rgba(90,60,20,0.35)] bg-[rgba(255,250,235,0.35)]";

// El panel "Resumen de tu lectura" de /lectura, con los mismos 3 botones,
// sobre la lectura de ejemplo de Paula (siempre aclarado que es ficticia).
function ResumenEjemplo() {
  const [abierto, setAbierto] = useState(false);
  const voz = useAudio(AUDIO_EJEMPLO);
  const ambiente = useAudio("/audio/tarot-ambiente.mp3", { loop: true, volumen: 0.25, fade: true });
  return (
    <div className="mt-9 max-w-[420px] mx-auto">
      <div className="relative grid grid-cols-[minmax(0,1fr)]" style={{ backgroundImage: `url(${urlOptimizada(PERGAMINO_RESUMEN, 828)})`, backgroundSize: "100% 100%", filter: "drop-shadow(0 14px 30px rgba(0,0,0,0.5))" }}>
        <div aria-hidden="true" className="[grid-area:1/1]" style={{ aspectRatio: "780 / 720" }} />
        <div className="[grid-area:1/1] flex flex-col items-center text-center px-[11%] pt-[9%] pb-[11%]">
          <h3 className="px-[14%]" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, lineHeight: 1.1, color: "#241426" }}>Resumen de la lectura</h3>
          <p className="mt-2 text-[14px] leading-snug" style={{ color: "#4a3522" }}>
            Las 5 cartas juntas, en texto y en voz. Probalo con el de Paula.
          </p>
          <div className="mt-4 w-full flex flex-col gap-2">
            <button type="button" aria-expanded={abierto} aria-controls="resumen-ejemplo" className={BOTON_OSCURO} onClick={() => { setAbierto((v) => !v); if (!abierto) trackDemo("ver_resumen"); }}>
              <BookOpen size={17} style={{ color: DORADO }} /> {abierto ? "Ocultar resumen" : "Ver resumen"}
            </button>
            <button type="button" className={BOTON_CLARO} onClick={async () => { if (await voz.toggle()) trackDemo("audio_play"); }}>
              {voz.sonando ? <Pause size={17} style={{ color: "#7a5418" }} /> : <Headphones size={17} style={{ color: "#7a5418" }} />}
              {voz.sonando ? "Pausar resumen" : "Escuchar resumen"}
            </button>
            <button type="button" className={BOTON_CLARO} onClick={async () => { if (await ambiente.toggle()) trackDemo("ambiente_play"); }}>
              {ambiente.sonando ? <Pause size={17} style={{ color: "#7a5418" }} /> : <Music size={17} style={{ color: "#7a5418" }} />}
              {ambiente.sonando ? "Pausar ambiente" : "Ambientar la lectura"}
            </button>
          </div>
        </div>
      </div>
      <div id="resumen-ejemplo" hidden={!abierto} className="mt-3 rounded-2xl px-5 py-4 text-left" style={{ background: "rgba(14,7,26,0.94)", border: "1px solid rgba(240,197,90,0.4)" }}>
        <p className="text-[16px] leading-[1.7] whitespace-pre-line" style={{ fontFamily: SERIF, fontWeight: 600, color: CREMA }}>{LECTURA_EJEMPLO.resumen_lectura}</p>
      </div>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: "rgba(246,234,210,0.8)", textShadow: SOMBRA }}>
        <Info size={13} style={{ color: DORADO }} /> Ejemplo · Paula es un personaje ficticio
      </p>
    </div>
  );
}

// A usa la tirada de Paula (las mismas cartas del video y del resumen en
// audio), así lo que se ve y lo que se escucha cuentan la misma historia.
const CARTAS_A = LECTURA_EJEMPLO.cartas.slice(0, 5).map((c, i) => ({ ...POSICIONES[i], nombre: c.nombre_carta, src: c.imagen_url ?? "" }));
// En la landing no se muestra "DERECHA" (auditoría 2026-11-04: no le dice
// nada a quien compra); orientación vacía = CartaPorCarta no dibuja la etiqueta.
// Las cartas se piden optimizadas: el original (767×1151, ~110 KB) se pinta a
// lo sumo a ~190 px de ancho (Lighthouse 2026-11-05: 479 KB de más).
const CARTAS_DEMO = LECTURA_EJEMPLO.cartas.map((c) => ({ ...c, orientacion: "", imagen_url: c.imagen_url ? urlOptimizada(c.imagen_url, 384) : c.imagen_url }));

// Gancho del bloque A (idea de Manuel 2026-11-03): "¿Tenés una pregunta que
// te da vueltas?" y los temas que se turnan. Los botones llevan al checkout
// con ese tema ya elegido (?tema=, mismo valor que su selector), un paso
// menos. El tema que aparece arriba ilumina su botón.
const TEMAS_GANCHO = [
  { v: "amor", t: "Amor y vínculos", e: "❤️" },
  { v: "trabajo", t: "Trabajo y proyectos", e: "💼" },
  { v: "dinero", t: "Dinero y recursos", e: "💰" },
  { v: "salud", t: "Salud y bienestar", e: "🌿" },
  { v: "decision", t: "Una decisión", e: "🔮" },
];

function PreguntaRotativa() {
  const [ref, visto] = useEnVista<HTMLDivElement>(0.4);
  const [i, setI] = useState(0);
  const [saliendo, setSaliendo] = useState(false);
  useEffect(() => {
    if (!visto || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let t2: number | undefined;
    const t = window.setInterval(() => {
      setSaliendo(true);
      t2 = window.setTimeout(() => { setI((n) => (n + 1) % TEMAS_GANCHO.length); setSaliendo(false); }, 350);
    }, 2000);
    return () => { window.clearInterval(t); window.clearTimeout(t2); };
  }, [visto]);
  const tema = TEMAS_GANCHO[i];
  return (
    <div ref={ref} className="relative">
      <div aria-hidden="true" className="absolute -inset-x-4 -inset-y-6" style={VELO} />
      <div className="relative">
        <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 32, lineHeight: 1.1, color: CREMA, textShadow: SOMBRA }}>
          ¿Tenés una pregunta<br />que te da vueltas?
        </h2>
        <p className="sr-only">Amor y vínculos, trabajo, dinero, salud y bienestar o una decisión.</p>
        <div aria-hidden="true" className="mt-3 h-[44px] flex items-center justify-center">
          <span
            className="inline-block text-[28px] font-bold motion-reduce:!transition-none"
            style={{ fontFamily: SERIF, color: DORADO, textShadow: SOMBRA, opacity: saliendo ? 0 : 1, transform: saliendo ? "translateY(-10px)" : "none", transition: "opacity 350ms, transform 350ms" }}
          >
            {tema.t}
          </span>
        </div>
        <p className="mt-4 text-[15px] font-medium" style={{ color: CREMA, textShadow: SOMBRA }}>Elegí tu tema y empezá tu lectura:</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2 max-w-[400px] mx-auto">
          {TEMAS_GANCHO.map((x, n) => (
            <Link
              key={x.v}
              href={`/tarot/checkout?tema=${x.v}` as Route<string>}
              className="rounded-full px-3.5 min-h-[42px] inline-flex items-center gap-1.5 text-[14.5px] font-semibold transition-all"
              style={n === i
                ? { background: "linear-gradient(180deg, #f6d77e, #e9b94a)", color: "#180e00", border: "1px solid #fbe39a", boxShadow: "0 0 18px rgba(240,197,90,0.45)" }
                : { background: "rgba(14,7,26,0.9)", color: CREMA, border: "1px solid rgba(240,197,90,0.45)" }}
            >
              <span aria-hidden="true">{x.e}</span> {x.t}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// Mensaje y claves de Paula en las tarjetas de pergamino de /lectura. Los
// botones dicen "de Paula" / "sus claves" (no "mi"): es un ejemplo ficticio.
const PAN_LECTURA = "/img/lectura/contenedores/paneles";

function MensajeEjemplo() {
  const [abierto, setAbierto] = useState(false);
  return (
    <TarjetaPergamino
      id="mensaje-ejemplo"
      ilustracion={<Ilustracion src={`${PAN_LECTURA}/ilustracion-mensaje.webp`} medallon={null} Icon={Mail} size={76} />}
      titulo="Mensaje personal"
      descripcion="Una reflexión final para acompañarte en este momento de tu camino."
      accion={<BotonDesplegar abierto={abierto} onClick={() => { setAbierto((v) => !v); if (!abierto) trackDemo("ver_mensaje"); }} textoCerrado="Leer el de Paula" controla="mensaje-ejemplo-texto" />}
    >
      <div id="mensaje-ejemplo-texto" hidden={!abierto} className="mt-4 pt-4 border-t border-[rgba(120,85,30,0.3)]">
        <p className="text-[17px] leading-[1.7] text-center px-1" style={{ fontFamily: SERIF, fontWeight: 700, color: "#160a03" }}>{LECTURA_EJEMPLO.mensaje_final}</p>
      </div>
    </TarjetaPergamino>
  );
}

function ClavesEjemplo() {
  const [abierto, setAbierto] = useState(false);
  const pasos = LECTURA_EJEMPLO.proximos_pasos ?? [];
  return (
    <TarjetaPergamino
      id="claves-ejemplo"
      ilustracion={<Ilustracion src={`${PAN_LECTURA}/ilustracion-claves.webp`} medallon={null} Icon={KeyRound} size={76} />}
      titulo="3 claves para avanzar"
      descripcion="Recomendaciones prácticas para llevar lo que apareció en la lectura a tu día a día."
      accion={<BotonDesplegar abierto={abierto} onClick={() => { setAbierto((v) => !v); if (!abierto) trackDemo("ver_claves"); }} textoCerrado="Ver sus 3 claves" controla="claves-ejemplo-lista" />}
    >
      <ol id="claves-ejemplo-lista" hidden={!abierto} className="mt-4 pt-4 border-t border-[rgba(120,85,30,0.3)] space-y-3.5">
        {pasos.map((paso, i) => (
          <li key={i} className="flex gap-3.5">
            <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[15px] font-bold" style={{ background: "linear-gradient(180deg,#22164a,#120b2a)", color: DORADO, fontFamily: SERIF, fontVariantNumeric: "lining-nums", lineHeight: 1 }}>{i + 1}</span>
            <p className="pt-0.5 text-[15.5px] leading-relaxed" style={{ color: TINTA_TEXTO }}>{paso}</p>
          </li>
        ))}
      </ol>
    </TarjetaPergamino>
  );
}

// PDF (Manuel 2026-11-04): se despliega como el mensaje y las claves y
// muestra la primera página del PDF con las cartas de Paula (portada de
// props/pdf-pagina1 con sus 5 cartas encima). El botón no dice "Descargar":
// en el ejemplo no hay nada para bajar, y un botón de descarga que no
// descarga frustra; se aclara que el PDF se baja desde el link personal.
function PdfEjemplo() {
  const [abierto, setAbierto] = useState(false);
  return (
    <TarjetaPergamino
      id="pdf-ejemplo"
      ilustracion={<Ilustracion src={`${PAN_LECTURA}/ilustracion-pdf.webp`} medallon={null} Icon={FileText} size={76} />}
      titulo="Tu lectura en PDF"
      descripcion="Tu lectura completa, con las 5 cartas, el resumen, el mensaje y las claves. Es tuya para siempre."
      accion={<BotonDesplegar abierto={abierto} onClick={() => { setAbierto((v) => !v); if (!abierto) trackDemo("ver_pdf"); }} textoCerrado="Ver cómo es el PDF" controla="pdf-ejemplo-vista" />}
    >
      <div id="pdf-ejemplo-vista" hidden={!abierto} className="mt-4 pt-4 border-t border-[rgba(120,85,30,0.3)] text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={abierto ? urlOptimizada("/img/tarot/ejemplo/pdf-miniatura.webp", 640) : undefined}
          alt="Primera página del PDF de la lectura de ejemplo: el nombre, la fecha y las 5 cartas en sus posiciones"
          width={620}
          height={877}
          className="mx-auto w-[74%] max-w-[260px] h-auto rounded-[6px]"
          style={{ boxShadow: "0 14px 32px rgba(40,20,5,0.45), 0 0 0 1px rgba(120,85,30,0.35)", transform: "rotate(-1.5deg)" }}
        />
        <p className="mt-4 text-[15px] leading-relaxed px-1" style={{ color: TINTA_TEXTO }}>
          Así empieza el PDF del ejemplo. Con tu lectura, lo descargás desde tu link personal y lo guardás para siempre.
        </p>
      </div>
    </TarjetaPergamino>
  );
}

export function VarianteA() {
  const [filaRef, visto] = useEnVista<HTMLDivElement>(0.6);
  useEffect(() => { if (visto) trackDemo("cartas_reveladas"); }, [visto]);
  return (
    <div className="px-5 py-12 text-center">
      <PreguntaRotativa />

      <div className="mt-14" />
      <Encabezado eyebrow="Viví la experiencia" titulo={<>Así se revela<br />tu lectura</>}>
        Hacés tu consulta y aparecen 5 cartas para vos. Cada una responde algo distinto de tu momento.
      </Encabezado>

      <p className="mt-9 text-[13.5px] font-bold uppercase" style={{ color: DORADO, letterSpacing: "0.16em", textShadow: SOMBRA }}>Tu tarot, posición por posición</p>
      <div ref={filaRef} className="mt-5 flex justify-center items-start">
        {CARTAS_A.map((p, i) => (
          <div key={p.t} className="-mx-[3px]" style={{ transform: `translateY(${ABANICO[i].y}px) rotate(${ABANICO[i].rot}deg)` }}>
            <CartaGiratoria img={p.img} srcCompleto={p.src} alt={p.nombre} revelada={visto} demora={i * 320} ancho="min(18vw, 74px)" />
          </div>
        ))}
      </div>

      <ResumenEjemplo />

      {/* Desde acá, las mismas piezas de /lectura con la lectura de Paula:
          carta por carta (desplegable) y las tarjetas de pergamino. La
          tipografía de /lectura se apunta a la de /tarot (Cormorant). */}
      <div className="mt-10 max-w-[480px] mx-auto text-left" style={{ ["--font-serif-editorial" as string]: "var(--font-cormorant)" }}>
        <EstilosCartaViva />
        {/* Rótulos de /lectura (10,5 px y 13,5 px) agrandados solo acá. */}
        <div
          className="[&_summary_span.block]:!text-[13px] [&_section>div:first-child>p]:!text-[15px]"
          onClickCapture={(e) => { if ((e.target as HTMLElement).closest("summary")) trackDemo("carta_abierta"); }}
        >
          <CartaPorCarta cartas={CARTAS_DEMO} />
        </div>

        <p className="mt-10 mb-4 text-center text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: DORADO, textShadow: SOMBRA }}>✦ Y además recibís ✦</p>
        <div className="space-y-4">
          <MensajeEjemplo />
          <ClavesEjemplo />
          <PdfEjemplo />
        </div>
      </div>

      {/* Compra justo después de ver la experiencia (auditoría 2026-11-04:
          el bloque terminaba sin botón, solo con un enlace que saca de la
          página). El ejemplo completo queda como segunda opción. */}
      <div className="mt-10 max-w-[420px] mx-auto">
        <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, lineHeight: 1.15, color: CREMA, textShadow: SOMBRA }}>
          Ahora, la tuya
        </p>
        <p className="mt-2 text-[15.5px] leading-snug font-medium" style={{ color: CREMA, textShadow: SOMBRA }}>
          Tus 5 cartas, interpretadas para tu consulta. Te llega por WhatsApp en minutos.
        </p>
        <Link
          href="/tarot/checkout"
          className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl min-h-[56px] px-6 text-[18px] font-bold"
          style={{ background: "linear-gradient(135deg, #d4a017 0%, #f0c55a 45%, #ffd860 100%)", color: "#180e00", boxShadow: "0 6px 24px rgba(240,197,90,0.32)" }}
        >
          Quiero mi lectura <ArrowRight size={19} />
        </Link>
        <Link href="/tarot/ejemplo" onClick={() => trackDemo("ver_ejemplo")} className="mt-2 inline-flex items-center gap-1.5 py-3 text-[15px] font-semibold underline underline-offset-4" style={{ color: DORADO, textShadow: SOMBRA }}>
          Ver la lectura completa de ejemplo <ArrowRight size={15} />
        </Link>
      </div>
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

      <p className="mt-9 text-[13.5px] font-bold uppercase" style={{ color: DORADO, letterSpacing: "0.16em", textShadow: SOMBRA }}>Tu tarot, posición por posición</p>
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
