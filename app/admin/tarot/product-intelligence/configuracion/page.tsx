"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Settings, AlertCircle, Check, X, Pencil, Loader2, RefreshCw,
} from "lucide-react";
import { PIABreadcrumb } from "@/components/admin/product-intelligence/PIABreadcrumb";
import { ContextBanner } from "@/components/admin/product-intelligence/ContextBanner";
import { ConfirmDialog } from "@/components/admin/product-intelligence/ConfirmDialog";

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface EnvStatus {
  whatsapp_token_configurado?: boolean;
  whatsapp_phone_id_configurado?: boolean;
  ef_unreachable?: boolean;
}

type Tab = "ia" | "output" | "entrega" | "no_editables";

// ── Campo de config ───────────────────────────────────────────────────────────

type Campo = {
  clave: string;
  label: string;
  tipo: "text" | "number" | "select" | "boolean";
  opciones?: string[];
  min?: number;
  max?: number;
  step?: number;
  helpText?: string;
  tooltip?: string;
};

const GRUPOS_IA: Campo[] = [
  {
    clave: "ia_modelo",
    label: "Modelo de IA",
    tipo: "text",
    helpText: "Ej: claude-sonnet-4-6",
    tooltip: "Modelo de Anthropic a usar para generar lecturas. Cambiarlo afecta todas las lecturas futuras.",
  },
  {
    clave: "ia_max_tokens",
    label: "Max tokens",
    tipo: "number",
    min: 100, max: 16000,
    tooltip: "Una lectura completa usa ~1.600–1.900 tokens. No bajar de 2.500 para evitar lecturas truncadas.",
  },
  {
    clave: "ia_temperatura",
    label: "Temperatura (0–1)",
    tipo: "number",
    min: 0, max: 1, step: 0.05,
    tooltip: "0 = más predecible. 1 = más creativo. Rango recomendado para lecturas narrativas: 0.7–0.9.",
  },
  {
    clave: "max_reintentos_lectura",
    label: "Reintentos",
    tipo: "number",
    min: 1, max: 10,
    tooltip: "Si la generación falla, se reintenta N veces antes de marcar la lectura como estado 'error'.",
  },
];

const GRUPOS_ENTREGA: Campo[] = [
  { clave: "mp_modo", label: "Modo MercadoPago", tipo: "select", opciones: ["sandbox", "production"], helpText: '"production" para cobros reales.' },
  { clave: "whatsapp_modo", label: "Modo WhatsApp", tipo: "select", opciones: ["sandbox", "production"], helpText: '"production" para envíos reales.' },
  {
    clave: "canal_entrega_principal",
    label: "Canal principal",
    tipo: "select",
    opciones: ["both", "whatsapp", "email"],
    helpText: '"both" = WA + email. "whatsapp" = WA con fallback email.',
  },
  { clave: "envio_whatsapp_activo", label: "WhatsApp activo", tipo: "select", opciones: ["true", "false"] },
  { clave: "envio_email_activo", label: "Email activo", tipo: "select", opciones: ["true", "false"] },
  { clave: "fallback_email_si_falla_whatsapp", label: "Fallback email si falla WA", tipo: "select", opciones: ["true", "false"] },
];

const WORD_FIELDS: { key: keyof ProductoConfig; label: string }[] = [
  { key: "max_words_interpretacion", label: "Interpretación / carta" },
  { key: "max_words_consejo",        label: "Consejo / carta" },
  { key: "max_words_resumen",        label: "Resumen final" },
  { key: "max_words_mensaje_final",  label: "Mensaje final" },
  { key: "max_words_proximo_paso",   label: "Próximo paso / carta" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", dateStyle: "short", timeStyle: "short" });
}

function ResultMsg({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={`flex items-center gap-1 text-xs ${ok ? "text-emerald-400" : "text-red-400"}`}>
      {ok ? <Check size={11} /> : <AlertCircle size={11} />}
      {texto}
    </span>
  );
}

// ── ConfigGrupo (reutilizado del panel existente, adaptado) ───────────────────

function ConfigGrupo({
  titulo,
  campos,
  configMap,
  onSave,
  requireConfirm = false,
}: {
  titulo: string;
  campos: Campo[];
  configMap: Record<string, string>;
  onSave: (updates: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
  requireConfirm?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; texto: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function startEdit() {
    const init: Record<string, string> = {};
    for (const c of campos) init[c.clave] = configMap[c.clave] ?? "";
    setDraft(init);
    setResult(null);
    setEditing(true);
  }

  function cancelEdit() { setEditing(false); setDraft({}); }

  async function doSave() {
    setGuardando(true);
    setResult(null);
    const r = await onSave(draft);
    setResult({ ok: r.ok, texto: r.ok ? "Guardado" : (r.error ?? "Error al guardar") });
    setGuardando(false);
    if (r.ok) setEditing(false);
  }

  async function handleSave() {
    if (requireConfirm) {
      setConfirmOpen(true);
    } else {
      await doSave();
    }
  }

  const inputCls = "bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500 w-full";

  return (
    <>
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
          <span className="text-sm font-semibold text-gray-200">{titulo}</span>
          {!editing ? (
            <button onClick={startEdit} className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-300 transition-colors">
              <Pencil size={11} /> Editar
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {result && <ResultMsg ok={result.ok} texto={result.texto} />}
              <button onClick={cancelEdit} className="p-1 text-gray-500 hover:text-white transition-colors">
                <X size={14} />
              </button>
              <button
                onClick={handleSave}
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
                  {campo.tooltip && !editing && (
                    <p className="text-xs text-gray-700 mt-0.5 italic">{campo.tooltip}</p>
                  )}
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
                  <span className={`text-sm font-mono ${valorActual === "production" ? "text-amber-300" : valorActual === "true" ? "text-emerald-400" : valorActual === "false" ? "text-gray-500" : "text-gray-300"}`}>
                    {valorActual}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {requireConfirm && (
        <ConfirmDialog
          open={confirmOpen}
          title="Confirmar cambio de parámetros de IA"
          description="Estos cambios afectan todas las lecturas generadas a partir de ahora. ¿Confirmar?"
          confirmLabel="Guardar cambios"
          confirmClassName="bg-amber-700 hover:bg-amber-600"
          onConfirm={async () => {
            setConfirmOpen(false);
            await doSave();
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}

// ── Word limits card ──────────────────────────────────────────────────────────

function OutputLimitsCard({
  cfg,
  onSave,
}: {
  cfg: ProductoConfig | null;
  onSave: (patch: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [guardando, setGuardando] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; texto: string } | null>(null);

  function startEdit() {
    if (!cfg) return;
    const d: Record<string, number> = {};
    for (const { key } of WORD_FIELDS) d[key] = (cfg[key] as number) ?? 0;
    setDraft(d);
    setResult(null);
    setEditing(true);
  }

  async function guardar() {
    if (!cfg) return;
    setGuardando(true);
    setResult(null);
    const r = await onSave({ id: cfg.id, ...draft });
    setResult({ ok: r.ok, texto: r.ok ? "Guardado" : (r.error ?? "Error") });
    setGuardando(false);
    if (r.ok) setEditing(false);
  }

  const inputCls = "bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500 w-full";

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
        <span className="text-sm font-semibold text-gray-200">Estructura del output (límites de palabras)</span>
        {!editing ? (
          <button onClick={startEdit} className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-300 transition-colors">
            <Pencil size={11} /> Editar
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {result && <ResultMsg ok={result.ok} texto={result.texto} />}
            <button onClick={() => setEditing(false)} className="p-1 text-gray-500 hover:text-white">
              <X size={14} />
            </button>
            <button
              onClick={guardar}
              disabled={guardando || !cfg}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors"
            >
              {guardando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}
      </div>
      {!cfg ? (
        <div className="px-4 py-4 animate-pulse">
          {WORD_FIELDS.map((_, i) => <div key={i} className="h-6 bg-gray-800/50 rounded mb-1" />)}
        </div>
      ) : (
        <div className="divide-y divide-gray-800/40">
          {WORD_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-52 text-xs text-gray-400">{label} (máx palabras)</span>
              {editing ? (
                <input
                  type="number" min={10} max={500} step={5}
                  value={draft[key] ?? 0}
                  onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                  className={`${inputCls} max-w-28`}
                />
              ) : (
                <span className="text-sm font-mono text-gray-300">{(cfg[key] as number) ?? "—"}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const [tab, setTab] = useState<Tab>("ia");
  const [configRows, setConfigRows] = useState<ConfigRow[]>([]);
  const [promptCfg, setPromptCfg] = useState<ProductoConfig | null>(null);
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const [rCfg, rPrompt] = await Promise.all([
        fetch("/api/admin/tarot/config"),
        fetch("/api/admin/tarot/config/prompt"),
      ]);
      const [dCfg, dPrompt] = await Promise.all([rCfg.json(), rPrompt.json()]);
      if (dCfg.ok) {
        setConfigRows(dCfg.data ?? []);
        setEnvStatus(dCfg.env_status ?? null);
      } else {
        setErrorMsg("Error al cargar configuración");
      }
      if (dPrompt.ok && Array.isArray(dPrompt.configs) && dPrompt.configs.length > 0) {
        setPromptCfg(dPrompt.configs[0]);
      }
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

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

  async function savePromptConfig(patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/admin/tarot/config/prompt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.ok) {
        setPromptCfg((prev) => prev ? { ...prev, ...patch } as ProductoConfig : prev);
        return { ok: true };
      }
      return { ok: false, error: data.detalle ?? data.motivo };
    } catch {
      return { ok: false, error: "Error de red" };
    }
  }

  const tabCls = (t: Tab) =>
    `px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
      tab === t ? "text-white border-amber-500" : "text-gray-500 hover:text-gray-300 border-transparent"
    }`;

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <PIABreadcrumb segments={[{ label: "Product Intelligence", href: "/admin/tarot/product-intelligence" }, { label: "Configuración" }]} />
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-gray-400" />
            <h1 className="text-base font-semibold text-white">Configuración</h1>
          </div>
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-800 rounded-lg px-3 py-1.5 transition-colors"
          >
            <RefreshCw size={11} className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
        {/* Sub-tabs */}
        <div className="mt-3 flex gap-0 border-b border-gray-800 -mb-px">
          <button onClick={() => setTab("ia")}          className={tabCls("ia")}>Modelo de IA</button>
          <button onClick={() => setTab("output")}      className={tabCls("output")}>Output</button>
          <button onClick={() => setTab("entrega")}     className={tabCls("entrega")}>Entrega</button>
          <button onClick={() => setTab("no_editables")} className={tabCls("no_editables")}>No editables</button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            <AlertCircle size={14} className="shrink-0" /> {errorMsg}
          </div>
        )}

        {cargando && (
          <div className="flex items-center gap-2 text-sm text-gray-500 animate-pulse py-8">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        )}

        {!cargando && tab === "ia" && (
          <div className="space-y-4">
            <ContextBanner variant="warning">
              Los cambios en esta sección afectan <strong>todas las lecturas generadas desde ahora</strong>.
              Probá los nuevos parámetros en el Laboratorio (Sprint 4) antes de modificar en producción.
            </ContextBanner>
            <ConfigGrupo
              titulo="Parámetros de Inteligencia Artificial"
              campos={GRUPOS_IA}
              configMap={configMap}
              onSave={saveConfigGroup}
              requireConfirm={true}
            />
            {promptCfg && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800/60">
                  <span className="text-sm font-semibold text-gray-200">Override IA por producto</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Si están vacíos, se usan los valores de la sección anterior. Editar el prompt completo en{" "}
                    <a href="/admin/tarot/product-intelligence/prompt" className="text-amber-400 hover:underline">Prompt</a>.
                  </p>
                </div>
                <div className="divide-y divide-gray-800/40 px-4">
                  {[
                    { label: "Modelo override",      value: promptCfg.ia_modelo ?? "(usa global)" },
                    { label: "Max tokens override",  value: promptCfg.ia_max_tokens?.toString() ?? "(usa global)" },
                    { label: "Temperatura override", value: promptCfg.ia_temperatura?.toString() ?? "(usa global)" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center gap-3 py-2.5">
                      <span className="w-52 text-xs text-gray-400">{label}</span>
                      <span className="text-sm font-mono text-gray-300">{value}</span>
                    </div>
                  ))}
                </div>
                <p className="px-4 py-2 text-xs text-gray-700">
                  Última actualización del prompt: {fmt(promptCfg.updated_at)}
                </p>
              </div>
            )}
          </div>
        )}

        {!cargando && tab === "output" && (
          <div className="space-y-4">
            <ContextBanner variant="warning">
              Los límites de palabras afectan la longitud del PDF generado. Cambios excesivos pueden truncar el contenido o causar inconsistencias.
            </ContextBanner>
            <OutputLimitsCard cfg={promptCfg} onSave={savePromptConfig} />
          </div>
        )}

        {!cargando && tab === "entrega" && (
          <div className="space-y-4">
            <ContextBanner variant="info">
              Configuración de canales de entrega. El modo <strong>production</strong> de WhatsApp y MercadoPago activa cobros y envíos reales.
            </ContextBanner>
            <ConfigGrupo
              titulo="Canales de entrega"
              campos={GRUPOS_ENTREGA}
              configMap={configMap}
              onSave={saveConfigGroup}
            />
            {envStatus && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800/60">
                  <span className="text-sm font-semibold text-gray-200">Estado de integración WhatsApp</span>
                </div>
                {envStatus.ef_unreachable ? (
                  <p className="px-4 py-3 text-xs text-amber-400">
                    No se pudo consultar el estado de los secrets (EF no alcanzable).
                  </p>
                ) : (
                  <div className="divide-y divide-gray-800/40">
                    {[
                      { label: "WHATSAPP_TOKEN", ok: envStatus.whatsapp_token_configurado },
                      { label: "WHATSAPP_PHONE_NUMBER_ID", ok: envStatus.whatsapp_phone_id_configurado },
                    ].map(({ label, ok }) => (
                      <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-64 text-xs text-gray-400">{label}</span>
                        <span className={`text-xs font-mono ${ok ? "text-emerald-400" : "text-red-400"}`}>
                          {ok ? "✓ Configurado" : "✗ No detectado"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!cargando && tab === "no_editables" && (
          <div className="space-y-4">
            <ContextBanner variant="readonly">
              Estas variables son secrets de servidor. No se pueden editar desde el panel por razones de seguridad.
              Para modificarlas usá <code className="text-xs bg-gray-800 px-1 rounded">supabase secrets set</code> en la CLI.
            </ContextBanner>
            <div className="rounded-xl border border-gray-800/40 bg-gray-900/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800/40">
                <span className="text-sm font-semibold text-gray-500">Variables no editables desde el panel</span>
              </div>
              <div className="divide-y divide-gray-800/30">
                {[
                  { label: "WHATSAPP_TOKEN",            estado: "secret" },
                  { label: "WHATSAPP_PHONE_NUMBER_ID",  estado: "secret" },
                  { label: "SUPABASE_SECRET_KEY",       estado: "secret" },
                  { label: "TAROT_INTERNAL_KEY",        estado: "secret" },
                  { label: "ANTHROPIC_API_KEY",         estado: "secret" },
                  { label: "MP_ACCESS_TOKEN",           estado: "secret" },
                  { label: "MP_WEBHOOK_SECRET",         estado: "secret" },
                ].map(({ label, estado }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-64 text-xs font-mono text-gray-600">{label}</span>
                    <span className="text-xs bg-gray-800/60 text-gray-600 px-2 py-0.5 rounded">
                      {estado}
                    </span>
                  </div>
                ))}
              </div>
              <p className="px-4 py-2 text-xs text-gray-700">
                Ninguno de estos valores está almacenado en la base de datos ni se expone al navegador.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
