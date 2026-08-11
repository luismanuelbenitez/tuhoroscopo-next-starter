"use client";
import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import type { BenchmarkCase } from "@/lib/product-intelligence/parsers";
import { EvaluacionForm, type Evaluacion } from "./EvaluacionForm";

function Section({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">{icon}<p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p></div>
      <ul className="space-y-1">
        {items.map((item, i) => <li key={i} className="text-sm text-gray-300 leading-relaxed flex gap-2"><span className="text-gray-600 shrink-0 mt-0.5">•</span>{item}</li>)}
      </ul>
    </div>
  );
}

export function BenchmarkCaseView({ caso }: { caso: BenchmarkCase }) {
  const [tab, setTab] = useState<"definicion" | "evaluaciones">("definicion");
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvaluaciones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tarot/product-intelligence/benchmark/evaluaciones?caso_id=${encodeURIComponent(caso.casoId)}`);
      const data = await res.json();
      if (data.ok) setEvaluaciones(data.evaluaciones ?? []);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [caso.casoId]);

  useEffect(() => { fetchEvaluaciones(); }, [fetchEvaluaciones]);

  const TABS = [
    { id: "definicion" as const, label: "Definición del caso" },
    { id: "evaluaciones" as const, label: `Evaluaciones (${evaluaciones.length})` },
  ];

  return (
    <div className="space-y-4">
      {/* Case header info */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4">
        <div className="flex items-start gap-3 flex-wrap">
          {caso.subtitulo && <p className="text-sm text-gray-300 italic flex-1">&ldquo;{caso.subtitulo}&rdquo;</p>}
          {caso.edad && <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">~{caso.edad} años</span>}
        </div>
        {caso.pregunta && (
          <div className="mt-3 border-l-2 border-amber-700 pl-3">
            <p className="text-xs text-gray-500 mb-0.5">Pregunta de referencia</p>
            <p className="text-sm text-amber-200 font-medium">{caso.pregunta}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-800">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs transition-colors border-b-2 ${tab === t.id ? "border-amber-500 text-amber-300" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "definicion" && (
        <div className="space-y-5">
          {caso.contexto && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Contexto</p>
              <p className="text-sm text-gray-300 leading-relaxed">{caso.contexto}</p>
            </div>
          )}
          {caso.conflicto && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Conflicto humano esperado</p>
              <p className="text-sm text-gray-300 leading-relaxed">{caso.conflicto}</p>
            </div>
          )}
          <Section title="Qué debería lograr una lectura excelente" items={caso.excelente}
            icon={<CheckCircle2 size={13} className="text-emerald-500" />} />
          <Section title="Riesgos si la IA interpreta mal" items={caso.riesgos}
            icon={<AlertTriangle size={13} className="text-amber-500" />} />
          <Section title="Qué nunca debe hacer la IA" items={caso.prohibiciones}
            icon={<XCircle size={13} className="text-red-500" />} />
        </div>
      )}

      {tab === "evaluaciones" && (
        <div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6"><Loader2 size={14} className="animate-spin" /> Cargando evaluaciones…</div>
          ) : (
            <EvaluacionForm
              casoId={caso.casoId}
              evaluaciones={evaluaciones}
              onSaved={(ev) => setEvaluaciones((prev) => [ev, ...prev])}
            />
          )}
        </div>
      )}
    </div>
  );
}
