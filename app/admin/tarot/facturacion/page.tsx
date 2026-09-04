"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, AlertCircle, Download, Receipt, Search } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { TarotFacturacionDetalle } from "@/components/admin/TarotFacturacionDetalle";

export interface RegistroFacturacion {
  id: string;
  codigo_interno: string;
  numero_interno: number;
  orden_id: string;
  cliente_id: string | null;
  fecha_venta: string;
  producto_codigo: string;
  producto_nombre_snapshot: string;
  concepto: string;
  moneda: string;
  importe_bruto: number;
  descuento: number;
  importe_neto: number;
  medio_pago: "mercado_pago" | "manual";
  proveedor_pago: string | null;
  referencia_pago: string | null;
  datos_cliente_snapshot: { nombre?: string | null; email?: string | null; telefono?: string | null } | null;
  estado_registro: "activo" | "anulado";
  comprobante_solicitado: boolean;
  estado_comprobante: "no_solicitado" | "pendiente" | "emitido";
  tipo_comprobante: string | null;
  serie_comprobante: string | null;
  numero_comprobante: string | null;
  fecha_comprobante: string | null;
  origen_comprobante: string;
  observaciones: string | null;
  anulado_at: string | null;
  anulado_motivo: string | null;
  anulado_por: string | null;
  created_at: string;
  updated_at: string;
}

interface Kpis {
  ventas_registradas: number;
  facturacion_bruta: number;
  descuentos_total: number;
  facturacion_neta: number;
  ticket_promedio: number;
  comprobantes_solicitados: number;
  comprobantes_emitidos: number;
  comprobantes_pendientes: number;
  cobros_mercado_pago: number;
  cobros_manuales: number;
  anulados: number;
}

interface Paginacion { total: number; limit: number; offset: number; next_offset: number | null }

const PERIODOS = [
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "90d", label: "90 días" },
  { key: "todo", label: "Todo" },
] as const;
type PeriodoKey = typeof PERIODOS[number]["key"];

function rangoDesdePeriodo(p: PeriodoKey): string | null {
  if (p === "todo") return null;
  const dias = p === "hoy" ? 1 : p === "7d" ? 7 : p === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

function Metric({ label, value, amber }: { label: string; value: string | number; amber?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${amber ? "text-amber-300" : "text-gray-100"}`}>{value}</p>
    </div>
  );
}

function Badge({ text, cls }: { text: string; cls: string }) {
  return <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{text}</span>;
}

const MEDIO_PAGO_LABEL: Record<string, { label: string; cls: string }> = {
  mercado_pago: { label: "Mercado Pago", cls: "bg-sky-900/50 text-sky-300" },
  manual: { label: "Manual", cls: "bg-amber-900/50 text-amber-300" },
};
const COMPROBANTE_LABEL: Record<string, { label: string; cls: string }> = {
  no_solicitado: { label: "No solicitado", cls: "bg-gray-800 text-gray-500" },
  pendiente: { label: "Pendiente", cls: "bg-amber-900/50 text-amber-300" },
  emitido: { label: "Emitido", cls: "bg-emerald-900/50 text-emerald-300" },
};

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtMonto(n: number, moneda: string) {
  return `${moneda} ${n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const LIMIT = 50;

export default function TarotFacturacionPage() {
  const [periodo, setPeriodo] = useState<PeriodoKey>("30d");
  const [estadoRegistro, setEstadoRegistro] = useState("");
  const [estadoComprobante, setEstadoComprobante] = useState("");
  const [medioPago, setMedioPago] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [offset, setOffset] = useState(0);

  const [registros, setRegistros] = useState<RegistroFacturacion[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<RegistroFacturacion | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    const desde = rangoDesdePeriodo(periodo);
    if (desde) params.set("fecha_desde", desde);
    if (estadoRegistro) params.set("estado_registro", estadoRegistro);
    if (estadoComprobante) params.set("estado_comprobante", estadoComprobante);
    if (medioPago) params.set("medio_pago", medioPago);
    if (search) params.set("search", search);
    return params;
  }, [periodo, estadoRegistro, estadoComprobante, medioPago, search]);

  const doFetch = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    const params = new URLSearchParams(queryString);
    params.set("offset", String(offset));
    params.set("limit", String(LIMIT));
    try {
      const r = await fetch(`/api/admin/tarot/facturacion?${params.toString()}`);
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
      } else {
        setRegistros(json.registros ?? []);
        setKpis(json.kpis ?? null);
        setPaginacion(json.paginacion ?? null);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [queryString, offset]);

  useEffect(() => { doFetch(); }, [doFetch, refreshKey]);
  useEffect(() => { setOffset(0); }, [periodo, estadoRegistro, estadoComprobante, medioPago, search]);

  function onSubmitSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  const total = paginacion?.total ?? 0;
  const desde = total === 0 ? 0 : offset + 1;
  const hasta = Math.min(offset + LIMIT, total);

  return (
    <TarotAdminShell>
      <main className="px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-amber-400" />
            <div>
              <h2 className="text-base font-semibold text-white">Facturación / Ventas</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Registro administrativo interno — no reemplaza un comprobante fiscal.
              </p>
            </div>
          </div>
          <a
            href={`/api/admin/tarot/facturacion/export?${queryString.toString()}`}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
          >
            <Download size={13} /> Exportar CSV
          </a>
        </div>

        {/* KPIs */}
        {kpis && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-6">
            <Metric label="Ventas registradas" value={kpis.ventas_registradas} amber />
            <Metric label="Facturación neta" value={fmtMonto(kpis.facturacion_neta, "UYU")} amber />
            <Metric label="Ticket promedio" value={fmtMonto(kpis.ticket_promedio, "UYU")} />
            <Metric label="Descuentos" value={fmtMonto(kpis.descuentos_total, "UYU")} />
            <Metric label="Comprobantes emitidos" value={kpis.comprobantes_emitidos} />
            <Metric label="Sin comprobante" value={kpis.ventas_registradas - kpis.comprobantes_solicitados} />
            <Metric label="Comprobantes pendientes" value={kpis.comprobantes_pendientes} />
            <Metric label="Cobros Mercado Pago" value={kpis.cobros_mercado_pago} />
            <Metric label="Cobros manuales" value={kpis.cobros_manuales} />
            <Metric label="Anulados" value={kpis.anulados} />
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex rounded-lg border border-gray-700 overflow-hidden">
            {PERIODOS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriodo(key)}
                className={`text-xs px-3 py-1.5 transition-colors ${periodo === key ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={estadoRegistro}
            onChange={(e) => setEstadoRegistro(e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Estado: todos</option>
            <option value="activo">Activo</option>
            <option value="anulado">Anulado</option>
          </select>

          <select
            value={estadoComprobante}
            onChange={(e) => setEstadoComprobante(e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Comprobante: todos</option>
            <option value="no_solicitado">No solicitado</option>
            <option value="pendiente">Pendiente</option>
            <option value="emitido">Emitido</option>
          </select>

          <select
            value={medioPago}
            onChange={(e) => setMedioPago(e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Medio de pago: todos</option>
            <option value="mercado_pago">Mercado Pago</option>
            <option value="manual">Manual</option>
          </select>

          <form onSubmit={onSubmitSearch} className="flex items-center gap-1.5 ml-auto">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="N° interno, nombre, email, orden, comprobante…"
                className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white pl-8 pr-3 py-2 w-72 focus:outline-none focus:border-amber-500 placeholder-gray-600"
              />
            </div>
          </form>
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
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">N° interno</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Fecha</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Cliente</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Producto</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Importe</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Pago</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Comprobante</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">N° comprobante</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">Cargando…</td></tr>
                )}
                {!cargando && !errorMsg && registros.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-sm">Sin resultados.</td></tr>
                )}
                {!cargando && registros.map((r) => {
                  const pagoBadge = MEDIO_PAGO_LABEL[r.medio_pago] ?? { label: r.medio_pago, cls: "bg-gray-800 text-gray-400" };
                  const compBadge = COMPROBANTE_LABEL[r.estado_comprobante] ?? { label: r.estado_comprobante, cls: "bg-gray-800 text-gray-400" };
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSeleccionado(r)}
                      className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${r.estado_registro === "anulado" ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-amber-300 whitespace-nowrap">
                        {r.codigo_interno}
                        {r.estado_registro === "anulado" && <span className="ml-1.5 text-red-400" title="Anulado">⊘</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtFecha(r.fecha_venta)}</td>
                      <td className="px-4 py-3 text-xs text-gray-300">
                        <div>{r.datos_cliente_snapshot?.nombre ?? "—"}</div>
                        <div className="text-gray-600">{r.datos_cliente_snapshot?.email ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{r.producto_nombre_snapshot}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-200 whitespace-nowrap">{fmtMonto(r.importe_neto, r.moneda)}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><Badge text={pagoBadge.label} cls={pagoBadge.cls} /></td>
                      <td className="px-4 py-3 whitespace-nowrap"><Badge text={compBadge.label} cls={compBadge.cls} /></td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                        {r.numero_comprobante ? `${r.serie_comprobante ?? ""} ${r.numero_comprobante}`.trim() : "—"}
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
            <span>{desde}–{hasta} de {total} registros</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                disabled={offset === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                onClick={() => { if (paginacion.next_offset != null) setOffset(paginacion.next_offset); }}
                disabled={paginacion.next_offset == null}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </main>

      {seleccionado && (
        <TarotFacturacionDetalle
          registroInicial={seleccionado}
          onClose={() => setSeleccionado(null)}
          onSuccess={() => {
            setSeleccionado(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </TarotAdminShell>
  );
}
