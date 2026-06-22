"use client";
import { useState, useEffect } from "react";

let fetchPromise: Promise<number> | null = null;

function fetchPrecio(fallback: number): Promise<number> {
  if (!fetchPromise) {
    fetchPromise = fetch("/api/precio-tarot")
      .then((r) => r.json())
      .then((d) => (typeof d.precio === "number" ? d.precio : fallback))
      .catch(() => fallback);
  }
  return fetchPromise;
}

export function usePrecioTarot(fallback = 590): number {
  const [precio, setPrecio] = useState(fallback);
  useEffect(() => {
    fetchPrecio(fallback).then(setPrecio);
  }, [fallback]);
  return precio;
}
