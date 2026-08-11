"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Dna, Brain, MessageSquare, BarChart3,
  Lightbulb, BookOpen, TrendingUp, Settings, FlaskConical,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useState } from "react";

const GRUPOS = [
  {
    label: null,
    items: [
      { href: "/admin/tarot/product-intelligence", icon: LayoutDashboard, label: "Visión General" },
    ],
  },
  {
    label: "CONOCIMIENTO",
    items: [
      { href: "/admin/tarot/product-intelligence/dna", icon: Dna, label: "Product DNA" },
      { href: "/admin/tarot/product-intelligence/motor", icon: Brain, label: "Motor Narrativo" },
      { href: "/admin/tarot/product-intelligence/narrative-intelligence", icon: Lightbulb, label: "Narr. Intelligence" },
    ],
  },
  {
    label: "OPERACIÓN",
    items: [
      { href: "/admin/tarot/product-intelligence/prompt", icon: MessageSquare, label: "Prompt" },
      { href: "/admin/tarot/product-intelligence/benchmark", icon: BarChart3, label: "Benchmark" },
      { href: "/admin/tarot/product-intelligence/lecturas", icon: BookOpen, label: "Lecturas" },
      { href: "/admin/tarot/product-intelligence/laboratorio", icon: FlaskConical, label: "Laboratorio" },
    ],
  },
  {
    label: "SISTEMA",
    items: [
      { href: "/admin/tarot/product-intelligence/analytics", icon: TrendingUp, label: "Analytics" },
      { href: "/admin/tarot/product-intelligence/configuracion", icon: Settings, label: "Configuración" },
    ],
  },
] as const;

const ENABLED_ROUTES = new Set([
  "/admin/tarot/product-intelligence",
  "/admin/tarot/product-intelligence/analytics",
  "/admin/tarot/product-intelligence/configuracion",
  "/admin/tarot/product-intelligence/prompt",
  "/admin/tarot/product-intelligence/dna",
  "/admin/tarot/product-intelligence/motor",
  "/admin/tarot/product-intelligence/narrative-intelligence",
  "/admin/tarot/product-intelligence/benchmark",
  "/admin/tarot/product-intelligence/lecturas",
  "/admin/tarot/product-intelligence/laboratorio",
]);

export function PIASidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  function isActive(href: string) {
    if (href === "/admin/tarot/product-intelligence") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={`${collapsed ? "w-14" : "w-60"} shrink-0 flex flex-col h-screen sticky top-0 bg-gray-950 border-r border-gray-800 overflow-y-auto transition-all duration-200`}
    >
      {/* Header */}
      {!collapsed && (
        <div className="px-4 py-4 border-b border-gray-800/60">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Tu Oráculo</p>
          <p className="text-xs text-gray-500 mt-0.5">Product Intelligence</p>
        </div>
      )}

      {/* Nav groups */}
      <nav className="flex-1 py-3 space-y-1">
        {GRUPOS.map((grupo) => (
          <div key={grupo.label ?? "__top"}>
            {grupo.label && !collapsed && (
              <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {grupo.label}
              </p>
            )}
            {grupo.items.map((item) => {
              const active = isActive(item.href);
              const enabled = ENABLED_ROUTES.has(item.href);
              const Icon = item.icon;

              const content = (
                <span className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left
                  ${active
                    ? "bg-gray-800 text-white"
                    : enabled
                      ? "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                      : "text-gray-600 cursor-not-allowed"
                  }`}
                >
                  <Icon size={15} className={`shrink-0 ${active ? "text-amber-400" : ""}`} />
                  {!collapsed && (
                    <span className="flex-1 truncate">{item.label}</span>
                  )}
                </span>
              );

              return (
                <div key={item.href} className="px-2">
                  {enabled ? (
                    <Link href={item.href as Route<string>} title={collapsed ? item.label : undefined}>
                      {content}
                    </Link>
                  ) : (
                    <div title={collapsed ? item.label : undefined}>
                      {content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: volver al admin + collapse */}
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
