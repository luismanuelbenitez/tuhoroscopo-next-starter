"use client";
import { useState, useEffect, useCallback } from "react";
import { Bell, AlertCircle, Check, Loader2, RefreshCw } from "lucide-react";

interface AlertaRow {
  tipo: string;
  activa: boolean;
  usa_email_general: boolean;
  email_particular: string | null;
  descripcion: string | null;
}

// Display order and labels
const ALERTA_META: Record<string, { label: string; badge: string; nota?: string }> = {
  nueva_venta:         { label: "Nueva venta",        badge: "bg-amber-500/20 text-amber-300" },
  error_generacion:    { label: "Error de generación", badge: "bg-red-500/20 text-red-400" },
  error_pdf:           { label: "Error de PDF",        badge: "bg-red-500/20 text-red-400" },
  error_whatsapp:      { label: "Error de WhatsApp",   badge: "bg-red-500/20 text-red-400" },
  error_email_cliente: { label: "Error de email",      badge: "bg-red-500/20 text-red-400" },
  orden_trabada:       { label: "Orden trabada",       badge: "bg-orange-500/20 text-orange-400",
                         nota: "Trigger pendiente — se disparará cuando se configure el mecanismo de cron." },
};

const TIPO_ORDER = [
  "nueva_venta",
  "error_generacion",
  "error_pdf",
  "error_whatsapp",
  "error_email_cliente",
  "orden_trabada",
];

function ResultMsg({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-400" : "text-red-400"}`}>
      {ok ? <Check size={12} /> : <AlertCircle size={12} />}
      {texto}
    </span>
  );
}

const inputCls =
  "bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500 w-full";

export function TarotAlertasConfig() {
  const [alertas, setAlertas]           = useState<AlertaRow[]>([]);
  const [emailGeneral, setEmailGeneral] = useState("");
  const [emailDraft, setEmailDraft]     = useState("");
  const [cargando, setCargando]         = useState(true);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [savedMsg, setSavedMsg]         = useState<{ ok: boolean; texto: string } | null>(null);
  const [emailSaving, setEmailSaving]   = useState(false);
  const [emailMsg, setEmailMsg]         = useState<{ ok: boolean; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res  = await fetch("/api/admin/tarot/alertas");
      const data = await res.json();
      if (data.ok) {
        const sorted = TIPO_ORDER
          .map((t) => (data.alertas as AlertaRow[]).find((a) => a.tipo === t))
          .filter(Boolean) as AlertaRow[];
        setAlertas(sorted);
        setEmailGeneral(data.emailGeneral ?? "");
        setEmailDraft(data.emailGeneral ?? "");
      } else {
        setErrorMsg(data.motivo ?? "Error al cargar");
      }
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function patchAlerta(tipo: string, patch: Partial<AlertaRow>) {
    setAlertas((prev) => prev.map((a) => a.tipo === tipo ? { ...a, ...patch } : a));
  }

  async function guardarAlertas() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res  = await fetch("/api/admin/tarot/alertas", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ alertas }),
      });
      const data = await res.json();
      setSavedMsg({ ok: data.ok, texto: data.ok ? "Guardado" : (data.detalle ?? data.motivo ?? "Error") });
    } catch {
      setSavedMsg({ ok: false, texto: "Error de red" });
    } finally {
      setSaving(false);
    }
  }

  async function guardarEmail() {
    setEmailSaving(true);
    setEmailMsg(null);
    try {
      const res  = await fetch("/api/admin/tarot/alertas", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ emailGeneral: emailDraft }),
      });
      const data = await res.json();
      if (data.ok) setEmailGeneral(emailDraft);
      setEmailMsg({ ok: data.ok, texto: data.ok ? "Guardado" : (data.detalle ?? data.motivo ?? "Error") });
    } catch {
      setEmailMsg({ ok: false, texto: "Error de red" });
    } finally {
      setEmailSaving(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Bell size={18} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Alertas operativas</h1>
            <p className="text-xs text-gray-500 mt-0.5">Notificaciones por email ante eventos críticos del sistema Tarot.</p>
          </div>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-3 py-2 transition-colors"
        >
          <RefreshCw size={12} className={cargando ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={15} className="shrink-0" />
          {errorMsg}
        </div>
      )}

      {cargando && (
        <div className="flex items-center gap-2 text-sm text-gray-500 animate-pulse py-8">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </div>
      )}

      {!cargando && (
        <>
          {/* Email general */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800/60">
              <p className="text-sm font-semibold text-gray-200">Email general</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Dirección que recibirá todas las alertas configuradas como «email general».
              </p>
            </div>
            <div className="px-4 py-4 flex items-center gap-3">
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="hola@ejemplo.com"
                className={`${inputCls} max-w-sm`}
              />
              <button
                onClick={guardarEmail}
                disabled={emailSaving || emailDraft === emailGeneral}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {emailSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {emailSaving ? "Guardando…" : "Guardar"}
              </button>
              {emailMsg && <ResultMsg ok={emailMsg.ok} texto={emailMsg.texto} />}
            </div>
          </div>

          {/* Alertas configuradas */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-200">Alertas configuradas</p>
              <div className="flex items-center gap-3">
                {savedMsg && <ResultMsg ok={savedMsg.ok} texto={savedMsg.texto} />}
                <button
                  onClick={guardarAlertas}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-800/40">
              {alertas.map((alerta) => {
                const meta = ALERTA_META[alerta.tipo] ?? { label: alerta.tipo, badge: "bg-gray-700 text-gray-400" };
                return (
                  <div key={alerta.tipo} className="px-4 py-4 space-y-3">
                    <div className="flex items-start gap-4">
                      {/* Toggle */}
                      <button
                        onClick={() => patchAlerta(alerta.tipo, { activa: !alerta.activa })}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-150 ${
                          alerta.activa ? "bg-amber-500 border-amber-500" : "bg-gray-700 border-gray-700"
                        }`}
                        role="switch"
                        aria-checked={alerta.activa}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${
                            alerta.activa ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${meta.badge}`}>
                            {meta.label}
                          </span>
                          <span className="text-xs font-mono text-gray-600">{alerta.tipo}</span>
                        </div>
                        {alerta.descripcion && (
                          <p className="text-xs text-gray-500 mt-1">{alerta.descripcion}</p>
                        )}
                        {meta.nota && (
                          <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                            <AlertCircle size={10} className="shrink-0" />
                            {meta.nota}
                          </p>
                        )}
                      </div>

                      {/* Destino */}
                      {alerta.activa && (
                        <div className="shrink-0 flex items-center gap-2 text-xs text-gray-400">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`dest-${alerta.tipo}`}
                              checked={alerta.usa_email_general}
                              onChange={() => patchAlerta(alerta.tipo, { usa_email_general: true })}
                              className="accent-amber-500"
                            />
                            General
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`dest-${alerta.tipo}`}
                              checked={!alerta.usa_email_general}
                              onChange={() => patchAlerta(alerta.tipo, { usa_email_general: false })}
                              className="accent-amber-500"
                            />
                            Particular
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Email particular input */}
                    {alerta.activa && !alerta.usa_email_general && (
                      <div className="ml-13 pl-13">
                        <input
                          type="email"
                          value={alerta.email_particular ?? ""}
                          onChange={(e) => patchAlerta(alerta.tipo, { email_particular: e.target.value || null })}
                          placeholder="email@particular.com"
                          className={`${inputCls} max-w-xs ml-13`}
                          style={{ marginLeft: "3.25rem" }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Arquitectura note */}
          <p className="text-xs text-gray-700 px-1">
            Las alertas se disparan desde Supabase Edge Functions — nunca desde el navegador.
            El envío usa Resend con el mismo dominio configurado en producción.
          </p>
        </>
      )}
    </main>
  );
}
