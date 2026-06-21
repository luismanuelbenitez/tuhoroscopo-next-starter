"use client";
import { useState, useEffect, useCallback } from "react";
import {
  LogOut, RefreshCw, AlertCircle, ShieldAlert, ToggleLeft, ToggleRight,
  Lock, ChevronDown, ChevronUp, Pencil, Check, X, Loader2,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { MantenimientoToggle } from "@/components/admin/MantenimientoToggle";
import { AlertasConfig } from "@/components/admin/AlertasConfig";

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

interface Plantilla {
  id: string;
  nombre: string;
  descripcion: string | null;
  contenido: string;
  creado_en: string | null;
  activo: boolean;
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

type Tab = "config" | "ia";

// ===========================================================================
// Helpers
// ===========================================================================

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-UY", {
      timeZone: "America/Montevideo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch {
    return iso;
  }
}

function ResultMsg({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-400" : "text-red-400"}`}>
      {ok ? <Check size={12} /> : <AlertCircle size={12} />}
      {texto}
    </div>
  );
}

// ===========================================================================
// Confirm+motivo helper used by multiple editors
// ===========================================================================

function ConfirmBox({
  titulo,
  pendingLabel,
  motivo,
  setMotivo,
  guardando,
  errorMsg,
  onConfirmar,
  onCancelar,
  placeholder,
}: {
  titulo: string;
  pendingLabel: string;
  motivo: string;
  setMotivo: (v: string) => void;
  guardando: boolean;
  errorMsg: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
  placeholder?: string;
}) {
  return (
    <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 space-y-3">
      <p className="text-xs text-amber-300 font-semibold">{titulo} → <span className="font-mono">{pendingLabel}</span></p>
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Motivo <span className="text-gray-600">(mínimo 5 caracteres)</span>
        </label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          placeholder={placeholder ?? "Describe el motivo del cambio"}
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
          onClick={onConfirmar}
          disabled={guardando || motivo.trim().length < 5}
          className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-xs text-white font-medium transition-colors"
        >
          {guardando ? "Guardando…" : "Confirmar"}
        </button>
        <button
          onClick={onCancelar}
          disabled={guardando}
          className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Toggle panel for APP_DEBUG_MODE
// ===========================================================================

function DebugModeToggle({ row, onOk }: { row: ConfigRow; onOk: () => void }) {
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

  async function confirmar() {
    if (motivo.trim().length < 5) { setErrorMsg("El motivo debe tener al menos 5 caracteres"); return; }
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
          {isOn ? <ToggleRight size={16} className="text-green-400" /> : <ToggleLeft size={16} className="text-gray-500" />}
          {isOn ? "ON" : "OFF"}
        </button>
        <span className="text-xs text-gray-500">
          Actualmente: <span className={isOn ? "text-green-400 font-semibold" : "text-gray-500"}>{row.valor}</span>
        </span>
      </div>
      {successMsg && <p className="mt-2 text-xs text-green-400">{successMsg}</p>}
      {confirmando && (
        <ConfirmBox
          titulo="APP_DEBUG_MODE"
          pendingLabel={pendingValor}
          motivo={motivo}
          setMotivo={setMotivo}
          guardando={guardando}
          errorMsg={errorMsg}
          onConfirmar={confirmar}
          onCancelar={() => { setConfirmando(false); setMotivo(""); setErrorMsg(null); }}
          placeholder="ej: activar debug para diagnóstico de sender"
        />
      )}
    </div>
  );
}

// ===========================================================================
// Toggle panel for WHATSAPP_MODO
// ===========================================================================

function WaModoToggle({ row, onOk }: { row: ConfigRow; onOk: () => void }) {
  const isProduction = row.valor === "production";
  const [confirmando, setConfirmando] = useState(false);
  const [pendingValor, setPendingValor] = useState<"sandbox" | "production">("sandbox");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function confirmar() {
    if (motivo.trim().length < 5) { setErrorMsg("El motivo debe tener al menos 5 caracteres"); return; }
    setGuardando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/config/accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: "WHATSAPP_MODO", valor: pendingValor, motivo: motivo.trim() }),
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
      <div className="flex items-center gap-3">
        <button
          onClick={() => { if (!isProduction) { setPendingValor("production"); setMotivo(""); setErrorMsg(null); setSuccessMsg(null); setConfirmando(true); } }}
          disabled={isProduction}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            isProduction
              ? "border-amber-700/60 bg-amber-950/40 text-amber-300 cursor-default"
              : "border-gray-700/60 bg-gray-800/60 text-gray-500 hover:text-amber-300 hover:border-amber-700/60"
          }`}
        >
          PRODUCCIÓN
        </button>
        <button
          onClick={() => { if (isProduction) { setPendingValor("sandbox"); setMotivo(""); setErrorMsg(null); setSuccessMsg(null); setConfirmando(true); } }}
          disabled={!isProduction}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            !isProduction
              ? "border-violet-700/60 bg-violet-950/40 text-violet-300 cursor-default"
              : "border-gray-700/60 bg-gray-800/60 text-gray-500 hover:text-violet-300 hover:border-violet-700/60"
          }`}
        >
          SANDBOX
        </button>
        <span className="text-xs text-gray-500">
          Actualmente:{" "}
          <span className={isProduction ? "text-amber-400 font-semibold" : "text-violet-400 font-semibold"}>{row.valor}</span>
        </span>
      </div>
      {successMsg && <p className="mt-2 text-xs text-green-400">{successMsg}</p>}
      {confirmando && (
        <ConfirmBox
          titulo="WHATSAPP_MODO"
          pendingLabel={pendingValor + (pendingValor === "production" ? " ⚠ Los mensajes se enviarán a usuarios reales" : "")}
          motivo={motivo}
          setMotivo={setMotivo}
          guardando={guardando}
          errorMsg={errorMsg}
          onConfirmar={confirmar}
          onCancelar={() => { setConfirmando(false); setMotivo(""); setErrorMsg(null); }}
          placeholder={pendingValor === "production" ? "ej: activar envíos reales para lanzamiento" : "ej: volver a sandbox para pruebas"}
        />
      )}
    </div>
  );
}

// ===========================================================================
// URL editor
// ===========================================================================

function UrlEditor({ row, onOk }: { row: ConfigRow; onOk: () => void }) {
  const [editando, setEditando] = useState(false);
  const [nuevoValor, setNuevoValor] = useState(row.valor);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function iniciarEdicion() {
    setNuevoValor(row.valor);
    setMotivo("");
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditando(true);
  }

  async function guardar() {
    try { const u = new URL(nuevoValor.trim()); if (u.protocol !== "https:") { setErrorMsg("Debe ser una URL HTTPS"); return; } }
    catch { setErrorMsg("URL inválida — debe comenzar con https://"); return; }
    if (motivo.trim().length < 5) { setErrorMsg("El motivo debe tener al menos 5 caracteres"); return; }
    setGuardando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/config/accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: row.nombre, valor: nuevoValor.trim(), motivo: motivo.trim() }),
      });
      const json: AcResponse = await res.json();
      if (!json.ok) {
        setErrorMsg(json.detalle ?? json.motivo ?? "Error al guardar");
      } else {
        setSuccessMsg(json.mensaje ?? "Actualizado");
        setEditando(false);
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
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-gray-300 break-all">{row.valor || "—"}</span>
        {!editando && (
          <button
            onClick={iniciarEdicion}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-700/60 bg-gray-800/60 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
          >
            <Pencil size={11} /> Editar
          </button>
        )}
      </div>
      {successMsg && <p className="mt-2 text-xs text-green-400">{successMsg}</p>}
      {editando && (
        <div className="mt-3 rounded-lg border border-violet-800/40 bg-violet-950/10 px-4 py-3 space-y-3">
          <p className="text-xs text-violet-300 font-semibold">Editar {row.nombre}</p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nueva URL <span className="text-gray-600">(https://)</span></label>
            <input
              type="url"
              value={nuevoValor}
              onChange={(e) => setNuevoValor(e.target.value)}
              placeholder="https://tuoraculo.uy/horoscopo/gracias"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Motivo <span className="text-gray-600">(mínimo 5 caracteres)</span></label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="ej: dominio tuoraculo.uy configurado y apuntando"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 resize-none"
            />
          </div>
          {errorMsg && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} /> {errorMsg}</p>}
          <div className="flex gap-2">
            <button onClick={guardar} disabled={guardando || !nuevoValor.trim() || motivo.trim().length < 5} className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-xs text-white font-medium transition-colors">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => { setEditando(false); setErrorMsg(null); }} disabled={guardando} className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Price editor
// ===========================================================================

function PrecioEditor({ row, onOk }: { row: ConfigRow; onOk: () => void }) {
  const [editando, setEditando] = useState(false);
  const [nuevoValor, setNuevoValor] = useState(row.valor);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function guardar() {
    const n = parseInt(nuevoValor, 10);
    if (isNaN(n) || n < 1 || n > 9999) { setErrorMsg("Debe ser un número entre 1 y 9999"); return; }
    if (motivo.trim().length < 5) { setErrorMsg("El motivo debe tener al menos 5 caracteres"); return; }
    setGuardando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/config/accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: row.nombre, valor: String(n), motivo: motivo.trim() }),
      });
      const json: AcResponse = await res.json();
      if (!json.ok) {
        setErrorMsg(json.detalle ?? json.motivo ?? "Error al guardar");
      } else {
        setSuccessMsg(json.mensaje ?? "Actualizado");
        setEditando(false);
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
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-bold text-gray-200">$ {row.valor} UYU</span>
        {!editando && (
          <button
            onClick={() => { setNuevoValor(row.valor); setMotivo(""); setErrorMsg(null); setSuccessMsg(null); setEditando(true); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-700/60 bg-gray-800/60 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
          >
            <Pencil size={11} /> Editar
          </button>
        )}
      </div>
      {successMsg && <p className="mt-2 text-xs text-green-400">{successMsg}</p>}
      {editando && (
        <div className="mt-3 rounded-lg border border-violet-800/40 bg-violet-950/10 px-4 py-3 space-y-3">
          <p className="text-xs text-violet-300 font-semibold">Editar {row.nombre}</p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nuevo precio (UYU)</label>
            <input type="number" min="1" max="9999" value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)} className="w-32 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-violet-600" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Motivo <span className="text-gray-600">(mínimo 5 caracteres)</span></label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="ej: actualización de precio para campaña de verano" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 resize-none" />
          </div>
          {errorMsg && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} /> {errorMsg}</p>}
          <div className="flex gap-2">
            <button onClick={guardar} disabled={guardando || !nuevoValor || motivo.trim().length < 5} className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-xs text-white font-medium transition-colors">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => { setEditando(false); setErrorMsg(null); }} disabled={guardando} className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// OpenAI model selector
// ===========================================================================

const OPENAI_MODELS = [
  { value: "gpt-4o-mini",  label: "gpt-4o-mini",  note: "Económico · calidad base" },
  { value: "gpt-4.1-mini", label: "gpt-4.1-mini", note: "Recomendado · mejor calidad, bajo costo" },
  { value: "gpt-4o",       label: "gpt-4o",        note: "Alta calidad · costo medio" },
  { value: "gpt-4.1",      label: "gpt-4.1",       note: "Máxima calidad · costo alto" },
];

function OAIModelSelector({ row, onOk }: { row: ConfigRow; onOk: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendingValor, setPendingValor] = useState(row.valor);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function iniciarCambio(nuevoValor: string) {
    if (nuevoValor === row.valor) return;
    setPendingValor(nuevoValor);
    setMotivo("");
    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmando(true);
  }

  async function confirmar() {
    if (motivo.trim().length < 5) { setErrorMsg("El motivo debe tener al menos 5 caracteres"); return; }
    setGuardando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/config/accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: "OPENAI_MODEL", valor: pendingValor, motivo: motivo.trim() }),
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
      <div className="flex flex-wrap gap-2">
        {OPENAI_MODELS.map((m) => (
          <button
            key={m.value}
            onClick={() => iniciarCambio(m.value)}
            disabled={m.value === row.valor}
            className={`flex flex-col items-start px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
              m.value === row.valor
                ? "border-violet-700/60 bg-violet-950/40 text-violet-200 cursor-default"
                : "border-gray-700/60 bg-gray-800/60 text-gray-400 hover:text-violet-300 hover:border-violet-700/40"
            }`}
          >
            <span className="font-mono">{m.label}</span>
            <span className={`text-[10px] mt-0.5 ${m.value === row.valor ? "text-violet-400/70" : "text-gray-600"}`}>{m.note}</span>
          </button>
        ))}
      </div>
      {successMsg && <p className="mt-2 text-xs text-green-400">{successMsg}</p>}
      {confirmando && (
        <ConfirmBox
          titulo="OPENAI_MODEL"
          pendingLabel={pendingValor}
          motivo={motivo}
          setMotivo={setMotivo}
          guardando={guardando}
          errorMsg={errorMsg}
          onConfirmar={confirmar}
          onCancelar={() => { setConfirmando(false); setMotivo(""); setErrorMsg(null); }}
          placeholder="ej: mejorar calidad sin escalar mucho el costo"
        />
      )}
    </div>
  );
}

// ===========================================================================
// Generic numeric editor (temperatura, max_tokens)
// ===========================================================================

function OAINumericEditor({
  row, label, min, max, step, unit, onOk,
}: {
  row: ConfigRow;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onOk: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [nuevoValor, setNuevoValor] = useState(row.valor);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function iniciarEdicion() {
    setNuevoValor(row.valor);
    setMotivo("");
    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmando(true);
  }

  async function confirmar() {
    if (motivo.trim().length < 5) { setErrorMsg("El motivo debe tener al menos 5 caracteres"); return; }
    const n = parseFloat(nuevoValor);
    if (isNaN(n) || n < min || n > max) { setErrorMsg(`Debe ser un número entre ${min} y ${max}`); return; }
    setGuardando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/config/accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: row.nombre, valor: String(n), motivo: motivo.trim() }),
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
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="w-52 shrink-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-xs text-gray-600 mt-0.5 font-mono">{row.nombre}</p>
      </div>
      <div className="flex-1">
        {!confirmando ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-gray-200">{row.valor}{unit ? ` ${unit}` : ""}</span>
            <button
              onClick={iniciarEdicion}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-700/60 bg-gray-800/60 text-xs text-gray-400 hover:text-violet-300 hover:border-violet-700/40 transition-colors"
            >
              <Pencil size={11} /> Editar
            </button>
            {successMsg && <span className="text-xs text-green-400">{successMsg}</span>}
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={nuevoValor}
              onChange={(e) => setNuevoValor(e.target.value)}
              className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
            />
            <div>
              <label className="block text-xs text-gray-400 mb-1">Motivo <span className="text-gray-600">(mínimo 5 caracteres)</span></label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder={`ej: ajustar ${label.toLowerCase()} para mejorar coherencia`}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 resize-none"
              />
            </div>
            {errorMsg && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} /> {errorMsg}</p>}
            <div className="flex gap-2">
              <button onClick={confirmar} disabled={guardando || motivo.trim().length < 5} className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-xs text-white font-medium transition-colors">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
              <button onClick={() => { setConfirmando(false); setErrorMsg(null); }} disabled={guardando} className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Prompt plantilla editor (collapsible)
// ===========================================================================

function PromptPlantillaEditor({ plantilla, onSaved }: { plantilla: Plantilla; onSaved: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(plantilla.contenido);
  const [guardando, setGuardando] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; texto: string } | null>(null);

  const NOMBRE_LABEL: Record<string, string> = {
    prompt_contenido_premium: "Prompt diario (lunes a sábado)",
    prompt_contenido_premium_domingo: "Prompt domingo",
  };
  const label = NOMBRE_LABEL[plantilla.nombre] ?? plantilla.nombre;

  async function guardar() {
    setGuardando(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/plantillas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: plantilla.nombre, contenido: draft }),
      });
      const json = await res.json();
      if (json.ok) {
        setResult({ ok: true, texto: "Guardado correctamente" });
        onSaved();
      } else {
        setResult({ ok: false, texto: json.motivo ?? "Error al guardar" });
      }
    } catch {
      setResult({ ok: false, texto: "Error de red" });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-800/60 text-left"
      >
        <div>
          <span className="text-sm font-semibold text-gray-200">{label}</span>
          <span className="ml-2 text-xs text-gray-500 font-mono">{draft.length} chars</span>
          {plantilla.descripcion && (
            <p className="text-xs text-gray-600 mt-0.5">{plantilla.descripcion}</p>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-500 shrink-0" /> : <ChevronDown size={14} className="text-gray-500 shrink-0" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          <textarea
            rows={16}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-white leading-relaxed focus:outline-none focus:border-violet-500 resize-none"
          />
          <div className="flex items-center justify-between">
            <div>{result && <ResultMsg ok={result.ok} texto={result.texto} />}</div>
            <button
              onClick={guardar}
              disabled={guardando || draft.trim() === plantilla.contenido.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {guardando ? <Loader2 size={13} className="animate-spin" /> : null}
              {guardando ? "Guardando…" : "Guardar prompt"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Configuracion read-only panel
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
    key, label, value: cfg[key as keyof Configuracion],
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
      <div className="px-5 py-3 border-b border-gray-800/30 flex items-center justify-between gap-4">
        <p className="text-xs text-gray-500 font-mono">whatsapp_token_app</p>
        <div className="flex items-center gap-2">
          <ShieldAlert size={11} className="text-amber-500 shrink-0" />
          <span className="font-mono text-xs text-amber-400/70">***redacted***</span>
        </div>
      </div>
      {visible.map(({ key, label, value }) => (
        <div key={key} className="px-5 py-3 border-b border-gray-800/30 last:border-b-0 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-xs text-gray-600 font-mono">{key}</p>
          </div>
          <div className="text-right">
            {value === null || value === undefined || value === "" ? (
              <span className="text-xs text-gray-700 italic">—</span>
            ) : (
              <span className="font-mono text-xs text-gray-300 break-all max-w-xs block text-right">{String(value)}</span>
            )}
          </div>
        </div>
      ))}
      {fields.length > 4 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-5 py-2.5 flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-300 border-t border-gray-800/60 transition-colors"
        >
          {expanded ? <><ChevronUp size={12} /> Mostrar menos</> : <><ChevronDown size={12} /> Mostrar {fields.length - 4} campos más</>}
        </button>
      )}
    </div>
  );
}

// ===========================================================================
// Section card wrapper (matches Tarot's ConfigGrupo look in violet)
// ===========================================================================

function SectionCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800/60">
        <span className="text-sm font-semibold text-gray-200">{titulo}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================

export default function ConfigPage() {
  const [tab, setTab] = useState<Tab>("config");
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [configRows, setConfigRows] = useState<ConfigRow[]>([]);
  const [configuracion, setConfiguracion] = useState<Configuracion | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [cargandoPlantillas, setCargandoPlantillas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/config");
      const json = await res.json();
      if (!json.ok) {
        setErrorMsg(json.detalle ?? json.motivo ?? "Error al cargar configuración");
      } else {
        setConfigRows(json.config ?? []);
        setConfiguracion(json.configuracion ?? null);
        setWarnings(json.warnings ?? []);
      }
    } catch {
      setErrorMsg("Error de red al cargar configuración");
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarPlantillas = useCallback(async () => {
    setCargandoPlantillas(true);
    try {
      const res = await fetch("/api/admin/plantillas");
      const json = await res.json();
      if (json.ok) {
        const prompts = (json.plantillas ?? []).filter((p: Plantilla) =>
          p.nombre === "prompt_contenido_premium" || p.nombre === "prompt_contenido_premium_domingo"
        );
        setPlantillas(prompts);
      }
    } catch {
      // silencioso — no bloquea el resto del panel
    } finally {
      setCargandoPlantillas(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (tab === "ia") cargarPlantillas();
  }, [tab, cargarPlantillas]);

  async function cerrarSesion() {
    setCerrandoSesion(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
      window.location.href = "/admin/login";
    } catch {
      setCerrandoSesion(false);
    }
  }

  const row = (nombre: string) => configRows.find((r) => r.nombre.toUpperCase() === nombre.toUpperCase());

  const tabCls = (t: Tab) =>
    `text-sm border-b-2 py-2.5 px-3 whitespace-nowrap transition-colors ${
      tab === t ? "text-white border-violet-500" : "text-gray-500 hover:text-gray-300 border-transparent"
    }`;

  // groups for "config" tab
  const sistemaCampos = ["MODO_MANTENIMIENTO", "APP_DEBUG_MODE"];
  const waCampos      = ["WHATSAPP_MODO"];
  const preciosCampos = ["THC_PRECIO_SUSCRIPCION", "THC_BACK_URL", "TTC_BACK_URL"];
  const alertasCampos = configRows.filter((r) => r.nombre.startsWith("ALERTAS"));
  const readonlyRows  = configRows.filter(
    (r) => !r.editable && !r.nombre.startsWith("ALERTAS") && !r.nombre.startsWith("OPENAI")
  );

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
          <AdminNav current="/admin/config" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-100">Configuración THC</h2>
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors border border-gray-700 rounded-lg px-3 py-2 hover:border-gray-600"
          >
            <RefreshCw size={12} className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-0 border-b border-gray-800 mb-6">
          <button onClick={() => setTab("config")} className={tabCls("config")}>Configuración general</button>
          <button onClick={() => setTab("ia")}     className={tabCls("ia")}>Inteligencia Artificial</button>
        </div>

        {/* Feedback */}
        {cargando && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 animate-pulse">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" /> {errorMsg}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-300 space-y-1">
            {warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
          </div>
        )}

        {/* ===== TAB: Configuración general ===== */}
        {!cargando && tab === "config" && (
          <div className="space-y-4">
            {/* Sistema */}
            <SectionCard titulo="Sistema">
              <div className="space-y-4">
                {sistemaCampos.map((nombre) => {
                  const r = row(nombre);
                  if (!r) return null;
                  const descriptions: Record<string, string> = {
                    MODO_MANTENIMIENTO: "Cuando está activo, todos los visitantes son redirigidos a la página de mantenimiento. Cache de 30s en middleware.",
                    APP_DEBUG_MODE: "Activa logs verbosos en Edge Functions. Desactivar en producción.",
                  };
                  return (
                    <div key={nombre}>
                      <p className="text-xs text-gray-400 mb-1 font-mono">{r.nombre}</p>
                      {descriptions[nombre] && <p className="text-xs text-gray-600 mb-2">{descriptions[nombre]}</p>}
                      {nombre === "MODO_MANTENIMIENTO" ? (
                        <MantenimientoToggle valor={r.valor} onOk={cargar} />
                      ) : (
                        <DebugModeToggle row={r} onOk={cargar} />
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {/* WhatsApp */}
            {row("WHATSAPP_MODO") && (
              <SectionCard titulo="WhatsApp">
                <p className="text-xs text-gray-600 mb-3">
                  Controla si THC envía WhatsApp en modo sandbox (simulado) o production (real). <span className="font-mono">ef_whatsapp_sender</span> lo lee en cada request.
                </p>
                <WaModoToggle row={row("WHATSAPP_MODO")!} onOk={cargar} />
              </SectionCard>
            )}

            {/* Precios y URLs */}
            <SectionCard titulo="Precios y URLs">
              <div className="divide-y divide-gray-800/40">
                {preciosCampos.map((nombre) => {
                  const r = row(nombre);
                  if (!r) return null;
                  const descriptions: Record<string, string> = {
                    THC_PRECIO_SUSCRIPCION: "Precio mensual de la suscripción Premium en UYU. Lo lee ef_crear_suscripcion al crear el preapproval en MercadoPago.",
                    THC_BACK_URL: "URL de redirección post-pago de horóscopo (back_urls de MP).",
                    TTC_BACK_URL: "URL de redirección post-pago de tarot (back_urls de MP).",
                  };
                  return (
                    <div key={nombre} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-xs font-mono text-gray-300 mb-0.5">{r.nombre}</p>
                      {descriptions[nombre] && <p className="text-xs text-gray-600 mb-2">{descriptions[nombre]}</p>}
                      {nombre === "THC_PRECIO_SUSCRIPCION" ? (
                        <PrecioEditor row={r} onOk={cargar} />
                      ) : (
                        <UrlEditor row={r} onOk={cargar} />
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {/* Alertas operacionales */}
            {alertasCampos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Alertas operacionales</p>
                <AlertasConfig rows={alertasCampos} onOk={cargar} />
              </div>
            )}

            {/* Read-only config */}
            {readonlyRows.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">public.config — solo lectura</p>
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-gray-800/60 flex items-center justify-between">
                    <p className="text-xs text-gray-500">{readonlyRows.length} claves</p>
                    <Lock size={12} className="text-gray-700" />
                  </div>
                  {readonlyRows.map((r) => (
                    <div key={r.id} className="px-5 py-3 border-b border-gray-800/30 last:border-b-0 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs text-gray-300 font-mono">{r.nombre}</p>
                        {r.created_at && <p className="text-xs text-gray-700 mt-0.5">{fmtDate(r.created_at)}</p>}
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        {r.es_sensible && <ShieldAlert size={11} className="text-amber-500 shrink-0" />}
                        <span className={`font-mono text-xs break-all max-w-xs block text-right ${r.es_sensible ? "text-amber-400/70" : "text-gray-400"}`}>
                          {r.valor}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* public.configuracion */}
            {configuracion && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">public.configuracion — solo lectura</p>
                <ConfiguracionPanel cfg={configuracion} />
              </div>
            )}
          </div>
        )}

        {/* ===== TAB: Inteligencia Artificial ===== */}
        {!cargando && tab === "ia" && (
          <div className="space-y-4">
            {/* Parámetros de IA */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800/60">
                <span className="text-sm font-semibold text-gray-200">Parámetros de IA</span>
                <p className="text-xs text-gray-500 mt-0.5">Leídos por <span className="font-mono">ef_openia_genera_contenido_premium</span> en cada generación.</p>
              </div>
              <div className="px-4 pb-2">
                {/* Modelo */}
                {row("OPENAI_MODEL") && (
                  <div className="py-3 border-b border-gray-800/30">
                    <p className="text-xs text-gray-400 mb-1">Modelo</p>
                    <p className="text-xs text-gray-600 mb-2 font-mono">OPENAI_MODEL</p>
                    <OAIModelSelector row={row("OPENAI_MODEL")!} onOk={cargar} />
                  </div>
                )}
                {/* Temperatura */}
                {row("OPENAI_TEMPERATURE") && (
                  <OAINumericEditor
                    row={row("OPENAI_TEMPERATURE")!}
                    label="Temperatura"
                    min={0}
                    max={2}
                    step={0.01}
                    onOk={cargar}
                  />
                )}
                {/* Max tokens */}
                {row("OPENAI_MAX_TOKENS") && (
                  <OAINumericEditor
                    row={row("OPENAI_MAX_TOKENS")!}
                    label="Max tokens"
                    min={50}
                    max={4096}
                    step={10}
                    unit="tokens"
                    onOk={cargar}
                  />
                )}
              </div>
            </div>

            {/* Prompts */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Prompts de generación</p>
              {cargandoPlantillas && (
                <div className="flex items-center gap-2 text-sm text-gray-500 animate-pulse py-4">
                  <Loader2 size={14} className="animate-spin" /> Cargando prompts…
                </div>
              )}
              {!cargandoPlantillas && plantillas.length === 0 && (
                <p className="text-sm text-gray-600 py-4">No se encontraron plantillas de prompt.</p>
              )}
              {!cargandoPlantillas && plantillas.length > 0 && (
                <div className="space-y-3">
                  {["prompt_contenido_premium", "prompt_contenido_premium_domingo"].map((nombre) => {
                    const p = plantillas.find((pl) => pl.nombre === nombre);
                    if (!p) return null;
                    return <PromptPlantillaEditor key={p.id} plantilla={p} onSaved={cargarPlantillas} />;
                  })}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-600 pt-1">
              Los cambios en temperatura y max_tokens se aplican en la próxima llamada a la Edge Function. El modelo se lee en cada request desde la tabla <span className="font-mono">config</span>.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
