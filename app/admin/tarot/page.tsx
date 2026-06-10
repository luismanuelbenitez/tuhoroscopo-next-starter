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
import { TarotOrdenDetalle } from "@/components/admin/TarotOrdenDetalle";

// ============================================================================
// Types
// ============================================================================

interface Orden {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_email: string;
  estado: string;
  external_reference: string;
  pregunta_usuario: string;
  tema: string;
  precio_cobrado: number;
  moneda: string;
  origen_canal: string;
  notas_internas: string | null;
  created_at: string;
  updated_at: string;
  estado_resumen: string;
  warnings: string[];
}

interface Paginacion {
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

// ============================================================================
// Badges
// ============================================================================

const ESTADO_ORDEN: Record<string, { label: string; cls: string }> = {
  formulario_completo:  { label: "Formulario",    cls: "bg-gray-800 text-gray-400" },
  pago_iniciado:        { label: "Pago iniciado", cls: "bg-amber-900/50 text-amber-300" },
  pago_confirmado:      { label: "Pago ok",       cls: "bg-sky-900/50 text-sky-300" },
  pago_rechazado:       { label: "Rechazado",     cls: "bg-red-900/50 text-red-300" },
  pago_expirado:        { label: "Expirado",      cls: "bg-red-900/50 text-red-300" },
  generando_lectura:    { label: "Generando IA",  cls: "bg-amber-900/50 text-amber-300" },
  lectura_lista:        { label: "Lectura lista", cls: "bg-sky-900/50 text-sky-300" },
  generando_pdf:        { label: "Generando PDF", cls: "bg-amber-900/50 text-amber-300" },
  pdf_listo:            { label: "PDF listo",     cls: "bg-violet-900/50 text-violet-300" },
  enviando_whatsapp:    { label: "Enviando WA",   cls: "bg-amber-900/50 text-amber-300" },
  entregado:            { label: "Entregado",     cls: "bg-emerald-900/50 text-emerald-300" },
  error_lectura:        { label: "Error lectura", cls: "bg-red-900/50 text-red-300" },
  error_pdf:            { label: "Error PDF",     cls: "bg-red-900/50 text-red-300" },
  error_whatsapp:       { label: "Error WA",      cls: "bg-red-900/50 text-red-300" },
  error_critico:        { label: "Error crítico", cls: "bg-red-900/50 text-red-400" },
  cancelado:            { label: "Cancelado",     cls: "bg-gray-800 text-gray-400" },
};

const TEMA_LABEL: Record<string, string> = {
  general:  "General",
  amor:     "Amor",
  trabajo:  "Trabajo",
  salud:    "Salud",
  dinero:   "Dinero",
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

// ============================================================================
// Filtros
// ============================================================================

interface Filtros {
  buscar: string;
  estado: string;
  tema: string;
  moneda: string;
  offset: number;
}

const FILTROS_INIT: Filtros = {
  buscar: "",
  estado: "",
  tema: "",
  moneda: "",
  offset: 0,
};

const LIMIT = 50;

// ============================================================================
// Page
// ============================================================================

export default function TarotOrdenesPage() {
  const [inputBuscar, setInputBuscar] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INIT);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [selectedOrden, setSelectedOrden] = useState<Orden | null>(null);

  useEffect(() => {
    async function doFetch() {
      setCargando(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (filtros.buscar)  params.set("buscar",  filtros.buscar);
      if (filtros.estado)  params.set("estado",  filtros.estado);
      if (filtros.tema)    params.set("tema",    filtros.tema);
      if (filtros.moneda)  params.set("moneda",  filtros.moneda);
      params.set("offset", String(filtros.offset));
      params.set("limit",  String(LIMIT));

      try {
        const r = await fetch(`/api/admin/tarot/ordenes?${params.toString()}`);
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
        } else {
          setOrdenes(json.ordenes ?? []);
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
            {cerrandoSesion ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
        <div className="max-w-6xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <AdminNav current="/admin/tarot" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">

        {/* Título de sección */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            🃏 Órdenes de Tarot
          </h2>
          <a
            href="/admin/tarot/logs"
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            Ver logs →
          </a>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Buscar */}
          <div className="flex items-center gap-1 flex-1 min-w-[200px] border border-gray-700 rounded-lg bg-gray-900 px-3 py-2">
            <Search size={14} className="text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Referencia TAROT-…"
              value={inputBuscar}
              onChange={(e) => setInputBuscar(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>

          {/* Estado */}
          <select
            value={filtros.estado}
            onChange={(e) => handleFiltro("estado", e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los estados</option>
            <option value="formulario_completo">Formulario</option>
            <option value="pago_iniciado">Pago iniciado</option>
            <option value="pago_confirmado">Pago confirmado</option>
            <option value="pago_rechazado">Pago rechazado</option>
            <option value="lectura_lista">Lectura lista</option>
            <option value="pdf_listo">PDF listo</option>
            <option value="entregado">Entregado</option>
            <option value="error_lectura">Error lectura</option>
            <option value="error_pdf">Error PDF</option>
            <option value="error_critico">Error crítico</option>
            <option value="cancelado">Cancelado</option>
          </select>

          {/* Tema */}
          <select
            value={filtros.tema}
            onChange={(e) => handleFiltro("tema", e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los temas</option>
            <option value="general">General</option>
            <option value="amor">Amor</option>
            <option value="trabajo">Trabajo</option>
            <option value="salud">Salud</option>
            <option value="dinero">Dinero</option>
          </select>

          {/* Moneda */}
          <select
            value={filtros.moneda}
            onChange={(e) => handleFiltro("moneda", e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Moneda: todas</option>
            <option value="UYU">UYU</option>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>

          {/* Botón buscar */}
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

        {/* Tabla */}
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800 text-left">
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Cliente</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Tema</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Referencia</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Precio</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Estado</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando órdenes…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && ordenes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados para estos filtros.
                    </td>
                  </tr>
                )}
                {!cargando && ordenes.map((o) => {
                  const estadoBadge = ESTADO_ORDEN[o.estado] ?? { label: o.estado, cls: "bg-gray-800 text-gray-400" };
                  const tieneError = o.estado.startsWith("error_");
                  const rowHighlight = tieneError ? "bg-red-950/10" : o.estado_resumen === "abandonado" ? "bg-orange-950/10" : "";
                  const isSelected = selectedOrden?.id === o.id;

                  return (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedOrden((prev) => prev?.id === o.id ? null : o)}
                      className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${
                        isSelected ? "bg-violet-950/20" : rowHighlight
                      }`}
                    >
                      {/* Cliente */}
                      <td className="px-4 py-3 min-w-[150px]">
                        <p className="font-medium text-white leading-tight">{o.cliente_nombre || "—"}</p>
                        <p className="text-xs text-gray-500 leading-tight mt-0.5 font-mono">{o.cliente_telefono || o.cliente_email || "—"}</p>
                      </td>

                      {/* Tema */}
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                        {TEMA_LABEL[o.tema] ?? o.tema}
                      </td>

                      {/* Referencia */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                        {o.external_reference}
                      </td>

                      {/* Precio */}
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap font-mono text-xs">
                        {o.moneda} {o.precio_cobrado}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge text={estadoBadge.label} cls={estadoBadge.cls} />
                      </td>

                      {/* Fecha */}
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap font-mono text-xs">
                        {new Date(o.created_at).toLocaleDateString("es-UY")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paginación */}
        {!cargando && paginacion && total > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
            <span>{desde}–{hasta} de {total} órdenes</span>
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

      {/* Modal detalle */}
      {selectedOrden && (
        <TarotOrdenDetalle
          orden={selectedOrden}
          onClose={() => setSelectedOrden(null)}
        />
      )}
    </div>
  );
}
