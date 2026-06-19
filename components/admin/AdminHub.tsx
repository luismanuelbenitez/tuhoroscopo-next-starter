"use client";
import { useState, useEffect, useCallback } from "react";
import { LogOut, RefreshCw, AlertTriangle, MessageCircle, Wand2 } from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { MantenimientoToggle } from "@/components/admin/MantenimientoToggle";
import { MetricaCard } from "@/components/admin/MetricaCard";

interface ConfigRow {
  id: string;
  nombre: string;
  valor: string;
  es_sensible: boolean;
  created_at: string | null;
  editable: boolean;
}

interface Metricas {
  ok: boolean;
  periodo: number;
  thc: {
    activos: number;
    activos_wa_ok: number;
    activos_wa_pendiente: number;
    altas_periodo: number;
    mensajes_enviados_periodo: number;
    mensajes_fallidos_24h: number;
    mensajes_pendientes: number;
    ingresos_periodo: number;
    mrr_uyu: number;
    mrr_ars: number;
    subs_activas: number;
  };
  ttc: {
    ordenes_periodo: number;
    completadas_periodo: number;
    en_error_activo: number;
    clientes_total: number;
    ingresos_periodo_uyu: number;
    ingresos_periodo_ars: number;
  };
  alertas: {
    ordenes_en_error: number;
    mensajes_fallidos_24h: number;
    wa_pendiente: number;
  };
}

const PERIODOS = [
  { label: "Hoy", valor: "1" },
  { label: "7 días", valor: "7" },
  { label: "30 días", valor: "30" },
  { label: "90 días", valor: "90" },
] as const;

function fmt(n: number): string {
  return n.toLocaleString("es-UY");
}

export function AdminHub() {
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [cargandoMetricas, setCargandoMetricas] = useState(true);
  const [configRows, setConfigRows] = useState<ConfigRow[]>([]);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [errorMetricas, setErrorMetricas] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<string>("30");

  const cargarConfig = useCallback(async () => {
    setCargandoConfig(true);
    try {
      const res = await fetch("/api/admin/config");
      const json = await res.json();
      if (json.ok) setConfigRows(json.config ?? []);
    } catch {
      // silencioso — la config es secundaria en el hub
    } finally {
      setCargandoConfig(false);
    }
  }, []);

  const cargarMetricas = useCallback(async (p: string) => {
    setCargandoMetricas(true);
    setErrorMetricas(null);
    try {
      const res = await fetch(`/api/admin/metricas-globales?periodo=${p}`);
      const json: Metricas = await res.json();
      if (json.ok) {
        setMetricas(json);
      } else {
        setErrorMetricas("Error al cargar métricas");
      }
    } catch {
      setErrorMetricas("Error de red");
    } finally {
      setCargandoMetricas(false);
    }
  }, []);

  useEffect(() => { cargarConfig(); }, [cargarConfig]);
  useEffect(() => { cargarMetricas(periodo); }, [periodo, cargarMetricas]);

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

  const m = metricas;
  const hayAlertas =
    m && (m.alertas.ordenes_en_error > 0 || m.alertas.mensajes_fallidos_24h > 0);

  const labelPeriodo = PERIODOS.find((p) => p.valor === periodo)?.label ?? `${periodo}d`;

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

        {/* Title + controles */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-100">Panel global</h1>
            <p className="text-xs text-gray-500 mt-0.5">Tu Oráculo · Administración</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Selector de período */}
            <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
              {PERIODOS.map((p) => (
                <button
                  key={p.valor}
                  onClick={() => setPeriodo(p.valor)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    periodo === p.valor
                      ? "bg-gray-700 text-gray-100"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { cargarConfig(); cargarMetricas(periodo); }}
              disabled={cargandoMetricas}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-800 rounded-lg px-3 py-2 transition-colors hover:border-gray-700"
            >
              <RefreshCw size={12} className={cargandoMetricas ? "animate-spin" : ""} />
              Actualizar
            </button>
          </div>
        </div>

        {/* === Alertas === */}
        {!cargandoMetricas && hayAlertas && m && (
          <div className="rounded-xl border border-red-800/60 bg-red-950/20 px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-red-400 shrink-0" />
              <p className="text-sm font-semibold text-red-300">Requiere atención</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {m.alertas.ordenes_en_error > 0 && (
                <a
                  href="/admin/tarot"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-800/40 text-xs text-red-300 hover:bg-red-950/60 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {m.alertas.ordenes_en_error} {m.alertas.ordenes_en_error === 1 ? "orden tarot en error" : "órdenes tarot en error"}
                  <span className="text-red-500">→</span>
                </a>
              )}
              {m.alertas.mensajes_fallidos_24h > 0 && (
                <a
                  href="/admin/horoscopo"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-800/40 text-xs text-red-300 hover:bg-red-950/60 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {m.alertas.mensajes_fallidos_24h} {m.alertas.mensajes_fallidos_24h === 1 ? "mensaje fallido" : "mensajes fallidos"} (24h)
                  <span className="text-red-500">→</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Error cargando métricas */}
        {errorMetricas && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">
            {errorMetricas}
          </div>
        )}

        {/* === Sistema === */}
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sistema</p>
          <div className={`rounded-xl border px-5 py-5 mb-3 ${
            modoMantenimiento?.valor === "true"
              ? "border-red-800/50 bg-red-950/10"
              : "border-gray-800 bg-gray-900/50"
          }`}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-100 font-mono">MODO_MANTENIMIENTO</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Redirige todos los visitantes a{" "}
                  <span className="font-mono text-gray-400">/mantenimiento</span>. El panel admin sigue accesible.
                </p>
              </div>
            </div>
            {cargandoConfig ? (
              <div className="text-xs text-gray-600 animate-pulse">Cargando…</div>
            ) : modoMantenimiento ? (
              <MantenimientoToggle valor={modoMantenimiento.valor} onOk={cargarConfig} />
            ) : (
              <p className="text-xs text-gray-600 italic">MODO_MANTENIMIENTO no encontrado en config</p>
            )}
          </div>

          {!cargandoConfig && (whatsappModo || debugMode) && (
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
                Toda la config →
              </a>
            </div>
          )}
        </section>

        {/* === Métricas — grid 2 columnas === */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* === THC — Horóscopo === */}
          <section className="rounded-xl border border-violet-800/25 bg-violet-950/5 px-5 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-violet-950/60 border border-violet-800/40">
                  <MessageCircle size={16} className="text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-100">Horóscopo</p>
                  <p className="text-xs text-violet-500/70">Tu Oráculo · THC</p>
                </div>
              </div>
              <a
                href="/admin/horoscopo"
                className="text-xs text-violet-500 hover:text-violet-300 transition-colors"
              >
                Panel →
              </a>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricaCard
                esqueleto={cargandoMetricas}
                valor={m ? fmt(m.thc.activos) : "—"}
                label="Activos premium"
                sub={m ? `${fmt(m.thc.activos_wa_ok)} con WA confirmado` : undefined}
              />
              <MetricaCard
                esqueleto={cargandoMetricas}
                valor={m ? `$${fmt(m.thc.mrr_uyu)}` : "—"}
                label="MRR (UYU)"
                sub={m && m.thc.mrr_ars > 0 ? `ARS $${fmt(m.thc.mrr_ars)}` : undefined}
              />
              <MetricaCard
                esqueleto={cargandoMetricas}
                valor={m ? fmt(m.thc.altas_periodo) : "—"}
                label={`Altas en ${labelPeriodo}`}
              />
              <MetricaCard
                esqueleto={cargandoMetricas}
                valor={m ? fmt(m.thc.mensajes_enviados_periodo) : "—"}
                label={`Mensajes en ${labelPeriodo}`}
              />
            </div>

            {/* Chips de estado */}
            {!cargandoMetricas && m && (
              <div className="flex flex-wrap gap-2 pt-1">
                {m.thc.mensajes_pendientes > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-950/30 border border-yellow-800/40 text-xs text-yellow-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    {fmt(m.thc.mensajes_pendientes)} mensajes pendientes
                  </span>
                )}
                {m.thc.activos_wa_pendiente > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 text-xs text-gray-500">
                    {fmt(m.thc.activos_wa_pendiente)} sin confirmar WA
                  </span>
                )}
                {m.thc.mensajes_fallidos_24h > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/30 border border-red-800/40 text-xs text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    {fmt(m.thc.mensajes_fallidos_24h)} fallidos (24h)
                  </span>
                )}
              </div>
            )}
          </section>

          {/* === TTC — Tarot === */}
          <section className="rounded-xl border border-amber-800/25 bg-amber-950/5 px-5 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-950/60 border border-amber-800/40">
                  <Wand2 size={16} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-100">Tarot</p>
                  <p className="text-xs text-amber-500/70">Tu Oráculo · TTC</p>
                </div>
              </div>
              <a
                href="/admin/tarot"
                className="text-xs text-amber-500 hover:text-amber-300 transition-colors"
              >
                Panel →
              </a>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricaCard
                esqueleto={cargandoMetricas}
                valor={m ? fmt(m.ttc.ordenes_periodo) : "—"}
                label={`Órdenes en ${labelPeriodo}`}
                sub={m ? `${fmt(m.ttc.completadas_periodo)} completadas` : undefined}
              />
              <MetricaCard
                esqueleto={cargandoMetricas}
                valor={m ? `$${fmt(m.ttc.ingresos_periodo_uyu)}` : "—"}
                label={`Ingresos UYU en ${labelPeriodo}`}
                sub={m && m.ttc.ingresos_periodo_ars > 0 ? `ARS $${fmt(m.ttc.ingresos_periodo_ars)}` : undefined}
              />
              <MetricaCard
                esqueleto={cargandoMetricas}
                valor={m ? fmt(m.ttc.clientes_total) : "—"}
                label="Clientes totales"
              />
              <MetricaCard
                esqueleto={cargandoMetricas}
                valor={m ? fmt(m.ttc.en_error_activo) : "—"}
                label="Órdenes en error"
                sub={m && m.ttc.en_error_activo > 0 ? "Requieren atención" : undefined}
                subAlerta={m ? m.ttc.en_error_activo > 0 : false}
              />
            </div>

            {/* Chip de error si hay */}
            {!cargandoMetricas && m && m.ttc.en_error_activo > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href="/admin/tarot"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/30 border border-red-800/40 text-xs text-red-400 hover:bg-red-950/50 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  {fmt(m.ttc.en_error_activo)} {m.ttc.en_error_activo === 1 ? "orden" : "órdenes"} en error → ver panel
                </a>
              </div>
            )}
          </section>
        </div>

      </main>
    </div>
  );
}
