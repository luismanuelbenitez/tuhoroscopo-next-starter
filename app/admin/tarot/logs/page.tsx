"use client";
import { useState, useEffect } from "react";
import {
  MessageCircle,
  LogOut,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";

// ============================================================================
// Types
// ============================================================================

interface TarotLog {
  id: string;
  orden_id: string | null;
  cliente_id: string | null;
  evento: string;
  nivel: string;
  mensaje: string | null;
  payload: Record<string, unknown>;
  duracion_ms: number | null;
  funcion_origen: string | null;
  created_at: string;
}

interface Paginacion {
  total_sql: number;
  total_devuelto: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

// ============================================================================
// Badges & helpers
// ============================================================================

const NIVEL_BADGE: Record<string, { label: string; cls: string }> = {
  debug:    { label: "debug",    cls: "bg-gray-800 text-gray-500" },
  info:     { label: "info",     cls: "bg-sky-900/50 text-sky-300" },
  warning:  { label: "warning",  cls: "bg-amber-900/50 text-amber-300" },
  error:    { label: "error",    cls: "bg-red-900/50 text-red-300" },
  critical: { label: "critical", cls: "bg-red-900/50 text-red-400 font-bold" },
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", {
    timeZone: "America/Montevideo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

// ============================================================================
// Filtros
// ============================================================================

interface Filtros {
  buscar: string;
  nivel: string;
  funcion_origen: string;
  orden_id: string;
  solo_errores: boolean;
  fecha_desde: string;
  fecha_hasta: string;
  offset: number;
}

const FILTROS_INIT: Filtros = {
  buscar: "",
  nivel: "",
  funcion_origen: "",
  orden_id: "",
  solo_errores: false,
  fecha_desde: "",
  fecha_hasta: "",
  offset: 0,
};

const LIMIT = 100;

// ============================================================================
// Page
// ============================================================================

export default function TarotLogsPage() {
  const [inputBuscar, setInputBuscar]       = useState("");
  const [inputOrdenId, setInputOrdenId]     = useState("");
  const [filtros, setFiltros]               = useState<Filtros>(FILTROS_INIT);
  const [logs, setLogs]                     = useState<TarotLog[]>([]);
  const [paginacion, setPaginacion]         = useState<Paginacion | null>(null);
  const [cargando, setCargando]             = useState(false);
  const [errorMsg, setErrorMsg]             = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [expandedId, setExpandedId]         = useState<string | null>(null);

  useEffect(() => {
    async function doFetch() {
      setCargando(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (filtros.buscar)         params.set("buscar",         filtros.buscar);
      if (filtros.nivel)          params.set("nivel",          filtros.nivel);
      if (filtros.funcion_origen) params.set("funcion_origen", filtros.funcion_origen);
      if (filtros.orden_id)       params.set("orden_id",       filtros.orden_id);
      if (filtros.solo_errores)   params.set("solo_errores",   "true");
      if (filtros.fecha_desde)    params.set("fecha_desde",    filtros.fecha_desde);
      if (filtros.fecha_hasta)    params.set("fecha_hasta",    filtros.fecha_hasta);
      params.set("offset", String(filtros.offset));
      params.set("limit",  String(LIMIT));

      try {
        const r = await fetch(`/api/admin/tarot/logs?${params.toString()}`);
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
        } else {
          setLogs(json.logs ?? []);
          setPaginacion(json.paginacion ?? null);
        }
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : "Error de red");
      } finally {
        setCargando(false);
      }
    }
    doFetch();
  }, [filtros]);

  function handleAplicar() {
    setFiltros({
      ...filtros,
      buscar: inputBuscar.trim(),
      orden_id: inputOrdenId.trim(),
      offset: 0,
    });
  }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleAplicar();
  }
  function handleFiltroSelect(key: keyof Omit<Filtros, "offset" | "buscar" | "orden_id" | "solo_errores">, val: string) {
    setFiltros({ ...filtros, [key]: val, offset: 0 });
  }
  function handleSoloErrores(val: boolean) {
    setFiltros({ ...filtros, solo_errores: val, nivel: "", offset: 0 });
  }
  function handleAnterior() {
    setFiltros({ ...filtros, offset: Math.max(0, filtros.offset - LIMIT) });
  }
  function handleSiguiente() {
    if (paginacion?.next_offset == null) return;
    setFiltros({ ...filtros, offset: paginacion.next_offset });
  }
  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  const total = paginacion?.total_sql ?? 0;
  const devuelto = paginacion?.total_devuelto ?? logs.length;
  const desde = total === 0 ? 0 : filtros.offset + 1;
  const hasta = Math.min(filtros.offset + LIMIT, total);

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle size={22} className="text-violet-400" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">Panel THC</h1>
              <p className="text-xs text-gray-500 leading-tight">Administración operativa</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            <LogOut size={15} />
            {cerrandoSesion ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
        <div className="max-w-6xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <AdminNav current="/admin/tarot" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">

        {/* Título */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">🪵 Logs de Tarot</h2>
          <a
            href="/admin/tarot"
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            ← Órdenes
          </a>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-4">

          {/* Buscar */}
          <div className="flex items-center gap-1 flex-1 min-w-[180px] border border-gray-700 rounded-lg bg-gray-900 px-3 py-2">
            <Search size={14} className="text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Buscar en logs…"
              value={inputBuscar}
              onChange={(e) => setInputBuscar(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>

          {/* Orden ID */}
          <div className="flex items-center gap-1 min-w-[200px] border border-gray-700 rounded-lg bg-gray-900 px-3 py-2">
            <input
              type="text"
              placeholder="orden_id (uuid)…"
              value={inputOrdenId}
              onChange={(e) => setInputOrdenId(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none font-mono"
            />
          </div>

          {/* Nivel */}
          <select
            value={filtros.nivel}
            onChange={(e) => { handleFiltroSelect("nivel", e.target.value); handleSoloErrores(false); }}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los niveles</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
            <option value="critical">critical</option>
          </select>

          {/* Función */}
          <select
            value={filtros.funcion_origen}
            onChange={(e) => handleFiltroSelect("funcion_origen", e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todas las funciones</option>
            <option value="ef_tarot_crear_orden">ef_tarot_crear_orden</option>
            <option value="ef_tarot_generar_lectura">ef_tarot_generar_lectura</option>
            <option value="ef_tarot_generar_pdf">ef_tarot_generar_pdf</option>
            <option value="ef_tarot_webhook_mp">ef_tarot_webhook_mp</option>
            <option value="ef_tarot_admin_listar_ordenes">ef_tarot_admin_listar_ordenes</option>
          </select>

          {/* Fechas */}
          <input
            type="date"
            value={filtros.fecha_desde}
            onChange={(e) => setFiltros({ ...filtros, fecha_desde: e.target.value, offset: 0 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          />
          <input
            type="date"
            value={filtros.fecha_hasta}
            onChange={(e) => setFiltros({ ...filtros, fecha_hasta: e.target.value, offset: 0 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          />

          {/* Solo errores */}
          <button
            onClick={() => handleSoloErrores(!filtros.solo_errores)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
              filtros.solo_errores
                ? "border-red-700 bg-red-900/40 text-red-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
            }`}
          >
            Solo errores
          </button>

          {/* Buscar */}
          <button
            onClick={handleAplicar}
            className="border border-violet-700 bg-violet-800/40 hover:bg-violet-700/60 text-violet-200 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Buscar
          </button>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Cargando */}
        {cargando && (
          <div className="mb-4 px-4 py-2.5 rounded-lg border border-gray-800 bg-gray-900/50 text-sm text-gray-400 animate-pulse">
            Cargando logs…
          </div>
        )}

        {/* Logs */}
        {!cargando && (
          <div className="space-y-1">
            {logs.length === 0 && !errorMsg && (
              <p className="text-center text-gray-500 text-sm py-10">Sin resultados para estos filtros.</p>
            )}
            {logs.map((log) => {
              const nivelBadge = NIVEL_BADGE[log.nivel] ?? { label: log.nivel, cls: "bg-gray-800 text-gray-400" };
              const isExpanded = expandedId === log.id;
              const isError = log.nivel === "error" || log.nivel === "critical";

              return (
                <div
                  key={log.id}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className={`rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${
                    isError
                      ? "border-red-800/40 bg-red-950/20 hover:bg-red-950/30"
                      : "border-gray-800 bg-gray-900/40 hover:bg-gray-900/70"
                  }`}
                >
                  {/* Fila principal */}
                  <div className="flex items-center gap-3 text-sm">
                    <Badge text={nivelBadge.label} cls={nivelBadge.cls} />
                    <span className="font-mono text-xs text-gray-400 shrink-0">{fmt(log.created_at)}</span>
                    <span className="text-gray-300 font-medium truncate">{log.evento}</span>
                    {log.funcion_origen && (
                      <span className="ml-auto font-mono text-xs text-gray-600 shrink-0 hidden sm:block">
                        {log.funcion_origen}
                      </span>
                    )}
                    {log.duracion_ms != null && (
                      <span className="font-mono text-xs text-gray-600 shrink-0">{log.duracion_ms}ms</span>
                    )}
                  </div>

                  {/* Mensaje */}
                  {log.mensaje && (
                    <p className="mt-1 text-xs text-gray-500 truncate">{log.mensaje}</p>
                  )}

                  {/* Expandido */}
                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-gray-700/50 pt-3">
                      {log.orden_id && (
                        <p className="text-xs text-gray-400">
                          <span className="text-gray-600">orden_id: </span>
                          <span className="font-mono">{log.orden_id}</span>
                        </p>
                      )}
                      {log.cliente_id && (
                        <p className="text-xs text-gray-400">
                          <span className="text-gray-600">cliente_id: </span>
                          <span className="font-mono">{log.cliente_id}</span>
                        </p>
                      )}
                      {Object.keys(log.payload ?? {}).length > 0 && (
                        <pre className="text-xs text-gray-400 bg-gray-800/60 rounded-lg px-3 py-2 overflow-x-auto max-h-48">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Paginación */}
        {!cargando && paginacion && total > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
            <span>
              {desde}–{hasta} de {total} logs
              {devuelto !== (hasta - desde + 1) && (
                <span className="ml-2 text-xs text-gray-600">(filtrados en memoria: {devuelto})</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAnterior}
                disabled={filtros.offset === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
                Anterior
              </button>
              <button
                onClick={handleSiguiente}
                disabled={paginacion.next_offset == null}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
