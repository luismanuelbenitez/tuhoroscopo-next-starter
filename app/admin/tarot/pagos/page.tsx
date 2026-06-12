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
  const [filtros, setFiltros] = useState({ mp_status: "", moneda: "", offset: 0 });
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  useEffect(() => {
    async function doFetch() {
      setCargando(true);
      setErrorMsg(null);
      const params = new URLSearchParams();
      if (filtros.mp_status) params.set("mp_status", filtros.mp_status);
      if (filtros.moneda) params.set("moneda", filtros.moneda);
      params.set("offset", String(filtros.offset));
      params.set("limit", String(LIMIT));
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
          <TarotNav current="/admin/tarot/pagos" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Pagos</h2>
        </div>

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
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Referencia</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Estado MP</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Monto</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Método</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Payment ID</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Webhook</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando pagos…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && pagos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados.
                    </td>
                  </tr>
                )}
                {!cargando && pagos.map((p) => {
                  const badge = p.mp_status
                    ? (MP_STATUS_BADGE[p.mp_status] ?? { label: p.mp_status, cls: "bg-gray-800 text-gray-400" })
                    : { label: "Sin webhook", cls: "bg-gray-800 text-gray-500" };
                  const isRejected = p.mp_status === "rejected";
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors ${
                        isRejected ? "bg-red-950/10" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                        {p.mp_external_reference ?? p.orden_id.slice(0, 8) + "…"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge text={badge.label} cls={badge.cls} />
                        {p.warnings.length > 0 && <span className="ml-1.5 text-xs text-amber-400">⚠</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-300 whitespace-nowrap">
                        {p.moneda} {p.monto ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {p.mp_payment_method_id ?? p.mp_payment_type ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                        {p.mp_payment_id ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                        {p.webhook_received_at
                          ? new Date(p.webhook_received_at).toLocaleDateString("es-UY")
                          : "—"}
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
    </div>
  );
}
