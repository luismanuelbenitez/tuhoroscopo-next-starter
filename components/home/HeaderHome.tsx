"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { LogoIcon } from "@/components/logo-icon";
import { NavLink, CtaButton } from "./CtaButton";

// Wordmark según decisión de marca (ver memoria brand-wordmark-tu-oraculo):
// Cormorant Garamond Bold, mayúsculas, dorado, tracking ~8% (no 22%: se
// corrige acá, el valor anterior era demasiado abierto para una marca
// premium/mística — se leía más "institucional" que "fina").
const WORDMARK_STYLE = {
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  letterSpacing: "0.08em",
} as const;

// Vive DENTRO del escenario (ver HomeBackgroundStage/page.tsx), como
// hijo de flujo normal DIRECTO de ese contenedor (que tiene alto fijo vía
// aspect-ratio, no auto). La imagen de fondo es position:absolute y por
// eso no lo empuja hacia abajo — el header arranca superpuesto a la
// imagen desde el primer pixel, y al tener un contenedor padre con alto
// real y estable, el sticky se pega arriba durante TODO el scroll visible
// de la página. Bordes rectos a propósito (nada de rounded): no debe
// leerse como una barra/card aparte.
export function HeaderHome() {
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
          <NavLink href="/">Inicio</NavLink>
          <NavLink href="/tarot">Productos</NavLink>
          <NavLink href="/#como-funciona">Cómo funciona</NavLink>
          <NavLink href="/faq">Preguntas</NavLink>
          <NavLink href="/contacto">Contacto</NavLink>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <CtaButton href="/tarot" className="text-[12px] px-4 py-2.5 rounded-full">
            Conocer Tu Tirada →
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
          <NavLink href="/">Inicio</NavLink>
          <NavLink href="/tarot">Productos</NavLink>
          <NavLink href="/#como-funciona">Cómo funciona</NavLink>
          <NavLink href="/faq">Preguntas</NavLink>
          <NavLink href="/contacto">Contacto</NavLink>
        </div>
      )}
    </div>
  );
}
