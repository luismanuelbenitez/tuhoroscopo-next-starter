"use client";
import { useState, useEffect, useCallback } from "react";
import {
  X, Check, EyeOff, ExternalLink, FileImage, FileText, Music, Video, Smile,
  MapPin, User, MousePointerClick, HelpCircle, Send, Clock, AlertCircle,
  RotateCcw, CheckCheck, FlaskConical, ChevronDown,
} from "lucide-react";

interface Mensaje {
  id: string;
  whatsapp_message_id: string | null;
  direccion: "inbound" | "outbound";
  tipo: string;
  texto: string | null;
  media_id: string | null;
  mime_type: string | null;
  filename: string | null;
  payload_meta: Record<string, unknown> | null;
  timestamp_whatsapp: string | null;
  estado: string | null;
  enviado_at: string | null;
  error_code: string | null;
  error_detalle: string | null;
  created_at: string;
}
interface EnvioWA {
  id: string; estado: string; numero_intento: number; wa_message_id: string | null;
  enviado_at: string | null; entregado_at: string | null; leido_at: string | null; created_at: string;
}
interface Cliente { id: string; nombre_completo: string; telefono: string; email: string | null }
interface Orden { id: string; external_reference: string | null; estado: string; tema: string; created_at: string }
interface Conversacion { id: string; telefono: string; cliente_id: string | null; orden_id: string | null; wa_contact_name: string | null; no_leidos: number }
interface Ventana24h { activa: boolean; ultimo_inbound_at: string | null; expira_at: string | null; segundos_restantes: number | null }

// Solo abre una pestaña — el fetch real (con el Bearer de Meta) pasa por el
// servidor, esto nunca expone credenciales al navegador.
function verMedia(conversacionId: string, mensajeId: string) {
  window.open(`/api/admin/tarot/whatsapp/${conversacionId}/media/${mensajeId}`, "_blank", "noopener,noreferrer");
}

const TIPO_ICONO: Record<string, React.ReactNode> = {
  image: <FileImage size={13} />, document: <FileText size={13} />, audio: <Music size={13} />,
  video: <Video size={13} />, sticker: <Smile size={13} />, location: <MapPin size={13} />,
  contact: <User size={13} />, interactive: <MousePointerClick size={13} />, unknown: <HelpCircle size={13} />,
};
const TIPO_LABEL: Record<string, string> = {
  image: "Imagen recibida", document: "Documento recibido", audio: "Audio recibido",
  video: "Video recibido", sticker: "Sticker", location: "Ubicación compartida",
  contact: "Contacto compartido", interactive: "Respuesta a botón/lista", unknown: "Mensaje no reconocido",
};

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
function fmtHora(iso: string | null) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
function fmtRestante(segundos: number | null) {
  if (segundos == null) return "";
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

// Estado visual del outbound — discreto, sin imitar los ticks de WhatsApp al pixel.
function EstadoOutbound({ msg, onVerError, onReintentar, reintentando }: {
  msg: Mensaje; onVerError: () => void; onReintentar: () => void; reintentando: boolean;
}) {
  if (msg.estado === "preparando") {
    return <span className="inline-flex items-center gap-1 text-gray-400"><Clock size={10} /> Enviando…</span>;
  }
  if (msg.estado === "error") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button onClick={onVerError} className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 underline underline-offset-2">
          <AlertCircle size={10} /> Error
        </button>
        <button
          onClick={onReintentar}
          disabled={reintentando}
          className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 disabled:opacity-40"
        >
          <RotateCcw size={10} /> {reintentando ? "Reintentando…" : "Reintentar"}
        </button>
      </span>
    );
  }
  if (msg.estado === "simulado") {
    return <span className="inline-flex items-center gap-1 text-violet-400"><FlaskConical size={10} /> Simulado</span>;
  }
  if (msg.estado === "leido") {
    return <span className="inline-flex items-center gap-1 text-sky-400"><CheckCheck size={10} /> Leído</span>;
  }
  if (msg.estado === "entregado") {
    return <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCheck size={10} /> Entregado</span>;
  }
  if (msg.estado === "enviado") {
    return <span className="inline-flex items-center gap-1 text-gray-400"><Check size={10} /> Enviado</span>;
  }
  return null;
}

function BurbujaMensaje({
  msg, conversacionId, modoSandbox, onVerError, onReintentar, onSimularStatus, reintentandoId,
}: {
  msg: Mensaje; conversacionId: string; modoSandbox: boolean;
  onVerError: (msg: Mensaje) => void; onReintentar: (mensajeId: string) => void;
  onSimularStatus: (waMessageId: string, status: "sent" | "delivered" | "read" | "failed") => void;
  reintentandoId: string | null;
}) {
  const esInbound = msg.direccion === "inbound";
  const esMedia = ["image", "document", "audio", "video", "sticker"].includes(msg.tipo);
  const [menuDebugAbierto, setMenuDebugAbierto] = useState(false);

  return (
    <div className={`flex ${esInbound ? "justify-start" : "justify-end"} mb-2`}>
      <div className="max-w-[75%]">
        <div
          className={`rounded-xl px-3.5 py-2.5 text-sm ${
            esInbound ? "bg-gray-800 text-gray-100" : "bg-emerald-900/50 text-emerald-50"
          }`}
        >
          {msg.tipo === "text" && <p className="whitespace-pre-wrap break-words">{msg.texto}</p>}

          {esMedia && (
            <div className="flex items-center gap-2 text-gray-300">
              {TIPO_ICONO[msg.tipo]}
              <span>{TIPO_LABEL[msg.tipo] ?? "Media recibida"}</span>
              {msg.filename && <span className="text-xs text-gray-500">({msg.filename})</span>}
              {msg.media_id && (
                <button
                  onClick={() => verMedia(conversacionId, msg.id)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                >
                  Ver
                </button>
              )}
            </div>
          )}
          {esMedia && msg.texto && <p className="mt-1 text-xs text-gray-400 whitespace-pre-wrap">{msg.texto}</p>}

          {msg.tipo === "location" && (
            <div className="flex items-center gap-2 text-gray-300">
              <MapPin size={13} />
              <span>{(msg.payload_meta?.name as string) ?? "Ubicación"} — {(msg.payload_meta?.address as string) ?? ""}</span>
            </div>
          )}
          {msg.tipo === "contact" && (
            <div className="flex items-center gap-2 text-gray-300">
              <User size={13} />
              <span>{(msg.payload_meta?.nombre as string) ?? "Contacto"} — {(msg.payload_meta?.telefono as string) ?? ""}</span>
            </div>
          )}
          {msg.tipo === "interactive" && (
            <div className="flex items-center gap-2 text-gray-300">
              <MousePointerClick size={13} />
              <span>{msg.texto ?? "Respuesta seleccionada"}</span>
            </div>
          )}
          {msg.tipo === "unknown" && (
            <div className="flex items-center gap-2 text-gray-500 italic">
              <HelpCircle size={13} />
              <span>Tipo de mensaje no reconocido{(msg.payload_meta?.rawType as string) ? ` (${msg.payload_meta?.rawType})` : ""}</span>
            </div>
          )}
          {msg.tipo === "reaction" && (
            <p className="text-gray-300">Reaccionó a un mensaje</p>
          )}

          <div className={`mt-1 flex items-center gap-2 text-[10px] ${esInbound ? "text-gray-500" : "text-emerald-400/60"}`}>
            <span>{fmtHora(msg.timestamp_whatsapp ?? msg.created_at)}</span>
            {!esInbound && (
              <EstadoOutbound
                msg={msg}
                onVerError={() => onVerError(msg)}
                onReintentar={() => onReintentar(msg.id)}
                reintentando={reintentandoId === msg.id}
              />
            )}
          </div>
        </div>

        {/* Modo debug: simular el status de Meta sobre ESTE mensaje outbound —
            solo visible en sandbox, nunca en Production real. */}
        {!esInbound && modoSandbox && msg.whatsapp_message_id && (
          <div className="relative mt-0.5 flex justify-end">
            <button
              onClick={() => setMenuDebugAbierto((v) => !v)}
              className="flex items-center gap-0.5 text-[10px] text-violet-400/70 hover:text-violet-300"
            >
              <FlaskConical size={9} /> simular status <ChevronDown size={9} />
            </button>
            {menuDebugAbierto && (
              <div className="absolute right-0 top-4 z-10 flex flex-col rounded-lg border border-violet-800/60 bg-gray-950 shadow-lg overflow-hidden">
                {(["sent", "delivered", "read", "failed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { onSimularStatus(msg.whatsapp_message_id as string, s); setMenuDebugAbierto(false); }}
                    className="px-3 py-1.5 text-left text-[11px] text-gray-300 hover:bg-violet-900/40 whitespace-nowrap"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EventoSistema({ envio }: { envio: EnvioWA }) {
  const label = envio.estado === "enviado" ? "Plantilla enviada"
    : envio.estado === "entregado" ? "Entregado"
    : envio.estado === "leido" ? "Leído"
    : envio.estado === "simulado" ? "Simulado (sandbox)"
    : envio.estado === "error" ? "Error al enviar"
    : envio.estado;
  return (
    <div className="flex justify-center my-2">
      <span className="text-[11px] text-gray-500 bg-gray-900/60 border border-gray-800 rounded-full px-3 py-1">
        📨 {label} · Tu Tirada · {fmtFecha(envio.enviado_at ?? envio.created_at)}
      </span>
    </div>
  );
}

export function TarotWhatsappConversacionDetalle({
  conversacionId, onClose, onCambio,
}: { conversacionId: string; onClose: () => void; onCambio: () => void }) {
  const [cargando, setCargando]   = useState(true);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [conv, setConv]           = useState<Conversacion | null>(null);
  const [cliente, setCliente]     = useState<Cliente | null>(null);
  const [orden, setOrden]         = useState<Orden | null>(null);
  const [mensajes, setMensajes]   = useState<Mensaje[]>([]);
  const [enviosWA, setEnviosWA]   = useState<EnvioWA[]>([]);
  const [ventana, setVentana]     = useState<Ventana24h | null>(null);
  const [modoSandbox, setModoSandbox] = useState(false);
  const [marcando, setMarcando]   = useState(false);

  // Composer
  const [texto, setTexto]           = useState("");
  const [enviando, setEnviando]     = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [reintentandoId, setReintentandoId] = useState<string | null>(null);
  const [errorDetalleVisto, setErrorDetalleVisto] = useState<Mensaje | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const r = await fetch(`/api/admin/tarot/whatsapp/${conversacionId}`);
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
      } else {
        setConv(json.conversacion);
        setCliente(json.cliente);
        setOrden(json.orden);
        setMensajes(json.mensajes ?? []);
        setEnviosWA(json.envios_whatsapp_orden ?? []);
        setVentana(json.ventana_24h ?? null);
        setModoSandbox(!!json.modo_sandbox);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [conversacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function marcar(accion: "marcar_leido" | "marcar_no_leido") {
    setMarcando(true);
    try {
      const r = await fetch(`/api/admin/tarot/whatsapp/${conversacionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      if (r.ok) {
        await cargar();
        onCambio();
      }
    } finally {
      setMarcando(false);
    }
  }

  // Guarda simple contra doble click/doble envío mientras `enviando` es true
  // (el botón y el atajo de teclado quedan deshabilitados) — no hace falta
  // un mecanismo más elaborado para un composer manual de un solo admin.
  async function enviarRespuesta() {
    const textoLimpio = texto.trim();
    if (!textoLimpio || enviando || !ventana?.activa) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const r = await fetch(`/api/admin/tarot/whatsapp/${conversacionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "responder", texto: textoLimpio }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        // Mantiene el texto en el composer si falla — nada se pierde.
        setErrorEnvio(
          json?.motivo === "ventana_24h_vencida"
            ? "La ventana de 24h venció mientras escribías — no se pudo enviar."
            : json?.error_detalle ?? json?.motivo ?? `Error HTTP ${r.status}`,
        );
      } else {
        setTexto(""); // Solo se limpia si Meta aceptó (o se simuló en sandbox).
        await cargar();
      }
    } catch (e: unknown) {
      setErrorEnvio(e instanceof Error ? e.message : "Error de red");
    } finally {
      setEnviando(false);
    }
  }

  async function reintentar(mensajeId: string) {
    setReintentandoId(mensajeId);
    try {
      const r = await fetch(`/api/admin/tarot/whatsapp/${conversacionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "reintentar", mensaje_id: mensajeId }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setErrorEnvio(json?.motivo === "ventana_24h_vencida"
          ? "La ventana de 24h venció — no se pudo reintentar."
          : json?.error_detalle ?? json?.motivo ?? "No se pudo reintentar.");
      }
      await cargar();
    } finally {
      setReintentandoId(null);
    }
  }

  async function simularStatus(waMessageId: string, status: "sent" | "delivered" | "read" | "failed") {
    try {
      await fetch("/api/admin/tarot/whatsapp/debug-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp_message_id: waMessageId, status }),
      });
    } finally {
      await cargar();
    }
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter = salto de línea (comportamiento normal de textarea).
    // Ctrl+Enter (o Cmd+Enter en mac) = enviar.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      enviarRespuesta();
    }
  }

  // Mezclar mensajes inbound/outbound + eventos de sistema (envíos WA reales
  // de la orden) en orden cronológico — sin fabricar mensajes outbound que
  // no existen (ver docs/modules/whatsapp-inbox.md § Mensajes outbound).
  type Item = { ts: number; tipo: "mensaje"; data: Mensaje } | { ts: number; tipo: "evento"; data: EnvioWA };
  const timeline: Item[] = [
    ...mensajes.map((m): Item => ({ ts: new Date(m.timestamp_whatsapp ?? m.created_at).getTime(), tipo: "mensaje", data: m })),
    ...enviosWA.map((e): Item => ({ ts: new Date(e.enviado_at ?? e.created_at).getTime(), tipo: "evento", data: e })),
  ].sort((a, b) => a.ts - b.ts);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-gray-950 border-l border-gray-800 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div className="min-w-0">
            <h3 className="text-white font-semibold truncate">{cliente?.nombre_completo ?? conv?.wa_contact_name ?? "Desconocido"}</h3>
            <p className="text-xs text-gray-500 font-mono">{conv?.telefono}</p>
            {orden && (
              <a
                href={`/admin/tarot/ordenes/${orden.id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
              >
                Ver orden #{orden.external_reference?.slice(-8) ?? orden.id.slice(0, 8)}
                <ExternalLink size={11} />
              </a>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-800/60 shrink-0">
          <button
            onClick={() => marcar("marcar_leido")}
            disabled={marcando || conv?.no_leidos === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-emerald-700/60 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Check size={12} /> Marcar leído
          </button>
          <button
            onClick={() => marcar("marcar_no_leido")}
            disabled={marcando || (conv?.no_leidos ?? 0) > 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <EyeOff size={12} /> Marcar no leído
          </button>
        </div>

        {/* Historial */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {cargando && <p className="text-center text-gray-500 text-sm animate-pulse mt-10">Cargando conversación…</p>}
          {errorMsg && (
            <p className="text-center text-red-400 text-sm mt-10">{errorMsg}</p>
          )}
          {!cargando && !errorMsg && timeline.length === 0 && (
            <p className="text-center text-gray-500 text-sm mt-10">Sin mensajes.</p>
          )}
          {!cargando && !errorMsg && timeline.map((item) =>
            item.tipo === "mensaje"
              ? (
                <BurbujaMensaje
                  key={item.data.id}
                  msg={item.data}
                  conversacionId={conversacionId}
                  modoSandbox={modoSandbox}
                  onVerError={setErrorDetalleVisto}
                  onReintentar={reintentar}
                  onSimularStatus={simularStatus}
                  reintentandoId={reintentandoId}
                />
              )
              : <EventoSistema key={item.data.id} envio={item.data} />
          )}
        </div>

        {/* Detalle técnico de un error (solo si el admin lo pide) */}
        {errorDetalleVisto && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70" onClick={() => setErrorDetalleVisto(null)}>
            <div className="max-w-sm w-full mx-4 rounded-lg border border-red-800/60 bg-gray-950 p-4" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-red-300 font-medium mb-1.5">Error al enviar</p>
              <p className="text-xs text-gray-400 mb-1">Código: {errorDetalleVisto.error_code ?? "—"}</p>
              <p className="text-xs text-gray-400 break-words">{errorDetalleVisto.error_detalle ?? "Sin detalle adicional."}</p>
              <button
                onClick={() => setErrorDetalleVisto(null)}
                className="mt-3 w-full text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Ventana 24h + Composer */}
        <div className="border-t border-gray-800 px-5 py-3 shrink-0">
          {ventana?.activa ? (
            <p className="mb-2 flex items-center gap-1.5 text-[11px] text-emerald-400">
              <Clock size={11} /> Ventana de atención activa
              {ventana.segundos_restantes != null && (
                <span className="text-emerald-500/60">— quedan ~{fmtRestante(ventana.segundos_restantes)}</span>
              )}
            </p>
          ) : (
            <div className="mb-2 rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium">
                <Clock size={11} /> Ventana de 24h vencida
              </p>
              <p className="mt-1 text-[11px] text-amber-500/70">
                Para volver a contactar al cliente fuera de la ventana de 24 horas se requiere una plantilla aprobada por Meta.
              </p>
            </div>
          )}

          {errorEnvio && (
            <div className="mb-2 flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle size={12} className="shrink-0" /> {errorEnvio}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={onComposerKeyDown}
              disabled={!ventana?.activa || enviando}
              placeholder={ventana?.activa ? "Escribí una respuesta… (Ctrl+Enter para enviar)" : "Ventana vencida — no se puede responder con texto libre"}
              rows={2}
              maxLength={4096}
              className="flex-1 resize-none rounded-lg bg-gray-900 border border-gray-700 text-white text-sm px-3 py-2 placeholder:text-gray-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={enviarRespuesta}
              disabled={!ventana?.activa || enviando || !texto.trim()}
              className="flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-lg border border-emerald-700/60 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Send size={14} /> {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
