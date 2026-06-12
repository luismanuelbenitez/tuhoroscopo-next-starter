"use client";
import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  LogOut,
  AlertTriangle,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Info,
  RefreshCw,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";

// ===========================================================================
// Types
// ===========================================================================

interface DiagnosticoAdmin {
  healthy: boolean;
  warnings: string[];
  estado_resumen: string;
  accion_sugerida: string;
}

interface Suscripcion {
  id: number;
  suscriptor_id: number | null;
  provider: string | null;
  preapproval_id_masked: string | null;
  external_reference: string | null;
  estado: string;
  provisional: boolean | null;
  auto_renovacion_activa: boolean | null;
  preapproval_status_mp: string | null;
  fecha_creacion: string | null;
  fecha_activacion_provisional: string | null;
  fecha_activacion_definitiva: string | null;
  fecha_vencimiento_actual: string | null;
  fecha_cancelacion: string | null;
  reason: string | null;
  currency_id: string | null;
  amount: number | null;
  frequency: number | null;
  frequency_type: string | null;
  codigo_descuento: string | null;
  codigo_descuento_id: number | null;
  descuento_estado: string | null;
  descuento_metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  diagnostico_admin: DiagnosticoAdmin | null;
}

interface AlertaConciliacion {
  codigo: string;
  descripcion: string;
  nivel: "error" | "warning" | "info";
}

interface PagoReciente {
  id_pago: number;
  fecha_pago: string | null;
  status: string;
  amount: number | null;
  currency: string | null;
  medio_pago: string | null;
  tipo_pago: string | null;
  preapproval_id: string | null;
  procesado: boolean | null;
  created_at: string | null;
}

interface SuscriptorDetallePerfil {
  id: number;
  nombre: string | null;
  whatsapp: string | null;
  signo: string | null;
  tipo_suscripcion: string | null;
  estado_suscripcion: string | null;
  premium_activo: boolean;
  fecha_vencimiento_premium: string | null;
  fecha_inicio_premium: string | null;
  whatsapp_confirmado: boolean;
  fecha_confirmacion_whatsapp: string | null;
  estado_mensaje: string | null;
  preapproval_id: string | null;
  preapproval_status: string | null;
  auto_renovacion_activa: boolean | null;
  bienvenida_enviada: boolean | null;
  primer_envio_premium_enviado: boolean | null;
  creado_en: string | null;
  actualizado_en: string | null;
}

interface DetalleFetch {
  ok: boolean;
  suscriptor: SuscriptorDetallePerfil | null;
  suscripcion_actual: {
    id: string;
    estado: string | null;
    provisional: boolean | null;
    preapproval_status_mp: string | null;
    fecha_vencimiento_actual: string | null;
    fecha_activacion_definitiva: string | null;
    amount: number | null;
    currency_id: string | null;
    codigo_descuento: string | null;
    descuento_estado: string | null;
  } | null;
  pagos_recientes: PagoReciente[];
  descuentos_usados: Array<{
    id: number;
    codigo: string | null;
    estado_uso: string | null;
    moneda: string | null;
    precio_original: number | null;
    precio_aplicado: number | null;
    valor_descuento_aplicado: number | null;
    dias_gratis_aplicados: number | null;
    meses_gratis_aplicados: number | null;
    fecha_aplicacion: string | null;
    creado_en: string | null;
  }>;
  alertas_conciliacion: AlertaConciliacion[];
  diagnostico: Record<string, unknown> | null;
  warnings: string[];
  motivo?: string;
}

interface Paginacion {
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

interface ApiResponse {
  ok: boolean;
  healthy: boolean;
  paginacion: Paginacion | null;
  conteos_pagina: {
    estado?: Record<string, number>;
    preapproval_status_mp?: Record<string, number>;
    diagnostico?: Record<string, number>;
    descuento_estado?: Record<string, number>;
  };
  suscripciones: Suscripcion[];
  warnings: string[];
}

interface Filtros {
  estado: string;
  preapproval_status_mp: string;
  solo_vencidas: boolean;
  solo_con_descuento: boolean;
  fecha_desde: string;
  fecha_hasta: string;
  limit: number;
  offset: number;
}

// ===========================================================================
// Constants
// ===========================================================================

const ESTADO_LOCAL_CLS: Record<string, string> = {
  activa: "bg-green-900/60 text-green-300 border border-green-700/50",
  activa_provisional: "bg-amber-900/60 text-amber-300 border border-amber-700/50",
  pendiente_autorizacion: "bg-sky-900/60 text-sky-300 border border-sky-700/50",
  cancelada: "bg-red-900/60 text-red-300 border border-red-700/50",
  finalizada: "bg-gray-800 text-gray-400 border border-gray-700/50",
};

const MP_STATUS_CLS: Record<string, string> = {
  authorized: "bg-green-900/60 text-green-300 border border-green-700/50",
  pending: "bg-amber-900/60 text-amber-300 border border-amber-700/50",
  paused: "bg-sky-900/60 text-sky-300 border border-sky-700/50",
  cancelled: "bg-red-900/60 text-red-300 border border-red-700/50",
  expired: "bg-gray-800 text-gray-400 border border-gray-700/50",
};

const DIAGNOSTICO_BG: Record<string, string> = {
  vencida: "bg-red-950/30",
  mp_no_operativo: "bg-red-950/30",
  provisional: "bg-amber-950/25",
  local_no_activa: "bg-amber-950/25",
  descuento_fallido: "bg-amber-950/25",
};

const DIAGNOSTICO_BOX_CLS: Record<string, string> = {
  ok: "border-green-800/50 bg-green-950/40 text-green-300",
  vencida: "border-red-800/50 bg-red-950/40 text-red-300",
  mp_no_operativo: "border-red-800/50 bg-red-950/40 text-red-300",
  provisional: "border-amber-800/50 bg-amber-950/40 text-amber-300",
  local_no_activa: "border-amber-800/50 bg-amber-950/40 text-amber-300",
  descuento_fallido: "border-amber-800/50 bg-amber-950/40 text-amber-300",
};

const PAGO_STATUS_CLS: Record<string, string> = {
  approved: "text-green-400",
  pending: "text-amber-400",
  rejected: "text-red-400",
  cancelled: "text-red-400",
  refunded: "text-sky-400",
};

const DEFAULT_FILTROS: Filtros = {
  estado: "",
  preapproval_status_mp: "",
  solo_vencidas: false,
  solo_con_descuento: false,
  fecha_desde: "",
  fecha_hasta: "",
  limit: 50,
  offset: 0,
};

// ===========================================================================
// Helpers
// ===========================================================================

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return iso.slice(0, 10);
  } catch {
    return iso;
  }
}

function estadoLocalBadge(estado: string) {
  const cls = ESTADO_LOCAL_CLS[estado] ?? "bg-gray-800 text-gray-400 border border-gray-700/50";
  return (
    <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-mono ${cls}`}>
      {estado || "—"}
    </span>
  );
}

function mpStatusBadge(status: string | null) {
  if (!status) return <span className="text-gray-600 text-xs">—</span>;
  const cls = MP_STATUS_CLS[status] ?? "bg-gray-800 text-gray-400 border border-gray-700/50";
  return (
    <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-mono ${cls}`}>
      {status}
    </span>
  );
}

function rowBg(s: Suscripcion, isSelected: boolean): string {
  if (isSelected) return "bg-violet-950/20 border-violet-800/30";
  const dr = s.diagnostico_admin?.estado_resumen ?? "";
  return DIAGNOSTICO_BG[dr] ?? "";
}

function buildQueryString(f: Filtros): string {
  const params = new URLSearchParams();
  if (f.estado) params.set("estado", f.estado);
  if (f.preapproval_status_mp) params.set("preapproval_status_mp", f.preapproval_status_mp);
  if (f.solo_vencidas) params.set("solo_vencidas", "true");
  if (f.solo_con_descuento) params.set("solo_con_descuento", "true");
  if (f.fecha_desde) params.set("fecha_desde", f.fecha_desde);
  if (f.fecha_hasta) params.set("fecha_hasta", f.fecha_hasta);
  params.set("limit", String(f.limit));
  params.set("offset", String(f.offset));
  return params.toString();
}

// ===========================================================================
// Shared UI primitives
// ===========================================================================

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-800/60 last:border-0">
      <span className="text-gray-500 text-xs w-44 shrink-0">{label}</span>
      <span className="text-gray-200 text-xs break-all">{value ?? "—"}</span>
    </div>
  );
}

function BoolIcon({ val }: { val: boolean | null | undefined }) {
  if (val == null) return <span className="text-gray-600 text-xs">—</span>;
  return val
    ? <Check size={13} className="text-green-400" />
    : <X size={13} className="text-red-400" />;
}

// ===========================================================================
// AccionesRenovarPremium
// ===========================================================================

function AccionesRenovarPremium({
  idSuscriptor,
  onAccionOk,
}: {
  idSuscriptor: number;
  onAccionOk?: () => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const [meses, setMeses] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);

  async function ejecutar() {
    if (motivo.trim().length < 5) return;
    setCargando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/admin/suscripcion-accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_suscriptor: idSuscriptor, accion: "renovar_premium", meses, motivo: motivo.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        setResultado({ ok: true, msg: json.mensaje ?? "Premium renovado correctamente." });
        setConfirmar(false);
        setMotivo("");
        setMeses(1);
        onAccionOk?.();
      } else {
        setResultado({ ok: false, msg: json.detalle ?? json.motivo ?? "Error al renovar premium." });
      }
    } catch {
      setResultado({ ok: false, msg: "Error de red al ejecutar la acción." });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="border border-gray-700/60 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-300">Renovar premium manual</span>
        {!confirmar && !resultado && (
          <button
            onClick={() => setConfirmar(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-violet-700 bg-violet-800/30 text-violet-300 hover:bg-violet-700/50 transition-colors"
          >
            Renovar
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Extiende la fecha de vencimiento premium N meses desde el vencimiento actual. Solo disponible si el suscriptor tiene premium activo y suscripción activa.
      </p>

      {resultado && (
        <div className={`mb-2 rounded-lg px-3 py-2 text-xs border ${resultado.ok ? "border-green-800/50 bg-green-950/40 text-green-300" : "border-red-800/50 bg-red-950/40 text-red-300"}`}>
          {resultado.msg}
        </div>
      )}

      {confirmar && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 shrink-0">Meses a agregar:</label>
            <select
              value={meses}
              onChange={(e) => setMeses(parseInt(e.target.value, 10))}
              className="border border-gray-700 rounded bg-gray-800 text-sm text-white px-2 py-1 focus:outline-none focus:border-violet-500"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m} {m === 1 ? "mes" : "meses"}</option>
              ))}
            </select>
          </div>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (mínimo 5 caracteres)…"
            rows={2}
            className="w-full border border-gray-700 rounded-lg bg-gray-800 text-xs text-white px-3 py-2 focus:outline-none focus:border-violet-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={ejecutar}
              disabled={cargando || motivo.trim().length < 5}
              className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-violet-700 bg-violet-800/40 text-violet-300 hover:bg-violet-700/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {cargando ? "Ejecutando…" : `Confirmar — +${meses} ${meses === 1 ? "mes" : "meses"}`}
            </button>
            <button
              onClick={() => { setConfirmar(false); setMotivo(""); setMeses(1); setResultado(null); }}
              disabled={cargando}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40"
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
// Detail panel (fetch-based)
// ===========================================================================

function SuscripcionDetalle({
  item,
  onClose,
  onAccionOk,
}: {
  item: Suscripcion;
  onClose: () => void;
  onAccionOk?: () => void;
}) {
  const [showDescMetadata, setShowDescMetadata] = useState(false);
  const [detalle, setDetalle] = useState<DetalleFetch | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  const diag = item.diagnostico_admin;
  const diagCls = DIAGNOSTICO_BOX_CLS[diag?.estado_resumen ?? ""] ?? DIAGNOSTICO_BOX_CLS["ok"];
  const hasDescuento = !!item.codigo_descuento;

  useEffect(() => {
    if (!item.suscriptor_id) return;
    setCargandoDetalle(true);
    setErrorDetalle(null);
    fetch(`/api/admin/suscripcion-detalle?id_suscriptor=${item.suscriptor_id}`)
      .then((r) => r.json())
      .then((json: DetalleFetch) => {
        if (json.ok) {
          setDetalle(json);
        } else {
          setErrorDetalle(json.motivo ?? "Error al cargar detalle");
        }
      })
      .catch(() => setErrorDetalle("Error de red al cargar detalle"))
      .finally(() => setCargandoDetalle(false));
  }, [item.suscriptor_id]);

  const puedeRenovar =
    detalle?.suscriptor?.premium_activo === true &&
    detalle?.suscriptor?.estado_suscripcion === "activa";

  const alertasError = detalle?.alertas_conciliacion.filter((a) => a.nivel === "error") ?? [];
  const alertasWarning = detalle?.alertas_conciliacion.filter((a) => a.nivel === "warning") ?? [];
  const alertasInfo = detalle?.alertas_conciliacion.filter((a) => a.nivel === "info") ?? [];
  const totalAlertas = detalle?.alertas_conciliacion.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700/60 shrink-0">
          <div className="flex items-center gap-2">
            {diag && (
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${diag.healthy ? "bg-green-500" : "bg-red-500"}`}
              />
            )}
            <span className="text-white font-semibold text-sm">
              Suscripción #{item.id}
            </span>
            {item.suscriptor_id && (
              <span className="text-gray-500 text-xs">· Suscriptor #{item.suscriptor_id}</span>
            )}
            {totalAlertas > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-900/60 text-red-300 border border-red-700/50">
                {totalAlertas} alerta{totalAlertas !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Cerrar detalle"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Diagnóstico local (de la lista) */}
          {diag && (
            <div className={`rounded-lg border px-4 py-3 ${diagCls}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {diag.estado_resumen || "ok"}
                </span>
                {!diag.healthy && (
                  <AlertTriangle size={13} className="shrink-0" />
                )}
              </div>
              {diag.accion_sugerida && diag.accion_sugerida !== "sin_accion" && (
                <p className="text-xs opacity-80">Acción: {diag.accion_sugerida}</p>
              )}
              {diag.warnings.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {diag.warnings.map((w) => (
                    <span
                      key={w}
                      className="text-xs bg-black/20 rounded px-1.5 py-0.5 font-mono"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Alertas de conciliación (fetch-based) */}
          {cargandoDetalle && (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
              <RefreshCw size={12} className="animate-spin" />
              Cargando datos del suscriptor…
            </div>
          )}
          {errorDetalle && (
            <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-300">
              No se pudo cargar el detalle: {errorDetalle}
            </div>
          )}
          {detalle && totalAlertas > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Alertas de conciliación
              </p>
              <div className="space-y-1.5">
                {alertasError.map((a) => (
                  <div key={a.codigo} className="flex gap-2 items-start px-3 py-2 rounded-lg border border-red-800/50 bg-red-950/30">
                    <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-mono text-xs text-red-300">{a.codigo}</span>
                      <p className="text-xs text-red-200/80 mt-0.5">{a.descripcion}</p>
                    </div>
                  </div>
                ))}
                {alertasWarning.map((a) => (
                  <div key={a.codigo} className="flex gap-2 items-start px-3 py-2 rounded-lg border border-amber-800/50 bg-amber-950/30">
                    <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-mono text-xs text-amber-300">{a.codigo}</span>
                      <p className="text-xs text-amber-200/80 mt-0.5">{a.descripcion}</p>
                    </div>
                  </div>
                ))}
                {alertasInfo.map((a) => (
                  <div key={a.codigo} className="flex gap-2 items-start px-3 py-2 rounded-lg border border-sky-800/50 bg-sky-950/30">
                    <Info size={13} className="text-sky-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-mono text-xs text-sky-300">{a.codigo}</span>
                      <p className="text-xs text-sky-200/80 mt-0.5">{a.descripcion}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {detalle && totalAlertas === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-800/50 bg-green-950/30 text-xs text-green-300">
              <Check size={13} />
              Sin alertas de conciliación detectadas
            </div>
          )}

          {/* Estado del suscriptor (fetch-based) */}
          {detalle?.suscriptor && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Estado del suscriptor (perfil)
              </p>
              <DataRow label="Nombre" value={detalle.suscriptor.nombre} />
              <DataRow label="WhatsApp" value={<span className="font-mono">{detalle.suscriptor.whatsapp ?? "—"}</span>} />
              <DataRow label="Signo" value={detalle.suscriptor.signo} />
              <DataRow label="Tipo suscripción" value={<span className="font-mono text-xs">{detalle.suscriptor.tipo_suscripcion}</span>} />
              <DataRow label="Estado suscripción" value={estadoLocalBadge(detalle.suscriptor.estado_suscripcion ?? "")} />
              <DataRow label="Premium activo" value={<BoolIcon val={detalle.suscriptor.premium_activo} />} />
              <DataRow label="Venc. premium (perfil)" value={
                <span className={detalle.suscriptor.fecha_vencimiento_premium && new Date(detalle.suscriptor.fecha_vencimiento_premium) < new Date() ? "text-red-400" : ""}>
                  {fmtDate(detalle.suscriptor.fecha_vencimiento_premium)}
                </span>
              } />
              <DataRow label="Inicio premium" value={fmtDate(detalle.suscriptor.fecha_inicio_premium)} />
              <DataRow label="WhatsApp confirmado" value={<BoolIcon val={detalle.suscriptor.whatsapp_confirmado} />} />
              <DataRow label="Estado mensaje" value={<span className="font-mono text-xs">{detalle.suscriptor.estado_mensaje ?? "—"}</span>} />
              <DataRow label="Auto renovación" value={<BoolIcon val={detalle.suscriptor.auto_renovacion_activa} />} />
              <DataRow label="Bienvenida enviada" value={<BoolIcon val={detalle.suscriptor.bienvenida_enviada} />} />
              <DataRow label="1er envío premium" value={<BoolIcon val={detalle.suscriptor.primer_envio_premium_enviado} />} />
            </div>
          )}

          {/* Datos principales de suscripción (de la lista) */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Datos de suscripción
            </p>
            <DataRow label="Provider" value={item.provider} />
            <DataRow label="Estado local" value={estadoLocalBadge(item.estado)} />
            <DataRow label="Preapproval ID" value={
              <span className="font-mono">{item.preapproval_id_masked ?? "—"}</span>
            } />
            <DataRow label="External reference" value={
              <span className="font-mono text-xs">{item.external_reference ?? "—"}</span>
            } />
            <DataRow label="MP Status" value={mpStatusBadge(item.preapproval_status_mp)} />
            <DataRow label="Provisional" value={<BoolIcon val={item.provisional} />} />
            <DataRow label="Auto renovación" value={<BoolIcon val={item.auto_renovacion_activa} />} />
            {item.reason && <DataRow label="Plan (reason)" value={item.reason} />}
            {item.amount !== null && (
              <DataRow
                label="Monto"
                value={`${item.currency_id ?? ""} ${item.amount} / ${item.frequency} ${item.frequency_type ?? ""}`}
              />
            )}
          </div>

          {/* Fechas */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Fechas
            </p>
            <DataRow label="Creación (tabla)" value={fmtDate(item.fecha_creacion)} />
            <DataRow label="Activación provisional" value={fmtDate(item.fecha_activacion_provisional)} />
            <DataRow label="Activación definitiva" value={fmtDate(item.fecha_activacion_definitiva)} />
            <DataRow
              label="Vencimiento actual"
              value={
                <span className={
                  item.fecha_vencimiento_actual &&
                  new Date(item.fecha_vencimiento_actual) < new Date()
                    ? "text-red-400"
                    : ""
                }>
                  {fmtDate(item.fecha_vencimiento_actual)}
                </span>
              }
            />
            <DataRow label="Cancelación" value={fmtDate(item.fecha_cancelacion)} />
            <DataRow label="created_at" value={fmtDateShort(item.created_at)} />
            <DataRow label="updated_at" value={fmtDateShort(item.updated_at)} />
          </div>

          {/* Pagos recientes (fetch-based) */}
          {detalle && detalle.pagos_recientes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Pagos recientes ({detalle.pagos_recientes.length})
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/60">
                      <th className="text-left px-3 py-2 text-gray-500">ID</th>
                      <th className="text-left px-3 py-2 text-gray-500">Fecha</th>
                      <th className="text-left px-3 py-2 text-gray-500">Status</th>
                      <th className="text-left px-3 py-2 text-gray-500">Monto</th>
                      <th className="text-left px-3 py-2 text-gray-500">Medio</th>
                      <th className="text-left px-3 py-2 text-gray-500">Proc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.pagos_recientes.map((p) => (
                      <tr key={p.id_pago} className="border-b border-gray-800/50 last:border-0">
                        <td className="px-3 py-2 font-mono text-gray-400">{p.id_pago}</td>
                        <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDateShort(p.fecha_pago ?? p.created_at)}</td>
                        <td className={`px-3 py-2 font-mono ${PAGO_STATUS_CLS[p.status] ?? "text-gray-400"}`}>{p.status}</td>
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">
                          {p.amount != null ? `${p.currency ?? ""} ${p.amount}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{p.medio_pago ?? "—"}</td>
                        <td className="px-3 py-2"><BoolIcon val={p.procesado} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {detalle && detalle.pagos_recientes.length === 0 && (
            <div className="text-xs text-gray-600 py-1">Sin pagos recientes registrados.</div>
          )}

          {/* Descuento (de la lista) */}
          {hasDescuento && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Descuento
              </p>
              <DataRow label="Código" value={
                <span className="font-mono text-violet-300">{item.codigo_descuento}</span>
              } />
              {item.codigo_descuento_id !== null && (
                <DataRow label="ID descuento" value={item.codigo_descuento_id} />
              )}
              <DataRow label="Estado descuento" value={
                item.descuento_estado
                  ? <span className={
                      item.descuento_estado === "fallido"
                        ? "text-red-400 font-mono text-xs"
                        : item.descuento_estado === "aplicado"
                        ? "text-green-400 font-mono text-xs"
                        : "font-mono text-xs text-gray-300"
                    }>{item.descuento_estado}</span>
                  : "—"
              } />
              {item.descuento_metadata && (
                <div className="mt-1">
                  <button
                    onClick={() => setShowDescMetadata((v) => !v)}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showDescMetadata ? "▲ Ocultar metadata" : "▼ Ver metadata descuento"}
                  </button>
                  {showDescMetadata && (
                    <pre className="mt-2 text-xs bg-gray-950 border border-gray-700 rounded p-3 overflow-x-auto text-gray-300 max-h-40">
                      {JSON.stringify(item.descuento_metadata, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Acciones */}
          {item.suscriptor_id && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Acciones
              </p>
              {!detalle && !cargandoDetalle && (
                <p className="text-xs text-gray-600">Cargando estado para determinar acciones disponibles…</p>
              )}
              {detalle && !puedeRenovar && (
                <p className="text-xs text-gray-600">
                  Renovar premium no disponible: requiere premium activo y suscripción activa.
                  Estado actual: premium_activo={String(detalle.suscriptor?.premium_activo)}, estado_suscripcion={detalle.suscriptor?.estado_suscripcion ?? "—"}.
                </p>
              )}
              {detalle && puedeRenovar && (
                <AccionesRenovarPremium
                  idSuscriptor={item.suscriptor_id}
                  onAccionOk={onAccionOk}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================

export default function SuscripcionesPage() {
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(DEFAULT_FILTROS);
  const [pendiente, setPendiente] = useState<Filtros>(DEFAULT_FILTROS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [alertaFiltro, setAlertaFiltro] = useState<"todas" | "con_alertas">("todas");

  const cargar = useCallback(async (f: Filtros) => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/suscripciones?${buildQueryString(f)}`);
      const json: ApiResponse = await res.json();
      if (!json.ok) {
        setErrorMsg((json as unknown as Record<string, string>).detalle ?? "Error al cargar suscripciones");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setErrorMsg("Error de red al cargar suscripciones");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(filtros);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFiltro(patch: Partial<Filtros>) {
    const next: Filtros = { ...filtros, ...patch, offset: 0 };
    setSelectedId(null);
    setFiltros(next);
    setPendiente(next);
    cargar(next);
  }

  function handleBuscar() {
    const next = { ...pendiente, offset: 0 };
    setSelectedId(null);
    setFiltros(next);
    cargar(next);
  }

  function handlePaginar(newOffset: number) {
    const next = { ...filtros, offset: newOffset };
    setSelectedId(null);
    setFiltros(next);
    cargar(next);
  }

  function handleRowClick(s: Suscripcion) {
    setSelectedId((prev) => (prev === s.id ? null : s.id));
  }

  async function cerrarSesion() {
    setCerrandoSesion(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
      window.location.href = "/admin/login";
    } catch {
      setCerrandoSesion(false);
    }
  }

  const suscripciones = data?.suscripciones ?? [];
  const paginacion = data?.paginacion ?? null;
  const conteos = data?.conteos_pagina ?? {};
  const warnings = data?.warnings ?? [];

  const diagConteos = conteos.diagnostico ?? {};
  const diagKeys = Object.entries(diagConteos).filter(([, v]) => v > 0);

  // Client-side filter: "Con alertas" filters by diagnostico_admin.healthy === false
  const displayedSuscripciones =
    alertaFiltro === "con_alertas"
      ? suscripciones.filter((s) => s.diagnostico_admin?.healthy === false)
      : suscripciones;

  const conAlertasCount = suscripciones.filter((s) => s.diagnostico_admin?.healthy === false).length;

  const selectedItem = suscripciones.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
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
        {/* Nav */}
        <div className="max-w-7xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <AdminNav current="/admin/suscripciones" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Estado local */}
          <select
            value={pendiente.estado}
            onChange={(e) => setPendiente((p) => ({ ...p, estado: e.target.value }))}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los estados</option>
            <option value="activa">activa</option>
            <option value="activa_provisional">activa_provisional</option>
            <option value="pendiente_autorizacion">pendiente_autorizacion</option>
            <option value="cancelada">cancelada</option>
            <option value="finalizada">finalizada</option>
          </select>

          {/* MP Status */}
          <select
            value={pendiente.preapproval_status_mp}
            onChange={(e) => setPendiente((p) => ({ ...p, preapproval_status_mp: e.target.value }))}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los MP status</option>
            <option value="authorized">authorized</option>
            <option value="pending">pending</option>
            <option value="paused">paused</option>
            <option value="cancelled">cancelled</option>
            <option value="expired">expired</option>
          </select>

          {/* Fecha desde */}
          <input
            type="date"
            value={pendiente.fecha_desde}
            onChange={(e) => setPendiente((p) => ({ ...p, fecha_desde: e.target.value }))}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          />

          {/* Fecha hasta */}
          <input
            type="date"
            value={pendiente.fecha_hasta}
            onChange={(e) => setPendiente((p) => ({ ...p, fecha_hasta: e.target.value }))}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          />

          {/* Buscar */}
          <button
            onClick={handleBuscar}
            className="border border-violet-700 bg-violet-800/40 hover:bg-violet-700/60 text-violet-200 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Buscar
          </button>

          {/* Solo vencidas */}
          <button
            onClick={() => applyFiltro({ solo_vencidas: !filtros.solo_vencidas })}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
              filtros.solo_vencidas
                ? "border-red-700 bg-red-900/40 text-red-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
            }`}
          >
            Solo vencidas
          </button>

          {/* Solo con descuento */}
          <button
            onClick={() => applyFiltro({ solo_con_descuento: !filtros.solo_con_descuento })}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
              filtros.solo_con_descuento
                ? "border-violet-700 bg-violet-900/40 text-violet-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
            }`}
          >
            Solo con descuento
          </button>

          {/* Con alertas (client-side) */}
          <button
            onClick={() => setAlertaFiltro((v) => (v === "con_alertas" ? "todas" : "con_alertas"))}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
              alertaFiltro === "con_alertas"
                ? "border-red-700 bg-red-900/40 text-red-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
            }`}
          >
            Con alertas {conAlertasCount > 0 && `(${conAlertasCount})`}
          </button>

          {/* Limpiar fechas */}
          {(filtros.fecha_desde || filtros.fecha_hasta) && (
            <button
              onClick={() => {
                setPendiente((p) => ({ ...p, fecha_desde: "", fecha_hasta: "" }));
                applyFiltro({ fecha_desde: "", fecha_hasta: "" });
              }}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-2 transition-colors"
            >
              Limpiar fechas
            </button>
          )}
        </div>

        {/* Conteo strips — diagnóstico */}
        {diagKeys.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {diagKeys.map(([key, count]) => (
              <span
                key={key}
                className={`text-xs px-2.5 py-1 rounded-full border font-mono ${
                  key === "ok"
                    ? "border-green-800/50 bg-green-950/40 text-green-300"
                    : key === "vencida" || key === "mp_no_operativo"
                    ? "border-red-800/50 bg-red-950/40 text-red-300"
                    : "border-amber-800/50 bg-amber-950/40 text-amber-300"
                }`}
              >
                {key}: {count}
              </span>
            ))}
          </div>
        )}

        {/* Loading */}
        {cargando && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 text-sm text-gray-400">
            <span className="animate-pulse">Cargando suscripciones…</span>
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
          <div className="mb-4 flex flex-wrap gap-1.5">
            {warnings.map((w) => (
              <span
                key={w}
                className="text-xs px-2 py-0.5 rounded border border-amber-800/50 bg-amber-950/40 text-amber-300 font-mono"
              >
                {w}
              </span>
            ))}
          </div>
        )}

        {/* Active filter note */}
        {alertaFiltro === "con_alertas" && !cargando && (
          <div className="mb-3 text-xs text-gray-500">
            Mostrando {displayedSuscripciones.length} de {suscripciones.length} con diagnóstico no saludable (filtro local).
          </div>
        )}

        {/* Table */}
        {!cargando && !errorMsg && (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/60">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">#ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">#Suscriptor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Estado local</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">MP Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Preapproval ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Monto</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Vencimiento</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Descuento</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSuscripciones.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-600 text-sm">
                        Sin resultados para los filtros actuales
                      </td>
                    </tr>
                  )}
                  {displayedSuscripciones.map((s) => {
                    const isSelected = s.id === selectedId;
                    const bg = rowBg(s, isSelected);
                    const hasWarnings = (s.diagnostico_admin?.warnings?.length ?? 0) > 0;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => handleRowClick(s)}
                        className={`border-b border-gray-800/50 cursor-pointer transition-colors hover:bg-gray-800/30 ${bg}`}
                      >
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{s.id}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                          {s.suscriptor_id ?? "—"}
                        </td>
                        <td className="px-4 py-3">{estadoLocalBadge(s.estado)}</td>
                        <td className="px-4 py-3">{mpStatusBadge(s.preapproval_status_mp)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">
                          {s.preapproval_id_masked ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                          {s.amount !== null
                            ? `${s.currency_id ?? ""} ${s.amount}`
                            : "—"}
                        </td>
                        <td className={`px-4 py-3 text-xs whitespace-nowrap ${
                          s.fecha_vencimiento_actual &&
                          new Date(s.fecha_vencimiento_actual) < new Date()
                            ? "text-red-400"
                            : "text-gray-400"
                        }`}>
                          {fmtDateShort(s.fecha_vencimiento_actual)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {s.codigo_descuento ? (
                            <span className="font-mono text-violet-400">{s.codigo_descuento}</span>
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasWarnings && (
                            <AlertTriangle size={13} className="text-amber-400 inline" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {paginacion && paginacion.total > 0 && (
              <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                <span>
                  {paginacion.offset + 1}–{Math.min(paginacion.offset + paginacion.limit, paginacion.total)} de {paginacion.total}
                  {alertaFiltro === "con_alertas" && ` · mostrando ${displayedSuscripciones.length} con alertas`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={paginacion.offset === 0}
                    onClick={() => handlePaginar(Math.max(0, paginacion.offset - paginacion.limit))}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 disabled:opacity-40 hover:bg-gray-800 transition-colors"
                  >
                    <ChevronLeft size={13} /> Anterior
                  </button>
                  <button
                    disabled={paginacion.next_offset === null}
                    onClick={() => paginacion.next_offset !== null && handlePaginar(paginacion.next_offset)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 disabled:opacity-40 hover:bg-gray-800 transition-colors"
                  >
                    Siguiente <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}

          </>
        )}
      </main>
      {selectedItem && (
        <SuscripcionDetalle
          item={selectedItem}
          onClose={() => setSelectedId(null)}
          onAccionOk={() => cargar(filtros)}
        />
      )}
    </div>
  );
}
