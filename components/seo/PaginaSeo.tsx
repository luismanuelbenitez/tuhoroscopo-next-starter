import type { ReactNode } from "react";
import { PaginaMarca } from "@/components/marca/PaginaMarca";
import { HeaderMarca } from "@/components/marca/HeaderMarca";
import { FondoCheckout } from "@/components/tarot/checkout/FondoCheckout";
import { SeoTracking } from "@/components/seo/SeoTracking";
import { jsonLdSeo, type ClavePaginaSeo } from "@/lib/seo/paginasSeo";

// Envoltorio de las páginas SEO de intención (2026-10-20). Mismo esqueleto
// visual que las institucionales (/faq, /quienes-somos): PaginaMarca + header
// de marca + escena del checkout + línea de copyright, sin footer global.
// Agrega JSON-LD (migas + producto) y la medición propia de estas páginas.
// El header es el de las landings (enlaza HACIA el sitio, nunca al revés:
// estas páginas todavía no se enlazan desde ningún lado).

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/tarot", label: "Tarot" },
  { href: "/faq", label: "Preguntas" },
  { href: "/contacto", label: "Contacto" },
];

export function PaginaSeo({
  clave, precioUYU, ctaHref, children,
}: { clave: ClavePaginaSeo; precioUYU: number | null; ctaHref: string; children: ReactNode }) {
  const jsonLd = jsonLdSeo(clave, precioUYU);
  return (
    <PaginaMarca fondo={<FondoCheckout />}>
      <style dangerouslySetInnerHTML={{ __html: "body > footer { display: none !important; } details summary { list-style: none; } details summary::-webkit-details-marker { display: none; }" }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SeoTracking pagina={clave} />
      <HeaderMarca variante="completo" links={NAV} cta={{ href: ctaHref, label: "Quiero mi lectura →" }} />
      <article className="relative px-5 pt-10 md:pt-14 pb-14 mx-auto w-full max-w-[760px]" style={{ fontVariantNumeric: "lining-nums" }}>
        {children}
      </article>
      <p className="relative px-5 pb-10 mx-auto max-w-[560px] text-center text-[11.5px] leading-relaxed text-white/45">
        © {new Date().getFullYear()} Tu Oráculo · Operado por Luis Manuel Benítez Rodríguez · RUT 214998320016 · Uruguay. Todos los derechos reservados.
      </p>
    </PaginaMarca>
  );
}
