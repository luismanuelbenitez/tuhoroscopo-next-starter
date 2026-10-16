"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { GOLD } from "@/components/home/theme";

// Preguntas/respuestas reales, recuperadas tal cual de la landing anterior
// (app/tarot/TarotLandingContent.tsx previo a este rediseño) — sin
// reescribir ni inventar contenido en este pase.
const FAQ = [
  {
    q: "¿Qué recibo exactamente?",
    a: 'Un mensaje en tu WhatsApp (y en tu email, si lo dejás) con tus 5 cartas y dos botones: "Leer mi tirada", una lectura online pensada para el celular que queda disponible 30 días, y "Descargar PDF", un archivo de 3 páginas que es tuyo para siempre.',
  },
  {
    q: "¿Cuánto tarda?",
    a: "Menos de 15 minutos desde que se confirma tu pago. Si pasado ese tiempo no la recibiste, escribinos a hola@tuoraculo.uy y te la enviamos de inmediato.",
  },
  {
    q: "¿Es realmente personalizado?",
    a: "Sí. Tus 5 cartas se sortean para vos y se interpretan con tu nombre, tu fecha de nacimiento, el tema que elegiste y tu pregunta, si la escribís. Con pregunta concreta o sin ella. No es texto estándar ni genérico.",
  },
  {
    q: "¿Alguien más se entera de mi consulta?",
    a: "No. Tu tirada llega directo a tu WhatsApp (y a tu email, si lo pedís) — nadie más la ve, y nosotros no la compartimos con nadie. Podés preguntar sobre lo que sea sin dar explicaciones.",
  },
  {
    q: "¿Qué pasa si no me llega?",
    a: "Primero revisá que el número de WhatsApp esté bien escrito y mirá tu email (incluida la carpeta de spam). Si pasaron 15 minutos y no hay nada, escribinos a hola@tuoraculo.uy y te la reenviamos.",
  },
  {
    q: "¿Es IA o hay un tarotista humano?",
    a: "Las cartas se sortean y la lectura la genera inteligencia artificial, aplicando la simbología del tarot clásico a tu situación. No hay un tarotista humano detrás. Es una perspectiva simbólica para reflexionar.",
  },
  {
    q: "¿Puedo consultar más de una vez?",
    a: "Sí. Cada tirada es independiente: cada vez se sortean cartas nuevas. Podés pedir otra cuando quieras, sobre el mismo tema o uno diferente. Sin suscripción ni renovaciones.",
  },
  {
    q: "¿Cómo funciona el pago?",
    a: "El pago se procesa con Mercado Pago. Podés pagar con tarjeta, saldo o transferencia. Tus datos bancarios nunca pasan por nuestros servidores. Un único cobro, sin cargos ocultos.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        border: `1px solid ${open ? "rgba(240,197,90,0.28)" : "rgba(255,255,255,0.08)"}`,
        background: open ? "rgba(240,197,90,0.045)" : "rgba(255,255,255,0.025)",
        transition: "border-color 0.2s, background 0.2s",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 text-left"
        style={{ padding: "16px 20px", background: "none", border: "none", cursor: "pointer" }}
      >
        <span className="text-[13.5px] font-semibold text-white/88 leading-snug">{q}</span>
        <ChevronDown
          size={15}
          style={{
            color: open ? GOLD : "rgba(255,255,255,0.38)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "all 0.22s",
            flexShrink: 0,
          }}
        />
      </button>
      <div style={{ maxHeight: open ? 340 : 0, overflow: "hidden", transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1)" }}>
        <p className="text-[13px] text-white/58 leading-relaxed" style={{ padding: "0 20px 16px", margin: 0 }}>{a}</p>
      </div>
    </div>
  );
}

export function FaqTarot() {
  return (
    <section className="relative px-5 md:px-8 py-14 max-w-[680px] mx-auto">
      <p className="text-[11px] font-bold uppercase tracking-widest mb-2 text-center" style={{ color: GOLD }}>
        Preguntas frecuentes
      </p>
      <h2 className="text-2xl md:text-3xl font-extrabold mb-8 text-center">Antes de elegir tu Tarot</h2>
      <div className="flex flex-col gap-2.5">
        {FAQ.map((item) => <FaqItem key={item.q} q={item.q} a={item.a} />)}
      </div>
    </section>
  );
}
