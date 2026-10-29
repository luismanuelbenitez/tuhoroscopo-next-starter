"use client";

import { IconoConFallback } from "./IconoConFallback";

// b5_*.webp: mismos badges circulares autocontenidos que b4_*.webp (fondo
// + anillo dorado incluido). Carpeta real: public/img/home/bloque_final/.
const ITEMS = [
  { icon: "b5_disponible_uruguay.webp", t: "Disponible en Uruguay", d: "Pensado para vos, estés donde estés en el país." },
  { icon: "b5_pago_seguro.webp", t: "Pago seguro", d: "Procesado por Mercado Pago." },
  { icon: "b5_entrega_rapida.webp", t: "Entrega rápida", d: "Tu experiencia llega en minutos, no en días." },
  { icon: "b5_experiencia_movil.webp", t: "Pensada para tu celular", d: "Una experiencia digital, simple y a tu ritmo." },
];

function ItemConfianza({ icon, t, d, fullWidth }: (typeof ITEMS)[number] & { fullWidth?: boolean }) {
  return (
    <div className="text-center px-3 md:px-5" style={fullWidth ? undefined : { width: "min(84vw, 300px)" }}>
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
// Mobile: grilla 2×2 dentro de la misma card, así se ven las 4 garantías
// juntas (un carrusel escondía 3 de 4).
export function BloqueConfianza() {
  return (
    <section className="relative px-5 md:px-8 pb-16 md:pb-20 max-w-[960px] mx-auto">
      <div
        className="hidden md:flex rounded-3xl py-8"
        style={{ background: CARD_BG, border: "1px solid rgba(240,197,90,0.28)" }}
      >
        {ITEMS.map((item, i) => (
          <div key={item.t} className="flex-1 min-w-0 flex items-center justify-center" style={{ borderLeft: i > 0 ? "1px solid rgba(205,165,90,0.22)" : "none" }}>
            <ItemConfianza {...item} fullWidth />
          </div>
        ))}
      </div>

      <div
        className="md:hidden grid grid-cols-2 gap-y-7 rounded-2xl py-7"
        style={{ background: CARD_BG, border: "1px solid rgba(240,197,90,0.28)" }}
      >
        {ITEMS.map(item => (
          <ItemConfianza key={item.t} {...item} fullWidth />
        ))}
      </div>
    </section>
  );
}
