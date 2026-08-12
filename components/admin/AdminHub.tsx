"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, MessageCircle, Wand2, LayoutDashboard } from "lucide-react";
import { MantenimientoToggle } from "@/components/admin/MantenimientoToggle";

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

function Skel() {
  return (
    <div className="space-y-1.5">
      <div className="h-7 w-12 bg-gray-800 rounded-md animate-pulse" />
      <div className="h-3 w-20 bg-gray-800 rounded animate-pulse" />
    </div>
  );
}

export function AdminHub() {
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
      // silencioso — config es secundaria en el hub
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

  const modoMantenimiento = configRows.find((r) => r.nombre.toUpperCase() === "MODO_MANTENIMIENTO");
  const whatsappModo      = configRows.find((r) => r.nombre.toUpperCase() === "WHATSAPP_MODO");
  const debugMode         = configRows.find((r) => r.nombre.toUpperCase() === "APP_DEBUG_MODE");

  const m = metricas;
  const hayAlertas = m && (m.alertas.ordenes_en_error > 0 || m.alertas.mensajes_fallidos_24h > 0);
  const labelPeriodo = PERIODOS.find((p) => p.valor === periodo)?.label ?? `${periodo}d`;

  const hasHoroscopoChips = Boolean(
    (!cargandoMetricas && m && (m.thc.mensajes_pendientes > 0 || m.thc.activos_wa_pendiente > 0 || m.thc.mensajes_fallidos_24h > 0)) ||
    (!cargandoConfig && (whatsappModo || debugMode))
  );

  return (
    <main className="p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <LayoutDashboard size={18} className="text-gray-500 shrink-0 mt-0.5" />
          <div>
            <h1 className="text-base font-semibold text-white leading-tight">Panel global</h1>
            <p className="text-xs text-gray-500 mt-0.5">Estado general de tus productos y operación</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-gray-900 border border-gray-800 rounded-lg p-1">
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
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-800 rounded-lg px-3 py-2 transition-colors hover:border-gray-700 disabled:opacity-40"
          >
            <RefreshCw size={11} className={cargandoMetricas ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Alertas globales ── */}
      {!cargandoMetricas && hayAlertas && m && (
        <div className="rounded-xl border border-red-800/60 bg-red-950/20 px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <p className="text-sm font-semibold text-red-300">Requiere atención</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {m.alertas.ordenes_en_error > 0 && (
              <a
                href="/admin/tarot"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-800/40 text-xs text-red-300 hover:bg-red-950/60 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                {m.alertas.ordenes_en_error} {m.alertas.ordenes_en_error === 1 ? "orden tarot en error" : "órdenes tarot en error"}
                <span className="text-red-500/70">→</span>
              </a>
            )}
            {m.alertas.mensajes_fallidos_24h > 0 && (
              <a
                href="/admin/horoscopo"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-800/40 text-xs text-red-300 hover:bg-red-950/60 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                {m.alertas.mensajes_fallidos_24h} {m.alertas.mensajes_fallidos_24h === 1 ? "mensaje fallido" : "mensajes fallidos"} (24h)
                <span className="text-red-500/70">→</span>
              </a>
            )}
          </div>
        </div>
      )}

      {errorMetricas && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-2.5 text-xs text-red-300">
          {errorMetricas}
        </div>
      )}

      {/* ── Estado del sistema ── */}
      {cargandoConfig ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3">
          <div className="h-4 w-40 bg-gray-800 rounded-md animate-pulse" />
        </div>
      ) : modoMantenimiento ? (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap ${
            modoMantenimiento.valor === "true"
              ? "border-red-800/50 bg-red-950/15"
              : "border-gray-800/80 bg-gray-900/40"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 flex-none ${
              modoMantenimiento.valor === "true" ? "bg-red-500 animate-pulse" : "bg-emerald-500"
            }`}
          />
          <div className="flex-1 min-w-0 flex items-baseline gap-3 flex-wrap">
            <span
              className={`text-sm font-medium ${
                modoMantenimiento.valor === "true" ? "text-red-300" : "text-gray-200"
              }`}
            >
              {modoMantenimiento.valor === "true" ? "Sitio en mantenimiento" : "Sitio operativo"}
            </span>
            <span className="text-xs text-gray-500">
              {modoMantenimiento.valor === "true"
                ? "Los visitantes ven la página de mantenimiento. El panel admin sigue accesible."
                : "Todos los visitantes acceden con normalidad."}
            </span>
            <a
              href="https://tuoraculo.uy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500/70 hover:text-gray-300 transition-colors whitespace-nowrap"
            >
              Ver sitio público ↗
            </a>
          </div>
          <MantenimientoToggle valor={modoMantenimiento.valor} onOk={cargarConfig} />
        </div>
      ) : null}

      {/* ── Productos ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Productos</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── TAROT ── */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800/60 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-950/60 border border-amber-800/40">
                <Wand2 size={13} className="text-amber-400" />
              </div>
              <span className="text-sm font-semibold text-gray-200 flex-1">Tarot</span>
              {!cargandoMetricas && m && (
                m.ttc.en_error_activo > 0 ? (
                  <span className="flex items-center gap-1.5 text-xs text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {m.ttc.en_error_activo} en error
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Operativo
                  </span>
                )
              )}
              <a href="/admin/tarot" className="text-xs text-amber-500/80 hover:text-amber-400 transition-colors ml-2">
                Ir al panel →
              </a>
            </div>

            <div className="grid grid-cols-4 divide-x divide-gray-800/50">
              <div className="px-4 py-5">
                {cargandoMetricas ? <Skel /> : (
                  <>
                    <p className="text-2xl font-semibold tabular-nums text-white">{m ? fmt(m.ttc.ordenes_periodo) : "—"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Órdenes</p>
                    <p className="text-xs text-gray-600 mt-0.5">{m ? `${fmt(m.ttc.completadas_periodo)} completadas` : ""}</p>
                  </>
                )}
              </div>
              <div className="px-4 py-5">
                {cargandoMetricas ? <Skel /> : (
                  <>
                    <p className="text-2xl font-semibold tabular-nums text-white">{m ? `$${fmt(m.ttc.ingresos_periodo_uyu)}` : "—"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Ingresos UYU</p>
                    {m && m.ttc.ingresos_periodo_ars > 0 && <p className="text-xs text-gray-600 mt-0.5">ARS ${fmt(m.ttc.ingresos_periodo_ars)}</p>}
                  </>
                )}
              </div>
              <div className="px-4 py-5">
                {cargandoMetricas ? <Skel /> : (
                  <>
                    <p className="text-2xl font-semibold tabular-nums text-white">{m ? fmt(m.ttc.clientes_total) : "—"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Clientes</p>
                    <p className="text-xs text-gray-600 mt-0.5">totales</p>
                  </>
                )}
              </div>
              <div className="px-4 py-5">
                {cargandoMetricas ? <Skel /> : (
                  <>
                    <p className={`text-2xl font-semibold tabular-nums ${m && m.ttc.en_error_activo > 0 ? "text-red-400" : "text-white"}`}>
                      {m ? fmt(m.ttc.en_error_activo) : "—"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">En error</p>
                    {m && m.ttc.en_error_activo > 0 && (
                      <p className="text-xs text-red-500/80 mt-0.5">ver panel</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {!cargandoMetricas && m && m.ttc.en_error_activo > 0 && (
              <div className="px-4 pb-3 border-t border-gray-800/40 pt-3">
                <a
                  href="/admin/tarot"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/30 border border-red-800/40 text-xs text-red-400 hover:bg-red-950/50 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {fmt(m.ttc.en_error_activo)} {m.ttc.en_error_activo === 1 ? "orden" : "órdenes"} en error → ver panel
                </a>
              </div>
            )}
          </div>

          {/* ── HORÓSCOPO ── */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800/60 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-violet-950/60 border border-violet-800/40">
                <MessageCircle size={13} className="text-violet-400" />
              </div>
              <span className="text-sm font-semibold text-gray-200 flex-1">Horóscopo</span>
              {!cargandoMetricas && m && (
                m.alertas.mensajes_fallidos_24h > 0 ? (
                  <span className="flex items-center gap-1.5 text-xs text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {m.alertas.mensajes_fallidos_24h} fallidos
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Operativo
                  </span>
                )
              )}
              <a href="/admin/horoscopo" className="text-xs text-violet-500/80 hover:text-violet-400 transition-colors ml-2">
                Ir al panel →
              </a>
            </div>

            <div className="grid grid-cols-4 divide-x divide-gray-800/50">
              <div className="px-4 py-5">
                {cargandoMetricas ? <Skel /> : (
                  <>
                    <p className="text-2xl font-semibold tabular-nums text-white">{m ? fmt(m.thc.activos) : "—"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Activos</p>
                    <p className="text-xs text-gray-600 mt-0.5">{m ? `${fmt(m.thc.activos_wa_ok)} con WA` : ""}</p>
                  </>
                )}
              </div>
              <div className="px-4 py-5">
                {cargandoMetricas ? <Skel /> : (
                  <>
                    <p className="text-2xl font-semibold tabular-nums text-white">{m ? `$${fmt(m.thc.mrr_uyu)}` : "—"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">MRR UYU</p>
                    {m && m.thc.mrr_ars > 0 && <p className="text-xs text-gray-600 mt-0.5">ARS ${fmt(m.thc.mrr_ars)}</p>}
                  </>
                )}
              </div>
              <div className="px-4 py-5">
                {cargandoMetricas ? <Skel /> : (
                  <>
                    <p className="text-2xl font-semibold tabular-nums text-white">{m ? fmt(m.thc.altas_periodo) : "—"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Altas</p>
                    <p className="text-xs text-gray-600 mt-0.5">en {labelPeriodo}</p>
                  </>
                )}
              </div>
              <div className="px-4 py-5">
                {cargandoMetricas ? <Skel /> : (
                  <>
                    <p className={`text-2xl font-semibold tabular-nums ${m && m.thc.mensajes_fallidos_24h > 0 ? "text-red-400" : "text-white"}`}>
                      {m ? fmt(m.thc.mensajes_enviados_periodo) : "—"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Mensajes</p>
                    {m && m.thc.mensajes_fallidos_24h > 0 ? (
                      <p className="text-xs text-red-500/80 mt-0.5">{fmt(m.thc.mensajes_fallidos_24h)} fallidos</p>
                    ) : (
                      <p className="text-xs text-gray-600 mt-0.5">en {labelPeriodo}</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {hasHoroscopoChips && (
              <div className="px-4 py-3 flex flex-wrap gap-2 border-t border-gray-800/40">
                {!cargandoMetricas && m && m.thc.mensajes_fallidos_24h > 0 && (
                  <a
                    href="/admin/horoscopo"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/30 border border-red-800/40 text-xs text-red-400 hover:bg-red-950/50 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    {fmt(m.thc.mensajes_fallidos_24h)} fallidos (24h) → ver panel
                  </a>
                )}
                {!cargandoMetricas && m && m.thc.mensajes_pendientes > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-950/30 border border-yellow-800/40 text-xs text-yellow-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    {fmt(m.thc.mensajes_pendientes)} mensajes pendientes
                  </span>
                )}
                {!cargandoMetricas && m && m.thc.activos_wa_pendiente > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 text-xs text-gray-500">
                    {fmt(m.thc.activos_wa_pendiente)} sin confirmar WA
                  </span>
                )}
                {!cargandoConfig && whatsappModo && (
                  <div
                    className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs ${
                      whatsappModo.valor === "production"
                        ? "border-amber-800/50 bg-amber-950/20 text-amber-400"
                        : "border-violet-800/40 bg-violet-950/15 text-violet-400"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${whatsappModo.valor === "production" ? "bg-amber-400" : "bg-violet-400"}`} />
                    <span className="font-mono">WHATSAPP_MODO</span>
                    <span className="font-semibold">{whatsappModo.valor.toUpperCase()}</span>
                  </div>
                )}
                {!cargandoConfig && debugMode && (
                  <div
                    className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs ${
                      debugMode.valor === "true"
                        ? "border-green-800/50 bg-green-950/20 text-green-400"
                        : "border-gray-800 bg-gray-900/50 text-gray-500"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${debugMode.valor === "true" ? "bg-green-400" : "bg-gray-600"}`} />
                    <span className="font-mono">APP_DEBUG_MODE</span>
                    <span className="font-semibold">{debugMode.valor.toUpperCase()}</span>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}
