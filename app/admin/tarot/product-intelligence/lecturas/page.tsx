"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  BookOpen, Loader2, AlertCircle, Search, RefreshCw, ChevronLeft, ChevronRight,
} from "lucide-react";
import { PIABreadcrumb } from "@/components/admin/product-intelligence/PIABreadcrumb";
import { ContextBanner } from "@/components/admin/product-intelligence/ContextBanner";

interface LecturaRow {
  id: string; orden_id: string; estado: string; numero_intento: number; es_vigente: boolean;
  ia_modelo: string; ia_costo_usd: number | string; resumen_lectura: string | null;
  generado_at: string | null; created_at: string;
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", dateStyle: "short", timeStyle: "short" });
}

function fmtCosto(v: number | string | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return `$${(n * 1000).toFixed(2)} / 1k`;
}

const ESTADOS = ["", "exitosa", "fallida", "en_proceso"] as const;

export default function LecturasPage() {
  const [lecturas, setLecturas] = useState<LecturaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroModelo, setFiltroModelo] = useState("");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (filtroEstado) params.set("estado", filtroEstado);
      if (filtroModelo) params.set("ia_modelo", filtroModelo);
      if (filtroFechaDesde) params.set("fecha_desde", filtroFechaDesde);
      if (filtroFechaHasta) params.set("fecha_hasta", filtroFechaHasta);

      const res = await fetch(`/api/admin/tarot/lecturas?${params}`);
      const data = await res.json();
      if (data.ok) {
        setLecturas(data.lecturas ?? []);
        setTotal(data.paginacion?.total ?? data.lecturas?.length ?? 0);
      } else {
        setError(data.detalle ?? data.motivo ?? "Error al cargar lecturas");
      }
    } catch { setError("Error de red"); }
    finally { setLoading(false); }
  }, [offset, filtroEstado, filtroModelo, filtroFechaDesde, filtroFechaHasta]);

  useEffect(() => { cargar(); }, [cargar]);

  function handleFilter() { setOffset(0); cargar(); }

  // Client-side text filter
  const filtered = busqueda.trim()
    ? lecturas.filter((l) =>
        l.id.includes(busqueda.trim()) ||
        l.orden_id.includes(busqueda.trim()) ||
        (l.resumen_lectura ?? "").toLowerCase().includes(busqueda.toLowerCase())
      )
    : lecturas;

  const ESTADO_CLS: Record<string, string> = {
    exitosa: "text-emerald-400", fallida: "text-red-400", en_proceso: "text-amber-400",
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 px-6 py-4">
        <PIABreadcrumb segments={[{ label: "Product Intelligence", href: "/admin/tarot/product-intelligence" }, { label: "Lecturas" }]} />
        <div className="mt-3 flex items-center gap-2">
          <BookOpen size={18} className="text-purple-400" />
          <h1 className="text-base font-semibold text-white">Lecturas</h1>
          <span className="text-xs text-gray-600 ml-1">Explorador y análisis de calidad</span>
        </div>
      </div>

      <div className="p-6 space-y-4 max-w-5xl">
        <ContextBanner variant="info">
          Las lecturas históricas no tienen trazabilidad de versión de prompt registrada — se muestra como &quot;Versión no registrada&quot;.
          Desde este Sprint, nuevas lecturas con reviews quedan vinculadas al prompt conocido al momento de la evaluación.
        </ContextBanner>

        {/* Filters */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Fecha desde</label>
              <input type="date" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Fecha hasta</label>
              <input type="date" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Estado</label>
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500">
                {ESTADOS.map((e) => <option key={e} value={e}>{e || "Todos"}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Modelo</label>
              <input type="text" value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)}
                placeholder="ej. gpt-4o" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por ID u orden…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500" />
            </div>
            <button onClick={handleFilter} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
              <RefreshCw size={11} /> Aplicar
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-8"><Loader2 size={15} className="animate-spin" /> Cargando lecturas…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-8 text-center">
            <p className="text-sm text-gray-500">No hay lecturas con los filtros actuales.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
              <span className="text-sm font-semibold text-gray-200">
                Lecturas <span className="text-gray-600">({filtered.length}{total > LIMIT ? `/${total}` : ""})</span>
              </span>
            </div>
            <div className="divide-y divide-gray-800/40">
              {filtered.map((l) => (
                <Link key={l.id}
                  href={`/admin/tarot/product-intelligence/lecturas/${l.id}` as Route<string>}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-gray-900/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400 truncate">{l.id.slice(0, 8)}…</span>
                      <span className={`text-xs font-medium ${ESTADO_CLS[l.estado] ?? "text-gray-400"}`}>{l.estado}</span>
                      {!l.es_vigente && <span className="text-xs text-gray-700">inactiva</span>}
                    </div>
                    {l.resumen_lectura && (
                      <p className="text-xs text-gray-600 truncate mt-0.5">{l.resumen_lectura}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-xs text-gray-400">{fmt(l.generado_at ?? l.created_at)}</p>
                    <p className="text-xs text-gray-600 font-mono">{l.ia_modelo}</p>
                    <p className="text-xs text-gray-700">{fmtCosto(l.ia_costo_usd)}</p>
                  </div>
                </Link>
              ))}
            </div>
            {total > LIMIT && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800/60">
                <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-white disabled:opacity-30 transition-colors">
                  <ChevronLeft size={13} /> Anterior
                </button>
                <span className="text-xs text-gray-600">{offset + 1}–{Math.min(offset + LIMIT, total)} de {total}</span>
                <button onClick={() => setOffset(offset + LIMIT)} disabled={offset + LIMIT >= total}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-white disabled:opacity-30 transition-colors">
                  Siguiente <ChevronRight size={13} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
