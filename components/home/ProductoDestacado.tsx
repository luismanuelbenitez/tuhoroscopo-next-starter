"use client";

import { usePrecioTarot } from "@/lib/usePrecioTarot";
import { GOLD } from "./theme";
import { CtaButton } from "./CtaButton";

const ICONS = "/img/home/destacado";

const BENEFICIOS = [
  { label: "Lectura personalizada", icon: "lectura-personalizada.png" },
  { label: "Interpretaciones claras y prácticas", icon: "interpretaciones-claras.png" },
  { label: "PDF para guardar", icon: "pdf.png" },
  { label: "Entrega rápida por WhatsApp", icon: "entrega-rapida-whatsapp.png" },
];

const MINI_BULLETS = [
  { label: "Entrega en minutos", icon: "entrega-en-minutos.png" },
  { label: "Pago seguro", icon: "pago-seguro.png" },
  { label: "100% digital", icon: "cien-por-ciento-digital.png" },
  { label: "Desde Uruguay", icon: "desde-uruguay.png" },
];

function IconoBeneficio({ icon, size }: { icon: string; size: number }) {
  return (
    <img
      src={`${ICONS}/${icon}`}
      alt=""
      aria-hidden="true"
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }}
    />
  );
}

const CARD_BG = "#0c0718";

// Único componente responsive (imagen → contenido → precio/CTA en mobile;
// 3 columnas 35/40/25 en desktop) — bloque 2 SÍ es una card cerrada con
// borde dorado, a diferencia del Hero (que es "capa integrada, sin
// borde"). Sin ancho/posición propios: eso lo resuelve el wrapper en
// page.tsx, para que quede sobre el mismo escenario que el Hero.
export function ProductoDestacado() {
  const precioTarot = usePrecioTarot();

  return (
    <div id="producto-destacado" className="scroll-mt-16">
      <div
        className="fi3 relative rounded-3xl overflow-hidden grid grid-cols-1 md:grid-cols-[35%,40%,25%]"
        style={{ background: CARD_BG, border: "1px solid rgba(240,197,90,0.32)", boxShadow: "0 16px 44px rgba(0,0,0,0.35)" }}
      >
        {/* Imagen: 35% del ancho en desktop. Fundido muy suave hacia la
            derecha (desktop) / abajo (mobile) para integrarla a la card.
            El redondeo izquierdo ya lo da el overflow-hidden + rounded-3xl
            del contenedor padre. */}
        <div className="relative" style={{ minHeight: 260 }}>
          <img
            src="/img/home/destacado/producto-destacado.png"
            alt="Tu Tirada Tarot"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
          />
          <div
            className="md:hidden"
            style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 72%, ${CARD_BG} 100%)` }}
          />
          <div
            className="hidden md:block"
            style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, transparent 72%, ${CARD_BG} 100%)` }}
          />
        </div>

        {/* Separador fino entre columna 2 y 3 — solo desktop */}
        <div
          aria-hidden="true"
          className="hidden md:block absolute"
          style={{ left: "75%", top: "12%", height: "76%", width: 1, background: "rgba(205,165,90,0.35)" }}
        />

        {/* Contenido central — más aire y mejor ritmo vertical */}
        <div className="px-7 py-8 md:px-9 md:py-11">
          <p
            className="inline-block text-[10px] font-bold uppercase tracking-widest mb-4 px-3 py-1 rounded-full"
            style={{ color: GOLD, background: "rgba(240,197,90,0.10)", border: "1px solid rgba(240,197,90,0.25)" }}
          >
            Producto destacado
          </p>
          <h2 className="text-2xl md:text-[28px] font-extrabold mb-2">Tu Tirada Tarot</h2>
          <p className="text-[12px] uppercase tracking-wide text-white/40 mb-5">
            Una guía personalizada para tu momento actual
          </p>
          <p className="text-white/70 text-[14px] leading-relaxed mb-6">
            Recibí una lectura de tarot clara, profunda y práctica: una experiencia digital que te
            llega directo a tu WhatsApp, con lectura online pensada para el celular y un PDF para
            guardar.
          </p>
          <ul className="space-y-3">
            {BENEFICIOS.map(({ label, icon }) => (
              <li key={label} className="flex items-center gap-2.5 text-[13px] text-white/65">
                <IconoBeneficio icon={icon} size={20} />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* Precio + CTA + mini bullets — centrado verticalmente respecto
            al bloque (la columna ya estira a la altura de la fila por
            el grid; justify-center la centra dentro de eso) */}
        <div
          className="px-7 py-10 md:px-7 md:py-11 flex flex-col justify-center md:items-start"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-2xl font-bold mb-2" style={{ color: GOLD }}>
            {precioTarot !== null ? `$U ${precioTarot}` : "Ver precio"}
          </p>
          <p className="text-[11px] text-white/40 mb-8">pago único</p>
          <CtaButton href="/tarot" className="px-6 py-3 text-sm mb-9 w-full text-center md:w-auto">
            Quiero mi tirada →
          </CtaButton>
          <div className="space-y-4">
            {MINI_BULLETS.map(({ label, icon }) => (
              <div key={label} className="flex items-center gap-2.5 text-[12px] text-white/55">
                <IconoBeneficio icon={icon} size={20} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
