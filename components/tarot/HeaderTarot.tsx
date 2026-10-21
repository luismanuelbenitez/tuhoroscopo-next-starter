"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { LogoIcon } from "@/components/logo-icon";
import { NavLink, CtaButton } from "@/components/home/CtaButton";

// Mismo criterio que HeaderHome (components/home/): vive DENTRO del
// escenario (TarotBackgroundStage), sticky, fondo translúcido + blur.
const WORDMARK_STYLE = {
  fontFamily: "var(--font-cormorant), Georgia, serif",
  letterSpacing: "0.08em",
} as const;

// mostrarTestimonios: el link a #testimonios solo aparece si la sección
// existe (hay testimonios visibles en tarot_testimonios).
export function HeaderTarot({ mostrarTestimonios = false }: { mostrarTestimonios?: boolean }) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div
      role="banner"
      className="sticky top-0"
      style={{ background: "rgba(10,7,20,0.42)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.08)", zIndex: 30 }}
    >
      <div className="flex items-center justify-between gap-3 px-4 md:px-8" style={{ minHeight: 60 }}>
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <LogoIcon size={32} />
          <span className="text-[14px] md:text-[13px] font-bold uppercase leading-none" style={WORDMARK_STYLE}>
            Tu Oráculo
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-7">
          <NavLink href="/tarot">Tarot</NavLink>
          <NavLink href="#como-funciona">Cómo funciona</NavLink>
          <NavLink href="/faq">Preguntas</NavLink>
          {mostrarTestimonios && <NavLink href="#testimonios">Testimonios</NavLink>}
          <NavLink href="/contacto">Contacto</NavLink>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <CtaButton href="/tarot/checkout" className="text-[12px] px-4 py-2.5 rounded-full">
            Quiero mi Tarot →
          </CtaButton>
          <button
            type="button"
            className="md:hidden flex items-center justify-center"
            style={{ width: 40, height: 40, border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8 }}
            aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuAbierto}
            onClick={() => setMenuAbierto(v => !v)}
          >
            {menuAbierto ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {menuAbierto && (
        <div
          className="md:hidden flex flex-col gap-4 px-4 pb-5 pt-1"
          style={{ background: "rgba(10,7,20,0.85)", backdropFilter: "blur(10px)", borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <NavLink href="/tarot">Tarot</NavLink>
          <NavLink href="#como-funciona">Cómo funciona</NavLink>
          <NavLink href="/faq">Preguntas</NavLink>
          {mostrarTestimonios && <NavLink href="#testimonios">Testimonios</NavLink>}
          <NavLink href="/contacto">Contacto</NavLink>
        </div>
      )}
    </div>
  );
}
