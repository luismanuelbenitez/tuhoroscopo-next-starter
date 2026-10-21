import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { GOLD, SERIF, CREMA, CTA_GRADIENT } from "@/components/home/theme";
import { PANEL_INSTITUCIONAL as PANEL } from "@/components/marca/PaginaInstitucional";
import { CardTestimonio } from "@/components/tarot/TestimoniosTarot";
import type { TestimonioTarot } from "@/lib/getTestimoniosTarot";

// Bloques de las páginas SEO de intención (2026-10-20). Piezas chicas y
// neutras: el CONTENIDO de cada página vive en su propio page.tsx (cada una
// resuelve una intención distinta — no es una plantilla con palabras
// cambiadas). Estética: la de las páginas institucionales.

export const CHECKOUT = "/tarot/checkout";
export const checkoutConTema = (tema?: string) => (tema ? `${CHECKOUT}?tema=${tema}` : CHECKOUT);

export function precioTexto(precioUYU: number | null) {
  return precioUYU !== null ? `$U ${precioUYU.toLocaleString("es-UY")}` : null;
}

/** Botón dorado de compra. `ubicacion` y `tema` alimentan seo_cta_click. */
export function CtaSeo({ href, ubicacion, tema, children, className = "" }: {
  href: string; ubicacion: string; tema?: string; children: ReactNode; className?: string;
}) {
  return (
    <Link
      href={href as Route<string>}
      data-seo-cta={ubicacion}
      data-tema={tema ?? ""}
      className={`inline-block rounded-xl text-center font-bold px-7 py-3.5 text-[15px] transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
      style={{ background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 4px 20px rgba(240,197,90,0.30)" }}
    >
      {children}
    </Link>
  );
}

// Misma sombra que el hero de /tarot: el texto del hero cae sobre la escena
// (velas, cristales) y en mobile pierde contraste sin ella.
const SOMBRA_HERO = "0 2px 14px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)";

export function HeroSeo({ eyebrow, titulo, children, cta }: { eyebrow: string; titulo: string; children: ReactNode; cta: ReactNode }) {
  return (
    // <div> y no <header>: PaginaMarca oculta todo <header> (el global del
    // layout) con CSS — un <header> acá desaparecería (pasó en /opinion).
    <div className="text-center mb-10 md:mb-12">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-3" style={{ color: GOLD, textShadow: SOMBRA_HERO }}>{eyebrow}</p>
      <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(34px, 6.4vw, 50px)", lineHeight: 1.08, color: CREMA, textShadow: SOMBRA_HERO }}>{titulo}</h1>
      <div
        className="mt-4 mx-auto max-w-[600px] text-[16px] md:text-[17px] text-white/90 leading-relaxed space-y-3 rounded-2xl px-1 py-1"
        style={{ textShadow: SOMBRA_HERO, background: "radial-gradient(ellipse at center, rgba(8,4,18,0.55) 0%, rgba(8,4,18,0.25) 60%, transparent 80%)" }}
      >
        {children}
      </div>
      <div className="mt-7">{cta}</div>
    </div>
  );
}

export function Seccion({ titulo, children, id }: { titulo: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-2xl px-5 md:px-7 py-6 md:py-7 mt-5" style={PANEL}>
      <h2 className="mb-3" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(22px, 3.6vw, 27px)", lineHeight: 1.2, color: CREMA }}>{titulo}</h2>
      <div className="text-white/75 text-[15.5px] leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export function Destacado({ children }: { children: ReactNode }) {
  return <strong className="font-semibold" style={{ color: CREMA }}>{children}</strong>;
}

/** Lista con viñeta dorada. */
export function Lista({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden="true" className="shrink-0 mt-[3px] text-[12px]" style={{ color: GOLD }}>✦</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

// Las 5 posiciones reales de la lectura (mismos nombres que /lectura y el
// PDF). Cada página pasa CÓMO se lee cada posición en su tema.
export const POSICIONES = ["Momento actual", "Desafío", "Lo que no ves", "Consejo", "Lo que viene"] as const;
const ROMANOS = ["I", "II", "III", "IV", "V"];

export function PosicionesTarot({ lecturas }: { lecturas: [string, string, string, string, string] }) {
  return (
    <ol className="space-y-3 mt-1">
      {POSICIONES.map((pos, i) => (
        <li key={pos} className="flex gap-3.5">
          <span
            aria-hidden="true"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold"
            style={{ fontFamily: SERIF, color: GOLD, border: "1px solid rgba(240,197,90,0.55)", background: "rgba(240,197,90,0.06)" }}
          >
            {ROMANOS[i]}
          </span>
          <span>
            <span className="block font-semibold" style={{ color: CREMA }}>{pos}</span>
            <span className="block text-white/72">{lecturas[i]}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Preguntas frecuentes de la página (contenido visible; sin schema FAQPage). */
export function FaqSeo({ titulo = "Preguntas frecuentes", items }: { titulo?: string; items: { q: string; a: ReactNode }[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-center mb-4" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(24px, 4vw, 30px)", color: CREMA }}>{titulo}</h2>
      <div className="space-y-2.5">
        {items.map((f) => (
          <details key={f.q} className="group rounded-xl px-5 py-4" style={PANEL}>
            <summary className="flex items-center justify-between gap-4 cursor-pointer text-[15.5px] font-semibold" style={{ color: CREMA }}>
              {f.q}
              <ChevronDown aria-hidden="true" size={18} className="shrink-0 transition-transform group-open:rotate-180" style={{ color: GOLD }} />
            </summary>
            <div className="mt-2.5 text-white/72 text-[15px] leading-relaxed">{f.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function TestimoniosSeo({ testimonios }: { testimonios: TestimonioTarot[] }) {
  if (testimonios.length === 0) return null;
  return (
    <section className="mt-10" aria-labelledby="testimonios-seo">
      <h2 id="testimonios-seo" className="text-center mb-5" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(24px, 4vw, 30px)", color: CREMA }}>
        Lo que cuentan quienes ya hicieron su lectura
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {testimonios.map((t) => (
          <div key={t.id} className="min-h-[220px]"><CardTestimonio opinion={t.opinion} puntuacion={t.puntuacion} nombre={t.nombre} ciudad={t.ciudad} /></div>
        ))}
      </div>
    </section>
  );
}

/** Cierre comercial: precio real (si está verificado), pago único y CTA. */
export function CierreSeo({ titulo, children, precioUYU, href, tema }: {
  titulo: string; children: ReactNode; precioUYU: number | null; href: string; tema?: string;
}) {
  const precio = precioTexto(precioUYU);
  return (
    <section className="mt-12 rounded-2xl px-6 py-8 md:py-10 text-center" style={{ ...PANEL, border: "1px solid rgba(240,197,90,0.45)" }}>
      <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(26px, 4.6vw, 34px)", lineHeight: 1.15, color: CREMA }}>{titulo}</h2>
      <div className="mt-3 mx-auto max-w-[520px] text-white/75 text-[15.5px] leading-relaxed">{children}</div>
      {precio && (
        <p className="mt-5 text-[15px] text-white/80">
          <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: GOLD }}>{precio}</span>
          <span className="ml-2">· pago único, sin suscripción</span>
        </p>
      )}
      <div className="mt-5">
        <CtaSeo href={href} ubicacion="cierre" tema={tema}>Quiero mi lectura →</CtaSeo>
      </div>
      <p className="mt-3 text-[12.5px] text-white/50">Pago seguro con Mercado Pago · Te llega por WhatsApp y, si querés, por email</p>
    </section>
  );
}

/** Aviso de transparencia (mismo espíritu que el cierre del PDF). */
export function NotaTransparencia() {
  return (
    <p className="mt-8 mx-auto max-w-[600px] text-center text-[12.5px] leading-relaxed text-white/50">
      La interpretación de tus cartas se genera con inteligencia artificial a partir de tu consulta. Es una lectura
      simbólica, con fines reflexivos y de entretenimiento: no predice el futuro ni sustituye asesoramiento
      profesional de ningún tipo.
    </p>
  );
}
