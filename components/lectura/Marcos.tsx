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

/** Panel oscuro con el mismo marco dorado (contenedor de la tira de cartas). */
export function PanelOscuro({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} style={{ ...marco9(18), backgroundColor: "rgba(10,6,20,0.62)" }}>
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
          borderWidth: "21px 34px",
          borderImageSource: `url(${IMG}/placa-titulo.png)`,
          borderImageSlice: "40 76 fill",
          borderImageWidth: "21px 34px",
          borderImageRepeat: "stretch",
          color: "#F3DFA5",
          fontSize: 15,
          letterSpacing: "0.14em",
          lineHeight: 1.2,
          minWidth: 220,
          maxWidth: "100%",
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

// Grosor visible del marco de carta en px CSS (la barra del PNG mide ~13px sobre
// slice 16 → barra ≈ GROSOR × 0.8). Ajustar aquí; no hace falta tocar la imagen.
const GROSOR_MARCO_CARTA = 5;

/**
 * Carta con marco dorado PEGADO al borde: el marco (marco-carta.png, 540×900)
 * es una capa superpuesta; la caja usa su misma proporción (0.6) y el arte
 * (2:3) se recorta con object-fit: cover ~5% por lado, oculto bajo el marco.
 */
export function CartaEnMarco({
  src, alt, invertida, eager,
}: { src: string | null; alt: string; invertida: boolean; eager: boolean }) {
  return (
    <div className="relative mx-auto" style={{ width: 280, aspectRatio: "540 / 900", background: "#0a0614" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          width={280}
          height={467}
          loading={eager ? "eager" : "lazy"}
          className={invertida ? "rotate-180" : ""}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: "#8b84a3" }}>
          {alt}
        </div>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          borderStyle: "solid",
          borderWidth: GROSOR_MARCO_CARTA,
          borderImageSource: `url(${IMG}/marco-carta.png)`,
          borderImageSlice: 16,
          borderImageWidth: `${GROSOR_MARCO_CARTA}px`,
          borderImageRepeat: "stretch",
        }}
      />
    </div>
  );
}
