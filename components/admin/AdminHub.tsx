"use client";
import { useState, useEffect } from "react";
import { LogOut, RefreshCw, MessageCircle, Wand2, AlertCircle } from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { MantenimientoToggle } from "@/components/admin/MantenimientoToggle";

interface ConfigRow {
  id: string;
  nombre: string;
  valor: string;
  es_sensible: boolean;
  created_at: string | null;
  editable: boolean;
}

interface ApiResponse {
  ok: boolean;
  config?: ConfigRow[];
  motivo?: string;
  detalle?: string;
}

export function AdminHub() {
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [configRows, setConfigRows] = useState<ConfigRow[]>([]);

  async function cargar() {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/config");
      const json: ApiResponse = await res.json();
      if (!json.ok) {
        setErrorMsg(json.detalle ?? json.motivo ?? "Error al cargar configuración");
      } else {
        setConfigRows(json.config ?? []);
      }
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function cerrarSesion() {
    setCerrandoSesion(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
      window.location.href = "/admin/login";
    } catch {
      setCerrandoSesion(false);
    }
  }

  const modoMantenimiento = configRows.find((r) => r.nombre.toUpperCase() === "MODO_MANTENIMIENTO");
  const whatsappModo = configRows.find((r) => r.nombre.toUpperCase() === "WHATSAPP_MODO");
  const debugMode = configRows.find((r) => r.nombre.toUpperCase() === "APP_DEBUG_MODE");

  const siteOnMaintenance = modoMantenimiento?.valor === "true";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <AdminPanelSwitcher current="hub" />
          <button
            onClick={cerrarSesion}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <LogOut size={13} />
            {cerrandoSesion ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-100">Panel global</h1>
            <p className="text-xs text-gray-500 mt-0.5">Tu Oráculo · Administración</p>
          </div>
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-800 rounded-lg px-3 py-2 transition-colors hover:border-gray-700"
          >
            <RefreshCw size={12} className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={14} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* === Sistema === */}
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sistema</p>

          {/* Maintenance mode — prominent */}
          <div className={`rounded-xl border px-5 py-5 mb-3 ${
            siteOnMaintenance
              ? "border-red-800/50 bg-red-950/10"
              : "border-gray-800 bg-gray-900/50"
          }`}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-100 font-mono">MODO_MANTENIMIENTO</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Cuando está activo, todos los visitantes son redirigidos a{" "}
                  <span className="font-mono text-gray-400">/mantenimiento</span>. El panel admin sigue accesible.
                  Cache de 30s en middleware.
                </p>
              </div>
            </div>
            {cargando ? (
              <div className="text-xs text-gray-600 animate-pulse">Cargando…</div>
            ) : modoMantenimiento ? (
              <MantenimientoToggle valor={modoMantenimiento.valor} onOk={cargar} />
            ) : (
              <p className="text-xs text-gray-600 italic">MODO_MANTENIMIENTO no encontrado en config</p>
            )}
          </div>

          {/* Other global flags — read-only chips */}
          {!cargando && (whatsappModo || debugMode) && (
            <div className="flex flex-wrap gap-2">
              {whatsappModo && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                  whatsappModo.valor === "production"
                    ? "border-amber-800/50 bg-amber-950/20 text-amber-400"
                    : "border-violet-800/40 bg-violet-950/15 text-violet-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${whatsappModo.valor === "production" ? "bg-amber-400" : "bg-violet-400"}`} />
                  <span className="font-mono">WHATSAPP_MODO</span>
                  <span className="font-semibold">{whatsappModo.valor.toUpperCase()}</span>
                </div>
              )}
              {debugMode && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                  debugMode.valor === "true"
                    ? "border-green-800/50 bg-green-950/20 text-green-400"
                    : "border-gray-800 bg-gray-900/50 text-gray-500"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${debugMode.valor === "true" ? "bg-green-400" : "bg-gray-600"}`} />
                  <span className="font-mono">APP_DEBUG_MODE</span>
                  <span className="font-semibold">{debugMode.valor.toUpperCase()}</span>
                </div>
              )}
              <a
                href="/admin/config"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-800 text-xs text-gray-500 hover:text-gray-300 hover:border-gray-700 transition-colors"
              >
                Ver toda la config →
              </a>
            </div>
          )}
        </section>

        {/* === Productos === */}
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Productos</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* THC — Horóscopo */}
            <a
              href="/admin/horoscopo"
              className="group rounded-xl border border-violet-800/30 bg-violet-950/10 hover:bg-violet-950/20 hover:border-violet-700/40 transition-colors px-5 py-5 flex items-start gap-4"
            >
              <div className="p-2 rounded-lg bg-violet-950/50 border border-violet-800/40 shrink-0">
                <MessageCircle size={20} className="text-violet-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-100 group-hover:text-white transition-colors">Horóscopo</p>
                <p className="text-xs text-gray-500 mt-0.5">Suscriptores Premium · WhatsApp · Mensajes · Ingresos</p>
                <p className="text-xs text-violet-500 mt-2 group-hover:text-violet-400 transition-colors">
                  Ir al panel →
                </p>
              </div>
            </a>

            {/* TTC — Tarot */}
            <a
              href="/admin/tarot"
              className="group rounded-xl border border-amber-800/30 bg-amber-950/10 hover:bg-amber-950/20 hover:border-amber-700/40 transition-colors px-5 py-5 flex items-start gap-4"
            >
              <div className="p-2 rounded-lg bg-amber-950/50 border border-amber-800/40 shrink-0">
                <Wand2 size={20} className="text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-100 group-hover:text-white transition-colors">Tarot</p>
                <p className="text-xs text-gray-500 mt-0.5">Lecturas · Clientes · Códigos · Pagos MercadoPago</p>
                <p className="text-xs text-amber-500 mt-2 group-hover:text-amber-400 transition-colors">
                  Ir al panel →
                </p>
              </div>
            </a>
          </div>
        </section>

      </main>
    </div>
  );
}
