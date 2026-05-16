"use client";
import { useState, useEffect } from "react";
import { X, Check, AlertTriangle, AlertCircle, Clock } from "lucide-react";

// ===========================================================================
// Types
// ===========================================================================

interface Mensaje {
  id: number;
  tipo_mensaje: string;
  estado: string;
  id_suscriptor: number | null;
  id_contenido: number | null;
  canal_envio: string | null;
  intentos: number;
  ultimo_error: string | null;
  reintentar_despues: string | null;
  fecha_creado: string;
  fecha_enviado: string | null;
  fecha_delivered: string | null;
  fecha_read: string | null;
  nombre_plantilla: string | null;
  fecha_envio_programada: string | null;
  fecha_ultimo_intento: string | null;
  mensaje_id_whatsapp: string | null;
  metadata: Record<string, unknown> | null;
}

interface Suscriptor {
  id: number | null;
  nombre: string;
  signo: string;
  estado_suscripcion: string;
  premium_activo: boolean;
  whatsapp_confirmado: boolean;
  estado_mensaje: string | null;
  fecha_vencimiento_premium: string | null;
  auto_renovacion_activa: boolean;
}

interface ContenidoPremium {
  id: number | null;
  tipo: string;
  estado_envio: string;
  fecha_envio_programada: string | null;
  fecha_envio_real: string | null;
  generado: boolean;
  ciclo_semana: number | null;
  ultimo_error: string | null;
}

interface Reintento {
  reintentable: boolean;
  requiere_forzar: boolean;
  motivo: string;
  recomendacion: string;
}

interface LogEntry {
  nombre_funcion: string;
  fecha_ejecucion: string;
  resultado: string;
  exito: boolean;
}

interface DetalleData {
  ok: boolean;
  healthy: boolean;
  encontrado: boolean;
  id_mensaje: number;
  mensaje: Mensaje;
  suscriptor: Suscriptor | null;
  contenido_premium: ContenidoPremium | null;
  reintento: Reintento | null;
  logs_relacionados: LogEntry[];
  warnings: string[];
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
    return iso.slice(0, 16).replace("T", " ");
  }
}

const ESTADO_CLS: Record<string, string> = {
  fallido:          "bg-amber-900/50 text-amber-300 border-amber-700/40",
  fallo_definitivo: "bg-red-900/50 text-red-300 border-red-700/40",
  procesando:       "bg-sky-900/50 text-sky-300 border-sky-700/40",
  pendiente:        "bg-gray-800 text-gray-400 border-gray-700/40",
  enviado:          "bg-emerald-900/50 text-emerald-300 border-emerald-700/40",
};

const REINTENTO_BOX: Record<string, string> = {
  ver_y_reintentar:             "border-amber-800/40 bg-amber-950/20",
  revision_manual:              "border-red-800/40 bg-red-950/20",
  revisar_si_quedo_colgado:     "border-sky-800/40 bg-sky-950/20",
  esperar_batch_o_revisar_cron: "border-gray-700/40 bg-gray-900/30",
  sin_accion:                   "border-gray-700/40 bg-gray-900/30",
};

// ===========================================================================
// Sub-components
// ===========================================================================

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-gray-800/50 text-sm last:border-0">
      <span className="w-40 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-200 break-all">{value}</span>
    </div>
  );
}

function BoolVal({ value, trueLabel = "Sí", falseLabel = "No" }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-emerald-400"><Check size={12} />{trueLabel}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-gray-500"><X size={12} />{falseLabel}</span>
  );
}

function Sect({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}

// ===========================================================================
// AccionesMensaje
// ===========================================================================

type AccionMensajeKey = "reintentar" | "marcar_fallo_definitivo" | "resetear_a_fallido";

const ACCION_MENSAJE_INFO: Record<
  AccionMensajeKey,
  { label: string; descripcion: string; advertencia?: string; peligrosa: boolean }
> = {
  reintentar: {
    label: "Reintentar ahora",
    descripcion: "Dispara el sender inmediatamente para este mensaje.",
    advertencia:
      "En producción esto intenta enviar un WhatsApp real al suscriptor. Verificá primero el estado del suscriptor.",
    peligrosa: false,
  },
  marcar_fallo_definitivo: {
    label: "Marcar fallo definitivo",
    descripcion:
      "Marca el mensaje como fallo definitivo. El CRON dejará de reintentarlo automáticamente.",
    peligrosa: true,
  },
  resetear_a_fallido: {
    label: "Resetear para reintento",
    descripcion:
      "Pasa el mensaje de fallo_definitivo a fallido con intentos=0. El CRON (ef_whatsapp_reintentos) lo reintentará en el próximo ciclo.",
    peligrosa: false,
  },
};

function AccionesMensaje({
  mensaje,
  onAccionOk,
}: {
  mensaje: Mensaje;
  onAccionOk: () => void;
}) {
  const [accionActiva, setAccionActiva] = useState<AccionMensajeKey | null>(null);
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const estado = mensaje.estado;
  const puedeReintentar = estado === "fallido";
  const puedeFalloDefinitivo = estado === "fallido";
  const puedeResetear = estado === "fallo_definitivo";
  const hayAcciones = puedeReintentar || puedeFalloDefinitivo || puedeResetear;

  function abrirAccion(accion: AccionMensajeKey) {
    setAccionActiva(accion);
    setMotivo("");
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
      const res = await fetch("/api/admin/mensaje-accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_mensaje: mensaje.id,
          accion: accionActiva,
          motivo: motivoTrim,
        }),
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
          texto: (json.mensaje as string) ?? "Acción ejecutada correctamente.",
        });
        setTimeout(() => {
          cancelar();
          onAccionOk();
        }, 2000);
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

  const info = accionActiva ? ACCION_MENSAJE_INFO[accionActiva] : null;

  if (!hayAcciones) {
    const TEXTO_INACTIVO: Record<string, string> = {
      enviado:
        "El mensaje fue enviado correctamente. No se puede reintentar para evitar duplicados.",
      procesando:
        "El mensaje está siendo procesado. Esperá a que el sender termine antes de tomar acción.",
      pendiente:
        "El mensaje está pendiente. El CRON lo tomará automáticamente en el próximo ciclo.",
    };
    return (
      <p className="text-xs text-gray-500 italic">
        {TEXTO_INACTIVO[estado] ?? `Estado "${estado}": sin acciones disponibles.`}
      </p>
    );
  }

  return (
    <div>
      {!accionActiva && (
        <div className="flex flex-wrap gap-2">
          {puedeReintentar && (
            <button
              onClick={() => abrirAccion("reintentar")}
              className="text-xs px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors"
            >
              Reintentar ahora
            </button>
          )}
          {puedeFalloDefinitivo && (
            <button
              onClick={() => abrirAccion("marcar_fallo_definitivo")}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-800/60 bg-red-950/30 text-red-300 hover:bg-red-900/40 transition-colors"
            >
              Marcar fallo definitivo
            </button>
          )}
          {puedeResetear && (
            <button
              onClick={() => abrirAccion("resetear_a_fallido")}
              className="text-xs px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors"
            >
              Resetear para reintento
            </button>
          )}
        </div>
      )}

      {accionActiva && info && (
        <div
          className={`rounded-lg border p-4 ${
            info.peligrosa
              ? "border-red-800/60 bg-red-950/25"
              : "border-amber-800/40 bg-amber-950/15"
          }`}
        >
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

          <div className="mb-4 space-y-1.5 text-xs">
            <p className="text-gray-400">
              Mensaje:{" "}
              <span className="text-white font-mono font-semibold">#{mensaje.id}</span>{" "}
              <span className="text-gray-500">— {mensaje.tipo_mensaje}</span>
            </p>
            <p className="text-gray-400">{info.descripcion}</p>
            {info.advertencia && (
              <p className="text-amber-300 font-medium">
                Advertencia: {info.advertencia}
              </p>
            )}
          </div>

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
              disabled={motivo.trim().length < 5 || submitting}
              className={`text-xs px-4 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-40 ${
                info.peligrosa
                  ? "border-red-700 bg-red-900/50 text-red-200 hover:bg-red-800/60"
                  : "border-amber-700 bg-amber-900/50 text-amber-200 hover:bg-amber-800/60"
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
// MensajeDetalle
// ===========================================================================

export interface MensajeDetalleProps {
  id: number;
  onClose: () => void;
  onAccionOk?: () => void;
}

export function MensajeDetalle({ id, onClose, onAccionOk }: MensajeDetalleProps) {
  const [data, setData] = useState<DetalleData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setCargando(true);
    setErrorMsg(null);
    setData(null);
    setMetaExpanded(false);

    fetch(`/api/admin/mensaje-detalle?id=${id}`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? "Error al cargar detalle");
        } else if (!json.encontrado) {
          setErrorMsg("Mensaje no encontrado");
        } else {
          setData(json as DetalleData);
        }
      })
      .catch((e: unknown) => setErrorMsg(e instanceof Error ? e.message : "Error de red"))
      .finally(() => setCargando(false));
  }, [id, refreshKey]);

  const estadoCls =
    data ? (ESTADO_CLS[data.mensaje.estado] ?? "bg-gray-800 text-gray-400 border-gray-700/40") : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            {data && (
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full border ${estadoCls}`}
              >
                {data.mensaje.estado}
              </span>
            )}
            <span className="text-sm font-medium text-white">
              Mensaje #{id}
            </span>
            {data && data.suscriptor && (
              <span className="text-sm text-gray-500">— {data.suscriptor.nombre}</span>
            )}
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
            {/* Reintento box — main operational info */}
            {data.reintento && (
              <div
                className={`mb-5 rounded-lg border px-4 py-3 ${
                  REINTENTO_BOX[data.reintento.motivo] ??
                  REINTENTO_BOX[
                    data.mensaje.estado === "fallido"
                      ? "ver_y_reintentar"
                      : "revision_manual"
                  ] ??
                  "border-gray-700/40 bg-gray-900/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Acción
                  </span>
                  <span className="text-xs text-gray-300 font-medium">
                    {data.reintento.motivo.replace(/_/g, " ")}
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
                    <BoolVal
                      value={data.reintento.reintentable}
                      trueLabel="reintentable"
                      falseLabel="no reintentable"
                    />
                  </span>
                </div>
                <p className="text-sm text-gray-300 leading-snug">
                  {data.reintento.recomendacion}
                </p>
                {data.reintento.requiere_forzar && (
                  <p className="text-xs text-amber-400 mt-1.5">
                    Requiere forzar el reintento manualmente.
                  </p>
                )}
              </div>
            )}

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

            {/* Datos del mensaje */}
            <Sect title="Datos del mensaje">
              <DataRow label="Tipo" value={data.mensaje.tipo_mensaje || "—"} />
              <DataRow label="Plantilla" value={data.mensaje.nombre_plantilla || "—"} />
              <DataRow label="Canal" value={data.mensaje.canal_envio || "—"} />
              <DataRow
                label="Intentos"
                value={
                  <span
                    className={
                      data.mensaje.intentos >= 5
                        ? "text-red-400 font-bold"
                        : data.mensaje.intentos >= 3
                        ? "text-amber-400"
                        : ""
                    }
                  >
                    {data.mensaje.intentos}
                  </span>
                }
              />
              <DataRow label="Creado" value={fmtFecha(data.mensaje.fecha_creado)} />
              <DataRow label="Programado" value={fmtFecha(data.mensaje.fecha_envio_programada)} />
              <DataRow label="Enviado" value={fmtFecha(data.mensaje.fecha_enviado)} />
              <DataRow label="Entregado" value={fmtFecha(data.mensaje.fecha_delivered)} />
              <DataRow label="Leído" value={fmtFecha(data.mensaje.fecha_read)} />
              <DataRow label="Último intento" value={fmtFecha(data.mensaje.fecha_ultimo_intento)} />
              <DataRow
                label="Reintentar desde"
                value={
                  data.mensaje.reintentar_despues ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} className="text-amber-400" />
                      {fmtFecha(data.mensaje.reintentar_despues)}
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              {data.mensaje.mensaje_id_whatsapp && (
                <DataRow
                  label="ID WhatsApp"
                  value={
                    <span className="font-mono text-xs text-gray-400 break-all">
                      {data.mensaje.mensaje_id_whatsapp}
                    </span>
                  }
                />
              )}
              {data.mensaje.id_suscriptor != null && (
                <DataRow
                  label="ID suscriptor"
                  value={
                    <span className="font-mono text-xs">#{data.mensaje.id_suscriptor}</span>
                  }
                />
              )}
              {data.mensaje.id_contenido != null && (
                <DataRow
                  label="ID contenido"
                  value={
                    <span className="font-mono text-xs">#{data.mensaje.id_contenido}</span>
                  }
                />
              )}
            </Sect>

            {/* Último error completo */}
            {data.mensaje.ultimo_error && (
              <Sect title="Último error">
                <div className="rounded-lg border border-red-800/30 bg-red-950/20 px-4 py-3">
                  <pre className="text-xs text-red-300 whitespace-pre-wrap break-all leading-relaxed">
                    {data.mensaje.ultimo_error}
                  </pre>
                </div>
              </Sect>
            )}

            {/* Suscriptor (contexto) */}
            {data.suscriptor && (
              <Sect title="Suscriptor (contexto)">
                <DataRow label="Nombre" value={data.suscriptor.nombre || "—"} />
                <DataRow label="Signo" value={data.suscriptor.signo || "—"} />
                <DataRow
                  label="Suscripción"
                  value={data.suscriptor.estado_suscripcion || "—"}
                />
                <DataRow
                  label="Premium activo"
                  value={<BoolVal value={data.suscriptor.premium_activo} trueLabel="Sí" falseLabel="No" />}
                />
                <DataRow
                  label="WA confirmado"
                  value={<BoolVal value={data.suscriptor.whatsapp_confirmado} trueLabel="Sí" falseLabel="No" />}
                />
                <DataRow
                  label="Estado mensajes"
                  value={data.suscriptor.estado_mensaje || "activo"}
                />
                {data.suscriptor.fecha_vencimiento_premium && (
                  <DataRow
                    label="Vence premium"
                    value={fmtFecha(data.suscriptor.fecha_vencimiento_premium)}
                  />
                )}
              </Sect>
            )}

            {/* Contenido premium (contexto) */}
            {data.contenido_premium && (
              <Sect title="Contenido asociado (contexto)">
                <DataRow label="ID" value={<span className="font-mono text-xs">#{data.contenido_premium.id}</span>} />
                <DataRow label="Tipo" value={data.contenido_premium.tipo || "—"} />
                <DataRow label="Estado envío" value={data.contenido_premium.estado_envio || "—"} />
                <DataRow
                  label="Generado"
                  value={<BoolVal value={data.contenido_premium.generado} />}
                />
                {data.contenido_premium.ciclo_semana != null && (
                  <DataRow label="Semana" value={String(data.contenido_premium.ciclo_semana)} />
                )}
                <DataRow
                  label="Programado"
                  value={fmtFecha(data.contenido_premium.fecha_envio_programada)}
                />
                <DataRow
                  label="Enviado"
                  value={fmtFecha(data.contenido_premium.fecha_envio_real)}
                />
                {data.contenido_premium.ultimo_error && (
                  <DataRow
                    label="Error contenido"
                    value={
                      <span className="text-red-300/80 text-xs">
                        {data.contenido_premium.ultimo_error}
                      </span>
                    }
                  />
                )}
              </Sect>
            )}

            {/* Metadata */}
            {data.mensaje.metadata && Object.keys(data.mensaje.metadata).length > 0 && (
              <Sect title="Metadata">
                <button
                  onClick={() => setMetaExpanded((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-300 underline mb-2 transition-colors"
                >
                  {metaExpanded ? "Ocultar" : "Mostrar"} metadata
                </button>
                {metaExpanded && (
                  <pre className="text-xs text-gray-400 bg-gray-800/50 rounded-lg border border-gray-700 px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(data.mensaje.metadata, null, 2)}
                  </pre>
                )}
              </Sect>
            )}

            {/* Logs relacionados */}
            {data.logs_relacionados.length > 0 && (
              <Sect title="Logs relacionados">
                <div className="overflow-x-auto rounded-lg border border-gray-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-800/60 text-left">
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Función
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Resultado
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                          Fecha
                        </th>
                        <th className="px-3 py-2 text-gray-400 font-medium text-center whitespace-nowrap">
                          OK
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.logs_relacionados.map((log, i) => (
                        <tr
                          key={i}
                          className="border-t border-gray-800/50 hover:bg-gray-800/20"
                        >
                          <td className="px-3 py-2 text-gray-300 font-mono">
                            {log.nombre_funcion}
                          </td>
                          <td className="px-3 py-2 text-gray-400">{log.resultado}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap font-mono">
                            {fmtFecha(log.fecha_ejecucion)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {log.exito ? (
                              <Check size={12} className="text-emerald-400 mx-auto" />
                            ) : (
                              <X size={12} className="text-red-400 mx-auto" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sect>
            )}

            {/* Acciones del mensaje */}
            <Sect title="Acciones del mensaje">
              <AccionesMensaje
                mensaje={data.mensaje}
                onAccionOk={() => {
                  setRefreshKey((k) => k + 1);
                  onAccionOk?.();
                }}
              />
            </Sect>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
