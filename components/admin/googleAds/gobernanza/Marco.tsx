"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Marco del módulo de gobernanza de Google Ads (2026-11-14): título y
// pestañas. Junta lo que antes era una sola página larga y suma Resumen,
// Diagnóstico, Cambios (con botón Aplicar, fase 2) e Historial.

const BASE = "/admin/tarot/google-ads";
const PESTANAS = [
  { href: BASE, label: "Resumen" },
  { href: `${BASE}/diagnostico`, label: "Diagnóstico" },
  { href: `${BASE}/cambios`, label: "Cambios" },
  { href: `${BASE}/palabras`, label: "Palabras y búsquedas" },
  { href: `${BASE}/ranking`, label: "Ranking y calidad" },
  { href: `${BASE}/embudo`, label: "Página y embudo" },
  { href: `${BASE}/historial`, label: "Historial" },
  { href: `${BASE}/ajustes`, label: "Ajustes" },
];

export function MarcoGoogleAds({ children, bajada, extra }: { children: React.ReactNode; bajada?: string; extra?: React.ReactNode }) {
  const pathname = usePathname();
  // En el celular las pestañas se desplazan: la activa tiene que quedar a la vista.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current; const activa = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && activa) nav.scrollLeft = activa.offsetLeft - (nav.clientWidth - activa.offsetWidth) / 2;
  }, [pathname]);
  return (
    <TarotAdminShell>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 md:space-y-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">Gobernanza de anuncios</p>
            <h1 className="mt-0.5 flex items-center gap-2 text-xl font-bold tracking-tight text-white md:text-2xl"><Search size={20} className="text-sky-300" /> Google Ads</h1>
            {bajada && <p className="mt-1 max-w-2xl text-[13px] text-gray-400">{bajada}</p>}
          </div>
          {extra}
        </div>
        <nav ref={navRef} aria-label="Secciones de Google Ads" className="relative -mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
          <ul className="flex min-w-max gap-1 border-b border-gray-800">
            {PESTANAS.map((p) => {
              const activa = p.href === BASE ? pathname === BASE : pathname === p.href || pathname.startsWith(`${p.href}/`);
              return (
                <li key={p.href}>
                  <Link href={p.href as Route<string>} aria-current={activa ? "page" : undefined}
                    className={`block whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${activa ? "border-sky-400 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
                    {p.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {children}
      </div>
    </TarotAdminShell>
  );
}

export function SelectorDias({ dias, setDias, opciones = [7, 14, 30] }: { dias: number; setDias: (n: number) => void; opciones?: number[] }) {
  return (
    <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período"
      className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-2 text-sm text-white">
      {opciones.map((n) => <option key={n} value={n}>Últimos {n} días</option>)}
    </select>
  );
}
