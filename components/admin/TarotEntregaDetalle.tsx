"use client";
import { useState, useEffect } from "react";
import { X, AlertCircle, Send, Check, Clock, MessageCircle, Mail, XCircle } from "lucide-react";
import { SolicitarReenvioDialog } from "@/components/admin/SolicitarReenvioDialog";

interface EnvioWA {
  id: string; estado: string; numero_intento: number; telefono_destino: string;
  wa_message_id: string | null; wa_error_code: string | null; wa_error_mensaje: string | null;
  es_reenvio: boolean; solicitud_reenvio_id: string | null;
  enviado_at: string | null; created_at: string;
}
interface EnvioEmail {
  id: string; estado: string; numero_intento: number; email_destino: string;
  proveedor_message_id: string | null; error_codigo: string | null; error_mensaje: string | null;
  es_reenvio: boolean; solicitud_reenvio_id: string | null;
  enviado_at: string | null; created_at: string;
}
interface Orden {
  id: string; estado: string; external_reference: string | null; created_at: string;
  email_solicitado: boolean | null;
  tarot_clientes?: { nombre_completo: string | null; telefono: string | null; email: string | null } | null;
}
interface Solicitud {
  id: string; canal: "whatsapp" | "email"; estado: string; motivo: string; motivo_detalle: string | null;
  solicitado_por: string; solicitado_at: string;
  autorizado_por: string | null; autorizado_at: string | null; ejecutado_at: string | null;
  rechazado_por: string | null; rechazado_at: string | null;
  motivo_rechazo: string | null; motivo_rechazo_detalle: string | null;
}

const ESTADOS_EXITOSOS_WA = new Set(["enviado", "entregado", "leido"]);
const ESTADOS_EXITOSOS_EMAIL = new Set(["enviado"]);

const MOTIVO_LABEL: Record<string, string> = {
  cliente_no_recibio: "Cliente indica que no recibió",
  direccion_corregida: "Dirección corregida",
  solicitud_cliente: "Solicitud del cliente",
  prueba_administrativa: "Prueba administrativa",
  otro: "Otro",
};

const MOTIVO_RECHAZO_LABEL: Record<string, string> = {
  solicitud_duplicada: "Solicitud duplicada",
  no_corresponde: "No corresponde reenviar",
  prueba_administrativa: "Prueba administrativa",
  otro: "Otro",
};

const ESTADO_CLS: Record<string, string> = {
  enviado: "bg-emerald-900/50 text-emerald-300",
  entregado: "bg-emerald-900/50 text-emerald-300",
  leido: "bg-emerald-900/50 text-emerald-300",
  error: "bg-red-900/50 text-red-300",
  agotado_reintentos: "bg-red-900/50 text-red-300",
  enviando: "bg-amber-900/50 text-amber-300",
  pendiente: "bg-amber-900/50 text-amber-300",
  simulado: "bg-violet-900/50 text-violet-300",
};

// "simulado" (WhatsApp en sandbox) nunca debe leerse como una entrega real —
// ver auditoría "Juan Felipe González", 2026-08-28.
function etiquetaEstado(estado: string): string {
  if (estado === "simulado") return "Simulado (sandbox)";
  if (estado === "agotado_reintentos") return "Reintentos agotados";
  return estado;
}

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-UY", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function Badge({ text, cls }: { text: string; cls: string }) {
  return <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{text}</span>;
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-gray-800/50 text-sm last:border-0">
      <span className="w-32 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-200 break-all">{value}</span>
    </div>
  );
}

// Etiqueta cada intento exitoso según si es el primer envío exitoso del canal
// (Original), un reenvío formalmente autorizado (es_reenvio=true), o un envío
// posterior a uno ya exitoso pero SIN autorización registrada — evidencia del
// bug de regeneración pre-gobernanza. Nunca modifica el dato, solo lo etiqueta.
function etiquetarHistorial<T extends { estado: string; es_reenvio: boolean; created_at: string }>(
  items: T[], esExitoso: (estado: string) => boolean,
): Array<T & { etiqueta: string; etiquetaCls: string }> {
  const asc = [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  let vistoExitoso = false;
  const etiquetas = new Map<T, { etiqueta: string; etiquetaCls: string }>();
  for (const it of asc) {
    if (!esExitoso(it.estado)) {
      etiquetas.set(it, { etiqueta: "", etiquetaCls: "" });
      continue;
    }
    if (!vistoExitoso) {
      etiquetas.set(it, { etiqueta: "Original", etiquetaCls: "bg-gray-800 text-gray-400" });
    } else if (it.es_reenvio) {
      etiquetas.set(it, { etiqueta: "Reenvío autorizado", etiquetaCls: "bg-violet-900/50 text-violet-300" });
    } else {
      etiquetas.set(it, { etiqueta: "Reenvío histórico (pre-gobernanza)", etiquetaCls: "bg-amber-900/40 text-amber-400" });
    }
    vistoExitoso = true;
  }
  return items.map(it => ({ ...it, ...(etiquetas.get(it) ?? { etiqueta: "", etiquetaCls: "" }) }));
}

export function TarotEntregaDetalle({
  ordenId,
  onClose,
  onSolicitudCreada,
}: {
  ordenId: string;
  onClose: () => void;
  onSolicitudCreada?: () => void;
}) {
  const [orden, setOrden] = useState<Orden | null>(null);
  const [wa, setWa] = useState<EnvioWA[]>([]);
  const [email, setEmail] = useState<EnvioEmail[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [solicitarCanal, setSolicitarCanal] = useState<"whatsapp" | "email" | null>(null);
  const [solicitudMsg, setSolicitudMsg] = useState<string | null>(null);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [envioEmailMsg, setEnvioEmailMsg] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    fetch(`/api/admin/tarot/entregas/${ordenId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) { setErrorMsg(json.motivo ?? "Error"); return; }
        setOrden(json.orden);
        setWa(json.whatsapp ?? []);
        setEmail(json.email ?? []);
        setSolicitudes(json.solicitudes ?? []);
      })
      .catch(() => setErrorMsg("Error de red"))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [ordenId]);

  // Envío directo (sin solicitud/autorización) — solo válido cuando el canal
  // nunca tuvo ningún intento. Reusa exclusivamente el endpoint canónico;
  // no envía el email desde el frontend.
  function enviarEmailDirecto() {
    if (enviandoEmail) return; // guarda de doble clic en el propio botón
    setEnviandoEmail(true);
    setEnvioEmailMsg(null);
    fetch(`/api/admin/tarot/entregas/${ordenId}/enviar-email`, { method: "POST" })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setEnvioEmailMsg(`Email enviado a ${json.email}.`);
        } else {
          setEnvioEmailMsg(`No se pudo enviar: ${json.motivo ?? "error desconocido"}${json.detalle ? ` — ${json.detalle}` : ""}`);
        }
        cargar();
      })
      .catch(() => setEnvioEmailMsg("Error de red al enviar."))
      .finally(() => setEnviandoEmail(false));
  }

  const waEtiquetado = etiquetarHistorial(wa, (e) => ESTADOS_EXITOSOS_WA.has(e));
  const emailEtiquetado = etiquetarHistorial(email, (e) => ESTADOS_EXITOSOS_EMAIL.has(e));

  const ultimoWa = wa[0] ?? null; // ya viene ordenado desc por created_at desde la API
  const ultimoEmail = email[0] ?? null;

  const waExitoso = ultimoWa != null && ESTADOS_EXITOSOS_WA.has(ultimoWa.estado);

  const solicitudPendienteWa = solicitudes.some(s => s.canal === "whatsapp" && (s.estado === "pendiente_autorizacion" || s.estado === "autorizada"));
  const solicitudPendienteEmail = solicitudes.some(s => s.canal === "email" && (s.estado === "pendiente_autorizacion" || s.estado === "autorizada"));

  // Timeline unificado, más reciente primero
  const timeline = [
    ...wa.map(w => ({ canal: "whatsapp" as const, ts: w.created_at, item: w })),
    ...email.map(e => ({ canal: "email" as const, ts: e.created_at, item: e })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  // Canal email: independiente del dato tarot_clientes.email (ver sección 4 de
  // la tarea "Identidad + canales de entrega" — dato del cliente vs canal
  // solicitado para ESTA orden). null = orden legacy, se conserva el
  // comportamiento previo (aplica si el cliente tiene email).
  const emailNoSolicitado = orden?.email_solicitado === false && email.length === 0;
  const emailLegacySinDatos = (orden?.email_solicitado ?? null) === null && !orden?.tarot_clientes?.email && email.length === 0;
  const emailAplica = !emailNoSolicitado && !emailLegacySinDatos;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <span className="text-sm font-medium text-white">Detalle de entrega</span>
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

          {!cargando && orden && (
            <>
              <div className="mb-5">
                <DataRow label="Cliente" value={orden.tarot_clientes?.nombre_completo ?? "—"} />
                <DataRow label="Orden" value={<span className="font-mono text-xs">{orden.external_reference ?? orden.id}</span>} />
                <DataRow label="Creada" value={fmtFecha(orden.created_at)} />
              </div>

              {/* Bloque WhatsApp */}
              <div className="mb-4 rounded-lg border border-gray-800 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <MessageCircle size={13} className="text-emerald-400" /> WhatsApp
                  </h3>
                  {ultimoWa && <Badge text={etiquetaEstado(ultimoWa.estado)} cls={ESTADO_CLS[ultimoWa.estado] ?? "bg-gray-800 text-gray-400"} />}
                </div>
                {ultimoWa ? (
                  <>
                    <DataRow label="Destino" value={ultimoWa.telefono_destino} />
                    <DataRow label="Último envío" value={fmtFecha(ultimoWa.enviado_at ?? ultimoWa.created_at)} />
                    <DataRow label="Intentos" value={wa.length} />
                    {ultimoWa.wa_error_mensaje && (
                      <DataRow label="Error" value={<span className="text-red-300">{ultimoWa.wa_error_mensaje}</span>} />
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-600">Sin intentos todavía.</p>
                )}
                {waExitoso && (
                  solicitudPendienteWa ? (
                    <p className="mt-2 text-xs text-amber-400">Ya hay una solicitud de reenvío en curso para WhatsApp.</p>
                  ) : (
                    <button
                      onClick={() => setSolicitarCanal("whatsapp")}
                      className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors"
                    >
                      <Send size={12} /> Solicitar reenvío por WhatsApp
                    </button>
                  )
                )}
              </div>

              {/* Bloque Email */}
              <div className="mb-5 rounded-lg border border-gray-800 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Mail size={13} className="text-sky-400" /> Email
                  </h3>
                  {ultimoEmail && <Badge text={ultimoEmail.estado} cls={ESTADO_CLS[ultimoEmail.estado] ?? "bg-gray-800 text-gray-400"} />}
                </div>
                {emailNoSolicitado ? (
                  <p className="text-xs text-gray-600">El comprador no pidió recibir la lectura por email en esta orden.</p>
                ) : emailLegacySinDatos ? (
                  <p className="text-xs text-gray-600">Orden anterior a este cambio, sin email registrado — no hay datos suficientes para saber si se solicitó.</p>
                ) : ultimoEmail ? (
                  <>
                    <DataRow label="Destino" value={ultimoEmail.email_destino} />
                    <DataRow label="Último envío" value={fmtFecha(ultimoEmail.enviado_at ?? ultimoEmail.created_at)} />
                    <DataRow label="Intentos" value={email.length} />
                    {ultimoEmail.error_mensaje && (
                      <DataRow label="Error" value={<span className="text-red-300 break-all">{ultimoEmail.error_mensaje}</span>} />
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-600">
                    Sin intentos todavía{orden.tarot_clientes?.email ? ` (destino configurado: ${orden.tarot_clientes.email})` : ""}.
                  </p>
                )}
                {emailAplica && email.length === 0 && (
                  <button
                    onClick={enviarEmailDirecto}
                    disabled={enviandoEmail}
                    className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sky-700/60 bg-sky-950/30 text-sky-300 hover:bg-sky-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={12} /> {enviandoEmail ? "Enviando…" : "Enviar por email"}
                  </button>
                )}
                {email.length > 0 && (
                  solicitudPendienteEmail ? (
                    <p className="mt-2 text-xs text-amber-400">Ya hay una solicitud de reenvío en curso para Email.</p>
                  ) : (
                    <button
                      onClick={() => setSolicitarCanal("email")}
                      className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors"
                    >
                      <Send size={12} /> Reenviar por email
                    </button>
                  )
                )}
                {envioEmailMsg && (
                  <p className="mt-2 text-xs text-gray-400">{envioEmailMsg}</p>
                )}
              </div>

              {solicitudMsg && (
                <p className="mb-4 text-xs text-emerald-400 flex items-center gap-1.5"><Check size={12} />{solicitudMsg}</p>
              )}

              {/* Solicitudes de reenvío (quién pidió / quién autorizó) */}
              {solicitudes.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Solicitudes de reenvío</h3>
                  <div className="space-y-2">
                    {solicitudes.map((s) => {
                      const rechazada = s.estado === "rechazada";
                      const icono = rechazada
                        ? <XCircle size={12} className="text-red-400" />
                        : s.estado === "ejecutada"
                          ? <Check size={12} className="text-emerald-400" />
                          : <Clock size={12} className="text-amber-400" />;
                      return (
                        <div key={s.id} className={`rounded-lg border px-3 py-2 text-xs ${rechazada ? "border-red-900/40 bg-red-950/10" : "border-gray-800 bg-gray-950/40"}`}>
                          <div className="flex items-center gap-1.5 text-gray-300">
                            {s.canal === "whatsapp" ? <MessageCircle size={12} className="text-emerald-400" /> : <Mail size={12} className="text-sky-400" />}
                            {icono}
                            <span className="font-medium">{rechazada ? "Reenvío rechazado" : MOTIVO_LABEL[s.motivo] ?? s.motivo}</span>
                            <span className="text-gray-600 ml-auto">{s.estado}</span>
                          </div>
                          {!rechazada && s.motivo_detalle && <p className="text-gray-500 mt-0.5">{s.motivo_detalle}</p>}
                          <p className="text-gray-600 mt-1">
                            Solicitado por {s.solicitado_por} — {fmtFecha(s.solicitado_at)}
                            {s.autorizado_por && <> · Autorizado por {s.autorizado_por} — {fmtFecha(s.autorizado_at)}</>}
                            {rechazada && s.rechazado_por && <> · Rechazado por {s.rechazado_por} — {fmtFecha(s.rechazado_at)}</>}
                          </p>
                          {rechazada && s.motivo_rechazo && (
                            <p className="text-red-300/80 mt-1">
                              Motivo: {MOTIVO_RECHAZO_LABEL[s.motivo_rechazo] ?? s.motivo_rechazo}
                              {s.motivo_rechazo_detalle && ` — ${s.motivo_rechazo_detalle}`}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Historial cronológico unificado */}
              {timeline.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Historial</h3>
                  <div className="space-y-1.5">
                    {timeline.map(({ canal, item }) => {
                      const etiquetado = canal === "whatsapp"
                        ? waEtiquetado.find(w => w.id === (item as EnvioWA).id)
                        : emailEtiquetado.find(e => e.id === (item as EnvioEmail).id);
                      const estadoCls = ESTADO_CLS[item.estado] ?? "bg-gray-800 text-gray-400";
                      return (
                        <div key={`${canal}-${item.id}`} className="flex items-center gap-2 text-xs py-1 border-b border-gray-800/40 last:border-0">
                          {canal === "whatsapp" ? <MessageCircle size={12} className="text-emerald-400 shrink-0" /> : <Mail size={12} className="text-sky-400 shrink-0" />}
                          <span className="font-mono text-gray-500 whitespace-nowrap">{fmtFecha(item.created_at)}</span>
                          <Badge text={etiquetaEstado(item.estado)} cls={estadoCls} />
                          {etiquetado?.etiqueta && <Badge text={etiquetado.etiqueta} cls={etiquetado.etiquetaCls} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {solicitarCanal && orden && (
        <SolicitarReenvioDialog
          ordenId={orden.id}
          canal={solicitarCanal}
          onClose={() => setSolicitarCanal(null)}
          onCreada={() => {
            setSolicitarCanal(null);
            setSolicitudMsg("Solicitud de reenvío creada. Queda pendiente de autorización.");
            cargar();
            onSolicitudCreada?.();
          }}
        />
      )}
    </div>
  );
}
