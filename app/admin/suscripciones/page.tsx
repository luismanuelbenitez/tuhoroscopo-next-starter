"use client";
import { useState, useEffect, useCallback } from "react";
import {
  LogOut,
  AlertTriangle,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";

// ===========================================================================
// Types
// ===========================================================================

interface DiagnosticoAdmin {
  healthy: boolean;
  warnings: string[];
  estado_resumen: string;
  accion_sugerida: string;
}

interface Suscripcion {
  id: number;
  suscriptor_id: number | null;
  provider: string | null;
  preapproval_id_masked: string | null;
  external_reference: string | null;
  estado: string;
  provisional: boolean | null;
  auto_renovacion_activa: boolean | null;
  preapproval_status_mp: string | null;
  fecha_creacion: string | null;
  fecha_activacion_provisional: string | null;
  fecha_activacion_definitiva: string | null;
  fecha_vencimiento_actual: string | null;
  fecha_cancelacion: string | null;
  reason: string | null;
  currency_id: string | null;
  amount: number | null;
  frequency: number | null;
  frequency_type: string | null;
  codigo_descuento: string | null;
  codigo_descuento_id: number | null;
  descuento_estado: string | null;
  descuento_metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  diagnostico_admin: DiagnosticoAdmin | null;
}

interface Paginacion {
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

interface ApiResponse {
  ok: boolean;
  healthy: boolean;
  paginacion: Paginacion | null;
  conteos_pagina: {
    estado?: Record<string, number>;
    preapproval_status_mp?: Record<string, number>;
    diagnostico?: Record<string, number>;
    descuento_estado?: Record<string, number>;
  };
  suscripciones: Suscripcion[];
  warnings: string[];
}

interface Filtros {
  estado: string;
  preapproval_status_mp: string;
  solo_vencidas: boolean;
  solo_con_descuento: boolean;
  fecha_desde: string;
  fecha_hasta: string;
  limit: number;
  offset: number;
}

// ===========================================================================
// Constants
// ===========================================================================

const ESTADO_LOCAL_CLS: Record<string, string> = {
  activa: "bg-green-900/60 text-green-300 border border-green-700/50",
  activa_provisional: "bg-amber-900/60 text-amber-300 border border-amber-700/50",
  pendiente_autorizacion: "bg-sky-900/60 text-sky-300 border border-sky-700/50",
  cancelada: "bg-red-900/60 text-red-300 border border-red-700/50",
  finalizada: "bg-gray-800 text-gray-400 border border-gray-700/50",
};

const MP_STATUS_CLS: Record<string, string> = {
  authorized: "bg-green-900/60 text-green-300 border border-green-700/50",
  pending: "bg-amber-900/60 text-amber-300 border border-amber-700/50",
  paused: "bg-sky-900/60 text-sky-300 border border-sky-700/50",
  cancelled: "bg-red-900/60 text-red-300 border border-red-700/50",
  expired: "bg-gray-800 text-gray-400 border border-gray-700/50",
};

const DIAGNOSTICO_BG: Record<string, string> = {
  vencida: "bg-red-950/30",
  mp_no_operativo: "bg-red-950/30",
  provisional: "bg-amber-950/25",
  local_no_activa: "bg-amber-950/25",
  descuento_fallido: "bg-amber-950/25",
};

const DIAGNOSTICO_BOX_CLS: Record<string, string> = {
  ok: "border-green-800/50 bg-green-950/40 text-green-300",
  vencida: "border-red-800/50 bg-red-950/40 text-red-300",
  mp_no_operativo: "border-red-800/50 bg-red-950/40 text-red-300",
  provisional: "border-amber-800/50 bg-amber-950/40 text-amber-300",
  local_no_activa: "border-amber-800/50 bg-amber-950/40 text-amber-300",
  descuento_fallido: "border-amber-800/50 bg-amber-950/40 text-amber-300",
};

const DEFAULT_FILTROS: Filtros = {
  estado: "",
  preapproval_status_mp: "",
  solo_vencidas: false,
  solo_con_descuento: false,
  fecha_desde: "",
  fecha_hasta: "",
  limit: 50,
  offset: 0,
};

// ===========================================================================
// Helpers
// ===========================================================================

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return iso.slice(0, 10);
  } catch {
    return iso;
  }
}

function estadoLocalBadge(estado: string) {
  const cls = ESTADO_LOCAL_CLS[estado] ?? "bg-gray-800 text-gray-400 border border-gray-700/50";
  return (
    <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-mono ${cls}`}>
      {estado || "—"}
    </span>
  );
}

function mpStatusBadge(status: string | null) {
  if (!status) return <span className="text-gray-600 text-xs">—</span>;
  const cls = MP_STATUS_CLS[status] ?? "bg-gray-800 text-gray-400 border border-gray-700/50";
  return (
    <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-mono ${cls}`}>
      {status}
    </span>
  );
}

function rowBg(s: Suscripcion, isSelected: boolean): string {
  if (isSelected) return "bg-violet-950/20 border-violet-800/30";
  const dr = s.diagnostico_admin?.estado_resumen ?? "";
  return DIAGNOSTICO_BG[dr] ?? "";
}

function buildQueryString(f: Filtros): string {
  const params = new URLSearchParams();
  if (f.estado) params.set("estado", f.estado);
  if (f.preapproval_status_mp) params.set("preapproval_status_mp", f.preapproval_status_mp);
  if (f.solo_vencidas) params.set("solo_vencidas", "true");
  if (f.solo_con_descuento) params.set("solo_con_descuento", "true");
  if (f.fecha_desde) params.set("fecha_desde", f.fecha_desde);
  if (f.fecha_hasta) params.set("fecha_hasta", f.fecha_hasta);
  params.set("limit", String(f.limit));
  params.set("offset", String(f.offset));
  return params.toString();
}

// ===========================================================================
// Detail panel (inline)
// ===========================================================================

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-800/60 last:border-0">
      <span className="text-gray-500 text-xs w-44 shrink-0">{label}</span>
      <span className="text-gray-200 text-xs break-all">{value ?? "—"}</span>
    </div>
  );
}

function BoolIcon({ val }: { val: boolean | null }) {
  if (val === null) return <span className="text-gray-600 text-xs">—</span>;
  return val
    ? <Check size={13} className="text-green-400" />
    : <X size={13} className="text-red-400" />;
}

function SuscripcionDetalle({ item, onClose }: { item: Suscripcion; onClose: () => void }) {
  const [showDescMetadata, setShowDescMetadata] = useState(false);
  const diag = item.diagnostico_admin;
  const diagCls = DIAGNOSTICO_BOX_CLS[diag?.estado_resumen ?? ""] ?? DIAGNOSTICO_BOX_CLS["ok"];
  const hasDescuento = !!item.codigo_descuento;

  return (
    <div className="mt-4 border border-gray-700 rounded-xl bg-gray-900/70 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/60">
        <div className="flex items-center gap-2">
          {diag && (
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${diag.healthy ? "bg-green-500" : "bg-red-500"}`}
            />
          )}
          <span className="text-white font-semibold text-sm">
            Suscripción #{item.id}
          </span>
          {item.suscriptor_id && (
            <span className="text-gray-500 text-xs">· Suscriptor #{item.suscriptor_id}</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Cerrar detalle"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Diagnóstico */}
        {diag && (
          <div className={`rounded-lg border px-4 py-3 ${diagCls}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide">
                {diag.estado_resumen || "ok"}
              </span>
              {!diag.healthy && (
                <AlertTriangle size={13} className="shrink-0" />
              )}
            </div>
            {diag.accion_sugerida && diag.accion_sugerida !== "sin_accion" && (
              <p className="text-xs opacity-80">Acción: {diag.accion_sugerida}</p>
            )}
            {diag.warnings.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {diag.warnings.map((w) => (
                  <span
                    key={w}
                    className="text-xs bg-black/20 rounded px-1.5 py-0.5 font-mono"
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Datos principales */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Datos de suscripción
          </p>
          <DataRow label="Provider" value={item.provider} />
          <DataRow label="Estado local" value={estadoLocalBadge(item.estado)} />
          <DataRow label="Preapproval ID" value={
            <span className="font-mono">{item.preapproval_id_masked ?? "—"}</span>
          } />
          <DataRow label="External reference" value={
            <span className="font-mono text-xs">{item.external_reference ?? "—"}</span>
          } />
          <DataRow label="MP Status" value={mpStatusBadge(item.preapproval_status_mp)} />
          <DataRow label="Provisional" value={<BoolIcon val={item.provisional} />} />
          <DataRow label="Auto renovación" value={<BoolIcon val={item.auto_renovacion_activa} />} />
          {item.reason && <DataRow label="Plan (reason)" value={item.reason} />}
          {item.amount !== null && (
            <DataRow
              label="Monto"
              value={`${item.currency_id ?? ""} ${item.amount} / ${item.frequency} ${item.frequency_type ?? ""}`}
            />
          )}
        </div>

        {/* Fechas */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Fechas
          </p>
          <DataRow label="Creación (tabla)" value={fmtDate(item.fecha_creacion)} />
          <DataRow label="Activación provisional" value={fmtDate(item.fecha_activacion_provisional)} />
          <DataRow label="Activación definitiva" value={fmtDate(item.fecha_activacion_definitiva)} />
          <DataRow
            label="Vencimiento actual"
            value={
              <span className={
                item.fecha_vencimiento_actual &&
                new Date(item.fecha_vencimiento_actual) < new Date()
                  ? "text-red-400"
                  : ""
              }>
                {fmtDate(item.fecha_vencimiento_actual)}
              </span>
            }
          />
          <DataRow label="Cancelación" value={fmtDate(item.fecha_cancelacion)} />
          <DataRow label="created_at" value={fmtDateShort(item.created_at)} />
          <DataRow label="updated_at" value={fmtDateShort(item.updated_at)} />
        </div>

        {/* Descuento */}
        {hasDescuento && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Descuento
            </p>
            <DataRow label="Código" value={
              <span className="font-mono text-violet-300">{item.codigo_descuento}</span>
            } />
            {item.codigo_descuento_id !== null && (
              <DataRow label="ID descuento" value={item.codigo_descuento_id} />
            )}
            <DataRow label="Estado descuento" value={
              item.descuento_estado
                ? <span className={
                    item.descuento_estado === "fallido"
                      ? "text-red-400 font-mono text-xs"
                      : item.descuento_estado === "aplicado"
                      ? "text-green-400 font-mono text-xs"
                      : "font-mono text-xs text-gray-300"
                  }>{item.descuento_estado}</span>
                : "—"
            } />
            {item.descuento_metadata && (
              <div className="mt-1">
                <button
                  onClick={() => setShowDescMetadata((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showDescMetadata ? "▲ Ocultar metadata" : "▼ Ver metadata descuento"}
                </button>
                {showDescMetadata && (
                  <pre className="mt-2 text-xs bg-gray-950 border border-gray-700 rounded p-3 overflow-x-auto text-gray-300 max-h-40">
                    {JSON.stringify(item.descuento_metadata, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================

export default function SuscripcionesPage() {
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
      const res = await fetch(`/api/admin/suscripciones?${buildQueryString(f)}`);
      const json: ApiResponse = await res.json();
      if (!json.ok) {
        setErrorMsg((json as unknown as Record<string, string>).detalle ?? "Error al cargar suscripciones");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setErrorMsg("Error de red al cargar suscripciones");
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

  function handleRowClick(s: Suscripcion) {
    setSelectedId((prev) => (prev === s.id ? null : s.id));
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

  const suscripciones = data?.suscripciones ?? [];
  const paginacion = data?.paginacion ?? null;
  const conteos = data?.conteos_pagina ?? {};
  const warnings = data?.warnings ?? [];

  const diagConteos = conteos.diagnostico ?? {};
  const diagKeys = Object.entries(diagConteos).filter(([, v]) => v > 0);

  const selectedItem = suscripciones.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900/80 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-violet-400 font-bold text-sm">THC Admin</span>
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
        <div className="max-w-7xl mx-auto px-6 flex gap-0">
          <a
            href="/admin"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Dashboard
          </a>
          <a
            href="/admin/suscriptores"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Suscriptores
          </a>
          <a
            href="/admin/mensajes-problematicos"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Mensajes
          </a>
          <a
            href="/admin/contenido"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Contenido
          </a>
          <span className="text-sm text-white border-b-2 border-violet-500 py-2.5 px-3">
            Suscripciones
          </span>
          <a
            href="/admin/logs"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Logs
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Estado local */}
          <select
            value={pendiente.estado}
            onChange={(e) => setPendiente((p) => ({ ...p, estado: e.target.value }))}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los estados</option>
            <option value="activa">activa</option>
            <option value="activa_provisional">activa_provisional</option>
            <option value="pendiente_autorizacion">pendiente_autorizacion</option>
            <option value="cancelada">cancelada</option>
            <option value="finalizada">finalizada</option>
          </select>

          {/* MP Status */}
          <select
            value={pendiente.preapproval_status_mp}
            onChange={(e) => setPendiente((p) => ({ ...p, preapproval_status_mp: e.target.value }))}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los MP status</option>
            <option value="authorized">authorized</option>
            <option value="pending">pending</option>
            <option value="paused">paused</option>
            <option value="cancelled">cancelled</option>
            <option value="expired">expired</option>
          </select>

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

          {/* Solo vencidas */}
          <button
            onClick={() => applyFiltro({ solo_vencidas: !filtros.solo_vencidas })}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
              filtros.solo_vencidas
                ? "border-red-700 bg-red-900/40 text-red-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
            }`}
          >
            Solo vencidas
          </button>

          {/* Solo con descuento */}
          <button
            onClick={() => applyFiltro({ solo_con_descuento: !filtros.solo_con_descuento })}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
              filtros.solo_con_descuento
                ? "border-violet-700 bg-violet-900/40 text-violet-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
            }`}
          >
            Solo con descuento
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

        {/* Conteo strips — diagnóstico */}
        {diagKeys.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {diagKeys.map(([key, count]) => (
              <span
                key={key}
                className={`text-xs px-2.5 py-1 rounded-full border font-mono ${
                  key === "ok"
                    ? "border-green-800/50 bg-green-950/40 text-green-300"
                    : key === "vencida" || key === "mp_no_operativo"
                    ? "border-red-800/50 bg-red-950/40 text-red-300"
                    : "border-amber-800/50 bg-amber-950/40 text-amber-300"
                }`}
              >
                {key}: {count}
              </span>
            ))}
          </div>
        )}

        {/* Loading */}
        {cargando && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 text-sm text-gray-400">
            <span className="animate-pulse">Cargando suscripciones…</span>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Warnings */}
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
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">#ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">#Suscriptor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Estado local</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">MP Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Preapproval ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Monto</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Vencimiento</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Descuento</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {suscripciones.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-600 text-sm">
                        Sin resultados para los filtros actuales
                      </td>
                    </tr>
                  )}
                  {suscripciones.map((s) => {
                    const isSelected = s.id === selectedId;
                    const bg = rowBg(s, isSelected);
                    const hasWarnings = (s.diagnostico_admin?.warnings?.length ?? 0) > 0;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => handleRowClick(s)}
                        className={`border-b border-gray-800/50 cursor-pointer transition-colors hover:bg-gray-800/30 ${bg}`}
                      >
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{s.id}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                          {s.suscriptor_id ?? "—"}
                        </td>
                        <td className="px-4 py-3">{estadoLocalBadge(s.estado)}</td>
                        <td className="px-4 py-3">{mpStatusBadge(s.preapproval_status_mp)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">
                          {s.preapproval_id_masked ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                          {s.amount !== null
                            ? `${s.currency_id ?? ""} ${s.amount}`
                            : "—"}
                        </td>
                        <td className={`px-4 py-3 text-xs whitespace-nowrap ${
                          s.fecha_vencimiento_actual &&
                          new Date(s.fecha_vencimiento_actual) < new Date()
                            ? "text-red-400"
                            : "text-gray-400"
                        }`}>
                          {fmtDateShort(s.fecha_vencimiento_actual)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {s.codigo_descuento ? (
                            <span className="font-mono text-violet-400">{s.codigo_descuento}</span>
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasWarnings && (
                            <AlertTriangle size={13} className="text-amber-400 inline" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {paginacion && paginacion.total > 0 && (
              <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                <span>
                  {paginacion.offset + 1}–{Math.min(paginacion.offset + paginacion.limit, paginacion.total)} de {paginacion.total}
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

            {/* Detail panel */}
            {selectedItem && (
              <SuscripcionDetalle item={selectedItem} onClose={() => setSelectedId(null)} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
