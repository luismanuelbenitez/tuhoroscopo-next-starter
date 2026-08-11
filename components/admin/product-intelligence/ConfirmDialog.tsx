"use client";
import { useState } from "react";
import { AlertCircle, X, Loader2 } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  confirmClassName = "bg-red-800 hover:bg-red-700",
  requireMotivo = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmClassName?: string;
  requireMotivo?: boolean;
  onConfirm: (motivo?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm(requireMotivo ? motivo : undefined);
    } finally {
      setLoading(false);
      setMotivo("");
    }
  }

  const canConfirm = !requireMotivo || motivo.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-start justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <h3 className="text-sm font-semibold text-white">{title}</h3>
          </div>
          <button onClick={onCancel} className="text-gray-600 hover:text-gray-300 transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {description && <p className="text-sm text-gray-400">{description}</p>}
          {requireMotivo && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                Motivo del cambio <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Describí brevemente por qué estás haciendo este cambio…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-800">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !canConfirm}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50 ${confirmClassName}`}
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {loading ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
