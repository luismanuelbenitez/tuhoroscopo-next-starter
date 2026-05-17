"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  MessageCircle,
  LogOut,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Search,
  Copy,
  ExternalLink,
  ShieldAlert,
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

interface ResumenGlobal {
  total_global: number | null;
  errores_global: number | null;
  ultimo_error: {
    nombre_funcion: string;
    resultado: string;
    fecha_ejecucion: string | null;
  } | null;
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
  resumen_global?: ResumenGlobal;
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

interface DetectedRef {
  key: string;
  label: string;
  value: string | number;
  href: string | null;
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

const SENSITIVE_KEY_PATTERNS = [
  "token", "api_key", "apikey", "bearer", "service_role", "authorization",
  "access_token", "refresh_token", "whatsapp_internal_key",
  "supabase_service_role_key", "secret", "password", "credential",
  "private_key", "client_secret", "_key",
];

const REF_MAP: Record<string, { label: string; href: string | null }> = {
  id_suscriptor: { label: "Suscriptor", href: "/admin/suscriptores" },
  id_contenido: { label: "Contenido", href: "/admin/contenido" },
  id_mensaje: { label: "Mensaje", href: "/admin/mensajes-problematicos" },
  id_suscripcion: { label: "Suscripción", href: "/admin/suscripciones" },
  preapproval_id: { label: "Preapproval ID", href: null },
  payment_id: { label: "Payment ID", href: null },
  mp_payment_id: { label: "MP Payment ID", href: null },
  whatsapp: { label: "WhatsApp", href: null },
  whatsapp_destino: { label: "WhatsApp destino", href: null },
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

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => k.includes(p));
}

function sanitizeObj(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSensitiveKey(k)) {
      out[k] = "***redacted***";
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === "object"
          ? sanitizeObj(item as Record<string, unknown>)
          : item
      );
    } else if (v && typeof v === "object") {
      out[k] = sanitizeObj(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function parseDetalle(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      return { _raw: raw };
    } catch {
      return { _raw: raw };
    }
  }
  return null;
}

function detectRefs(obj: Record<string, unknown>, depth = 0): DetectedRef[] {
  if (depth > 3) return [];
  const refs: DetectedRef[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const config = REF_MAP[k.toLowerCase()];
    if (config && (typeof v === "string" || typeof v === "number") && v !== null && v !== "") {
      refs.push({ key: k, label: config.label, value: v as string | number, href: config.href });
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      refs.push(...detectRefs(v as Record<string, unknown>, depth + 1));
    }
  }
  const seen = new Set<string>();
  return refs.filter((r) => {
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });
}

function buildDetalleSummary(detalle: Record<string, unknown> | null): string {
  if (!detalle) return "";
  const parts: string[] = [];

  if (detalle.error && typeof detalle.error === "string") {
    parts.push(`err: ${detalle.error.slice(0, 60)}`);
  }

  const idFields = ["id_suscriptor", "id_mensaje", "id_contenido", "id_suscripcion"];
  for (const f of idFields) {
    if (detalle[f] != null) parts.push(`${f.replace("id_", "#")}: ${detalle[f]}`);
  }

  const opFields = ["accion", "estado_anterior", "motivo_admin"];
  for (const f of opFields) {
    if (detalle[f] != null && parts.length < 4) {
      parts.push(`${f}: ${String(detalle[f]).slice(0, 25)}`);
    }
  }

  if (parts.length === 0) {
    Object.entries(detalle)
      .slice(0, 3)
      .forEach(([k, v]) => {
        if (typeof v !== "object" && v != null) {
          parts.push(`${k}: ${String(v).slice(0, 20)}`);
        }
      });
  }

  return parts.slice(0, 3).join(" · ");
}

function getQuickRangeDates(range: "24h" | "7d" | "30d"): { fecha_desde: string; fecha_hasta: string } {
  const now = new Date();
  const daysBack = range === "24h" ? 1 : range === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return {
    fecha_desde: from.toISOString().split("T")[0],
    fecha_hasta: "",
  };
}

function ExitoIcon({ exito }: { exito: boolean | null }) {
  if (exito === true) return <Check size={13} className="text-green-400" />;
  if (exito === false) return <X size={13} className="text-red-400" />;
  return <span className="text-gray-600 text-xs">—</span>;
}

// ===========================================================================
// LogDetalle modal
// ===========================================================================

function LogDetalle({ log, onClose }: { log: LogEntry; onClose: () => void }) {
  const [copied, setCopied] = useState<"json" | "resumen" | null>(null);

  const detalleObj = useMemo(() => parseDetalle(log.detalle), [log.detalle]);
  const detalleSanitized = useMemo(() => (detalleObj ? sanitizeObj(detalleObj) : null), [detalleObj]);
  const refs = useMemo(() => (detalleObj ? detectRefs(detalleObj) : []), [detalleObj]);
  const hasRedacted = useMemo(() => {
    if (!detalleSanitized) return false;
    return JSON.stringify(detalleSanitized).includes("***redacted***");
  }, [detalleSanitized]);

  const isError = log.exito === false;

  function copyJson() {
    if (!detalleSanitized) return;
    navigator.clipboard.writeText(JSON.stringify(detalleSanitized, null, 2)).catch(() => {});
    setCopied("json");
    setTimeout(() => setCopied(null), 2000);
  }

  function copyResumen() {
    const lines = [
      `Log #${log.id}`,
      `Función: ${log.nombre_funcion}`,
      `Resultado: ${log.resultado}`,
      `Éxito: ${log.exito === true ? "Sí" : log.exito === false ? "No" : "—"}`,
      `Fecha: ${fmtDatetime(log.fecha_ejecucion)}`,
      `Creado por: ${log.creado_por ?? "—"}`,
    ].join("\n");
    navigator.clipboard.writeText(lines).catch(() => {});
    setCopied("resumen");
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className={`relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border rounded-2xl shadow-2xl mx-4 ${
          isError ? "border-red-800/50" : "border-gray-700"
        }`}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700/60 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ExitoIcon exito={log.exito} />
            <span className="text-white font-semibold text-sm">Log #{log.id}</span>
            <span className="text-gray-500 text-xs font-mono truncate">· {log.nombre_funcion}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              onClick={copyResumen}
              title="Copiar resumen"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-600"
            >
              <Copy size={11} />
              {copied === "resumen" ? "¡Copiado!" : "Resumen"}
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Cerrar detalle"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Datos principales */}
          <div>
            <div className="flex gap-2 py-1.5 border-b border-gray-800/60">
              <span className="text-gray-500 text-xs w-36 shrink-0">ID</span>
              <span className="text-gray-200 text-xs font-mono">{log.id}</span>
            </div>
            <div className="flex gap-2 py-1.5 border-b border-gray-800/60">
              <span className="text-gray-500 text-xs w-36 shrink-0">Función</span>
              <span className="text-violet-300 text-xs font-mono">{log.nombre_funcion || "—"}</span>
            </div>
            <div className="flex gap-2 py-1.5 border-b border-gray-800/60">
              <span className="text-gray-500 text-xs w-36 shrink-0">Resultado</span>
              <span className={`text-xs font-mono ${isError ? "text-red-300" : "text-gray-200"}`}>
                {log.resultado || "—"}
              </span>
            </div>
            <div className="flex gap-2 py-1.5 border-b border-gray-800/60">
              <span className="text-gray-500 text-xs w-36 shrink-0">Éxito</span>
              <span
                className={`text-xs font-semibold ${
                  log.exito === true
                    ? "text-green-400"
                    : log.exito === false
                    ? "text-red-400"
                    : "text-gray-500"
                }`}
              >
                {log.exito === true ? "Sí" : log.exito === false ? "No" : "—"}
              </span>
            </div>
            <div className="flex gap-2 py-1.5 border-b border-gray-800/60">
              <span className="text-gray-500 text-xs w-36 shrink-0">Fecha ejecución</span>
              <span className="text-gray-200 text-xs">
                {fmtDatetime(log.fecha_ejecucion)}
                {log.fecha_ejecucion && (
                  <span className="text-gray-600 ml-2">{fmtRelative(log.fecha_ejecucion)}</span>
                )}
              </span>
            </div>
            <div className="flex gap-2 py-1.5">
              <span className="text-gray-500 text-xs w-36 shrink-0">Creado por</span>
              <span className="text-gray-200 text-xs font-mono">{log.creado_por || "—"}</span>
            </div>
          </div>

          {/* Referencias detectadas */}
          {refs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Referencias detectadas
              </p>
              <div className="flex flex-wrap gap-2">
                {refs.map((ref) => (
                  <div
                    key={ref.key}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-700/60 bg-gray-800/60 text-xs"
                  >
                    <span className="text-gray-500">{ref.label}:</span>
                    <span className="font-mono text-gray-200">{ref.value}</span>
                    {ref.href && (
                      <a
                        href={ref.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-400 hover:text-violet-300 transition-colors ml-0.5"
                        title={`Ir a ${ref.label}`}
                      >
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detalle JSONB */}
          {detalleSanitized !== null && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Detalle
                </p>
                <div className="flex items-center gap-2">
                  {hasRedacted && (
                    <span className="flex items-center gap-1 text-xs text-amber-400/70">
                      <ShieldAlert size={11} />
                      secretos ocultados
                    </span>
                  )}
                  <button
                    onClick={copyJson}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-600"
                  >
                    <Copy size={11} />
                    {copied === "json" ? "¡Copiado!" : "Copiar JSON"}
                  </button>
                </div>
              </div>
              <pre
                className={`text-xs rounded-lg border p-4 overflow-x-auto max-h-80 whitespace-pre-wrap break-all ${
                  isError
                    ? "bg-red-950/40 border-red-800/40 text-red-200"
                    : "bg-gray-950 border-gray-700 text-gray-300"
                }`}
              >
                {JSON.stringify(detalleSanitized, null, 2)}
              </pre>
            </div>
          )}

          {log.detalle === null && (
            <p className="text-xs text-gray-600 italic">Sin detalle registrado.</p>
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

  function handleQuickRange(range: "24h" | "7d" | "30d") {
    const { fecha_desde, fecha_hasta } = getQuickRangeDates(range);
    setPendiente((p) => ({ ...p, fecha_desde, fecha_hasta }));
    applyFiltro({ fecha_desde, fecha_hasta });
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
  const resumenGlobal = data?.resumen_global ?? null;

  const porFuncion = Object.entries(conteos.por_funcion ?? {})
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  const porExito = conteos.por_exito ?? {};
  const errCount = porExito["exito_false"] ?? 0;
  const okCount = porExito["exito_true"] ?? 0;

  // Función con más errores en la página actual (only useful when solo_errores not active)
  const errorsByFuncion = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of logs) {
      if (l.exito === false) map[l.nombre_funcion] = (map[l.nombre_funcion] ?? 0) + 1;
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [logs]);
  const topErrorFuncion = errorsByFuncion[0]?.[0] ?? null;

  const selectedLog = logs.find((l) => l.id === selectedId) ?? null;

  const totalDisplay = paginacion
    ? (filtros.buscar ? paginacion.total_devuelto : paginacion.total_sql)
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
        <div className="max-w-7xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <AdminNav current="/admin/logs" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">

        {/* Resumen superior */}
        {data && (
          <div className="mb-5 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Total filtrado */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">Total (filtro actual)</p>
                <p className="text-2xl font-bold text-gray-100">
                  {(paginacion?.total_sql ?? 0).toLocaleString("es-AR")}
                </p>
              </div>

              {/* Errores globales */}
              <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-3">
                <p className="text-xs text-red-400/80 mb-1">Errores (histórico)</p>
                <p className="text-2xl font-bold text-red-300">
                  {resumenGlobal?.errores_global != null
                    ? resumenGlobal.errores_global.toLocaleString("es-AR")
                    : "—"}
                </p>
              </div>

              {/* Errores en página */}
              <div className={`rounded-xl border px-4 py-3 ${errCount > 0 ? "border-amber-900/40 bg-amber-950/20" : "border-gray-800 bg-gray-900/60"}`}>
                <p className="text-xs text-gray-500 mb-1">Errores (esta página)</p>
                <p className={`text-2xl font-bold ${errCount > 0 ? "text-amber-300" : "text-gray-400"}`}>
                  {errCount}
                </p>
              </div>

              {/* Éxitos en página */}
              <div className="rounded-xl border border-green-900/30 bg-green-950/20 px-4 py-3">
                <p className="text-xs text-green-500/70 mb-1">Éxitos (esta página)</p>
                <p className="text-2xl font-bold text-green-300">{okCount}</p>
              </div>
            </div>

            {/* Último error global */}
            {resumenGlobal?.ultimo_error && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-800/40 bg-red-950/15 px-4 py-2.5 text-xs">
                <AlertCircle size={13} className="text-red-400 shrink-0" />
                <span className="text-red-400/80 font-semibold shrink-0">Último error global:</span>
                <span className="font-mono text-red-300">{resumenGlobal.ultimo_error.nombre_funcion}</span>
                <span className="text-gray-700">·</span>
                <span className="text-red-300/70 font-mono">{resumenGlobal.ultimo_error.resultado}</span>
                <span className="text-gray-700">·</span>
                <span className="text-gray-500">{fmtDatetime(resumenGlobal.ultimo_error.fecha_ejecucion)}</span>
                <span className="text-gray-600">{fmtRelative(resumenGlobal.ultimo_error.fecha_ejecucion)}</span>
              </div>
            )}

            {/* Función con más errores (página actual) */}
            {topErrorFuncion && !filtros.solo_exitos && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Mayor fuente de errores en página:</span>
                <button
                  onClick={() => handleFuncionChip(topErrorFuncion)}
                  className="font-mono text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2"
                >
                  {topErrorFuncion}
                </button>
                <span>({errorsByFuncion[0][1]} errores)</span>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-3">
          {/* Nombre función */}
          <div className="flex items-center gap-1.5 border border-gray-700 rounded-lg bg-gray-900 px-3 py-2 flex-1 min-w-[180px] max-w-xs">
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
          <div className="flex items-center gap-1.5 border border-gray-700 rounded-lg bg-gray-900 px-3 py-2 flex-1 min-w-[160px] max-w-xs">
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
              applyFiltro({ solo_errores: !filtros.solo_errores, solo_exitos: false })
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
              applyFiltro({ solo_exitos: !filtros.solo_exitos, solo_errores: false })
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
              × fechas
            </button>
          )}
        </div>

        {/* Quick date ranges */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-600">Rango rápido:</span>
          {(["24h", "7d", "30d"] as const).map((range) => {
            const dates = getQuickRangeDates(range);
            const isActive = filtros.fecha_desde === dates.fecha_desde && !filtros.fecha_hasta;
            return (
              <button
                key={range}
                onClick={() => handleQuickRange(range)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  isActive
                    ? "border-violet-600 bg-violet-900/50 text-violet-300"
                    : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                }`}
              >
                {range === "24h" ? "Últimas 24h" : range === "7d" ? "Últimos 7 días" : "Últimos 30 días"}
              </button>
            );
          })}
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
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-10">OK</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Función</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Resultado</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Fecha / Hora</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Detalle</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Por</th>
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

                    const detalleSummary = buildDetalleSummary(
                      parseDetalle(l.detalle)
                    );

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
                          <span className="font-mono text-xs text-violet-300 truncate block max-w-[200px]">
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
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[260px] truncate">
                          {detalleSummary || <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
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
                  {paginacion.offset + 1}–{Math.min(paginacion.offset + paginacion.limit, totalDisplay)} de{" "}
                  {totalDisplay.toLocaleString("es-AR")}
                  {filtros.buscar && paginacion.total_sql !== paginacion.total_devuelto && (
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
                    onClick={() =>
                      paginacion.next_offset !== null && handlePaginar(paginacion.next_offset)
                    }
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
