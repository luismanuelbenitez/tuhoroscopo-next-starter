import type { CSSProperties, ReactNode } from "react";

// Piezas gráficas de la página de lectura (móvil primero). Todo el texto va en
// HTML; las imágenes (public/img/lectura/) son solo decoración estirable.
// Ver docs/product/lectura-piezas-graficas.md para las especificaciones.

export const IMG = "/img/lectura";
export const INK = "#291408"; // tinta sobre pergamino — igual que el PDF
export const GOLD = "#F0C55A";

// Fondo de toda la página: terciopelo repetible + halo dorado superior.
export const FONDO_TERCIOPELO: CSSProperties = {
  backgroundColor: "#140a24",
  backgroundImage: `url(${IMG}/fondo-terciopelo.webp)`,
  backgroundSize: "256px 256px",
  backgroundRepeat: "repeat",
};

// Marco dorado 9-slice (panel-marco.png 192×192, esquinas de 48px).
// `grosor` = ancho visible del borde en px CSS.
function marco9(grosor: number): CSSProperties {
  return {
    borderStyle: "solid",
    borderWidth: grosor,
    borderImageSource: `url(${IMG}/panel-marco.png)`,
    borderImageSlice: 48,
    borderImageWidth: `${grosor}px`,
    borderImageRepeat: "stretch",
  };
}

/** Panel de texto sobre pergamino claro, con marco dorado (Resumen / Mensaje). */
export function PanelPergamino({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        ...marco9(18),
        backgroundImage: `url(${IMG}/pergamino-fondo.webp)`,
        backgroundSize: "320px 320px",
        backgroundColor: "#eddcae",
        color: INK,
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Placa de título (placa-titulo.png 288×108): extremos fijos ornamentados y
 * centro estirable (3-slice). Vacía en el arte; el texto va en HTML.
 */
export function PlacaTitulo({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex justify-center ${className}`}>
      <h2
        className="text-center font-semibold uppercase"
        style={{
          borderStyle: "solid",
          borderWidth: "16px 30px",
          borderImageSource: `url(${IMG}/placa-titulo.png)`,
          borderImageSlice: "40 76 fill",
          borderImageWidth: "16px 30px",
          borderImageRepeat: "stretch",
          color: "#F3DFA5",
          fontSize: 13,
          letterSpacing: "0.2em",
          lineHeight: 1.2,
          minWidth: 200,
          padding: "0 4px",
          fontFamily: "var(--font-serif-editorial), serif",
        }}
      >
        {children}
      </h2>
    </div>
  );
}

/** Divisor línea–rombo–línea (SVG). */
export function Divisor({ className = "" }: { className?: string }) {
  return (
    <div className={`flex justify-center py-5 ${className}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${IMG}/divisor.svg`} alt="" width={240} height={18} style={{ width: 240, height: "auto", opacity: 0.9 }} />
    </div>
  );
}

/** Carta con marco dorado; conserva la relación 2:3 del arte y rota si está invertida. */
export function CartaEnMarco({
  src, alt, invertida, eager,
}: { src: string | null; alt: string; invertida: boolean; eager: boolean }) {
  return (
    <div className="mx-auto" style={{ ...marco9(22), width: 256, background: "#0a0614", backgroundClip: "padding-box" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          width={200}
          height={300}
          loading={eager ? "eager" : "lazy"}
          className={invertida ? "rotate-180" : ""}
          style={{ display: "block", width: "100%", height: "auto", aspectRatio: "2 / 3", objectFit: "cover" }}
        />
      ) : (
        <div className="flex items-center justify-center text-xs" style={{ aspectRatio: "2 / 3", color: "#8b84a3" }}>
          {alt}
        </div>
      )}
    </div>
  );
}
