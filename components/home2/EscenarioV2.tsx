import type { ReactNode } from "react";
import { fluido } from "@/lib/imagen";

const DESKTOP = fluido("/img/home/general/fondo-home-desktop.webp", 793, 1983, "(max-width: 960px) 100vw, 960px");
const MOBILE = fluido("/img/home/general/fondo-home-mobile.webp", 463, 3392, "100vw", { prioridad: true });

// A diferencia de HomeBackgroundStage (que estira el fondo a todo el alto
// con object-fit: cover), acá el fondo va con su proporción natural, pegado
// arriba, y se funde a oscuro al final: la v2 es más larga y con cover el
// recorte se comía la escena de la portada (velas, libros, carta).
export function EscenarioV2({ children }: { children: ReactNode }) {
  const fundido = "linear-gradient(180deg, #000 0%, #000 82%, transparent 100%)";
  return (
    <div className="relative">
      <picture>
        <source media="(min-width: 768px)" srcSet={DESKTOP.srcSet} sizes={DESKTOP.sizes} />
        <img
          {...MOBILE}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "auto",
            maskImage: fundido, WebkitMaskImage: fundido,
          }}
        />
      </picture>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(6,4,14,0.46) 0%, rgba(6,4,14,0.22) 8%, rgba(6,4,14,0.06) 15%, transparent 20%)",
        }}
      />
      {children}
    </div>
  );
}
