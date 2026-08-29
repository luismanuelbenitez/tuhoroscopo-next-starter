"use client";
import { useState } from "react";
import { X, Banknote, AlertTriangle } from "lucide-react";

const ESTADOS_YA_PROCESADOS = new Set([
  "pago_confirmado",
  "generando_lectura",
  "lectura_lista",
  "generando_pdf",
  "pdf_listo",
  "enviando_whatsapp",
  "entregado",
  "entregado_simulado",
]);

const MOTIVOS = [
  { value: "pago_sandbox_no_procesado", label: "Pago sandbox no procesado" },
  { value: "pago_otro_medio",           label: "Pago recibido por otro medio" },
  { value: "ajuste_administrativo",     label: "Ajuste administrativo" },
  { value: "otro",                      label: "Otro" },
] as const;

const MOTIVO_LABEL: Record<string, string> = Object.fromEntries(
  MOTIVOS.map((m) => [m.value, m.label]),
);

const ERRORES_COBRO: Record<string, string> = {
  orden_ya_procesada:          "La orden ya fue procesada por MP. No se puede aplicar cobro manual.",
  cobro_manual_ya_registrado:  "Esta orden ya tiene un cobro manual registrado.",
  orden_no_encontrada:         "Orden no encontrada.",
  motivo_invalido:             "Motivo inválido.",
  unauthorized:                "Sin permisos.",
};

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
}

const MP_STATUS_CLS: Record<string, string> = {
  approved:     "bg-emerald-900/50 text-emerald-300",
  pending:      "bg-amber-900/50 text-amber-300",
  in_process:   "bg-amber-900/50 text-amber-300",
  rejected:     "bg-red-900/50 text-red-300",
  cancelled:    "bg-gray-800 text-gray-400",
  refunded:     "bg-sky-900/50 text-sky-300",
  charged_back: "bg-red-900/50 text-red-400",
};

const MP_STATUS_LABEL: Record<string, string> = {
  approved:     "Aprobado",
  pending:      "Pendiente",
  in_process:   "En proceso",
  rejected:     "Rechazado",
  cancelled:    "Cancelado",
  refunded:     "Reembolsado",
  charged_back: "Chargeback",
};

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-UY", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
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
  onSuccess,
}: {
  pago: Pago;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [motivo, setMotivo]             = useState("");
  const [observacion, setObservacion]   = useState("");
  const [enviando, setEnviando]         = useState(false);
  const [errModal, setErrModal]         = useState<string | null>(null);
  const [exitoso, setExitoso]           = useState(false);

  const esCobrable =
    !pago.cobro_manual &&
    !ESTADOS_YA_PROCESADOS.has(pago.orden_estado ?? "");

  const statusCls = pago.mp_status
    ? (MP_STATUS_CLS[pago.mp_status] ?? "bg-gray-800 text-gray-400")
    : "bg-gray-800 text-gray-500";
  const statusLabel = pago.mp_status
    ? (MP_STATUS_LABEL[pago.mp_status] ?? pago.mp_status)
    : "Sin webhook";

  function abrirModal() {
    setMotivo("");
    setObservacion("");
    setErrModal(null);
    setModalAbierto(true);
  }

  async function confirmarCobro() {
    if (!motivo) { setErrModal("Seleccioná un motivo."); return; }
    setEnviando(true);
    setErrModal(null);
    try {
      const res = await fetch("/api/admin/tarot/pagos/cobro-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orden_id:   pago.orden_id,
          motivo,
          observacion: observacion || null,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !data.ok) {
        setErrModal(ERRORES_COBRO[data.motivo] ?? data.motivo ?? `Error ${res.status}`);
      } else {
        setModalAbierto(false);
        setExitoso(true);
        setTimeout(() => onSuccess?.(), 1200);
      }
    } catch {
      setErrModal("Error de red al intentar registrar el cobro.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <span className="text-sm font-medium text-white">Detalle pago</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Datos MP */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Datos del pago</h3>
            <DataRow label="Estado MP" value={
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCls}`}>
                {statusLabel}
              </span>
            } />
            <DataRow label="Detalle estado"   value={pago.mp_status_detail ?? "—"} />
            <DataRow label="Monto"            value={pago.monto != null ? `${pago.moneda} ${pago.monto}` : "—"} />
            <DataRow label="Tipo de pago"     value={pago.mp_payment_type ?? "—"} />
            <DataRow label="Método"           value={pago.mp_payment_method_id ?? "—"} />
            <DataRow label="Cuotas"           value={pago.mp_installments > 1 ? `${pago.mp_installments} cuotas` : "1 cuota"} />
            <DataRow label="Payment ID"       value={<span className="font-mono text-xs">{pago.mp_payment_id ?? "—"}</span>} />
            <DataRow label="Referencia"       value={<span className="font-mono text-xs">{pago.mp_external_reference ?? "—"}</span>} />
            <DataRow label="Orden ID"         value={<span className="font-mono text-xs">{pago.orden_id}</span>} />
            <DataRow label="Estado orden"     value={<span className="font-mono text-xs text-gray-400">{pago.orden_estado ?? "—"}</span>} />
            <DataRow label="Webhook recibido" value={fmtFecha(pago.webhook_received_at)} />
            <DataRow label="Creado"           value={fmtFecha(pago.created_at)} />
          </div>

          {/* Cobro manual registrado */}
          {pago.cobro_manual && (
            <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Banknote size={14} className="text-amber-400 shrink-0" />
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Cobro administrativo interno</p>
              </div>
              <DataRow label="Motivo"      value={MOTIVO_LABEL[pago.cobro_manual_motivo ?? ""] ?? pago.cobro_manual_motivo ?? "—"} />
              {pago.cobro_manual_observacion && (
                <DataRow label="Observación" value={pago.cobro_manual_observacion} />
              )}
              <DataRow label="Registrado"  value={fmtFecha(pago.cobro_manual_at)} />
              <DataRow label="Por"         value={pago.cobro_manual_por ?? "—"} />
            </div>
          )}

          {/* Warnings */}
          {pago.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1.5">Advertencias</p>
              {pago.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300">⚠ {w}</p>
              ))}
            </div>
          )}

          {/* Éxito */}
          {exitoso && (
            <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
              ✓ Cobro manual registrado. Generando lectura…
            </div>
          )}

          {/* Acción cobro manual */}
          {esCobrable && !exitoso && (
            <div>
              <button
                onClick={abrirModal}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
              >
                <Banknote size={15} />
                Marcar como cobrado manualmente
              </button>
            </div>
          )}

          {!esCobrable && !pago.cobro_manual && !exitoso && (
            <p className="text-xs text-gray-600">
              Los pagos son gestionados por Mercado Pago. No hay acciones disponibles desde el panel.
            </p>
          )}

        </div>
      </div>

      {/* Modal de confirmación */}
      {modalAbierto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => { if (!enviando) setModalAbierto(false); }}
          />
          <div className="relative z-10 w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4 p-6">

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Confirmar cobro manual</h3>
              <button
                onClick={() => { if (!enviando) setModalAbierto(false); }}
                disabled={enviando}
                className="text-gray-500 hover:text-white p-1 rounded transition-colors disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-amber-700/30 bg-amber-950/20 px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300 leading-relaxed">
                Marca la orden como cobrada internamente y dispara la generación de lectura.
                No modifica ningún dato de Mercado Pago. Acción irreversible.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Motivo *</label>
                <select
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={enviando}
                  className="w-full border border-gray-700 rounded-lg bg-gray-800 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                >
                  <option value="">Seleccioná un motivo…</option>
                  {MOTIVOS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Observación <span className="text-gray-600 font-normal">(opcional)</span>
                </label>
                <textarea
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  disabled={enviando}
                  rows={2}
                  maxLength={500}
                  placeholder="Ej: Cliente pagó por transferencia bancaria, comprobante recibido."
                  className="w-full border border-gray-700 rounded-lg bg-gray-800 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500 resize-none placeholder-gray-600 disabled:opacity-50"
                />
              </div>
            </div>

            {errModal && (
              <div className="mt-3 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                {errModal}
              </div>
            )}

            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => { if (!enviando) setModalAbierto(false); }}
                disabled={enviando}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarCobro}
                disabled={!motivo || enviando}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {enviando ? "Registrando…" : "Confirmar cobro manual"}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
