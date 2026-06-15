"use client";
import { useState, useEffect, useCallback } from "react";
import { MessageCircle, Send, X, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Conversacion {
  id: string;
  wamid: string | null;
  numero_wa: string;
  nombre_remitente: string | null;
  tipo_mensaje: string;
  cuerpo: string | null;
  timestamp_wa: string | null;
  producto: "thc" | "ttc" | "desconocido";
  suscriptor_id: number | null;
  tarot_cliente_id: string | null;
  estado: "pendiente" | "auto_respondido" | "respondido" | "ignorado";
  respuesta_texto: string | null;
  respondido_at: string | null;
  respondido_por: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const PRODUCTO_BADGE: Record<string, string> = {
  thc:        "bg-violet-900/60 text-violet-300 border-violet-700/50",
  ttc:        "bg-amber-900/60  text-amber-300  border-amber-700/50",
  desconocido:"bg-gray-800      text-gray-400   border-gray-700",
};
const ESTADO_BADGE: Record<string, string> = {
  pendiente:       "bg-rose-900/60    text-rose-300    border-rose-700/50",
  auto_respondido: "bg-sky-900/60     text-sky-300     border-sky-700/50",
  respondido:      "bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
  ignorado:        "bg-gray-800       text-gray-500    border-gray-700",
};

// ─── Reply Modal ──────────────────────────────────────────────────────────────

function ReplyModal({
  conv,
  onClose,
  onSent,
}: {
  conv: Conversacion;
  onClose: () => void;
  onSent: () => void;
}) {
  const [texto, setTexto]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function enviar() {
    if (!texto.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/wa/responder", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          id:        conv.id,
          numero_wa: conv.numero_wa,
          respuesta: texto.trim(),
          admin:     "admin",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error al enviar");
      onSent();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-gray-900 border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">Responder por WhatsApp</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Info del destinatario */}
        <div className="rounded-xl bg-white/5 border border-white/8 px-4 py-3 text-sm space-y-1">
          <p className="text-white/80 font-medium">{conv.nombre_remitente ?? conv.numero_wa}</p>
          <p className="text-white/50 font-mono text-xs">{conv.numero_wa}</p>
          {conv.cuerpo && (
            <p className="text-white/40 text-xs mt-2 border-t border-white/8 pt-2 line-clamp-3">
              {conv.cuerpo}
            </p>
          )}
        </div>

        {/* Si ya tiene respuesta previa */}
        {conv.respuesta_texto && (
          <div className="rounded-xl bg-sky-950/40 border border-sky-800/40 px-4 py-3 text-xs text-sky-300 space-y-1">
            <p className="font-semibold">Respuesta anterior ({conv.respondido_por ?? "auto"}):</p>
            <p className="text-sky-400/80">{conv.respuesta_texto}</p>
          </div>
        )}

        <textarea
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500/60 resize-none"
          rows={4}
          placeholder="Escribí tu respuesta..."
          value={texto}
          onChange={e => setTexto(e.target.value)}
          disabled={loading}
        />

        {error && <p className="text-rose-400 text-xs">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={loading || !texto.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-700 hover:bg-violet-600 text-white flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <Send size={14} />
            {loading ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WaConversacionesPage() {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [filtroEstado,   setFiltroEstado]   = useState("");
  const [filtroProducto, setFiltroProducto] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 30;

  const [replyTarget, setReplyTarget] = useState<Conversacion | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit:  String(LIMIT),
        offset: String(offset),
        ...(filtroEstado   && { estado:   filtroEstado   }),
        ...(filtroProducto && { producto: filtroProducto }),
      });
      const res  = await fetch(`/api/admin/wa/conversaciones?${params}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error");
      setConversaciones(data.conversaciones ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, filtroProducto, offset]);

  useEffect(() => { cargar(); }, [cargar]);

  function aplicarFiltro(estado: string, producto: string) {
    setFiltroEstado(estado);
    setFiltroProducto(producto);
    setOffset(0);
  }

  const hasPrev = offset > 0;
  const hasNext = offset + LIMIT < total;

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-gray-950/95 backdrop-blur border-b border-white/8">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center gap-4 py-3">
            <span className="font-bold text-white text-sm whitespace-nowrap">THC Admin</span>
            <AdminPanelSwitcher current="thc" />
            <nav className="flex items-center gap-1 overflow-x-auto flex-1">
              <AdminNav current="/admin/wa" />
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 space-y-6">

        {/* Título */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle size={20} className="text-violet-400" />
            <h1 className="text-lg font-bold text-white">WA Inbox</h1>
            <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">
              {total} total
            </span>
          </div>
          <button
            onClick={() => cargar()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        {/* Nota de configuración — solo visible si falta algo */}
        <p className="text-[11px] text-gray-700 leading-relaxed">
          Para enviar respuestas desde este panel, asegurate de tener{" "}
          <code className="text-gray-600">WHATSAPP_TOKEN</code> y{" "}
          <code className="text-gray-600">WHATSAPP_PHONE_NUMBER_ID</code>{" "}
          como variables de entorno en Next.js / Vercel (los mismos valores que en Supabase).
        </p>

        {/* Filtros rápidos */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Todos",           estado: "",                producto: "" },
            { label: "Pendientes",      estado: "pendiente",       producto: "" },
            { label: "THC pendiente",   estado: "pendiente",       producto: "thc" },
            { label: "TTC pendiente",   estado: "pendiente",       producto: "ttc" },
            { label: "Auto-respondidos",estado: "auto_respondido", producto: "" },
            { label: "Respondidos",     estado: "respondido",      producto: "" },
            { label: "Ignorados",       estado: "ignorado",        producto: "" },
          ].map(f => {
            const activo = filtroEstado === f.estado && filtroProducto === f.producto;
            return (
              <button
                key={f.label}
                onClick={() => aplicarFiltro(f.estado, f.producto)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  activo
                    ? "bg-violet-700 border-violet-600 text-white font-semibold"
                    : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-rose-950/50 border border-rose-800/50 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Tabla */}
        <div className="rounded-2xl border border-white/8 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Fecha</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Remitente</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Producto</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Mensaje</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Estado</th>
                <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-600 py-12 text-sm">
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && conversaciones.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-600 py-12 text-sm">
                    No hay mensajes con este filtro.
                  </td>
                </tr>
              )}
              {conversaciones.map(conv => (
                <tr key={conv.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {fmtFecha(conv.timestamp_wa ?? conv.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white/90 font-medium text-xs">
                      {conv.nombre_remitente ?? "—"}
                    </p>
                    <p className="text-gray-600 font-mono text-[10px]">{conv.numero_wa}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5 ${PRODUCTO_BADGE[conv.producto] ?? PRODUCTO_BADGE.desconocido}`}>
                      {conv.producto}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-white/70 text-xs truncate max-w-[280px]">
                      {conv.cuerpo ?? <span className="text-gray-600 italic">{conv.tipo_mensaje}</span>}
                    </p>
                    {conv.respuesta_texto && (
                      <p className="text-sky-500/70 text-[10px] truncate max-w-[280px] mt-0.5">
                        ↳ {conv.respuesta_texto}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-[10px] font-semibold border rounded-full px-2 py-0.5 ${ESTADO_BADGE[conv.estado] ?? ESTADO_BADGE.ignorado}`}>
                      {conv.estado.replace("_", " ")}
                    </span>
                    {conv.respondido_por && (
                      <p className="text-gray-600 text-[10px] mt-0.5">{conv.respondido_por}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setReplyTarget(conv)}
                      className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 border border-violet-700/40 hover:border-violet-500/60 rounded-lg px-2.5 py-1 transition-colors"
                    >
                      <Send size={11} />
                      Responder
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {total > LIMIT && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{offset + 1}–{Math.min(offset + LIMIT, total)} de {total}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
                disabled={!hasPrev}
                className="flex items-center gap-1 border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 hover:text-white transition-colors disabled:opacity-30"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                onClick={() => setOffset(o => o + LIMIT)}
                disabled={!hasNext}
                className="flex items-center gap-1 border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 hover:text-white transition-colors disabled:opacity-30"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Reply modal */}
      {replyTarget && (
        <ReplyModal
          conv={replyTarget}
          onClose={() => setReplyTarget(null)}
          onSent={() => { setReplyTarget(null); cargar(); }}
        />
      )}
    </div>
  );
}
