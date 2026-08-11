"use client";
import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical, Loader2, AlertCircle, Check, RefreshCw,
  ChevronDown, Shuffle, BarChart3, SplitSquareHorizontal,
} from "lucide-react";
import { PIABreadcrumb } from "@/components/admin/product-intelligence/PIABreadcrumb";
import { ContextBanner } from "@/components/admin/product-intelligence/ContextBanner";
import { NarrativeReviewForm, type NarrativeReview } from "@/components/admin/product-intelligence/NarrativeReviewForm";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type CartaLab = {
  id: string;
  nombre_es: string;
  significado_normal: string;
  significado_invertido: string;
  keywords: string[];
  invertida: boolean;
  posicion_numero: number;
  posicion_nombre: string;
  posicion_descripcion: string;
};

type LabResult = {
  ok: true;
  id: string | null;
  cartas: CartaLab[];
  contenido_json: Record<string, unknown>;
  prompt_version_id: string | null;
  prompt_version_label: string;
  prompt_modo: string;
  ia_modelo: string;
  ia_temperatura: number;
  ia_max_tokens: number;
  ia_tokens_entrada: number;
  ia_tokens_salida: number;
  ia_costo_usd: number;
  tiempo_ms: number;
};

type LabConfig = {
  config: {
    id: string;
    ia_modelo: string | null;
    ia_temperatura: number | null;
    ia_max_tokens: number | null;
    current_prompt_version_id: string | null;
  } | null;
  posiciones: Array<{ numero: number; nombre: string; descripcion: string }>;
  mazo: { id: string; nombre: string } | null;
  versions: Array<{ id: string; label: string; created_at: string }>;
  defaults: { ia_modelo: string; ia_temperatura: number; ia_max_tokens: number };
  anthropic_disponible: boolean;
};

type Consultante = {
  nombre: string;
  fecha_nacimiento: string;
  hora_nacimiento: string;
  lugar_nacimiento: string;
  tema: string;
  pregunta: string;
};

type TabPrincipal = "simple" | "comparar";
type PromptModo = "activo" | "historico" | "manual";

const TEMAS = [
  "Amor y relaciones",
  "Trabajo y carrera",
  "Finanzas",
  "Salud",
  "Familia",
  "Espiritualidad",
  "Decisión importante",
  "Tirada general",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `USD $${n.toFixed(4)}`;
}

function fmtMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function calcCostoEstimado(modelo: string, maxTokens: number): string {
  const inEst = 1500;
  const outEst = Math.min(maxTokens, 1800);
  let inPrecio = 3.0, outPrecio = 15.0;
  if (modelo.includes("haiku")) { inPrecio = 0.25; outPrecio = 1.25; }
  if (modelo.includes("opus")) { inPrecio = 15.0; outPrecio = 75.0; }
  const cost = (inEst / 1e6) * inPrecio + (outEst / 1e6) * outPrecio;
  return `~USD $${cost.toFixed(4)}`;
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function InputCls() {
  return "bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 w-full";
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800/60">
        <span className="text-sm font-semibold text-gray-200">{title}</span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function ResultPanel({ result, lecturaId }: { result: LabResult; lecturaId?: string }) {
  const cj = result.contenido_json;
  const cartas = Array.isArray(cj.cartas) ? cj.cartas as Array<Record<string, string>> : [];
  const proxPasos = Array.isArray(cj.proximos_pasos) ? cj.proximos_pasos as string[] : [];

  const fakeReview: NarrativeReview | null = lecturaId
    ? { lectura_id: lecturaId }
    : null;

  return (
    <div className="space-y-4">
      {/* Meta */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-gray-500">Prompt</p>
            <p className="text-gray-300 font-mono">{result.prompt_version_label}</p>
          </div>
          <div>
            <p className="text-gray-500">Modelo</p>
            <p className="text-gray-300 font-mono">{result.ia_modelo}</p>
          </div>
          <div>
            <p className="text-gray-500">Tokens entrada / salida</p>
            <p className="text-gray-300 font-mono">{result.ia_tokens_entrada.toLocaleString()} / {result.ia_tokens_salida.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-500">Costo real / Tiempo</p>
            <p className="text-gray-300 font-mono">{fmt$(result.ia_costo_usd)} · {fmtMs(result.tiempo_ms)}</p>
          </div>
        </div>
      </div>

      {/* Cartas */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800/60">
          <span className="text-sm font-semibold text-gray-200">Cartas ({result.cartas.length})</span>
        </div>
        <div className="divide-y divide-gray-800/30">
          {result.cartas.map((c, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2">
              <span className="text-xs text-gray-600 w-6 text-center">{c.posicion_numero}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 truncate">{c.posicion_nombre}</p>
                <p className="text-sm text-gray-200">{c.nombre_es}</p>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded ${c.invertida ? "bg-amber-900/40 text-amber-400" : "bg-gray-800 text-gray-500"}`}>
                {c.invertida ? "invertida" : "normal"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Descripción general */}
      {!!cj.descripcion_general_tirada && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Descripción general</p>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{String(cj.descripcion_general_tirada)}</p>
        </div>
      )}

      {/* Interpretaciones */}
      {cartas.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800/60">
            <span className="text-sm font-semibold text-gray-200">Interpretaciones</span>
          </div>
          <div className="divide-y divide-gray-800/30">
            {cartas.map((c, i) => (
              <div key={i} className="px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">{c.nombre_posicion} — {c.nombre_carta} {c.orientacion === "invertida" ? "(inv.)" : ""}</p>
                <p className="text-sm text-gray-300 leading-relaxed">{c.interpretacion}</p>
                {c.consejo && <p className="text-xs text-amber-300/70 mt-1.5 italic">{c.consejo}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumen */}
      {!!cj.resumen_lectura && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Resumen</p>
          <p className="text-sm text-gray-300 leading-relaxed">{String(cj.resumen_lectura)}</p>
        </div>
      )}

      {/* Mensaje final */}
      {!!cj.mensaje_final && (
        <div className="rounded-xl border border-amber-800/30 bg-amber-950/20 p-4">
          <p className="text-xs text-amber-600 uppercase tracking-wider mb-2">Mensaje final</p>
          <p className="text-sm text-amber-200 leading-relaxed font-medium">{String(cj.mensaje_final)}</p>
        </div>
      )}

      {/* Próximos pasos */}
      {proxPasos.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Próximos pasos</p>
          <ol className="space-y-1 list-decimal list-inside">
            {proxPasos.map((p, i) => (
              <li key={i} className="text-sm text-gray-300">{p}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Narrative Review — solo si fue guardada */}
      {lecturaId && (
        <NarrativeReviewForm
          lecturaId={lecturaId}
          existing={fakeReview}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LaboratorioPage() {
  const [config, setConfig] = useState<LabConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [tab, setTab] = useState<TabPrincipal>("simple");

  // Consultante
  const [consultante, setConsultante] = useState<Consultante>({
    nombre: "", fecha_nacimiento: "", hora_nacimiento: "",
    lugar_nacimiento: "", tema: "Tirada general", pregunta: "",
  });

  // Prompt
  const [promptModo, setPromptModo] = useState<PromptModo>("activo");
  const [promptVersionId, setPromptVersionId] = useState("");
  const [promptSistema, setPromptSistema] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");

  // Compare — versión B
  const [promptVersionIdB, setPromptVersionIdB] = useState("");

  // Config IA
  const [iaModelo, setIaModelo] = useState("claude-sonnet-4-6");
  const [iaTemperatura, setIaTemperatura] = useState(0.8);
  const [iaMaxTokens, setIaMaxTokens] = useState(4000);

  // Estado de generación
  const [generando, setGenerando] = useState(false);
  const [generandoB, setGenerandoB] = useState(false);
  const [result, setResult] = useState<LabResult | null>(null);
  const [resultB, setResultB] = useState<LabResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Carga de config ─────────────────────────────────────────────────────────

  const cargarConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await fetch("/api/admin/tarot/product-intelligence/laboratorio/config");
      const d = await res.json();
      if (d.ok) {
        setConfig(d);
        if (d.defaults) {
          setIaModelo(d.defaults.ia_modelo);
          setIaTemperatura(d.defaults.ia_temperatura);
          setIaMaxTokens(d.defaults.ia_max_tokens);
        }
      }
    } catch { /* silent */ }
    finally { setLoadingConfig(false); }
  }, []);

  useEffect(() => { cargarConfig(); }, [cargarConfig]);

  // ── Generar lectura ─────────────────────────────────────────────────────────

  async function generar(modo?: "b") {
    const esB = modo === "b";
    if (esB) setGenerandoB(true); else setGenerando(true);
    setError(null);

    const cartasParaB = result?.cartas;

    const body: Record<string, unknown> = {
      consultante: {
        nombre: consultante.nombre,
        fecha_nacimiento: consultante.fecha_nacimiento,
        hora_nacimiento: consultante.hora_nacimiento || undefined,
        lugar_nacimiento: consultante.lugar_nacimiento || undefined,
        tema: consultante.tema,
        pregunta: consultante.pregunta,
      },
      prompt_modo: esB ? "historico" : promptModo,
      prompt_version_id: esB ? promptVersionIdB || undefined : (promptModo === "historico" ? promptVersionId || undefined : undefined),
      prompt_sistema: promptModo === "manual" && !esB ? promptSistema : undefined,
      prompt_usuario_template: promptModo === "manual" && !esB ? promptTemplate : undefined,
      ia_modelo: iaModelo,
      ia_temperatura: iaTemperatura,
      ia_max_tokens: iaMaxTokens,
      cartas: esB && cartasParaB ? cartasParaB : undefined,
      guardar: true,
    };

    try {
      const res = await fetch("/api/admin/tarot/product-intelligence/laboratorio/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        if (esB) setResultB(data as LabResult);
        else { setResult(data as LabResult); setResultB(null); }
      } else {
        setError(data.motivo ?? "Error al generar");
      }
    } catch {
      setError("Error de red");
    } finally {
      if (esB) setGenerandoB(false); else setGenerando(false);
    }
  }

  function resetForm() {
    setResult(null); setResultB(null); setError(null);
  }

  // ── Validación básica ───────────────────────────────────────────────────────

  const formValido =
    consultante.nombre.trim().length > 0 &&
    consultante.fecha_nacimiento.trim().length > 0 &&
    consultante.pregunta.trim().length > 0;

  const costoEstimado = calcCostoEstimado(iaModelo, iaMaxTokens);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <PIABreadcrumb segments={[
          { label: "Product Intelligence", href: "/admin/tarot/product-intelligence" },
          { label: "Laboratorio" },
        ]} />
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical size={18} className="text-violet-400" />
            <h1 className="text-base font-semibold text-white">Laboratorio</h1>
            <span className="text-xs text-gray-600">Pruebas sin impacto en producción</span>
          </div>
          {!loadingConfig && config && !config.anthropic_disponible && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle size={12} /> ANTHROPIC_API_KEY no encontrada en servidor
            </span>
          )}
        </div>
        {/* Sub-tabs */}
        <div className="mt-3 flex gap-0 border-b border-gray-800 -mb-px">
          <button
            onClick={() => setTab("simple")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${tab === "simple" ? "border-violet-500 text-violet-300" : "border-transparent text-gray-500 hover:text-gray-300"}`}
          >
            <FlaskConical size={13} /> Experimento simple
          </button>
          <button
            onClick={() => setTab("comparar")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${tab === "comparar" ? "border-violet-500 text-violet-300" : "border-transparent text-gray-500 hover:text-gray-300"}`}
          >
            <SplitSquareHorizontal size={13} /> Comparar versiones
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* ── Aviso de aislamiento ─────────────────────────────────────── */}
        <ContextBanner variant="info">
          El Laboratorio llama a la API real de Anthropic (costo estimado: {costoEstimado}/lectura) pero <strong>no crea órdenes, no genera PDF, no envía WhatsApp</strong>.
          Las lecturas se guardan en <code className="text-xs bg-gray-800 px-1 rounded">tarot_lecturas_laboratorio</code>.
        </ContextBanner>

        <div className="mt-6">
          {tab === "simple" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* ── Panel de configuración ──────────────────────────────── */}
              <div className="space-y-4">
                {/* Consultante */}
                <SectionCard title="Consultante simulado">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Nombre *</label>
                      <input
                        className={InputCls()}
                        value={consultante.nombre}
                        onChange={(e) => setConsultante({ ...consultante, nombre: e.target.value })}
                        placeholder="María"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Fecha de nacimiento *</label>
                      <input
                        type="date"
                        className={InputCls()}
                        value={consultante.fecha_nacimiento}
                        onChange={(e) => setConsultante({ ...consultante, fecha_nacimiento: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Hora de nac. <span className="text-gray-600">(opcional)</span></label>
                      <input
                        type="time"
                        className={InputCls()}
                        value={consultante.hora_nacimiento}
                        onChange={(e) => setConsultante({ ...consultante, hora_nacimiento: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Lugar de nac. <span className="text-gray-600">(opcional)</span></label>
                      <input
                        className={InputCls()}
                        value={consultante.lugar_nacimiento}
                        onChange={(e) => setConsultante({ ...consultante, lugar_nacimiento: e.target.value })}
                        placeholder="Montevideo"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Tema *</label>
                    <select
                      className={InputCls()}
                      value={consultante.tema}
                      onChange={(e) => setConsultante({ ...consultante, tema: e.target.value })}
                    >
                      {TEMAS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Pregunta *</label>
                    <textarea
                      rows={3}
                      className={InputCls()}
                      value={consultante.pregunta}
                      onChange={(e) => setConsultante({ ...consultante, pregunta: e.target.value })}
                      placeholder="¿Qué me depara el camino en…?"
                    />
                  </div>
                </SectionCard>

                {/* Prompt selector */}
                <SectionCard title="Prompt a usar">
                  <div className="flex gap-2 flex-wrap">
                    {(["activo", "historico", "manual"] as PromptModo[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setPromptModo(m)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${promptModo === m ? "bg-violet-900/50 border-violet-700 text-violet-300" : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"}`}
                      >
                        {m === "activo" ? "Versión activa" : m === "historico" ? "Versión histórica" : "Texto manual"}
                      </button>
                    ))}
                  </div>
                  {promptModo === "historico" && (
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Versión</label>
                      <select
                        className={InputCls()}
                        value={promptVersionId}
                        onChange={(e) => setPromptVersionId(e.target.value)}
                      >
                        <option value="">— Seleccionar —</option>
                        {(config?.versions ?? []).map((v) => (
                          <option key={v.id} value={v.id}>{v.label} ({new Date(v.created_at).toLocaleDateString("es-UY")})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {promptModo === "manual" && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Prompt sistema</label>
                        <textarea rows={4} className={InputCls()} value={promptSistema} onChange={(e) => setPromptSistema(e.target.value)} placeholder="Sos un tarotista…" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Prompt usuario (template)</label>
                        <textarea rows={4} className={InputCls()} value={promptTemplate} onChange={(e) => setPromptTemplate(e.target.value)} placeholder="Realizá una lectura para {{nombre}}…" />
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-600">
                    {promptModo === "activo" ? "Usa los prompts de tarot_producto_config activa." :
                     promptModo === "historico" ? "Usa el texto de esa versión guardada, sin alterar el activo." :
                     "Texto libre — ideal para probar variantes antes de guardar."}
                  </p>
                </SectionCard>

                {/* Config IA */}
                <SectionCard title="Configuración IA">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Modelo</label>
                    <input
                      className={InputCls()}
                      value={iaModelo}
                      onChange={(e) => setIaModelo(e.target.value)}
                      placeholder="claude-sonnet-4-6"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Temperatura (0–1)</label>
                      <input
                        type="number" min={0} max={1} step={0.05}
                        className={InputCls()}
                        value={iaTemperatura}
                        onChange={(e) => setIaTemperatura(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Max tokens</label>
                      <input
                        type="number" min={500} max={16000} step={100}
                        className={InputCls()}
                        value={iaMaxTokens}
                        onChange={(e) => setIaMaxTokens(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">Costo estimado: <span className="text-amber-400">{costoEstimado}</span></p>
                </SectionCard>

                {/* Acciones */}
                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                    <AlertCircle size={14} className="shrink-0" /> {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => generar()}
                    disabled={generando || !formValido}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    {generando
                      ? <><Loader2 size={14} className="animate-spin" /> Generando…</>
                      : <><Shuffle size={14} /> Generar lectura</>
                    }
                  </button>
                  {result && (
                    <button
                      onClick={resetForm}
                      className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors"
                    >
                      <RefreshCw size={13} /> Nueva
                    </button>
                  )}
                </div>

                {!formValido && (
                  <p className="text-xs text-gray-600">Completá nombre, fecha y pregunta para generar.</p>
                )}
              </div>

              {/* ── Panel de resultado ──────────────────────────────────── */}
              <div>
                {!result && !generando && (
                  <div className="h-64 rounded-xl border border-dashed border-gray-800 flex items-center justify-center">
                    <div className="text-center">
                      <FlaskConical size={28} className="text-gray-700 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">El resultado aparecerá aquí</p>
                      <p className="text-xs text-gray-700 mt-1">Completá el formulario y generá una lectura</p>
                    </div>
                  </div>
                )}
                {generando && (
                  <div className="h-64 rounded-xl border border-gray-800 flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 size={28} className="text-violet-500 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Generando lectura…</p>
                      <p className="text-xs text-gray-600 mt-1">Llamando a la API de Anthropic</p>
                    </div>
                  </div>
                )}
                {!generando && result && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Check size={14} className="text-emerald-400" />
                      <span className="text-xs text-emerald-400">Lectura generada{result.id ? ` — guardada (${result.id.slice(0, 8)}…)` : ""}</span>
                    </div>
                    <ResultPanel result={result} lecturaId={result.id ?? undefined} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── COMPARAR TAB ────────────────────────────────────────────── */}
          {tab === "comparar" && (
            <div className="space-y-6">
              <ContextBanner variant="info">
                Mismo consultante, mismas cartas — dos versiones de Prompt diferentes.
                Generá primero la Versión A, luego seleccioná la Versión B y generá.
                Las cartas de A se reutilizan automáticamente en B.
              </ContextBanner>

              {/* Consultante compartido */}
              <SectionCard title="Consultante (compartido para A y B)">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Nombre *</label>
                    <input className={InputCls()} value={consultante.nombre} onChange={(e) => setConsultante({ ...consultante, nombre: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Fecha de nacimiento *</label>
                    <input type="date" className={InputCls()} value={consultante.fecha_nacimiento} onChange={(e) => setConsultante({ ...consultante, fecha_nacimiento: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Tema</label>
                  <select className={InputCls()} value={consultante.tema} onChange={(e) => setConsultante({ ...consultante, tema: e.target.value })}>
                    {TEMAS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Pregunta *</label>
                  <textarea rows={2} className={InputCls()} value={consultante.pregunta} onChange={(e) => setConsultante({ ...consultante, pregunta: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Temperatura</label>
                    <input type="number" min={0} max={1} step={0.05} className={InputCls()} value={iaTemperatura} onChange={(e) => setIaTemperatura(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Modelo</label>
                    <input className={InputCls()} value={iaModelo} onChange={(e) => setIaModelo(e.target.value)} />
                  </div>
                </div>
              </SectionCard>

              {/* Dos versiones lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Versión A */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-emerald-400 bg-emerald-900/30 border border-emerald-800/50 px-2 py-0.5 rounded">Versión A</span>
                    <span className="text-xs text-gray-500">Prompt activo</span>
                  </div>
                  {error && !resultB && (
                    <div className="flex items-center gap-2 text-xs text-red-400">
                      <AlertCircle size={12} /> {error}
                    </div>
                  )}
                  <button
                    onClick={() => { setPromptModo("activo"); generar(); }}
                    disabled={generando || !formValido}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium transition-colors w-full justify-center"
                  >
                    {generando ? <><Loader2 size={13} className="animate-spin" /> Generando A…</> : <><Shuffle size={13} /> Generar con versión activa</>}
                  </button>
                  {!result && !generando && (
                    <div className="h-40 rounded-xl border border-dashed border-gray-800 flex items-center justify-center">
                      <p className="text-xs text-gray-600">Resultado A aparecerá aquí</p>
                    </div>
                  )}
                  {generando && !result && (
                    <div className="h-40 rounded-xl border border-gray-800 flex items-center justify-center">
                      <Loader2 size={20} className="text-emerald-500 animate-spin" />
                    </div>
                  )}
                  {result && <ResultPanel result={result} />}
                </div>

                {/* Versión B */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-violet-400 bg-violet-900/30 border border-violet-800/50 px-2 py-0.5 rounded">Versión B</span>
                    <span className="text-xs text-gray-500">Versión histórica</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Seleccionar versión</label>
                    <select
                      className={InputCls()}
                      value={promptVersionIdB}
                      onChange={(e) => setPromptVersionIdB(e.target.value)}
                    >
                      <option value="">— Seleccionar versión —</option>
                      {(config?.versions ?? []).map((v) => (
                        <option key={v.id} value={v.id}>{v.label} ({new Date(v.created_at).toLocaleDateString("es-UY")})</option>
                      ))}
                    </select>
                  </div>
                  {!result && (
                    <p className="text-xs text-gray-600">Generá primero la Versión A para reutilizar las mismas cartas.</p>
                  )}
                  <button
                    onClick={() => generar("b")}
                    disabled={generandoB || !formValido || !promptVersionIdB || !result}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-800 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-medium transition-colors w-full justify-center"
                  >
                    {generandoB ? <><Loader2 size={13} className="animate-spin" /> Generando B…</> : <><SplitSquareHorizontal size={13} /> Comparar con esta versión</>}
                  </button>
                  {!resultB && !generandoB && (
                    <div className="h-40 rounded-xl border border-dashed border-gray-800 flex items-center justify-center">
                      <p className="text-xs text-gray-600">Resultado B aparecerá aquí</p>
                    </div>
                  )}
                  {generandoB && (
                    <div className="h-40 rounded-xl border border-gray-800 flex items-center justify-center">
                      <Loader2 size={20} className="text-violet-500 animate-spin" />
                    </div>
                  )}
                  {resultB && <ResultPanel result={resultB} />}
                </div>
              </div>

              {/* Meta comparación */}
              {result && resultB && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
                    <BarChart3 size={12} className="inline mr-1" /> Comparación de costos y tokens
                  </p>
                  <div className="grid grid-cols-3 gap-4 text-center text-xs">
                    {[
                      { label: "Costo real", a: fmt$(result.ia_costo_usd), b: fmt$(resultB.ia_costo_usd) },
                      { label: "Tokens salida", a: result.ia_tokens_salida.toLocaleString(), b: resultB.ia_tokens_salida.toLocaleString() },
                      { label: "Tiempo", a: fmtMs(result.tiempo_ms), b: fmtMs(resultB.tiempo_ms) },
                    ].map(({ label, a, b }) => (
                      <div key={label}>
                        <p className="text-gray-500 mb-1">{label}</p>
                        <p className="text-emerald-400">A: {a}</p>
                        <p className="text-violet-400">B: {b}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
