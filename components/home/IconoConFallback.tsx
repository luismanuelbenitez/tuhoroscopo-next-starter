"use client";

import { useEffect, useRef, useState } from "react";
import { fijo } from "@/lib/imagen";

// <img onError> solo no alcanza acá: si la imagen falla muy rápido (un
// 404, por ejemplo), el evento "error" del navegador puede dispararse
// antes de que React termine de hidratar y conectar el listener —
// desajuste clásico de SSR. Este componente chequea el estado real del
// <img> después del montaje (complete + naturalWidth) además de escuchar
// el evento, así que cubre los dos casos.
export function IconoConFallback({
  src, size, className,
}: { src: string; size: number; className?: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [falló, setFalló] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFalló(true);
  }, [src]);

  if (falló) return <div style={{ width: size, height: size }} className={className} />;

  return (
    <img
      ref={ref}
      // Paquete SEO 2: archivos de 1024 px → se pintan a 48–56 px
      {...fijo(src, size)}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
      onError={() => setFalló(true)}
    />
  );
}
