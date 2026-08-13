"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Smartphone,
  FileText,
  CreditCard,
  Tag,
  TrendingUp,
  ScrollText,
  Clock,
  Wand2,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  exact?: boolean;
}

const GRUPOS: { label: string; items: NavItem[] }[] = [
  {
    label: "Visión General",
    items: [
      { href: "/admin/horoscopo", icon: LayoutDashboard, label: "Dashboard", exact: true },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/admin/suscriptores",           icon: Users,         label: "Suscriptores" },
      { href: "/admin/mensajes-problematicos",  icon: MessageSquare, label: "Mensajes" },
      { href: "/admin/wa",                     icon: Smartphone,    label: "WA Inbox" },
      { href: "/admin/contenido",              icon: FileText,      label: "Contenido" },
      { href: "/admin/suscripciones",          icon: CreditCard,    label: "Suscripciones" },
      { href: "/admin/cupones",                icon: Tag,           label: "Cupones" },
    ],
  },
  {
    label: "Observabilidad",
    items: [
      { href: "/admin/ingresos", icon: TrendingUp, label: "Ingresos" },
      { href: "/admin/logs",     icon: ScrollText,  label: "Logs" },
      { href: "/admin/cron",     icon: Clock,       label: "Cron" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/prompts",          icon: Wand2,    label: "Prompts" },
      { href: "/admin/horoscopo/config", icon: Settings, label: "Configuración" },
    ],
  },
];

export function HoroscopoAdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed]         = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const pathname = usePathname();

  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <aside
        className={`${
          collapsed ? "w-14" : "w-60"
        } shrink-0 h-screen sticky top-0 flex flex-col border-r border-gray-800 transition-all duration-200 overflow-hidden`}
      >
        <div
          className={`flex items-center px-3 py-4 border-b border-gray-800 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!collapsed && (
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">
              Admin Horóscopo
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 space-y-4">
          {GRUPOS.map((grupo) => (
            <div key={grupo.label}>
              {!collapsed && (
                <p className="px-3 mb-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {grupo.label}
                </p>
              )}
              <div className="space-y-0.5">
                {grupo.items.map(({ href, icon: Icon, label, exact }) => {
                  const isActive = exact
                    ? pathname === href
                    : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href as Route<string>}
                      title={collapsed ? label : undefined}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg mx-1.5 transition-colors ${
                        isActive
                          ? "bg-gray-800 text-white"
                          : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                      }`}
                    >
                      <Icon
                        size={16}
                        className={isActive ? "text-violet-400" : ""}
                      />
                      {!collapsed && (
                        <span className="text-sm truncate">{label}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-800 p-3">
          <AdminPanelSwitcher current="thc" collapsed={collapsed} />
          <div className="border-t border-gray-800/50 mt-2 pt-2">
            <button
              onClick={handleLogout}
              disabled={cerrandoSesion}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors disabled:opacity-50 ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <LogOut size={14} />
              {!collapsed && (
                <span>{cerrandoSesion ? "Cerrando…" : "Cerrar sesión"}</span>
              )}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-x-hidden">{children}</div>
    </div>
  );
}
