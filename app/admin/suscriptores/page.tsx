"use client";
import { useState, useEffect } from "react";
import {
  MessageCircle,
  LogOut,
  Search,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { SuscriptorDetalle } from "@/components/admin/SuscriptorDetalle";

// ===========================================================================
// Types
// ===========================================================================

interface Suscriptor {
  id: string;
  nombre: string;
  email: string;
  whatsapp: string;
  signo: string;
  tipo_suscripcion: string;
  estado_suscripcion: string;
  contenido_preferido: string;
  fecha_alta: string | null;
  fecha_inicio_premium: string | null;
  fecha_vencimiento_premium: string | null;
  premium_activo: boolean;
  whatsapp_confirmado: boolean;
  estado_mensaje: string | null;
  creado_en: string;
  estado_resumen: string;
  warnings: string[];
}

interface Paginacion {
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

// ===========================================================================
// Badge helpers
// ===========================================================================

const ESTADO_SUS: Record<string, { label: string; cls: string }> = {
  activa:                 { label: "Activa",     cls: "bg-emerald-900/50 text-emerald-300" },
  suspendida:             { label: "Suspendida", cls: "bg-amber-900/50 text-amber-300" },
  cancelada_no_renueva:   { label: "Cancelada",  cls: "bg-red-900/50 text-red-300" },
  finalizada:             { label: "Finalizada", cls: "bg-gray-800 text-gray-400" },
};

const ESTADO_RESUMEN: Record<string, { label: string; cls: string }> = {
  ok:                     { label: "OK",         cls: "bg-emerald-900/50 text-emerald-300" },
  premium_vencido:        { label: "Vencido",    cls: "bg-red-900/50 text-red-300" },
  mensajes_pausados:      { label: "Pausado",    cls: "bg-amber-900/50 text-amber-300" },
  whatsapp_no_confirmado: { label: "Sin WA",     cls: "bg-sky-900/50 text-sky-300" },
  premium_no_activo:      { label: "Inactivo",   cls: "bg-gray-800 text-gray-400" },
  requiere_revision:      { label: "Revisar",    cls: "bg-orange-900/50 text-orange-300" },
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

// ===========================================================================
// Filtros state
// ===========================================================================

interface Filtros {
  buscar: string;
  estado_suscripcion: string;
  premium_activo: string;
  whatsapp_confirmado: string;
  offset: number;
}

const FILTROS_INIT: Filtros = {
  buscar: "",
  estado_suscripcion: "",
  premium_activo: "",
  whatsapp_confirmado: "",
  offset: 0,
};

const LIMIT = 50;

// ===========================================================================
// Page
// ===========================================================================

export default function SuscriptoresPage() {
  const [inputBuscar, setInputBuscar] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INIT);

  const [suscriptores, setSuscriptores] = useState<Suscriptor[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Fetch whenever filtros change
  useEffect(() => {
    async function doFetch() {
      setCargando(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (filtros.buscar) params.set("buscar", filtros.buscar);
      if (filtros.estado_suscripcion) params.set("estado_suscripcion", filtros.estado_suscripcion);
      if (filtros.premium_activo) params.set("premium_activo", filtros.premium_activo);
      if (filtros.whatsapp_confirmado) params.set("whatsapp_confirmado", filtros.whatsapp_confirmado);
      params.set("offset", String(filtros.offset));
      params.set("limit", String(LIMIT));

      try {
        const r = await fetch(`/api/admin/suscriptores?${params.toString()}`);
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
        } else {
          setSuscriptores(json.suscriptores ?? []);
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

  function handleBuscar() {
    setFiltros({ ...filtros, buscar: inputBuscar.trim(), offset: 0 });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleBuscar();
  }

  function handleFiltro(key: keyof Omit<Filtros, "offset" | "buscar">, val: string) {
    setFiltros({ ...filtros, [key]: val, offset: 0 });
  }

  function handleAnterior() {
    const newOffset = Math.max(0, filtros.offset - LIMIT);
    setFiltros({ ...filtros, offset: newOffset });
  }

  function handleSiguiente() {
    if (paginacion?.next_offset == null) return;
    setFiltros({ ...filtros, offset: paginacion.next_offset });
  }

  function handleRowClick(s: Suscriptor) {
    const numId = parseInt(s.id, 10);
    if (!Number.isFinite(numId)) return;
    setSelectedId((prev) => (prev === numId ? null : numId));
  }

  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  const total = paginacion?.total ?? 0;
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
            {cerrandoSesion ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
        {/* Nav */}
        <div className="max-w-6xl mx-auto px-6 flex gap-0">
          <a
            href="/admin"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Dashboard
          </a>
          <span className="text-sm text-white border-b-2 border-violet-500 py-2.5 px-3">
            Suscriptores
          </span>
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
          <a
            href="/admin/suscripciones"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Suscripciones
          </a>
          <a
            href="/admin/logs"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Logs
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Search */}
          <div className="flex items-center gap-1 flex-1 min-w-[220px] border border-gray-700 rounded-lg bg-gray-900 px-3 py-2">
            <Search size={14} className="text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Nombre, email, WhatsApp…"
              value={inputBuscar}
              onChange={(e) => setInputBuscar(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>

          {/* Estado suscripción */}
          <select
            value={filtros.estado_suscripcion}
            onChange={(e) => handleFiltro("estado_suscripcion", e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los estados</option>
            <option value="activa">Activa</option>
            <option value="suspendida">Suspendida</option>
            <option value="cancelada_no_renueva">Cancelada</option>
            <option value="finalizada">Finalizada</option>
          </select>

          {/* Premium activo */}
          <select
            value={filtros.premium_activo}
            onChange={(e) => handleFiltro("premium_activo", e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Premium: todos</option>
            <option value="true">Premium: sí</option>
            <option value="false">Premium: no</option>
          </select>

          {/* WhatsApp confirmado */}
          <select
            value={filtros.whatsapp_confirmado}
            onChange={(e) => handleFiltro("whatsapp_confirmado", e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">WA: todos</option>
            <option value="true">WA: confirmado</option>
            <option value="false">WA: sin confirmar</option>
          </select>

          {/* Buscar button */}
          <button
            onClick={handleBuscar}
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

        {/* Table */}
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800 text-left">
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Nombre</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">WhatsApp</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Signo</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Suscripción</th>
                  <th className="px-4 py-3 font-medium text-gray-400 text-center whitespace-nowrap">Premium</th>
                  <th className="px-4 py-3 font-medium text-gray-400 text-center whitespace-nowrap">WA ✓</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Vence</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Estado</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando suscriptores…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && suscriptores.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados para estos filtros.
                    </td>
                  </tr>
                )}
                {!cargando &&
                  suscriptores.map((s) => {
                    const estadoSusBadge = ESTADO_SUS[s.estado_suscripcion] ?? {
                      label: s.estado_suscripcion,
                      cls: "bg-gray-800 text-gray-400",
                    };
                    const estadoResumenBadge = ESTADO_RESUMEN[s.estado_resumen] ?? {
                      label: s.estado_resumen,
                      cls: "bg-gray-800 text-gray-400",
                    };
                    const rowHighlight =
                      s.estado_resumen === "premium_vencido"
                        ? "bg-red-950/10"
                        : s.estado_resumen === "requiere_revision"
                        ? "bg-orange-950/10"
                        : "";

                    const isSelected = selectedId === parseInt(s.id, 10);

                    return (
                      <tr
                        key={s.id}
                        onClick={() => handleRowClick(s)}
                        className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${
                          isSelected ? "bg-violet-950/20" : rowHighlight
                        }`}
                      >
                        {/* Nombre + email */}
                        <td className="px-4 py-3 min-w-[160px]">
                          <p className="font-medium text-white leading-tight">{s.nombre}</p>
                          <p className="text-xs text-gray-500 leading-tight mt-0.5">{s.email}</p>
                        </td>

                        {/* WhatsApp */}
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap font-mono text-xs">
                          {s.whatsapp || "—"}
                        </td>

                        {/* Signo */}
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                          {s.signo || "—"}
                        </td>

                        {/* Estado suscripción */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge text={estadoSusBadge.label} cls={estadoSusBadge.cls} />
                        </td>

                        {/* Premium activo */}
                        <td className="px-4 py-3 text-center">
                          {s.premium_activo ? (
                            <Check size={15} className="text-emerald-400 mx-auto" />
                          ) : (
                            <X size={15} className="text-gray-600 mx-auto" />
                          )}
                        </td>

                        {/* WhatsApp confirmado */}
                        <td className="px-4 py-3 text-center">
                          {s.whatsapp_confirmado ? (
                            <Check size={15} className="text-emerald-400 mx-auto" />
                          ) : (
                            <X size={15} className="text-gray-600 mx-auto" />
                          )}
                        </td>

                        {/* Fecha vencimiento */}
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap font-mono text-xs">
                          {s.fecha_vencimiento_premium ?? "—"}
                        </td>

                        {/* Estado resumen */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge text={estadoResumenBadge.label} cls={estadoResumenBadge.cls} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {!cargando && paginacion && total > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
            <span>
              {desde}–{hasta} de {total} suscriptores
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
        <SuscriptorDetalle
          id={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
