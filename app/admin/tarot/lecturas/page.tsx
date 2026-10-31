"use client";
import { useState, useEffect, Fragment } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Eye,
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

// Datos de la orden para mostrar (los arma /api/admin/tarot/lecturas).
interface OrdenInfo {
  cliente: string | null;
  tipo: string | null;
  tema: string | null;
  estado: string | null;
  abrio: boolean;
}

interface Paginacion {
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

// Vista pensada para personas (2026-10-31): una fila por orden con el nombre
// del cliente, la salud de la entrega y los tiempos; el id de la orden queda
// como dato de referencia (al pasar el mouse y en el detalle). Solo cambia
// cómo se MUESTRA: los datos no se tocan.

// Etiqueta de cada intento según lo que pasó, deducida con las lecturas de la
// misma orden. El ⚠ queda solo para una orden SIN lectura oficial con error
// o "generando" hace más de 30 min (un cliente pagó y no recibió nada).
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
    return minutosDesde(l.created_at) > 30
      ? { label: "Trabada", cls: "bg-red-900/50 text-red-300", alerta: true }
      : { label: "Generando", cls: "bg-amber-900/50 text-amber-300", alerta: false };
  }
  if (l.estado === "pendiente") return { label: "Pendiente", cls: GRIS, alerta: false };
  return { label: l.estado, cls: GRIS, alerta: false };
}

function minutosDesde(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

// Una fila por orden: la lectura oficial (o, si no hay, la más reciente)
// arriba y el resto de los intentos plegados debajo. Respeta el orden en que
// llegan del servidor (más nuevas primero).
type Grupo = { ordenId: string; principal: Lectura; otras: Lectura[]; tieneOficial: boolean; primera: Lectura };
function agrupar(lecturas: Lectura[]): Grupo[] {
  const porOrden = new Map<string, Lectura[]>();
  for (const l of lecturas) {
    const lista = porOrden.get(l.orden_id);
    if (lista) lista.push(l); else porOrden.set(l.orden_id, [l]);
  }
  return Array.from(porOrden.entries()).map(([ordenId, lista]) => {
    const oficial = lista.find((l) => l.estado === "completada" && l.es_vigente);
    const principal = oficial ?? lista[0];
    const primera = lista.reduce((a, b) => (a.created_at <= b.created_at ? a : b));
    return { ordenId, principal, otras: lista.filter((l) => l !== principal), tieneOficial: !!oficial, primera };
  });
}

// Salud de la orden en palabras: lo primero que hay que mirar.
type Salud = { texto: string; cls: string; punto: string };
function salud(g: Grupo, orden: OrdenInfo | undefined): Salud {
  const fallos = g.otras.some((l) => l.estado === "error");
  if (!g.tieneOficial) {
    const algunaTrabada = [g.principal, ...g.otras].some((l) => etiquetar(l, false).alerta);
    return algunaTrabada
      ? { texto: "Necesita atención", cls: "text-red-300", punto: "bg-red-400" }
      : { texto: "En curso", cls: "text-amber-300", punto: "bg-amber-400" };
  }
  if (orden?.estado && orden.estado !== "entregado" && orden.estado !== "entregado_simulado") {
    return orden.estado.startsWith("error")
      ? { texto: "Necesita atención", cls: "text-red-300", punto: "bg-red-400" }
      : { texto: "Entregando", cls: "text-amber-300", punto: "bg-amber-400" };
  }
  return fallos
    ? { texto: "Bien, con reintentos", cls: "text-emerald-300/80", punto: "bg-emerald-500/70" }
    : { texto: "Todo bien", cls: "text-emerald-300", punto: "bg-emerald-400" };
}

const TEMAS: Record<string, string> = {
  amor: "Amor", trabajo: "Trabajo", dinero: "Dinero", salud: "Salud", decision: "Decisión",
  decisiones: "Decisión", general: "General", familia: "Familia", espiritual: "Espiritual",
};
const nombreTema = (t: string | null) => (t ? TEMAS[t] ?? t.charAt(0).toUpperCase() + t.slice(1) : null);

const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }) : "—";
function duracion(desde: string, hasta: string | null): string | null {
  if (!hasta) return null;
  const s = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
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
  const [ordenes, setOrdenes] = useState<Record<string, OrdenInfo>>({});
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
  const grupos = agrupar(lecturas);
  const COLS = 7;

  return (
    <TarotAdminShell>
      <main className="px-6 py-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Lecturas</h2>
          <p className="text-xs text-gray-500 mt-1">Una fila por orden. Tocá una fila para ver el detalle completo de la lectura.</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros({ ...filtros, estado: e.target.value, offset: 0 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos los estados</option>
            {/* Estados reales de tarot_lecturas. */}
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
                  <th className="px-4 py-3 font-medium text-gray-400">Cliente</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Salud</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Lectura</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Iniciada → Finalizada</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Entrega</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Costo IA</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Resumen</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={COLS} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando lecturas…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && lecturas.length === 0 && (
                  <tr>
                    <td colSpan={COLS} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados.
                    </td>
                  </tr>
                )}
                {!cargando && grupos.map((g) => {
                  const o = ordenes[g.ordenId];
                  const sal = salud(g, o);
                  const abierta = abiertas.has(g.ordenId);
                  const filas = [g.principal, ...(abierta ? g.otras : [])];
                  const tema = nombreTema(o?.tema ?? null);
                  return (
                    <Fragment key={g.ordenId}>
                      {filas.map((l, i) => {
                        const et = etiquetar(l, g.tieneOficial);
                        const esPrincipal = i === 0;
                        const inicio = esPrincipal ? g.primera.created_at : l.created_at;
                        const dur = duracion(inicio, l.generado_at);
                        return (
                          <tr
                            key={l.id}
                            onClick={() => setSelectedId(l.id)}
                            className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${
                              et.alerta ? "bg-red-950/10" : ""
                            } ${esPrincipal ? "" : "bg-gray-950/40"}`}
                          >
                            {/* Cliente: el id de la orden queda como referencia al pasar el mouse */}
                            <td className="px-4 py-3" title={`Orden ${l.orden_id}`}>
                              {esPrincipal ? (
                                <div>
                                  <p className="text-sm text-gray-100 whitespace-nowrap">{o?.cliente ?? "Sin nombre"}</p>
                                  <p className="text-[11px] text-gray-500 whitespace-nowrap mt-0.5">
                                    {o?.tipo === "cortesia" ? "Cortesía" : o?.tipo === "venta" ? "Venta" : "—"}
                                    {tema ? ` · ${tema}` : ""}
                                  </p>
                                </div>
                              ) : (
                                <span className="pl-3 text-xs text-gray-600">intento {l.numero_intento}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {esPrincipal && (
                                <span className={`inline-flex items-center gap-1.5 text-xs ${sal.cls}`}>
                                  <span className={`h-2 w-2 rounded-full ${sal.punto}`} />
                                  {sal.texto}
                                </span>
                              )}
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
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                              <span>{fechaHora(inicio)}</span>
                              <span className="text-gray-600"> → </span>
                              <span>{l.generado_at ? hora(l.generado_at) : "—"}</span>
                              {dur && <span className="block text-[11px] text-gray-600 mt-0.5">tardó {dur}</span>}
                            </td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              {esPrincipal && o?.estado ? (
                                o.estado === "entregado" || o.estado === "entregado_simulado" ? (
                                  <div>
                                    <span className="inline-flex items-center gap-1 text-emerald-300/90"><CheckCircle2 size={12} /> Entregada</span>
                                    {o.abrio && <span className="flex items-center gap-1 text-gray-400 mt-0.5"><Eye size={12} /> Abrió la lectura</span>}
                                  </div>
                                ) : (
                                  <span className={o.estado.startsWith("error") ? "text-red-300" : "text-amber-300"}>
                                    {o.estado.replace(/_/g, " ")}
                                  </span>
                                )
                              ) : null}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                              {Number(l.ia_costo_usd) > 0 ? `US$ ${Number(l.ia_costo_usd).toFixed(3)}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400 max-w-[280px] truncate">
                              {l.resumen_lectura?.slice(0, 80) ?? l.error_mensaje?.slice(0, 80) ?? "—"}
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
