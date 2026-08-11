"use client";
import { useState } from "react";
import { Check, Loader2, AlertCircle, Pencil } from "lucide-react";

type Escala = "Excelente" | "Bueno" | "Aceptable" | "Débil" | "";
const ESCALAS: Escala[] = ["Excelente", "Bueno", "Aceptable", "Débil"];

const ESCALA_CLS: Record<string, string> = {
  Excelente: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  Bueno: "bg-blue-900/50 text-blue-300 border-blue-700",
  Aceptable: "bg-amber-900/50 text-amber-300 border-amber-700",
  Débil: "bg-red-900/50 text-red-300 border-red-700",
};

const DIMENSIONES: { key: string; label: string; desc: string }[] = [
  { key: "comprension", label: "Comprensión", desc: "¿Entendió el conflicto real, no solo la pregunta literal?" },
  { key: "personalizacion", label: "Personalización", desc: "¿Podría entregarse a otro cliente sin que lo noten?" },
  { key: "narrativa", label: "Narrativa", desc: "¿Las cinco cartas cuentan una única historia coherente?" },
  { key: "descubrimiento", label: "Descubrimiento", desc: "¿Hay un momento donde el cliente piensa 'nunca había visto esto así'?" },
  { key: "consejos", label: "Consejos", desc: "¿Los consejos nacen de las cartas específicas o son intercambiables?" },
  { key: "mensaje_final_eval", label: "Mensaje final", desc: "¿Tiene una sola idea poderosa?" },
];

export interface NarrativeReview {
  id?: string;
  lectura_id: string;
  comprension?: string;
  personalizacion?: string;
  narrativa?: string;
  descubrimiento?: string;
  consejos?: string;
  mensaje_final_eval?: string;
  riesgos?: string;
  frase_memorable?: string;
  observaciones?: string;
  evaluador?: string;
  prompt_version?: string;
  fecha?: string;
}

export function NarrativeReviewForm({
  lecturaId,
  existing,
  onSaved,
}: {
  lecturaId: string;
  existing?: NarrativeReview | null;
  onSaved?: (review: NarrativeReview) => void;
}) {
  const [editing, setEditing] = useState(!existing);
  const [form, setForm] = useState<Record<string, string>>(() => {
    if (!existing) return {};
    const result: Record<string, string> = {};
    for (const dim of DIMENSIONES) result[dim.key] = (existing as unknown as Record<string, string>)[dim.key] ?? "";
    result.riesgos = existing.riesgos ?? "";
    result.frase_memorable = existing.frase_memorable ?? "";
    result.observaciones = existing.observaciones ?? "";
    result.evaluador = existing.evaluador ?? "";
    result.prompt_version = existing.prompt_version ?? "";
    return result;
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setResult(null);
    try {
      const payload: Record<string, unknown> = { lectura_id: lecturaId };
      for (const [k, v] of Object.entries(form)) payload[k] = v || null;

      let res: Response;
      if (existing?.id) {
        res = await fetch(`/api/admin/tarot/product-intelligence/narrative-reviews/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/admin/tarot/product-intelligence/narrative-reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (data.ok) {
        setResult({ ok: true, msg: existing?.id ? "Review actualizada" : "Review guardada" });
        setEditing(false);
        onSaved?.(data.review ?? { lectura_id: lecturaId, ...form });
      } else {
        setResult({ ok: false, msg: data.motivo ?? "Error al guardar" });
      }
    } catch {
      setResult({ ok: false, msg: "Error de red" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
        <span className="text-sm font-semibold text-gray-200">Narrative Review</span>
        {existing && !editing && (
          <button
            onClick={() => { setEditing(true); setResult(null); }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-300 transition-colors"
          >
            <Pencil size={11} /> Editar
          </button>
        )}
      </div>

      {!editing && existing ? (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {DIMENSIONES.map(({ key, label }) => {
              const val = (existing as unknown as Record<string, string>)[key];
              return (
                <div key={key} className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 text-center">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  {val ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${ESCALA_CLS[val] ?? "text-gray-400 border-gray-700"}`}>
                      {val}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-700">—</span>
                  )}
                </div>
              );
            })}
          </div>
          {existing.frase_memorable && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Frase memorable</p>
              <p className="text-sm text-amber-200 italic">&ldquo;{existing.frase_memorable}&rdquo;</p>
            </div>
          )}
          {existing.riesgos && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Riesgos detectados</p>
              <p className="text-sm text-red-300">{existing.riesgos}</p>
            </div>
          )}
          {existing.observaciones && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Observaciones</p>
              <p className="text-sm text-gray-300">{existing.observaciones}</p>
            </div>
          )}
          {existing.prompt_version && (
            <p className="text-xs text-gray-600">Versión prompt: <span className="text-amber-600 font-mono">{existing.prompt_version}</span></p>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="space-y-3">
            {DIMENSIONES.map(({ key, label, desc }) => (
              <div key={key}>
                <p className="text-xs text-gray-400 mb-1">{label} <span className="text-gray-600">— {desc}</span></p>
                <div className="flex gap-2 flex-wrap">
                  {ESCALAS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setField(key, form[key] === e ? "" : e)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                        form[key] === e
                          ? ESCALA_CLS[e]
                          : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Frase memorable <span className="text-gray-600">(opcional)</span></label>
            <input
              type="text"
              value={form.frase_memorable ?? ""}
              onChange={(e) => setField("frase_memorable", e.target.value)}
              placeholder="La frase que el cliente probablemente recordará…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Riesgos detectados <span className="text-gray-600">(frases exactas)</span></label>
            <textarea
              rows={2}
              value={form.riesgos ?? ""}
              onChange={(e) => setField("riesgos", e.target.value)}
              placeholder="Afirmaciones excesivas, frases vacías, predicciones…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Observaciones generales</label>
            <textarea
              rows={3}
              value={form.observaciones ?? ""}
              onChange={(e) => setField("observaciones", e.target.value)}
              placeholder="Qué funcionó, qué falló, qué sorprendió…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Evaluador</label>
              <input
                type="text"
                value={form.evaluador ?? ""}
                onChange={(e) => setField("evaluador", e.target.value)}
                placeholder="Nombre o rol"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Versión prompt conocida</label>
              <input
                type="text"
                value={form.prompt_version ?? ""}
                onChange={(e) => setField("prompt_version", e.target.value)}
                placeholder="ej. V2.1"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {result && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>
              {result.ok ? <Check size={13} /> : <AlertCircle size={13} />}
              {result.msg}
            </div>
          )}

          <div className="flex items-center gap-2">
            {existing && (
              <button
                onClick={() => { setEditing(false); setResult(null); }}
                className="text-xs px-3 py-2 border border-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              {saving ? "Guardando…" : existing?.id ? "Actualizar review" : "Guardar review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
