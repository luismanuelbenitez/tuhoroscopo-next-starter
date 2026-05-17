"use client";
import { useState, useEffect } from "react";
import {
  MessageCircle,
  LogOut,
  RefreshCw,
  AlertCircle,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Lock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";

// ===========================================================================
// Types
// ===========================================================================

interface ConfigRow {
  id: string;
  nombre: string;
  valor: string;
  es_sensible: boolean;
  created_at: string | null;
  editable: boolean;
}

interface Configuracion {
  id: string;
  whatsapp_token_app: string;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_id: string | null;
  nombre_plantilla: string | null;
  url_webhook_premium: string | null;
  url_webhook_gratis: string | null;
  link_pago_premium: string | null;
  precio_actual: number | null;
  version_flujo: string | null;
  admin_contacto: string | null;
}

interface ApiResponse {
  ok: boolean;
  config?: ConfigRow[];
  configuracion?: Configuracion | null;
  warnings?: string[];
  nota?: string;
  motivo?: string;
  detalle?: string;
}

interface AcResponse {
  ok: boolean;
  clave?: string;
  valor_anterior?: string;
  valor_nuevo?: string;
  mensaje?: string;
  motivo?: string;
  detalle?: string;
}

// ===========================================================================
// Helpers
// ===========================================================================

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", {
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
// Toggle panel for APP_DEBUG_MODE
// ===========================================================================

function DebugModeToggle({
  row,
  onOk,
}: {
  row: ConfigRow;
  onOk: () => void;
}) {
  const isOn = row.valor.toLowerCase() === "true";
  const [confirmando, setConfirmando] = useState(false);
  const [pendingValor, setPendingValor] = useState<"true" | "false">("false");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function iniciarToggle(nuevoValor: "true" | "false") {
    setPendingValor(nuevoValor);
    setMotivo("");
    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmando(true);
  }

  function cancelar() {
    setConfirmando(false);
    setMotivo("");
    setErrorMsg(null);
  }

  async function confirmar() {
    if (motivo.trim().length < 5) {
      setErrorMsg("El motivo debe tener al menos 5 caracteres");
      return;
    }
    setGuardando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/config/accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: "APP_DEBUG_MODE", valor: pendingValor, motivo: motivo.trim() }),
      });
      const json: AcResponse = await res.json();
      if (!json.ok) {
        setErrorMsg(json.detalle ?? json.motivo ?? "Error al guardar");
      } else {
        setSuccessMsg(json.mensaje ?? "Actualizado");
        setConfirmando(false);
        setMotivo("");
        onOk();
      }
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => iniciarToggle(isOn ? "false" : "true")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
            isOn
              ? "border-green-700/60 bg-green-950/40 text-green-300 hover:bg-green-950/60"
              : "border-gray-700/60 bg-gray-800/60 text-gray-400 hover:bg-gray-800"
          }`}
        >
          {isOn ? (
            <ToggleRight size={16} className="text-green-400" />
          ) : (
            <ToggleLeft size={16} className="text-gray-500" />
          )}
          {isOn ? "ON" : "OFF"}
        </button>
        <span className="text-xs text-gray-500">
          Actualmente: <span className={isOn ? "text-green-400 font-semibold" : "text-gray-500"}>{row.valor}</span>
        </span>
      </div>

      {successMsg && (
        <p className="mt-2 text-xs text-green-400">{successMsg}</p>
      )}

      {confirmando && (
        <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 space-y-3">
          <p className="text-xs text-amber-300 font-semibold">
            Confirmar cambio: APP_DEBUG_MODE → <span className="font-mono">{pendingValor}</span>
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Motivo <span className="text-gray-600">(mínimo 5 caracteres)</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="ej: activar debug para diagnóstico de sender"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 resize-none"
            />
          </div>
          {errorMsg && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle size={12} /> {errorMsg}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={confirmar}
              disabled={guardando || motivo.trim().length < 5}
              className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-xs text-white font-medium transition-colors"
            >
              {guardando ? "Guardando…" : "Confirmar"}
            </button>
            <button
              onClick={cancelar}
              disabled={guardando}
              className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Configuracion section (read-only structured)
// ===========================================================================

const CONFIGURACION_LABELS: Record<string, string> = {
  whatsapp_phone_number_id: "WA Phone Number ID",
  whatsapp_business_id: "WA Business ID",
  nombre_plantilla: "Plantilla WhatsApp",
  url_webhook_premium: "Webhook Premium",
  url_webhook_gratis: "Webhook Gratis",
  link_pago_premium: "Link de pago premium",
  precio_actual: "Precio actual",
  version_flujo: "Versión de flujo",
  admin_contacto: "Contacto admin",
};

function ConfiguracionPanel({ cfg }: { cfg: Configuracion }) {
  const [expanded, setExpanded] = useState(false);

  const fields = Object.entries(CONFIGURACION_LABELS).map(([key, label]) => ({
    key,
    label,
    value: cfg[key as keyof Configuracion],
  }));

  const visible = expanded ? fields : fields.slice(0, 4);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-800/60 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-200">public.configuracion</p>
          <p className="text-xs text-gray-600 mt-0.5">Fila única. Solo lectura desde el panel.</p>
        </div>
        <Lock size={13} className="text-gray-600" />
      </div>

      {/* whatsapp_token_app always first, always redacted */}
      <div className="px-5 py-3 border-b border-gray-800/30 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500 font-mono">whatsapp_token_app</p>
        </div>
        <div className="flex items-center gap-2">
          <ShieldAlert size={11} className="text-amber-500 shrink-0" />
          <span className="font-mono text-xs text-amber-400/70">***redacted***</span>
        </div>
      </div>

      {visible.map(({ key, label, value }) => (
        <div
          key={key}
          className="px-5 py-3 border-b border-gray-800/30 last:border-b-0 flex items-center justify-between gap-4"
        >
          <div>
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-xs text-gray-600 font-mono">{key}</p>
          </div>
          <div className="text-right">
            {value === null || value === undefined || value === "" ? (
              <span className="text-xs text-gray-700 italic">—</span>
            ) : (
              <span className="font-mono text-xs text-gray-300 break-all max-w-xs block text-right">
                {String(value)}
              </span>
            )}
          </div>
        </div>
      ))}

      {fields.length > 4 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-5 py-2.5 flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-300 border-t border-gray-800/60 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp size={12} /> Mostrar menos
            </>
          ) : (
            <>
              <ChevronDown size={12} /> Mostrar {fields.length - 4} campos más
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================

export default function ConfigPage() {
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  async function cargar() {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/config");
      const json: ApiResponse = await res.json();
      if (!json.ok) {
        setErrorMsg(json.detalle ?? json.motivo ?? "Error al cargar configuración");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setErrorMsg("Error de red al cargar configuración");
      setData(null);
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

  const configRows = data?.config ?? [];
  const configuracion = data?.configuracion ?? null;
  const warnings = data?.warnings ?? [];

  const editableRows = configRows.filter((r) => r.editable);
  const readonlyRows = configRows.filter((r) => !r.editable);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle size={22} className="text-violet-400" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">Panel THC</h1>
              <p className="text-xs text-gray-500 leading-tight">Administración operativa</p>
            </div>
          </div>
          <button
            onClick={cerrarSesion}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <LogOut size={13} />
            {cerrandoSesion ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <AdminNav current="/admin/config" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Configuración del sistema</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Solo <span className="font-mono text-gray-400">APP_DEBUG_MODE</span> es editable desde el panel. Todo lo demás es solo lectura.
            </p>
          </div>
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors border border-gray-700 rounded-lg px-3 py-2 hover:border-gray-600"
          >
            <RefreshCw size={12} className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        {/* Loading */}
        {cargando && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 text-sm text-gray-400">
            <span className="animate-pulse">Cargando configuración…</span>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-300 space-y-1">
            {warnings.map((w, i) => (
              <p key={i}>⚠ {w}</p>
            ))}
          </div>
        )}

        {!cargando && !errorMsg && data && (
          <div className="space-y-6">
            {/* === Editable: APP_DEBUG_MODE === */}
            {editableRows.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Controles editables
                </p>
                <div className="space-y-3">
                  {editableRows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-violet-800/30 bg-violet-950/10 px-5 py-4"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-100 font-mono">{row.nombre}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Activa o desactiva el modo debug de la aplicación. Afecta a Edge Functions que verifican este valor.
                          </p>
                          {row.created_at && (
                            <p className="text-xs text-gray-700 mt-1">
                              Creado: {fmtDate(row.created_at)}
                            </p>
                          )}
                        </div>
                      </div>
                      <DebugModeToggle row={row} onOk={cargar} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* === Read-only config rows === */}
            {readonlyRows.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  public.config — solo lectura
                </p>
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-gray-800/60 flex items-center justify-between">
                    <p className="text-xs text-gray-500">{readonlyRows.length} claves</p>
                    <Lock size={12} className="text-gray-700" />
                  </div>
                  {readonlyRows.map((row) => (
                    <div
                      key={row.id}
                      className="px-5 py-3 border-b border-gray-800/30 last:border-b-0 flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="text-xs text-gray-300 font-mono">{row.nombre}</p>
                        {row.created_at && (
                          <p className="text-xs text-gray-700 mt-0.5">{fmtDate(row.created_at)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        {row.es_sensible && (
                          <ShieldAlert size={11} className="text-amber-500 shrink-0" />
                        )}
                        <span
                          className={`font-mono text-xs break-all max-w-xs block text-right ${
                            row.es_sensible ? "text-amber-400/70" : "text-gray-400"
                          }`}
                        >
                          {row.valor}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {configRows.length === 0 && (
              <div className="text-center py-8 text-gray-600 text-sm">
                Sin filas en public.config
              </div>
            )}

            {/* === public.configuracion === */}
            {configuracion ? (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  public.configuracion — solo lectura
                </p>
                <ConfiguracionPanel cfg={configuracion} />
              </div>
            ) : (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-6 text-center text-sm text-gray-600">
                public.configuracion: sin datos
              </div>
            )}

            {/* Nota */}
            <div className="rounded-xl border border-gray-800/50 bg-gray-900/40 px-5 py-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Limitaciones
              </p>
              <ul className="space-y-1.5 text-xs text-gray-600">
                <li>• Solo <span className="font-mono text-gray-500">APP_DEBUG_MODE</span> es editable desde el panel. Toda otra modificación requiere acceso directo a la DB.</li>
                <li>• Campos sensibles (tokens, claves) se muestran como <span className="font-mono">***redacted***</span>.</li>
                <li>• No se implementó: editar <span className="font-mono">configuracion</span>, cambiar credenciales WhatsApp, cambiar precio, cambiar versión de flujo.</li>
                <li>• Los cambios en <span className="font-mono">APP_DEBUG_MODE</span> se aplican en la próxima llamada a Edge Functions que verifican ese valor. No afectan instancias en ejecución.</li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
