"use client";
import { useState, useEffect } from "react";
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Search,
} from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { TarotNav } from "@/components/admin/TarotNav";

interface Codigo {
  id: string;
  codigo: string;
  tipo_descuento: string;
  valor: number;
  activo: boolean;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  max_usos_total: number | null;
  usos_actuales: number;
  created_at: string;
}

interface Paginacion {
  total?: number;
  page?: number;
  per_page?: number;
  total_pages?: number;
}

const TIPO_LABEL: Record<string, string> = {
  porcentaje:   "Porcentaje",
  monto_fijo:   "Monto fijo",
  precio_fijo:  "Precio fijo",
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

const PER_PAGE = 20;

export default function TarotCodigosPage() {
  const [inputSearch, setInputSearch] = useState("");
  const [filtros, setFiltros] = useState({ search: "", tipo: "", activo: "", page: 1 });
  const [codigos, setCodigos] = useState<Codigo[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  useEffect(() => {
    async function doFetch() {
      setCargando(true);
      setErrorMsg(null);
      const params = new URLSearchParams();
      if (filtros.search) params.set("search", filtros.search);
      if (filtros.tipo) params.set("tipo_descuento", filtros.tipo);
      if (filtros.activo) params.set("activo", filtros.activo);
      params.set("page", String(filtros.page));
      params.set("per_page", String(PER_PAGE));
      try {
        const r = await fetch(`/api/admin/tarot/codigos?${params.toString()}`);
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
        } else {
          setCodigos(json.codigos ?? []);
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
    setFiltros({ ...filtros, search: inputSearch.trim(), page: 1 });
  }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleBuscar();
  }
  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  const totalPages = paginacion?.total_pages ?? 1;
  const total = paginacion?.total ?? codigos.length;

  function formatValor(codigo: Codigo): string {
    if (codigo.tipo_descuento === "porcentaje") return `${codigo.valor}%`;
    if (codigo.tipo_descuento === "precio_fijo") return `Precio fijo: ${codigo.valor}`;
    return `-${codigo.valor}`;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <AdminPanelSwitcher current="ttc" />
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
          <TarotNav current="/admin/tarot/codigos" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Códigos de descuento</h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-1 flex-1 min-w-[200px] border border-gray-700 rounded-lg bg-gray-900 px-3 py-2">
            <Search size={14} className="text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Buscar código…"
              value={inputSearch}
              onChange={(e) => setInputSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>
          <select
            value={filtros.tipo}
            onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value, page: 1 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos los tipos</option>
            <option value="porcentaje">Porcentaje</option>
            <option value="monto_fijo">Monto fijo</option>
            <option value="precio_fijo">Precio fijo</option>
          </select>
          <select
            value={filtros.activo}
            onChange={(e) => setFiltros({ ...filtros, activo: e.target.value, page: 1 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Activos e inactivos</option>
            <option value="true">Solo activos</option>
            <option value="false">Solo inactivos</option>
          </select>
          <button
            onClick={handleBuscar}
            className="border border-amber-700 bg-amber-800/40 hover:bg-amber-700/60 text-amber-200 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Buscar
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800 text-left">
                  <th className="px-4 py-3 font-medium text-gray-400">Código</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Tipo</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Valor</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Estado</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Usos</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Descripción</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Válido hasta</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando códigos…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && codigos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados.
                    </td>
                  </tr>
                )}
                {!cargando && codigos.map((c) => {
                  const agotado = c.max_usos_total != null && c.usos_actuales >= c.max_usos_total;
                  return (
                    <tr key={c.id} className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm font-bold text-white tracking-wide">
                        {c.codigo}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {TIPO_LABEL[c.tipo_descuento] ?? c.tipo_descuento}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-amber-300">
                        {formatValor(c)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {agotado ? (
                          <Badge text="Agotado" cls="bg-orange-900/50 text-orange-300" />
                        ) : c.activo ? (
                          <Badge text="Activo" cls="bg-emerald-900/50 text-emerald-300" />
                        ) : (
                          <Badge text="Inactivo" cls="bg-gray-800 text-gray-500" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                        {c.usos_actuales}
                        {c.max_usos_total != null ? ` / ${c.max_usos_total}` : " / ∞"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                        {c.descripcion ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                        {c.fecha_fin ? new Date(c.fecha_fin).toLocaleDateString("es-UY") : "Sin límite"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!cargando && total > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
            <span>{total} código{total !== 1 ? "s" : ""} total</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltros({ ...filtros, page: Math.max(1, filtros.page - 1) })}
                disabled={filtros.page === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="text-xs text-gray-500">
                {filtros.page} / {totalPages}
              </span>
              <button
                onClick={() => setFiltros({ ...filtros, page: filtros.page + 1 })}
                disabled={filtros.page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
