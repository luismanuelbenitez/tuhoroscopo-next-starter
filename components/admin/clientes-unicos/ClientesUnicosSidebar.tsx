"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useState } from "react";

// Mismo patrón visual/arquitectónico que PIASidebar
// (components/admin/product-intelligence/PIASidebar.tsx) — sidebar propio
// para un módulo autónomo dentro de Admin Tarot, sin anidar con
// TarotAdminShell. Ver docs/product/DECISIONS.md 2026-08-22.

const GRUPOS: { label: string; items: { href: string; icon: LucideIcon; label: string }[] }[] = [
  {
    label: "VISIÓN GENERAL",
    items: [
      { href: "/admin/tarot/clientes-unicos", icon: LayoutDashboard, label: "Visión general" },
    ],
  },
  {
    label: "CLIENTES",
    items: [
      { href: "/admin/tarot/clientes-unicos/lista", icon: Users, label: "Clientes" },
    ],
  },
];

export function ClientesUnicosSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  function isActive(href: string) {
    if (href === "/admin/tarot/clientes-unicos") return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={`${collapsed ? "w-14" : "w-60"} shrink-0 flex flex-col h-screen sticky top-0 bg-gray-950 border-r border-gray-800 overflow-y-auto transition-all duration-200`}
    >
      {!collapsed && (
        <div className="px-4 py-4 border-b border-gray-800/60">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Tu Oráculo</p>
          <p className="text-xs text-gray-500 mt-0.5">Clientes</p>
        </div>
      )}

      <nav className="flex-1 py-3 space-y-1">
        {GRUPOS.map((grupo) => (
          <div key={grupo.label}>
            {!collapsed && (
              <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {grupo.label}
              </p>
            )}
            {grupo.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <div key={item.href} className="px-2">
                  <Link href={item.href as Route<string>} title={collapsed ? item.label : undefined}>
                    <span className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left
                      ${active ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"}`}
                    >
                      <Icon size={15} className={`shrink-0 ${active ? "text-amber-400" : ""}`} />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-gray-800/60 p-2 space-y-1">
        <Link
          href="/admin/tarot"
          title={collapsed ? "Admin Tarot" : undefined}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-amber-500/70 hover:text-amber-300 hover:bg-gray-900 transition-colors"
        >
          <ChevronLeft size={13} className="shrink-0" />
          {!collapsed && "← Admin Tarot"}
        </Link>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-gray-700 hover:text-gray-400 hover:bg-gray-900 transition-colors"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          {!collapsed && "Colapsar"}
        </button>
      </div>
    </aside>
  );
}
