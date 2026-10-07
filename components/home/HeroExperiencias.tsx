"use client";

import { CelularMock } from "@/components/tarot/Mockups";
import { GOLD } from "./theme";
import { CtaButton } from "./CtaButton";

const BENEFICIOS = [
  { icon: "mas-claridad.png", label: "Más claridad", sub: "para tus decisiones" },
  { icon: "mas-conexion.png", label: "Más conexión", sub: "contigo misma/o" },
  { icon: "mas-bienestar.png", label: "Más bienestar", sub: "en tu día a día" },
];

const CREMA = "#F5EFE0";
const TEXT_SHADOW = "0 2px 14px rgba(0,0,0,0.65)";

// Un único contenedor (antes: texto y celular como piezas sueltas
// posicionadas por separado, lo que además obligaba a calcular top:% a
// mano para que no choquen). Ahora es un solo flex row de 2 columnas
// (58% texto / 42% celular en desktop, el celular se oculta del todo en
// mobile — no entra bien y no suma a ese ancho) — el celular es un hijo de
// flujo normal, no absoluto, así que se centra solo con items-center y
// nunca necesita coordenadas calculadas a mano.
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
      <div className="flex flex-col md:flex-row md:items-center gap-8 md:gap-6">
        {/* Columna texto — ~58% en desktop */}
        <div className="fi1 md:basis-[58%] md:shrink-0 max-w-[400px] md:max-w-none">
          <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: GOLD, textShadow: TEXT_SHADOW }}>
            Experiencias digitales de bienestar espiritual
          </p>
          <h1
            className="mb-4"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontSize: "clamp(1.7rem, 4.4vw, 2.7rem)", lineHeight: 1.15, textShadow: TEXT_SHADOW }}
          >
            <span style={{ color: CREMA }}>Tu espacio de guía,</span>
            <br />
            <span style={{ color: GOLD }}>claridad y autoconocimiento</span>
          </h1>
          <p className="text-white/80 text-[14px] md:text-[15px] leading-relaxed mb-6 max-w-[420px]" style={{ textShadow: TEXT_SHADOW }}>
            En Tu Oráculo creamos experiencias digitales de bienestar espiritual: tarot, astrología
            y mucho más por venir. Hoy podés vivir <strong className="text-white">Tu Tirada Tarot</strong>,
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
                  src={`/img/home/inicio/${icon}`}
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

        {/* Columna celular — ~42% en desktop, oculta en mobile (no entra
            bien y no suma a ese ancho). Centrado DENTRO de su columna
            (no pegado a la derecha) — el padding-right reserva el aire
            mínimo respecto al borde, independiente del ancho real del
            celular. Centrado vertical por el items-center del row. */}
        <div
          className="fi3 hidden md:flex justify-center"
          style={{ flexBasis: "42%", paddingRight: "clamp(50px, 5vw, 70px)" }}
        >
          <div style={{ width: "clamp(100px, 18vw, 150px)" }}>
            <CelularMock pantalla="whatsapp" alt="Mensaje de WhatsApp con tu tirada de tarot" priority />
          </div>
        </div>
      </div>
    </div>
  );
}
