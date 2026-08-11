"use client";
import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, ArrowRight, Plus, Loader2, Check, AlertCircle, X } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

type Filter = "todas" | "implementadas" | "aprobadas" | "propuestas";
type Estado = "Propuesta" | "Aprobada" | "Implementada" | "Deprecada";

interface DBNiRule {
  id: string;
  codigo: string;
  titulo: string;
  problema_observado: string;
  regla_narrativa: string;
  justificacion: string;
  impacto_esperado: string;
  estado: Estado;
  fuente: string | null;
  caso_benchmark: string | null;
  version_prompt: string | null;
  created_at: string;
  updated_at: string;
}

const ESTADO_CLS: Record<Estado, string> = {
  Implementada: "bg-emerald-900/60 text-emerald-400 border border-emerald-800/40",
  Aprobada: "bg-blue-900/60 text-blue-400 border border-blue-800/40",
  Propuesta: "bg-gray-800 text-gray-400 border border-gray-700/40",
  Deprecada: "bg-gray-900 text-gray-600 border border-gray-800/40 line-through",
};

const NEXT_ESTADO: Partial<Record<Estado, { label: string; next: Estado; cls: string }>> = {
  Propuesta: { label: "Aprobar", next: "Aprobada", cls: "text-blue-400 border-blue-800/60 hover:bg-blue-900/30" },
  Aprobada: { label: "Marcar implementada", next: "Implementada", cls: "text-emerald-400 border-emerald-800/60 hover:bg-emerald-900/30" },
  Implementada: { label: "Deprecar", next: "Deprecada", cls: "text-gray-500 border-gray-700 hover:bg-gray-800/60" },
};

function CycleArrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 whitespace-nowrap">{label}</span>
      <ArrowRight size={11} className="text-gray-700 shrink-0" />
    </div>
  );
}

function RuleCard({ rule, onStateChange }: { rule: DBNiRule; onStateChange: (id: string, estado: Estado) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const nextEstado = NEXT_ESTADO[rule.estado];

  async function handleTransition() {
    if (!nextEstado) return;
    setTransitioning(true);
    await onStateChange(rule.id, nextEstado.next);
    setTransitioning(false);
  }

  return (
    <div className="border-b border-gray-800/40 last:border-b-0">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-900/30 transition-colors text-left">
        <span className="text-xs font-mono font-bold text-gray-500 shrink-0 w-16">{rule.codigo}</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-200 block truncate">{rule.titulo}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${ESTADO_CLS[rule.estado]}`}>
            {rule.estado.toUpperCase()}
          </span>
          {rule.version_prompt && (
            <span className="text-xs bg-gray-800 text-amber-400 px-2 py-0.5 rounded font-mono">{rule.version_prompt}</span>
          )}
          {open ? <ChevronUp size={13} className="text-gray-600" /> : <ChevronDown size={13} className="text-gray-600" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-5 pt-1 border-t border-gray-800/30 space-y-4">
          {rule.fuente && <p className="text-xs text-gray-600"><span className="text-gray-500">Origen:</span> {rule.fuente}</p>}

          {[
            { label: "Problema observado", value: rule.problema_observado, color: "text-red-300" },
            { label: "Regla narrativa", value: rule.regla_narrativa, color: "text-amber-200" },
            { label: "Justificación", value: rule.justificacion, color: "text-gray-300" },
            { label: "Impacto esperado", value: rule.impacto_esperado, color: "text-emerald-300" },
          ].map(({ label, value, color }) => value ? (
            <div key={label}>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-sm leading-relaxed ${color}`}>{value}</p>
            </div>
          ) : null)}

          <div className="pt-3 border-t border-gray-800/30 flex items-center gap-3 flex-wrap">
            {nextEstado && (
              <button onClick={handleTransition} disabled={transitioning}
                className={`flex items-center gap-1 text-xs px-3 py-1 rounded border transition-colors disabled:opacity-50 ${nextEstado.cls}`}>
                {transitioning && <Loader2 size={11} className="animate-spin" />}
                {transitioning ? "Actualizando…" : nextEstado.label}
              </button>
            )}
            <Link href={"/admin/tarot/product-intelligence/motor" as Route<string>}
              className="text-xs text-gray-600 hover:text-amber-400 transition-colors flex items-center gap-1">
              Ver en Motor <ArrowRight size={11} />
            </Link>
            <Link href={"/admin/tarot/product-intelligence/prompt" as Route<string>}
              className="text-xs text-gray-600 hover:text-amber-400 transition-colors flex items-center gap-1">
              Ver en Prompt <ArrowRight size={11} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const CAMPOS_REQUERIDOS = ["titulo", "problema_observado", "regla_narrativa", "justificacion", "impacto_esperado"] as const;
const LABEL_MAP: Record<string, string> = {
  titulo: "Título",
  problema_observado: "Problema observado",
  regla_narrativa: "Regla narrativa",
  justificacion: "Justificación",
  impacto_esperado: "Impacto esperado",
  fuente: "Fuente / origen (opcional)",
  caso_benchmark: "Caso benchmark relacionado (opcional)",
};

function PropuestaForm({ onSaved, onCancel }: { onSaved: (rule: DBNiRule) => void; onCancel: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setField(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSave() {
    for (const campo of CAMPOS_REQUERIDOS) {
      if (!form[campo]?.trim()) { setErr(`Campo requerido: ${LABEL_MAP[campo]}`); return; }
    }
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/admin/tarot/product-intelligence/ni-rules", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) { onSaved(data.rule); }
      else setErr(data.motivo ?? data.detalle ?? "Error al guardar");
    } catch { setErr("Error de red"); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-200">Nueva regla NI</p>
        <button onClick={onCancel} className="text-gray-600 hover:text-gray-300"><X size={14} /></button>
      </div>
      {([...CAMPOS_REQUERIDOS, "fuente", "caso_benchmark"] as const).map((campo) => {
        const isLong = ["problema_observado", "regla_narrativa", "justificacion", "impacto_esperado"].includes(campo);
        return (
          <div key={campo}>
            <label className="text-xs text-gray-400 block mb-1">{LABEL_MAP[campo]}</label>
            {isLong ? (
              <textarea rows={3} value={form[campo] ?? ""} onChange={(e) => setField(campo, e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none" />
            ) : (
              <input type="text" value={form[campo] ?? ""} onChange={(e) => setField(campo, e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
            )}
          </div>
        );
      })}
      {err && <div className="flex items-center gap-2 text-sm text-red-300"><AlertCircle size={13} />{err}</div>}
      <div className="flex items-center gap-2">
        <button onClick={onCancel} className="text-xs px-3 py-2 border border-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors">Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors">
          {saving && <Loader2 size={12} className="animate-spin" />}
          {saving ? "Guardando…" : "Proponer regla"}
        </button>
      </div>
    </div>
  );
}

export function NiViewer({ lastCiclo }: { lastCiclo?: { fecha: string; caso: string; version: string } }) {
  const [rules, setRules] = useState<DBNiRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("todas");
  const [showForm, setShowForm] = useState(false);
  const [stateMsg, setStateMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tarot/product-intelligence/ni-rules");
      const data = await res.json();
      if (data.ok) setRules(data.rules ?? []);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  async function handleStateChange(id: string, newEstado: Estado) {
    setStateMsg(null);
    const res = await fetch(`/api/admin/tarot/product-intelligence/ni-rules/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: newEstado }),
    });
    const data = await res.json();
    if (data.ok) {
      setRules((prev) => prev.map((r) => r.id === id ? { ...r, estado: newEstado } : r));
      setStateMsg({ ok: true, msg: `${data.rule?.codigo ?? ""} → ${newEstado}` });
    } else {
      setStateMsg({ ok: false, msg: data.motivo ?? "Error al actualizar estado" });
    }
  }

  function handleRuleSaved(rule: DBNiRule) {
    setRules((prev) => [...prev, rule]);
    setShowForm(false);
    setStateMsg({ ok: true, msg: `${rule.codigo} propuesta correctamente` });
  }

  const counts = {
    implementadas: rules.filter((r) => r.estado === "Implementada").length,
    aprobadas: rules.filter((r) => r.estado === "Aprobada").length,
    propuestas: rules.filter((r) => r.estado === "Propuesta").length,
  };

  const filtered = rules.filter((r) => {
    if (filter === "implementadas") return r.estado === "Implementada";
    if (filter === "aprobadas") return r.estado === "Aprobada";
    if (filter === "propuestas") return r.estado === "Propuesta";
    return true;
  });

  const filterCls = (f: Filter) =>
    `px-3 py-1.5 text-xs rounded-lg transition-colors ${filter === f ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"}`;

  return (
    <div className="space-y-4">
      {/* Cycle diagram */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800/60">
          <span className="text-sm font-semibold text-gray-200">El ciclo de aprendizaje</span>
          <p className="text-xs text-gray-500 mt-0.5">Cómo cada observación se convierte en conocimiento permanente del producto.</p>
        </div>
        <div className="p-4">
          <div className="flex items-center flex-wrap gap-0.5">
            <CycleArrow label="Lectura" />
            <CycleArrow label="Benchmark" />
            <CycleArrow label="Narrative Review" />
            <CycleArrow label="Observación" />
            <CycleArrow label="Regla NI" />
            <CycleArrow label="Motor" />
            <CycleArrow label="Prompt" />
            <span className="text-xs text-gray-400">Nueva lectura</span>
          </div>
          {lastCiclo && (
            <div className="mt-3 pt-3 border-t border-gray-800/30 flex items-center gap-2 text-xs text-gray-600">
              <span>Último ciclo:</span>
              <span className="text-gray-400">{lastCiclo.caso}</span>
              <span className="text-amber-600 font-mono">{lastCiclo.version}</span>
              <span>{lastCiclo.fecha}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Implementadas", count: counts.implementadas, cls: "text-emerald-400" },
            { label: "Aprobadas", count: counts.aprobadas, cls: "text-blue-400" },
            { label: "Propuestas", count: counts.propuestas, cls: "text-gray-400" },
          ].map(({ label, count, cls }) => (
            <div key={label} className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3 text-center">
              <p className={`text-2xl font-bold ${cls}`}>{count}</p>
              <p className="text-xs text-gray-600 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {stateMsg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${stateMsg.ok ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>
          {stateMsg.ok ? <Check size={13} /> : <AlertCircle size={13} />} {stateMsg.msg}
        </div>
      )}

      {/* Proposal form */}
      {showForm && <PropuestaForm onSaved={handleRuleSaved} onCancel={() => setShowForm(false)} />}

      {/* Rules list */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 flex-wrap gap-2">
          <span className="text-sm font-semibold text-gray-200">Catálogo de reglas narrativas</span>
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => setFilter("todas")} className={filterCls("todas")}>Todas ({rules.length})</button>
            <button onClick={() => setFilter("implementadas")} className={filterCls("implementadas")}>Implementadas ({counts.implementadas})</button>
            {counts.aprobadas > 0 && <button onClick={() => setFilter("aprobadas")} className={filterCls("aprobadas")}>Aprobadas ({counts.aprobadas})</button>}
            {counts.propuestas > 0 && <button onClick={() => setFilter("propuestas")} className={filterCls("propuestas")}>Propuestas ({counts.propuestas})</button>}
          </div>
        </div>

        <div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 px-4 py-8"><Loader2 size={14} className="animate-spin" /> Cargando reglas…</div>
          ) : filtered.length > 0 ? (
            filtered.map((rule) => (
              <RuleCard key={rule.id} rule={rule} onStateChange={handleStateChange} />
            ))
          ) : (
            <p className="px-4 py-8 text-center text-sm text-gray-600">No hay reglas en este estado.</p>
          )}
        </div>
      </div>

      {/* Propose new rule */}
      {!showForm && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowForm(true); setStateMsg(null); }}
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-amber-300 hover:border-amber-800 transition-colors"
          >
            <Plus size={12} /> Proponer nueva regla NI
          </button>
        </div>
      )}
    </div>
  );
}
