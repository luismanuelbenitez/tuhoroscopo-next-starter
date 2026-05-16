"use client";
import { useState, useEffect } from "react";
import {
  MessageCircle,
  LogOut,
  Search,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { MensajeDetalle } from "@/components/admin/MensajeDetalle";
import { AdminNav } from "@/components/admin/AdminNav";

// ===========================================================================
// Types
// ===========================================================================

interface DiagnosticoAdmin {
  reintentable: boolean;
  accion_sugerida: string;
  comentario: string;
}

interface Mensaje {
  id: number;
  tipo_mensaje: string;
  estado: string;
  id_suscriptor: number | null;
  id_contenido: number | null;
  canal_envio: string | null;
  intentos: number;
  ultimo_error: string | null;
  reintentar_despues: string | null;
  fecha_creado: string;
  fecha_enviado: string | null;
  nombre_plantilla: string | null;
  fecha_envio_programada: string | null;
  fecha_ultimo_intento: string | null;
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

function truncar(s: string | null, max = 60): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ===========================================================================
// Badge helpers
// ===========================================================================

const ESTADO_CLS: Record<string, string> = {
  fallido:          "bg-amber-900/50 text-amber-300",
  fallo_definitivo: "bg-red-900/50 text-red-300",
  procesando:       "bg-sky-900/50 text-sky-300",
  pendiente:        "bg-gray-800 text-gray-400",
  enviado:          "bg-emerald-900/50 text-emerald-300",
};

const ACCION_CLS: Record<string, string> = {
  ver_y_reintentar:             "bg-amber-900/40 text-amber-300",
  revision_manual:              "bg-red-900/40 text-red-300",
  revisar_si_quedo_colgado:     "bg-sky-900/40 text-sky-300",
  esperar_batch_o_revisar_cron: "bg-gray-800 text-gray-500",
  sin_accion:                   "bg-gray-800 text-gray-500",
};

function EstadoBadge({ estado }: { estado: string }) {
  const cls = ESTADO_CLS[estado] ?? "bg-gray-800 text-gray-400";
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {estado}
    </span>
  );
}

function AccionBadge({ accion }: { accion: string }) {
  const cls = ACCION_CLS[accion] ?? "bg-gray-800 text-gray-400";
  const label = accion.replace(/_/g, " ");
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

// ===========================================================================
// Filtros state
// ===========================================================================

interface Filtros {
  estado: string;
  tipo_mensaje: string;
  offset: number;
}

const FILTROS_INIT: Filtros = {
  estado: "",
  tipo_mensaje: "",
  offset: 0,
};

const LIMIT = 20;

// ===========================================================================
// Page
// ===========================================================================

export default function MensajesProblematicosPage() {
  const [inputTipo, setInputTipo] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INIT);

  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [conteo, setConteo] = useState<Record<string, number>>({});
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
      if (filtros.estado) params.set("estado", filtros.estado);
      if (filtros.tipo_mensaje) params.set("tipo_mensaje", filtros.tipo_mensaje);
      params.set("offset", String(filtros.offset));
      params.set("limit", String(LIMIT));

      try {
        const r = await fetch(`/api/admin/mensajes-problematicos?${params.toString()}`);
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
        } else {
          setMensajes(json.mensajes ?? []);
          setPaginacion(json.paginacion ?? null);
          setConteo(json.conteo_resultado ?? {});
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

  function handleBuscar() {
    setFiltros({ ...filtros, tipo_mensaje: inputTipo.trim(), offset: 0 });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleBuscar();
  }

  function handleEstado(val: string) {
    setFiltros({ ...filtros, estado: val, offset: 0 });
  }

  function handleAnterior() {
    setFiltros({ ...filtros, offset: Math.max(0, filtros.offset - LIMIT) });
  }

  function handleSiguiente() {
    if (paginacion?.next_offset == null) return;
    setFiltros({ ...filtros, offset: paginacion.next_offset });
  }

  function handleRowClick(m: Mensaje) {
    setSelectedId((prev) => (prev === m.id ? null : m.id));
  }

  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  const total = paginacion?.total ?? 0;
  const desde = total === 0 ? 0 : filtros.offset + 1;
  const hasta = Math.min(filtros.offset + LIMIT, total);

  // Conteo strip
  const conteoEntries = Object.entries(conteo).filter(([, v]) => v > 0);

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
            {cerrandoSesion ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
        {/* Nav */}
        <div className="max-w-6xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <AdminNav current="/admin/mensajes-problematicos" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Estado dropdown */}
          <select
            value={filtros.estado}
            onChange={(e) => handleEstado(e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos problemáticos</option>
            <option value="fallido">Fallido</option>
            <option value="fallo_definitivo">Fallo definitivo</option>
            <option value="procesando">Procesando</option>
            <option value="pendiente">Pendiente</option>
            <option value="enviado">Enviado</option>
          </select>

          {/* Tipo mensaje search */}
          <div className="flex items-center gap-1 flex-1 min-w-[200px] border border-gray-700 rounded-lg bg-gray-900 px-3 py-2">
            <Search size={14} className="text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Tipo de mensaje (ej: premium)"
              value={inputTipo}
              onChange={(e) => setInputTipo(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>

          <button
            onClick={handleBuscar}
            className="border border-violet-700 bg-violet-800/40 hover:bg-violet-700/60 text-violet-200 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Buscar
          </button>
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

        {/* Healthy empty state */}
        {!cargando && !errorMsg && mensajes.length === 0 && (
          <div className="rounded-xl border border-emerald-800/30 bg-emerald-950/20 px-6 py-8 text-center">
            <p className="text-emerald-400 font-medium">Sin mensajes problemáticos</p>
            <p className="text-sm text-gray-500 mt-1">
              {filtros.estado
                ? `No hay mensajes con estado "${filtros.estado}"`
                : "No hay mensajes fallidos, en fallo definitivo ni procesando"}
            </p>
          </div>
        )}

        {/* Table */}
        {(cargando || mensajes.length > 0) && (
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-800 text-left">
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">ID</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Tipo / Plantilla</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Estado</th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-right whitespace-nowrap">Intentos</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Fecha</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Último error</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Reintentar desde</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Suscriptor</th>
                    <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Acción sugerida</th>
                  </tr>
                </thead>
                <tbody>
                  {cargando && (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse"
                      >
                        Cargando mensajes…
                      </td>
                    </tr>
                  )}
                  {!cargando &&
                    mensajes.map((m) => {
                      const isSelected = selectedId === m.id;
                      const rowCls = isSelected
                        ? "bg-violet-950/20"
                        : m.estado === "fallo_definitivo"
                        ? "bg-red-950/10"
                        : m.estado === "procesando"
                        ? "bg-sky-950/10"
                        : "";

                      return (
                        <tr
                          key={m.id}
                          onClick={() => handleRowClick(m)}
                          className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${rowCls}`}
                        >
                          {/* ID */}
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                            #{m.id}
                          </td>

                          {/* Tipo / Plantilla */}
                          <td className="px-4 py-3 min-w-[140px]">
                            <p className="text-white leading-tight">{m.tipo_mensaje}</p>
                            {m.nombre_plantilla && (
                              <p className="text-xs text-gray-500 leading-tight mt-0.5">
                                {m.nombre_plantilla}
                              </p>
                            )}
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <EstadoBadge estado={m.estado} />
                          </td>

                          {/* Intentos */}
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`font-mono text-sm ${
                                m.intentos >= 5
                                  ? "text-red-400 font-bold"
                                  : m.intentos >= 3
                                  ? "text-amber-400"
                                  : "text-gray-300"
                              }`}
                            >
                              {m.intentos}
                            </span>
                          </td>

                          {/* Fecha (último intento o creación) */}
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                            {fmtFecha(m.fecha_ultimo_intento ?? m.fecha_creado)}
                          </td>

                          {/* Último error */}
                          <td className="px-4 py-3 min-w-[180px] max-w-[260px]">
                            {m.ultimo_error ? (
                              <p
                                className="text-xs text-red-300/80 leading-tight break-words"
                                title={m.ultimo_error}
                              >
                                {truncar(m.ultimo_error, 70)}
                              </p>
                            ) : (
                              <span className="text-xs text-gray-600">—</span>
                            )}
                          </td>

                          {/* Reintentar desde */}
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                            {m.reintentar_despues
                              ? fmtFecha(m.reintentar_despues)
                              : "—"}
                          </td>

                          {/* Suscriptor */}
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                            {m.id_suscriptor != null ? `#${m.id_suscriptor}` : "—"}
                          </td>

                          {/* Acción sugerida */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {m.diagnostico_admin ? (
                              <AccionBadge accion={m.diagnostico_admin.accion_sugerida} />
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
              {desde}–{hasta} de {total} mensajes
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
      {selectedId !== null && (
        <MensajeDetalle id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
