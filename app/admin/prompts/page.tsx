"use client";
import { useState, useEffect } from "react";
import {
  LogOut,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Save,
  Info,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";

// ===========================================================================
// Types
// ===========================================================================

interface Plantilla {
  id: number;
  nombre: string;
  descripcion: string | null;
  contenido: string;
  creado_en: string | null;
  activo: boolean | null;
}

interface ApiResponse {
  ok: boolean;
  plantillas?: Plantilla[];
  motivo?: string;
}

// ===========================================================================
// Helpers
// ===========================================================================

const PROMPT_META: Record<string, { label: string; descripcion: string; variables: string[] }> = {
  prompt_contenido_premium: {
    label: "Prompt diario (Lun–Sáb)",
    descripcion:
      "Prompt principal para generar el horóscopo diario personalizado. Se ejecuta cada día de lunes a sábado para cada suscriptor activo.",
    variables: ["{{nombre}}", "{{signo}}", "{{fecha}}", "{{emocion_dominante}}", "{{contenido_preferido}}", "{{color}}", "{{numero}}"],
  },
  prompt_contenido_premium_domingo: {
    label: "Prompt domingo",
    descripcion:
      "Prompt especial del domingo. Genera balance semanal, intención, ritual y cierre inspirador. Se ejecuta cada domingo.",
    variables: ["{{nombre}}", "{{signo}}", "{{fecha}}", "{{emocion_dominante}}", "{{contenido_preferido}}"],
  },
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-UY", {
      timeZone: "America/Montevideo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

// ===========================================================================
// PromptEditor — card individual por plantilla
// ===========================================================================

function PromptEditor({
  plantilla,
  onSaved,
}: {
  plantilla: Plantilla;
  onSaved: () => void;
}) {
  const meta = PROMPT_META[plantilla.nombre];
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(plantilla.contenido);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [modificado, setModificado] = useState(false);

  function handleChange(v: string) {
    setTexto(v);
    setModificado(v !== plantilla.contenido);
    setErrorMsg(null);
    setSuccessMsg(null);
  }

  function handleReset() {
    setTexto(plantilla.contenido);
    setModificado(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  }

  async function guardar() {
    if (!texto.trim()) {
      setErrorMsg("El prompt no puede estar vacío");
      return;
    }
    setGuardando(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/admin/plantillas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: plantilla.nombre, contenido: texto }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErrorMsg(json.motivo ?? "Error al guardar");
      } else {
        setSuccessMsg("Guardado correctamente");
        setModificado(false);
        onSaved();
      }
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setGuardando(false);
    }
  }

  const charCount = texto.length;

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-colors ${
        modificado
          ? "border-violet-600/50"
          : "border-gray-800"
      } bg-gray-900/60`}
    >
      {/* Header */}
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-gray-900/80 transition-colors"
      >
        <div className="text-left flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-sm font-semibold text-gray-100">
              {meta?.label ?? plantilla.nombre}
            </span>
            {modificado && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/60 text-violet-300 border border-violet-700/40">
                sin guardar
              </span>
            )}
            {!plantilla.activo && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">
                inactivo
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono">{plantilla.nombre}</p>
          {plantilla.descripcion && (
            <p className="text-xs text-gray-600 mt-1">{plantilla.descripcion}</p>
          )}
        </div>
        <span className="text-gray-600 shrink-0">
          {abierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Body */}
      {abierto && (
        <div className="border-t border-gray-800 px-5 pb-5 pt-4 space-y-4">
          {/* Variables disponibles */}
          {meta?.variables && meta.variables.length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Info size={12} className="text-violet-400" />
                <span className="text-xs text-violet-400 font-medium">Variables disponibles</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {meta.variables.map((v) => (
                  <code
                    key={v}
                    className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-amber-300/80"
                  >
                    {v}
                  </code>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {meta.descripcion}
              </p>
            </div>
          )}

          {/* Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-400">Contenido del prompt</label>
              <span className="text-xs text-gray-600">{charCount.toLocaleString()} caracteres</span>
            </div>
            <textarea
              value={texto}
              onChange={(e) => handleChange(e.target.value)}
              rows={18}
              spellCheck={false}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 resize-y font-mono leading-relaxed"
            />
          </div>

          {/* Feedback */}
          {errorMsg && (
            <div className="flex items-center gap-2 text-xs text-red-300">
              <AlertCircle size={13} className="shrink-0" />
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle2 size={13} className="shrink-0" />
              {successMsg}
            </div>
          )}

          {/* Metadata */}
          {plantilla.creado_en && (
            <p className="text-xs text-gray-700">Creado: {fmtDate(plantilla.creado_en)}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={guardar}
              disabled={guardando || !modificado || !texto.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs text-white font-medium transition-colors"
            >
              <Save size={13} />
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
            {modificado && (
              <button
                onClick={handleReset}
                disabled={guardando}
                className="px-4 py-2 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Descartar cambios
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================

export default function PromptsPage() {
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);

  async function cargar() {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/plantillas");
      const json: ApiResponse = await res.json();
      if (!json.ok) {
        setErrorMsg(json.motivo ?? "Error al cargar plantillas");
      } else {
        const soloIA = (json.plantillas ?? []).filter((p) =>
          p.nombre.startsWith("prompt_")
        );
        setPlantillas(soloIA);
      }
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function cerrarSesion() {
    setCerrandoSesion(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
      window.location.href = "/admin/login";
    } catch {
      setCerrandoSesion(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <AdminPanelSwitcher current="thc" />
          <button
            onClick={cerrarSesion}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <LogOut size={13} />
            {cerrandoSesion ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <AdminNav current="/admin/prompts" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Prompts de IA</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Editá los prompts que OpenAI usa para generar el contenido de cada suscriptor.
              Los cambios se aplican en la próxima ejecución del cron.
            </p>
          </div>
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-3 py-2 hover:border-gray-600 transition-colors"
          >
            <RefreshCw size={12} className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        {/* Loading */}
        {cargando && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 text-sm text-gray-400">
            <span className="animate-pulse">Cargando prompts…</span>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            <AlertCircle size={14} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Prompts */}
        {!cargando && !errorMsg && (
          <div className="space-y-4">
            {plantillas.length === 0 && (
              <div className="text-center py-10 text-gray-600 text-sm">
                No se encontraron prompts en la tabla plantillas.
              </div>
            )}
            {plantillas.map((p) => (
              <PromptEditor key={p.id} plantilla={p} onSaved={cargar} />
            ))}
          </div>
        )}

        {/* Info box */}
        {!cargando && plantillas.length > 0 && (
          <div className="mt-6 rounded-xl border border-gray-800/50 bg-gray-900/40 px-5 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Notas operacionales
            </p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li>• Los cambios se aplican en la <strong className="text-gray-500">próxima ejecución del cron</strong> — no afectan generaciones en curso.</li>
              <li>• El costo estimado de cada generación se guarda en <code className="font-mono text-gray-500">contenido_premium.costo_estimado</code> (USD).</li>
              <li>• Los tokens consumidos quedan en <code className="font-mono text-gray-500">tokens_input</code> y <code className="font-mono text-gray-500">tokens_output</code>.</li>
              <li>• El modelo activo (<code className="font-mono text-gray-500">OPENAI_MODEL</code>) se configura como variable de entorno en las Edge Functions — actualmente <code className="font-mono text-gray-500">gpt-4o-mini</code>.</li>
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
