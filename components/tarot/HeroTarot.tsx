"use client";

import { Zap, MessageCircle, Smartphone, Volume2, FileText } from "lucide-react";
import { GOLD } from "@/components/home/theme";
import { CtaButton } from "@/components/home/CtaButton";
import { fijo } from "@/lib/imagen";

const CREMA = "#F5EFE0";
const TEXT_SHADOW = "0 2px 14px rgba(0,0,0,0.65)";
const MP_LOGO = "/img/tarot/generales/MP_RGB_HANDSHAKE_pluma_horizontal.png";

const BENEFICIOS = [
  { Icon: Zap, label: "Entrega en minutos" },
  { Icon: MessageCircle, label: "Por WhatsApp y/o mail" },
  { Icon: Smartphone, label: "Lectura online" },
  { Icon: Volume2, label: "Resumen con voz de IA + ambientación" },
  { Icon: FileText, label: "PDF para guardar" },
];

// Sin celular/documento flotando: el fondo de la página ya tiene
// protagonismo propio (velas, cristales, el libro "Tarot") y la escena de
// objetos competía con eso. Columna de texto única, sin segunda columna.
export function HeroTarot({ precioUYU }: { precioUYU: number | null }) {
  const precioTexto = precioUYU !== null ? `$U ${precioUYU}` : null;

  return (
    <div className="relative px-6 md:px-12" style={{ paddingTop: "7%", paddingBottom: "5%" }}>
      <div className="fi1 max-w-[520px]">
        {/* SEO (2026-10-21): el H1 es la intención principal de la página
            ("tarot personalizado online") con el estilo del antetítulo; el
            "Tarot" grande queda como título visual, sin cambiar el diseño. */}
        <h1 className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: GOLD, textShadow: TEXT_SHADOW }}>
          Tarot personalizado online
        </h1>
        <p aria-hidden="true" className="mb-1" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 700, fontSize: "clamp(2.2rem, 6vw, 3.6rem)", lineHeight: 1.05, textShadow: TEXT_SHADOW }}>
          <span style={{ color: CREMA }}>Tarot</span>
        </p>
        <p className="mb-4" style={{ color: GOLD, fontSize: "clamp(1.05rem, 2.2vw, 1.3rem)", fontWeight: 600, textShadow: TEXT_SHADOW }}>
          5 cartas, interpretadas para vos.
        </p>
        <p className="text-white/80 text-[14px] md:text-[15px] leading-relaxed mb-6" style={{ textShadow: TEXT_SHADOW }}>
          Hacé tu consulta y recibí en minutos una lectura personalizada de 5 cartas. Explorá cada
          carta desde tu celular, escuchá el resumen con voz generada por IA, ambientá tu lectura
          con música y guardá tu PDF para volver cuando quieras.
        </p>

        <div className="fi2 flex flex-wrap gap-x-5 gap-y-2.5 mb-7">
          {BENEFICIOS.map(({ Icon, label }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon size={14} style={{ color: GOLD, flexShrink: 0 }} />
              <span className="text-[12.5px] text-white/70" style={{ textShadow: TEXT_SHADOW }}>{label}</span>
            </div>
          ))}
        </div>

        <div className="fi3">
          <CtaButton href="/tarot/checkout" className="px-7 py-3.5 text-[15px]">
            {precioTexto ? `Quiero mi Tarot por ${precioTexto} →` : "Quiero mi Tarot →"}
          </CtaButton>
          <div className="mt-3 flex items-center gap-2">
            <p className="text-[12px] text-white/50" style={{ textShadow: TEXT_SHADOW }}>
              Pago único · Sin suscripción · Pago seguro con
            </p>
            {/* Paquete SEO 2: PNG 1049×426 → se pinta a 59×24 */}
            <img {...fijo(MP_LOGO, 60, 24)} alt="Mercado Pago" style={{ height: 24, width: "auto", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.5))" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
