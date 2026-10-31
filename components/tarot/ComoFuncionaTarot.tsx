"use client";

import { Edit3, CreditCard, Sparkles, Smartphone } from "lucide-react";
import { fijo, fluido } from "@/lib/imagen";
import { GOLD, SERIF } from "@/components/home/theme";

const DIR = "/img/tarot/contenedores/como-funciona";

// Paleta de texto sobre el pergamino — misma que "¿Qué incluye tu Tarot?".
const COLOR_TITULO = "#241426";
const COLOR_SECUNDARIO = "#5A4632";

// Desktop: pasos sobre el pergamino (copy de la referencia de Manuel, corto
// para que entre en el papel). `aro`: diámetro visible del aro dentro del
// ícono de 512×512, medido por píxeles — se escala cada uno para que los 4
// aros midan lo mismo en pantalla.
const PASOS_DESKTOP = [
  { icono: "icono-consulta.webp", aro: 362, t: "1. Elegís tu tema", d: "Y, si querés, sumás una pregunta puntual." },
  { icono: "icono-pago.webp", aro: 344, t: "2. Realizás el pago", d: "Pago único y seguro con Mercado Pago. Sin suscripción." },
  { icono: "icono-tarot.webp", aro: 378, t: "3. Recibís tu acceso", d: "En minutos te llega por WhatsApp y/o email tu link personal." },
  { icono: "icono-experiencia.webp", aro: 390, t: "4. Vivís la experiencia", d: "Explorá tus 5 cartas, escuchá el resumen y descargá tu PDF." },
];

// Todo el desktop se mide en proporción al ancho del pergamino (container
// queries, 1cqw = 1% del ancho de la sección) — mismo criterio que
// QueIncluyeTarot: el contenido escala junto con la imagen y nunca se sale
// del papel. `u(px)` traduce una medida pensada a 960px de ancho.
// Pergamino 1920×660 → 960×330 a ese ancho; el papel visible termina en
// y≈303 (abajo trae ~25px transparentes).
const u = (px: number) => `${(px / 9.6).toFixed(3)}cqw`;
const ARO = 60;

function PasoDesktop({ icono, aro, t, d }: (typeof PASOS_DESKTOP)[number]) {
  return (
    <div className="flex flex-col items-center text-center" style={{ width: u(172) }}>
      <div className="flex items-center justify-center" style={{ width: u(ARO), height: u(ARO), marginBottom: u(8) }}>
        <img
          // Paquete SEO 2: 512 px → se pinta a ~70 px (desktop, diferida)
          {...fijo(`${DIR}/${icono}`, 80)}
          alt=""
          aria-hidden="true"
          style={{ width: u((ARO * 512) / aro), height: u((ARO * 512) / aro), maxWidth: "none", flexShrink: 0, filter: "drop-shadow(0 3px 6px rgba(40,20,0,0.30))" }}
        />
      </div>
      <p className="font-bold" style={{ color: COLOR_TITULO, fontSize: u(15), lineHeight: 1.2, marginBottom: u(4) }}>{t}</p>
      <p style={{ color: COLOR_SECUNDARIO, fontSize: u(13), lineHeight: 1.4 }}>{d}</p>
    </div>
  );
}

function ComoFuncionaDesktop() {
  return (
    <div className="hidden md:grid grid-cols-1 text-center" style={{ containerType: "inline-size" }}>
      <img
        // Paquete SEO 2: 1920×660 → 960 px de ancho; solo desktop (diferida:
        // en mobile está oculta y no se descarga)
        {...fluido(`${DIR}/pergamino-desktop.webp`, 1920, 660, "(max-width: 960px) 100vw, 960px")}
        alt=""
        aria-hidden="true"
        style={{ gridArea: "1 / 1", alignSelf: "start", width: "100%", height: "auto" }}
      />
      <div style={{ gridArea: "1 / 1", alignSelf: "start", padding: `${u(60)} ${u(60)} 0` }}>
        <h2 className="uppercase" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: u(30), lineHeight: 1.1, letterSpacing: "0.06em", color: COLOR_TITULO }}>
          ¿Cómo funciona?
        </h2>
        <p style={{ fontFamily: SERIF, fontWeight: 600, fontSize: u(18), color: COLOR_TITULO, marginTop: u(2), marginBottom: u(8) }}>
          En pocos pasos, tu lectura personalizada.
        </p>

        <div className="flex items-start justify-center">
          {PASOS_DESKTOP.map((paso, i) => (
            <div key={paso.t} className="flex items-start">
              <PasoDesktop {...paso} />
              {i < PASOS_DESKTOP.length - 1 && (
                <img
                  {...fijo(`${DIR}/flecha.webp`, 60, 15)}
                  alt=""
                  aria-hidden="true"
                  // Centrada a la altura del medio del aro.
                  style={{ width: u(56), height: "auto", marginTop: u(ARO / 2 - 7), marginInline: u(-3) }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Mobile ─────────────────────────────────────────────────────────────

const PASOS = [
  { n: "1", Icon: Edit3, t: "Hacé tu consulta", d: "Contanos tu nombre, tu WhatsApp, el tema y, si querés, una pregunta puntual." },
  { n: "2", Icon: CreditCard, t: "Realizá el pago", d: "Pago único, procesado de forma segura con Mercado Pago." },
  { n: "3", Icon: Sparkles, t: "Recibí tu Tarot", d: "En menos de 15 minutos te llega por WhatsApp y, si lo elegiste, también por email." },
  { n: "4", Icon: Smartphone, t: "Viví la experiencia", d: "Recorré tus 5 cartas, escuchá el resumen, ambientá tu lectura y descargá tu PDF." },
];

function PasoIcono({ Icon, size }: { Icon: typeof Edit3; size: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, background: "rgba(240,197,90,0.10)", border: "1px solid rgba(240,197,90,0.35)" }}
    >
      <Icon size={size * 0.42} style={{ color: GOLD }} />
    </div>
  );
}

function ComoFuncionaMobile() {
  return (
    <div className="md:hidden px-5 py-14 text-center">
      <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
        Simple, rápido y desde tu celular
      </p>
      <h2 className="text-2xl font-extrabold mb-3">¿Cómo funciona?</h2>
      <p className="text-white/60 text-[13px] mb-7 max-w-md mx-auto">
        Cuatro pasos para vivir tu lectura personalizada.
      </p>
      {/* Lista y no carrusel (auditoría UX 2026-10-30): son 4 pasos cortos
          que entran en una pantalla; en carrusel quedaban 3 escondidos. */}
      <ol className="flex flex-col gap-3 max-w-[440px] mx-auto text-left">
        {PASOS.map(({ n, Icon, t, d }) => (
          <li
            key={n}
            className="flex items-center gap-4 rounded-2xl px-4 py-3.5"
            style={{ background: "rgba(10,6,22,0.72)", border: "1px solid rgba(240,197,90,0.22)" }}
          >
            <PasoIcono Icon={Icon} size={44} />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug">
                <span style={{ color: GOLD }}>{n}.</span> {t}
              </p>
              <p className="text-[13px] text-white/70 leading-snug mt-0.5">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Desktop: pergamino de ancho completo del escenario (960, sin gutter
// lateral, igual que "¿Qué incluye tu Tarot?"). Mobile: versión anterior.
export function ComoFuncionaTarot() {
  return (
    <section id="como-funciona" className="relative max-w-[960px] mx-auto md:py-10 scroll-mt-16">
      <ComoFuncionaDesktop />
      <ComoFuncionaMobile />
    </section>
  );
}
