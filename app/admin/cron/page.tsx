"use client";
import { useState, useEffect } from "react";
import {
  MessageCircle,
  LogOut,
  Check,
  X,
  AlertCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";

// ===========================================================================
// Types
// ===========================================================================

interface ProcStats {
  ultima_ejecucion: string | null;
  ultimo_resultado: string | null;
  ultimo_exito: boolean | null;
  ultimo_error: { resultado: string; fecha: string } | null;
  total_reciente: number;
  errores_recientes: number;
}

interface Proceso {
  id: string;
  nombre: string;
  funcion: string;
  descripcion: string;
  frecuencia: string;
  tipo: string;
  categoria: string;
  stats: ProcStats | null;
}

interface Resumen {
  total_procesos: number;
  con_error_reciente: number;
  sin_datos: number;
}

interface ApiResponse {
  ok: boolean;
  nota?: string;
  resumen?: Resumen;
  procesos?: Proceso[];
  motivo?: string;
  detalle?: string;
}

// ===========================================================================
// Helpers
// ===========================================================================

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "hace <1 min";
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `hace ${days}d`;
  } catch {
    return "";
  }
}

const TIPO_CLS: Record<string, string> = {
  diario: "border-violet-800/50 bg-violet-950/30 text-violet-300",
  semanal: "border-sky-800/50 bg-sky-950/30 text-sky-300",
  frecuente: "border-amber-800/50 bg-amber-950/30 text-amber-300",
  "sub-proceso": "border-gray-700/50 bg-gray-800/50 text-gray-400",
};

const CATEGORIA_LABEL: Record<string, string> = {
  envio: "Envío",
  generacion: "Generación",
  reintentos: "Reintentos",
  suscripciones: "Suscripciones",
};

function StatusBadge({ stats }: { stats: ProcStats | null }) {
  if (!stats || !stats.ultima_ejecucion) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-gray-600" />
        <span className="text-xs text-gray-600">Sin datos</span>
      </div>
    );
  }
  if (stats.ultimo_exito === false) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-xs text-red-400">Error</span>
      </div>
    );
  }
  if (stats.ultimo_exito === true) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs text-green-400">OK</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full bg-gray-500" />
      <span className="text-xs text-gray-500">Desconocido</span>
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================

export default function CronPage() {
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  async function cargar() {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/cron");
      const json: ApiResponse = await res.json();
      if (!json.ok) {
        setErrorMsg(json.detalle ?? json.motivo ?? "Error al cargar procesos");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setErrorMsg("Error de red al cargar procesos");
      setData(null);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function cerrarSesion() {
    setCerrandoSesion(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
      window.location.href = "/admin/login";
    } catch {
      setCerrandoSesion(false);
    }
  }

  const procesos = data?.procesos ?? [];
  const resumen = data?.resumen ?? null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <AdminPanelSwitcher current="thc" />
          <button
            onClick={cerrarSesion}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <LogOut size={13} />
            {cerrandoSesion ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <AdminNav current="/admin/cron" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Título + refresh */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Procesos automáticos (CRON)</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Vista informativa. Los horarios reales están en pg_cron — no accesibles desde el panel.
            </p>
          </div>
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors border border-gray-700 rounded-lg px-3 py-2 hover:border-gray-600"
          >
            <RefreshCw size={12} className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        {/* Aviso pg_cron */}
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-gray-700/50 bg-gray-900/60 px-4 py-3 text-xs text-gray-400">
          <HelpCircle size={13} className="text-gray-500 shrink-0 mt-0.5" />
          <span>
            <strong className="text-gray-300">Nota:</strong> pg_cron está habilitado en este proyecto pero la tabla{" "}
            <span className="font-mono text-gray-300">cron.job</span> no es accesible desde el panel (requiere acceso directo a la DB).
            Esta vista muestra un manifest estático de procesos conocidos + datos reales de{" "}
            <span className="font-mono text-gray-300">log_funciones</span>.
          </span>
        </div>

        {/* Resumen */}
        {resumen && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">Total procesos</p>
              <p className="text-2xl font-bold text-gray-100">{resumen.total_procesos}</p>
            </div>
            <div className={`rounded-xl border px-4 py-3 ${resumen.con_error_reciente > 0 ? "border-red-900/40 bg-red-950/20" : "border-gray-800 bg-gray-900/60"}`}>
              <p className="text-xs text-gray-500 mb-1">Con error reciente</p>
              <p className={`text-2xl font-bold ${resumen.con_error_reciente > 0 ? "text-red-300" : "text-gray-400"}`}>
                {resumen.con_error_reciente}
              </p>
            </div>
            <div className={`rounded-xl border px-4 py-3 ${resumen.sin_datos > 0 ? "border-amber-900/30 bg-amber-950/20" : "border-gray-800 bg-gray-900/60"}`}>
              <p className="text-xs text-gray-500 mb-1">Sin datos de ejecución</p>
              <p className={`text-2xl font-bold ${resumen.sin_datos > 0 ? "text-amber-300" : "text-gray-400"}`}>
                {resumen.sin_datos}
              </p>
            </div>
          </div>
        )}

        {/* Loading */}
        {cargando && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 text-sm text-gray-400">
            <span className="animate-pulse">Cargando procesos…</span>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Process list */}
        {!cargando && !errorMsg && procesos.length > 0 && (
          <div className="space-y-3">
            {procesos.map((proc) => {
              const hasError = proc.stats?.ultimo_exito === false;
              const noData = !proc.stats?.ultima_ejecucion;
              const rowBorder = hasError
                ? "border-red-800/40"
                : noData
                ? "border-gray-800/40"
                : "border-gray-700/40";

              const logHref = `/admin/logs?nombre_funcion=${encodeURIComponent(proc.funcion)}`;

              return (
                <div
                  key={proc.id}
                  className={`rounded-xl border bg-gray-900/60 px-5 py-4 ${rowBorder} ${hasError ? "bg-red-950/10" : ""}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: name + description */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <StatusBadge stats={proc.stats} />
                        <span className="text-sm font-semibold text-gray-100">{proc.nombre}</span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border font-mono ${
                            TIPO_CLS[proc.tipo] ?? "border-gray-700 bg-gray-800 text-gray-400"
                          }`}
                        >
                          {proc.tipo}
                        </span>
                        {CATEGORIA_LABEL[proc.categoria] && (
                          <span className="text-xs text-gray-600">
                            {CATEGORIA_LABEL[proc.categoria]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mb-2 max-w-2xl">{proc.descripcion}</p>
                      <div className="flex items-center gap-1.5 text-xs text-gray-600 font-mono">
                        <Clock size={11} />
                        {proc.frecuencia}
                      </div>
                    </div>

                    {/* Right: stats */}
                    <div className="shrink-0 text-right space-y-1 min-w-[200px]">
                      {proc.stats?.ultima_ejecucion ? (
                        <>
                          <div className="text-xs text-gray-400">
                            {fmtDatetime(proc.stats.ultima_ejecucion)}
                          </div>
                          <div className="text-xs text-gray-600">
                            {fmtRelative(proc.stats.ultima_ejecucion)}
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            {proc.stats.ultimo_exito === true ? (
                              <Check size={11} className="text-green-400" />
                            ) : proc.stats.ultimo_exito === false ? (
                              <X size={11} className="text-red-400" />
                            ) : null}
                            <span
                              className={`font-mono text-xs ${
                                proc.stats.ultimo_exito === false ? "text-red-300" : "text-gray-400"
                              }`}
                            >
                              {proc.stats.ultimo_resultado || "—"}
                            </span>
                          </div>
                          {proc.stats.errores_recientes > 0 && (
                            <div className="flex items-center justify-end gap-1 text-xs text-amber-400">
                              <AlertTriangle size={10} />
                              {proc.stats.errores_recientes} errores recientes
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-700 italic">Sin ejecuciones recientes en log</span>
                      )}
                    </div>
                  </div>

                  {/* Footer: function name + link to logs */}
                  <div className="mt-3 pt-3 border-t border-gray-800/60 flex items-center justify-between">
                    <span className="font-mono text-xs text-violet-400/80">{proc.funcion}</span>
                    <a
                      href={logHref}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      <ExternalLink size={11} />
                      Ver en logs
                    </a>
                  </div>

                  {/* Error detail if last run was error */}
                  {proc.stats?.ultimo_error && proc.stats.ultimo_exito === false && (
                    <div className="mt-2 px-3 py-2 rounded-lg border border-red-800/40 bg-red-950/20 text-xs">
                      <span className="text-red-400 font-semibold">Último error: </span>
                      <span className="text-red-300/80 font-mono">{proc.stats.ultimo_error.resultado}</span>
                      <span className="text-gray-600 ml-2">{fmtRelative(proc.stats.ultimo_error.fecha)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!cargando && !errorMsg && procesos.length === 0 && (
          <div className="text-center py-16 text-gray-600 text-sm">
            Sin procesos definidos
          </div>
        )}

        {/* Pending / known limitations */}
        <div className="mt-8 rounded-xl border border-gray-800/50 bg-gray-900/40 px-5 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Pendientes / limitaciones conocidas
          </p>
          <ul className="space-y-1.5 text-xs text-gray-600">
            <li>• Los horarios reales de pg_cron solo son visibles con acceso directo a la DB (<span className="font-mono">SELECT * FROM cron.job</span>).</li>
            <li>• No se implementó: activar/desactivar cron real, editar horarios, crear o borrar jobs.</li>
            <li>• <span className="font-mono">fn_sql_sniper_sender</span> es una función SQL interna; su log aparece en <span className="font-mono">log_funciones</span> con <span className="font-mono">creado_por=&apos;pg_cron&apos;</span>.</li>
            <li>• Los sub-procesos (<span className="font-mono">ef_genera_guarda_contenido_premium</span>, <span className="font-mono">ef_run_encolador_premium</span>) son llamados desde el orquestador, no directamente desde pg_cron.</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
