"use client";
import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, AlertCircle, MessageCircle, Search, FlaskConical } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { TarotWhatsappConversacionDetalle } from "@/components/admin/TarotWhatsappConversacionDetalle";
import { TarotWhatsappDebugDialog } from "@/components/admin/TarotWhatsappDebugDialog";
import { TarotWhatsappEventos } from "@/components/admin/TarotWhatsappEventos";

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
  tiene_conversacion?: boolean;
  n_envios?: number;
  con_problema?: boolean;
  ultimo_envio?: {
    estado: string; wa_status: string | null; enviado_at: string | null; entregado_at: string | null;
    leido_at: string | null; error_code: string | null; simulado: boolean;
  } | null;
}

// Marca de estado del ÚLTIMO envío de la tirada al contacto (tipo WhatsApp).
function EstadoEnvio({ e }: { e: NonNullable<Conversacion["ultimo_envio"]> }) {
  if (e.simulado) return <span className="text-[11px] text-violet-400" title="Envío simulado (sandbox)">simulado</span>;
  if (e.estado === "error") return <span className="text-[11px] text-red-400" title={e.error_code ? `Error ${e.error_code}` : "Error al enviar"}>✗ falló</span>;
  if (e.estado === "enviando") return <span className="text-[11px] text-amber-400" title="Sin confirmación de envío">… enviando</span>;
  if (e.leido_at || e.estado === "leido") return <span className="text-[13px] text-sky-400" title="Leído">✓✓</span>;
  if (e.entregado_at || e.estado === "entregado") return <span className="text-[13px] text-gray-400" title="Entregado">✓✓</span>;
  return <span className="text-[13px] text-gray-500" title="Enviado">✓</span>;
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
  const [filtro, setFiltro]           = useState<"todos" | "no_leidos" | "con_orden" | "sin_orden" | "solo_envios" | "con_problemas">("todos");
  const [verSimulados, setVerSimulados] = useState(false);
  const [busquedaInput, setBusquedaInput] = useState("");
  const [busqueda, setBusqueda]       = useState("");
  const [offset, setOffset]           = useState(0);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [paginacion, setPaginacion]   = useState<Paginacion | null>(null);
  const [cargando, setCargando]       = useState(false);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [mostrarDebug, setMostrarDebug] = useState(false);
  const [vista, setVista] = useState<"conversaciones" | "eventos">("conversaciones");

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    if (filtro !== "todos") params.set("filtro", filtro);
    if (busqueda) params.set("busqueda", busqueda);
    if (verSimulados) params.set("incluir_simulados", "true");
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
  }, [filtro, busqueda, offset, verSimulados]);

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

        <div className="flex gap-1 mb-4">
          {([
            { v: "conversaciones", label: "Conversaciones" },
            { v: "eventos", label: "Eventos de Meta" },
          ] as const).map((t) => (
            <button
              key={t.v}
              onClick={() => setVista(t.v)}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                vista === t.v ? "border-emerald-500 bg-emerald-900/40 text-emerald-300" : "border-gray-700 text-gray-400 hover:border-gray-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {vista === "eventos" && <TarotWhatsappEventos />}

        {vista === "conversaciones" && (<>
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
              { v: "solo_envios", label: "Con envíos" },
              { v: "con_problemas", label: "Con problemas" },
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

          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none" title="Incluye los envíos de prueba (modo sandbox)">
            <input
              type="checkbox"
              checked={verSimulados}
              onChange={(e) => { setVerSimulados(e.target.checked); setOffset(0); }}
              className="accent-violet-500"
            />
            Ver simulados
          </label>

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
                      {c.ultimo_mensaje_direccion === "outbound" && c.ultimo_envio && (
                        <span className="ml-2 align-middle"><EstadoEnvio e={c.ultimo_envio} /></span>
                      )}
                      {(c.n_envios ?? 0) > 1 && <span className="ml-2 text-[10px] text-gray-600">({c.n_envios} envíos)</span>}
                      {c.tiene_conversacion === false && <span className="ml-2 text-[10px] text-gray-600">· aún no escribió</span>}
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
        </>)}
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
