"use client";
import { useState, useEffect, useCallback } from "react";
import {
  FileText, Pencil, X, Check, Loader2, AlertCircle, Save, RefreshCw,
  History, GitCompare, RotateCcw, ChevronDown, Minus, Plus,
} from "lucide-react";
import { PIABreadcrumb } from "@/components/admin/product-intelligence/PIABreadcrumb";
import { ContextBanner } from "@/components/admin/product-intelligence/ContextBanner";
import { ConfirmDialog } from "@/components/admin/product-intelligence/ConfirmDialog";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductoConfig {
  id: string; nombre: string; version: string;
  prompt_sistema: string; prompt_usuario_template: string;
  max_words_interpretacion: number; max_words_consejo: number;
  max_words_resumen: number; max_words_mensaje_final: number; max_words_proximo_paso: number;
  ia_modelo: string | null; ia_max_tokens: number | null; ia_temperatura: number | null;
  notas: string | null; updated_at: string | null;
}

interface VersionMeta {
  id: string; label: string; descripcion: string | null; estado: string;
  motivo_cambio: string | null; benchmark_resultado: string | null;
  ia_modelo: string | null; created_at: string;
}

interface VersionFull extends VersionMeta {
  prompt_sistema: string;
  prompt_usuario_template: string;
}

type Tab = "activa" | "historial" | "comparar";
type Section = "prompt_sistema" | "prompt_usuario_template";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", dateStyle: "short", timeStyle: "short" });
}

// ── Diff ──────────────────────────────────────────────────────────────────────

type DL = { k: "add" | "del" | "same"; t: string };

function computeDiff(a: string, b: string): DL[] {
  const al = a.split("\n"), bl = b.split("\n");
  const m = al.length, n = bl.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = al[i - 1] === bl[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const out: DL[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && al[i - 1] === bl[j - 1]) { out.unshift({ k: "same", t: al[i - 1] }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { out.unshift({ k: "add", t: bl[j - 1] }); j--; }
    else { out.unshift({ k: "del", t: al[i - 1] }); i--; }
  }
  return out;
}

function DiffView({ diff }: { diff: DL[] }) {
  const hasChanges = diff.some((d) => d.k !== "same");
  if (!hasChanges) {
    return <p className="text-xs text-gray-500 text-center py-6">Las versiones son idénticas en esta sección.</p>;
  }
  return (
    <div className="overflow-auto max-h-[60vh] font-mono text-xs leading-5">
      {diff.map((line, i) => (
        <div key={i} className={`px-3 py-px flex gap-2 ${line.k === "add" ? "bg-emerald-950/40 text-emerald-300" : line.k === "del" ? "bg-red-950/40 text-red-300 line-through" : "text-gray-600"}`}>
          <span className="w-4 shrink-0 select-none opacity-60">{line.k === "add" ? "+" : line.k === "del" ? "−" : " "}</span>
          <span className="whitespace-pre-wrap break-all">{line.t || " "}</span>
        </div>
      ))}
    </div>
  );
}

// ── PromptDisplay ─────────────────────────────────────────────────────────────

function PromptDisplay({ text }: { text: string }) {
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <pre className="text-xs text-gray-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        /^\{[^}]+\}$/.test(part) ? (
          <mark key={i} className="bg-amber-900/50 text-amber-300 rounded px-0.5 not-italic">{part}</mark>
        ) : part
      )}
    </pre>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-4 select-none">
      <div className="h-px flex-1 bg-gray-800" />
      <span className="text-xs text-gray-600 uppercase tracking-widest">{label}</span>
      <div className="h-px flex-1 bg-gray-800" />
    </div>
  );
}

function PromptSection({ titulo, sectionKey, text, editingKey, draftText, onStartEdit, onCancelEdit, onDraftChange, readOnly = false }: {
  titulo: string; sectionKey: string; text: string; editingKey: string | null; draftText: string;
  onStartEdit: (k: string, v: string) => void; onCancelEdit: () => void; onDraftChange: (v: string) => void; readOnly?: boolean;
}) {
  const isEditing = editingKey === sectionKey;
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/60">
        <span className="text-sm font-semibold text-gray-200">{titulo}</span>
        {!readOnly && !isEditing && (
          <button onClick={() => onStartEdit(sectionKey, text)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-300 transition-colors">
            <Pencil size={11} /> Editar
          </button>
        )}
        {isEditing && (
          <button onClick={onCancelEdit} className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors">
            <X size={11} /> Cancelar
          </button>
        )}
      </div>
      <div className="p-4">
        {isEditing ? (
          <textarea value={draftText} onChange={(e) => onDraftChange(e.target.value)} rows={Math.max(8, draftText.split("\n").length + 2)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-white leading-relaxed focus:outline-none focus:border-amber-500 resize-y" />
        ) : (
          <PromptDisplay text={text} />
        )}
      </div>
    </div>
  );
}

// ── HistorialTab ──────────────────────────────────────────────────────────────

function HistorialTab({ versions, loading, onComparar, onRestoreClick }: {
  versions: VersionMeta[]; loading: boolean;
  onComparar: (id: string) => void; onRestoreClick: (v: VersionMeta) => void;
}) {
  if (loading) return <div className="flex items-center gap-2 text-sm text-gray-500 py-8"><Loader2 size={15} className="animate-spin" /> Cargando historial…</div>;
  if (!versions.length) return <p className="text-sm text-gray-500 py-8 text-center">No hay versiones guardadas todavía.</p>;
  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      <div className="divide-y divide-gray-800/40">
        {versions.map((v) => (
          <div key={v.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-900/30 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 font-medium truncate">{v.label}</p>
              {v.motivo_cambio && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{v.motivo_cambio}</p>}
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-600">{fmt(v.created_at)}</span>
                {v.ia_modelo && <span className="text-xs text-gray-700 font-mono">{v.ia_modelo}</span>}
                {v.benchmark_resultado && <span className="text-xs text-emerald-600">{v.benchmark_resultado}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => onComparar(v.id)} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-gray-700 text-gray-400 hover:text-blue-300 hover:border-blue-800 transition-colors">
                <GitCompare size={11} /> Comparar
              </button>
              <button onClick={() => onRestoreClick(v)} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-gray-700 text-gray-400 hover:text-amber-300 hover:border-amber-800 transition-colors">
                <RotateCcw size={11} /> Restaurar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CompararTab ───────────────────────────────────────────────────────────────

function CompararTab({ versions, cfgA, compareB, section, onSectionChange, onCompareBChange }: {
  versions: VersionMeta[]; cfgA: ProductoConfig | null;
  compareB: string; section: Section;
  onSectionChange: (s: Section) => void; onCompareBChange: (id: string) => void;
}) {
  const [versionB, setVersionB] = useState<VersionFull | null>(null);
  const [loadingB, setLoadingB] = useState(false);
  const [diffResult, setDiffResult] = useState<DL[] | null>(null);

  useEffect(() => {
    if (!compareB) { setVersionB(null); setDiffResult(null); return; }
    setLoadingB(true);
    fetch(`/api/admin/tarot/product-intelligence/prompt/versions/${compareB}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setVersionB(data.version);
      })
      .finally(() => setLoadingB(false));
  }, [compareB]);

  useEffect(() => {
    if (!cfgA || !versionB) { setDiffResult(null); return; }
    const a = cfgA[section] ?? "";
    const b = versionB[section] ?? "";
    setDiffResult(computeDiff(a, b));
  }, [cfgA, versionB, section]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Version A = siempre la activa */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Versión A (base)</label>
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-300">
            Versión activa {cfgA ? `— v${cfgA.version}` : ""}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Versión B (comparar)</label>
          <div className="relative">
            <select
              value={compareB}
              onChange={(e) => onCompareBChange(e.target.value)}
              className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 pr-8"
            >
              <option value="">Seleccionar versión…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.label} — {fmt(v.created_at)}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {(["prompt_sistema", "prompt_usuario_template"] as Section[]).map((s) => (
          <button key={s} onClick={() => onSectionChange(s)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${section === s ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"}`}>
            {s === "prompt_sistema" ? "Prompt de sistema" : "Prompt de usuario"}
          </button>
        ))}
      </div>

      {!compareB && <p className="text-sm text-gray-600 text-center py-8">Seleccioná una versión B para ver el diff.</p>}
      {compareB && loadingB && <div className="flex items-center gap-2 text-sm text-gray-500 py-4"><Loader2 size={14} className="animate-spin" /> Cargando versión…</div>}
      {compareB && !loadingB && versionB && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/60">
            <div className="flex items-center gap-2">
              <Minus size={11} className="text-red-400" />
              <span className="text-xs text-gray-400">Versión activa</span>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <Plus size={11} className="text-emerald-400" />
              <span className="text-xs text-gray-400">{versionB.label}</span>
            </div>
          </div>
          {diffResult ? <DiffView diff={diffResult} /> : <p className="text-xs text-gray-600 py-4 text-center">Calculando diff…</p>}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PromptPage() {
  const [activeTab, setActiveTab] = useState<Tab>("activa");
  const [cfg, setCfg] = useState<ProductoConfig | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Versión activa — edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; texto: string } | null>(null);

  // Historial
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<VersionMeta | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Comparar
  const [compareB, setCompareB] = useState("");
  const [compareSection, setCompareSection] = useState<Section>("prompt_sistema");

  const cargar = useCallback(async () => {
    setCargando(true); setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/tarot/config/prompt");
      const data = await res.json();
      if (data.ok && data.configs?.length > 0) setCfg(data.configs[0]);
      else setErrorMsg("No se encontró configuración de prompt activa");
    } catch { setErrorMsg("Error de red al cargar prompt"); }
    finally { setCargando(false); }
  }, []);

  const cargarVersiones = useCallback(async () => {
    if (versions.length > 0) return;
    setLoadingVersions(true);
    try {
      const res = await fetch("/api/admin/tarot/product-intelligence/prompt/versions");
      const data = await res.json();
      if (data.ok) setVersions(data.versions ?? []);
    } catch { /* noop */ }
    finally { setLoadingVersions(false); }
  }, [versions.length]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (activeTab === "historial" || activeTab === "comparar") cargarVersiones();
  }, [activeTab, cargarVersiones]);

  function startEdit(key: string, value: string) { setEditingKey(key); setDraftText(value); setSaveResult(null); }
  function cancelEdit() { setEditingKey(null); setDraftText(""); }

  async function guardar(motivo: string) {
    if (!cfg || !editingKey || !motivo.trim()) return;
    setGuardando(true); setSaveResult(null);
    const snapshotPayload = {
      label: `Edición manual — ${new Date().toLocaleDateString("es-UY")}`,
      prompt_sistema: editingKey === "prompt_sistema" ? draftText : cfg.prompt_sistema,
      prompt_usuario_template: editingKey === "prompt_usuario_template" ? draftText : cfg.prompt_usuario_template,
      motivo_cambio: motivo.trim(), ia_modelo: cfg.ia_modelo, ia_max_tokens: cfg.ia_max_tokens,
      ia_temperatura: cfg.ia_temperatura, max_words_interpretacion: cfg.max_words_interpretacion,
      max_words_consejo: cfg.max_words_consejo, max_words_resumen: cfg.max_words_resumen,
      max_words_mensaje_final: cfg.max_words_mensaje_final, max_words_proximo_paso: cfg.max_words_proximo_paso,
      producto_config_id: cfg.id,
    };
    const snapRes = await fetch("/api/admin/tarot/product-intelligence/prompt/versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshotPayload) });
    const snapData = await snapRes.json();
    if (!snapData.ok) { setSaveResult({ ok: false, texto: `Error al crear snapshot: ${snapData.motivo}` }); setGuardando(false); return; }

    // Refresh versions list
    setVersions([]);

    const patchRes = await fetch("/api/admin/tarot/config/prompt", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cfg.id, [editingKey]: draftText }) });
    const patchData = await patchRes.json();
    if (patchData.ok) {
      setCfg((prev) => prev ? { ...prev, [editingKey]: draftText } as ProductoConfig : prev);
      setSaveResult({ ok: true, texto: "Guardado y snapshot creado" });
      setEditingKey(null); setDraftText("");
    } else {
      setSaveResult({ ok: false, texto: `Error al guardar: ${patchData.detalle ?? patchData.motivo}` });
    }
    setGuardando(false);
  }

  async function restaurar(motivo: string) {
    if (!restoreTarget) return;
    setRestoring(true); setRestoreResult(null);
    try {
      const res = await fetch("/api/admin/tarot/product-intelligence/prompt/restore", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: restoreTarget.id, motivo }),
      });
      const data = await res.json();
      if (data.ok) {
        setRestoreResult({ ok: true, msg: `Restaurado: ${data.restoredLabel}` });
        setRestoreTarget(null);
        setVersions([]);
        await cargar();
      } else {
        setRestoreResult({ ok: false, msg: data.motivo ?? "Error al restaurar" });
      }
    } catch { setRestoreResult({ ok: false, msg: "Error de red" }); }
    finally { setRestoring(false); }
  }

  function handleComparar(id: string) { setCompareB(id); setActiveTab("comparar"); }

  const wordFields = cfg ? [
    { label: "Interpretación / carta", value: cfg.max_words_interpretacion },
    { label: "Consejo / carta", value: cfg.max_words_consejo },
    { label: "Resumen final", value: cfg.max_words_resumen },
    { label: "Mensaje final", value: cfg.max_words_mensaje_final },
    { label: "Próximo paso / carta", value: cfg.max_words_proximo_paso },
  ] : [];

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "activa", label: "Versión activa", icon: <FileText size={13} /> },
    { id: "historial", label: "Historial", icon: <History size={13} /> },
    { id: "comparar", label: "Comparar", icon: <GitCompare size={13} /> },
  ];

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 px-6 py-4">
        <PIABreadcrumb segments={[{ label: "Product Intelligence", href: "/admin/tarot/product-intelligence" }, { label: "Prompt" }]} />
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-gray-400" />
            <h1 className="text-base font-semibold text-white">Prompt activo</h1>
            {cfg && <span className="ml-2 text-xs bg-amber-900/40 text-amber-300 border border-amber-800/50 px-2 py-0.5 rounded-full">v{cfg.version}</span>}
          </div>
          <button onClick={cargar} disabled={cargando} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-800 rounded-lg px-3 py-1.5 transition-colors">
            <RefreshCw size={11} className={cargando ? "animate-spin" : ""} /> Actualizar
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-800 px-6">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs transition-colors border-b-2 ${activeTab === tab.id ? "border-amber-500 text-amber-300" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-4 max-w-4xl">
        {restoreResult && (
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${restoreResult.ok ? "border-emerald-800/50 bg-emerald-950/40 text-emerald-300" : "border-red-800/50 bg-red-950/40 text-red-300"}`}>
            {restoreResult.ok ? <Check size={14} /> : <AlertCircle size={14} />} {restoreResult.msg}
          </div>
        )}

        {/* ── TAB: Versión activa ─────────────────────────────────────────────── */}
        {activeTab === "activa" && (
          <>
            <ContextBanner variant="warning">
              Cada edición guarda un snapshot automático en el historial antes de aplicar el cambio.
              Revisá el historial y usá Comparar para ver diferencias entre versiones.
            </ContextBanner>

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                <AlertCircle size={14} className="shrink-0" /> {errorMsg}
              </div>
            )}
            {saveResult && (
              <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${saveResult.ok ? "border-emerald-800/50 bg-emerald-950/40 text-emerald-300" : "border-red-800/50 bg-red-950/40 text-red-300"}`}>
                {saveResult.ok ? <Check size={14} /> : <AlertCircle size={14} />} {saveResult.texto}
              </div>
            )}

            {cargando ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 animate-pulse py-8"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
            ) : cfg ? (
              <>
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800/60"><span className="text-sm font-semibold text-gray-200">Metadatos del producto</span></div>
                  <div className="divide-y divide-gray-800/40">
                    {[{ label: "Nombre", value: cfg.nombre }, { label: "Versión", value: cfg.version }, { label: "Modelo override", value: cfg.ia_modelo ?? "(usa global)" }, { label: "Última actualiz.", value: fmt(cfg.updated_at) }].map(({ label, value }) => (
                      <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-40 text-xs text-gray-400 shrink-0">{label}</span>
                        <span className="text-sm text-gray-300 font-mono">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <SectionLabel label="Prompt de sistema" />
                <PromptSection titulo="Prompt de sistema" sectionKey="prompt_sistema" text={cfg.prompt_sistema} editingKey={editingKey} draftText={draftText} onStartEdit={startEdit} onCancelEdit={cancelEdit} onDraftChange={setDraftText} />

                <SectionLabel label="Prompt de usuario" />
                <PromptSection titulo="Template de prompt de usuario" sectionKey="prompt_usuario_template" text={cfg.prompt_usuario_template} editingKey={editingKey} draftText={draftText} onStartEdit={startEdit} onCancelEdit={cancelEdit} onDraftChange={setDraftText} />

                <SectionLabel label="Límites de palabras (configurar en Configuración › Output)" />
                <div className="rounded-xl border border-gray-800 bg-gray-900/30 overflow-hidden">
                  <div className="divide-y divide-gray-800/30">
                    {wordFields.map(({ label, value }) => (
                      <div key={label} className="flex items-center gap-3 px-4 py-2">
                        <span className="w-52 text-xs text-gray-500">{label}</span>
                        <span className="text-xs font-mono text-gray-500">{value} palabras</span>
                      </div>
                    ))}
                  </div>
                </div>

                {editingKey && (
                  <div className="sticky bottom-0 z-10 bg-gray-950/95 border-t border-gray-800 px-6 py-3 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      Editando: <span className="text-amber-300">{editingKey === "prompt_sistema" ? "Prompt de sistema" : "Prompt de usuario"}</span>. Se guardará snapshot antes de aplicar.
                    </p>
                    <div className="flex items-center gap-2">
                      <button onClick={cancelEdit} className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"><X size={11} /> Cancelar</button>
                      <button onClick={() => setConfirmOpen(true)} disabled={guardando} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors">
                        {guardando ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                        {guardando ? "Guardando…" : "Guardar cambios"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </>
        )}

        {/* ── TAB: Historial ──────────────────────────────────────────────────── */}
        {activeTab === "historial" && (
          <>
            <ContextBanner variant="info">
              Cada versión es un snapshot inmutable del prompt en un momento dado. Restaurar crea un snapshot de la versión activa antes de aplicar el cambio.
            </ContextBanner>
            <HistorialTab
              versions={versions}
              loading={loadingVersions}
              onComparar={handleComparar}
              onRestoreClick={(v) => { setRestoreTarget(v); setRestoreResult(null); }}
            />
          </>
        )}

        {/* ── TAB: Comparar ───────────────────────────────────────────────────── */}
        {activeTab === "comparar" && (
          <>
            <ContextBanner variant="info">
              Compará la versión activa con cualquier versión del historial. Las líneas en rojo indican contenido eliminado; en verde, contenido nuevo.
            </ContextBanner>
            {!cfg || cargando ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4"><Loader2 size={14} className="animate-spin" /> Cargando…</div>
            ) : (
              <CompararTab
                versions={versions}
                cfgA={cfg}
                compareB={compareB}
                section={compareSection}
                onSectionChange={setCompareSection}
                onCompareBChange={setCompareB}
              />
            )}
          </>
        )}
      </div>

      {/* Save ConfirmDialog */}
      <ConfirmDialog
        open={confirmOpen}
        title="Guardar cambios al prompt"
        description="Se creará un snapshot de la versión actual antes de aplicar los cambios. Esta acción no se puede deshacer automáticamente."
        confirmLabel="Guardar y continuar"
        confirmClassName="bg-amber-700 hover:bg-amber-600"
        requireMotivo={true}
        onConfirm={async (motivo) => { setConfirmOpen(false); await guardar(motivo ?? ""); }}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Restore ConfirmDialog */}
      <ConfirmDialog
        open={!!restoreTarget}
        title={`Restaurar: ${restoreTarget?.label ?? ""}`}
        description="Se creará un snapshot automático de la versión activa actual antes de restaurar esta versión. El prompt activo quedará reemplazado."
        confirmLabel={restoring ? "Restaurando…" : "Restaurar versión"}
        confirmClassName="bg-amber-700 hover:bg-amber-600"
        requireMotivo={true}
        onConfirm={async (motivo) => { await restaurar(motivo ?? ""); }}
        onCancel={() => { setRestoreTarget(null); setRestoreResult(null); }}
      />
    </div>
  );
}
