import type { ReactNode } from "react";
import { PaginaMarca } from "@/components/marca/PaginaMarca";
import { HeaderMarca } from "@/components/marca/HeaderMarca";
import { FondoCheckout } from "@/components/tarot/checkout/FondoCheckout";
import { PieMarca } from "@/components/marca/PieMarca";
import { GOLD, SERIF, CREMA } from "@/components/home/theme";

// Páginas institucionales con la estética de marca (2026-10-19): FAQ,
// ¿Quiénes somos?, Política de privacidad. Misma estructura que /tarot y el
// checkout: PaginaMarca + header de la home + escena de fondo del checkout +
// paneles con filete dorado + línea de copyright (sin footer global).

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/tarot", label: "Productos" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/faq", label: "Preguntas" },
  { href: "/contacto", label: "Contacto" },
];

export const PANEL_INSTITUCIONAL = {
  background: "rgba(12,7,24,0.80)",
  border: "1px solid rgba(240,197,90,0.28)",
  backdropFilter: "blur(6px)",
} as const;

export function PaginaInstitucional({ children }: { children: ReactNode }) {
  return (
    <PaginaMarca fondo={<FondoCheckout />}>
      <style dangerouslySetInnerHTML={{ __html: "details summary { list-style: none; } details summary::-webkit-details-marker { display: none; }" }} />
      <HeaderMarca variante="completo" links={NAV} cta={{ href: "/tarot", label: "Conocer el Tarot →" }} />
      <main className="relative px-5 pt-12 md:pt-16 pb-14 mx-auto w-full max-w-[760px]" style={{ fontVariantNumeric: "lining-nums" }}>
        {children}
      </main>
      <PieMarca />
    </PaginaMarca>
  );
}

const SOMBRA_ENCABEZADO = "0 2px 14px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)";

export function EncabezadoInstitucional({ eyebrow, titulo, children }: { eyebrow: string; titulo: string; children?: ReactNode }) {
  return (
    // Velo y sombra: el encabezado cae sobre el sol y la luna de la escena
    // (auditoría UX 2026-10-30, T3).
    <div className="text-center mb-10 rounded-3xl py-2" style={{ textShadow: SOMBRA_ENCABEZADO, background: "radial-gradient(ellipse at center, rgba(8,4,18,0.55) 0%, rgba(8,4,18,0.25) 60%, transparent 80%)" }}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-3" style={{ color: GOLD }}>{eyebrow}</p>
      <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(34px, 6vw, 46px)", lineHeight: 1.1, color: CREMA }}>{titulo}</h1>
      {children && <div className="mt-3 text-[15px] md:text-base text-white/85 leading-relaxed">{children}</div>}
    </div>
  );
}

export function PanelInstitucional({ titulo, children, id }: { titulo: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-2xl px-5 md:px-7 py-5 md:py-6 scroll-mt-20" style={PANEL_INSTITUCIONAL}>
      <h2 className="mb-2.5" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, lineHeight: 1.2, color: CREMA }}>{titulo}</h2>
      <div className="text-white/75 text-[15px] leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

/** Ancla de una sección legal a partir de su título ("4. Suscripciones" → "seccion-4"). */
export function anclaSeccion(titulo: string) {
  return `seccion-${titulo.split(".")[0].trim()}`;
}

// Índice de los textos legales (auditoría UX 2026-10-30, P2): en el celular
// son ~3.500 px; el índice lleva directo a "reembolsos" o "datos".
export function IndiceLegal({ titulos }: { titulos: string[] }) {
  return (
    <nav aria-label="Índice" className="rounded-2xl px-5 md:px-7 py-4 mb-3" style={PANEL_INSTITUCIONAL}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: GOLD }}>Índice</p>
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        {titulos.map((t) => (
          <li key={t}>
            <a href={`#${anclaSeccion(t)}`} className="block py-1.5 text-[14px] text-white/75 hover:text-white underline-offset-4 hover:underline">{t}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
