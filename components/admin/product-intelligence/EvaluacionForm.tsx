"use client";
import { useState } from "react";
import { Check, Loader2, AlertCircle, Pencil, Plus } from "lucide-react";

type Escala = "Excelente" | "Bueno" | "Aceptable" | "Débil";
type Veredicto = "Aprobado" | "Observaciones" | "Rechazado";
const ESCALAS: Escala[] = ["Excelente", "Bueno", "Aceptable", "Débil"];
const VEREDICTOS: Veredicto[] = ["Aprobado", "Observaciones", "Rechazado"];

const ESCALA_CLS: Record<string, string> = {
  Excelente: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  Bueno: "bg-blue-900/50 text-blue-300 border-blue-700",
  Aceptable: "bg-amber-900/50 text-amber-300 border-amber-700",
  Débil: "bg-red-900/50 text-red-300 border-red-700",
};

const VEREDICTO_CLS: Record<string, string> = {
  Aprobado: "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  Observaciones: "bg-amber-900/60 text-amber-300 border-amber-700",
  Rechazado: "bg-red-900/60 text-red-300 border-red-700",
};

const DIMENSIONES = [
  { key: "comprension", label: "Comprensión" },
  { key: "personalizacion", label: "Personalización" },
  { key: "narrativa", label: "Narrativa" },
  { key: "descubrimiento", label: "Descubrimiento" },
  { key: "consejos", label: "Consejos" },
  { key: "mensaje_final_eval", label: "Mensaje final" },
] as const;

export interface Evaluacion {
  id?: string;
  caso_id: string;
  prompt_version?: string;
  lectura_id?: string;
  fecha?: string;
  comprension?: string;
  personalizacion?: string;
  narrativa?: string;
  descubrimiento?: string;
  consejos?: string;
  mensaje_final_eval?: string;
  riesgos?: string;
  observaciones?: string;
  veredicto?: string;
  evaluador?: string;
  created_at?: string;
}

function EvalCard({ ev }: { ev: Evaluacion }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs text-gray-500">{ev.fecha ?? "—"}</p>
          {ev.prompt_version && (
            <p className="text-xs text-amber-500 font-mono">{ev.prompt_version}</p>
          )}
        </div>
        {ev.veredicto && (
          <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${VEREDICTO_CLS[ev.veredicto] ?? "border-gray-700 text-gray-400"}`}>
            {ev.veredicto}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {DIMENSIONES.map(({ key, label }) => {
          const val = (ev as unknown as Record<string, string>)[key];
          return (
            <div key={key} className="text-center">
              <p className="text-xs text-gray-600 mb-0.5">{label}</p>
              {val ? (
                <span className={`text-xs px-1.5 py-0.5 rounded border ${ESCALA_CLS[val] ?? "border-gray-700 text-gray-500"}`}>{val}</span>
              ) : (
                <span className="text-xs text-gray-700">—</span>
              )}
            </div>
          );
        })}
      </div>
      {ev.observaciones && (
        <p className="text-xs text-gray-400 border-t border-gray-800/60 pt-2">{ev.observaciones}</p>
      )}
    </div>
  );
}

export function EvaluacionForm({
  casoId,
  evaluaciones,
  onSaved,
}: {
  casoId: string;
  evaluaciones: Evaluacion[];
  onSaved?: (ev: Evaluacion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.veredicto) {
      setResult({ ok: false, msg: "Veredicto requerido" });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const payload: Record<string, unknown> = { caso_id: casoId };
      for (const [k, v] of Object.entries(form)) payload[k] = v || null;

      const res = await fetch("/api/admin/tarot/product-intelligence/benchmark/evaluaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({ ok: true, msg: "Evaluación guardada" });
        setForm({});
        setOpen(false);
        onSaved?.(data.evaluacion);
      } else {
        setResult({ ok: false, msg: data.motivo ?? "Error" });
      }
    } catch {
      setResult({ ok: false, msg: "Error de red" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">
          Evaluaciones <span className="text-gray-600">({evaluaciones.length})</span>
        </h3>
        <button
          onClick={() => { setOpen((v) => !v); setResult(null); }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          {open ? "Cancelar" : <><Plus size={12} /> Nueva evaluación</>}
        </button>
      </div>

      {open && (
        <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4 space-y-4">
          <p className="text-xs text-gray-500">Evaluar esta versión contra el caso seleccionado.</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Versión prompt</label>
              <input
                type="text"
                value={form.prompt_version ?? ""}
                onChange={(e) => setField("prompt_version", e.target.value)}
                placeholder="ej. V2.1"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
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
          </div>

          <div className="space-y-3">
            {DIMENSIONES.map(({ key, label }) => (
              <div key={key}>
                <p className="text-xs text-gray-400 mb-1.5">{label}</p>
                <div className="flex gap-2 flex-wrap">
                  {ESCALAS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setField(key, form[key] === e ? "" : e)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                        form[key] === e
                          ? ESCALA_CLS[e]
                          : "border-gray-700 text-gray-500 hover:border-gray-500"
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
            <label className="text-xs text-gray-400 block mb-1">Observaciones</label>
            <textarea
              rows={3}
              value={form.observaciones ?? ""}
              onChange={(e) => setField("observaciones", e.target.value)}
              placeholder="Qué funcionó, qué falló, frases concretas…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-2">Riesgos detectados</label>
            <textarea
              rows={2}
              value={form.riesgos ?? ""}
              onChange={(e) => setField("riesgos", e.target.value)}
              placeholder="Afirmaciones excesivas, predicciones, frases prohibidas detectadas…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-1.5">Veredicto <span className="text-red-400">*</span></p>
            <div className="flex gap-2">
              {VEREDICTOS.map((v) => (
                <button
                  key={v}
                  onClick={() => setField("veredicto", form.veredicto === v ? "" : v)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                    form.veredicto === v
                      ? VEREDICTO_CLS[v]
                      : "border-gray-700 text-gray-500 hover:border-gray-500"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {result && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>
              {result.ok ? <Check size={13} /> : <AlertCircle size={13} />}
              {result.msg}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !form.veredicto}
            className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {saving ? "Guardando…" : "Guardar evaluación"}
          </button>
        </div>
      )}

      {evaluaciones.length === 0 && !open ? (
        <p className="text-sm text-gray-600 text-center py-6">No hay evaluaciones para este caso todavía.</p>
      ) : (
        <div className="space-y-3">
          {evaluaciones.map((ev) => <EvalCard key={ev.id} ev={ev} />)}
        </div>
      )}
    </div>
  );
}
