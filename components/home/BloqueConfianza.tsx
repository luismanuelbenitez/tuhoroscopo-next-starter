"use client";

import { Carousel } from "./Carousel";
import { IconoConFallback } from "./IconoConFallback";

// b5_*.webp: mismos badges circulares autocontenidos que b4_*.webp (fondo
// + anillo dorado incluido). Carpeta real: public/img/home/bloque_final/.
const ITEMS = [
  { icon: "b5_disponible_uruguay.webp", t: "Disponible en Uruguay", d: "Pensado para vos, estés donde estés en el país." },
  { icon: "b5_pago_seguro.webp", t: "Pago seguro", d: "Procesado con Mercado Pago, 100% protegido." },
  { icon: "b5_entrega_rapida.webp", t: "Entrega rápida", d: "Tu experiencia llega en minutos, no en días." },
  { icon: "b5_experiencia_movil.webp", t: "Pensada para tu celular", d: "Una experiencia digital, simple y a tu ritmo." },
];

function ItemConfianza({ icon, t, d }: (typeof ITEMS)[number]) {
  return (
    <div className="text-center px-5" style={{ width: "min(84vw, 300px)" }}>
      <IconoConFallback src={`/img/home/bloque_final/${icon}`} size={48} className="mx-auto mb-3" />
      <p className="text-sm font-semibold mb-1">{t}</p>
      <p className="text-[12px] text-white/45 leading-snug">{d}</p>
    </div>
  );
}

// Fondo oscuro degradado (no un color plano): le da profundidad a la card
// contra el fondo de la escena, en vez de quedar casi transparente.
const CARD_BG = "linear-gradient(160deg, rgba(8,5,16,0.55) 0%, rgba(8,5,16,0.20) 100%)";

// Desktop: una sola card con borde dorado conteniendo las 4 columnas,
// separadas por divisores verticales sutiles (mismo recurso que Bloque 2).
// Mobile: carrusel con swipe — las columnas comprimidas no entran cómodas.
export function BloqueConfianza() {
  return (
    <section className="relative px-5 md:px-8 pb-16 md:pb-20 max-w-[960px] mx-auto">
      <div
        className="hidden md:flex rounded-3xl py-8"
        style={{ background: CARD_BG, border: "1px solid rgba(240,197,90,0.28)" }}
      >
        {ITEMS.map((item, i) => (
          <div key={item.t} className="flex-1 flex items-center justify-center" style={{ borderLeft: i > 0 ? "1px solid rgba(205,165,90,0.22)" : "none" }}>
            <ItemConfianza {...item} />
          </div>
        ))}
      </div>

      <div className="md:hidden">
        <Carousel showArrows={false}>
          {ITEMS.map(item => (
            <div
              key={item.t}
              className="rounded-2xl py-8"
              style={{ background: CARD_BG, border: "1px solid rgba(240,197,90,0.28)" }}
            >
              <ItemConfianza {...item} />
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
