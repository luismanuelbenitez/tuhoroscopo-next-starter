"use client";

import { useState, type CSSProperties } from "react";
import { urlCarta } from "@/lib/imagen";

// Imagen de una carta de la lectura pedida al optimizador al tamaño en
// pantalla (auditoría UX 2026-10-30, L1). Si la versión optimizada falla por
// cualquier motivo, vuelve a la URL original: la carta nunca queda en blanco.
export function ImgCarta({ src, ancho, alt, className, style, lazy = false }: {
  src: string; ancho: 96 | 256 | 384; alt: string; className?: string; style?: CSSProperties; lazy?: boolean;
}) {
  const optimizada = urlCarta(src, ancho);
  const [actual, setActual] = useState(optimizada);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={actual}
      alt={alt}
      loading={lazy ? "lazy" : undefined}
      decoding="async"
      className={className}
      style={style}
      onError={() => { if (actual !== src) setActual(src); }}
    />
  );
}
