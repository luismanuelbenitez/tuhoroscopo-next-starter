"use client";
import { useEffect, useState } from "react";

// Inteligencia comercial · utilidades de gráficos (Level Up, 2026-11-25).
// Los gráficos se dibujan al ancho real del contenedor (no se escalan con
// viewBox): así el texto mantiene su tamaño en el celular y en el escritorio.

/** Ancho del contenedor. Usa una ref de función: funciona aunque el
 *  contenedor aparezca después (por ejemplo, al volver de la vista de tabla). */
export function useAncho<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    if (!el) return;
    const medir = () => setAncho(Math.round(el.getBoundingClientRect().width));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref: setEl, ancho };
}

/** Marcas "redondas" para un eje que va de 0 a `max`. */
export function marcasEje(max: number, cantidad = 4): number[] {
  if (max <= 0) return [0];
  const paso0 = max / cantidad;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= paso0) ?? paso0;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += paso) out.push(Math.round(v * 100) / 100);
  return out;
}

/** Colores de los gráficos (validados para fondo oscuro; los textos usan grises, no el color de la serie). */
export const COLOR = {
  observado: "#38bdf8",   // sky-400: dato observado
  referencia: "#9ca3af",  // gray-400: referencia económica
  objetivo: "#34d399",    // emerald-400: objetivo
  perdida: "#fb7185",     // rose-400
  barra: "#64748b",       // slate-500: volumen neutro
  ia: "#a78bfa",          // violet-400: experimentos
  grilla: "rgba(255,255,255,0.06)",
  eje: "rgba(255,255,255,0.12)",
  texto: "#9ca3af",
  textoFuerte: "#e5e7eb",
  superficie: "#0b0f17",
};
