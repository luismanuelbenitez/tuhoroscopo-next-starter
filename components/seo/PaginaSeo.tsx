import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { GOLD, SERIF, CREMA } from "@/components/home/theme";
import { PaginaMarca } from "@/components/marca/PaginaMarca";
import { HeaderMarca } from "@/components/marca/HeaderMarca";
import { FondoCheckout } from "@/components/tarot/checkout/FondoCheckout";
import { SeoTracking } from "@/components/seo/SeoTracking";
import { EnlacesTarotPie } from "@/components/marca/EnlacesTarotPie";
import { jsonLdSeo, PAGINAS_SEO, type ClavePaginaSeo } from "@/lib/seo/paginasSeo";

// Envoltorio de las páginas SEO de intención (2026-10-20). Mismo esqueleto
// visual que las institucionales (/faq, /quienes-somos): PaginaMarca + header
// de marca + escena del checkout + línea de copyright, sin footer global.
// Agrega JSON-LD (migas + producto) y la medición propia de estas páginas.
// El header es el de las landings. Paquete SEO 1 (2026-10-21): migas de pan
// visibles (coinciden con el BreadcrumbList del JSON-LD) y "Otras consultas"
// hacia las páginas hermanas.

// Orden y textos de "Otras consultas".
const HERMANAS: { clave: ClavePaginaSeo; label: string }[] = [
  { clave: "amor", label: "Tarot del amor" },
  { clave: "trabajo", label: "Tarot de trabajo y dinero" },
  { clave: "decisiones", label: "Tarot para tomar una decisión" },
  { clave: "uruguay", label: "Tarot online en Uruguay" },
  { clave: "personalizada", label: "Qué incluye una lectura personalizada" },
];

function Migas({ clave }: { clave: ClavePaginaSeo }) {
  return (
    <nav aria-label="Ruta" className="mb-6 text-[12.5px] text-white/55">
      <ol className="flex flex-wrap justify-center items-center gap-1.5">
        <li><Link href="/" className="hover:text-white/85">Inicio</Link></li>
        <li aria-hidden="true" style={{ color: GOLD }}>›</li>
        <li><Link href="/tarot" className="hover:text-white/85">Tarot</Link></li>
        <li aria-hidden="true" style={{ color: GOLD }}>›</li>
        <li aria-current="page" className="text-white/75">{PAGINAS_SEO[clave].migaja}</li>
      </ol>
    </nav>
  );
}

function OtrasConsultas({ clave }: { clave: ClavePaginaSeo }) {
  const otras = HERMANAS.filter((h) => h.clave !== clave);
  return (
    <section aria-labelledby="otras-consultas" className="relative px-5 pb-10 mx-auto max-w-[760px] text-center">
      <h2 id="otras-consultas" className="mb-4" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 24, color: CREMA }}>Otras consultas</h2>
      <ul className="flex flex-wrap justify-center gap-2.5">
        {otras.map((h) => (
          <li key={h.clave}>
            <Link
              href={PAGINAS_SEO[h.clave].slug as Route<string>}
              className="inline-block rounded-full px-4 py-2 text-[13.5px] text-white/80 hover:text-white transition"
              style={{ border: "1px solid rgba(240,197,90,0.35)", background: "rgba(12,7,24,0.6)" }}
            >
              {h.label}
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/tarot"
            className="inline-block rounded-full px-4 py-2 text-[13.5px] font-semibold transition hover:brightness-110"
            style={{ border: "1px solid rgba(240,197,90,0.6)", color: GOLD, background: "rgba(12,7,24,0.6)" }}
          >
            Tarot online personalizado
          </Link>
        </li>
      </ul>
    </section>
  );
}

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
      <article className="relative px-5 pt-8 md:pt-12 pb-14 mx-auto w-full max-w-[760px]" style={{ fontVariantNumeric: "lining-nums" }}>
        <Migas clave={clave} />
        {children}
      </article>
      <OtrasConsultas clave={clave} />
      <EnlacesTarotPie className="pb-5" />
      <p className="relative px-5 pb-10 mx-auto max-w-[560px] text-center text-[11.5px] leading-relaxed text-white/45">
        © {new Date().getFullYear()} Tu Oráculo · Operado por Luis Manuel Benítez Rodríguez · RUT 214998320016 · Uruguay. Todos los derechos reservados.
      </p>
    </PaginaMarca>
  );
}
