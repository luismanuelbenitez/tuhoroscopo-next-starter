"use client";

import Link from "next/link";
import { Layers, Clock, Headphones, type LucideIcon } from "lucide-react";
import { GOLD, CREMA } from "@/components/home/theme";
import { CtaButton } from "@/components/home/CtaButton";

// Beneficios concretos (qué recibís), no abstractos. Íconos Lucide en
// dorado hasta tener los propios (ver prompts en la auditoría 2026-10-29).
const BENEFICIOS: { icon: LucideIcon; label: string; sub: string }[] = [
  { icon: Layers, label: "5 cartas", sub: "interpretadas para vos" },
  { icon: Clock, label: "En minutos", sub: "directo a tu WhatsApp" },
  { icon: Headphones, label: "Leé, escuchá, guardá", sub: "online, audio y PDF" },
];

const TEXT_SHADOW = "0 2px 14px rgba(0,0,0,0.65)";

export function HeroV2({ precioUYU }: { precioUYU: number | null }) {
  return (
    <div className="relative px-6 md:px-12" style={{ paddingTop: "7%", paddingBottom: "4%" }}>
      <div className="fi1 md:max-w-[60%] max-w-[440px]">
        <p className="text-[10.5px] md:text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: GOLD, textShadow: TEXT_SHADOW }}>
          Tarot online personalizado · Uruguay
        </p>
        <h1
          className="mb-4"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 700, fontSize: "clamp(1.85rem, 4.6vw, 2.9rem)", lineHeight: 1.12, textShadow: TEXT_SHADOW }}
        >
          <span style={{ color: CREMA }}>Tu tirada de tarot,</span>
          <br />
          <span style={{ color: GOLD }}>en tu WhatsApp en minutos</span>
        </h1>
        <p className="text-white/85 text-[15px] md:text-[16px] leading-relaxed mb-6 max-w-[430px]" style={{ textShadow: TEXT_SHADOW }}>
          Una lectura personalizada para tu momento: elegís el tema, sumás tu consulta si querés
          y cinco cartas aparecen para vos. La leés, la escuchás y la guardás en PDF.
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-8">
          <CtaButton href="/tarot/checkout" className="px-6 py-3 text-[14px] whitespace-nowrap">
            {precioUYU !== null ? `Quiero mi lectura · $U ${precioUYU} →` : "Quiero mi lectura →"}
          </CtaButton>
          <Link
            href="#como-funciona"
            className="text-[13px] text-white/75 hover:text-white underline underline-offset-4 decoration-white/30"
            style={{ textShadow: TEXT_SHADOW }}
          >
            Cómo funciona
          </Link>
        </div>
        <div className="fi2 grid grid-cols-3 gap-3 max-w-[420px]">
          {BENEFICIOS.map(({ icon: Icono, label, sub }) => (
            <div key={label} className="text-center">
              <Icono size={22} aria-hidden="true" style={{ color: GOLD, margin: "0 auto 6px", filter: "drop-shadow(0 1px 6px rgba(0,0,0,0.6))" }} />
              <p className="text-[13px] text-white font-semibold leading-tight" style={{ textShadow: TEXT_SHADOW }}>{label}</p>
              <p className="text-[12px] text-white/70 leading-snug mt-0.5" style={{ textShadow: TEXT_SHADOW }}>{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
