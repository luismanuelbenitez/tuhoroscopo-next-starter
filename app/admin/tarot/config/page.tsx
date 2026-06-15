"use client";
import { useState, useEffect, useCallback } from "react";
import {
  LogOut, AlertCircle, Pencil, X, Check, Loader2, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { TarotNav } from "@/components/admin/TarotNav";

// ============================================================================
// Types
// ============================================================================

interface ConfigRow {
  clave: string;
  valor: string;
  tipo_valor: string;
  descripcion: string | null;
}

interface ProductoConfig {
  id: string;
  nombre: string;
  version: string;
  idioma: string;
  prompt_sistema: string;
  prompt_usuario_template: string;
  max_words_interpretacion: number;
  max_words_consejo: number;
  max_words_resumen: number;
  max_words_mensaje_final: number;
  max_words_proximo_paso: number;
  ia_modelo: string | null;
  ia_max_tokens: number | null;
  ia_temperatura: number | null;
  notas: string | null;
  updated_at: string | null;
}

// ============================================================================
// Config groups definition
// ============================================================================

type Campo = {
  clave: string;
  label: string;
  tipo: "text" | "number" | "select" | "boolean";
  opciones?: string[];
  min?: number;
  max?: number;
  step?: number;
  helpText?: string;
};

const GRUPOS: { titulo: string; campos: Campo[] }[] = [
  {
    titulo: "Precios",
    campos: [
      { clave: "precio_base_uyu", label: "Precio UYU",      tipo: "number", min: 1 },
      { clave: "precio_base_ars", label: "Precio ARS",      tipo: "number", min: 1 },
      { clave: "moneda_default",  label: "Moneda por defecto", tipo: "select", opciones: ["UYU", "ARS"] },
    ],
  },
  {
    titulo: "MercadoPago",
    campos: [
      { clave: "mp_modo", label: "Modo", tipo: "select", opciones: ["sandbox", "production"],
        helpText: 'Cambiá a "production" para cobros reales.' },
    ],
  },
  {
    titulo: "Inteligencia Artificial",
    campos: [
      { clave: "ia_modelo",              label: "Modelo",             tipo: "text",   helpText: "Ej: claude-sonnet-4-6" },
      { clave: "ia_max_tokens",          label: "Max tokens",         tipo: "number", min: 100, max: 16000 },
      { clave: "ia_temperatura",         label: "Temperatura (0–1)",  tipo: "number", min: 0, max: 1, step: 0.05 },
      { clave: "max_reintentos_lectura", label: "Reintentos lectura", tipo: "number", min: 1, max: 10 },
    ],
  },
  {
    titulo: "PDF",
    campos: [
      { clave: "pdf_plantilla_activa",      label: "Plantilla activa",    tipo: "text" },
      { clave: "pdf_url_expiracion_horas",  label: "URL expira (horas)",  tipo: "number", min: 1, max: 720 },
      { clave: "max_reintentos_pdf",        label: "Reintentos PDF",      tipo: "number", min: 1, max: 10 },
    ],
  },
  {
    titulo: "WhatsApp",
    campos: [
      { clave: "whatsapp_modo",     label: "Modo WA",        tipo: "select", opciones: ["sandbox", "production"],
        helpText: 'Cambiá a "production" para envíos reales por WhatsApp.' },
      { clave: "wa_proveedor",      label: "Proveedor",      tipo: "text" },
      { clave: "max_reintentos_wa", label: "Reintentos WA",  tipo: "number", min: 1, max: 10 },
    ],
  },
  {
    titulo: "Sistema",
    campos: [
      { clave: "debug_mode",      label: "Debug mode",        tipo: "select", opciones: ["false", "true"],
        helpText: "true = logs verbosos en todas las EFs. Desactivar en producción." },
      { clave: "version_terminos", label: "Versión términos", tipo: "text" },
    ],
  },
];

const WORD_FIELDS: { key: keyof ProductoConfig; label: string }[] = [
  { key: "max_words_interpretacion", label: "Interpretación / carta (máx palabras)" },
  { key: "max_words_consejo",        label: "Consejo / carta (máx palabras)" },
  { key: "max_words_resumen",        label: "Resumen final (máx palabras)" },
  { key: "max_words_mensaje_final",  label: "Mensaje final (máx palabras)" },
  { key: "max_words_proximo_paso",   label: "Próximo paso / carta (máx palabras)" },
];

// ============================================================================
// Helpers
// ============================================================================

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", dateStyle: "short", timeStyle: "short" });
}

function ResultMsg({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-400" : "text-red-400"}`}>
      {ok ? <Check size={12} /> : <AlertCircle size={12} />}
      {texto}
    </div>
  );
}

// ============================================================================
// ConfigGrupo — editable card per group
// ============================================================================

function ConfigGrupo({
  titulo,
  campos,
  configMap,
  onSave,
}: {
  titulo: string;
  campos: Campo[];
  configMap: Record<string, string>;
  onSave: (updates: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; texto: string } | null>(null);

  function startEdit() {
    const initial: Record<string, string> = {};
    for (const c of campos) initial[c.clave] = configMap[c.clave] ?? "";
    setDraft(initial);
    setResult(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft({});
  }

  async function guardar() {
    setGuardando(true);
    setResult(null);
    const r = await onSave(draft);
    setResult({ ok: r.ok, texto: r.ok ? "Guardado" : (r.error ?? "Error al guardar") });
    setGuardando(false);
    if (r.ok) setEditing(false);
  }

  const inputCls = "bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500 w-full";

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
        <span className="text-sm font-semibold text-gray-200">{titulo}</span>
        {!editing ? (
          <button
            onClick={startEdit}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-300 transition-colors"
          >
            <Pencil size={11} /> Editar
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {result && <ResultMsg ok={result.ok} texto={result.texto} />}
            <button
              onClick={cancelEdit}
              className="p-1 text-gray-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors"
            >
              {guardando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}
      </div>
      <div className="divide-y divide-gray-800/40">
        {campos.map((campo) => {
          const valorActual = configMap[campo.clave] ?? "—";
          return (
            <div key={campo.clave} className="flex items-start gap-3 px-4 py-2.5">
              <div className="w-52 shrink-0">
                <p className="text-xs text-gray-400">{campo.label}</p>
                {campo.helpText && <p className="text-xs text-gray-600 mt-0.5">{campo.helpText}</p>}
              </div>
              {editing ? (
                <div className="flex-1">
                  {campo.tipo === "select" ? (
                    <select
                      value={draft[campo.clave] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [campo.clave]: e.target.value })}
                      className={inputCls}
                    >
                      {campo.opciones?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={campo.tipo === "number" ? "number" : "text"}
                      min={campo.min}
                      max={campo.max}
                      step={campo.step ?? (campo.tipo === "number" ? 1 : undefined)}
                      value={draft[campo.clave] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [campo.clave]: e.target.value })}
                      className={inputCls}
                    />
                  )}
                </div>
              ) : (
                <span className={`text-sm font-mono ${valorActual === "true" ? "text-emerald-400" : valorActual === "false" ? "text-gray-500" : valorActual === "production" ? "text-amber-300" : "text-gray-300"}`}>
                  {valorActual}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// PromptEditor
// ============================================================================

function PromptEditor({ cfg, onSave }: {
  cfg: ProductoConfig;
  onSave: (patch: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [draft, setDraft] = useState<ProductoConfig>({ ...cfg });
  const [expandSistema, setExpandSistema] = useState(false);
  const [expandTemplate, setExpandTemplate] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; texto: string } | null>(null);

  async function guardar() {
    setGuardando(true);
    setResult(null);
    const r = await onSave({
      id: draft.id,
      prompt_sistema: draft.prompt_sistema,
      prompt_usuario_template: draft.prompt_usuario_template,
      max_words_interpretacion: draft.max_words_interpretacion,
      max_words_consejo: draft.max_words_consejo,
      max_words_resumen: draft.max_words_resumen,
      max_words_mensaje_final: draft.max_words_mensaje_final,
      max_words_proximo_paso: draft.max_words_proximo_paso,
      ia_modelo: draft.ia_modelo,
      ia_max_tokens: draft.ia_max_tokens,
      ia_temperatura: draft.ia_temperatura,
      notas: draft.notas,
    });
    setResult({ ok: r.ok, texto: r.ok ? "Guardado correctamente" : (r.error ?? "Error al guardar") });
    setGuardando(false);
  }

  const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500";
  const textareaCls = `${inputCls} font-mono text-xs leading-relaxed resize-none`;

  return (
    <div className="space-y-4">
      {/* Límites de palabras */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <p className="text-sm font-semibold text-gray-200 mb-3">Límites de palabras por campo (PDF)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {WORD_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-gray-400 mb-1">{label}</label>
              <input
                type="number" min={10} max={500} step={5}
                value={draft[key] as number}
                onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </div>

      {/* IA overrides */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <p className="text-sm font-semibold text-gray-200 mb-1">Override IA para este producto</p>
        <p className="text-xs text-gray-500 mb-3">Si se dejan vacíos, se usan los valores de Configuración general.</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Modelo</label>
            <input
              type="text"
              value={draft.ia_modelo ?? ""}
              onChange={(e) => setDraft({ ...draft, ia_modelo: e.target.value || null })}
              placeholder="(usa global)"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Max tokens</label>
            <input
              type="number" min={100} max={16000}
              value={draft.ia_max_tokens ?? ""}
              onChange={(e) => setDraft({ ...draft, ia_max_tokens: e.target.value ? Number(e.target.value) : null })}
              placeholder="(usa global)"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Temperatura</label>
            <input
              type="number" min={0} max={1} step={0.05}
              value={draft.ia_temperatura ?? ""}
              onChange={(e) => setDraft({ ...draft, ia_temperatura: e.target.value ? Number(e.target.value) : null })}
              placeholder="(usa global)"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* Prompt sistema */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <button
          onClick={() => setExpandSistema((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-800/60 text-left"
        >
          <div>
            <span className="text-sm font-semibold text-gray-200">Prompt Sistema</span>
            <span className="ml-2 text-xs text-gray-500">{draft.prompt_sistema.length} chars</span>
          </div>
          {expandSistema ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </button>
        {expandSistema && (
          <div className="p-4">
            <p className="text-xs text-gray-500 mb-2">
              Define el rol y estilo de la IA. Se envía como <code className="text-gray-400">system</code> en la API de Anthropic.
            </p>
            <textarea
              rows={12}
              value={draft.prompt_sistema}
              onChange={(e) => setDraft({ ...draft, prompt_sistema: e.target.value })}
              className={textareaCls}
            />
          </div>
        )}
      </div>

      {/* Prompt usuario template */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <button
          onClick={() => setExpandTemplate((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-800/60 text-left"
        >
          <div>
            <span className="text-sm font-semibold text-gray-200">Prompt Usuario (template)</span>
            <span className="ml-2 text-xs text-gray-500">{draft.prompt_usuario_template.length} chars</span>
          </div>
          {expandTemplate ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </button>
        {expandTemplate && (
          <div className="p-4">
            <p className="text-xs text-gray-500 mb-2">
              Variables disponibles: <code className="text-gray-400">{'{{nombre}}'}</code>, <code className="text-gray-400">{'{{fecha_nacimiento}}'}</code>, <code className="text-gray-400">{'{{pregunta}}'}</code>, <code className="text-gray-400">{'{{tema}}'}</code>, <code className="text-gray-400">{'{{cartas_texto}}'}</code>, <code className="text-gray-400">{'{{max_interpretacion}}'}</code>, etc.
            </p>
            <textarea
              rows={18}
              value={draft.prompt_usuario_template}
              onChange={(e) => setDraft({ ...draft, prompt_usuario_template: e.target.value })}
              className={textareaCls}
            />
          </div>
        )}
      </div>

      {/* Notas */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <label className="block text-xs text-gray-400 mb-1">Notas internas</label>
        <textarea
          rows={3}
          value={draft.notas ?? ""}
          onChange={(e) => setDraft({ ...draft, notas: e.target.value || null })}
          placeholder="Cambios, experimentos, observaciones…"
          className={textareaCls}
        />
      </div>

      {/* Save */}
      <div className="flex items-center justify-between">
        <div>
          {result && <ResultMsg ok={result.ok} texto={result.texto} />}
        </div>
        <button
          onClick={guardar}
          disabled={guardando}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {guardando ? <Loader2 size={13} className="animate-spin" /> : null}
          {guardando ? "Guardando…" : "Guardar prompt"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

type Tab = "config" | "prompt";

export default function TarotConfigPage() {
  const [tab, setTab] = useState<Tab>("config");
  const [configRows, setConfigRows] = useState<ConfigRow[]>([]);
  const [promptConfigs, setPromptConfigs] = useState<ProductoConfig[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const [rCfg, rPrompt] = await Promise.all([
        fetch("/api/admin/tarot/config"),
        fetch("/api/admin/tarot/config/prompt"),
      ]);
      const [dCfg, dPrompt] = await Promise.all([rCfg.json(), rPrompt.json()]);
      if (dCfg.ok) setConfigRows(dCfg.data ?? []);
      else setErrorMsg(dCfg.detalle ?? "Error al cargar configuración");
      if (dPrompt.ok) setPromptConfigs(dPrompt.configs ?? []);
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  const configMap = Object.fromEntries(configRows.map((r) => [r.clave, r.valor]));

  async function saveConfigGroup(updates: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/admin/tarot/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfigRows((prev) => prev.map((r) => updates[r.clave] !== undefined ? { ...r, valor: updates[r.clave] } : r));
        return { ok: true };
      }
      return { ok: false, error: data.detalle ?? data.motivo };
    } catch {
      return { ok: false, error: "Error de red" };
    }
  }

  async function savePrompt(patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/admin/tarot/config/prompt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.ok) {
        setPromptConfigs((prev) => prev.map((c) => c.id === patch.id ? { ...c, ...patch } as ProductoConfig : c));
        return { ok: true };
      }
      return { ok: false, error: data.detalle ?? data.motivo };
    } catch {
      return { ok: false, error: "Error de red" };
    }
  }

  const tabCls = (t: Tab) =>
    `text-sm border-b-2 py-2.5 px-3 whitespace-nowrap transition-colors ${tab === t ? "text-white border-amber-500" : "text-gray-500 hover:text-gray-300 border-transparent"}`;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <AdminPanelSwitcher current="ttc" />
          <button
            onClick={handleLogout} disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            <LogOut size={15} />
            {cerrandoSesion ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <TarotNav current="/admin/tarot/config" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Configuración TTC</h2>
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-3 py-2 transition-colors"
          >
            <RefreshCw size={12} className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-0 border-b border-gray-800 mb-6">
          <button onClick={() => setTab("config")}  className={tabCls("config")}>Configuración general</button>
          <button onClick={() => setTab("prompt")}  className={tabCls("prompt")}>Prompt de IA</button>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {cargando && (
          <div className="flex items-center gap-2 text-sm text-gray-500 animate-pulse py-8">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        )}

        {!cargando && tab === "config" && (
          <div className="space-y-4">
            {GRUPOS.map((grupo) => (
              <ConfigGrupo
                key={grupo.titulo}
                titulo={grupo.titulo}
                campos={grupo.campos}
                configMap={configMap}
                onSave={saveConfigGroup}
              />
            ))}
            <p className="text-xs text-gray-600 pt-1">
              Campos ocultos (solo lectura desde DB): <span className="font-mono">mazo_default, tipo_tirada_default, storage_bucket_*</span>
            </p>
          </div>
        )}

        {!cargando && tab === "prompt" && (
          <div>
            {promptConfigs.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">Sin configuraciones de prompt activas.</p>
            ) : (
              promptConfigs.map((cfg) => (
                <div key={cfg.id}>
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-sm font-semibold text-gray-200">{cfg.nombre}</h3>
                    <span className="text-xs text-gray-600 font-mono">v{cfg.version}</span>
                    <span className="text-xs text-gray-600 font-mono">{cfg.idioma}</span>
                    <span className="text-xs text-gray-600">Actualizado: {fmt(cfg.updated_at)}</span>
                  </div>
                  <PromptEditor cfg={cfg} onSave={savePrompt} />
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
