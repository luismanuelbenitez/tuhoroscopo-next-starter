"use client";
import { useState, useEffect } from "react";

let fetchPromise: Promise<number | null> | null = null;

function fetchPrecio(): Promise<number | null> {
  if (!fetchPromise) {
    fetchPromise = fetch("/api/precio-tarot")
      .then((r) => r.json())
      .then((d) => (typeof d.precio === "number" ? d.precio : null))
      .catch(() => null);
  }
  return fetchPromise;
}

/**
 * Precio de Tu Tirada leído de la fuente canónica (tarot_configuracion.precio_base_uyu
 * vía /api/precio-tarot). Devuelve `null` mientras carga o si no pudo verificarse —
 * nunca un precio histórico hardcodeado. El caller debe manejar el estado `null`
 * en la UI (loading / no disponible), nunca asumir un número por defecto.
 */
export function usePrecioTarot(): number | null {
  const [precio, setPrecio] = useState<number | null>(null);
  useEffect(() => {
    fetchPrecio().then(setPrecio);
  }, []);
  return precio;
}
