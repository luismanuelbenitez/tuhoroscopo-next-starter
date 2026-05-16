"use client";
import { useState, useEffect } from "react";
import {
  MessageCircle,
  LogOut,
  AlertCircle,
  AlertTriangle,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
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

interface Contenido {
  id: number;
  id_suscriptor: number | null;
  contenido: string | null;
  fecha_creacion: string;
  generado: boolean;
  generado_por: string | null;
  resultado: string | null;
  ciclo_semana: number | null;
  emocion_dominante: string | null;
  fecha_envio_programada: string | null;
  fecha_envio_real: string | null;
  tipo: string;
  estado_envio: string;
  mensaje_id_whatsapp: string | null;
  ultimo_error: string | null;
  canal: string | null;
  reintentar_despues: string | null;
  enviado_por: string | null;
  color: string | null;
  contenido_preferido: string | null;
  numero: number | null;
  origen_generacion: string | null;
  meta_generacion: Record<string, unknown> | null;
  diagnostico_admin: DiagnosticoAdmin | null;
}

interface Paginacion {
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

// ===========================================================================
// Helpers
// ===========================================================================

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-UY", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-UY", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function truncar(s: unknown, max = 55): string {
  if (s == null) return "—";
  const str = typeof s === "string" ? s : JSON.stringify(s);
  if (!str) return "—";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function safeStr(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ===========================================================================
// Badge helpers
// ===========================================================================

const ESTADO_CLS: Record<string, string> = {
  pendiente:        "bg-gray-800 text-gray-400",
  generado:         "bg-sky-900/50 text-sky-300",
  encolado:         "bg-violet-900/50 text-violet-300",
  enviado:          "bg-emerald-900/50 text-emerald-300",
  fallido:          "bg-amber-900/50 text-amber-300",
  fallo_definitivo: "bg-red-900/50 text-red-300",
};

const TIPO_CLS: Record<string, string> = {
  diario:  "bg-violet-900/40 text-violet-300",
  domingo: "bg-amber-900/40 text-amber-300",
};

function EstadoBadge({ estado }: { estado: string }) {
  const cls = ESTADO_CLS[estado] ?? "bg-gray-800 text-gray-400";
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {estado}
    </span>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const cls = TIPO_CLS[tipo] ?? "bg-gray-800 text-gray-400";
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {tipo}
    </span>
  );
}

// ===========================================================================
// ContenidoRich — renders contenido field (string or JSON object)
// ===========================================================================

const CONTENIDO_CAMPOS: Array<{ key: string; label: string }> = [
  { key: "saludo_inicial",     label: "Saludo inicial" },
  { key: "horoscopo",          label: "Horóscopo" },
  { key: "contenido_preferido",label: "Contenido preferido" },
  { key: "numero",             label: "Número" },
  { key: "color",              label: "Color" },
  { key: "pausa",              label: "Pausa" },
  { key: "pie_de_pagina",      label: "Pie de página" },
];

function ContenidoRich({ raw }: { raw: unknown }) {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { parsed = JSON.parse(trimmed); } catch { /* keep as string */ }
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return (
      <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
        {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
      </p>
    );
  }

  const obj = parsed as Record<string, unknown>;
  const known = CONTENIDO_CAMPOS.filter(({ key }) => obj[key] != null);
  const unknownKeys = Object.keys(obj).filter(
    (k) => !CONTENIDO_CAMPOS.some(({ key }) => key === k)
  );

  if (known.length === 0) {
    return (
      <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all">
        {JSON.stringify(obj, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-3">
      {known.map(({ key, label }) => (
        <div key={key}>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{String(obj[key])}</p>
        </div>
      ))}
      {unknownKeys.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Otros campos</p>
          <pre className="text-xs text-gray-400 whitespace-pre-wrap break-all">
            {JSON.stringify(
              Object.fromEntries(unknownKeys.map((k) => [k, obj[k]])),
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Inline detail panel (expanded row)
// ===========================================================================

function ContenidoDetalle({
  item,
  onClose,
}: {
  item: Contenido;
  onClose: () => void;
}) {
  const [metaExpanded, setMetaExpanded] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <TipoBadge tipo={item.tipo} />
            <EstadoBadge estado={item.estado_envio} />
            <span className="text-sm font-medium text-white">
              Contenido #{item.id}
            </span>
            {item.id_suscriptor != null && (
              <span className="text-sm text-gray-500">— sus #{item.id_suscriptor}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-1 rounded shrink-0 ml-2"
            aria-label="Cerrar detalle"
          >
            <X size={15} />
          </button>
        </div>

      <div className="px-5 py-4 space-y-4">
        {/* Diagnostico warnings */}
        {item.diagnostico_admin && item.diagnostico_admin.warnings.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.diagnostico_admin.warnings.map((w) => (
              <span
                key={w}
                className="inline-flex items-center gap-1 text-xs bg-amber-900/40 text-amber-300 border border-amber-800/40 px-2 py-0.5 rounded-full"
              >
                <AlertTriangle size={10} />
                {w}
              </span>
            ))}
          </div>
        )}

        {/* Campos operativos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
          {[
            ["Emoción dominante", item.emocion_dominante],
            ["Color", item.color],
            ["Número", item.numero != null ? String(item.numero) : null],
            ["Semana", item.ciclo_semana != null ? String(item.ciclo_semana) : null],
            ["Contenido preferido", item.contenido_preferido],
            ["Tipo", item.tipo],
            ["Canal", item.canal],
            ["Origen generación", item.origen_generacion],
            ["Generado por", item.generado_por],
            ["Enviado por", item.enviado_por],
            ["Creado", fmtFecha(item.fecha_creacion)],
            ["Programado", fmtFecha(item.fecha_envio_programada)],
            ["Enviado", fmtFecha(item.fecha_envio_real)],
            ["Reintentar desde", fmtFecha(item.reintentar_despues)],
          ].map(([label, value]) =>
            value ? (
              <div key={label} className="flex gap-2 py-0.5">
                <span className="text-gray-500 shrink-0 w-36">{label}</span>
                <span className="text-gray-200">{safeStr(value)}</span>
              </div>
            ) : null
          )}
        </div>

        {/* mensaje_id_whatsapp */}
        {item.mensaje_id_whatsapp && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              ID WhatsApp
            </p>
            <p className="text-xs text-gray-400 font-mono break-all">
              {item.mensaje_id_whatsapp}
            </p>
          </div>
        )}

        {/* Último error */}
        {item.ultimo_error && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Último error
            </p>
            <div className="rounded-lg border border-red-800/30 bg-red-950/20 px-3 py-2.5">
              <pre className="text-xs text-red-300 whitespace-pre-wrap break-all leading-relaxed">
                {safeStr(item.ultimo_error)}
              </pre>
            </div>
          </div>
        )}

        {/* Contenido generado */}
        {item.contenido != null && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Contenido generado
            </p>
            <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-4 py-3 max-h-64 overflow-y-auto">
              <ContenidoRich raw={item.contenido} />
            </div>
          </div>
        )}

        {/* Meta generacion */}
        {item.meta_generacion && Object.keys(item.meta_generacion).length > 0 && (
          <div>
            <button
              onClick={() => setMetaExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-1"
            >
              {metaExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Meta generación {metaExpanded ? "(ocultar)" : "(mostrar)"}
            </button>
            {metaExpanded && (
              <pre className="text-xs text-gray-400 bg-gray-800/50 rounded-lg border border-gray-700 px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(item.meta_generacion, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Acción sugerida */}
        {item.diagnostico_admin?.accion_sugerida &&
          item.diagnostico_admin.accion_sugerida !== "sin_accion" && (
            <p className="text-xs text-gray-500">
              <span className="text-gray-400 font-medium">Acción sugerida: </span>
              {item.diagnostico_admin.accion_sugerida.replace(/_/g, " ")}
            </p>
          )}
      </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Filtros state
// ===========================================================================

interface Filtros {
  estado_envio: string;
  tipo: string;
  solo_pendientes: boolean;
  solo_con_error: boolean;
  fecha_desde: string;
  fecha_hasta: string;
  offset: number;
}

const FILTROS_INIT: Filtros = {
  estado_envio: "",
  tipo: "",
  solo_pendientes: false,
  solo_con_error: false,
  fecha_desde: "",
  fecha_hasta: "",
  offset: 0,
};

const LIMIT = 50;

// ===========================================================================
// Page
// ===========================================================================

export default function ContenidoPage() {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INIT);
  const [fechaDesdeInput, setFechaDesdeInput] = useState("");
  const [fechaHastaInput, setFechaHastaInput] = useState("");

  const [contenido, setContenido] = useState<Contenido[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [conteos, setConteos] = useState<Record<string, Record<string, number>>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    async function doFetch() {
      setCargando(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (filtros.estado_envio) params.set("estado_envio", filtros.estado_envio);
      if (filtros.tipo) params.set("tipo", filtros.tipo);
      if (filtros.solo_pendientes) params.set("solo_pendientes", "true");
      if (filtros.solo_con_error) params.set("solo_con_error", "true");
      if (filtros.fecha_desde) params.set("fecha_desde", filtros.fecha_desde);
      if (filtros.fecha_hasta) params.set("fecha_hasta", filtros.fecha_hasta);
      params.set("offset", String(filtros.offset));
      params.set("limit", String(LIMIT));

      try {
        const r = await fetch(`/api/admin/contenido?${params.toString()}`);
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
        } else {
          setContenido(json.contenido ?? []);
          setPaginacion(json.paginacion ?? null);
          setConteos(json.conteos_pagina ?? {});
          setWarnings(json.warnings ?? []);
        }
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : "Error de red");
      } finally {
        setCargando(false);
      }
    }

    doFetch();
  }, [filtros]);

  function applyFiltro(patch: Partial<Filtros>) {
    setFiltros((prev) => ({ ...prev, ...patch, offset: 0 }));
    setSelectedId(null);
  }

  function handleBuscar() {
    applyFiltro({ fecha_desde: fechaDesdeInput, fecha_hasta: fechaHastaInput });
  }

  function handleToggle(key: "solo_pendientes" | "solo_con_error") {
    // Toggle clear incompatible filters
    if (key === "solo_pendientes" && !filtros.solo_pendientes) {
      applyFiltro({ solo_pendientes: true, solo_con_error: false, estado_envio: "" });
    } else if (key === "solo_con_error" && !filtros.solo_con_error) {
      applyFiltro({ solo_con_error: true, solo_pendientes: false, estado_envio: "" });
    } else {
      applyFiltro({ [key]: false });
    }
  }

  function handleAnterior() {
    setFiltros((prev) => ({ ...prev, offset: Math.max(0, prev.offset - LIMIT) }));
    setSelectedId(null);
  }

  function handleSiguiente() {
    if (paginacion?.next_offset == null) return;
    setFiltros((prev) => ({ ...prev, offset: paginacion.next_offset! }));
    setSelectedId(null);
  }

  function handleRowClick(c: Contenido) {
    setSelectedId((prev) => (prev === c.id ? null : c.id));
  }

  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  const total = paginacion?.total ?? 0;
  const desde = total === 0 ? 0 : filtros.offset + 1;
  const hasta = Math.min(filtros.offset + LIMIT, total);
  const conteosEstado = conteos.estado_envio ?? {};
  const conteoEntries = Object.entries(conteosEstado).filter(([, v]) => v > 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
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
            onClick={handleLogout}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            <LogOut size={15} />
            {cerrandoSesion ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
        {/* Nav */}
        <div className="max-w-7xl mx-auto px-6 flex gap-0">
          <a href="/admin" className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors">
            Dashboard
          </a>
          <a href="/admin/suscriptores" className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors">
            Suscriptores
          </a>
          <a href="/admin/mensajes-problematicos" className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors">
            Mensajes
          </a>
          <span className="text-sm text-white border-b-2 border-violet-500 py-2.5 px-3">
            Contenido
          </span>
          <a href="/admin/suscripciones" className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors">
            Suscripciones
          </a>
          <a href="/admin/logs" className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors">
            Logs
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Estado envío */}
          <select
            value={filtros.estado_envio}
            onChange={(e) => applyFiltro({ estado_envio: e.target.value, solo_pendientes: false })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="generado">Generado</option>
            <option value="encolado">Encolado</option>
            <option value="enviado">Enviado</option>
            <option value="fallido">Fallido</option>
            <option value="fallo_definitivo">Fallo definitivo</option>
          </select>

          {/* Tipo */}
          <select
            value={filtros.tipo}
            onChange={(e) => applyFiltro({ tipo: e.target.value })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los tipos</option>
            <option value="diario">Diario</option>
            <option value="domingo">Domingo</option>
          </select>

          {/* Fecha desde */}
          <input
            type="date"
            value={fechaDesdeInput}
            onChange={(e) => setFechaDesdeInput(e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          />

          {/* Fecha hasta */}
          <input
            type="date"
            value={fechaHastaInput}
            onChange={(e) => setFechaHastaInput(e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          />

          {/* Buscar fechas */}
          <button
            onClick={handleBuscar}
            className="border border-violet-700 bg-violet-800/40 hover:bg-violet-700/60 text-violet-200 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Buscar
          </button>

          {/* Toggle: Solo pendientes */}
          <button
            onClick={() => handleToggle("solo_pendientes")}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
              filtros.solo_pendientes
                ? "border-sky-600 bg-sky-900/50 text-sky-200"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500"
            }`}
          >
            Solo pendientes
          </button>

          {/* Toggle: Solo con error */}
          <button
            onClick={() => handleToggle("solo_con_error")}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
              filtros.solo_con_error
                ? "border-red-600 bg-red-900/50 text-red-200"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500"
            }`}
          >
            Solo con error
          </button>

          {/* Limpiar fechas */}
          {(filtros.fecha_desde || filtros.fecha_hasta) && (
            <button
              onClick={() => {
                setFechaDesdeInput("");
                setFechaHastaInput("");
                applyFiltro({ fecha_desde: "", fecha_hasta: "" });
              }}
              className="text-sm text-gray-500 hover:text-gray-300 px-2 py-2 transition-colors"
            >
              Limpiar fechas ✕
            </button>
          )}
        </div>

        {/* Conteo por estado */}
        {!cargando && conteoEntries.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {conteoEntries.map(([estado, count]) => (
              <span
                key={estado}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${
                  ESTADO_CLS[estado] ?? "bg-gray-800 text-gray-400"
                } border-gray-700/50`}
              >
                {estado}: {count}
              </span>
            ))}
          </div>
        )}

        {/* Warnings */}
        {!cargando && warnings.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {warnings.map((w) => (
              <span
                key={w}
                className="inline-flex items-center gap-1 text-xs bg-amber-900/30 text-amber-300 border border-amber-800/30 px-2 py-0.5 rounded-full"
              >
                <AlertTriangle size={10} />
                {w}
              </span>
            ))}
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Empty state */}
        {!cargando && !errorMsg && contenido.length === 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-6 py-10 text-center">
            <p className="text-gray-400 font-medium">Sin registros</p>
            <p className="text-sm text-gray-600 mt-1">Ajustá los filtros para ver contenido</p>
          </div>
        )}

        {/* Table */}
        {(cargando || contenido.length > 0) && (
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-800 text-left">
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">ID</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Suscriptor</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Tipo</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Estado</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Programado</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Enviado</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Emoción</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Color</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Pref.</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Gen.</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Último error</th>
                  </tr>
                </thead>
                <tbody>
                  {cargando && (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-gray-500 animate-pulse">
                        Cargando contenido…
                      </td>
                    </tr>
                  )}
                  {!cargando &&
                    contenido.map((c) => {
                      const isSelected = selectedId === c.id;
                      const hasWarnings =
                        (c.diagnostico_admin?.warnings?.length ?? 0) > 0;
                      const rowBase = isSelected
                        ? "bg-violet-950/20"
                        : c.estado_envio === "fallo_definitivo"
                        ? "bg-red-950/10"
                        : c.estado_envio === "fallido"
                        ? "bg-amber-950/10"
                        : "";

                      return (
                        <tr
                          key={c.id}
                          onClick={() => handleRowClick(c)}
                          className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${rowBase}`}
                        >
                          {/* ID */}
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                            <span className="flex items-center gap-1">
                              #{c.id}
                              {hasWarnings && (
                                <AlertTriangle size={10} className="text-amber-400 shrink-0" />
                              )}
                            </span>
                          </td>

                          {/* Suscriptor */}
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                            {c.id_suscriptor != null ? `#${c.id_suscriptor}` : "—"}
                          </td>

                          {/* Tipo */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {c.tipo ? <TipoBadge tipo={c.tipo} /> : <span className="text-gray-600 text-xs">—</span>}
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <EstadoBadge estado={c.estado_envio} />
                          </td>

                          {/* Fecha programada */}
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                            {fmtDate(c.fecha_envio_programada)}
                          </td>

                          {/* Fecha enviado */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {c.fecha_envio_real ? (
                              <span className="text-emerald-400 font-mono text-xs">
                                {fmtDate(c.fecha_envio_real)}
                              </span>
                            ) : (
                              <span className="text-gray-600 text-xs">—</span>
                            )}
                          </td>

                          {/* Emoción */}
                          <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                            {safeStr(c.emocion_dominante)}
                          </td>

                          {/* Color */}
                          <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                            {safeStr(c.color)}
                          </td>

                          {/* Contenido preferido */}
                          <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                            {safeStr(c.contenido_preferido)}
                          </td>

                          {/* Generado */}
                          <td className="px-4 py-3 text-center">
                            {c.generado ? (
                              <Check size={13} className="text-emerald-400 mx-auto" />
                            ) : (
                              <X size={13} className="text-gray-600 mx-auto" />
                            )}
                          </td>

                          {/* Último error */}
                          <td className="px-4 py-3 min-w-[160px] max-w-[220px]">
                            {c.ultimo_error ? (
                              <p
                                className="text-xs text-red-300/80 leading-tight break-words"
                                title={safeStr(c.ultimo_error)}
                              >
                                {truncar(c.ultimo_error, 60)}
                              </p>
                            ) : (
                              <span className="text-xs text-gray-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {!cargando && paginacion && total > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
            <span>
              {desde}–{hasta} de {total} registros
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
      {selectedId !== null && (() => {
        const item = contenido.find((c) => c.id === selectedId);
        return item ? (
          <ContenidoDetalle item={item} onClose={() => setSelectedId(null)} />
        ) : null;
      })()}
    </div>
  );
}
