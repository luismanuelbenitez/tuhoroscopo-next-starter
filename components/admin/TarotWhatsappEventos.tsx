"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, Activity, X } from "lucide-react";

interface Resumen {
  ultimo_evento_at: string | null;
  ultimo_mensaje_entrante_at: string | null;
  ultimo_estado_entrega_at: string | null;
  eventos_7d: number;
  importantes_7d: number;
  requieren_atencion_7d: number;
  por_tipo: Record<string, { ult24h: number; ult7d: number }>;
}

interface Evento {
  id: number;
  created_at: string;
  tipo_evento: string;
  categoria: "mensaje" | "estado" | "importante" | "otro";
  severidad: "critico" | "atencion" | "info";
  titulo: string;
  resumen: string;
  display_phone_number: string | null;
  phone_number_id: string | null;
  processing_status: string | null;
  processing_error: string | null;
}

interface Paginacion { total: number; limit: number; offset: number; next_offset: number | null }

const LIMIT = 50;

const CATEGORIAS = [
  { v: "todos", label: "Todos" },
  { v: "importantes", label: "Importantes" },
  { v: "mensajes", label: "Mensajes" },
  { v: "estados", label: "Entregas" },
  { v: "otros", label: "Otros" },
] as const;

const CAT_LABEL: Record<string, string> = { mensaje: "Mensaje", estado: "Entrega", importante: "Importante", otro: "Otro" };

function fmt(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return iso; }
}

function hace(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}

const SEV_ESTILO: Record<string, string> = {
  critico: "border-red-600 bg-red-950/40 text-red-300",
  atencion: "border-amber-600 bg-amber-950/30 text-amber-300",
  info: "border-gray-700 bg-gray-900 text-gray-400",
};

export function TarotWhatsappEventos() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]["v"]>("todos");
  const [offset, setOffset] = useState(0);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ id: number; json: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/admin/tarot/whatsapp/eventos?accion=resumen"),
        fetch(`/api/admin/tarot/whatsapp/eventos?accion=listar&categoria=${categoria}&limit=${LIMIT}&offset=${offset}`),
      ]);
      const j1 = await r1.json().catch(() => null);
      const j2 = await r2.json().catch(() => null);
      if (j1?.ok) setResumen(j1);
      if (!r2.ok || !j2?.ok) setErrorMsg(j2?.detalle ?? j2?.motivo ?? `Error HTTP ${r2.status}`);
      else { setEventos(j2.eventos ?? []); setPaginacion(j2.paginacion ?? null); }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [categoria, offset]);

  useEffect(() => { cargar(); }, [cargar]);

  async function abrir(id: number) {
    const r = await fetch(`/api/admin/tarot/whatsapp/eventos?accion=detalle&id=${id}`);
    const j = await r.json().catch(() => null);
    setDetalle({ id, json: j?.ok ? JSON.stringify(j.evento, null, 2) : JSON.stringify(j ?? { error: `HTTP ${r.status}` }, null, 2) });
  }

  // Salud: si hace más de 48 h que no llega NADA, probable webhook desconectado.
  const horasSinEventos = resumen?.ultimo_evento_at ? (Date.now() - new Date(resumen.ultimo_evento_at).getTime()) / 3600000 : Infinity;
  const total = paginacion?.total ?? 0;
  const desde = total === 0 ? 0 : offset + 1;
  const hasta = Math.min(offset + LIMIT, total);

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Todo lo que Meta envía al webhook: mensajes de clientes, estados de entrega, plantillas, calidad del número y alertas de cuenta.
      </p>

      {resumen && horasSinEventos > 48 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>
            No llega ningún evento {resumen.ultimo_evento_at ? `desde ${hace(resumen.ultimo_evento_at)}` : "todavía"}. Si estás enviando o recibiendo mensajes, revisá el webhook en Meta (URL, campo <b>messages</b> suscrito y app en modo Live).
          </span>
        </div>
      )}

      {resumen && resumen.requieren_atencion_7d > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">
          <AlertCircle size={15} className="shrink-0" />
          {resumen.requieren_atencion_7d} evento(s) de plantillas/calidad/cuenta requieren atención en los últimos 7 días — filtrá por “Importantes”.
        </div>
      )}

      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { t: "Último evento", v: hace(resumen.ultimo_evento_at), s: fmt(resumen.ultimo_evento_at) },
            { t: "Último mensaje entrante", v: hace(resumen.ultimo_mensaje_entrante_at), s: fmt(resumen.ultimo_mensaje_entrante_at) },
            { t: "Última entrega/lectura", v: hace(resumen.ultimo_estado_entrega_at), s: fmt(resumen.ultimo_estado_entrega_at) },
            { t: "Eventos 7 días", v: String(resumen.eventos_7d), s: `${resumen.importantes_7d} importantes` },
          ].map((c) => (
            <div key={c.t} className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Activity size={11} />{c.t}</div>
              <div className="text-sm font-semibold text-gray-200">{c.v}</div>
              <div className="text-xs text-gray-600 font-mono">{c.s}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 mb-4">
        {CATEGORIAS.map((c) => (
          <button
            key={c.v}
            onClick={() => { setCategoria(c.v); setOffset(0); }}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              categoria === c.v ? "border-emerald-500 bg-emerald-900/40 text-emerald-300" : "border-gray-700 text-gray-400 hover:border-gray-600"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
          <AlertCircle size={15} className="shrink-0" />{errorMsg}
        </div>
      )}

      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800 text-left">
                <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Fecha</th>
                <th className="px-4 py-3 font-medium text-gray-400">Tipo</th>
                <th className="px-4 py-3 font-medium text-gray-400">Detalle</th>
                <th className="px-4 py-3 font-medium text-gray-400">Número</th>
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500 animate-pulse">Cargando eventos…</td></tr>}
              {!cargando && !errorMsg && eventos.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">Sin eventos.</td></tr>}
              {!cargando && eventos.map((e) => (
                <tr key={e.id} onClick={() => abrir(e.id)} className="border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{fmt(e.created_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-block text-[11px] rounded-full border px-2 py-0.5 ${SEV_ESTILO[e.severidad]}`}>{CAT_LABEL[e.categoria]}</span>
                    <div className="text-[11px] text-gray-600 font-mono mt-1">{e.tipo_evento}</div>
                  </td>
                  <td className="px-4 py-3 max-w-md">
                    {e.categoria === "importante" && <div className="text-gray-200 font-medium">{e.titulo}</div>}
                    <div className="text-gray-400 text-xs break-words">{e.resumen}</div>
                    {e.processing_error && <div className="text-red-400 text-xs mt-1">Error: {e.processing_error}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">{e.display_phone_number ?? e.phone_number_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!cargando && paginacion && total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
          <span>{desde}–{hasta} de {total} eventos</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={14} /> Anterior
            </button>
            <button onClick={() => { if (paginacion.next_offset != null) setOffset(paginacion.next_offset); }} disabled={paginacion.next_offset == null}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Siguiente <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDetalle(null)}>
          <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-xl border border-gray-700 bg-gray-950" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="text-sm font-semibold text-white">Evento #{detalle.id}</span>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-white"><X size={16} /></button>
            </div>
            <pre className="p-4 text-xs text-gray-300 overflow-auto max-h-[70vh] whitespace-pre-wrap break-words">{detalle.json}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
