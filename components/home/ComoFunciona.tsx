"use client";

import { ChevronRight } from "lucide-react";
import { GOLD } from "./theme";
import { Carousel } from "./Carousel";
import { IconoConFallback } from "./IconoConFallback";

// Los b4_*.webp ya son badges circulares completos (fondo + anillo
// dorado incluido) — se usan directo como el círculo, sin wrapper extra.
const PASOS = [
  { n: "1", icon: "/img/home/como_funciona/b4_elegi_experiencia.webp", t: "Elegís tu experiencia", d: "Tarot, y pronto más formas de acompañarte." },
  { n: "2", icon: "/img/home/como_funciona/b4_datos_pago.webp", t: "Completás tus datos y realizás el pago", d: "De forma simple y segura, en minutos." },
  { n: "3", icon: "/img/home/como_funciona/b4_whatsapp_experiencia.webp", t: "Recibís tu experiencia por WhatsApp", d: "Directo a tu celular, sin vueltas." },
  { n: "4", icon: "/img/home/como_funciona/b4_experiencia_movil.webp", t: "Vivís la experiencia desde tu celular", d: "A tu ritmo, cuando quieras volver a leerla." },
];

function PasoCard({ n, icon, t, d, fullWidth }: (typeof PASOS)[number] & { fullWidth?: boolean }) {
  return (
    <div className="text-center" style={fullWidth ? undefined : { width: "min(80vw, 240px)" }}>
      <IconoConFallback src={icon} size={56} className="mx-auto mb-3" />
      <p className="text-[11px] font-bold mb-1" style={{ color: GOLD }}>{n}</p>
      <p className="text-sm font-semibold mb-1.5 px-2">{t}</p>
      <p className="text-[12px] text-white/45 leading-snug px-2">{d}</p>
    </div>
  );
}

// Mobile: carrusel/swipe, 1 paso por vez (4 columnas quedarían apretadas).
// Desktop: 4 columnas con flecha separadora entre pasos — cada card con
// flex-1 (no ancho fijo) para que las 4 + flechas siempre entren en el
// ancho del bloque, sin desbordar a los costados.
export function ComoFunciona() {
  return (
    <section id="como-funciona" className="relative px-5 md:px-8 py-14 max-w-[960px] mx-auto text-center scroll-mt-16">
      <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
        Simple, rápido y desde tu celular
      </p>
      <h2 className="text-2xl md:text-3xl font-extrabold mb-3">¿Cómo funciona?</h2>
      <p className="text-white/50 text-[13px] mb-10 max-w-md mx-auto">
        Cuatro pasos, de principio a fin, para vivir tu experiencia sin complicaciones.
      </p>

      <div className="hidden md:flex items-start">
        {PASOS.map((paso, i) => (
          <div key={paso.n} className="flex items-start flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <PasoCard {...paso} fullWidth />
            </div>
            {i < PASOS.length - 1 && (
              <ChevronRight size={18} style={{ color: "rgba(240,197,90,0.35)", margin: "20px 8px 0", flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>

      <div className="md:hidden">
        <Carousel showArrows={false}>
          {PASOS.map(paso => <PasoCard key={paso.n} {...paso} />)}
        </Carousel>
      </div>
    </section>
  );
}
