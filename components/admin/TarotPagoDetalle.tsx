"use client";
import { X } from "lucide-react";

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

const MP_STATUS_CLS: Record<string, string> = {
  approved:    "bg-emerald-900/50 text-emerald-300",
  pending:     "bg-amber-900/50 text-amber-300",
  in_process:  "bg-amber-900/50 text-amber-300",
  rejected:    "bg-red-900/50 text-red-300",
  cancelled:   "bg-gray-800 text-gray-400",
  refunded:    "bg-sky-900/50 text-sky-300",
  charged_back:"bg-red-900/50 text-red-400",
};

const MP_STATUS_LABEL: Record<string, string> = {
  approved:    "Aprobado",
  pending:     "Pendiente",
  in_process:  "En proceso",
  rejected:    "Rechazado",
  cancelled:   "Cancelado",
  refunded:    "Reembolsado",
  charged_back:"Chargeback",
};

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-UY", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-gray-800/50 text-sm last:border-0">
      <span className="w-44 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-200 break-all">{value}</span>
    </div>
  );
}

export function TarotPagoDetalle({
  pago,
  onClose,
}: {
  pago: Pago;
  onClose: () => void;
}) {
  const statusCls = pago.mp_status
    ? (MP_STATUS_CLS[pago.mp_status] ?? "bg-gray-800 text-gray-400")
    : "bg-gray-800 text-gray-500";
  const statusLabel = pago.mp_status
    ? (MP_STATUS_LABEL[pago.mp_status] ?? pago.mp_status)
    : "Sin webhook";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <span className="text-sm font-medium text-white">Detalle pago</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="mb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Datos del pago</h3>
            <DataRow label="Estado MP" value={
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCls}`}>
                {statusLabel}
              </span>
            } />
            <DataRow label="Detalle estado" value={pago.mp_status_detail ?? "—"} />
            <DataRow label="Monto" value={pago.monto != null ? `${pago.moneda} ${pago.monto}` : "—"} />
            <DataRow label="Tipo de pago" value={pago.mp_payment_type ?? "—"} />
            <DataRow label="Método" value={pago.mp_payment_method_id ?? "—"} />
            <DataRow label="Cuotas" value={pago.mp_installments > 1 ? `${pago.mp_installments} cuotas` : "1 cuota"} />
            <DataRow label="Payment ID" value={
              <span className="font-mono text-xs">{pago.mp_payment_id ?? "—"}</span>
            } />
            <DataRow label="Referencia externa" value={
              <span className="font-mono text-xs">{pago.mp_external_reference ?? "—"}</span>
            } />
            <DataRow label="Orden ID" value={
              <span className="font-mono text-xs">{pago.orden_id}</span>
            } />
            <DataRow label="Webhook recibido" value={fmtFecha(pago.webhook_received_at)} />
            <DataRow label="Creado" value={fmtFecha(pago.created_at)} />
          </div>

          {pago.warnings.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/20 p-3">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1.5">Advertencias</p>
              {pago.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300">⚠ {w}</p>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-600">Los pagos son gestionados por Mercado Pago. No hay acciones disponibles desde el panel.</p>
        </div>
      </div>
    </div>
  );
}
