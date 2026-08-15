"use client";
import { useState } from "react";
import { AlertCircle, X, Loader2 } from "lucide-react";

const MOTIVOS = [
  { value: "cliente_no_recibio", label: "Cliente indica que no recibió" },
  { value: "direccion_corregida", label: "Dirección corregida" },
  { value: "solicitud_cliente", label: "Solicitud del cliente" },
  { value: "prueba_administrativa", label: "Prueba administrativa" },
  { value: "otro", label: "Otro" },
] as const;

export function SolicitarReenvioDialog({
  ordenId,
  canal,
  onClose,
  onCreada,
}: {
  ordenId: string;
  canal: "whatsapp" | "email";
  onClose: () => void;
  onCreada: () => void;
}) {
  const [motivo, setMotivo] = useState<string>("cliente_no_recibio");
  const [detalle, setDetalle] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canalLabel = canal === "whatsapp" ? "WhatsApp" : "Email";
  const requiereDetalle = motivo === "otro";
  const canSubmit = !requiereDetalle || detalle.trim().length > 0;

  async function enviar() {
    if (!canSubmit || loading) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/tarot/entregas/solicitar-reenvio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orden_id: ordenId,
          canal,
          motivo,
          motivo_detalle: detalle.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErrorMsg(json.detalle ?? json.motivo ?? json.motivo_error ?? `Error ${res.status}`);
        return;
      }
      onCreada();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-start justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-400 shrink-0" />
            <h3 className="text-sm font-semibold text-white">Solicitar reenvío por {canalLabel}</h3>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">
            Esta entrega ya fue enviada exitosamente. Solicitar un reenvío queda pendiente de
            autorización administrativa — no se envía nada todavía.
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Motivo <span className="text-red-400">*</span></label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              {MOTIVOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Detalle {requiereDetalle && <span className="text-red-400">*</span>}
            </label>
            <textarea
              rows={3}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder={requiereDetalle ? "Describí el motivo…" : "Opcional"}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>
          {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-800">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={loading || !canSubmit}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50 bg-amber-700 hover:bg-amber-600"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {loading ? "Enviando…" : "Solicitar reenvío"}
          </button>
        </div>
      </div>
    </div>
  );
}
