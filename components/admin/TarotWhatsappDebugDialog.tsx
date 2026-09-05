"use client";
import { useState } from "react";
import { X, FlaskConical, AlertCircle, CheckCircle } from "lucide-react";

const TIPOS = [
  "text", "image", "document", "audio", "video", "sticker",
  "location", "contact", "interactive", "unknown",
] as const;
type Tipo = typeof TIPOS[number];

interface Resultado { message_index: number; http_status: number; body: Record<string, unknown> }

export function TarotWhatsappDebugDialog({ onClose, onInyectado }: { onClose: () => void; onInyectado: () => void }) {
  const [telefono, setTelefono]   = useState("");
  const [nombre, setNombre]       = useState("");
  const [tipo, setTipo]           = useState<Tipo>("text");
  const [texto, setTexto]         = useState("Hola, quería consultar sobre mi tirada");
  const [enviando, setEnviando]   = useState(false);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  async function inyectar() {
    setEnviando(true);
    setErrorMsg(null);
    setResultados(null);
    try {
      const mensaje: Record<string, unknown> = { tipo };
      if (tipo === "text" || tipo === "interactive") mensaje.texto = texto;
      const r = await fetch("/api/admin/tarot/whatsapp/debug-inject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefono: telefono.trim(),
          nombre_contacto: nombre.trim() || undefined,
          ...mensaje,
        }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
      } else {
        setResultados(json.resultados ?? []);
        onInyectado();
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setEnviando(false);
    }
  }

  const telefonoValido = /^\+\d{8,15}$/.test(telefono.trim());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md bg-gray-950 border border-violet-800/50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <FlaskConical size={16} className="text-violet-400" />
            Inyectar webhook de prueba
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Simula un mensaje entrante de WhatsApp con el schema oficial de Meta, sin depender de un número real ni de que Meta haya aprobado Production. El teléfono debe ser el de un cliente Tarot existente para que se asocie correctamente.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Teléfono (E.164)</label>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+598912345678"
              className="w-full rounded-lg bg-gray-900 border border-gray-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nombre de contacto (opcional, simula profile.name de Meta)</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Juan Pérez"
              className="w-full rounded-lg bg-gray-900 border border-gray-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tipo de mensaje</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as Tipo)}
              className="w-full rounded-lg bg-gray-900 border border-gray-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-violet-500"
            >
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {(tipo === "text" || tipo === "interactive") && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Texto</label>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={2}
                className="w-full rounded-lg bg-gray-900 border border-gray-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-violet-500 resize-none"
              />
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            <AlertCircle size={13} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {resultados && (
          <div className="mt-3 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle size={13} />
              Inyectado — revisá la bandeja para confirmar que apareció.
            </div>
            <pre className="text-[10px] text-gray-400 whitespace-pre-wrap break-all mt-1">
              {JSON.stringify(resultados, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-500 transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={inyectar}
            disabled={!telefonoValido || enviando}
            className="text-sm px-3 py-1.5 rounded-lg border border-violet-700/60 bg-violet-950/40 text-violet-300 hover:bg-violet-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {enviando ? "Inyectando…" : "Inyectar"}
          </button>
        </div>
      </div>
    </div>
  );
}
