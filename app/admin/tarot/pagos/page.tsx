"use client";
import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Banknote,
} from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { TarotPagoDetalle } from "@/components/admin/TarotPagoDetalle";

interface Pago {
  id: string;
  orden_id: string;
  mp_payment_id: string | null;
  mp_external_reference: string | null;
  mp_status: string | null;
  mp_status_detail: string | null;
  mp_payment_type: string | null;
  mp_payment_method_id: string | null;
  mp_installments: number;
  monto: number | null;
  moneda: string | null;
  webhook_received_at: string | null;
  created_at: string;
  estado_resumen: string;
  warnings: string[];
  cobro_manual: boolean;
  cobro_manual_motivo: string | null;
  cobro_manual_observacion: string | null;
  cobro_manual_at: string | null;
  cobro_manual_por: string | null;
  orden_estado: string | null;
  // Datos de presentación (los arma /api/admin/tarot/pagos, 2026-10-31).
  mp?: {
    neto: number | null; comision: number | null; aprobado_at: string | null;
    liberacion_at: string | null; liberacion_estado: string | null; devuelto: number | null;
  } | null;
  orden?: {
    cliente: string | null; tema: string | null; utm_source: string | null; utm_campaign: string | null;
    estado: string | null; interna: boolean;
  } | null;
}

// Vista para personas (2026-10-31): quién pagó, cuánto entra de verdad
// (bruto → comisión → neto), con qué medio, de dónde vino, cuándo se libera la
// plata y cómo quedó su lectura. El ⚠ queda solo para lo que importa
// (rechazos, devoluciones, contracargos). Solo presentación.
const MEDIOS: Record<string, string> = {
  visa: "Visa", debvisa: "Visa", master: "Mastercard", debmaster: "Mastercard", oca: "OCA",
  amex: "American Express", diners: "Diners", lider: "Líder", cabal: "Cabal", creditel: "Creditel",
  anda: "Anda", redpagos: "Redpagos", abitab: "Abitab", account_money: "Saldo de Mercado Pago",
};
const TIPOS: Record<string, string> = {
  credit_card: "crédito", debit_card: "débito", prepaid_card: "prepaga", account_money: "",
  ticket: "efectivo", bank_transfer: "transferencia",
};
function medioDePago(p: Pago): string {
  const m = p.mp_payment_method_id ? (MEDIOS[p.mp_payment_method_id] ?? p.mp_payment_method_id) : null;
  const t = p.mp_payment_type ? (TIPOS[p.mp_payment_type] ?? p.mp_payment_type) : "";
  if (!m && !t) return "—";
  const cuotas = p.mp_payment_type === "credit_card" && p.mp_installments > 1 ? ` · ${p.mp_installments} cuotas` : "";
  return `${m ?? ""}${t ? ` ${t}` : ""}${cuotas}`.trim();
}
function origenDePago(p: Pago): string {
  if (p.cobro_manual) return "Cobro manual";
  const src = (p.orden?.utm_source ?? "").toLowerCase();
  if (src.includes("facebook") || src.includes("meta") || src.includes("instagram") || src === "fb" || src === "ig") {
    return `Meta Ads${p.orden?.utm_campaign ? ` · ${p.orden.utm_campaign}` : ""}`;
  }
  if (src) return `${p.orden?.utm_source}${p.orden?.utm_campaign ? ` · ${p.orden.utm_campaign}` : ""}`;
  return "Directo";
}
const plata = (n: number | null | undefined, moneda: string | null = "UYU") =>
  n == null ? "—" : `${moneda === "UYU" || !moneda ? "$U" : moneda} ${n.toLocaleString("es-UY", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const fechaCorta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
function liberacion(p: Pago): { texto: string; sub: string | null; cls: string } {
  const m = p.mp;
  if (!m?.liberacion_at) return { texto: "—", sub: null, cls: "text-gray-500" };
  const dias = Math.ceil((new Date(m.liberacion_at).getTime() - Date.now()) / 86400000);
  const dia = new Date(m.liberacion_at).toLocaleDateString("es-UY", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit" });
  if (m.liberacion_estado === "released" || dias <= 0) return { texto: "Disponible", sub: `desde ${dia}`, cls: "text-emerald-300" };
  return { texto: dia, sub: `en ${dias} ${dias === 1 ? "día" : "días"}`, cls: "text-amber-300" };
}
const ALERTA_MP = new Set(["rejected", "refunded", "charged_back", "cancelled"]);
const TEMAS: Record<string, string> = { general: "General", amor: "Amor", trabajo: "Trabajo", salud: "Salud", dinero: "Dinero", decision: "Decisión" };

function Cifra({ valor, etiqueta, sub }: { valor: string; etiqueta: string; sub?: string | null }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-gray-500">{etiqueta}</p>
      <p className="text-lg font-semibold text-white mt-0.5">{valor}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

interface Paginacion {
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

const MP_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  approved:    { label: "Aprobado",    cls: "bg-emerald-900/50 text-emerald-300" },
  pending:     { label: "Pendiente",   cls: "bg-amber-900/50 text-amber-300" },
  in_process:  { label: "En proceso",  cls: "bg-amber-900/50 text-amber-300" },
  rejected:    { label: "Rechazado",   cls: "bg-red-900/50 text-red-300" },
  cancelled:   { label: "Cancelado",   cls: "bg-gray-800 text-gray-400" },
  refunded:    { label: "Reembolsado", cls: "bg-sky-900/50 text-sky-300" },
  charged_back:{ label: "Chargeback",  cls: "bg-red-900/50 text-red-400" },
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

const LIMIT = 50;

export default function TarotPagosPage() {
  const [filtros, setFiltros]           = useState({ mp_status: "", moneda: "", offset: 0 });
  const [pagos, setPagos]               = useState<Pago[]>([]);
  const [paginacion, setPaginacion]     = useState<Paginacion | null>(null);
  const [cargando, setCargando]         = useState(false);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [selectedPago, setSelectedPago] = useState<Pago | null>(null);
  const [refreshKey, setRefreshKey]     = useState(0);

  const doFetch = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    if (filtros.mp_status) params.set("mp_status", filtros.mp_status);
    if (filtros.moneda)    params.set("moneda",    filtros.moneda);
    params.set("offset", String(filtros.offset));
    params.set("limit",  String(LIMIT));
    try {
      const r = await fetch(`/api/admin/tarot/pagos?${params.toString()}`);
      const json = await r.json().catch(() => null);
      if (!r.ok) {
        setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
      } else {
        setPagos(json.pagos ?? []);
        setPaginacion(json.paginacion ?? null);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => { doFetch(); }, [doFetch, refreshKey]);

  const total = paginacion?.total ?? 0;
  const desde = total === 0 ? 0 : filtros.offset + 1;
  const hasta = Math.min(filtros.offset + LIMIT, total);

  // Resumen de plata de lo que muestra la página (aprobados, en pesos).
  const aprobados = pagos.filter((p) => p.mp_status === "approved" && (p.moneda ?? "UYU") === "UYU");
  const bruto = aprobados.reduce((a, p) => a + (Number(p.monto) || 0), 0);
  const comision = aprobados.reduce((a, p) => a + (p.mp?.comision ?? 0), 0);
  const neto = aprobados.reduce((a, p) => a + (p.mp?.neto ?? Number(p.monto) ?? 0), 0);
  const porLiberar = aprobados.filter((p) => p.mp?.liberacion_at && p.mp.liberacion_estado !== "released" && new Date(p.mp.liberacion_at).getTime() > Date.now());
  const montoPorLiberar = porLiberar.reduce((a, p) => a + (p.mp?.neto ?? 0), 0);
  const proxima = porLiberar.map((p) => p.mp!.liberacion_at!).sort()[0] ?? null;
  const rechazados = pagos.filter((p) => p.mp_status === "rejected").length;
  const internos = aprobados.filter((p) => p.orden?.interna).length;

  return (
    <TarotAdminShell>
      <main className="px-6 py-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Pagos</h2>
          <p className="text-xs text-gray-500 mt-0.5">Cobros de lecturas por Mercado Pago: cuánto entra, cuánto te queda y cuándo se libera.</p>
        </div>

        {/* Resumen de plata */}
        {pagos.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
            <Cifra etiqueta="Cobrado" valor={plata(bruto)} sub={`${aprobados.length} pago${aprobados.length === 1 ? "" : "s"} aprobado${aprobados.length === 1 ? "" : "s"}${internos ? ` · ${internos} interno${internos > 1 ? "s" : ""}` : ""}${rechazados ? ` · ${rechazados} rechazado${rechazados > 1 ? "s" : ""}` : ""}`} />
            <Cifra etiqueta="Comisión Mercado Pago" valor={plata(Math.round(comision * 100) / 100)} sub={bruto > 0 ? `${((comision / bruto) * 100).toFixed(1)}% de lo cobrado` : null} />
            <Cifra etiqueta="Neto (lo que te queda)" valor={plata(Math.round(neto * 100) / 100)} />
            <Cifra etiqueta="Por liberar" valor={plata(Math.round(montoPorLiberar * 100) / 100)} sub={proxima ? `el próximo se libera el ${new Date(proxima).toLocaleDateString("es-UY", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit" })}` : "nada pendiente"} />
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={filtros.mp_status}
            onChange={(e) => setFiltros({ ...filtros, mp_status: e.target.value, offset: 0 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos los estados MP</option>
            <option value="approved">Aprobado</option>
            <option value="pending">Pendiente</option>
            <option value="rejected">Rechazado</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <select
            value={filtros.moneda}
            onChange={(e) => setFiltros({ ...filtros, moneda: e.target.value, offset: 0 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Moneda: todas</option>
            <option value="UYU">UYU</option>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
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
                  <th className="px-4 py-3 font-medium text-gray-400">Estado</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Cobrado → Neto</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Medio de pago</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Origen</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Plata disponible</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Lectura</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando pagos…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && pagos.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados.
                    </td>
                  </tr>
                )}
                {!cargando && pagos.map((p) => {
                  const badge = p.mp_status
                    ? (MP_STATUS_BADGE[p.mp_status] ?? { label: p.mp_status, cls: "bg-gray-800 text-gray-400" })
                    : { label: "Sin webhook", cls: "bg-gray-800 text-gray-500" };
                  const isRejected = !!p.mp_status && ALERTA_MP.has(p.mp_status);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPago(p)}
                      className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${
                        isRejected ? "bg-red-950/10" : ""
                      }`}
                    >
                      {/* Cliente — la referencia y el ID de pago quedan al pasar el mouse */}
                      <td className="px-4 py-3" title={`${p.mp_external_reference ?? p.orden_id}${p.mp_payment_id ? ` · pago MP ${p.mp_payment_id}` : ""}`}>
                        <p className="text-sm text-white leading-tight">
                          {p.orden?.cliente ?? "—"}
                          {p.orden?.interna && <span className="ml-1.5 align-middle rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-gray-800 text-gray-400">Interna</span>}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{p.orden?.tema ? (TEMAS[p.orden.tema] ?? p.orden.tema) : "—"}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge text={badge.label} cls={badge.cls} />
                        {p.cobro_manual && (
                          <span title="Cobro administrativo interno" className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-amber-400">
                            <Banknote size={11} />
                          </span>
                        )}
                        {p.mp_status && ALERTA_MP.has(p.mp_status) && <span className="ml-1.5 text-xs text-red-400" title={p.mp_status_detail ?? undefined}>⚠</span>}
                        {p.mp?.devuelto ? <p className="text-[11px] text-sky-300 mt-0.5">devuelto {plata(p.mp.devuelto, p.moneda)}</p> : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-sm text-gray-200 font-mono">{plata(p.monto, p.moneda)} <span className="text-gray-600">→</span> <span className="text-emerald-300">{plata(p.mp?.neto ?? null, p.moneda)}</span></p>
                        {p.mp?.comision != null && (
                          <p className="text-[11px] text-gray-500 mt-0.5">comisión {plata(Math.round(p.mp.comision * 100) / 100, p.moneda)}{p.monto ? ` · ${((p.mp.comision / Number(p.monto)) * 100).toFixed(1)}%` : ""}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{medioDePago(p)}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 max-w-[180px] truncate" title={origenDePago(p)}>{origenDePago(p)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {(() => { const l = liberacion(p); return (
                          <>
                            <p className={`text-xs ${l.cls}`}>{l.texto}</p>
                            {l.sub && <p className="text-[11px] text-gray-500 mt-0.5">{l.sub}</p>}
                          </>
                        ); })()}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {(() => {
                          const e = p.orden?.estado ?? p.orden_estado;
                          if (!e) return <span className="text-gray-600">—</span>;
                          if (e === "entregado" || e === "entregado_simulado") return <span className="text-emerald-300/90">✓ Entregada</span>;
                          if (e.startsWith("error")) return <span className="text-red-300">Necesita atención</span>;
                          return <span className="text-amber-300">{e.replace(/_/g, " ")}</span>;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {fechaCorta(p.mp?.aprobado_at ?? p.webhook_received_at ?? p.created_at)}
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
            <span>{desde}–{hasta} de {total} pagos</span>
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

      {selectedPago && (
        <TarotPagoDetalle
          pago={selectedPago}
          onClose={() => setSelectedPago(null)}
          onSuccess={() => {
            setSelectedPago(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </TarotAdminShell>
  );
}
