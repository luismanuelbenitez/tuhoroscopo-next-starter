"use client";
import { useState, useEffect } from "react";

// Module-level cache: a single pending fetch shared across all components on the page
let fetchPromise: Promise<number> | null = null;

function fetchPrecio(fallback: number): Promise<number> {
  if (!fetchPromise) {
    fetchPromise = fetch("/api/precio-suscripcion")
      .then((r) => r.json())
      .then((d) => (typeof d.precio === "number" ? d.precio : fallback))
      .catch(() => fallback);
  }
  return fetchPromise;
}

export function usePrecioSuscripcion(fallback = 390): number {
  const [precio, setPrecio] = useState(fallback);
  useEffect(() => {
    fetchPrecio(fallback).then(setPrecio);
  }, [fallback]);
  return precio;
}
