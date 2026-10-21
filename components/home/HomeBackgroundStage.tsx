"use client";

import type { ReactNode } from "react";
import { fluido } from "@/lib/imagen";

const DESKTOP = fluido("/img/home/general/fondo-home-desktop.webp", 793, 1983, "(max-width: 960px) 100vw, 960px");
const MOBILE = fluido("/img/home/general/fondo-home-mobile.webp", 463, 3392, "100vw", { prioridad: true });

// Escenario único que envuelve TODOS los bloques de la home (hasta antes
// del footer, que vive afuera). Ya no tiene alto fijo por aspect-ratio:
// el alto lo da el flujo normal de sus hijos (Header, Hero, Producto
// destacado, Experiencias, Cómo funciona, Confianza), y el/los fondo(s)
// son position:absolute con height:100% — se estiran para cubrir
// exactamente ese alto, sea cual sea.
//
// Dos <img> (mobile/desktop), cada uno generado a la medida real del
// contenido de su breakpoint (desktop 960×2376, mobile 390×2856) — por
// eso object-fit:cover no debería recortar nada visible en el ancho de
// referencia; en anchos intermedios (entre el breakpoint md y 960px) puede
// ajustar levemente, revisar si se nota.
//
// IMPORTANTE: cada hijo de este escenario necesita `position:relative`
// (o cualquier valor de position que no sea "static") — si no, el fondo
// (position:absolute) pinta ENCIMA del contenido en flujo normal sin
// importar el orden del HTML (regla de stacking de CSS: los elementos
// posicionados siempre pintan sobre los estáticos). Ya pasó una vez con
// el Bloque 3 — ver ese fix.
export function HomeBackgroundStage({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {/* Paquete SEO 2: <picture> en vez de dos <img> ocultos por CSS — el
          navegador descarga SOLO la variante de su breakpoint (antes bajaba
          las dos). La mobile es el LCP de la home en celular: prioridad. */}
      <picture>
        <source media="(min-width: 768px)" srcSet={DESKTOP.srcSet} sizes={DESKTOP.sizes} />
        <img
          {...MOBILE}
          alt=""
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      </picture>
      {/* Degradé suave, sin borde, solo para legibilidad del texto del Hero */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(6,4,14,0.46) 0%, rgba(6,4,14,0.22) 20%, rgba(6,4,14,0.06) 38%, transparent 50%)",
        }}
      />
      {children}
    </div>
  );
}
