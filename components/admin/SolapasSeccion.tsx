"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { seccionActual, solapaActual } from "@/components/admin/seccionesAdmin";

// Solapas de la sección actual del Admin Tarot (2026-11-16). Van arriba de
// cada página: TarotAdminShell las pone solas; los módulos con barra lateral
// propia (Clientes, Product Intelligence) las agregan en su layout.
export function SolapasSeccion({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname() ?? "";
  const seccion = seccionActual(pathname);
  const actual = solapaActual(pathname);
  if (!seccion) return null;
  return (
    <div className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
      <div className="flex items-center gap-1 overflow-x-auto px-3 sm:px-5 [scrollbar-width:none]">
        <span className="mr-2 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-600">{seccion.label}</span>
        {seccion.solapas.map((s) => {
          const activa = actual?.href === s.href;
          const n = badges[s.href] ?? 0;
          return (
            <Link key={s.href} href={s.href as Route<string>}
              className={`flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[14px] transition-colors ${activa ? "border-amber-500 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
              {s.label}
              {n > 0 && <span className={`rounded-full px-1.5 text-[11px] font-bold leading-5 text-gray-950 ${s.href.endsWith("/whatsapp") ? "bg-emerald-500" : "bg-amber-500"}`}>{n > 99 ? "99+" : n}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
