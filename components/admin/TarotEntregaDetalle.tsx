"use client";
import { useState, useEffect } from "react";
import { X, AlertCircle, Send, Check, Clock } from "lucide-react";
import { SolicitarReenvioDialog } from "@/components/admin/SolicitarReenvioDialog";

interface Entrega {
  id: string;
  orden_id: string;
  pdf_id: string | null;
  estado: string;
  numero_intento: number;
  es_reenvio: boolean;
  solicitud_reenvio_id: string | null;
  telefono_destino?: string;
  email_destino?: string;
  proveedor_wa?: string | null;
  proveedor_email?: string | null;
  wa_message_id?: string | null;
  proveedor_message_id?: string | null;
  wa_error_code?: string | null;
  wa_error_mensaje?: string | null;
  error_codigo?: string | null;
  error_mensaje?: string | null;
  enviado_at: string | null;
  created_at: string;
}

interface Orden {
  id: string;
  estado: string;
  external_reference: string | null;
  tarot_clientes?: { nombre_completo: string | null; telefono: string | null; email: string | null } | null;
}

interface Lectura { id: string }

interface Solicitud {
  id: string;
  estado: string;
  motivo: string;
  motivo_detalle: string | null;
  solicitado_por: string;
  solicitado_at: string;
  autorizado_por: string | null;
  autorizado_at: string | null;
  ejecutado_at: string | null;
}

const ESTADOS_EXITOSOS = new Set(["enviado", "entregado", "leido"]);

const MOTIVO_LABEL: Record<string, string> = {
  cliente_no_recibio: "Cliente indica que no recibió",
  direccion_corregida: "Dirección corregida",
  solicitud_cliente: "Solicitud del cliente",
  prueba_administrativa: "Prueba administrativa",
  otro: "Otro",
};

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-UY", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-gray-800/50 text-sm last:border-0">
      <span className="w-40 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-200 break-all">{value}</span>
    </div>
  );
}

export function TarotEntregaDetalle({
  id,
  canal,
  onClose,
  onSolicitudCreada,
}: {
  id: string;
  canal: string;
  onClose: () => void;
  onSolicitudCreada?: () => void;
}) {
  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mostrarSolicitar, setMostrarSolicitar] = useState(false);
  const [solicitudMsg, setSolicitudMsg] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    fetch(`/api/admin/tarot/entregas/${id}?canal=${canal}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) { setErrorMsg(json.motivo ?? "Error"); return; }
        setEntrega(json.entrega);
        setOrden(json.orden ?? null);
        setLectura(json.lectura ?? null);
        setSolicitudes(json.solicitudes ?? []);
      })
      .catch(() => setErrorMsg("Error de red"))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [id, canal]);

  const destino = canal === "whatsapp" ? entrega?.telefono_destino : entrega?.email_destino;
  const proveedor = canal === "whatsapp" ? entrega?.proveedor_wa : entrega?.proveedor_email;
  const proveedorMsgId = canal === "whatsapp" ? entrega?.wa_message_id : entrega?.proveedor_message_id;
  const errorCodigo = canal === "whatsapp" ? entrega?.wa_error_code : entrega?.error_codigo;
  const errorMensaje = canal === "whatsapp" ? entrega?.wa_error_mensaje : entrega?.error_mensaje;

  const puedeSolicitarReenvio = entrega && ESTADOS_EXITOSOS.has(entrega.estado);
  const haySolicitudPendiente = solicitudes.some((s) => s.estado === "pendiente_autorizacion" || s.estado === "autorizada");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <span className="text-sm font-medium text-white">Detalle de entrega — {canal === "whatsapp" ? "WhatsApp" : "Email"}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {cargando && <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Cargando…</p>}
          {!cargando && errorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={14} className="shrink-0" />{errorMsg}
            </div>
          )}

          {!cargando && entrega && (
            <>
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Datos de la entrega</h3>
                <DataRow label="Estado" value={entrega.estado} />
                <DataRow label="Tipo" value={entrega.es_reenvio ? "Reenvío" : "Original"} />
                <DataRow label="Destinatario" value={destino ?? "—"} />
                <DataRow label="Cliente" value={orden?.tarot_clientes?.nombre_completo ?? "—"} />
                <DataRow label="Orden" value={<span className="font-mono text-xs">{orden?.external_reference ?? entrega.orden_id}</span>} />
                <DataRow label="Lectura ID" value={<span className="font-mono text-xs">{lectura?.id ?? "—"}</span>} />
                <DataRow label="PDF ID" value={<span className="font-mono text-xs">{entrega.pdf_id ?? "—"}</span>} />
                <DataRow label="Intento N°" value={entrega.numero_intento} />
                <DataRow label="Proveedor" value={proveedor ?? "—"} />
                <DataRow label="ID proveedor" value={proveedorMsgId ?? "—"} />
                <DataRow label="Enviado" value={fmtFecha(entrega.enviado_at)} />
                <DataRow label="Creado" value={fmtFecha(entrega.created_at)} />
              </div>

              {errorMensaje && (
                <div className="mb-5 rounded-lg border border-red-800/50 bg-red-950/20 p-3">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Error</p>
                  {errorCodigo && <p className="text-xs text-red-300 mb-1"><span className="text-gray-500">Código:</span> {errorCodigo}</p>}
                  <p className="text-xs text-red-200 whitespace-pre-wrap">{errorMensaje}</p>
                </div>
              )}

              {solicitudes.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Historial de reenvío</h3>
                  <div className="space-y-2">
                    {solicitudes.map((s) => (
                      <div key={s.id} className="rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 text-xs">
                        <div className="flex items-center gap-1.5 text-gray-300">
                          {s.estado === "ejecutada" ? <Check size={12} className="text-emerald-400" /> : <Clock size={12} className="text-amber-400" />}
                          <span className="font-medium">{MOTIVO_LABEL[s.motivo] ?? s.motivo}</span>
                          <span className="text-gray-600 ml-auto">{s.estado}</span>
                        </div>
                        {s.motivo_detalle && <p className="text-gray-500 mt-0.5">{s.motivo_detalle}</p>}
                        <p className="text-gray-600 mt-1">
                          Solicitado por {s.solicitado_por} — {fmtFecha(s.solicitado_at)}
                          {s.autorizado_por && <> · Autorizado por {s.autorizado_por} — {fmtFecha(s.autorizado_at)}</>}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Acciones</h3>
                {puedeSolicitarReenvio ? (
                  haySolicitudPendiente ? (
                    <p className="text-xs text-amber-400">Ya hay una solicitud de reenvío en curso para esta orden y canal.</p>
                  ) : (
                    <button
                      onClick={() => setMostrarSolicitar(true)}
                      className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors"
                    >
                      <Send size={12} />
                      Solicitar reenvío
                    </button>
                  )
                ) : (
                  <p className="text-xs text-gray-600">Esta entrega no está en un estado que permita solicitar reenvío.</p>
                )}
                {solicitudMsg && <p className="mt-1.5 text-xs text-emerald-400">{solicitudMsg}</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {mostrarSolicitar && entrega && (
        <SolicitarReenvioDialog
          ordenId={entrega.orden_id}
          canal={canal as "whatsapp" | "email"}
          onClose={() => setMostrarSolicitar(false)}
          onCreada={() => {
            setMostrarSolicitar(false);
            setSolicitudMsg("Solicitud de reenvío creada. Queda pendiente de autorización.");
            cargar();
            onSolicitudCreada?.();
          }}
        />
      )}
    </div>
  );
}
