"use client";
import { BrainCircuit } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Inteligencia comercial (2026-11-24): marco del módulo. Las solapas
// (Centro de control, Objetivos y economía y, en las fases 2 y 3,
// Recomendaciones, Experimentos y Aprendizaje) las pone el menú del admin
// (components/admin/seccionesAdmin.ts), como en las demás secciones.

export function MarcoInteligencia({ children, bajada, extra }: { children: React.ReactNode; bajada?: string; extra?: React.ReactNode }) {
  return (
    <TarotAdminShell>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 md:space-y-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400/90">Tu Oráculo · Uruguay · todos los canales</p>
            <h1 className="mt-0.5 flex items-center gap-2 text-xl font-bold tracking-tight text-white md:text-2xl"><BrainCircuit size={20} className="text-amber-400" /> Inteligencia comercial</h1>
            {bajada && <p className="mt-1 max-w-2xl text-[13px] text-gray-400">{bajada}</p>}
          </div>
          {extra}
        </div>
        {children}
      </div>
    </TarotAdminShell>
  );
}

// ── Formato (pesos uruguayos) ────────────────────────────────────────────────
export const pesos = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : `${v < 0 ? "−" : ""}$ ${Math.round(Math.abs(v)).toLocaleString("es-UY")}`;
export const entero = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("es-UY"));
export const veces = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2).replace(".", ",")}×`);
export const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0).replace(".", ",")} %` : "—");
export const fechaCorta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
