"use client";

import Link from "next/link";
import type { Route } from "next";
import { Check, Hourglass, MonitorSmartphone, AudioLines, Heart, FileText, MessageCircle, UserPlus, Mail, Sparkles } from "lucide-react";
import { GOLD, SERIF, CREMA } from "@/components/home/theme";

// Bloques visuales de /tarot/gracias (2026-10-19). Solo presentación: el
// estado lo calcula TarotEstadoContent (consulta /api/tarot/estado-orden).

const DIR = "/img/tarot/contenedores/gracias";
export const PANEL = { background: "rgba(12,7,24,0.82)", border: "1px solid rgba(240,197,90,0.32)", backdropFilter: "blur(6px)" } as const;

// ── Progreso ────────────────────────────────────────────────────────────────
export type EstadoPaso = "hecho" | "activo" | "pendiente" | "demorado";
export interface Paso { titulo: string; texto: string; estado: EstadoPaso }

function MarcaPaso({ n, estado }: { n: number; estado: EstadoPaso }) {
  const base = "relative z-[1] flex items-center justify-center rounded-full shrink-0";
  if (estado === "hecho") {
    return (
      <span className={base} style={{ width: 40, height: 40, border: `1.5px solid ${GOLD}`, background: "rgba(240,197,90,0.12)" }}>
        <Check size={19} style={{ color: GOLD }} aria-hidden="true" />
      </span>
    );
  }
  if (estado === "activo" || estado === "demorado") {
    return (
      <span className={`${base} gracias-latido`} style={{ width: 46, height: 46, border: `1.5px solid ${GOLD}`, background: "rgba(240,197,90,0.10)", boxShadow: "0 0 18px rgba(240,197,90,0.35)" }}>
        <span className="flex gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="gracias-punto block rounded-full" style={{ width: 5, height: 5, background: GOLD, animationDelay: `${i * 0.18}s` }} />
          ))}
        </span>
      </span>
    );
  }
  return (
    <span className={base} style={{ width: 40, height: 40, border: "1.5px solid rgba(255,255,255,0.28)", color: "rgba(255,255,255,0.65)", fontFamily: SERIF, fontWeight: 700, fontSize: 18, fontVariantNumeric: "lining-nums" }}>
      {n}
    </span>
  );
}

export function ProgresoLectura({ pasos, pie }: { pasos: Paso[]; pie: string }) {
  return (
    <section className="mx-auto w-full max-w-[580px] rounded-2xl px-5 md:px-8 pt-6 pb-4 text-left" style={PANEL} aria-label="Avance de tu lectura">
      <ol aria-live="polite">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="relative flex items-start gap-4 pb-6 last:pb-4">
            {i < pasos.length - 1 && (
              <span aria-hidden="true" className="absolute left-[19px] top-11 bottom-0 border-l border-dashed" style={{ borderColor: "rgba(240,197,90,0.45)" }} />
            )}
            <div className="w-[46px] flex justify-center"><MarcaPaso n={i + 1} estado={p.estado} /></div>
            <div className="pt-1.5">
              <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, lineHeight: 1.2, color: p.estado === "pendiente" ? "rgba(245,239,224,0.75)" : GOLD }}>{p.titulo}</p>
              <p className="mt-0.5 text-[13.5px] text-white/65 leading-snug">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="flex items-center justify-center gap-2 pt-3 text-[12.5px] text-white/70" style={{ borderTop: "1px solid rgba(240,197,90,0.20)" }}>
        <Hourglass size={14} style={{ color: GOLD }} aria-hidden="true" /> {pie}
      </p>
    </section>
  );
}

// ── Cartas sobre la mesa ────────────────────────────────────────────────────
export function CartasRevelando({ texto }: { texto: string }) {
  return (
    <div className="relative mt-8 md:mt-10" aria-hidden="true">
      <div className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 w-[110%] max-w-[760px] h-[120%] pointer-events-none"
        style={{ background: "radial-gradient(ellipse 50% 45% at 50% 50%, rgba(255,190,80,0.30), rgba(255,170,60,0.10) 50%, transparent 72%)" }} />
      <div className="relative flex justify-center gap-2 md:gap-4" style={{ perspective: 900 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="gracias-carta" style={{ animationDelay: `${i * 0.35}s`, transform: `rotateX(32deg) rotateZ(${(i - 2) * -2.5}deg)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/lectura/contenedores/cabezal/dorso-carta.webp" alt="" className="block w-[54px] sm:w-[78px] md:w-[118px] h-auto rounded-md" style={{ filter: "drop-shadow(0 0 10px rgba(255,196,90,0.55)) drop-shadow(0 8px 14px rgba(0,0,0,0.5))" }} />
          </div>
        ))}
      </div>
      <p className="mt-6 text-center" style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: 21, color: CREMA }}>{texto}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${DIR}/separador-revelando.webp`} alt="" className="mx-auto -mt-2 w-[260px] md:w-[330px] h-auto" />
    </div>
  );
}

// ── Paneles informativos ────────────────────────────────────────────────────
function Encabezado({ icono, titulo, bajada }: { icono: string; titulo: string; bajada: string }) {
  return (
    <div className="flex items-center gap-4 mb-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${DIR}/${icono}`} alt="" aria-hidden="true" className="w-12 h-12 md:w-14 md:h-14 shrink-0" />
      <div>
        <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 25, lineHeight: 1.1, color: CREMA }}>{titulo}</h2>
        <p className="mt-0.5 text-[13.5px] text-white/65">{bajada}</p>
      </div>
    </div>
  );
}

function Circulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 42, height: 42, border: "1px solid rgba(168,120,255,0.55)", background: "rgba(124,58,237,0.14)" }}>
      {children}
    </span>
  );
}

const RECIBIR = [
  { Icon: MonitorSmartphone, t: "Lectura online", d: "Acceso completo a tu lectura de tarot." },
  { Icon: AudioLines, t: "Resumen en audio", d: "Escuchá la interpretación de tus cartas." },
  { Icon: Heart, t: "Mensaje personal", d: "Un consejo para tu momento actual." },
  { Icon: FileText, t: "PDF para guardar", d: "Tu lectura en PDF, siempre con vos." },
];

export function QueVasARecibir() {
  return (
    <section className="rounded-2xl p-5 md:p-6" style={PANEL}>
      <Encabezado icono="icono-regalo.webp" titulo="Qué vas a recibir" bajada="Tu lectura completa, en varios formatos:" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {RECIBIR.map(({ Icon, t, d }) => (
          <div key={t} className="flex items-start gap-2.5 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <Circulo><Icon size={19} style={{ color: "#C9A7FF" }} aria-hidden="true" /></Circulo>
            <div>
              <p className="font-semibold leading-tight" style={{ color: CREMA, fontFamily: SERIF, fontSize: 16 }}>{t}</p>
              <p className="text-[13px] text-white/60 leading-snug">{d}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function MientrasTanto() {
  const items = [
    { Icon: MessageCircle, t: "Revisá tu WhatsApp.", d: <>Te enviamos tu lectura completa por ahí en cuanto esté lista.</> },
    { Icon: UserPlus, t: "Guardá nuestro número.", d: <>Agreganos a tus contactos para que el mensaje no llegue a spam.</> },
    { Icon: Mail, t: "¿Se demora más de 15 minutos?", d: <>Escribinos a <a href="mailto:hola@tuoraculo.uy" className="underline underline-offset-2 hover:text-white" style={{ color: "#C9A7FF" }}>hola@tuoraculo.uy</a> y te ayudamos enseguida.</> },
  ];
  return (
    <section className="rounded-2xl p-5 md:p-6" style={PANEL}>
      <Encabezado icono="icono-estrella.webp" titulo="Mientras tanto" bajada="Algunos consejos para que todo llegue sin problemas:" />
      <ol className="space-y-4">
        {items.map(({ Icon, t, d }, i) => (
          <li key={t} className="flex items-start gap-3">
            <span className="flex items-center justify-center rounded-full shrink-0 mt-1" style={{ width: 32, height: 32, background: "rgba(124,58,237,0.30)", border: "1px solid rgba(168,120,255,0.55)", color: "#E5D5FF", fontFamily: SERIF, fontWeight: 700, fontSize: 17, fontVariantNumeric: "lining-nums" }}>{i + 1}</span>
            <Circulo><Icon size={19} style={{ color: "#C9A7FF" }} aria-hidden="true" /></Circulo>
            <div>
              <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17, color: CREMA }}>{t}</p>
              <p className="text-[13px] text-white/60 leading-snug">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Pie ─────────────────────────────────────────────────────────────────────
const LINKS: { href: string; label: string }[] = [
  { href: "/quienes-somos", label: "¿Quiénes somos?" },
  { href: "/faq", label: "Preguntas frecuentes" },
  { href: "/politica-de-privacidad", label: "Política de privacidad" },
  { href: "/terminos-del-servicio", label: "Términos del servicio" },
  { href: "/contacto", label: "Contacto" },
];

export function PieGracias() {
  return (
    <footer className="gracias-raiz relative mt-12 px-5 pb-10 pt-6 mx-auto max-w-[960px] text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}>
      <nav className="flex flex-wrap justify-center gap-x-7 gap-y-2 text-[13.5px] text-white/65" aria-label="Enlaces del sitio">
        {LINKS.map((l) => <Link key={l.href} href={l.href as Route} className="hover:text-white transition-colors">{l.label}</Link>)}
      </nav>
      <p className="mt-4 text-[11.5px] leading-relaxed text-white/45">
        © {new Date().getFullYear()} Tu Oráculo · Operado por Luis Manuel Benítez Rodríguez · RUT 214998320016 · Uruguay. Todos los derechos reservados.
      </p>
    </footer>
  );
}

// ── Ícono principal y estilos de animación ──────────────────────────────────
export function IconoEstado({ tipo }: { tipo: "ok" | "espera" | "error" }) {
  const color = tipo === "error" ? "#F87171" : GOLD;
  return (
    <span className="mx-auto flex items-center justify-center rounded-full" style={{ width: 76, height: 76, border: `3px solid ${color}`, boxShadow: `0 0 28px ${tipo === "error" ? "rgba(248,113,113,0.25)" : "rgba(240,197,90,0.35)"}` }}>
      {tipo === "ok" && <Check size={38} strokeWidth={3} style={{ color }} aria-hidden="true" />}
      {tipo === "espera" && <Hourglass size={32} style={{ color }} aria-hidden="true" />}
      {tipo === "error" && <span style={{ color, fontSize: 38, fontWeight: 800, lineHeight: 1 }} aria-hidden="true">!</span>}
    </span>
  );
}

export function Pildora({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ border: `1px solid rgba(240,197,90,0.55)`, background: "rgba(240,197,90,0.08)", color: GOLD }}>
      <Sparkles size={12} aria-hidden="true" /> {children}
    </span>
  );
}

export const ESTILOS_GRACIAS = `
@keyframes gracias-latido { 0%,100% { box-shadow: 0 0 12px rgba(240,197,90,0.25); } 50% { box-shadow: 0 0 26px rgba(240,197,90,0.55); } }
@keyframes gracias-punto { 0%,80%,100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
@keyframes gracias-carta { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.22); } }
.gracias-latido { animation: gracias-latido 2.2s ease-in-out infinite; }
.gracias-punto { animation: gracias-punto 1.2s ease-in-out infinite; }
.gracias-carta { animation: gracias-carta 3.2s ease-in-out infinite; transform-origin: 50% 100%; }
.gracias-raiz { font-variant-numeric: lining-nums; }
.gracias-hero { text-shadow: 0 2px 12px rgba(8,4,20,0.85), 0 0 2px rgba(8,4,20,0.6); }
@media (prefers-reduced-motion: reduce) { .gracias-latido, .gracias-punto, .gracias-carta { animation: none; } }
`;
