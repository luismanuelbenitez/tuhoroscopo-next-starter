import Link from "next/link";
import type { Route } from "next";
import { Heart, Briefcase, Compass } from "lucide-react";
import { GOLD, SERIF, CREMA } from "@/components/home/theme";

// Enlazado interno de /tarot hacia las páginas por intención (2026-10-21,
// Paquete SEO 1). /tarot es la página dueña de "tarot online personalizado"
// y el hub: este bloque reparte autoridad hacia las consultas por tema y
// orienta a quien llega con una duda concreta. Estética de la propia landing
// (paneles con filete dorado, Cormorant); sin imágenes (cero peso extra).
//
// 2026-11-01: la acción principal de cada tarjeta lleva al checkout con el
// tema ya elegido (?tema=); antes mandaba a la página del tema y sacaba del
// camino de compra a quien venía de un anuncio. La página del tema sigue
// enlazada con un link chico (enlazado interno para SEO).
const TEMAS = [
  { href: "/tarot/amor", tema: "amor", Icon: Heart, t: "Amor y vínculos", d: "Una relación, alguien que empieza o algo que terminó." },
  { href: "/tarot/trabajo-y-dinero", tema: "trabajo", Icon: Briefcase, t: "Trabajo y dinero", d: "Un cambio laboral, un proyecto o tu relación con la plata." },
  { href: "/tarot/decisiones", tema: "decision", Icon: Compass, t: "Una decisión", d: "Cuando tenés que elegir y no terminás de decidirte." },
];

export function LecturasPorTema() {
  return (
    <section aria-labelledby="lecturas-por-tema" className="relative px-5 md:px-8 py-10 md:py-12 max-w-[860px] mx-auto text-center">
      <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Tu lectura, para tu consulta</p>
      <h2
        id="lecturas-por-tema"
        className="mb-3"
        style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(1.7rem, 4vw, 2.3rem)", lineHeight: 1.2, color: CREMA }}
      >
        Lecturas según lo que te preocupa
      </h2>
      <p className="text-white/60 text-[14px] mb-7 max-w-[520px] mx-auto">
        La misma lectura de 5 cartas, enfocada en el tema que elijas.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {TEMAS.map(({ href, tema, Icon, t, d }) => (
          <div
            key={href}
            className="rounded-2xl px-5 py-5 text-left flex flex-col"
            style={{ background: "rgba(12,7,24,0.72)", border: "1px solid rgba(240,197,90,0.32)" }}
          >
            <span className="flex items-center gap-2.5 mb-1.5">
              <Icon size={17} aria-hidden="true" style={{ color: GOLD }} />
              <span className="font-semibold text-[15.5px]" style={{ color: CREMA }}>{t}</span>
            </span>
            <span className="block text-white/60 text-[13.5px] leading-snug">{d}</span>
            <span className="mt-auto pt-3.5 flex items-center justify-between gap-3 flex-wrap">
              <Link
                href={`/tarot/checkout?tema=${tema}` as Route<string>}
                className="inline-flex items-center rounded-full px-4 min-h-[40px] text-[13.5px] font-semibold transition hover:bg-[#F0C55A]/15"
                style={{ color: GOLD, border: "1px solid rgba(240,197,90,0.55)" }}
              >
                Quiero esta lectura →
              </Link>
              <Link
                href={href as Route<string>}
                className="py-2 text-[12.5px] text-white/50 underline underline-offset-2 decoration-white/25 hover:text-white/80"
              >
                Ver más
              </Link>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-[13.5px] text-white/55">
        ¿Querés ver en detalle qué recibís?{" "}
        <Link href={"/tarot/lectura-personalizada" as Route<string>} className="underline underline-offset-2 hover:text-white/85" style={{ color: "rgba(240,197,90,0.9)" }}>
          Qué incluye una lectura personalizada
        </Link>
        {" · "}
        <Link href={"/tarot/online-uruguay" as Route<string>} className="underline underline-offset-2 hover:text-white/85" style={{ color: "rgba(240,197,90,0.9)" }}>
          Tarot online en Uruguay
        </Link>
      </p>
    </section>
  );
}
