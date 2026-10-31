"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { LogoIcon } from "@/components/logo-icon";
import { MenuMovil } from "@/components/marca/MenuMovil";
import { NavLink, CtaButton } from "@/components/home/CtaButton";
import { GOLD, SERIF } from "@/components/home/theme";

// Wordmark según decisión de marca: Cormorant Garamond Bold, mayúsculas,
// tracking ~8% (ver docs/product/DECISIONS.md).
const WORDMARK_STYLE = { fontFamily: SERIF, letterSpacing: "0.08em" } as const;

type Props =
  // Checkout y flujos de compra: solo la marca, sin navegación ni CTA —
  // cada link del menú es una salida antes de pagar.
  | { variante: "minimo" }
  // Landings: mismo header que hoy tienen HeaderHome / HeaderTarot.
  | { variante: "completo"; links: { href: string; label: string }[]; cta: { href: string; label: string } };

export function HeaderMarca(props: Props) {
  if (props.variante === "minimo") return <HeaderMinimo />;
  return <HeaderCompleto links={props.links} cta={props.cta} />;
}

function HeaderMinimo() {
  const linea = (lado: "izq" | "der") => (
    <div className="hidden md:flex flex-1 items-center gap-3" style={{ flexDirection: lado === "izq" ? "row" : "row-reverse" }}>
      <span
        className="h-px flex-1"
        style={{ background: `linear-gradient(${lado === "izq" ? "90deg" : "270deg"}, transparent, rgba(240,197,90,0.45))` }}
      />
      <span className="text-[11px]" style={{ color: GOLD }}>✦</span>
    </div>
  );

  return (
    <div role="banner" className="relative flex items-center gap-5 px-6 md:px-10 pt-5 pb-2">
      {linea("izq")}
      <div className="flex items-center gap-3 shrink-0 mx-auto">
        <LogoIcon size={44} />
        <span className="text-[17px] font-bold uppercase leading-none" style={{ ...WORDMARK_STYLE, color: GOLD }}>
          Tu Oráculo
        </span>
      </div>
      {linea("der")}
    </div>
  );
}

function HeaderCompleto({ links, cta }: { links: { href: string; label: string }[]; cta: { href: string; label: string } }) {
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
          {links.map(l => <NavLink key={l.href} href={l.href}>{l.label}</NavLink>)}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <CtaButton href={cta.href} className="text-[12px] px-4 py-2.5 rounded-full">
            {cta.label}
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

      {menuAbierto && <MenuMovil links={links} cta={cta} onCerrar={() => setMenuAbierto(false)} />}
    </div>
  );
}
