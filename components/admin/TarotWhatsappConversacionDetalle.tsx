"use client";
import { useState, useEffect, useCallback } from "react";
import { X, Check, EyeOff, ExternalLink, FileImage, FileText, Music, Video, Smile, MapPin, User, MousePointerClick, HelpCircle } from "lucide-react";

interface Mensaje {
  id: string;
  whatsapp_message_id: string;
  direccion: "inbound" | "outbound";
  tipo: string;
  texto: string | null;
  media_id: string | null;
  mime_type: string | null;
  filename: string | null;
  payload_meta: Record<string, unknown> | null;
  timestamp_whatsapp: string | null;
  created_at: string;
}
interface EnvioWA {
  id: string; estado: string; numero_intento: number; wa_message_id: string | null;
  enviado_at: string | null; entregado_at: string | null; leido_at: string | null; created_at: string;
}
interface Cliente { id: string; nombre_completo: string; telefono: string; email: string | null }
interface Orden { id: string; external_reference: string | null; estado: string; tema: string; created_at: string }
interface Conversacion { id: string; telefono: string; cliente_id: string | null; orden_id: string | null; wa_contact_name: string | null; no_leidos: number }

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

function BurbujaMensaje({ msg, conversacionId }: { msg: Mensaje; conversacionId: string }) {
  const esInbound = msg.direccion === "inbound";
  const esMedia = ["image", "document", "audio", "video", "sticker"].includes(msg.tipo);

  return (
    <div className={`flex ${esInbound ? "justify-start" : "justify-end"} mb-2`}>
      <div
        className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm ${
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

        <p className={`mt-1 text-[10px] ${esInbound ? "text-gray-500" : "text-emerald-400/60"}`}>
          {fmtHora(msg.timestamp_whatsapp ?? msg.created_at)}
        </p>
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
  const [marcando, setMarcando]   = useState(false);

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

  // Mezclar mensajes inbound + eventos de sistema (envíos WA reales de la
  // orden) en orden cronológico — sin fabricar mensajes outbound que no
  // existen (ver docs/modules/whatsapp-inbox.md § Mensajes outbound).
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
              ? <BurbujaMensaje key={item.data.id} msg={item.data} conversacionId={conversacionId} />
              : <EventoSistema key={item.data.id} envio={item.data} />
          )}
        </div>
      </div>
    </div>
  );
}
