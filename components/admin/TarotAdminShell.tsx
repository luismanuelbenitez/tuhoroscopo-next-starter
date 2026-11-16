"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Settings, Star, LogOut, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { SECCIONES, TODAS_LAS_SOLAPAS, seccionActual } from "@/components/admin/seccionesAdmin";
import { SolapasSeccion } from "@/components/admin/SolapasSeccion";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { usePollingRefresh } from "@/lib/usePollingRefresh";

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  exact?: boolean;
}

// Menú (2026-11-16, pedido de Manuel): 7 secciones con solapas adentro, como
// Google Ads (definidas en components/admin/seccionesAdmin.ts). Arriba quedan
// los Favoritos: accesos directos a solapas, que se marcan con la estrella de
// la barra de solapas y se recuerdan en este navegador.
const FAVORITOS_INICIALES = [
  "/admin/tarot/pendientes", "/admin/tarot/whatsapp", "/admin/tarot/ordenes", "/admin/tarot/google-ads",
];
const CLAVE_FAVORITOS = "tarot_menu_favoritos";

export function TarotAdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed]           = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [noLeidas, setNoLeidas]             = useState(0);
  const [noLeidasWhatsapp, setNoLeidasWhatsapp] = useState(0);
  const [pendientesUrgentes, setPendientesUrgentes] = useState(0);
  const pathname = usePathname();
  const [favoritos, setFavoritos] = useState<string[]>(FAVORITOS_INICIALES);
  useEffect(() => {
    // Celular (2026-11-04): el menú arranca plegado (solo íconos) para que la página entre en 360–390 px.
    if (window.innerWidth < 768) setCollapsed(true);
    try {
      const f = localStorage.getItem(CLAVE_FAVORITOS);
      if (f) setFavoritos((JSON.parse(f) as string[]).filter((h) => TODAS_LAS_SOLAPAS.some((it) => it.href === h)));
    } catch { /* sin storage: valores iniciales */ }
  }, []);
  const alternarFavorito = (href: string) => setFavoritos((prev) => {
    const n = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
    try { localStorage.setItem(CLAVE_FAVORITOS, JSON.stringify(n)); } catch { /* noop */ }
    return n;
  });
  const esActivo = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const seccion = seccionActual(pathname ?? "");
  const itemsFavoritos: NavItem[] = favoritos.map((h) => TODAS_LAS_SOLAPAS.find((it) => it.href === h)).filter((it): it is NavItem => !!it);
  const itemsSecciones = SECCIONES.map((sec) => ({ href: sec.solapas[0].href, icon: sec.icon, label: sec.label, clave: sec.clave, exact: false }));

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

  // Pendientes urgentes (vencidos, vencen hoy o prioridad alta), mismo polling.
  const pollPendientes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tarot/pendientes?solo_contador=true", { cache: "no-store" });
      if (res.ok) setPendientesUrgentes((await res.json()).urgentes ?? 0);
    } catch { /* silencioso */ }
  }, []);
  usePollingRefresh(pollPendientes);
  // "Marcar como leídas" en Pendientes: el número se actualiza sin esperar al polling.
  useEffect(() => {
    window.addEventListener("pendientes:leidos", pollPendientes);
    return () => window.removeEventListener("pendientes:leidos", pollPendientes);
  }, [pollPendientes]);

  const badges: Record<string, number> = {
    "/admin/tarot/alertas": noLeidas, "/admin/tarot/whatsapp": noLeidasWhatsapp, "/admin/tarot/pendientes": pendientesUrgentes,
  };

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
          {[{ titulo: "Favoritos", fav: true }, { titulo: "Secciones", fav: false }].map(({ titulo, fav }) => (
            <div key={titulo}>
              {!collapsed && (
                <p className={`flex items-center gap-1.5 px-3 mb-1 text-xs font-semibold uppercase tracking-wider ${fav ? "text-amber-500/80" : "text-gray-600"}`}>
                  {fav && <Star size={11} className="fill-current" />}{titulo}
                </p>
              )}
              {fav && itemsFavoritos.length === 0 && !collapsed && (
                <p className="px-3 text-[11px] text-gray-600">Tocá la ☆ de una solapa para sumarla acá.</p>
              )}
              <div className="space-y-0.5">
                {(fav ? itemsFavoritos.map((it) => ({ ...it, clave: undefined as string | undefined })) : itemsSecciones).map((it) => {
                  const isActive = it.clave ? seccion?.clave === it.clave : esActivo(it.href, it.exact);
                  const hrefs = it.clave ? (SECCIONES.find((x) => x.clave === it.clave)?.solapas.map((x) => x.href) ?? []) : [it.href];
                  const n = hrefs.reduce((t, h) => t + (badges[h] ?? 0), 0);
                  const verde = hrefs.includes("/admin/tarot/whatsapp") && (badges["/admin/tarot/whatsapp"] ?? 0) > 0;
                  const Icon = it.icon;
                  return (
                    <Link key={`${titulo}-${it.href}`} href={it.href as Route<string>} title={collapsed ? it.label : undefined}
                      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg mx-1.5 transition-colors ${isActive ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"}`}>
                      <span className="relative shrink-0">
                        <Icon size={16} className={isActive ? "text-amber-400" : ""} />
                        {collapsed && n > 0 && <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${verde ? "bg-emerald-400" : "bg-amber-400"}`} />}
                      </span>
                      {!collapsed && <span className="text-sm truncate flex-1">{it.label}</span>}
                      {!collapsed && n > 0 && (
                        <span className={`ml-auto text-xs ${verde ? "bg-emerald-500" : "bg-amber-500"} text-gray-950 font-bold rounded-full px-1.5 leading-5 min-w-[18px] text-center`}>
                          {n > 99 ? "99+" : n}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
              {fav && collapsed && <div className="mx-3 mt-2 border-t border-gray-800" />}
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

      <div className="flex-1 min-w-0 overflow-x-hidden">
        <SolapasSeccion badges={badges} favoritos={favoritos} alternarFavorito={alternarFavorito} />
        {children}
      </div>
    </div>
  );
}
