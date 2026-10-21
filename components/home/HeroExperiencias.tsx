"use client";

import { GOLD } from "./theme";
import { CtaButton } from "./CtaButton";
import { fijo } from "@/lib/imagen";

const BENEFICIOS = [
  { icon: "mas-claridad.png", label: "Más claridad", sub: "para tus decisiones" },
  { icon: "mas-conexion.png", label: "Más conexión", sub: "contigo misma/o" },
  { icon: "mas-bienestar.png", label: "Más bienestar", sub: "en tu día a día" },
];

const CREMA = "#F5EFE0";
const TEXT_SHADOW = "0 2px 14px rgba(0,0,0,0.65)";

// Sin celular (ni en mobile ni en desktop): el fondo ya tiene protagonismo
// propio del lado derecho (velas, libros, cristales, la carta "Tu
// Oráculo") — el celular competía con eso y ensuciaba la composición.
// Columna de texto ampliada a ~62% en desktop para dejar respirar el
// fondo en vez de llenar el espacio con una segunda columna.
//
// De flujo normal (ya no position:absolute): el escenario (HomeBackgroundStage)
// ahora envuelve TODOS los bloques de la home y su alto lo da el flujo de
// sus hijos — el fondo es una capa aparte (position:absolute, detrás de
// todo) que se estira a ese alto, así que el Hero no necesita "flotar"
// para no ensuciar el cálculo de alto: simplemente fluye como cualquier
// otro bloque. position:relative (no static) para quedar por encima del
// fondo en el orden de pintado — ver nota en HomeBackgroundStage.
export function HeroExperiencias() {
  return (
    <div className="relative px-6 md:px-12" style={{ paddingTop: "7%", paddingBottom: "4%" }}>
      <div className="fi1 md:max-w-[62%] max-w-[420px]">
        <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: GOLD, textShadow: TEXT_SHADOW }}>
          Experiencias digitales de bienestar espiritual
        </p>
        <h1
          className="mb-4"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 700, fontSize: "clamp(1.7rem, 4.4vw, 2.7rem)", lineHeight: 1.15, textShadow: TEXT_SHADOW }}
        >
          <span style={{ color: CREMA }}>Tu espacio de guía,</span>
          <br />
          <span style={{ color: GOLD }}>claridad y autoconocimiento</span>
        </h1>
        <p className="text-white/80 text-[14px] md:text-[15px] leading-relaxed mb-6 max-w-[420px]" style={{ textShadow: TEXT_SHADOW }}>
          En Tu Oráculo creamos experiencias digitales de bienestar espiritual: tarot, astrología
          y mucho más por venir. Hoy podés vivir el <strong className="text-white">Tarot</strong>,
          una lectura personalizada que te llega directo a tu WhatsApp, simple y rápida, desde
          cualquier lugar de Uruguay.
        </p>
        <CtaButton href="#producto-destacado" className="px-6 py-3 text-[13px] mb-7">
          Explorar experiencias →
        </CtaButton>
        <div className="fi2 grid grid-cols-3 gap-3 max-w-sm">
          {BENEFICIOS.map(({ icon, label, sub }) => (
            <div key={label} className="text-center">
              <img
                // Paquete SEO 2: 512 px → se pinta a 20 px
                {...fijo(`/img/home/inicio/${icon}`, 20)}
                alt=""
                aria-hidden="true"
                style={{ width: 20, height: 20, objectFit: "contain", margin: "0 auto 6px", filter: "drop-shadow(0 1px 6px rgba(0,0,0,0.6))" }}
              />
              <p className="text-[10.5px] text-white font-semibold leading-tight" style={{ textShadow: TEXT_SHADOW }}>{label}</p>
              <p className="text-[9.5px] text-white/60 leading-tight" style={{ textShadow: TEXT_SHADOW }}>{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
