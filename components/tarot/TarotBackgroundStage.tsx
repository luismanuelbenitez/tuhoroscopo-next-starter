"use client";

import type { ReactNode } from "react";

// A diferencia de HomeBackgroundStage, acá el fondo NO se estira a todo el
// alto del escenario: cada imagen se apoya a su tamaño natural (ancho 100%,
// alto automático según su propia proporción) — dos imágenes apiladas, una
// debajo de la otra (flex column, sin cálculo manual de "top"), y si el
// contenido sigue más abajo que las dos, debajo queda el fondo plano del
// body (ver TarotLandingContent), no una imagen recortada/deformada.
//
// Todavía no hay variante mobile específica — se usan las mismas dos
// imágenes desktop también en mobile hasta que exista una.
//
// IMPORTANTE: cada hijo de este escenario necesita `position:relative` (o
// cualquier position distinto de "static") — si no, el fondo
// (position:absolute) pinta ENCIMA del contenido en flujo normal sin
// importar el orden del HTML. Mismo bug ya documentado en HomeBackgroundStage.
const FONDOS = [
  "/img/tarot/generales/tarot-fondo-desktop.webp",
  "/img/tarot/generales/tarot-fondo-desktop2.webp",
];

// `fondos` permite que otra página del túnel (ej: checkout, más corta que
// la landing) use solo una de las imágenes; por defecto, las dos de /tarot.
export function TarotBackgroundStage({ children, fondos = FONDOS }: { children: ReactNode; fondos?: string[] }) {
  return (
    // overflow-hidden: si las imágenes apiladas suman más alto que el
    // contenido real (position:absolute, no empujan el alto del escenario),
    // esto recorta la cola sobrante en vez de dejarla "colgando" después
    // del escenario — pudo verse en el footer mientras no tenían overflow.
    <div className="relative overflow-hidden">
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", display: "flex", flexDirection: "column" }}>
        {fondos.map((src) => (
          <img key={src} src={src} alt="" aria-hidden="true" style={{ width: "100%", height: "auto", display: "block" }} />
        ))}
      </div>
      {/* Degradé suave para legibilidad del texto del Hero, mismo recurso que Home */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          height: 600,
          background: "linear-gradient(180deg, rgba(6,4,14,0.46) 0%, rgba(6,4,14,0.22) 20%, rgba(6,4,14,0.06) 38%, transparent 50%)",
        }}
      />
      {children}
    </div>
  );
}
