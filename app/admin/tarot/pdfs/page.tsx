"use client";
import { useState, useEffect, Fragment } from "react";
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ChevronDown,
  Download,
  ExternalLink,
} from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
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

// Vista para personas (2026-10-31): una fila por orden con el cliente, la
// versión actual del PDF, cuánto tardó, si el cliente lo descargó y el
// archivo. El id de la orden queda al pasar el mouse. Solo presentación.
interface OrdenInfo { cliente: string | null; tema: string | null; estado: string | null; interna: boolean; descargas: number }
const GRIS = "bg-gray-800 text-gray-400";
type Etiqueta = { label: string; cls: string; alerta: boolean };
const esListo = (p: Pdf) => p.estado === "listo" || p.estado === "generado";
const esError = (p: Pdf) => p.estado === "error" || p.estado === "error_generacion";

function etiquetar(p: Pdf, principal: boolean, hayListo: boolean): Etiqueta {
  if (esListo(p)) return principal
    ? { label: "Actual", cls: "bg-emerald-900/50 text-emerald-300", alerta: false }
    : { label: "Reemplazado", cls: GRIS, alerta: false };
  if (esError(p)) return hayListo
    ? { label: "Falló, se rehízo", cls: GRIS, alerta: false }
    : { label: "Error", cls: "bg-red-900/50 text-red-300", alerta: true };
  if (p.estado === "generando") {
    const min = (Date.now() - new Date(p.created_at).getTime()) / 60000;
    return min > 30 ? { label: "Trabado", cls: "bg-red-900/50 text-red-300", alerta: true } : { label: "Generando", cls: "bg-amber-900/50 text-amber-300", alerta: false };
  }
  if (p.estado === "invalidado") return { label: "Invalidado", cls: GRIS, alerta: false };
  return { label: p.estado === "pendiente" ? "Pendiente" : p.estado, cls: GRIS, alerta: false };
}

type Grupo = { ordenId: string; principal: Pdf; otras: Pdf[]; hayListo: boolean };
function agrupar(pdfs: Pdf[]): Grupo[] {
  const m = new Map<string, Pdf[]>();
  for (const p of pdfs) { const l = m.get(p.orden_id); if (l) l.push(p); else m.set(p.orden_id, [p]); }
  return Array.from(m.entries()).map(([ordenId, lista]) => {
    const principal = lista.find(esListo) ?? lista[0];
    return { ordenId, principal, otras: lista.filter((x) => x !== principal), hayListo: lista.some(esListo) };
  });
}

const TEMAS: Record<string, string> = { general: "General", amor: "Amor", trabajo: "Trabajo", salud: "Salud", dinero: "Dinero", decision: "Decisión" };
const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
function tardo(desde: string, hasta: string | null): string | null {
  if (!hasta) return null;
  const s = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}
const tamano = (b: number | null) => (b ? (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`) : null);

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ordenes, setOrdenes] = useState<Record<string, OrdenInfo>>({});
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const alternar = (id: string) => setAbiertas((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

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
          setOrdenes(json.ordenes ?? {});
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


  const total = paginacion?.total ?? 0;
  const desde = total === 0 ? 0 : filtros.offset + 1;
  const hasta = Math.min(filtros.offset + LIMIT, total);

  return (
    <TarotAdminShell>
      <main className="px-6 py-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">PDFs</h2>
          <p className="text-xs text-gray-500 mt-1">Una fila por orden: la versión actual del PDF y si el cliente lo descargó. Tocá una fila para ver el detalle.</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros({ ...filtros, estado: e.target.value, offset: 0 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos los estados</option>
            {/* Estados reales de tarot_pdfs (el de éxito es "listo"). */}
            <option value="pendiente">Pendiente</option>
            <option value="generando">Generando</option>
            <option value="listo">Listo</option>
            <option value="error">Error</option>
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
          <button
            onClick={() => setFiltros({ ...filtros, estado: filtros.estado === "pendiente" ? "" : "pendiente", solo_errores: false, offset: 0 })}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
              filtros.estado === "pendiente"
                ? "border-sky-700 bg-sky-900/40 text-sky-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
            }`}
          >
            Solo pendientes
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
                  <th className="px-4 py-3 font-medium text-gray-400">Cliente</th>
                  <th className="px-4 py-3 font-medium text-gray-400">PDF</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Generado</th>
                  <th className="px-4 py-3 font-medium text-gray-400">El cliente</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Archivo</th>
                  <th className="px-4 py-3 font-medium text-gray-400"></th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando PDFs…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && pdfs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados.
                    </td>
                  </tr>
                )}
                {!cargando && agrupar(pdfs).map((g) => {
                  const o = ordenes[g.ordenId];
                  const abierta = abiertas.has(g.ordenId);
                  const filas = [g.principal, ...(abierta ? g.otras : [])];
                  return (
                    <Fragment key={g.ordenId}>
                      {filas.map((p, i) => {
                        const principal = i === 0;
                        const et = etiquetar(p, principal, g.hayListo);
                        const dur = tardo(p.created_at, p.generado_at);
                        return (
                          <tr
                            key={p.id}
                            onClick={() => setSelectedId(p.id)}
                            className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${et.alerta ? "bg-red-950/10" : ""} ${principal ? "" : "bg-gray-950/40"}`}
                          >
                            <td className="px-4 py-3" title={`Orden ${p.orden_id}`}>
                              {principal ? (
                                <div>
                                  <p className="text-sm text-gray-100 whitespace-nowrap">
                                    {o?.cliente ?? "Sin nombre"}
                                    {o?.interna && <span className="ml-1.5 align-middle rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-gray-800 text-gray-400">Interna</span>}
                                  </p>
                                  <p className="text-[11px] text-gray-500 mt-0.5">{o?.tema ? (TEMAS[o.tema] ?? o.tema) : "—"}</p>
                                </div>
                              ) : <span className="pl-3 text-xs text-gray-600">versión {p.numero_intento}</span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Badge text={et.label} cls={et.cls} />
                              {et.alerta && <span className="ml-1.5 text-xs text-red-400" title="Necesita atención: la orden no tiene un PDF listo">⚠</span>}
                              {principal && g.otras.length > 0 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); alternar(g.ordenId); }}
                                  className="ml-2 inline-flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-gray-300"
                                  title={abierta ? "Ocultar versiones anteriores" : "Ver versiones anteriores"}
                                >
                                  +{g.otras.length} {g.otras.length === 1 ? "versión" : "versiones"}
                                  <ChevronDown size={12} className={`transition-transform ${abierta ? "rotate-180" : ""}`} />
                                </button>
                              )}
                              {esError(p) && p.error_mensaje && <p className="text-[11px] text-red-300/80 mt-0.5 max-w-[220px] truncate" title={p.error_mensaje}>{p.error_mensaje}</p>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                              {fechaHora(p.generado_at ?? p.created_at)}
                              {dur && <span className="block text-[11px] text-gray-600 mt-0.5">tardó {dur}</span>}
                            </td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              {principal && o ? (
                                o.descargas > 0
                                  ? <span className="inline-flex items-center gap-1 text-emerald-300/90"><Download size={12} /> Lo bajó{o.descargas > 1 ? ` ${o.descargas} veces` : ""}</span>
                                  : <span className="text-gray-500">No lo bajó (aún)</span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                              {[p.paginas ? `${p.paginas} págs.` : null, tamano(p.tamano_bytes), p.plantilla_usada].filter(Boolean).join(" · ") || "—"}
                            </td>
                            <td className="px-4 py-3">
                              {p.storage_url ? (
                                <a href={p.storage_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200">
                                  Abrir <ExternalLink size={11} />
                                </a>
                              ) : <span className="text-xs text-gray-600">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
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
    </TarotAdminShell>
  );
}
