"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { TarotOrdenDetalle } from "@/components/admin/TarotOrdenDetalle";

// ============================================================================
// Types
// ============================================================================

interface Orden {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_email: string;
  estado: string;
  external_reference: string;
  pregunta_usuario: string;
  tema: string;
  precio_cobrado: number;
  moneda: string;
  origen_canal: string;
  notas_internas: string | null;
  created_at: string;
  updated_at: string;
  estado_resumen: string;
  warnings: string[];
  tipo_orden?: "venta" | "cortesia";
  codigo_cortesia?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  recorrido?: Recorrido | null;
}

// Hitos de la orden (los arma /api/admin/tarot/ordenes, 2026-10-31).
interface Recorrido {
  pagado_at: string | null;
  lectura_at: string | null;
  pdf_at: string | null;
  whatsapp_at: string | null;
  abierta_at: string | null;
  aperturas: number;
  pdf_clicks: number;
  fallos_ia: number;
  costo_ia_usd: number;
  codigo: string | null;
  interna: boolean;
}

// Vista para personas (2026-10-31): quién, de dónde vino, qué pidió, cómo
// está y qué hizo. La referencia TAROT-… queda como dato de referencia (al
// pasar el mouse y en el detalle). Solo presentación.
type Salud = { texto: string; cls: string; punto: string };
const EN_CURSO = ["pago_confirmado", "generando_lectura", "lectura_lista", "generando_pdf", "pdf_listo", "enviando_whatsapp"];
function saludOrden(o: Orden): Salud {
  const r = o.recorrido;
  if (o.estado === "entregado" || o.estado === "entregado_simulado") {
    return r?.abierta_at
      ? { texto: "Entregada y leída", cls: "text-emerald-300", punto: "bg-emerald-400" }
      : { texto: "Entregada, sin abrir", cls: "text-emerald-300/70", punto: "bg-emerald-600" };
  }
  if (o.estado.startsWith("error")) return { texto: "Necesita atención", cls: "text-red-300", punto: "bg-red-400" };
  if (EN_CURSO.includes(o.estado)) {
    const min = (Date.now() - new Date(o.updated_at || o.created_at).getTime()) / 60000;
    return min > 30
      ? { texto: "Trabada", cls: "text-red-300", punto: "bg-red-400" }
      : { texto: "En curso", cls: "text-amber-300", punto: "bg-amber-400" };
  }
  if (o.estado === "pago_rechazado") return { texto: "Pago rechazado", cls: "text-gray-400", punto: "bg-gray-500" };
  if (o.estado === "pago_expirado" || o.estado === "cancelado") return { texto: "No se concretó", cls: "text-gray-500", punto: "bg-gray-600" };
  return { texto: "No pagó (aún)", cls: "text-gray-500", punto: "bg-gray-600" };
}

function origenOrden(o: Orden): { titulo: string; detalle: string | null } {
  const src = (o.utm_source ?? "").toLowerCase();
  if (o.tipo_orden === "cortesia") return { titulo: "Cortesía", detalle: o.codigo_cortesia ?? o.recorrido?.codigo ?? null };
  if (src.includes("facebook") || src.includes("meta") || src.includes("instagram") || src === "fb" || src === "ig") {
    return { titulo: "Meta Ads", detalle: o.utm_campaign ?? null };
  }
  if (src) return { titulo: o.utm_source as string, detalle: o.utm_campaign ?? null };
  return { titulo: "Directo", detalle: null };
}

function horaCorta(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }) : "";
}
function lapso(desde: string | null, hasta: string | null): string | null {
  if (!desde || !hasta) return null;
  const s = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

function Hito({ ok, label, title }: { ok: boolean; label: string; title: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-0.5 text-[11px] ${ok ? "text-emerald-300/90" : "text-gray-600"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-gray-700"}`} />
      {label}
    </span>
  );
}

interface Paginacion {
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

// ============================================================================
// Badges
// ============================================================================

const ESTADO_ORDEN: Record<string, { label: string; cls: string }> = {
  formulario_completo:  { label: "Formulario",    cls: "bg-gray-800 text-gray-400" },
  pago_iniciado:        { label: "Pago iniciado", cls: "bg-amber-900/50 text-amber-300" },
  pago_confirmado:      { label: "Pago ok",       cls: "bg-sky-900/50 text-sky-300" },
  pago_rechazado:       { label: "Rechazado",     cls: "bg-red-900/50 text-red-300" },
  pago_expirado:        { label: "Expirado",      cls: "bg-red-900/50 text-red-300" },
  generando_lectura:    { label: "Generando IA",  cls: "bg-amber-900/50 text-amber-300" },
  lectura_lista:        { label: "Lectura lista", cls: "bg-sky-900/50 text-sky-300" },
  generando_pdf:        { label: "Generando PDF", cls: "bg-amber-900/50 text-amber-300" },
  pdf_listo:            { label: "PDF listo",     cls: "bg-violet-900/50 text-violet-300" },
  enviando_whatsapp:    { label: "Enviando WA",   cls: "bg-amber-900/50 text-amber-300" },
  entregado:            { label: "Entregado",     cls: "bg-emerald-900/50 text-emerald-300" },
  entregado_simulado:   { label: "Entregado (simulado)", cls: "bg-violet-900/50 text-violet-300" },
  error_lectura:        { label: "Error lectura", cls: "bg-red-900/50 text-red-300" },
  error_pdf:            { label: "Error PDF",     cls: "bg-red-900/50 text-red-300" },
  error_whatsapp:       { label: "Error WA",      cls: "bg-red-900/50 text-red-300" },
  error_critico:        { label: "Error crítico", cls: "bg-red-900/50 text-red-400" },
  cancelado:            { label: "Cancelado",     cls: "bg-gray-800 text-gray-400" },
};

const TEMA_LABEL: Record<string, string> = {
  general: "General",
  amor:    "Amor",
  trabajo: "Trabajo",
  salud:   "Salud",
  dinero:  "Dinero",
  decision:"Decisión",
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

// ============================================================================
// Filtros
// ============================================================================

interface Filtros {
  buscar: string;
  estado: string;
  tema: string;
  moneda: string;
  offset: number;
}

const FILTROS_INIT: Filtros = { buscar: "", estado: "", tema: "", moneda: "", offset: 0 };
const LIMIT = 50;

// ============================================================================
// Page
// ============================================================================

export default function TarotOrdenesPage() {
  const searchParams = useSearchParams();
  const [inputBuscar, setInputBuscar] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INIT);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedOrden, setSelectedOrden] = useState<Orden | null>(null);
  const [deepLinkErrorMsg, setDeepLinkErrorMsg] = useState<string | null>(null);

  // Deep-link desde Alertas (u otra pantalla): /admin/tarot/ordenes?orden_id=...
  // abre el mismo drawer de detalle que un click normal en la fila. Funciona
  // con refresh y con URL copiada/pegada porque busca la orden puntual en
  // cada montaje, no depende de que ya esté en la lista paginada visible.
  useEffect(() => {
    const ordenIdParam = searchParams.get("orden_id");
    if (!ordenIdParam) return;

    let cancelado = false;
    setDeepLinkErrorMsg(null);
    fetch(`/api/admin/tarot/ordenes?orden_id=${encodeURIComponent(ordenIdParam)}&limit=1`)
      .then((r) => r.json().catch(() => null))
      .then((json) => {
        if (cancelado) return;
        const encontrada = json?.ordenes?.[0] as Orden | undefined;
        if (encontrada) {
          setSelectedOrden(encontrada);
        } else {
          setDeepLinkErrorMsg(`No se encontró la orden solicitada (${ordenIdParam.slice(0, 8)}…).`);
        }
      })
      .catch(() => {
        if (!cancelado) setDeepLinkErrorMsg("Error al buscar la orden solicitada.");
      });

    return () => { cancelado = true; };
    // Solo debe correr por el orden_id de la URL, no en cada cambio de filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    async function doFetch() {
      setCargando(true);
      setErrorMsg(null);
      const params = new URLSearchParams();
      if (filtros.buscar)  params.set("buscar",  filtros.buscar);
      if (filtros.estado)  params.set("estado",  filtros.estado);
      if (filtros.tema)    params.set("tema",    filtros.tema);
      if (filtros.moneda)  params.set("moneda",  filtros.moneda);
      params.set("offset", String(filtros.offset));
      params.set("limit",  String(LIMIT));
      try {
        const r = await fetch(`/api/admin/tarot/ordenes?${params.toString()}`);
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
    }
    doFetch();
  }, [filtros]);

  function handleBuscar() {
    setFiltros({ ...filtros, buscar: inputBuscar.trim(), offset: 0 });
  }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleBuscar();
  }
  function handleFiltro(key: keyof Omit<Filtros, "offset" | "buscar">, val: string) {
    setFiltros({ ...filtros, [key]: val, offset: 0 });
  }

  const total = paginacion?.total ?? 0;
  const desde = total === 0 ? 0 : filtros.offset + 1;
  const hasta = Math.min(filtros.offset + LIMIT, total);

  return (
    <TarotAdminShell>
      <main className="px-6 py-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Órdenes</h2>
          <p className="text-xs text-gray-500 mt-0.5">Pedidos de lectura y su estado en el flujo</p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-1 flex-1 min-w-[200px] border border-gray-700 rounded-lg bg-gray-900 px-3 py-2">
            <Search size={14} className="text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Referencia TAROT-…"
              value={inputBuscar}
              onChange={(e) => setInputBuscar(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>
          <select
            value={filtros.estado}
            onChange={(e) => handleFiltro("estado", e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos los estados</option>
            <option value="formulario_completo">Formulario</option>
            <option value="pago_iniciado">Pago iniciado</option>
            <option value="pago_confirmado">Pago confirmado</option>
            <option value="pago_rechazado">Pago rechazado</option>
            <option value="lectura_lista">Lectura lista</option>
            <option value="pdf_listo">PDF listo</option>
            <option value="entregado">Entregado</option>
            <option value="entregado_simulado">Entregado (simulado)</option>
            <option value="error_lectura">Error lectura</option>
            <option value="error_pdf">Error PDF</option>
            <option value="error_critico">Error crítico</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <select
            value={filtros.tema}
            onChange={(e) => handleFiltro("tema", e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos los temas</option>
            <option value="general">General</option>
            <option value="amor">Amor</option>
            <option value="trabajo">Trabajo</option>
            <option value="salud">Salud</option>
            <option value="dinero">Dinero</option>
            <option value="decision">Decisión</option>
          </select>
          <select
            value={filtros.moneda}
            onChange={(e) => handleFiltro("moneda", e.target.value)}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Moneda: todas</option>
            <option value="UYU">UYU</option>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
          <button
            onClick={handleBuscar}
            className="border border-amber-700 bg-amber-800/40 hover:bg-amber-700/60 text-amber-200 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Buscar
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {deepLinkErrorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300">
            <AlertCircle size={15} className="shrink-0" />
            {deepLinkErrorMsg}
          </div>
        )}

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800 text-left">
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Cliente</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Origen</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Pedido</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Salud</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Recorrido</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Tiempos</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando órdenes…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && ordenes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados para estos filtros.
                    </td>
                  </tr>
                )}
                {!cargando && ordenes.map((o) => {
                  // Cortesía: "pago_confirmado" no implica pago — se muestra como confirmada.
                  const estadoBadge = o.tipo_orden === "cortesia" && o.estado === "pago_confirmado"
                    ? { label: "Confirmada", cls: "bg-sky-900/50 text-sky-300" }
                    : ESTADO_ORDEN[o.estado] ?? { label: o.estado, cls: "bg-gray-800 text-gray-400" };
                  const tieneError = o.estado.startsWith("error_");
                  const rowHighlight = tieneError ? "bg-red-950/10" : "";
                  const isSelected = selectedOrden?.id === o.id;
                  const r = o.recorrido ?? null;
                  const sal = saludOrden(o);
                  const ori = origenOrden(o);
                  const entrega = lapso(r?.pagado_at ?? null, r?.whatsapp_at ?? null);
                  const lectura = lapso(r?.abierta_at ? (r?.whatsapp_at ?? null) : null, r?.abierta_at ?? null);
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedOrden((prev) => prev?.id === o.id ? null : o)}
                      className={`border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/30 transition-colors ${
                        isSelected ? "bg-amber-950/20" : rowHighlight
                      }`}
                    >
                      {/* Cliente — la referencia TAROT-… queda al pasar el mouse */}
                      <td className="px-4 py-3 min-w-[150px]" title={o.external_reference}>
                        <p className="font-medium text-white leading-tight">
                          {o.cliente_nombre || "—"}
                          {r?.interna && (
                            <span className="ml-1.5 align-middle rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-gray-800 text-gray-400" title="Hecha desde un dispositivo marcado como propio">Interna</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 leading-tight mt-0.5 font-mono">{o.cliente_telefono || o.cliente_email || "—"}</p>
                      </td>
                      {/* Origen */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className={`text-xs ${o.tipo_orden === "cortesia" ? "text-fuchsia-300" : "text-gray-200"}`}>{ori.titulo}</p>
                        {ori.detalle && <p className="text-[11px] text-gray-500 mt-0.5 max-w-[170px] truncate" title={ori.detalle}>{ori.detalle}</p>}
                        {o.tipo_orden !== "cortesia" && r?.codigo && <p className="text-[11px] text-gray-500 mt-0.5">Código {r.codigo}</p>}
                      </td>
                      {/* Pedido */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-xs text-gray-200">{TEMA_LABEL[o.tema] ?? o.tema}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {o.tipo_orden === "cortesia" ? "Sin cargo" : `${o.moneda} ${o.precio_cobrado}`}
                          {" · "}{o.pregunta_usuario?.trim() ? "con pregunta" : "sin pregunta"}
                        </p>
                      </td>
                      {/* Salud */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${sal.cls}`}>
                          <span className={`h-2 w-2 rounded-full ${sal.punto}`} />
                          {sal.texto}
                        </span>
                        <p className="mt-1"><Badge text={estadoBadge.label} cls={`${estadoBadge.cls} opacity-70 !text-[10px]`} /></p>
                      </td>
                      {/* Recorrido */}
                      <td className="px-4 py-3">
                        {r ? (
                          <div className="flex flex-wrap gap-x-2 gap-y-1 max-w-[220px]">
                            <Hito ok={!!r.pagado_at} label={o.tipo_orden === "cortesia" ? "Confirmada" : "Pagó"} title={r.pagado_at ? `Pago/confirmación ${horaCorta(r.pagado_at)}` : "Sin pago confirmado"} />
                            <Hito ok={!!r.lectura_at} label="Lectura" title={r.lectura_at ? `Lectura generada ${horaCorta(r.lectura_at)}${r.fallos_ia ? ` · ${r.fallos_ia} intento(s) fallido(s)` : ""}` : "Sin lectura"} />
                            <Hito ok={!!r.pdf_at} label="PDF" title={r.pdf_at ? `PDF ${horaCorta(r.pdf_at)}` : "Sin PDF"} />
                            <Hito ok={!!r.whatsapp_at} label="WhatsApp" title={r.whatsapp_at ? `WhatsApp enviado ${horaCorta(r.whatsapp_at)}` : "WhatsApp no enviado"} />
                            <Hito ok={!!r.abierta_at} label={r.aperturas > 1 ? `Abrió ×${r.aperturas}` : "Abrió"} title={r.abierta_at ? `Abrió la lectura por primera vez ${horaCorta(r.abierta_at)} · ${r.aperturas} apertura(s)` : "Todavía no abrió la lectura"} />
                            {r.pdf_clicks > 0 && <Hito ok label={`Bajó PDF${r.pdf_clicks > 1 ? ` ×${r.pdf_clicks}` : ""}`} title="Tocó descargar el PDF desde la lectura" />}
                          </div>
                        ) : <span className="text-xs text-gray-600">—</span>}
                      </td>
                      {/* Tiempos */}
                      <td className="px-4 py-3 text-[11px] text-gray-400 whitespace-nowrap">
                        {entrega ? <p>Entregada en <span className="text-gray-200">{entrega}</span></p> : <p className="text-gray-600">—</p>}
                        {lectura && <p className="mt-0.5 text-gray-500">La abrió a los {lectura}</p>}
                        {r && r.costo_ia_usd > 0 && <p className="mt-0.5 text-gray-600">IA US$ {r.costo_ia_usd.toFixed(3)}{r.fallos_ia ? ` · ${r.fallos_ia} reintento${r.fallos_ia > 1 ? "s" : ""}` : ""}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap font-mono text-xs">
                        {new Date(o.created_at).toLocaleDateString("es-UY")}
                        <span className="block text-[11px] text-gray-600 mt-0.5">{horaCorta(o.created_at)}</span>
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
                <ChevronLeft size={14} />
                Anterior
              </button>
              <button
                onClick={() => { if (paginacion.next_offset != null) setFiltros({ ...filtros, offset: paginacion.next_offset }); }}
                disabled={paginacion.next_offset == null}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </main>

      {selectedOrden && (
        <TarotOrdenDetalle orden={selectedOrden} onClose={() => setSelectedOrden(null)} />
      )}
    </TarotAdminShell>
  );
}
