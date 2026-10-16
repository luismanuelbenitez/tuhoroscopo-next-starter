"use client";

import { Edit3, CreditCard, Sparkles, Smartphone } from "lucide-react";
import { GOLD, SERIF } from "@/components/home/theme";
import { Carousel } from "@/components/home/Carousel";

const DIR = "/img/tarot/contenedores/como-funciona";

// Paleta de texto sobre el pergamino — misma que "¿Qué incluye tu Tarot?".
const COLOR_TITULO = "#241426";
const COLOR_SECUNDARIO = "#5A4632";

// Desktop: pasos sobre el pergamino (copy de la referencia de Manuel, corto
// para que entre en el papel). `aro`: diámetro visible del aro dentro del
// ícono de 512×512, medido por píxeles — se escala cada uno para que los 4
// aros midan lo mismo en pantalla.
const PASOS_DESKTOP = [
  { icono: "icono-consulta.webp", aro: 362, t: "1. Hacés tu consulta", d: "Contanos en qué tema te gustaría recibir tu lectura." },
  { icono: "icono-pago.webp", aro: 344, t: "2. Realizás el pago", d: "De forma segura con Mercado Pago." },
  { icono: "icono-tarot.webp", aro: 378, t: "3. Recibís tu Tarot", d: "En minutos por WhatsApp y/o mail." },
  { icono: "icono-experiencia.webp", aro: 390, t: "4. Leés la experiencia", d: "Accedé a tu lectura online y descargá tu PDF." },
];

// Todo el desktop se mide en proporción al ancho del pergamino (container
// queries, 1cqw = 1% del ancho de la sección) — mismo criterio que
// QueIncluyeTarot: el contenido escala junto con la imagen y nunca se sale
// del papel. `u(px)` traduce una medida pensada a 960px de ancho.
// Pergamino 1920×660 → 960×330 a ese ancho; el papel visible termina en
// y≈303 (abajo trae ~25px transparentes).
const u = (px: number) => `${(px / 9.6).toFixed(3)}cqw`;
const ARO = 68;

function PasoDesktop({ icono, aro, t, d }: (typeof PASOS_DESKTOP)[number]) {
  return (
    <div className="flex flex-col items-center text-center" style={{ width: u(160) }}>
      <div className="flex items-center justify-center" style={{ width: u(ARO), height: u(ARO), marginBottom: u(10) }}>
        <img
          src={`${DIR}/${icono}`}
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
        src={`${DIR}/pergamino-desktop.webp`}
        alt=""
        aria-hidden="true"
        style={{ gridArea: "1 / 1", alignSelf: "start", width: "100%", height: "auto" }}
      />
      <div style={{ gridArea: "1 / 1", alignSelf: "start", padding: `${u(44)} ${u(85)} 0` }}>
        <h2 className="uppercase" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: u(34), lineHeight: 1.1, letterSpacing: "0.06em", color: COLOR_TITULO }}>
          ¿Cómo funciona?
        </h2>
        <p style={{ fontFamily: SERIF, fontWeight: 600, fontSize: u(18), color: COLOR_TITULO, marginTop: u(2), marginBottom: u(12) }}>
          En pocos pasos, tu lectura personalizada.
        </p>

        <div className="flex items-start justify-center">
          {PASOS_DESKTOP.map((paso, i) => (
            <div key={paso.t} className="flex items-start">
              <PasoDesktop {...paso} />
              {i < PASOS_DESKTOP.length - 1 && (
                <img
                  src={`${DIR}/flecha.webp`}
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

// ── Mobile (sin cambios, pendiente de la etapa móvil) ──────────────────

const PASOS = [
  { n: "1", Icon: Edit3, t: "Hacé tu consulta", d: "Contanos tu nombre, tu WhatsApp, el tema y, si querés, una pregunta puntual." },
  { n: "2", Icon: CreditCard, t: "Realizá el pago", d: "Pago único, procesado de forma segura con Mercado Pago." },
  { n: "3", Icon: Sparkles, t: "Recibí tu Tarot", d: "En menos de 15 minutos te llega por WhatsApp y, si lo elegiste, también por email." },
  { n: "4", Icon: Smartphone, t: "Viví la experiencia", d: "Recorré tus 5 cartas, escuchá el resumen, ambientá tu lectura y descargá tu PDF." },
];

function PasoIcono({ Icon, size }: { Icon: typeof Edit3; size: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full mx-auto mb-3"
      style={{ width: size, height: size, background: "rgba(240,197,90,0.10)", border: "1px solid rgba(240,197,90,0.35)" }}
    >
      <Icon size={size * 0.42} style={{ color: GOLD }} />
    </div>
  );
}

function PasoCard({ n, Icon, t, d }: (typeof PASOS)[number]) {
  return (
    <div className="text-center" style={{ width: "min(80vw, 240px)" }}>
      <PasoIcono Icon={Icon} size={56} />
      <p className="text-[11px] font-bold mb-1" style={{ color: GOLD }}>{n}</p>
      <p className="text-sm font-semibold mb-1.5 px-2">{t}</p>
      <p className="text-[12px] text-white/45 leading-snug px-2">{d}</p>
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
      <p className="text-white/50 text-[13px] mb-10 max-w-md mx-auto">
        Cuatro pasos para vivir tu lectura personalizada.
      </p>
      <Carousel showArrows={false}>
        {PASOS.map(paso => <PasoCard key={paso.n} {...paso} />)}
      </Carousel>
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
