"use client";
import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  MessageCircle,
  Mail,
  RotateCcw,
  History,
  X as XIcon,
} from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { TarotEntregaDetalle } from "@/components/admin/TarotEntregaDetalle";
import { AutorizarReenvioDialog } from "@/components/admin/AutorizarReenvioDialog";
import { RechazarReenvioDialog } from "@/components/admin/RechazarReenvioDialog";

interface CanalResumen {
  destino: string | null;
  estado: string | null;
  intentos: number;
  ultimo_envio_at: string | null;
  es_reenvio_ultimo: boolean;
  tiene_reenvio_historico: boolean;
  clasificacion: string; // "ok" | "error" | "en_curso" | "sin_intento" | "simulado" | "no_solicitado" | "legacy_sin_datos"
}

interface OrdenEntrega {
  orden_id: string;
  orden_ref: string | null;
  cliente_nombre: string | null;
  whatsapp: CanalResumen;
  email: CanalResumen;
  ultima_actividad_at: string | null;
  estado_general: string;
  reenvio_pendiente: boolean;
  tiene_reenvio_historico: boolean;
}

interface Solicitud {
  id: string;
  orden_id: string;
  canal: "whatsapp" | "email";
  motivo: string;
  motivo_detalle: string | null;
  estado: string;
  solicitado_por: string;
  solicitado_at: string;
  tarot_ordenes?: { external_reference: string | null; tarot_clientes?: { nombre_completo: string | null } | null } | null;
}

interface Paginacion { total: number; limit: number; offset: number; next_offset: number | null }

const ESTADO_GENERAL: Record<string, { label: string; cls: string }> = {
  entregado: { label: "Entregado", cls: "bg-emerald-900/50 text-emerald-300" },
  parcial:   { label: "Parcial",   cls: "bg-amber-900/50 text-amber-300" },
  error:     { label: "Error",     cls: "bg-red-900/50 text-red-300" },
  enviando:  { label: "Enviando",  cls: "bg-amber-900/50 text-amber-300" },
  simulado:  { label: "Simulado (sandbox)", cls: "bg-violet-900/50 text-violet-300" },
  pendiente: { label: "Pendiente", cls: "bg-gray-800 text-gray-400" },
};

const MOTIVO_LABEL: Record<string, string> = {
  cliente_no_recibio: "Cliente indica que no recibió",
  direccion_corregida: "Dirección corregida",
  solicitud_cliente: "Solicitud del cliente",
  prueba_administrativa: "Prueba administrativa",
  otro: "Otro",
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

const ESTADO_CANAL_CLS: Record<string, string> = {
  enviado: "bg-emerald-900/50 text-emerald-300",
  entregado: "bg-emerald-900/50 text-emerald-300",
  leido: "bg-emerald-900/50 text-emerald-300",
  error: "bg-red-900/50 text-red-300",
  agotado_reintentos: "bg-red-900/50 text-red-300",
  enviando: "bg-amber-900/50 text-amber-300",
  pendiente: "bg-amber-900/50 text-amber-300",
  simulado: "bg-violet-900/50 text-violet-300",
};

// Estados sin intento real que la celda representa con texto simple en vez de
// badge de color — "no_solicitado"/"legacy_sin_datos" nunca deben leerse como
// un fallo (ver ef_tarot_admin_listar_entregas: nunca cuentan para "parcial").
const SIN_INTENTO_LABEL: Record<string, string> = {
  sin_intento: "Sin enviar",
  no_solicitado: "No solicitado",
  legacy_sin_datos: "Sin datos (orden anterior)",
};

function CanalCell({ icon, canal }: { icon: React.ReactNode; canal: CanalResumen }) {
  const sinIntentoLabel = SIN_INTENTO_LABEL[canal.clasificacion];
  if (sinIntentoLabel) {
    return <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">{icon}<span>{sinIntentoLabel}</span></span>;
  }
  if (!canal.estado) {
    return <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">{icon}<span>Sin enviar</span></span>;
  }
  const cls = ESTADO_CANAL_CLS[canal.estado] ?? "bg-gray-800 text-gray-400";
  const label = canal.estado === "agotado_reintentos" ? "Reintentos agotados"
    : canal.estado === "simulado" ? "Simulado (sandbox)"
    : canal.estado.charAt(0).toUpperCase() + canal.estado.slice(1);
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <Badge text={label} cls={cls} />
      {canal.intentos > 1 && <span className="text-xs text-gray-600">×{canal.intentos}</span>}
      {canal.tiene_reenvio_historico && (
        <History size={12} className="text-violet-400" aria-label="Incluye reenvíos históricos previos a la gobernanza actual" />
      )}
    </span>
  );
}

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

const LIMIT = 50;

export default function TarotEntregasPage() {
  const [vista, setVista] = useState<"entregas" | "solicitudes">("entregas");

  // ── Entregas (agrupadas por orden) ──
  const [filtros, setFiltros] = useState({ canal: "", estado_general: "", offset: 0 });
  const [ordenes, setOrdenes] = useState<OrdenEntrega[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<string | null>(null);

  const cargarEntregas = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    params.set("vista", "ordenes");
    if (filtros.canal) params.set("canal", filtros.canal);
    if (filtros.estado_general) params.set("estado_general", filtros.estado_general);
    params.set("offset", String(filtros.offset));
    params.set("limit", String(LIMIT));
    try {
      const r = await fetch(`/api/admin/tarot/entregas?${params.toString()}`);
      const json = await r.json().catch(() => null);
      if (!r.ok) {
        setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
      } else {
        setOrdenes(json.ordenes ?? []);
        setPaginacion(json.paginacion ?? null);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => { if (vista === "entregas") cargarEntregas(); }, [vista, cargarEntregas]);

  // ── Reenvíos pendientes ──
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargandoSol, setCargandoSol] = useState(false);
  const [autorizando, setAutorizando] = useState<Solicitud | null>(null);
  const [rechazando, setRechazando] = useState<Solicitud | null>(null);

  const cargarSolicitudes = useCallback(async () => {
    setCargandoSol(true);
    try {
      const r = await fetch(`/api/admin/tarot/entregas/solicitudes?estado=pendiente_autorizacion&limit=100`);
      const json = await r.json().catch(() => null);
      setSolicitudes(json?.solicitudes ?? []);
    } catch { /* silencioso */ }
    finally { setCargandoSol(false); }
  }, []);

  // Cargar el contador siempre (para el número en la pestaña), no solo cuando está activa.
  useEffect(() => { cargarSolicitudes(); }, [cargarSolicitudes]);
  useEffect(() => { if (vista === "solicitudes") cargarSolicitudes(); }, [vista, cargarSolicitudes]);

  const total = paginacion?.total ?? 0;
  const desde = total === 0 ? 0 : filtros.offset + 1;
  const hasta = Math.min(filtros.offset + LIMIT, total);

  return (
    <TarotAdminShell>
      <main className="px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Entregas</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setVista("entregas")}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                vista === "entregas" ? "border-amber-500 bg-amber-900/40 text-amber-300" : "border-gray-700 text-gray-400 hover:border-gray-600"
              }`}
            >
              Entregas
            </button>
            <button
              onClick={() => setVista("solicitudes")}
              className={`relative px-3 py-1.5 text-xs rounded-md border transition-colors ${
                vista === "solicitudes" ? "border-amber-500 bg-amber-900/40 text-amber-300" : "border-gray-700 text-gray-400 hover:border-gray-600"
              }`}
            >
              Reenvíos pendientes
              {solicitudes.length > 0 && (
                <span className="ml-1.5 text-xs bg-amber-500 text-gray-950 font-bold rounded-full px-1.5">{solicitudes.length}</span>
              )}
            </button>
          </div>
        </div>

        {vista === "entregas" && (
          <>
            <p className="text-xs text-gray-500 mb-4">
              Una fila por orden. Los intentos individuales de cada canal están en el detalle.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <select
                value={filtros.estado_general}
                onChange={(e) => setFiltros({ ...filtros, estado_general: e.target.value, offset: 0 })}
                className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
              >
                <option value="">Todos los estados</option>
                <option value="entregado">Entregado</option>
                <option value="parcial">Parcial</option>
                <option value="error">Error</option>
                <option value="enviando">Enviando</option>
                <option value="simulado">Simulado (sandbox)</option>
                <option value="pendiente">Pendiente</option>
              </select>
              <select
                value={filtros.canal}
                onChange={(e) => setFiltros({ ...filtros, canal: e.target.value, offset: 0 })}
                className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
              >
                <option value="">Cualquier canal</option>
                <option value="whatsapp">Con WhatsApp</option>
                <option value="email">Con Email</option>
              </select>
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
                      <th className="px-4 py-3 font-medium text-gray-400">Cliente</th>
                      <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Orden</th>
                      <th className="px-4 py-3 font-medium text-gray-400">WhatsApp</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Email</th>
                      <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Última actividad</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargando && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">Cargando entregas…</td></tr>
                    )}
                    {!cargando && !errorMsg && ordenes.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">Sin resultados.</td></tr>
                    )}
                    {!cargando && ordenes.map((o) => {
                      const badge = ESTADO_GENERAL[o.estado_general] ?? { label: o.estado_general, cls: "bg-gray-800 text-gray-400" };
                      return (
                        <tr
                          key={o.orden_id}
                          onClick={() => setOrdenSeleccionada(o.orden_id)}
                          className="border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-gray-200">{o.cliente_nombre ?? "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                            {o.orden_ref ? `#${o.orden_ref.slice(-8)}` : o.orden_id.slice(0, 8) + "…"}
                          </td>
                          <td className="px-4 py-3"><CanalCell icon={<MessageCircle size={13} className="text-gray-500 shrink-0" />} canal={o.whatsapp} /></td>
                          <td className="px-4 py-3"><CanalCell icon={<Mail size={13} className="text-gray-500 shrink-0" />} canal={o.email} /></td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{fmtFecha(o.ultima_actividad_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge text={badge.label} cls={badge.cls} />
                              {o.reenvio_pendiente && (
                                <Badge text="↻ Reenvío pendiente" cls="bg-violet-900/50 text-violet-300" />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {!cargando && paginacion && total > 0 && (
              <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
                <span>{desde}–{hasta} de {total} órdenes</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFiltros({ ...filtros, offset: Math.max(0, filtros.offset - LIMIT) })}
                    disabled={filtros.offset === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} /> Anterior
                  </button>
                  <button
                    onClick={() => { if (paginacion.next_offset != null) setFiltros({ ...filtros, offset: paginacion.next_offset }); }}
                    disabled={paginacion.next_offset == null}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Siguiente <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {vista === "solicitudes" && (
          <>
            <p className="text-xs text-gray-500 mb-4">
              Solicitudes de reenvío que un administrador creó sobre una entrega ya exitosa y esperan autorización.
            </p>
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-900 border-b border-gray-800 text-left">
                      <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Solicitado</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Cliente</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Canal</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Motivo</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Solicitado por</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargandoSol && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">Cargando solicitudes…</td></tr>
                    )}
                    {!cargandoSol && solicitudes.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">Sin solicitudes pendientes.</td></tr>
                    )}
                    {!cargandoSol && solicitudes.map((s) => (
                      <tr key={s.id} className="border-b border-gray-800/60">
                        <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{fmtFecha(s.solicitado_at)}</td>
                        <td className="px-4 py-3 text-gray-200">{s.tarot_ordenes?.tarot_clientes?.nombre_completo ?? "—"}</td>
                        <td className="px-4 py-3">
                          {s.canal === "whatsapp"
                            ? <span className="inline-flex items-center gap-1 text-emerald-400"><MessageCircle size={13} /> WhatsApp</span>
                            : <span className="inline-flex items-center gap-1 text-sky-400"><Mail size={13} /> Email</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {MOTIVO_LABEL[s.motivo] ?? s.motivo}
                          {s.motivo_detalle && <span className="block text-gray-600">{s.motivo_detalle}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{s.solicitado_por}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setAutorizando(s)}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors"
                            >
                              <RotateCcw size={12} />
                              Autorizar reenvío
                            </button>
                            <button
                              onClick={() => setRechazando(s)}
                              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-700 text-gray-500 hover:text-red-300 hover:border-red-800/60 hover:bg-red-950/20 transition-colors"
                              title="Rechazar solicitud de reenvío"
                            >
                              <XIcon size={12} />
                              Rechazar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {ordenSeleccionada && (
        <TarotEntregaDetalle
          ordenId={ordenSeleccionada}
          onClose={() => setOrdenSeleccionada(null)}
          onSolicitudCreada={() => { cargarSolicitudes(); if (vista === "entregas") cargarEntregas(); }}
        />
      )}

      {autorizando && (
        <AutorizarReenvioDialog
          solicitud={autorizando}
          motivoLabel={MOTIVO_LABEL[autorizando.motivo] ?? autorizando.motivo}
          onClose={() => setAutorizando(null)}
          onAutorizado={() => { setAutorizando(null); cargarSolicitudes(); cargarEntregas(); }}
        />
      )}

      {rechazando && (
        <RechazarReenvioDialog
          solicitud={rechazando}
          onClose={() => setRechazando(null)}
          onRechazado={() => { setRechazando(null); cargarSolicitudes(); cargarEntregas(); }}
        />
      )}
    </TarotAdminShell>
  );
}
