"use client";
import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  MessageCircle,
  Mail,
  RotateCcw,
} from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { TarotEntregaDetalle } from "@/components/admin/TarotEntregaDetalle";
import { AutorizarReenvioDialog } from "@/components/admin/AutorizarReenvioDialog";

interface Entrega {
  id: string;
  canal: "whatsapp" | "email";
  orden_id: string;
  orden_ref: string | null;
  cliente_nombre: string | null;
  destino: string;
  estado: string;
  numero_intento: number;
  es_reenvio: boolean;
  created_at: string;
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

const ESTADO_ENTREGA: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-gray-800 text-gray-400" },
  enviando:  { label: "Enviando",  cls: "bg-amber-900/50 text-amber-300" },
  enviado:   { label: "Enviado",   cls: "bg-emerald-900/50 text-emerald-300" },
  entregado: { label: "Entregado", cls: "bg-emerald-900/50 text-emerald-300" },
  leido:     { label: "Leído",     cls: "bg-emerald-900/50 text-emerald-300" },
  error:     { label: "Error",     cls: "bg-red-900/50 text-red-300" },
  agotado_reintentos: { label: "Reintentos agotados", cls: "bg-red-900/50 text-red-300" },
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

function CanalIcon({ canal }: { canal: string }) {
  return canal === "whatsapp"
    ? <span className="inline-flex items-center gap-1 text-emerald-400"><MessageCircle size={13} /> WhatsApp</span>
    : <span className="inline-flex items-center gap-1 text-sky-400"><Mail size={13} /> Email</span>;
}

function fmtFecha(iso: string) {
  try { return new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

const LIMIT = 50;

export default function TarotEntregasPage() {
  const [vista, setVista] = useState<"entregas" | "solicitudes">("entregas");

  // ── Entregas ──
  const [filtros, setFiltros] = useState({ canal: "", estado: "", offset: 0 });
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<{ id: string; canal: string } | null>(null);

  const cargarEntregas = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    if (filtros.canal) params.set("canal", filtros.canal);
    if (filtros.estado) params.set("estado", filtros.estado);
    params.set("offset", String(filtros.offset));
    params.set("limit", String(LIMIT));
    try {
      const r = await fetch(`/api/admin/tarot/entregas?${params.toString()}`);
      const json = await r.json().catch(() => null);
      if (!r.ok) {
        setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
      } else {
        setEntregas(json.entregas ?? []);
        setPaginacion(json.paginacion ?? null);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => { if (vista === "entregas") cargarEntregas(); }, [vista, cargarEntregas]);

  // ── Solicitudes pendientes ──
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargandoSol, setCargandoSol] = useState(false);
  const [autorizando, setAutorizando] = useState<Solicitud | null>(null);

  const cargarSolicitudes = useCallback(async () => {
    setCargandoSol(true);
    try {
      const r = await fetch(`/api/admin/tarot/entregas/solicitudes?estado=pendiente_autorizacion&limit=100`);
      const json = await r.json().catch(() => null);
      setSolicitudes(json?.solicitudes ?? []);
    } catch { /* silencioso */ }
    finally { setCargandoSol(false); }
  }, []);

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
              Todas
            </button>
            <button
              onClick={() => setVista("solicitudes")}
              className={`relative px-3 py-1.5 text-xs rounded-md border transition-colors ${
                vista === "solicitudes" ? "border-amber-500 bg-amber-900/40 text-amber-300" : "border-gray-700 text-gray-400 hover:border-gray-600"
              }`}
            >
              Pendientes de autorización
              {solicitudes.length > 0 && (
                <span className="ml-1.5 text-xs bg-amber-500 text-gray-950 font-bold rounded-full px-1.5">{solicitudes.length}</span>
              )}
            </button>
          </div>
        </div>

        {vista === "entregas" && (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              <select
                value={filtros.canal}
                onChange={(e) => setFiltros({ ...filtros, canal: e.target.value, offset: 0 })}
                className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
              >
                <option value="">Todos los canales</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
              <select
                value={filtros.estado}
                onChange={(e) => setFiltros({ ...filtros, estado: e.target.value, offset: 0 })}
                className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
              >
                <option value="">Todos los estados</option>
                <option value="enviado">Enviado</option>
                <option value="error">Error</option>
                <option value="enviando">Enviando</option>
                <option value="agotado_reintentos">Reintentos agotados</option>
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
                      <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Fecha</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Cliente</th>
                      <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Canal</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Destino</th>
                      <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Orden</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Estado</th>
                      <th className="px-4 py-3 font-medium text-gray-400 text-center">Intentos</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargando && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">Cargando entregas…</td></tr>
                    )}
                    {!cargando && !errorMsg && entregas.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-sm">Sin resultados.</td></tr>
                    )}
                    {!cargando && entregas.map((e) => {
                      const badge = ESTADO_ENTREGA[e.estado] ?? { label: e.estado, cls: "bg-gray-800 text-gray-400" };
                      return (
                        <tr
                          key={`${e.canal}-${e.id}`}
                          onClick={() => setSeleccion({ id: e.id, canal: e.canal })}
                          className="border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{fmtFecha(e.created_at)}</td>
                          <td className="px-4 py-3 text-gray-200">{e.cliente_nombre ?? "—"}</td>
                          <td className="px-4 py-3 whitespace-nowrap"><CanalIcon canal={e.canal} /></td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-400">{e.destino}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                            {e.orden_ref ? `#${e.orden_ref.slice(-8)}` : e.orden_id.slice(0, 8) + "…"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap"><Badge text={badge.label} cls={badge.cls} /></td>
                          <td className="px-4 py-3 text-center text-gray-400">{e.numero_intento}</td>
                          <td className="px-4 py-3">
                            {e.es_reenvio
                              ? <Badge text="Reenvío" cls="bg-violet-900/50 text-violet-300" />
                              : <Badge text="Original" cls="bg-gray-800 text-gray-400" />}
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
                <span>{desde}–{hasta} de {total} entregas</span>
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
                      <td className="px-4 py-3"><CanalIcon canal={s.canal} /></td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {MOTIVO_LABEL[s.motivo] ?? s.motivo}
                        {s.motivo_detalle && <span className="block text-gray-600">{s.motivo_detalle}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{s.solicitado_por}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setAutorizando(s)}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors"
                        >
                          <RotateCcw size={12} />
                          Autorizar reenvío
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {seleccion && (
        <TarotEntregaDetalle
          id={seleccion.id}
          canal={seleccion.canal}
          onClose={() => setSeleccion(null)}
          onSolicitudCreada={() => { if (vista === "solicitudes") cargarSolicitudes(); }}
        />
      )}

      {autorizando && (
        <AutorizarReenvioDialog
          solicitud={autorizando}
          motivoLabel={MOTIVO_LABEL[autorizando.motivo] ?? autorizando.motivo}
          onClose={() => setAutorizando(null)}
          onAutorizado={() => { setAutorizando(null); cargarSolicitudes(); }}
        />
      )}
    </TarotAdminShell>
  );
}
