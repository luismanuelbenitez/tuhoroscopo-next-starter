"use client";
import { useState } from "react";
import { Gift, Loader2, MessageSquareHeart, X } from "lucide-react";

// Alta de una campaña manual (2026-11-14). Nace en borrador: crear no envía
// nada. Después, en el detalle: elegir a quién, probar y disparar.

export interface CodigoDisponible {
  id: string; codigo: string; tipo_descuento: string; valor_descuento: number; fecha_fin: string | null;
}

const inputCls = "w-full border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500";
const labelCls = "block text-xs text-gray-400 mb-1";

function enDias(n: number) {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().slice(0, 10);
}

export function NuevaCampana({ codigos, onCerrar, onCreada }: { codigos: CodigoDisponible[]; onCerrar: () => void; onCreada: (id: string) => void }) {
  const [tipo, setTipo] = useState<"feedback_experiencia" | "cupon_descuento">("feedback_experiencia");
  const [nombre, setNombre] = useState("");
  const [modoCupon, setModoCupon] = useState<"nuevo" | "existente">("nuevo");
  const [codigo, setCodigo] = useState("GRACIAS20");
  const [porcentaje, setPorcentaje] = useState("20");
  const [vence, setVence] = useState(enDias(30));
  const [codigoId, setCodigoId] = useState(codigos[0]?.id ?? "");
  const [costo, setCosto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setEnviando(true);
    setError(null);
    const body: Record<string, unknown> = { tipo, nombre, costo_estimado_por_envio: costo };
    if (tipo === "cupon_descuento") {
      if (modoCupon === "nuevo") body.cupon_nuevo = { codigo, porcentaje: Number(porcentaje), vence };
      else body.codigo_descuento_id = codigoId;
    }
    try {
      const r = await fetch("/api/admin/tarot/campanas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await r.json().catch(() => ({}));
      if (json.ok) onCreada(json.id);
      else setError(json.detalle ?? json.motivo ?? "No se pudo crear");
    } catch {
      setError("Error de red");
    } finally {
      setEnviando(false);
    }
  }

  const opcion = (activo: boolean) =>
    `flex-1 text-left rounded-xl border px-4 py-3 transition ${activo ? "border-amber-500 bg-amber-950/30" : "border-gray-700 bg-gray-900 hover:border-gray-500"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="nueva-campana-titulo">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-gray-800 bg-gray-950 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 id="nueva-campana-titulo" className="text-base font-semibold text-white">Nueva campaña</h3>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" className={opcion(tipo === "feedback_experiencia")} onClick={() => setTipo("feedback_experiencia")}>
            <span className="flex items-center gap-2 text-sm font-semibold text-white"><MessageSquareHeart size={16} className="text-amber-400" /> Pedir opinión</span>
            <span className="block text-xs text-gray-400 mt-1">Les pregunta cómo les fue, con estrellas y comentario.</span>
          </button>
          <button type="button" className={opcion(tipo === "cupon_descuento")} onClick={() => setTipo("cupon_descuento")}>
            <span className="flex items-center gap-2 text-sm font-semibold text-white"><Gift size={16} className="text-amber-400" /> Regalar un cupón</span>
            <span className="block text-xs text-gray-400 mt-1">Un descuento para su próxima lectura, con link directo al checkout.</span>
          </button>
        </div>

        <div>
          <label className={labelCls} htmlFor="nc-nombre">Nombre (solo para vos)</label>
          <input id="nc-nombre" className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder={tipo === "cupon_descuento" ? "Ej.: Cupón 20 % compradoras noviembre" : "Ej.: Opinión compradoras noviembre"} />
        </div>

        {tipo === "cupon_descuento" && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 space-y-3">
            <div className="flex gap-4 text-sm text-gray-300">
              <label className="flex items-center gap-2"><input type="radio" className="accent-amber-500" checked={modoCupon === "nuevo"} onChange={() => setModoCupon("nuevo")} /> Crear cupón nuevo</label>
              <label className={`flex items-center gap-2 ${codigos.length === 0 ? "opacity-40" : ""}`}><input type="radio" className="accent-amber-500" disabled={codigos.length === 0} checked={modoCupon === "existente"} onChange={() => setModoCupon("existente")} /> Usar uno existente</label>
            </div>
            {modoCupon === "nuevo" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls} htmlFor="nc-codigo">Código</label>
                  <input id="nc-codigo" className={inputCls + " uppercase font-mono"} value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={20} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="nc-pct">Descuento (%)</label>
                  <input id="nc-pct" className={inputCls} type="number" min={5} max={100} value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="nc-vence">Vence</label>
                  <input id="nc-vence" className={inputCls} type="date" value={vence} min={enDias(1)} onChange={(e) => setVence(e.target.value)} />
                </div>
                <p className="col-span-2 text-[11px] text-gray-500">Un uso por persona. Sirve para cualquier tema de lectura.</p>
              </div>
            ) : (
              <div>
                <label className={labelCls} htmlFor="nc-existente">Cupón</label>
                <select id="nc-existente" className={inputCls} value={codigoId} onChange={(e) => setCodigoId(e.target.value)}>
                  {codigos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} · {c.tipo_descuento === "porcentaje" ? `${c.valor_descuento} %` : `$${c.valor_descuento}`} · vence {c.fecha_fin ? new Date(c.fecha_fin).toLocaleDateString("es-UY") : "—"}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="nc-costo">Costo por mensaje de WhatsApp (USD)</label>
          <input id="nc-costo" className={inputCls} type="number" step="0.0001" min={0} value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Ej.: 0.0700 — lo podés cargar después" />
          <p className="text-[11px] text-gray-500 mt-1">Meta cobra cada mensaje de marketing. Es obligatorio para disparar, así ves el costo antes de mandar.</p>
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onCerrar} className="text-sm px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800">Cancelar</button>
          <button onClick={crear} disabled={enviando} className="text-sm px-4 py-2 rounded-lg border border-amber-600 bg-amber-900/40 text-amber-100 hover:bg-amber-800/50 disabled:opacity-50 flex items-center gap-1.5">
            {enviando && <Loader2 size={14} className="animate-spin" />} Crear campaña
          </button>
        </div>
        <p className="text-[11px] text-gray-500">Crear no envía nada. En el paso siguiente elegís a quién, lo probás en tu WhatsApp y recién ahí lo disparás.</p>
      </div>
    </div>
  );
}
