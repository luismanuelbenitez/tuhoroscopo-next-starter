"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Settings, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import { ALERTAS, SECCIONES, seccionActual } from "@/components/admin/seccionesAdmin";
import { SolapasSeccion } from "@/components/admin/SolapasSeccion";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { usePollingRefresh } from "@/lib/usePollingRefresh";

// Menú (2026-11-16, pedido de Manuel): Alertas arriba de todo y 7 secciones
// con solapas adentro, como Google Ads (components/admin/seccionesAdmin.ts).
// Sin favoritos. Los contadores (alertas, pendientes, WhatsApp, soporte) se
// actualizan cada 30 s, al cambiar de página y al volver a la pestaña.

export function TarotAdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed]           = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [noLeidas, setNoLeidas]             = useState(0);
  const [noLeidasWhatsapp, setNoLeidasWhatsapp] = useState(0);
  const [pendientesUrgentes, setPendientesUrgentes] = useState(0);
  const [soportePendientes, setSoportePendientes] = useState(0);
  const pathname = usePathname();
  useEffect(() => {
    // Celular (2026-11-04): el menú arranca plegado (solo íconos) para que la página entre en 360–390 px.
    if (window.innerWidth < 768) setCollapsed(true);
  }, []);
  const esActivo = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const seccion = seccionActual(pathname ?? "");
  const itemsSecciones = SECCIONES.map((sec) => ({ href: sec.solapas[0].href, icon: sec.icon, label: sec.label, clave: sec.clave }));

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
  // Soporte automatizado: casos esperando que Manuel los apruebe o los tome.
  const pollSoporte = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tarot/soporte?vista=contador", { cache: "no-store" });
      if (res.ok) setSoportePendientes((await res.json()).abiertos ?? 0);
    } catch { /* silencioso */ }
  }, []);
  usePollingRefresh(pollSoporte);
  // "Marcar como leídas" en Pendientes: el número se actualiza sin esperar al polling.
  useEffect(() => {
    window.addEventListener("pendientes:leidos", pollPendientes);
    return () => window.removeEventListener("pendientes:leidos", pollPendientes);
  }, [pollPendientes]);

  const badges: Record<string, number> = {
    "/admin/tarot/alertas": noLeidas, "/admin/tarot/whatsapp": noLeidasWhatsapp, "/admin/tarot/pendientes": pendientesUrgentes,
    "/admin/tarot/soporte": soportePendientes,
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
          {/* Alertas: arriba de todo, apenas destacada. */}
          {(() => {
            const activa = esActivo(ALERTAS.href);
            const Icon = ALERTAS.icon;
            return (
              <Link href={ALERTAS.href as Route<string>} title={collapsed ? ALERTAS.label : undefined}
                className={`relative mx-1.5 flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${activa ? "border-amber-500/40 bg-amber-500/15 text-white" : "border-amber-500/20 bg-amber-500/[0.06] text-amber-100/90 hover:bg-amber-500/10"}`}>
                <span className="relative shrink-0">
                  <Icon size={16} className="text-amber-400" />
                  {collapsed && noLeidas > 0 && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-400" />}
                </span>
                {!collapsed && <span className="flex-1 truncate text-sm font-medium">{ALERTAS.label}</span>}
                {!collapsed && noLeidas > 0 && (
                  <span className="ml-auto min-w-[18px] rounded-full bg-amber-500 px-1.5 text-center text-xs font-bold leading-5 text-gray-950">{noLeidas > 99 ? "99+" : noLeidas}</span>
                )}
              </Link>
            );
          })()}
          <div className="space-y-0.5">
            {itemsSecciones.map((it) => {
              const isActive = seccion?.clave === it.clave;
              const hrefs = SECCIONES.find((x) => x.clave === it.clave)?.solapas.map((x) => x.href) ?? [];
              const n = hrefs.reduce((t, h) => t + (badges[h] ?? 0), 0);
              const verde = hrefs.includes("/admin/tarot/whatsapp") && (badges["/admin/tarot/whatsapp"] ?? 0) > 0;
              const Icon = it.icon;
              return (
                <Link key={it.clave} href={it.href as Route<string>} title={collapsed ? it.label : undefined}
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
        <SolapasSeccion badges={badges} />
        {children}
      </div>
    </div>
  );
}
