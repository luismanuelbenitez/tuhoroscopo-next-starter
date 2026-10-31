"use client";

import Link from "next/link";
import type { Route } from "next";
import { CtaButton } from "@/components/home/CtaButton";

// Menú desplegable del celular, común a HeaderHome, HeaderTarot y
// HeaderMarca (auditoría UX 2026-10-30, H7). Panel ENCIMA del contenido (no
// lo empuja), ítems de 48 px de alto y el CTA al final. Se cierra al elegir.
export function MenuMovil({ links, cta, onCerrar }: {
  links: { href: string; label: string }[];
  cta?: { href: string; label: string };
  onCerrar: () => void;
}) {
  return (
    <>
      <div aria-hidden="true" className="md:hidden fixed inset-0 top-[60px]" style={{ background: "rgba(4,2,10,0.55)" }} onClick={onCerrar} />
      <nav
        aria-label="Menú"
        className="md:hidden absolute left-0 right-0 top-full px-4 pt-2 pb-5"
        style={{ background: "rgba(10,7,20,0.96)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(240,197,90,0.25)", boxShadow: "0 18px 40px rgba(0,0,0,0.5)" }}
      >
        <ul>
          {links.map((l) => (
            <li key={l.href} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <Link href={l.href as Route<string>} onClick={onCerrar} className="flex items-center min-h-[48px] text-[16px] text-white/85 hover:text-white">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        {cta && (
          <div onClick={onCerrar}>
            <CtaButton href={cta.href} className="mt-4 block w-full py-3.5 text-[15px]">
              {cta.label}
            </CtaButton>
          </div>
        )}
      </nav>
    </>
  );
}
