"use client";
import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, AlertCircle, MessageCircle, Search, FlaskConical } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { TarotWhatsappConversacionDetalle } from "@/components/admin/TarotWhatsappConversacionDetalle";
import { TarotWhatsappDebugDialog } from "@/components/admin/TarotWhatsappDebugDialog";

interface Conversacion {
  id: string;
  telefono: string;
  nombre: string | null;
  cliente_id: string | null;
  orden_id: string | null;
  orden_ref: string | null;
  orden_estado: string | null;
  ultimo_mensaje_at: string | null;
  ultimo_mensaje_preview: string | null;
  ultimo_mensaje_direccion: string | null;
  no_leidos: number;
}

interface Paginacion { total: number; limit: number; offset: number; next_offset: number | null }

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

const ESTADO_ORDEN_LABEL: Record<string, string> = {
  entregado: "Entregado",
  entregado_simulado: "Entregado (sandbox)",
  error_whatsapp: "Error WhatsApp",
  error_critico: "Error crítico",
  lectura_lista: "Lectura lista",
};

const LIMIT = 50;

export default function TarotWhatsappPage() {
  const [filtro, setFiltro]           = useState<"todos" | "no_leidos" | "con_orden" | "sin_orden">("todos");
  const [busquedaInput, setBusquedaInput] = useState("");
  const [busqueda, setBusqueda]       = useState("");
  const [offset, setOffset]           = useState(0);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [paginacion, setPaginacion]   = useState<Paginacion | null>(null);
  const [cargando, setCargando]       = useState(false);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [mostrarDebug, setMostrarDebug] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    if (filtro !== "todos") params.set("filtro", filtro);
    if (busqueda) params.set("busqueda", busqueda);
    params.set("offset", String(offset));
    params.set("limit", String(LIMIT));
    try {
      const r = await fetch(`/api/admin/tarot/whatsapp?${params.toString()}`);
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
      } else {
        setConversaciones(json.conversaciones ?? []);
        setPaginacion(json.paginacion ?? null);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [filtro, busqueda, offset]);

  useEffect(() => { cargar(); }, [cargar]);

  function onBuscar(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setBusqueda(busquedaInput.trim());
  }

  const total = paginacion?.total ?? 0;
  const desde = total === 0 ? 0 : offset + 1;
  const hasta = Math.min(offset + LIMIT, total);

  return (
    <TarotAdminShell>
      <main className="px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <MessageCircle size={16} className="text-emerald-400" />
            WhatsApp
          </h2>
          <button
            onClick={() => setMostrarDebug(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-violet-700/60 bg-violet-950/30 text-violet-300 hover:bg-violet-900/40 transition-colors"
            title="Inyectar un webhook de WhatsApp de prueba (sin depender de un número real)"
          >
            <FlaskConical size={12} />
            Modo debug
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Mensajes entrantes de clientes por WhatsApp. Una fila por número — abrí una conversación para ver el historial completo.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex gap-1">
            {([
              { v: "todos", label: "Todos" },
              { v: "no_leidos", label: "No leídos" },
              { v: "con_orden", label: "Con orden" },
              { v: "sin_orden", label: "Sin orden" },
            ] as const).map((f) => (
              <button
                key={f.v}
                onClick={() => { setFiltro(f.v); setOffset(0); }}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  filtro === f.v ? "border-emerald-500 bg-emerald-900/40 text-emerald-300" : "border-gray-700 text-gray-400 hover:border-gray-600"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <form onSubmit={onBuscar} className="flex items-center gap-1.5 ml-auto">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={busquedaInput}
                onChange={(e) => setBusquedaInput(e.target.value)}
                placeholder="Nombre, teléfono u orden…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500 w-56"
              />
            </div>
            <button
              type="submit"
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 transition-colors"
            >
              Buscar
            </button>
          </form>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800 text-left">
                  <th className="px-4 py-3 font-medium text-gray-400">Contacto</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Último mensaje</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Fecha</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Orden</th>
                  <th className="px-4 py-3 font-medium text-gray-400 text-right">No leídos</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">Cargando conversaciones…</td></tr>
                )}
                {!cargando && !errorMsg && conversaciones.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500 text-sm">Sin conversaciones.</td></tr>
                )}
                {!cargando && conversaciones.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSeleccionada(c.id)}
                    className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${c.no_leidos > 0 ? "bg-emerald-950/10" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="text-gray-200 font-medium">{c.nombre ?? "Desconocido"}</div>
                      <div className="text-xs text-gray-500 font-mono">{c.telefono}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-xs truncate">
                      {c.ultimo_mensaje_direccion === "outbound" && <span className="text-gray-600 mr-1">↳</span>}
                      {c.ultimo_mensaje_preview ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{fmtFecha(c.ultimo_mensaje_at)}</td>
                    <td className="px-4 py-3">
                      {c.orden_ref ? (
                        <div>
                          <div className="text-xs font-mono text-gray-400">#{c.orden_ref.slice(-8)}</div>
                          {c.orden_estado && (
                            <div className="text-xs text-gray-600">{ESTADO_ORDEN_LABEL[c.orden_estado] ?? c.orden_estado}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">Sin orden</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.no_leidos > 0 && (
                        <span className="inline-block text-xs bg-emerald-500 text-gray-950 font-bold rounded-full px-2 py-0.5">
                          {c.no_leidos > 99 ? "99+" : c.no_leidos}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {!cargando && paginacion && total > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
            <span>{desde}–{hasta} de {total} conversaciones</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                disabled={offset === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                onClick={() => { if (paginacion.next_offset != null) setOffset(paginacion.next_offset); }}
                disabled={paginacion.next_offset == null}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </main>

      {seleccionada && (
        <TarotWhatsappConversacionDetalle
          conversacionId={seleccionada}
          onClose={() => setSeleccionada(null)}
          onCambio={() => cargar()}
        />
      )}

      {mostrarDebug && (
        <TarotWhatsappDebugDialog
          onClose={() => setMostrarDebug(false)}
          onInyectado={() => cargar()}
        />
      )}
    </TarotAdminShell>
  );
}
