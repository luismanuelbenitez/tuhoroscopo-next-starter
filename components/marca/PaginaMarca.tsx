"use client";

import type { ReactNode } from "react";
import { GlobalHomeStyles } from "@/components/home/GlobalHomeStyles";

// Estructura común de las páginas de marca (mismo esquema que Home y
// /tarot): estilos compartidos, header global del layout oculto, degradé
// de base y ancho maestro de 960px. El escenario (BackgroundStage) y el
// header propio van como children. `fuera` es para lo que debe vivir
// fuera del ancho maestro (ej: barras sticky a todo el ancho).
//
// Por ahora lo usa el checkout de Tarot; Home y /tarot se migran después
// (hoy repiten este mismo bloque a mano).
export function PaginaMarca({ children, fuera }: { children: ReactNode; fuera?: ReactNode }) {
  return (
    <>
      <GlobalHomeStyles />
      <style jsx global>{`
        body { background-image: none !important; background-color: #0b0818 !important; }
        body::before { display: none !important; }
        header { display: none !important; }
      `}</style>

      <div
        className="min-h-screen text-white"
        style={{ background: "linear-gradient(180deg, #120a28 0%, #0d0820 45%, #0b0818 100%)" }}
      >
        <div className="max-w-[960px] mx-auto">{children}</div>
      </div>

      {fuera}
    </>
  );
}
