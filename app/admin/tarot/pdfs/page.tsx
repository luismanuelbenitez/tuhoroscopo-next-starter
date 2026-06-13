"use client";
import { useState, useEffect } from "react";
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { TarotNav } from "@/components/admin/TarotNav";
import { TarotPdfDetalle } from "@/components/admin/TarotPdfDetalle";

interface Pdf {
  id: string;
  orden_id: string;
  lectura_id: string;
  estado: string;
  numero_intento: number;
  storage_url: string | null;
  tamano_bytes: number | null;
  paginas: number | null;
  plantilla_usada: string | null;
  error_codigo: string | null;
  error_mensaje: string | null;
  generado_at: string | null;
  url_expira_at: string | null;
  created_at: string;
  diagnostico_admin: { healthy: boolean; warnings: string[]; estado_resumen: string };
}

interface Paginacion {
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

const ESTADO_PDF: Record<string, { label: string; cls: string }> = {
  pendiente:        { label: "Pendiente",  cls: "bg-gray-800 text-gray-400" },
  generando:        { label: "Generando",  cls: "bg-amber-900/50 text-amber-300" },
  generado:         { label: "Generado",   cls: "bg-emerald-900/50 text-emerald-300" },
  error_generacion: { label: "Error",      cls: "bg-red-900/50 text-red-300" },
  invalidado:       { label: "Invalidado", cls: "bg-gray-800 text-gray-500" },
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

const LIMIT = 50;

export default function TarotPdfsPage() {
  const [filtros, setFiltros] = useState({ estado: "", solo_errores: false, offset: 0 });
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    async function doFetch() {
      setCargando(true);
      setErrorMsg(null);
      const params = new URLSearchParams();
      if (filtros.estado) params.set("estado", filtros.estado);
      if (filtros.solo_errores) params.set("solo_errores", "true");
      params.set("offset", String(filtros.offset));
      params.set("limit", String(LIMIT));
      try {
        const r = await fetch(`/api/admin/tarot/pdfs?${params.toString()}`);
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
        } else {
          setPdfs(json.pdfs ?? []);
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
          <TarotNav current="/admin/tarot/pdfs" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">PDFs</h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros({ ...filtros, estado: e.target.value, offset: 0 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="generando">Generando</option>
            <option value="generado">Generado</option>
            <option value="error_generacion">Error</option>
            <option value="invalidado">Invalidado</option>
          </select>
          <button
            onClick={() => setFiltros({ ...filtros, solo_errores: !filtros.solo_errores, estado: "", offset: 0 })}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
              filtros.solo_errores
                ? "border-red-700 bg-red-900/40 text-red-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
            }`}
          >
            Solo errores
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
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Orden ID</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Estado</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Plantilla</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Tamaño</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Págs.</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Generado</th>
                  <th className="px-4 py-3 font-medium text-gray-400">URL</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando PDFs…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && pdfs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados.
                    </td>
                  </tr>
                )}
                {!cargando && pdfs.map((p) => {
                  const badge = ESTADO_PDF[p.estado] ?? { label: p.estado, cls: "bg-gray-800 text-gray-400" };
                  const isError = p.estado === "error_generacion";
                  const warnings = p.diagnostico_admin?.warnings ?? [];
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${
                        isError ? "bg-red-950/10" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                        {p.orden_id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge text={badge.label} cls={badge.cls} />
                        {warnings.length > 0 && <span className="ml-1.5 text-xs text-amber-400">⚠</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{p.plantilla_usada ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                        {p.tamano_bytes ? `${(p.tamano_bytes / 1024).toFixed(0)} KB` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 text-center">{p.paginas ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                        {p.generado_at ? new Date(p.generado_at).toLocaleDateString("es-UY") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {p.storage_url ? (
                          <a
                            href={p.storage_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-amber-400 hover:text-amber-300 underline"
                          >
                            Ver →
                          </a>
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

        {!cargando && paginacion && total > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
            <span>{desde}–{hasta} de {total} PDFs</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltros({ ...filtros, offset: Math.max(0, filtros.offset - LIMIT) })}
                disabled={filtros.offset === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                onClick={() => { if (paginacion.next_offset != null) setFiltros({ ...filtros, offset: paginacion.next_offset }); }}
                disabled={paginacion.next_offset == null}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </main>

      {selectedId && (
        <TarotPdfDetalle
          id={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
