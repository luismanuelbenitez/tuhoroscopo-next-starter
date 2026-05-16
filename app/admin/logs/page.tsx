"use client";
import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  LogOut,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Search,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";

// ===========================================================================
// Types
// ===========================================================================

interface LogEntry {
  id: number;
  nombre_funcion: string;
  fecha_ejecucion: string | null;
  resultado: string;
  detalle: Record<string, unknown> | null;
  exito: boolean | null;
  creado_por: string | null;
}

interface Paginacion {
  total_sql: number;
  total_devuelto: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

interface ApiResponse {
  ok: boolean;
  healthy: boolean;
  paginacion: Paginacion | null;
  conteos_pagina: {
    por_funcion?: Record<string, number>;
    por_resultado?: Record<string, number>;
    por_exito?: Record<string, number>;
  };
  logs: LogEntry[];
  warnings: string[];
}

interface Filtros {
  nombre_funcion: string;
  resultado: string;
  buscar: string;
  solo_errores: boolean;
  solo_exitos: boolean;
  fecha_desde: string;
  fecha_hasta: string;
  limit: number;
  offset: number;
}

// ===========================================================================
// Constants
// ===========================================================================

const DEFAULT_FILTROS: Filtros = {
  nombre_funcion: "",
  resultado: "",
  buscar: "",
  solo_errores: false,
  solo_exitos: false,
  fecha_desde: "",
  fecha_hasta: "",
  limit: 50,
  offset: 0,
};

// ===========================================================================
// Helpers
// ===========================================================================

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function buildQueryString(f: Filtros): string {
  const params = new URLSearchParams();
  if (f.nombre_funcion) params.set("nombre_funcion", f.nombre_funcion);
  if (f.resultado) params.set("resultado", f.resultado);
  if (f.buscar) params.set("buscar", f.buscar);
  if (f.solo_errores) params.set("solo_errores", "true");
  if (f.solo_exitos) params.set("solo_exitos", "true");
  if (f.fecha_desde) params.set("fecha_desde", f.fecha_desde);
  if (f.fecha_hasta) params.set("fecha_hasta", f.fecha_hasta);
  params.set("limit", String(f.limit));
  params.set("offset", String(f.offset));
  return params.toString();
}

function ExitoIcon({ exito }: { exito: boolean | null }) {
  if (exito === true) return <Check size={13} className="text-green-400" />;
  if (exito === false) return <X size={13} className="text-red-400" />;
  return <span className="text-gray-600 text-xs">—</span>;
}

// ===========================================================================
// Detail panel
// ===========================================================================

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-800/60 last:border-0">
      <span className="text-gray-500 text-xs w-36 shrink-0">{label}</span>
      <span className="text-gray-200 text-xs break-all">{value ?? "—"}</span>
    </div>
  );
}

function LogDetalle({ log, onClose }: { log: LogEntry; onClose: () => void }) {
  const [showDetalle, setShowDetalle] = useState(true);
  const isError = log.exito === false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className={`relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border rounded-2xl shadow-2xl mx-4 ${isError ? "border-red-800/50" : "border-gray-700"}`}>
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700/60 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ExitoIcon exito={log.exito} />
            <span className="text-white font-semibold text-sm">
              Log #{log.id}
            </span>
            <span className="text-gray-500 text-xs font-mono truncate">· {log.nombre_funcion}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 ml-2"
            aria-label="Cerrar detalle"
          >
            <X size={16} />
          </button>
        </div>

      <div className="px-5 py-4 space-y-5">
        {/* Datos principales */}
        <div>
          <DataRow label="Función" value={<span className="font-mono text-violet-300">{log.nombre_funcion}</span>} />
          <DataRow label="Resultado" value={<span className="font-mono">{log.resultado || "—"}</span>} />
          <DataRow label="Éxito" value={
            <span className={log.exito === true ? "text-green-400" : log.exito === false ? "text-red-400" : "text-gray-500"}>
              {log.exito === true ? "sí" : log.exito === false ? "no" : "—"}
            </span>
          } />
          <DataRow label="Fecha ejecución" value={fmtDatetime(log.fecha_ejecucion)} />
          <DataRow label="Creado por" value={log.creado_por} />
          <DataRow label="ID" value={<span className="font-mono text-gray-400">{log.id}</span>} />
        </div>

        {/* Detalle JSONB */}
        {log.detalle !== null && (
          <div>
            <button
              onClick={() => setShowDetalle((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors font-semibold uppercase tracking-wide"
            >
              {showDetalle ? "▲ Ocultar detalle" : "▼ Ver detalle"}
            </button>
            {showDetalle && (
              <pre className={`mt-2 text-xs rounded-lg border p-4 overflow-x-auto max-h-80 ${
                isError
                  ? "bg-red-950/40 border-red-800/40 text-red-200"
                  : "bg-gray-950 border-gray-700 text-gray-300"
              }`}>
                {JSON.stringify(log.detalle, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================

export default function LogsPage() {
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(DEFAULT_FILTROS);
  const [pendiente, setPendiente] = useState<Filtros>(DEFAULT_FILTROS);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const cargar = useCallback(async (f: Filtros) => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/logs?${buildQueryString(f)}`);
      const json: ApiResponse = await res.json();
      if (!json.ok) {
        setErrorMsg((json as unknown as Record<string, string>).detalle ?? "Error al cargar logs");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setErrorMsg("Error de red al cargar logs");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(filtros);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFiltro(patch: Partial<Filtros>) {
    const next: Filtros = { ...filtros, ...patch, offset: 0 };
    setSelectedId(null);
    setFiltros(next);
    setPendiente(next);
    cargar(next);
  }

  function handleBuscar() {
    const next = { ...pendiente, offset: 0 };
    setSelectedId(null);
    setFiltros(next);
    cargar(next);
  }

  function handlePaginar(newOffset: number) {
    const next = { ...filtros, offset: newOffset };
    setSelectedId(null);
    setFiltros(next);
    cargar(next);
  }

  function handleRowClick(l: LogEntry) {
    setSelectedId((prev) => (prev === l.id ? null : l.id));
  }

  function handleFuncionChip(fn: string) {
    applyFiltro({ nombre_funcion: filtros.nombre_funcion === fn ? "" : fn });
  }

  async function cerrarSesion() {
    setCerrandoSesion(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
      window.location.href = "/admin/login";
    } catch {
      setCerrandoSesion(false);
    }
  }

  const logs = data?.logs ?? [];
  const paginacion = data?.paginacion ?? null;
  const conteos = data?.conteos_pagina ?? {};
  const warnings = data?.warnings ?? [];

  const porFuncion = Object.entries(conteos.por_funcion ?? {})
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  const porExito = conteos.por_exito ?? {};
  const errCount = porExito["exito_false"] ?? 0;
  const okCount = porExito["exito_true"] ?? 0;

  const selectedLog = logs.find((l) => l.id === selectedId) ?? null;

  const totalDisplay = paginacion
    ? (pendiente.buscar ? paginacion.total_devuelto : paginacion.total_sql)
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle size={22} className="text-violet-400" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">Panel THC</h1>
              <p className="text-xs text-gray-500 leading-tight">Administración operativa</p>
            </div>
          </div>
          <button
            onClick={cerrarSesion}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <LogOut size={13} />
            {cerrandoSesion ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
        {/* Nav */}
        <div className="max-w-7xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <AdminNav current="/admin/logs" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Nombre función */}
          <div className="flex items-center gap-1.5 border border-gray-700 rounded-lg bg-gray-900 px-3 py-2 flex-1 min-w-[200px] max-w-xs">
            <Search size={13} className="text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Función (ej. ef_whatsapp_sender)"
              value={pendiente.nombre_funcion}
              onChange={(e) => setPendiente((p) => ({ ...p, nombre_funcion: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
              className="bg-transparent text-sm text-white placeholder-gray-600 flex-1 focus:outline-none"
            />
          </div>

          {/* Buscar texto */}
          <div className="flex items-center gap-1.5 border border-gray-700 rounded-lg bg-gray-900 px-3 py-2 flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Buscar en detalle…"
              value={pendiente.buscar}
              onChange={(e) => setPendiente((p) => ({ ...p, buscar: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
              className="bg-transparent text-sm text-white placeholder-gray-600 flex-1 focus:outline-none"
            />
          </div>

          {/* Fecha desde */}
          <input
            type="date"
            value={pendiente.fecha_desde}
            onChange={(e) => setPendiente((p) => ({ ...p, fecha_desde: e.target.value }))}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          />

          {/* Fecha hasta */}
          <input
            type="date"
            value={pendiente.fecha_hasta}
            onChange={(e) => setPendiente((p) => ({ ...p, fecha_hasta: e.target.value }))}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          />

          {/* Buscar */}
          <button
            onClick={handleBuscar}
            className="border border-violet-700 bg-violet-800/40 hover:bg-violet-700/60 text-violet-200 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Buscar
          </button>

          {/* Solo errores */}
          <button
            onClick={() =>
              applyFiltro({
                solo_errores: !filtros.solo_errores,
                solo_exitos: false,
              })
            }
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
              filtros.solo_errores
                ? "border-red-700 bg-red-900/40 text-red-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
            }`}
          >
            Solo errores {errCount > 0 && `(${errCount})`}
          </button>

          {/* Solo éxitos */}
          <button
            onClick={() =>
              applyFiltro({
                solo_exitos: !filtros.solo_exitos,
                solo_errores: false,
              })
            }
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
              filtros.solo_exitos
                ? "border-green-700 bg-green-900/40 text-green-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
            }`}
          >
            Solo éxitos {okCount > 0 && `(${okCount})`}
          </button>

          {/* Limpiar fechas */}
          {(filtros.fecha_desde || filtros.fecha_hasta) && (
            <button
              onClick={() => {
                setPendiente((p) => ({ ...p, fecha_desde: "", fecha_hasta: "" }));
                applyFiltro({ fecha_desde: "", fecha_hasta: "" });
              }}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-2 transition-colors"
            >
              Limpiar fechas
            </button>
          )}
        </div>

        {/* Chips por función (clickables) */}
        {porFuncion.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {porFuncion.map(([fn, count]) => (
              <button
                key={fn}
                onClick={() => handleFuncionChip(fn)}
                className={`text-xs px-2.5 py-1 rounded-full border font-mono transition-colors ${
                  filtros.nombre_funcion === fn
                    ? "border-violet-600 bg-violet-900/50 text-violet-300"
                    : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                }`}
              >
                {fn}: {count}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {cargando && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 text-sm text-gray-400">
            <span className="animate-pulse">Cargando logs…</span>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Warnings del sistema */}
        {warnings.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {warnings.map((w) => (
              <span
                key={w}
                className="text-xs px-2 py-0.5 rounded border border-amber-800/50 bg-amber-950/40 text-amber-300 font-mono"
              >
                {w}
              </span>
            ))}
          </div>
        )}

        {/* Table */}
        {!cargando && !errorMsg && (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/60">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-16">OK</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Función</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Resultado</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Fecha / Hora</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Detalle (resumen)</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Creado por</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-gray-600 text-sm">
                        Sin resultados para los filtros actuales
                      </td>
                    </tr>
                  )}
                  {logs.map((l) => {
                    const isSelected = l.id === selectedId;
                    const isError = l.exito === false;
                    const rowCls = isSelected
                      ? "bg-violet-950/20 border-violet-800/30"
                      : isError
                      ? "bg-red-950/20"
                      : "";

                    // Build a short summary from detalle keys
                    const detalleSummary = l.detalle
                      ? Object.keys(l.detalle).slice(0, 4).join(", ")
                      : "";

                    return (
                      <tr
                        key={l.id}
                        onClick={() => handleRowClick(l)}
                        className={`border-b border-gray-800/50 cursor-pointer transition-colors hover:bg-gray-800/30 ${rowCls}`}
                      >
                        <td className="px-4 py-3">
                          <ExitoIcon exito={l.exito} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-violet-300 truncate block max-w-[220px]">
                            {l.nombre_funcion || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-mono text-xs ${isError ? "text-red-300" : "text-gray-300"}`}>
                            {l.resultado || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {fmtDatetime(l.fecha_ejecucion)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-[260px] truncate">
                          {detalleSummary || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {l.creado_por ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {paginacion && totalDisplay > 0 && (
              <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                <span>
                  {paginacion.offset + 1}–{Math.min(paginacion.offset + paginacion.limit, totalDisplay)} de {totalDisplay}
                  {pendiente.buscar && paginacion.total_sql !== paginacion.total_devuelto && (
                    <span className="ml-1 text-gray-600">
                      (filtrado en página de {paginacion.total_sql} SQL)
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={paginacion.offset === 0}
                    onClick={() => handlePaginar(Math.max(0, paginacion.offset - paginacion.limit))}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 disabled:opacity-40 hover:bg-gray-800 transition-colors"
                  >
                    <ChevronLeft size={13} /> Anterior
                  </button>
                  <button
                    disabled={paginacion.next_offset === null}
                    onClick={() => paginacion.next_offset !== null && handlePaginar(paginacion.next_offset)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 disabled:opacity-40 hover:bg-gray-800 transition-colors"
                  >
                    Siguiente <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}

          </>
        )}
      </main>
      {selectedLog && (
        <LogDetalle log={selectedLog} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
