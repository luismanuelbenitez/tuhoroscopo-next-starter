import { fijo } from "@/lib/imagen";

// Logo oficial de Mercado Pago a color (2026-11-11, Manuel). Sobre los fondos
// oscuros de la web las letras azul oscuro no se leen: va en una pastilla
// blanca, que además es como lo reconoce la gente en otros sitios.
// PNG recortado 381×96 (proporción ≈ 3,97).
const SRC = "/img/tarot/generales/mercado-pago-color-horizontal.png";

export function LogoMercadoPago({ alto = 18 }: { alto?: number }) {
  const ancho = Math.round(alto * 3.97);
  return (
    <span className="inline-flex items-center rounded-md bg-white px-1.5 py-1 shadow-[0_1px_6px_rgba(0,0,0,0.45)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...fijo(SRC, ancho, alto)} width={ancho} height={alto} alt="Mercado Pago" style={{ height: alto, width: "auto" }} />
    </span>
  );
}
