"use client";
import { useState, useCallback, useEffect } from "react";
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
  MessageCircle,
  Star,
  type LucideIcon,
  Megaphone,
  Target,
  Radar, Scale, Workflow, Calculator, BrainCircuit, ChevronDown,
} from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { usePollingRefresh } from "@/lib/usePollingRefresh";

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  exact?: boolean;
}

// Orden del menú (2026-10-31): dirección y observabilidad arriba, la operación
// diaria después y lo administrativo al final. Configuración además queda fija
// como engranaje junto al título.
const GRUPOS: { label: string; items: NavItem[] }[] = [
  {
    label: "Dirección",
    items: [
      { href: "/admin/tarot/asistente", icon: BrainCircuit, label: "Asistente CEO" },
      { href: "/admin/tarot", icon: LayoutDashboard, label: "Panel", exact: true },
    ],
  },
  {
    label: "Observabilidad",
    items: [
      { href: "/admin/tarot/ejecuciones", icon: Workflow,  label: "Ejecuciones" },
      { href: "/admin/tarot/ingresos",    icon: TrendingUp, label: "Ingresos" },
      { href: "/admin/tarot/presupuesto", icon: Calculator, label: "Presupuesto" },
      { href: "/admin/tarot/visitantes",  icon: Radar,      label: "Visitantes" },
      { href: "/admin/tarot/alertas",     icon: Bell,       label: "Alertas" },
      { href: "/admin/tarot/logs",        icon: ScrollText, label: "Logs" },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/admin/tarot/ordenes",  icon: ShoppingCart,  label: "Órdenes" },
      { href: "/admin/tarot/lecturas", icon: BookOpen,      label: "Lecturas" },
      { href: "/admin/tarot/pdfs",     icon: FileText,      label: "PDFs" },
      { href: "/admin/tarot/entregas", icon: Send,          label: "Entregas" },
      { href: "/admin/tarot/whatsapp", icon: MessageCircle, label: "WhatsApp" },
    ],
  },
  {
    label: "Ventas y cobros",
    items: [
      { href: "/admin/tarot/pagos",       icon: CreditCard, label: "Pagos" },
      { href: "/admin/tarot/facturacion", icon: Receipt,    label: "Facturación" },
      { href: "/admin/tarot/codigos",     icon: Tag,        label: "Cupones" },
    ],
  },
  {
    label: "Clientes y marketing",
    items: [
      { href: "/admin/tarot/clientes-unicos", icon: UserCheck, label: "Clientes" },
      { href: "/admin/tarot/clientes",        icon: Users,     label: "Registros" },
      { href: "/admin/tarot/testimonios",     icon: Star,      label: "Testimonios" },
      { href: "/admin/tarot/campanas",        icon: Megaphone, label: "Campañas" },
      { href: "/admin/tarot/campanas-ads",    icon: Target,    label: "Campañas Ads" },
      { href: "/admin/tarot/product-intelligence", icon: Sparkles, label: "Product Intelligence" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/tarot/config",    icon: Settings, label: "Configuración" },
      { href: "/admin/tarot/normativa", icon: Scale,    label: "Normativa" },
    ],
  },
];

const CLAVE_GRUPOS_CERRADOS = "tarot_menu_grupos_cerrados";

export function TarotAdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed]           = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [noLeidas, setNoLeidas]             = useState(0);
  const [noLeidasWhatsapp, setNoLeidasWhatsapp] = useState(0);
  const pathname = usePathname();
  // Grupos plegados: se recuerdan en este navegador. El grupo de la página
  // actual siempre se muestra abierto.
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const v = localStorage.getItem(CLAVE_GRUPOS_CERRADOS);
      if (v) setCerrados(new Set(JSON.parse(v) as string[]));
    } catch { /* sin storage: todo abierto */ }
  }, []);
  const alternarGrupo = (label: string) => setCerrados((prev) => {
    const n = new Set(prev);
    if (n.has(label)) n.delete(label); else n.add(label);
    try { localStorage.setItem(CLAVE_GRUPOS_CERRADOS, JSON.stringify(Array.from(n))); } catch { /* noop */ }
    return n;
  });
  const esActivo = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

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

  // Mismo mecanismo de polling, para el badge de conversaciones de WhatsApp
  // sin leer (no necesita tiempo real — ver docs/modules/whatsapp-inbox.md).
  const pollNoLeidasWhatsapp = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tarot/whatsapp?solo_contador=true", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setNoLeidasWhatsapp(d.conversaciones_no_leidas ?? 0);
      }
    } catch { /* silencioso */ }
  }, []);
  usePollingRefresh(pollNoLeidasWhatsapp);

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
          {!collapsed && (
            <Link href={"/admin/tarot/config" as Route} title="Configuración"
              className={`ml-auto mr-1 p-1 rounded hover:bg-gray-800 transition-colors ${esActivo("/admin/tarot/config") ? "text-amber-400" : "text-gray-500 hover:text-gray-300"}`}>
              <Settings size={14} />
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 space-y-3">
          {GRUPOS.map((grupo) => {
            const tieneActivo = grupo.items.some((it) => esActivo(it.href, it.exact));
            const abierto = collapsed || tieneActivo || !cerrados.has(grupo.label);
            return (
            <div key={grupo.label}>
              {!collapsed && (
                <button onClick={() => alternarGrupo(grupo.label)} disabled={tieneActivo}
                  className="w-full flex items-center justify-between px-3 mb-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-400 disabled:hover:text-gray-600 disabled:cursor-default">
                  {grupo.label}
                  {!tieneActivo && <ChevronDown size={12} className={`transition-transform ${abierto ? "" : "-rotate-90"}`} />}
                </button>
              )}
              {abierto && (
              <div className="space-y-0.5">
                {grupo.items.map(({ href, icon: Icon, label, exact }) => {
                  const isActive = esActivo(href, exact);
                  const badgeCount = href === "/admin/tarot/alertas" ? noLeidas
                    : href === "/admin/tarot/whatsapp" ? noLeidasWhatsapp
                    : 0;
                  const badgeCls = href === "/admin/tarot/whatsapp" ? "bg-emerald-500" : "bg-amber-500";
                  const dotCls = href === "/admin/tarot/whatsapp" ? "bg-emerald-400" : "bg-amber-400";
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
                        {collapsed && badgeCount > 0 && (
                          <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${dotCls}`} />
                        )}
                      </span>
                      {!collapsed && (
                        <span className="text-sm truncate flex-1">{label}</span>
                      )}
                      {!collapsed && badgeCount > 0 && (
                        <span className={`ml-auto text-xs ${badgeCls} text-gray-950 font-bold rounded-full px-1.5 leading-5 min-w-[18px] text-center`}>
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
              )}
            </div>
            );
          })}
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
