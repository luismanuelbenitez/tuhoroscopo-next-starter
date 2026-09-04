"use client";
import { useState, useCallback } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  UserCheck,
  BookOpen,
  FileText,
  CreditCard,
  Receipt,
  Tag,
  ScrollText,
  TrendingUp,
  Settings,
  Sparkles,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Send,
  type LucideIcon,
} from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { usePollingRefresh } from "@/lib/usePollingRefresh";

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
      { href: "/admin/tarot", icon: LayoutDashboard, label: "Dashboard", exact: true },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/admin/tarot/ordenes",  icon: ShoppingCart, label: "Órdenes" },
      { href: "/admin/tarot/clientes", icon: Users,        label: "Registros" },
      { href: "/admin/tarot/clientes-unicos", icon: UserCheck, label: "Clientes" },
      { href: "/admin/tarot/lecturas", icon: BookOpen,     label: "Lecturas" },
      { href: "/admin/tarot/pdfs",     icon: FileText,     label: "PDFs" },
      { href: "/admin/tarot/entregas", icon: Send,         label: "Entregas" },
      { href: "/admin/tarot/pagos",    icon: CreditCard,   label: "Pagos" },
      { href: "/admin/tarot/facturacion", icon: Receipt,   label: "Facturación" },
      { href: "/admin/tarot/codigos",  icon: Tag,          label: "Cupones" },
    ],
  },
  {
    label: "Observabilidad",
    items: [
      { href: "/admin/tarot/logs",     icon: ScrollText,   label: "Logs" },
      { href: "/admin/tarot/ingresos", icon: TrendingUp,   label: "Ingresos" },
    ],
  },
  {
    label: "Producto",
    items: [
      { href: "/admin/tarot/product-intelligence", icon: Sparkles, label: "Product Intelligence" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/tarot/alertas", icon: Bell,     label: "Alertas" },
      { href: "/admin/tarot/config",  icon: Settings, label: "Configuración" },
    ],
  },
];

export function TarotAdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed]           = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [noLeidas, setNoLeidas]             = useState(0);
  const pathname = usePathname();

  // Poll unread alert count from DB — cada 30s + al recuperar visibilidad
  // (ver lib/usePollingRefresh.ts, mismo mecanismo que Centro de Alertas y Dashboard).
  const pollNoLeidas = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tarot/alertas/no-leidas", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setNoLeidas(d.count ?? 0);
      }
    } catch { /* silencioso */ }
  }, []);
  usePollingRefresh(pollNoLeidas);

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
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Admin Tarot
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
                      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg mx-1.5 transition-colors ${
                        isActive
                          ? "bg-gray-800 text-white"
                          : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                      }`}
                    >
                      <span className="relative shrink-0">
                        <Icon size={16} className={isActive ? "text-amber-400" : ""} />
                        {collapsed && href === "/admin/tarot/alertas" && noLeidas > 0 && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
                        )}
                      </span>
                      {!collapsed && (
                        <span className="text-sm truncate flex-1">{label}</span>
                      )}
                      {!collapsed && href === "/admin/tarot/alertas" && noLeidas > 0 && (
                        <span className="ml-auto text-xs bg-amber-500 text-gray-950 font-bold rounded-full px-1.5 leading-5 min-w-[18px] text-center">
                          {noLeidas > 99 ? "99+" : noLeidas}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-800 p-3">
          <AdminPanelSwitcher current="ttc" collapsed={collapsed} />
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
