"use client";
import { useState, useEffect } from "react";
import { Check, X, AlertTriangle, AlertCircle, Clock } from "lucide-react";

// ===========================================================================
// Types
// ===========================================================================

interface Diagnostico {
  premium_activo: boolean;
  estado_suscripcion: string;
  whatsapp_confirmado: boolean;
  estado_mensaje: string | null;
  mensajes_pendientes: number;
  mensajes_fallidos: number;
  contenido_pendiente: number;
}

interface SuscriptorData {
  id: number;
  nombre: string;
  email: string;
  whatsapp: string;
  signo: string;
  tipo_suscripcion: string;
  estado_suscripcion: string;
  contenido_preferido: string;
  fecha_alta: string | null;
  fecha_inicio_premium: string | null;
  fecha_vencimiento_premium: string | null;
  fecha_baja: string | null;
  motivo_baja: string | null;
  auto_renovacion_activa: boolean;
  premium_activo: boolean;
  whatsapp_confirmado: boolean;
  fecha_confirmacion_whatsapp: string | null;
  estado_mensaje: string | null;
  creado_en: string;
  actualizado_en: string;
}

interface SuscripcionActual {
  id: string | number | null;
  estado: string;
  provisional: boolean;
  auto_renovacion_activa: boolean;
  preapproval_status_mp: string | null;
  fecha_creacion: string | null;
  fecha_activacion_provisional: string | null;
  fecha_activacion_definitiva: string | null;
  fecha_vencimiento_actual: string | null;
  fecha_cancelacion: string | null;
  reason: string | null;
  currency_id: string;
  amount: number;
  frequency: number;
  frequency_type: string;
  codigo_descuento: string | null;
  descuento_estado: string | null;
  created_at: string;
  updated_at: string;
}

interface Mensaje {
  tipo_mensaje: string;
  estado: string;
  canal_envio: string | null;
  nombre_plantilla: string | null;
  fecha_enviado: string | null;
  fecha_creado: string;
  intentos: number;
  ultimo_error: string | null;
  fecha_envio_programada: string | null;
}

interface MensajeFallido {
  tipo_mensaje: string;
  estado: string;
  nombre_plantilla: string | null;
  intentos: number;
  ultimo_error: string | null;
  fecha_creado: string;
  fecha_ultimo_intento: string | null;
}

interface ContenidoPremium {
  fecha_creacion: string;
  generado: boolean;
  ciclo_semana: number | null;
  fecha_envio_programada: string | null;
  fecha_envio_real: string | null;
  tipo: string;
  estado_envio: string;
  ultimo_error: string | null;
  contenido_preferido: string | null;
  numero: number | null;
  origen_generacion: string | null;
}

interface Pago {
  fecha_pago: string | null;
  status: string;
  amount: number;
  currency: string;
  medio_pago: string | null;
  tipo_pago: string | null;
  procesado: boolean;
  created_at: string;
}

interface Descuento {
  codigo: string;
  estado_uso: string;
  moneda: string | null;
  precio_original: number | null;
  precio_aplicado: number | null;
  valor_descuento_aplicado: number | null;
  precio_primera_cuota: number | null;
  precio_recurrente_normal: number | null;
  dias_gratis_aplicados: number | null;
  meses_gratis_aplicados: number | null;
  fecha_aplicacion: string | null;
  creado_en: string;
}

interface DetalleData {
  ok: boolean;
  healthy: boolean;
  encontrado: boolean;
  diagnostico: Diagnostico | null;
  warnings: string[];
  suscriptor: SuscriptorData;
  suscripcion_actual: SuscripcionActual | null;
  ultimos_mensajes: Mensaje[];
  mensajes_fallidos: MensajeFallido[];
  contenido_premium_reciente: ContenidoPremium[];
  pagos_recientes: Pago[];
  descuentos_usados: Descuento[];
}

// ===========================================================================
// Helpers
// ===========================================================================

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-UY", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-UY", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function estadoMensajeCls(estado: string): string {
  if (estado === "enviado") return "bg-emerald-900/40 text-emerald-300";
  if (estado === "fallido" || estado === "fallo_definitivo") return "bg-red-900/40 text-red-300";
  if (estado === "pendiente") return "bg-amber-900/40 text-amber-300";
  return "bg-gray-800 text-gray-400";
}

// ===========================================================================
// Sub-components
// ===========================================================================

function Sect({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-gray-800/50 text-sm last:border-0">
      <span className="w-44 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

function BoolVal({ value, trueLabel = "Sí", falseLabel = "No" }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-emerald-400">
      <Check size={12} />{trueLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-gray-500">
      <X size={12} />{falseLabel}
    </span>
  );
}

// ===========================================================================
// AccionesPremium
// ===========================================================================

type AccionKey =
  | "activar_premium_manual"
  | "desactivar_premium_manual"
  | "cambiar_fecha_vencimiento"
  | "cambiar_estado_suscripcion";

interface AccionInfo {
  label: string;
  descripcion: string;
  impacto: string;
  peligrosa: boolean;
}

const ACCION_INFO: Record<AccionKey, AccionInfo> = {
  activar_premium_manual: {
    label: "Activar Premium",
    descripcion: "Activa el acceso premium manualmente.",
    impacto:
      "Cambia premium_activo → true y estado_suscripcion → activa. NO crea pago ni suscripción en Mercado Pago.",
    peligrosa: false,
  },
  desactivar_premium_manual: {
    label: "Desactivar Premium",
    descripcion: "Desactiva el acceso premium manualmente.",
    impacto:
      "Cambia premium_activo → false y estado_suscripcion → suspendida. NO cancela Mercado Pago.",
    peligrosa: true,
  },
  cambiar_fecha_vencimiento: {
    label: "Cambiar Vencimiento",
    descripcion: "Ajusta la fecha de vencimiento del premium.",
    impacto:
      "Actualiza fecha_vencimiento_premium en la base de datos local. No modifica Mercado Pago.",
    peligrosa: false,
  },
  cambiar_estado_suscripcion: {
    label: "Cambiar Estado",
    descripcion: "Cambia el estado_suscripcion local del suscriptor.",
    impacto:
      "Modifica estado_suscripcion. No afecta Mercado Pago ni premium_activo directamente.",
    peligrosa: false,
  },
};

const ESTADOS_SUSCRIPCION = [
  "pendiente_autorizacion",
  "activa",
  "suspendida",
  "cancelada_no_renueva",
  "finalizada",
] as const;

function AccionesPremium({
  suscriptor,
  onAccionOk,
}: {
  suscriptor: SuscriptorData;
  onAccionOk: () => void;
}) {
  const [accionActiva, setAccionActiva] = useState<AccionKey | null>(null);
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState("");
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  function abrirAccion(accion: AccionKey) {
    setAccionActiva(accion);
    setMotivo("");
    setFecha("");
    setNuevoEstado("");
    setResultado(null);
  }

  function cancelar() {
    if (submitting) return;
    setAccionActiva(null);
    setResultado(null);
  }

  async function ejecutar() {
    if (!accionActiva || submitting) return;
    const motivoTrim = motivo.trim();
    if (motivoTrim.length < 5) return;

    setSubmitting(true);
    setResultado(null);

    try {
      const body: Record<string, unknown> = {
        id_suscriptor: suscriptor.id,
        accion: accionActiva,
        motivo: motivoTrim,
      };
      if (accionActiva === "activar_premium_manual" || accionActiva === "cambiar_fecha_vencimiento") {
        body.fecha_vencimiento_premium = fecha;
      }
      if (accionActiva === "cambiar_estado_suscripcion") {
        body.nuevo_estado_suscripcion = nuevoEstado;
      }

      const res = await fetch("/api/admin/suscriptor-accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let json: Record<string, unknown>;
      try {
        json = await res.json();
      } catch {
        json = {};
      }

      if (!res.ok || !json.ok) {
        setResultado({
          ok: false,
          texto:
            (json.detalle as string) ??
            (json.motivo as string) ??
            `Error HTTP ${res.status}`,
        });
      } else {
        setResultado({
          ok: true,
          texto: (json.mensaje as string) ?? "Acción aplicada correctamente.",
        });
        // Esperar un momento para que el usuario vea el resultado, luego refrescar
        setTimeout(() => {
          cancelar();
          onAccionOk();
        }, 1800);
      }
    } catch (e: unknown) {
      setResultado({
        ok: false,
        texto: e instanceof Error ? e.message : "Error de red",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const needsFecha =
    accionActiva === "activar_premium_manual" ||
    accionActiva === "cambiar_fecha_vencimiento";
  const needsEstado = accionActiva === "cambiar_estado_suscripcion";

  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha);
  const canSubmit =
    motivo.trim().length >= 5 &&
    (!needsFecha || fechaValida) &&
    (!needsEstado || !!nuevoEstado);

  const info = accionActiva ? ACCION_INFO[accionActiva] : null;

  return (
    <div>
      {/* Botones de acción */}
      {!accionActiva && (
        <div className="flex flex-wrap gap-2">
          {!suscriptor.premium_activo ? (
            <button
              onClick={() => abrirAccion("activar_premium_manual")}
              className="text-xs px-3 py-1.5 rounded-lg border border-emerald-700/70 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 transition-colors"
            >
              Activar Premium
            </button>
          ) : (
            <button
              onClick={() => abrirAccion("desactivar_premium_manual")}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-800/70 bg-red-950/40 text-red-300 hover:bg-red-900/50 transition-colors"
            >
              Desactivar Premium
            </button>
          )}

          <button
            onClick={() => abrirAccion("cambiar_fecha_vencimiento")}
            className="text-xs px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors"
          >
            Cambiar Vencimiento
          </button>

          <button
            onClick={() => abrirAccion("cambiar_estado_suscripcion")}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-600/60 bg-gray-800/30 text-gray-300 hover:bg-gray-700/40 transition-colors"
          >
            Cambiar Estado
          </button>
        </div>
      )}

      {/* Panel de confirmación */}
      {accionActiva && info && (
        <div
          className={`rounded-lg border p-4 ${
            info.peligrosa
              ? "border-red-800/60 bg-red-950/25"
              : "border-amber-800/40 bg-amber-950/15"
          }`}
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">
              Confirmar: {info.label}
            </span>
            <button
              onClick={cancelar}
              disabled={submitting}
              className="text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
              aria-label="Cancelar"
            >
              <X size={15} />
            </button>
          </div>

          {/* Contexto de la acción */}
          <div className="mb-4 space-y-1.5 text-xs">
            <p className="text-gray-400">
              Suscriptor:{" "}
              <span className="text-white font-semibold">{suscriptor.nombre}</span>{" "}
              <span className="text-gray-500">(#{suscriptor.id})</span>
            </p>
            <p className="text-gray-400">{info.descripcion}</p>
            <p
              className={`text-xs font-medium ${
                info.peligrosa ? "text-red-300" : "text-amber-300"
              }`}
            >
              Impacto: {info.impacto}
            </p>
          </div>

          {/* Campo: fecha de vencimiento */}
          {needsFecha && (
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">
                Nueva fecha de vencimiento{" "}
                <span className="text-red-400">*</span>{" "}
                <span className="text-gray-600">(YYYY-MM-DD)</span>
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={submitting}
                className="w-full border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500 disabled:opacity-50"
              />
            </div>
          )}

          {/* Campo: nuevo estado */}
          {needsEstado && (
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">
                Nuevo estado_suscripcion <span className="text-red-400">*</span>
              </label>
              <select
                value={nuevoEstado}
                onChange={(e) => setNuevoEstado(e.target.value)}
                disabled={submitting}
                className="w-full border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500 disabled:opacity-50"
              >
                <option value="">Seleccionar estado…</option>
                {ESTADOS_SUSCRIPCION.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Campo: motivo */}
          <div className="mb-3">
            <label className="block text-xs text-gray-400 mb-1">
              Motivo <span className="text-red-400">*</span>{" "}
              <span className="text-gray-600">(mínimo 5 caracteres)</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={submitting}
              rows={2}
              placeholder="Describir el motivo de esta acción…"
              className="w-full border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500 resize-none placeholder-gray-600 disabled:opacity-50"
            />
            <p className="text-right text-xs text-gray-600 mt-0.5">
              {motivo.trim().length} car.
            </p>
          </div>

          {/* Resultado */}
          {resultado && (
            <div
              className={`mb-3 text-xs rounded px-3 py-2 flex items-start gap-2 ${
                resultado.ok
                  ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/40"
                  : "bg-red-950/50 text-red-300 border border-red-800/40"
              }`}
            >
              {resultado.ok ? (
                <Check size={12} className="shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              )}
              <span>{resultado.texto}</span>
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-end gap-2">
            <button
              onClick={cancelar}
              disabled={submitting}
              className="text-xs px-3 py-1.5 border border-gray-700 rounded-lg text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={ejecutar}
              disabled={!canSubmit || submitting}
              className={`text-xs px-4 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-40 ${
                info.peligrosa
                  ? "border-red-700 bg-red-900/50 text-red-200 hover:bg-red-800/60"
                  : "border-violet-700 bg-violet-900/50 text-violet-200 hover:bg-violet-800/60"
              }`}
            >
              {submitting ? "Ejecutando…" : `Confirmar — ${info.label}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Main component
// ===========================================================================

export interface SuscriptorDetalleProps {
  id: number;
  onClose: () => void;
}

export function SuscriptorDetalle({ id, onClose }: SuscriptorDetalleProps) {
  const [data, setData] = useState<DetalleData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setCargando(true);
    setErrorMsg(null);
    setData(null);

    fetch(`/api/admin/suscriptor-detalle?id=${id}`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? "Error al cargar detalle");
        } else if (!json.encontrado) {
          setErrorMsg("Suscriptor no encontrado");
        } else {
          setData(json as DetalleData);
        }
      })
      .catch((e: unknown) => setErrorMsg(e instanceof Error ? e.message : "Error de red"))
      .finally(() => setCargando(false));
  }, [id, refreshKey]);

  return (
    <div className="mt-4 rounded-xl border border-gray-700 bg-gray-900/70 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 bg-gray-900">
        <div className="flex items-center gap-2">
          {data && (
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                data.healthy ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
          )}
          <span className="text-sm font-medium text-white">
            {data
              ? `${data.suscriptor.nombre} — #${data.suscriptor.id}`
              : "Detalle suscriptor"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white transition-colors p-1 rounded"
          aria-label="Cerrar detalle"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-5 py-4">
        {/* Loading */}
        {cargando && (
          <p className="text-sm text-gray-500 animate-pulse py-6 text-center">
            Cargando detalle…
          </p>
        )}

        {/* Error */}
        {!cargando && errorMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            <AlertCircle size={14} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Data */}
        {!cargando && data && (
          <>
            {/* Warnings */}
            {data.warnings.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {data.warnings.map((w) => (
                  <span
                    key={w}
                    className="inline-flex items-center gap-1 text-xs bg-amber-900/40 text-amber-300 border border-amber-800/40 px-2 py-0.5 rounded-full"
                  >
                    <AlertTriangle size={10} />
                    {w}
                  </span>
                ))}
              </div>
            )}

            {/* Diagnostico cards */}
            {data.diagnostico && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                <div className="bg-gray-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-500 mb-1">Premium</p>
                  <BoolVal
                    value={data.diagnostico.premium_activo}
                    trueLabel="Activo"
                    falseLabel="Inactivo"
                  />
                </div>
                <div className="bg-gray-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-500 mb-1">WhatsApp</p>
                  <BoolVal
                    value={data.diagnostico.whatsapp_confirmado}
                    trueLabel="Confirmado"
                    falseLabel="Sin confirmar"
                  />
                </div>
                <div className="bg-gray-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-500 mb-1">Suscripción</p>
                  <span className="text-sm text-gray-200">
                    {data.diagnostico.estado_suscripcion || "—"}
                  </span>
                </div>
                <div className="bg-gray-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-500 mb-1">Outbox</p>
                  <span className="text-sm text-gray-200">
                    {data.diagnostico.mensajes_pendientes} pend.{" "}
                    <span
                      className={
                        data.diagnostico.mensajes_fallidos > 0
                          ? "text-red-400"
                          : ""
                      }
                    >
                      / {data.diagnostico.mensajes_fallidos} fall.
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Datos principales */}
            <Sect title="Datos principales">
              <DataRow label="Email" value={data.suscriptor.email || "—"} />
              <DataRow
                label="WhatsApp"
                value={
                  <span className="font-mono text-xs">
                    {data.suscriptor.whatsapp || "—"}
                  </span>
                }
              />
              <DataRow label="Signo" value={data.suscriptor.signo || "—"} />
              <DataRow
                label="Tipo suscripción"
                value={data.suscriptor.tipo_suscripcion || "—"}
              />
              <DataRow
                label="Contenido preferido"
                value={data.suscriptor.contenido_preferido || "—"}
              />
              <DataRow
                label="Estado mensaje"
                value={data.suscriptor.estado_mensaje || "activo"}
              />
              <DataRow
                label="Auto renovación"
                value={<BoolVal value={data.suscriptor.auto_renovacion_activa} />}
              />
              <DataRow
                label="Fecha alta"
                value={fmtDate(data.suscriptor.fecha_alta)}
              />
              <DataRow
                label="Inicio premium"
                value={fmtDate(data.suscriptor.fecha_inicio_premium)}
              />
              <DataRow
                label="Vence premium"
                value={fmtDate(data.suscriptor.fecha_vencimiento_premium)}
              />
              {data.suscriptor.fecha_baja && (
                <DataRow
                  label="Fecha baja"
                  value={fmtDate(data.suscriptor.fecha_baja)}
                />
              )}
              {data.suscriptor.motivo_baja && (
                <DataRow label="Motivo baja" value={data.suscriptor.motivo_baja} />
              )}
              <DataRow
                label="Última actualización"
                value={fmtFecha(data.suscriptor.actualizado_en)}
              />
            </Sect>

            {/* Suscripción actual */}
            {data.suscripcion_actual && (
              <Sect title="Suscripción actual">
                <DataRow label="Estado" value={data.suscripcion_actual.estado} />
                <DataRow
                  label="Status MP"
                  value={data.suscripcion_actual.preapproval_status_mp || "—"}
                />
                <DataRow
                  label="Monto"
                  value={`${data.suscripcion_actual.amount} ${data.suscripcion_actual.currency_id}`}
                />
                <DataRow
                  label="Frecuencia"
                  value={`${data.suscripcion_actual.frequency} ${data.suscripcion_actual.frequency_type}`}
                />
                <DataRow
                  label="Auto renovación"
                  value={
                    <BoolVal value={data.suscripcion_actual.auto_renovacion_activa} />
                  }
                />
                <DataRow
                  label="Provisional"
                  value={<BoolVal value={data.suscripcion_actual.provisional} />}
                />
                <DataRow
                  label="Activación definitiva"
                  value={fmtDate(data.suscripcion_actual.fecha_activacion_definitiva)}
                />
                <DataRow
                  label="Vencimiento"
                  value={fmtDate(data.suscripcion_actual.fecha_vencimiento_actual)}
                />
                {data.suscripcion_actual.fecha_cancelacion && (
                  <DataRow
                    label="Cancelación"
                    value={fmtDate(data.suscripcion_actual.fecha_cancelacion)}
                  />
                )}
                {data.suscripcion_actual.reason && (
                  <DataRow label="Motivo" value={data.suscripcion_actual.reason} />
                )}
                {data.suscripcion_actual.codigo_descuento && (
                  <DataRow
                    label="Descuento"
                    value={`${data.suscripcion_actual.codigo_descuento} (${data.suscripcion_actual.descuento_estado})`}
                  />
                )}
              </Sect>
            )}

            {/* Últimos mensajes */}
            {data.ultimos_mensajes.length > 0 && (
              <Sect title="Últimos mensajes">
                <div className="overflow-x-auto rounded-lg border border-gray-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-800/60 text-left">
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Tipo
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Estado
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Plantilla
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Fecha
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium text-right whitespace-nowrap">
                          Intentos
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ultimos_mensajes.map((m, i) => (
                        <tr
                          key={i}
                          className="border-t border-gray-800/50 hover:bg-gray-800/20"
                        >
                          <td className="px-3 py-2 text-gray-300">{m.tipo_mensaje}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs ${estadoMensajeCls(
                                m.estado
                              )}`}
                            >
                              {m.estado}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-400">
                            {m.nombre_plantilla || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">
                            {fmtFecha(m.fecha_enviado ?? m.fecha_creado)}
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-right">
                            {m.intentos}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {data.mensajes_fallidos.some((m) => m.ultimo_error) && (
                  <div className="mt-2 space-y-1">
                    {data.mensajes_fallidos
                      .filter((m) => m.ultimo_error)
                      .map((m, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-1.5 text-xs text-red-300 bg-red-950/20 rounded px-2 py-1.5"
                        >
                          <AlertTriangle
                            size={11}
                            className="mt-0.5 shrink-0 text-red-400"
                          />
                          <span className="break-all">{m.ultimo_error}</span>
                        </div>
                      ))}
                  </div>
                )}
              </Sect>
            )}

            {/* Pagos recientes */}
            {data.pagos_recientes.length > 0 && (
              <Sect title="Pagos recientes">
                <div className="overflow-x-auto rounded-lg border border-gray-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-800/60 text-left">
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Fecha
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Estado
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium text-right whitespace-nowrap">
                          Monto
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Medio
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium text-center whitespace-nowrap">
                          Procesado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pagos_recientes.map((p, i) => (
                        <tr
                          key={i}
                          className="border-t border-gray-800/50 hover:bg-gray-800/20"
                        >
                          <td className="px-3 py-2 text-gray-300 font-mono whitespace-nowrap">
                            {fmtDate(p.fecha_pago ?? p.created_at)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs ${
                                p.status === "approved"
                                  ? "bg-emerald-900/40 text-emerald-300"
                                  : p.status === "rejected" ||
                                    p.status === "cancelled"
                                  ? "bg-red-900/40 text-red-300"
                                  : "bg-gray-800 text-gray-400"
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-300 text-right font-mono whitespace-nowrap">
                            {p.amount} {p.currency}
                          </td>
                          <td className="px-3 py-2 text-gray-400">
                            {p.medio_pago || "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {p.procesado ? (
                              <Check size={12} className="text-emerald-400 mx-auto" />
                            ) : (
                              <Clock size={12} className="text-gray-500 mx-auto" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sect>
            )}

            {/* Contenido premium reciente */}
            {data.contenido_premium_reciente.length > 0 && (
              <Sect title="Contenido premium reciente">
                <div className="overflow-x-auto rounded-lg border border-gray-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-800/60 text-left">
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Tipo
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Estado
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Programado
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Enviado
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium text-right whitespace-nowrap">
                          Semana
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.contenido_premium_reciente.map((c, i) => (
                        <tr
                          key={i}
                          className="border-t border-gray-800/50 hover:bg-gray-800/20"
                        >
                          <td className="px-3 py-2 text-gray-300">{c.tipo}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs ${
                                c.estado_envio === "enviado"
                                  ? "bg-emerald-900/40 text-emerald-300"
                                  : c.estado_envio === "error"
                                  ? "bg-red-900/40 text-red-300"
                                  : c.estado_envio === "pendiente" ||
                                    c.estado_envio === "generado"
                                  ? "bg-amber-900/40 text-amber-300"
                                  : "bg-gray-800 text-gray-400"
                              }`}
                            >
                              {c.estado_envio}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">
                            {fmtDate(c.fecha_envio_programada)}
                          </td>
                          <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">
                            {fmtDate(c.fecha_envio_real)}
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-right">
                            {c.ciclo_semana ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sect>
            )}

            {/* Descuentos usados */}
            {data.descuentos_usados.length > 0 && (
              <Sect title="Descuentos usados">
                <div className="space-y-1.5">
                  {data.descuentos_usados.map((d, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-3 text-xs bg-gray-800/30 rounded px-3 py-2"
                    >
                      <span className="text-violet-300 font-mono">{d.codigo}</span>
                      <span className="text-gray-400">{d.estado_uso}</span>
                      {d.valor_descuento_aplicado != null && (
                        <span className="text-emerald-400">
                          -{d.valor_descuento_aplicado} {d.moneda}
                        </span>
                      )}
                      <span className="text-gray-500">
                        {fmtDate(d.fecha_aplicacion)}
                      </span>
                    </div>
                  ))}
                </div>
              </Sect>
            )}

            {/* Acciones Premium */}
            <Sect title="Acciones Premium">
              <AccionesPremium
                suscriptor={data.suscriptor}
                onAccionOk={() => setRefreshKey((k) => k + 1)}
              />
            </Sect>
          </>
        )}
      </div>
    </div>
  );
}
