"use client";
import { useCallback, useEffect, useState } from "react";
import type { Hallazgo, Kpis } from "@/lib/gobernanzaAds/tipos";
import type { Propuesta, TareaManual } from "@/lib/gobernanzaAds/propuestas";

// Datos del módulo de gobernanza (2026-11-14): lo que devuelve
// /api/admin/tarot/google-ads/gobernanza, compartido por Resumen y Diagnóstico.

export interface DatosGobernanza {
  ok: true;
  dias: number;
  moneda: { cuenta: string; venta: string; tipo_cambio: number };
  config: { cpa_objetivo: number; valor_venta: number; minimos: Record<string, number> };
  campanas: { id: string; nombre: string; estado: string; presupuesto_total: number | null; presupuesto_diario: number | null; gastado_total: number; fin: string | null }[];
  salud: { puntaje: number; estado: "bien" | "mejorable" | "mal" };
  kpis: Kpis;
  hallazgos: Hallazgo[];
  alertas: Hallazgo[];
  revision: { esperar: boolean; hasta: string | null; motivo: string };
  propuestas: Propuesta[];
  manuales: TareaManual[];
}

export function useGobernanza(dias: number) {
  const [d, setD] = useState<DatosGobernanza | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch(`/api/admin/tarot/google-ads/gobernanza?dias=${dias}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.motivo === "cuenta_sin_leer" ? "La cuenta de Google Ads todavía no se leyó." : j.detalle ?? j.motivo ?? "error");
      setD(j as DatosGobernanza);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); } finally { setCargando(false); }
  }, [dias]);
  useEffect(() => { cargar(); }, [cargar]);
  return { d, error, cargando, cargar };
}

export const plata = (n: number, moneda: string) =>
  moneda === "USD" ? `US$ ${n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : moneda === "UYU" ? `$ ${Math.round(n).toLocaleString("es-UY")}`
  : `${moneda} ${n.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`;

export const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: "America/Montevideo" });
