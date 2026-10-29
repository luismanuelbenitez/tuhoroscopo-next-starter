"use client";

import { ChevronRight } from "lucide-react";
import { GOLD } from "@/components/home/theme";
import { IconoConFallback } from "@/components/home/IconoConFallback";

// Los 4 pasos reales del producto (no "tu experiencia" genérico). Nunca
// decir que el usuario elige las cartas: se sortean ("aparecen para vos").
const PASOS = [
  { n: "1", icon: "/img/home/como_funciona/b4_elegi_experiencia.webp", t: "Elegís el tema", d: "Amor, trabajo, dinero, una decisión… y si querés, escribís tu consulta." },
  { n: "2", icon: "/img/home/como_funciona/b4_datos_pago.webp", t: "Pagás con Mercado Pago", d: "Pago único, simple y seguro. Sin suscripción." },
  { n: "3", icon: "/img/home/como_funciona/b4_whatsapp_experiencia.webp", t: "Cinco cartas aparecen para vos", d: "Tu lectura llega por WhatsApp en minutos." },
  { n: "4", icon: "/img/home/como_funciona/b4_experiencia_movil.webp", t: "La leés, la escuchás y la guardás", d: "Online, con resumen en audio y tu PDF." },
];

export function ComoFuncionaV2() {
  return (
    <section id="como-funciona" className="relative px-5 md:px-8 py-14 max-w-[960px] mx-auto scroll-mt-16">
      <div className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
          Simple, rápido y desde tu celular
        </p>
        <h2 className="text-2xl md:text-3xl font-extrabold mb-3">¿Cómo funciona?</h2>
        <p className="text-white/70 text-[14px] mb-10 max-w-md mx-auto">
          De tu consulta a tu lectura, en cuatro pasos.
        </p>
      </div>

      {/* Desktop: 4 columnas con flecha entre pasos */}
      <div className="hidden md:flex items-start text-center">
        {PASOS.map((p, i) => (
          <div key={p.n} className="flex items-start flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <IconoConFallback src={p.icon} size={56} className="mx-auto mb-3" />
              <p className="text-[11px] font-bold mb-1" style={{ color: GOLD }}>{p.n}</p>
              <p className="text-[15px] font-semibold mb-1.5 px-2">{p.t}</p>
              <p className="text-[13px] text-white/70 leading-snug px-2">{p.d}</p>
            </div>
            {i < PASOS.length - 1 && (
              <ChevronRight size={18} style={{ color: "rgba(240,197,90,0.45)", margin: "20px 8px 0", flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>

      {/* Mobile: lista vertical (los 4 pasos a la vista, sin deslizar) */}
      <ol className="md:hidden flex flex-col gap-3 max-w-[440px] mx-auto">
        {PASOS.map((p) => (
          <li
            key={p.n}
            className="flex items-center gap-4 rounded-2xl px-4 py-3.5"
            style={{ background: "rgba(10,6,22,0.72)", border: "1px solid rgba(240,197,90,0.22)" }}
          >
            <IconoConFallback src={p.icon} size={44} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug">
                <span style={{ color: GOLD }}>{p.n}.</span> {p.t}
              </p>
              <p className="text-[13px] text-white/70 leading-snug mt-0.5">{p.d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
