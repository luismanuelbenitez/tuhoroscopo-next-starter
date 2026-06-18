"use client";
import { useState } from "react";
import { AlertCircle } from "lucide-react";

interface AcResponse {
  ok: boolean;
  mensaje?: string;
  motivo?: string;
  detalle?: string;
}

interface Props {
  valor: string;
  onOk: () => void;
}

export function MantenimientoToggle({ valor, onOk }: Props) {
  const isOn = valor.toLowerCase() === "true";
  const [confirmando, setConfirmando] = useState(false);
  const [pendingValor, setPendingValor] = useState<"true" | "false">("false");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function iniciarToggle(nuevoValor: "true" | "false") {
    setPendingValor(nuevoValor);
    setMotivo("");
    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmando(true);
  }

  function cancelar() {
    setConfirmando(false);
    setMotivo("");
    setErrorMsg(null);
  }

  async function confirmar() {
    if (motivo.trim().length < 5) {
      setErrorMsg("El motivo debe tener al menos 5 caracteres");
      return;
    }
    setGuardando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/config/accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: "MODO_MANTENIMIENTO", valor: pendingValor, motivo: motivo.trim() }),
      });
      const json: AcResponse = await res.json();
      if (!json.ok) {
        setErrorMsg(json.detalle ?? json.motivo ?? "Error al guardar");
      } else {
        setSuccessMsg(json.mensaje ?? "Actualizado");
        setConfirmando(false);
        setMotivo("");
        onOk();
      }
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      {/* Estado actual */}
      <div className="flex items-center gap-4 mb-3">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold ${
          isOn
            ? "border-red-700/60 bg-red-950/40 text-red-300"
            : "border-emerald-800/50 bg-emerald-950/30 text-emerald-400"
        }`}>
          {isOn ? (
            <><span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse" />ACTIVO — sitio en mantenimiento</>
          ) : (
            <><span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />DESACTIVADO — sitio accesible</>
          )}
        </div>
      </div>

      <button
        onClick={() => iniciarToggle(isOn ? "false" : "true")}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          isOn
            ? "border-gray-700/60 bg-gray-800/60 text-gray-400 hover:bg-gray-800"
            : "border-red-800/50 bg-red-950/20 text-red-400 hover:bg-red-950/40 hover:border-red-700/60"
        }`}
      >
        {isOn ? "Desactivar mantenimiento" : "Activar mantenimiento"}
      </button>

      {successMsg && <p className="mt-2 text-xs text-emerald-400">{successMsg}</p>}

      {confirmando && (
        <div className={`mt-3 rounded-lg border px-4 py-3 space-y-3 ${
          pendingValor === "true" ? "border-red-800/50 bg-red-950/20" : "border-amber-800/40 bg-amber-950/20"
        }`}>
          <p className={`text-xs font-semibold ${pendingValor === "true" ? "text-red-300" : "text-amber-300"}`}>
            {pendingValor === "true"
              ? "⚠ Confirmar: activar modo mantenimiento — el sitio dejará de ser accesible para todos los visitantes"
              : "Confirmar: desactivar modo mantenimiento — el sitio volverá a estar accesible"}
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Motivo <span className="text-gray-600">(mínimo 5 caracteres)</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder={
                pendingValor === "true"
                  ? "ej: configurando dominio tuoraculo.uy"
                  : "ej: dominio configurado, volvemos al aire"
              }
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 resize-none"
            />
          </div>
          {errorMsg && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle size={12} /> {errorMsg}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={confirmar}
              disabled={guardando || motivo.trim().length < 5}
              className={`px-3 py-1.5 rounded-lg disabled:opacity-40 text-xs text-white font-medium transition-colors ${
                pendingValor === "true" ? "bg-red-700 hover:bg-red-600" : "bg-emerald-700 hover:bg-emerald-600"
              }`}
            >
              {guardando ? "Guardando…" : "Confirmar"}
            </button>
            <button
              onClick={cancelar}
              disabled={guardando}
              className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
