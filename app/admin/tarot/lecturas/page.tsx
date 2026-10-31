"use client";
import { useState, useEffect, Fragment } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { TarotLecturaDetalle } from "@/components/admin/TarotLecturaDetalle";

interface Lectura {
  id: string;
  orden_id: string;
  estado: string;
  numero_intento: number;
  es_vigente: boolean;
  ia_modelo: string;
  ia_tokens_entrada: number;
  ia_tokens_salida: number;
  ia_costo_usd: number;
  resumen_lectura: string | null;
  error_codigo: string | null;
  error_mensaje: string | null;
  generado_at: string | null;
  created_at: string;
  estado_resumen: string;
  warnings: string[];
}

interface Paginacion {
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

// Etiquetas según lo que pasó con cada intento (2026-10-31). Solo cambia cómo
// se MUESTRA: los datos no se tocan. Se deduce con las lecturas de la misma
// orden que trae la página. El ⚠ queda solo para lo que necesita atención:
// una orden SIN lectura oficial con un error, o "generando" hace más de 30 min.
const GRIS = "bg-gray-800 text-gray-400";
type Etiqueta = { label: string; cls: string; alerta: boolean };

function etiquetar(l: Lectura, tieneOficial: boolean): Etiqueta {
  if (l.estado === "completada") {
    return l.es_vigente
      ? { label: "Oficial", cls: "bg-emerald-900/50 text-emerald-300", alerta: false }
      : { label: "Reemplazada", cls: GRIS, alerta: false };
  }
  if (l.estado === "error") {
    return tieneOficial
      ? { label: "Falló, se reintentó", cls: GRIS, alerta: false }
      : { label: "Error", cls: "bg-red-900/50 text-red-300", alerta: true };
  }
  if (l.estado === "generando") {
    if (tieneOficial) return { label: "Descartada", cls: GRIS, alerta: false };
    const minutos = (Date.now() - new Date(l.created_at).getTime()) / 60000;
    return minutos > 30
      ? { label: "Trabada", cls: "bg-red-900/50 text-red-300", alerta: true }
      : { label: "Generando", cls: "bg-amber-900/50 text-amber-300", alerta: false };
  }
  if (l.estado === "pendiente") return { label: "Pendiente", cls: GRIS, alerta: false };
  return { label: l.estado, cls: GRIS, alerta: false };
}

// Una fila por orden: la lectura oficial (o, si no hay, la más reciente)
// arriba, y el resto de los intentos plegados debajo. Respeta el orden en que
// llegan del servidor (más nuevas primero).
type Grupo = { ordenId: string; principal: Lectura; otras: Lectura[]; tieneOficial: boolean };
function agrupar(lecturas: Lectura[]): Grupo[] {
  const porOrden = new Map<string, Lectura[]>();
  for (const l of lecturas) {
    const lista = porOrden.get(l.orden_id);
    if (lista) lista.push(l); else porOrden.set(l.orden_id, [l]);
  }
  return Array.from(porOrden.entries()).map(([ordenId, lista]) => {
    const oficial = lista.find((l) => l.estado === "completada" && l.es_vigente);
    const principal = oficial ?? lista[0];
    return { ordenId, principal, otras: lista.filter((l) => l !== principal), tieneOficial: !!oficial };
  });
}

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

const LIMIT = 50;

export default function TarotLecturasPage() {
  const [filtros, setFiltros] = useState({ estado: "", solo_errores: false, offset: 0 });
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const alternar = (ordenId: string) => setAbiertas((prev) => {
    const n = new Set(prev);
    if (n.has(ordenId)) n.delete(ordenId); else n.add(ordenId);
    return n;
  });

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
        const r = await fetch(`/api/admin/tarot/lecturas?${params.toString()}`);
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
        } else {
          setLecturas(json.lecturas ?? []);
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
          <h2 className="text-base font-semibold text-white">Lecturas</h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros({ ...filtros, estado: e.target.value, offset: 0 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos los estados</option>
            {/* Estados reales de tarot_lecturas (antes había valores que no existen). */}
            <option value="pendiente">Pendiente</option>
            <option value="generando">Generando</option>
            <option value="completada">Completada</option>
            <option value="error">Error</option>
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
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Orden ID</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Estado</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Modelo IA</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Costo USD</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Resumen</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Generado</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando lecturas…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && lecturas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados.
                    </td>
                  </tr>
                )}
                {!cargando && agrupar(lecturas).map((g) => {
                  const abierta = abiertas.has(g.ordenId);
                  const filas = [g.principal, ...(abierta ? g.otras : [])];
                  return (
                    <Fragment key={g.ordenId}>
                      {filas.map((l, i) => {
                        const et = etiquetar(l, g.tieneOficial);
                        const esPrincipal = i === 0;
                        return (
                          <tr
                            key={l.id}
                            onClick={() => setSelectedId(l.id)}
                            className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${
                              et.alerta ? "bg-red-950/10" : ""
                            } ${esPrincipal ? "" : "bg-gray-950/40"}`}
                          >
                            <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                              {esPrincipal ? `${l.orden_id.slice(0, 8)}…` : <span className="pl-3 text-gray-600">intento {l.numero_intento}</span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Badge text={et.label} cls={et.cls} />
                              {et.alerta && (
                                <span className="ml-1.5 text-xs text-red-400" title="Necesita atención: la orden no tiene una lectura oficial">⚠</span>
                              )}
                              {esPrincipal && g.otras.length > 0 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); alternar(g.ordenId); }}
                                  className="ml-2 inline-flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-gray-300"
                                  title={abierta ? "Ocultar los otros intentos" : "Ver los otros intentos de esta orden"}
                                >
                                  +{g.otras.length} {g.otras.length === 1 ? "intento" : "intentos"}
                                  <ChevronDown size={12} className={`transition-transform ${abierta ? "rotate-180" : ""}`} />
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-400">{l.ia_modelo || "—"}</td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                              ${Number(l.ia_costo_usd).toFixed(4)}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400 max-w-[240px] truncate">
                              {l.resumen_lectura?.slice(0, 60) ?? l.error_mensaje?.slice(0, 60) ?? "—"}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                              {l.generado_at ? new Date(l.generado_at).toLocaleDateString("es-UY") : "—"}
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
            <span>{desde}–{hasta} de {total} lecturas</span>
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
        <TarotLecturaDetalle
          id={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </TarotAdminShell>
  );
}
