"use client";
import { useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, ChevronLeft, ChevronRight, ChevronDown, ExternalLink, RefreshCw } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { EVENTOS, REFERENCIA_MS, duracionHumana, type Ejecucion, type EstadoPaso, type Paso } from "@/lib/ejecuciones";

// Ejecuciones (2026-10-31): cada compra que entró al pipeline, con sus pasos,
// cuánto tardó cada uno y si salió bien. Datos de /api/admin/tarot/ejecuciones
// (reconstruidos desde tarot_logs). Solo lectura.

interface Evento { evento: string; nivel: string | null; mensaje: string | null; duracion_ms: number | null; funcion_origen: string | null; created_at: string }
interface Fila {
  id: string; cliente: string | null; tema: string | null; tipo: "venta" | "cortesia";
  precio: number | null; moneda: string | null; estado_orden: string; created_at: string;
  interna: boolean; costo_ia_usd: number; abrio_at: string | null; aperturas: number; pdf_clicks: number;
  sin_registro: boolean; ejecucion: Ejecucion; eventos: Evento[];
}
interface ResumenPaso { clave: Paso["clave"]; nombre: string; mediana_ms: number | null; max_ms: number | null; problemas: number }
interface Resumen {
  compras: number; completas: number; sin_problemas: number; con_error: number; en_curso: number;
  entrega_mediana_ms: number | null; entrega_max_ms: number | null; pasos: ResumenPaso[];
}
interface Paginacion { total: number; limit: number; offset: number; next_offset: number | null }

const LIMIT = 30;
const POLL_EN_CURSO_MS = 30_000;
const TEMAS: Record<string, string> = { general: "General", amor: "Amor", trabajo: "Trabajo", salud: "Salud", dinero: "Dinero", decision: "Decisión" };

const COLOR: Record<EstadoPaso, { barra: string; texto: string; punto: string; label: string }> = {
  ok:        { barra: "bg-emerald-500/80", texto: "text-emerald-300", punto: "bg-emerald-400", label: "Bien" },
  lento:     { barra: "bg-amber-400/80",   texto: "text-amber-300",   punto: "bg-amber-400",   label: "Lento" },
  reintento: { barra: "bg-amber-500/80",   texto: "text-amber-300",   punto: "bg-amber-500",   label: "Con reintento" },
  error:     { barra: "bg-red-500/80",     texto: "text-red-300",     punto: "bg-red-400",     label: "Falló" },
  en_curso:  { barra: "bg-sky-400/70 animate-pulse", texto: "text-sky-300", punto: "bg-sky-400 animate-pulse", label: "En curso" },
  pendiente: { barra: "bg-gray-700",       texto: "text-gray-500",    punto: "bg-gray-700",    label: "Pendiente" },
  omitido:   { barra: "bg-gray-700",       texto: "text-gray-500",    punto: "bg-gray-600",    label: "Omitido" },
  bloqueado: { barra: "bg-gray-600",       texto: "text-gray-400",    punto: "bg-gray-500",    label: "Bloqueado" },
};

const RESULTADO: Record<Ejecucion["resultado"], { texto: string; cls: string; punto: string }> = {
  ok:          { texto: "Todo bien",           cls: "text-emerald-300", punto: "bg-emerald-400" },
  con_avisos:  { texto: "Bien, con avisos",    cls: "text-emerald-300/80", punto: "bg-amber-400" },
  error:       { texto: "Necesita atención",   cls: "text-red-300",     punto: "bg-red-400" },
  en_curso:    { texto: "En curso",            cls: "text-sky-300",     punto: "bg-sky-400 animate-pulse" },
  sin_iniciar: { texto: "Sin registro",        cls: "text-gray-500",    punto: "bg-gray-600" },
};

type Filtro = "todas" | "problemas" | "en_curso";

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function relativo(desde: string | null, iso: string): string {
  if (!desde) return "";
  const s = Math.round((new Date(iso).getTime() - new Date(desde).getTime()) / 1000);
  const signo = s < 0 ? "−" : "+";
  const a = Math.abs(s);
  return `${signo}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

export default function TarotEjecucionesPage() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [offset, setOffset] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [ocultarInternas, setOcultarInternas] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const r = await fetch(`/api/admin/tarot/ejecuciones?limit=${LIMIT}&offset=${offset}`, { cache: "no-store" });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
      } else {
        setErrorMsg(null);
        setFilas(json.ejecuciones ?? []);
        setResumen(json.resumen ?? null);
        setPaginacion(json.paginacion ?? null);
        setActualizado(new Date());
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [offset]);

  useEffect(() => { cargar(); }, [cargar]);

  // Si hay alguna compra en curso, se refresca sola cada 30 s (solo con la
  // pestaña visible) para verla avanzar. Si no, no hace pedidos de más.
  const hayEnCurso = filas.some((f) => f.ejecucion.resultado === "en_curso");
  useEffect(() => {
    if (!hayEnCurso) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") cargar(true); }, POLL_EN_CURSO_MS);
    return () => clearInterval(id);
  }, [hayEnCurso, cargar]);

  const visibles = filas.filter((f) => {
    if (ocultarInternas && f.interna) return false;
    if (filtro === "problemas") return f.ejecucion.resultado === "error" || f.ejecucion.pasos.some((p) => p.estado === "reintento" || p.estado === "lento");
    if (filtro === "en_curso") return f.ejecucion.resultado === "en_curso";
    return true;
  });

  const total = paginacion?.total ?? 0;

  return (
    <TarotAdminShell>
      <main className="px-6 py-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Ejecuciones</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Cada compra, paso por paso: qué se hizo, cuánto tardó y si salió bien. Tocá una fila para ver la línea de tiempo.
            </p>
          </div>
          <button onClick={() => cargar()} className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 shrink-0" title="Actualizar ahora">
            <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />
            {actualizado ? `Actualizado ${actualizado.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}` : "Actualizar"}
            {hayEnCurso && <span className="text-sky-400">· en vivo</span>}
          </button>
        </div>

        {resumen && <Tablero r={resumen} />}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {([["todas", "Todas"], ["problemas", "Con problemas o lentas"], ["en_curso", "En curso ahora"]] as [Filtro, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${filtro === k ? "border-amber-600 bg-amber-900/30 text-amber-200" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}
            >
              {label}
            </button>
          ))}
          <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
            <input type="checkbox" checked={ocultarInternas} onChange={(e) => setOcultarInternas(e.target.checked)} className="accent-amber-500" />
            Ocultar internas
          </label>
          <Leyenda />
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        <div className="rounded-xl border border-gray-800 overflow-hidden divide-y divide-gray-800/70">
          {cargando && filas.length === 0 && <p className="px-4 py-10 text-center text-sm text-gray-500 animate-pulse">Cargando ejecuciones…</p>}
          {!cargando && !errorMsg && visibles.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-500">{filas.length ? "Ninguna compra de esta página cumple el filtro." : "Todavía no hay compras."}</p>
          )}
          {visibles.map((f) => (
            <Fragment key={f.id}>
              <FilaEjecucion f={f} abierta={abierta === f.id} onToggle={() => setAbierta((a) => (a === f.id ? null : f.id))} />
              {abierta === f.id && <Detalle f={f} />}
            </Fragment>
          ))}
        </div>

        {paginacion && total > LIMIT && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
            <span>{offset + 1}–{Math.min(offset + LIMIT, total)} de {total} compras</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft size={14} /> Anteriores
              </button>
              <button onClick={() => { if (paginacion.next_offset != null) setOffset(paginacion.next_offset); }} disabled={paginacion.next_offset == null}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed">
                Siguientes <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </main>
    </TarotAdminShell>
  );
}

// ── Tablero de los últimos 7 días ───────────────────────────────────────────

function Tablero({ r }: { r: Resumen }) {
  const conTiempo = r.pasos.filter((p) => p.mediana_ms != null);
  const masLento = conTiempo.length ? conTiempo.reduce((a, b) => ((b.mediana_ms ?? 0) > (a.mediana_ms ?? 0) ? b : a)) : null;
  const problemas = r.pasos.filter((p) => p.problemas > 0);
  return (
    <div className="mb-5">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">Últimos 7 días · todas las compras, incluidas internas y cortesías (miden el sistema)</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cifra titulo="Salieron solas" valor={r.compras ? `${r.sin_problemas} de ${r.compras}` : "—"}
          detalle={r.en_curso ? `${r.en_curso} en curso ahora` : "de punta a punta, sin intervención"} ok={r.compras > 0 && r.sin_problemas === r.compras - r.en_curso} />
        <Cifra titulo="Tiempo de entrega" valor={duracionHumana(r.entrega_mediana_ms)}
          detalle={r.entrega_max_ms != null ? `normal · la más lenta ${duracionHumana(r.entrega_max_ms)}` : "del pago al WhatsApp"} />
        <Cifra titulo="Paso más lento" valor={masLento?.nombre ?? "—"}
          detalle={masLento ? `${duracionHumana(masLento.mediana_ms)} normal · máx ${duracionHumana(masLento.max_ms)}` : ""} />
        <Cifra titulo="Fallos o reintentos" valor={String(r.con_error + problemas.reduce((a, p) => a + p.problemas, 0))}
          detalle={problemas.length ? problemas.map((p) => `${p.nombre}: ${p.problemas}`).join(" · ") : "ningún paso falló"} ok={r.con_error === 0 && problemas.length === 0} />
      </div>
      {conTiempo.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-gray-500">
          <span className="text-gray-600">Tiempo normal por paso:</span>
          {r.pasos.map((p) => (
            <span key={p.clave}>{p.nombre} <span className="text-gray-300">{duracionHumana(p.mediana_ms)}</span></span>
          ))}
        </div>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, detalle, ok }: { titulo: string; valor: string; detalle: string; ok?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <p className="text-[11px] text-gray-500">{titulo}</p>
      <p className={`mt-1 text-lg font-semibold ${ok ? "text-emerald-300" : "text-white"}`}>{valor}</p>
      <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">{detalle}</p>
    </div>
  );
}

function Leyenda() {
  const items: EstadoPaso[] = ["ok", "lento", "error", "en_curso", "omitido"];
  return (
    <span className="ml-auto hidden md:inline-flex items-center gap-3 text-[11px] text-gray-500">
      {items.map((e) => (
        <span key={e} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${COLOR[e].punto}`} />{COLOR[e].label}</span>
      ))}
    </span>
  );
}

// ── Fila ────────────────────────────────────────────────────────────────────

function FilaEjecucion({ f, abierta, onToggle }: { f: Fila; abierta: boolean; onToggle: () => void }) {
  const ej = f.ejecucion;
  const res = RESULTADO[f.sin_registro ? "sin_iniciar" : ej.resultado];
  // Barra: los pasos en serie (lectura → PDF → WhatsApp), con ancho según lo que tardó cada uno.
  const serie = ej.pasos.filter((p) => p.clave === "lectura" || p.clave === "pdf" || p.clave === "whatsapp");
  const pesos = serie.map((p) => Math.max(p.ms ?? REFERENCIA_MS[p.clave], 1));
  const suma = pesos.reduce((a, b) => a + b, 0);
  return (
    <button onClick={onToggle} className={`w-full text-left px-4 py-3 grid grid-cols-1 lg:grid-cols-[210px_1fr_190px] gap-x-6 gap-y-2 items-center transition-colors hover:bg-gray-800/30 ${abierta ? "bg-gray-800/30" : ""} ${ej.resultado === "error" ? "bg-red-950/10" : ""}`}>
      {/* Quién */}
      <div className="min-w-0" title={`Orden ${f.id}`}>
        <p className="text-sm text-gray-100 truncate">
          {f.cliente ?? "Sin nombre"}
          {f.interna && <Etiqueta texto="Interna" />}
          {f.tipo === "cortesia" && <Etiqueta texto="Cortesía" cls="bg-fuchsia-950/60 text-fuchsia-300" />}
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {f.tema ? (TEMAS[f.tema] ?? f.tema) : "—"} · {fechaHora(f.created_at)}
        </p>
      </div>

      {/* Pasos */}
      <div className="min-w-0">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-800 gap-px">
          {serie.map((p, i) => (
            <span key={p.clave} className={`${COLOR[p.estado].barra} h-full`} style={{ width: `${(pesos[i] / suma) * 100}%` }}
              title={`${p.nombre}: ${COLOR[p.estado].label}${p.ms != null ? ` · ${duracionHumana(p.ms)}` : ""}`} />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {ej.pasos.map((p) => (
            <span key={p.clave} className={`inline-flex items-center gap-1 text-[11px] ${COLOR[p.estado].texto}`}
              title={[COLOR[p.estado].label, p.nota].filter(Boolean).join(" · ")}>
              <span className={`h-1.5 w-1.5 rounded-full ${COLOR[p.estado].punto}`} />
              {p.nombre}
              {p.ms != null && p.estado !== "bloqueado" && <span className="text-gray-500">{duracionHumana(p.ms)}</span>}
              {(p.estado === "omitido" || p.estado === "bloqueado") && <span className="text-gray-600">({p.nota ?? COLOR[p.estado].label})</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Resultado */}
      <div className="flex items-center justify-between lg:justify-end gap-3">
        <div className="text-right">
          <p className={`inline-flex items-center gap-1.5 text-xs ${res.cls}`}>
            <span className={`h-2 w-2 rounded-full ${res.punto}`} />
            {res.texto}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {ej.total_ms != null ? <>Entregada en <span className="text-gray-200">{duracionHumana(ej.total_ms)}</span></> : "—"}
          </p>
          <p className="text-[11px] mt-0.5">
            {f.abrio_at ? <span className="text-emerald-300/80">👁 Abrió{f.aperturas > 1 ? ` ×${f.aperturas}` : ""}</span> : <span className="text-gray-600">No abrió aún</span>}
            {f.pdf_clicks > 0 && <span className="text-emerald-300/80"> · ⬇ PDF</span>}
          </p>
        </div>
        <ChevronDown size={14} className={`text-gray-500 transition-transform shrink-0 ${abierta ? "rotate-180" : ""}`} />
      </div>
    </button>
  );
}

function Etiqueta({ texto, cls = "bg-gray-800 text-gray-400" }: { texto: string; cls?: string }) {
  return <span className={`ml-1.5 align-middle rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cls}`}>{texto}</span>;
}

// ── Detalle: diagrama de tiempos + línea de tiempo ───────────────────────────

function Detalle({ f }: { f: Fila }) {
  const ej = f.ejecucion;
  const [tecnicos, setTecnicos] = useState(false);
  if (f.sin_registro) {
    return <div className="px-4 py-4 bg-gray-950/60 text-xs text-gray-500">No hay registro detallado de esta compra (los registros se guardan desde el 21/10).</div>;
  }
  const t0 = ej.inicio ?? f.eventos[0]?.created_at ?? f.created_at;
  const fines = ej.pasos.map((p) => p.fin ?? (p.estado === "en_curso" ? new Date().toISOString() : null)).filter(Boolean) as string[];
  const tFin = fines.sort().pop() ?? t0;
  const span = Math.max(new Date(tFin).getTime() - new Date(t0).getTime(), 1000);
  const pos = (iso: string) => ((new Date(iso).getTime() - new Date(t0).getTime()) / span) * 100;
  const eventos = f.eventos.filter((e) => tecnicos || !EVENTOS[e.evento]?.menor || e.nivel === "error" || e.nivel === "warning");

  return (
    <div className="px-4 py-4 bg-gray-950/60 grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-3">Cuánto tardó cada paso (desde que {f.tipo === "cortesia" ? "se confirmó" : "pagó"})</p>
        <div className="space-y-2">
          {ej.pasos.map((p) => {
            const izq = p.inicio ? Math.max(0, pos(p.inicio)) : 0;
            const fin = p.fin ?? (p.estado === "en_curso" ? new Date().toISOString() : null);
            const ancho = p.inicio && fin ? Math.max(pos(fin) - izq, 0.8) : 0;
            const ref = REFERENCIA_MS[p.clave];
            return (
              <div key={p.clave} className="grid grid-cols-[84px_1fr_110px] items-center gap-3 text-xs">
                <span className={COLOR[p.estado].texto}>{p.nombre}</span>
                <div className="relative h-3 rounded bg-gray-800/70">
                  {ancho > 0 && <span className={`absolute top-0 h-full rounded ${COLOR[p.estado].barra}`} style={{ left: `${izq}%`, width: `${Math.min(ancho, 100 - izq)}%` }} />}
                </div>
                <span className="text-[11px] text-gray-400 text-right" title={`Normal: ~${duracionHumana(ref)}`}>
                  {p.ms != null && p.estado !== "bloqueado" ? duracionHumana(p.ms) : COLOR[p.estado].label}
                  {p.estado === "lento" && <span className="block text-amber-400/80">normal ~{duracionHumana(ref)}</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-[84px_1fr_110px] gap-3 text-[10px] text-gray-600">
          <span />
          <div className="flex justify-between"><span>0 s</span><span>{duracionHumana(span)}</span></div>
          <span />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <Dato titulo="Entrega total" valor={ej.total_ms != null ? duracionHumana(ej.total_ms) : "—"} />
          {f.tipo === "venta" && <Dato titulo="El cliente tardó en pagar" valor={duracionHumana(ej.pago_espera_ms)} />}
          <Dato titulo="Costo de IA" valor={f.costo_ia_usd > 0 ? `US$ ${f.costo_ia_usd.toFixed(3)}` : "—"} />
          <Dato titulo="El cliente" valor={f.abrio_at ? `Abrió ${fechaHora(f.abrio_at)}${f.pdf_clicks ? " · bajó el PDF" : ""}` : "Todavía no abrió"} />
        </div>

        {ej.avisos.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2">
            <p className="text-[11px] font-medium text-amber-300 mb-1">Avisos (controlados, no le llegó nada de más al cliente)</p>
            <ul className="space-y-0.5 text-[11px] text-amber-200/80 list-disc pl-4">
              {ej.avisos.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
        )}
        {ej.pasos.filter((p) => p.estado === "error").map((p) => (
          <div key={p.clave} className="mt-3 rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-[11px] text-red-300">
            <span className="font-medium">{p.nombre} falló.</span> {p.nota ?? ""} Revisá la ficha de la orden o Alertas para ver qué hacer.
          </div>
        ))}

        <Link href={`/admin/tarot/ordenes?orden_id=${f.id}` as Route} className="mt-4 inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200">
          Ver ficha de la orden <ExternalLink size={11} />
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Línea de tiempo</p>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none">
            <input type="checkbox" checked={tecnicos} onChange={(e) => setTecnicos(e.target.checked)} className="accent-amber-500" />
            Ver pasos técnicos
          </label>
        </div>
        <ol className="relative border-l border-gray-800 ml-1.5 space-y-1.5 max-h-[420px] overflow-y-auto pr-2">
          {eventos.map((e, i) => {
            const info = EVENTOS[e.evento];
            const color = e.nivel === "error" || e.nivel === "critical" ? "bg-red-400" : e.nivel === "warning" ? "bg-amber-400" : info?.menor ? "bg-gray-700" : "bg-emerald-400";
            return (
              <li key={`${e.created_at}-${i}`} className="relative pl-4">
                <span className={`absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full ${color}`} />
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-mono text-[10px] text-gray-600 w-11 shrink-0 text-right">{relativo(t0, e.created_at)}</span>
                  <span className={info?.menor ? "text-gray-500" : e.nivel === "warning" ? "text-amber-200" : e.nivel === "error" ? "text-red-300" : "text-gray-200"}>
                    {info?.texto ?? e.evento}
                    {e.duracion_ms != null && <span className="text-gray-500"> · {duracionHumana(e.duracion_ms)}</span>}
                  </span>
                  <span className="ml-auto text-[10px] text-gray-600 shrink-0">{hora(e.created_at)}</span>
                </div>
                {!info && e.mensaje && <p className="pl-[3.25rem] text-[10px] text-gray-500 truncate" title={e.mensaje}>{e.mensaje}</p>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
      <p className="text-[10px] text-gray-500">{titulo}</p>
      <p className="text-gray-200 mt-0.5">{valor}</p>
    </div>
  );
}
