"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, Brain, ChevronDown, Database, Download, FileSpreadsheet, FlaskConical, Lightbulb, ListChecks, Printer, Search, Settings2, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Analista de conversión (2026-11-01): informes a demanda escritos por IA
// sobre por qué la gente entra y no compra, con recomendaciones priorizadas.
// La configuración (modelo, datos que analiza, bitácora, CSVs de Meta) está
// en /admin/tarot/analista/config. Memoria (2026-11-01): cada recomendación
// se marca (pendiente / en curso / hecha / descartada), el próximo informe
// evalúa las hechas y "lo que ya sabemos" vive en /admin/tarot/analista/memoria.

type Nivel = "alto" | "medio" | "bajo";
interface Contenido {
  titular: string;
  estado: "bien" | "atencion" | "critico";
  resumen_ejecutivo: string[];
  numeros_clave: { nombre: string; valor: string; comparacion: string; lectura: string }[];
  hallazgos: { titulo: string; area: string; evidencia: string; interpretacion: string; confianza: "alta" | "media" | "baja" }[];
  recomendaciones: { prioridad: number; accion: string; donde: string; por_que: string; impacto: Nivel; esfuerzo: Nivel; como_hacerlo: string; como_medir: string }[];
  experimentos: { nombre: string; hipotesis: string; que_cambiar: string; metrica: string; muestra_necesaria: string }[];
  datos_que_faltan: { dato: string; para_que: string; como_conseguirlo: string }[];
  advertencias: string[];
  seguimiento?: { recomendacion_id: string; veredicto: Veredicto; explicacion: string }[];
  memoria?: {
    nuevos?: { texto: string; area: string; confianza: string; evidencia: string }[];
    actualizados?: { id: string; texto: string; confianza: string; evidencia: string }[];
    refutados?: { id: string; motivo: string }[];
  };
}
type Veredicto = "funciono" | "no_funciono" | "sin_datos_aun" | "no_aplica";
type EstadoRec = "pendiente" | "en_curso" | "hecha" | "descartada";
interface Rec {
  id: string; indice: number; prioridad: number | null; accion: string; donde: string | null; estado: EstadoRec; nota: string | null;
  estado_at: string | null; evaluacion_veredicto: Veredicto | null; evaluacion_texto: string | null;
}
interface Informe {
  id: string; estado: "generando" | "listo" | "error"; foco: string; periodo_desde: string; periodo_hasta: string;
  modelo: string; esfuerzo: string; contenido?: Contenido | null; costo_usd: number | null; duracion_ms: number | null;
  error: string | null; created_at: string; titular?: string | null; estado_general?: string | null; datos_enviados?: unknown;
}
interface Respuesta {
  ok: boolean; historial: Informe[]; focos: Record<string, string>; gasto_mes_usd: number; clave_configurada: boolean;
  config: { modelo: string; esfuerzo: string; tope_mensual_usd: number | null } | null;
}

const PERIODOS = [7, 14, 30, 60, 90];
const NOMBRE_FOCO: Record<string, string> = { general: "General", meta: "Campaña de Meta", pagina: "Página de tarot", checkout: "Checkout", postcompra: "Post-compra" };
const NOMBRE_MODELO: Record<string, string> = { "claude-haiku-5-5": "Haiku 5.5", "claude-sonnet-5-5": "Sonnet 5.5", "claude-opus-5-5": "Opus 5.5", "claude-fable-5-1": "Fable 5.1" };
const NOMBRE_ESFUERZO: Record<string, string> = { medium: "normal", high: "alta", xhigh: "máxima" };
const PASOS = ["Juntando los datos", "Mirando el tráfico", "Recorriendo el embudo", "Revisando el checkout", "Buscando la mayor fuga", "Escribiendo recomendaciones"];
const ESTADO = {
  bien: { texto: "Bien", cls: "border-emerald-900/60 bg-emerald-950/20 text-emerald-300", punto: "bg-emerald-400" },
  atencion: { texto: "Atención", cls: "border-amber-800/60 bg-amber-950/20 text-amber-300", punto: "bg-amber-400" },
  critico: { texto: "Urgente", cls: "border-red-800/60 bg-red-950/25 text-red-300", punto: "bg-red-400" },
} as const;
const NIVEL_CLS: Record<Nivel, string> = { alto: "text-emerald-300 border-emerald-800/60", medio: "text-amber-200 border-amber-800/50", bajo: "text-gray-400 border-gray-700" };
const ESFUERZO_CLS: Record<Nivel, string> = { bajo: "text-emerald-300 border-emerald-800/60", medio: "text-amber-200 border-amber-800/50", alto: "text-red-300 border-red-800/50" };
const CONFIANZA_CLS = { alta: "text-emerald-300", media: "text-amber-200", baja: "text-gray-400" } as const;
const AREA: Record<string, string> = { trafico: "Tráfico", pagina: "Página", checkout: "Checkout", pago: "Pago", postcompra: "Post-compra", oferta: "Oferta", medicion: "Medición" };
const DONDE: Record<string, string> = { meta: "Meta", pagina_tarot: "Página de tarot", checkout: "Checkout", oferta: "Oferta", postcompra: "Post-compra", medicion: "Medición", otro: "Otro" };

const ESTADO_REC: Record<EstadoRec, { texto: string; cls: string }> = {
  pendiente: { texto: "Pendiente", cls: "border-gray-700 text-gray-300" },
  en_curso: { texto: "En curso", cls: "border-sky-700 bg-sky-950/40 text-sky-200" },
  hecha: { texto: "Hecha", cls: "border-emerald-700 bg-emerald-950/40 text-emerald-200" },
  descartada: { texto: "Descartada", cls: "border-gray-700 bg-gray-800/60 text-gray-400" },
};
const VEREDICTO: Record<Veredicto, { texto: string; cls: string }> = {
  funciono: { texto: "Funcionó", cls: "text-emerald-300" },
  no_funciono: { texto: "No funcionó", cls: "text-red-300" },
  sin_datos_aun: { texto: "Todavía sin datos", cls: "text-amber-200" },
  no_aplica: { texto: "No aplica", cls: "text-gray-400" },
};

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: "America/Montevideo" });
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" });
const usd = (n: number | null | undefined) => (n == null ? "—" : `US$ ${Number(n).toFixed(2)}`);

export default function AnalistaPage() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [foco, setFoco] = useState("general");
  const [dias, setDias] = useState(7);
  const [generandoId, setGenerandoId] = useState<string | null>(null);
  const [paso, setPaso] = useState(0);
  const [abierto, setAbierto] = useState<Informe | null>(null);
  const [verDatos, setVerDatos] = useState<unknown>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [evaluadas, setEvaluadas] = useState<Rec[]>([]);
  const [busqueda, setBusqueda] = useState({ todos: false, q: "", foco: "" });
  const [lista, setLista] = useState<Informe[] | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/tarot/analista", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`); return null; }
      setDatos(j);
      return j as Respuesta;
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
      return null;
    }
  }, []);

  const abrir = useCallback(async (id: string) => {
    setVerDatos(null);
    const r = await fetch(`/api/admin/tarot/analista?informe=${id}`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (j?.ok) { setAbierto(j.informe); setRecs(j.recomendaciones ?? []); setEvaluadas(j.evaluadas ?? []); }
    return j?.informe as Informe | undefined;
  }, []);

  // Al entrar: historial, y abre el último informe listo (o retoma uno en curso).
  const inicial = useRef(false);
  useEffect(() => {
    if (inicial.current) return;
    inicial.current = true;
    cargar().then((j) => {
      const enCurso = j?.historial.find((h) => h.estado === "generando");
      if (enCurso) setGenerandoId(enCurso.id);
      else { const ultimo = j?.historial.find((h) => h.estado === "listo"); if (ultimo) abrir(ultimo.id); }
    });
  }, [cargar, abrir]);

  // Mientras se genera: animación de pasos y consulta cada 4 s.
  useEffect(() => {
    if (!generandoId) return;
    const anim = setInterval(() => setPaso((p) => Math.min(p + 1, PASOS.length - 1)), 9000);
    const sondeo = setInterval(async () => {
      const inf = await abrir(generandoId);
      if (inf && inf.estado !== "generando") {
        setGenerandoId(null);
        cargar();
        if (inf.estado === "error") setErrorMsg(`El informe no se pudo generar: ${inf.error ?? "error desconocido"}`);
      }
    }, 4000);
    return () => { clearInterval(anim); clearInterval(sondeo); };
  }, [generandoId, abrir, cargar]);

  const generar = async () => {
    setErrorMsg(null);
    setPaso(0);
    const r = await fetch("/api/admin/tarot/analista", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "generar", foco, dias }) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`); return; }
    setAbierto(null);
    setGenerandoId(j.id);
    cargar();
  };

  const borrar = async (id: string) => {
    if (!confirm("¿Borrar este informe?")) return;
    await fetch("/api/admin/tarot/analista", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "borrar", id }) });
    if (abierto?.id === id) setAbierto(null);
    cargar();
  };

  const mostrarDatos = async () => {
    if (!abierto) return;
    if (verDatos) { setVerDatos(null); return; }
    const r = await fetch(`/api/admin/tarot/analista?informe=${abierto.id}&datos=1`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    setVerDatos(j?.informe?.datos_enviados ?? { aviso: "Este informe no guardó los datos." });
  };

  // Historial completo con búsqueda (si no, los últimos 30 que trae la carga).
  useEffect(() => {
    if (!busqueda.todos && !busqueda.q && !busqueda.foco) { setLista(null); return; }
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ todos: "1", ...(busqueda.q ? { q: busqueda.q } : {}), ...(busqueda.foco ? { foco: busqueda.foco } : {}) });
      const r = await fetch(`/api/admin/tarot/analista?${qs}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (j?.ok) setLista(j.historial);
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, datos]);

  const marcar = async (id: string, estado: EstadoRec, nota: string) => {
    const r = await fetch("/api/admin/tarot/analista", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "recomendacion_estado", id, estado, nota }) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`); return; }
    if (abierto) abrir(abierto.id);
  };

  const historialVisible = lista ?? datos?.historial ?? [];
  const cfg = datos?.config;
  const c = abierto?.estado === "listo" ? abierto.contenido : null;

  return (
    <TarotAdminShell>
      <main className="px-6 py-6 max-w-[1280px]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Analista de conversión</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">Analiza cómo navega la gente en tu web y te dice por qué no compra y qué hacer, con números. Usa solo datos anónimos y agregados.</p>
          </div>
          <div className="flex items-center gap-3">
            {datos && <span className="text-xs text-gray-500">Este mes: <span className="text-gray-300">{usd(datos.gasto_mes_usd)}</span>{cfg?.tope_mensual_usd != null && <> de {usd(cfg.tope_mensual_usd)}</>}</span>}
            <Link href={"/admin/tarot/analista/memoria" as Route} className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
              <Brain size={13} /> Memoria y plan de acción
            </Link>
            <Link href={"/admin/tarot/analista/config" as Route} className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
              <Settings2 size={13} /> Configuración
            </Link>
          </div>
        </div>

        {datos && !datos.clave_configurada && (
          <div className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-200">
            Para generar informes falta <span className="font-mono">ANTHROPIC_API_KEY_PANEL_ADMIN</span> en las variables de entorno de Vercel (después, volver a publicar). La configuración y la vista previa de datos funcionan igual.
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" /> {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
          <div className="space-y-6 min-w-0">
            {/* Pedir un informe */}
            <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">¿Qué querés analizar?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(datos?.focos ?? {}).map(([k, desc]) => (
                  <button key={k} onClick={() => setFoco(k)} disabled={!!generandoId}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${foco === k ? "border-amber-600 bg-amber-950/30" : "border-gray-800 hover:border-gray-700"}`}>
                    <p className={`text-sm font-medium ${foco === k ? "text-amber-200" : "text-gray-200"}`}>{NOMBRE_FOCO[k] ?? k}</p>
                    <p className="text-[11.5px] text-gray-500 mt-0.5 leading-snug">{desc.split(":").slice(1).join(":").trim() || desc}</p>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Período</span>
                  <div className="inline-flex rounded-lg border border-gray-800 p-0.5">
                    {PERIODOS.map((d) => (
                      <button key={d} onClick={() => setDias(d)} disabled={!!generandoId}
                        className={`px-2.5 py-1 text-xs rounded-md ${dias === d ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>{d} días</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {cfg && <span className="text-xs text-gray-500">{NOMBRE_MODELO[cfg.modelo] ?? cfg.modelo} · profundidad {NOMBRE_ESFUERZO[cfg.esfuerzo] ?? cfg.esfuerzo}</span>}
                  <button onClick={generar} disabled={!!generandoId || !datos?.clave_configurada}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-700 bg-amber-900/40 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-800/50 disabled:opacity-50">
                    <Sparkles size={14} /> {generandoId ? "Generando…" : "Generar informe"}
                  </button>
                </div>
              </div>
            </section>

            {generandoId && (
              <section className="rounded-xl border border-amber-900/50 bg-amber-950/10 px-5 py-6">
                <p className="text-sm text-amber-100 mb-1">Analizando… suele tardar entre 1 y 3 minutos.</p>
                <p className="text-xs text-gray-500 mb-4">Podés irte de esta pantalla: el informe queda guardado en el historial.</p>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  {PASOS.map((p, i) => (
                    <div key={p} className={`rounded-lg border px-3 py-2 text-[11.5px] transition-colors ${i === paso ? "border-amber-600 text-amber-200 animate-pulse" : i < paso ? "border-gray-700 text-gray-400" : "border-gray-800 text-gray-600"}`}>{p}</div>
                  ))}
                </div>
              </section>
            )}

            {c && abierto && <VistaInforme inf={abierto} c={c} onDatos={mostrarDatos} verDatos={verDatos} recs={recs} evaluadas={evaluadas} onMarcar={marcar} />}
            {!c && !generandoId && datos && datos.historial.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-800 px-5 py-10 text-center">
                <Search size={22} className="mx-auto text-gray-600 mb-2" />
                <p className="text-sm text-gray-300">Todavía no hay informes.</p>
                <p className="text-xs text-gray-500 mt-1">Elegí qué analizar y el período, y tocá “Generar informe”.</p>
              </div>
            )}
          </div>

          {/* Historial */}
          <aside className="rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-800 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Informes anteriores</p>
                <button onClick={() => setBusqueda((b) => ({ ...b, todos: !b.todos }))} className="text-[11px] text-gray-500 hover:text-gray-300">
                  {busqueda.todos ? "Ver últimos 30" : "Ver todos"}
                </button>
              </div>
              <div className="flex gap-1.5">
                <input value={busqueda.q} onChange={(e) => setBusqueda((b) => ({ ...b, q: e.target.value }))} placeholder="Buscar en titulares…"
                  className="flex-1 min-w-0 rounded-md border border-gray-800 bg-gray-900 px-2 py-1 text-[11.5px] text-gray-200 placeholder:text-gray-600" />
                <select value={busqueda.foco} onChange={(e) => setBusqueda((b) => ({ ...b, foco: e.target.value }))}
                  className="rounded-md border border-gray-800 bg-gray-900 px-1.5 py-1 text-[11.5px] text-gray-300">
                  <option value="">Todos</option>
                  {Object.keys(NOMBRE_FOCO).map((k) => <option key={k} value={k}>{NOMBRE_FOCO[k]}</option>)}
                </select>
              </div>
            </div>
            <div className="divide-y divide-gray-800/70 max-h-[70vh] overflow-y-auto">
              {historialVisible.length === 0 && <p className="px-4 py-5 text-xs text-gray-500">{lista ? "Nada coincide con la búsqueda." : "Sin informes todavía."}</p>}
              {historialVisible.map((h) => {
                const est = h.estado_general && h.estado_general in ESTADO ? ESTADO[h.estado_general as keyof typeof ESTADO] : null;
                return (
                  <div key={h.id} className={`group px-4 py-3 cursor-pointer hover:bg-gray-900/60 ${abierto?.id === h.id ? "bg-gray-900/80" : ""}`} onClick={() => h.estado !== "generando" && abrir(h.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-gray-500">{fechaHora(h.created_at)} · {NOMBRE_FOCO[h.foco] ?? h.foco}</span>
                      <button onClick={(e) => { e.stopPropagation(); borrar(h.id); }} className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400" aria-label="Borrar"><Trash2 size={12} /></button>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-snug text-gray-200 line-clamp-2">
                      {h.estado === "generando" ? "Generando…" : h.estado === "error" ? <span className="text-red-300">No se pudo generar</span> : h.titular}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                      {est && <span className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${est.punto}`} />{est.texto}</span>}
                      <span>{fecha(h.periodo_desde)}–{fecha(h.periodo_hasta)}</span>
                      {h.costo_usd != null && <span>· {usd(h.costo_usd)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </main>
    </TarotAdminShell>
  );
}

function Titulo({ icono: Icon, texto, n }: { icono: typeof Lightbulb; texto: string; n?: number }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-100">
      <Icon size={15} className="text-amber-400" /> {texto} {n != null && <span className="text-gray-600 font-normal">{n}</span>}
    </h3>
  );
}

function VistaInforme({ inf, c, onDatos, verDatos, recs: filas, evaluadas, onMarcar }: {
  inf: Informe; c: Contenido; onDatos: () => void; verDatos: unknown; recs: Rec[]; evaluadas: Rec[];
  onMarcar: (id: string, estado: EstadoRec, nota: string) => void;
}) {
  const est = ESTADO[c.estado] ?? ESTADO.atencion;
  const recs = c.recomendaciones.map((r, i) => ({ r, fila: filas.find((f) => f.indice === i) })).sort((a, b) => a.r.prioridad - b.r.prioridad);
  const seguimiento = (c.seguimiento ?? []).map((s) => ({ s, rec: evaluadas.find((e) => e.id === s.recomendacion_id) }));
  const mem = c.memoria;
  const cambiosMemoria = (mem?.nuevos?.length ?? 0) + (mem?.actualizados?.length ?? 0) + (mem?.refutados?.length ?? 0);
  return (
    <article className="space-y-6">
      {/* Titular */}
      <div className={`rounded-xl border px-5 py-4 ${est.cls}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider"><span className={`h-2 w-2 rounded-full ${est.punto}`} />{est.texto}</span>
          <span className="text-gray-400">
            {NOMBRE_FOCO[inf.foco] ?? inf.foco} · {fecha(inf.periodo_desde)} al {fecha(inf.periodo_hasta)} · {NOMBRE_MODELO[inf.modelo] ?? inf.modelo}
            {inf.costo_usd != null && <> · {usd(inf.costo_usd)}</>}{inf.duracion_ms != null && <> · {Math.round(inf.duracion_ms / 1000)} s</>}
          </span>
        </div>
        <p className="mt-2 text-lg font-semibold leading-snug text-gray-50">{c.titular}</p>
        <div className="mt-2 flex gap-3 text-[11px]">
          <button onClick={() => imprimirInforme(inf, c)} className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-200"><Printer size={12} /> Imprimir / PDF</button>
          <button onClick={() => descargarJson(inf)} className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-200"><Download size={12} /> Descargar JSON</button>
        </div>
        <ul className="mt-3 space-y-1.5">
          {c.resumen_ejecutivo.map((r, i) => <li key={i} className="flex gap-2 text-sm text-gray-200 leading-relaxed"><span className="text-gray-500">•</span>{r}</li>)}
        </ul>
      </div>

      {/* Números clave */}
      {c.numeros_clave.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {c.numeros_clave.map((n, i) => (
            <div key={i} className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
              <p className="text-[11px] text-gray-500">{n.nombre}</p>
              <p className="mt-1 text-xl font-semibold text-gray-50 tabular-nums">{n.valor}</p>
              {n.comparacion && <p className="text-[11px] text-gray-400 mt-0.5">{n.comparacion}</p>}
              <p className="text-[11.5px] text-gray-500 mt-1.5 leading-snug">{n.lectura}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recomendaciones */}
      <section>
        <Titulo icono={Lightbulb} texto="Qué hacer, en orden" n={recs.length} />
        <div className="space-y-2">
          {recs.map(({ r, fila }, i) => <Recomendacion key={i} r={r} fila={fila} abierta={i === 0} onMarcar={onMarcar} />)}
        </div>
      </section>

      {/* Seguimiento de recomendaciones anteriores */}
      {seguimiento.length > 0 && (
        <section>
          <Titulo icono={ListChecks} texto="¿Funcionó lo que hiciste?" n={seguimiento.length} />
          <div className="rounded-xl border border-gray-800 divide-y divide-gray-800/70">
            {seguimiento.map(({ s, rec }, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[11px] font-semibold ${VEREDICTO[s.veredicto]?.cls ?? "text-gray-400"}`}>{VEREDICTO[s.veredicto]?.texto ?? s.veredicto}</span>
                  <p className="text-sm text-gray-100">{rec?.accion ?? "Recomendación anterior"}</p>
                </div>
                <p className="mt-1 text-[12.5px] text-gray-300 leading-relaxed">{s.explicacion}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Hallazgos */}
      <section>
        <Titulo icono={Search} texto="Hallazgos" n={c.hallazgos.length} />
        <div className="rounded-xl border border-gray-800 divide-y divide-gray-800/70">
          {c.hallazgos.map((h, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10.5px] text-gray-400">{AREA[h.area] ?? h.area}</span>
                <p className="text-sm font-medium text-gray-100">{h.titulo}</p>
                <span className={`ml-auto text-[11px] ${CONFIANZA_CLS[h.confianza] ?? "text-gray-400"}`}>confianza {h.confianza}</span>
              </div>
              <p className="mt-1.5 text-[12.5px] text-gray-400 leading-relaxed"><span className="text-gray-500">Evidencia:</span> {h.evidencia}</p>
              <p className="mt-1 text-[13px] text-gray-200 leading-relaxed">{h.interpretacion}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Experimentos */}
      {c.experimentos.length > 0 && (
        <section>
          <Titulo icono={FlaskConical} texto="Experimentos sugeridos" n={c.experimentos.length} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {c.experimentos.map((x, i) => (
              <div key={i} className="rounded-xl border border-gray-800 px-4 py-3">
                <p className="text-sm font-medium text-gray-100">{x.nombre}</p>
                <p className="mt-1 text-[12.5px] text-gray-300 leading-relaxed">{x.hipotesis}</p>
                <dl className="mt-2 space-y-1 text-[12px]">
                  <div><dt className="inline text-gray-500">Qué cambiar: </dt><dd className="inline text-gray-300">{x.que_cambiar}</dd></div>
                  <div><dt className="inline text-gray-500">Métrica: </dt><dd className="inline text-gray-300">{x.metrica}</dd></div>
                  <div><dt className="inline text-gray-500">Muestra: </dt><dd className="inline text-gray-300">{x.muestra_necesaria}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Datos que faltan */}
      {c.datos_que_faltan.length > 0 && (
        <section>
          <Titulo icono={FileSpreadsheet} texto="Datos que me faltan" n={c.datos_que_faltan.length} />
          <div className="rounded-xl border border-sky-900/50 bg-sky-950/10 divide-y divide-sky-900/30">
            {c.datos_que_faltan.map((d, i) => (
              <div key={i} className="px-4 py-3">
                <p className="text-sm font-medium text-sky-100">{d.dato}</p>
                <p className="mt-0.5 text-[12.5px] text-gray-400">{d.para_que}</p>
                <p className="mt-1.5 text-[12.5px] text-gray-200 leading-relaxed whitespace-pre-line">{d.como_conseguirlo}</p>
              </div>
            ))}
            <div className="px-4 py-2.5 text-xs">
              <Link href={"/admin/tarot/analista/config#meta" as Route} className="text-sky-300 hover:text-sky-200">Subir un CSV de Meta →</Link>
            </div>
          </div>
        </section>
      )}

      {/* Cambios en la memoria */}
      {cambiosMemoria > 0 && (
        <section className="rounded-xl border border-violet-900/50 bg-violet-950/10 px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-200"><Brain size={13} /> Lo que aprendió y guardó en la memoria</p>
          <ul className="space-y-1.5 text-[12.5px] leading-relaxed">
            {(mem?.nuevos ?? []).map((a, i) => <li key={`n${i}`} className="text-gray-200"><span className="text-violet-300">Nuevo · </span>{a.texto} <span className="text-gray-500">(confianza {a.confianza})</span></li>)}
            {(mem?.actualizados ?? []).map((a, i) => <li key={`a${i}`} className="text-gray-200"><span className="text-sky-300">Actualizado · </span>{a.texto} <span className="text-gray-500">(confianza {a.confianza})</span></li>)}
            {(mem?.refutados ?? []).map((a, i) => <li key={`r${i}`} className="text-gray-400"><span className="text-red-300">Ya no vale · </span>{a.motivo}</li>)}
          </ul>
          <Link href={"/admin/tarot/analista/memoria" as Route} className="mt-2 inline-block text-[11.5px] text-violet-300 hover:text-violet-200">Ver toda la memoria →</Link>
        </section>
      )}

      {/* Advertencias */}
      {c.advertencias.length > 0 && (
        <section className="rounded-xl border border-gray-800 px-4 py-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-400"><TriangleAlert size={13} /> Límites de este análisis</p>
          <ul className="space-y-1">{c.advertencias.map((a, i) => <li key={i} className="text-[12.5px] text-gray-400 leading-relaxed">· {a}</li>)}</ul>
        </section>
      )}

      <div>
        <button onClick={onDatos} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300">
          <Database size={13} /> {verDatos ? "Ocultar los datos que usó" : "Ver los datos exactos que usó la IA"}
        </button>
        {verDatos != null && (
          <pre className="mt-2 max-h-[480px] overflow-auto rounded-lg border border-gray-800 bg-gray-950 p-3 text-[11px] text-gray-400">{JSON.stringify(verDatos, null, 2)}</pre>
        )}
      </div>
    </article>
  );
}

function Recomendacion({ r, fila, abierta, onMarcar }: {
  r: Contenido["recomendaciones"][number]; fila?: Rec; abierta: boolean; onMarcar: (id: string, estado: EstadoRec, nota: string) => void;
}) {
  const [open, setOpen] = useState(abierta);
  const [nota, setNota] = useState(fila?.nota ?? "");
  useEffect(() => setNota(fila?.nota ?? ""), [fila?.nota]);
  const estado = fila?.estado ?? "pendiente";
  return (
    <div className={`rounded-xl border ${r.prioridad === 1 ? "border-amber-800/60 bg-amber-950/10" : "border-gray-800"}`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-start gap-3 px-4 py-3 text-left">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${r.prioridad === 1 ? "bg-amber-500 text-gray-950" : "bg-gray-800 text-gray-300"}`}>{r.prioridad}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-100 leading-snug">{r.accion}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span className="rounded border border-gray-700 px-1.5 py-0.5 text-gray-400">{DONDE[r.donde] ?? r.donde}</span>
            <span className={`rounded border px-1.5 py-0.5 ${NIVEL_CLS[r.impacto]}`}>impacto {r.impacto}</span>
            <span className={`rounded border px-1.5 py-0.5 ${ESFUERZO_CLS[r.esfuerzo]}`}>esfuerzo {r.esfuerzo}</span>
            {fila && <span className={`rounded border px-1.5 py-0.5 ${ESTADO_REC[estado].cls}`}>{ESTADO_REC[estado].texto}</span>}
            {fila?.evaluacion_veredicto && <span className={`${VEREDICTO[fila.evaluacion_veredicto].cls}`}>· {VEREDICTO[fila.evaluacion_veredicto].texto}</span>}
          </div>
        </div>
        <ChevronDown size={15} className={`mt-1 shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pl-[52px] space-y-2 text-[12.5px] leading-relaxed">
          <p className="text-gray-300"><span className="text-gray-500">Por qué: </span>{r.por_que}</p>
          <p className="text-gray-200 whitespace-pre-line"><span className="text-gray-500">Cómo: </span>{r.como_hacerlo}</p>
          <p className="text-gray-300"><span className="text-gray-500">Cómo saber si funcionó: </span>{r.como_medir}</p>
          {fila?.evaluacion_texto && <p className="text-gray-300"><span className="text-gray-500">Evaluación del analista: </span>{fila.evaluacion_texto}</p>}
          {fila && (
            <div className="pt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-500 mr-1">¿La hiciste?</span>
              {(Object.keys(ESTADO_REC) as EstadoRec[]).map((e) => (
                <button key={e} onClick={() => onMarcar(fila.id, e, nota)}
                  className={`rounded-md border px-2 py-0.5 text-[11px] ${estado === e ? ESTADO_REC[e].cls : "border-gray-800 text-gray-500 hover:text-gray-300"}`}>{ESTADO_REC[e].texto}</button>
              ))}
              <input value={nota} onChange={(e) => setNota(e.target.value)} onBlur={() => nota !== (fila.nota ?? "") && onMarcar(fila.id, estado, nota)} maxLength={500}
                placeholder="Nota (opcional): qué hiciste exactamente" className="flex-1 min-w-[200px] rounded-md border border-gray-800 bg-gray-900 px-2 py-1 text-[11.5px] text-gray-200 placeholder:text-gray-600" />
              {estado === "hecha" && <span className="w-full text-[11px] text-gray-500">Anotada en la bitácora: el próximo informe va a evaluar si funcionó.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Descargas ──────────────────────────────────────────────────────────────

function descargarJson(inf: Informe) {
  const blob = new Blob([JSON.stringify(inf, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `informe-analista-${inf.created_at.slice(0, 10)}-${inf.foco}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const esc = (t: unknown) => String(t ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** Versión imprimible (el navegador permite guardarla como PDF). */
function imprimirInforme(inf: Informe, c: Contenido) {
  const w = window.open("", "_blank");
  if (!w) return;
  const lista = (xs: string[]) => `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const recs = [...c.recomendaciones].sort((a, b) => a.prioridad - b.prioridad);
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe del analista · ${esc(fecha(inf.created_at))}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;color:#1a1a1a;max-width:760px;margin:32px auto;padding:0 16px}h1{font-size:20px;margin:4px 0 12px}h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
.meta{color:#666;font-size:12px}.k{display:inline-block;width:23%;vertical-align:top;margin:0 1% 10px 0}.k b{display:block;font-size:18px}.c{border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin:8px 0}.m{color:#666;font-size:12px}</style></head><body>
<p class="meta">Tu Oráculo · Analista de conversión · ${esc(NOMBRE_FOCO[inf.foco] ?? inf.foco)} · ${esc(fecha(inf.periodo_desde))} al ${esc(fecha(inf.periodo_hasta))} · generado ${esc(fechaHora(inf.created_at))}</p>
<h1>${esc(c.titular)}</h1>${lista(c.resumen_ejecutivo)}
<h2>Números clave</h2>${c.numeros_clave.map((n) => `<div class="k"><span class="m">${esc(n.nombre)}</span><b>${esc(n.valor)}</b><span class="m">${esc(n.comparacion)}</span><br>${esc(n.lectura)}</div>`).join("")}
<h2>Qué hacer, en orden</h2>${recs.map((r) => `<div class="c"><b>${r.prioridad}. ${esc(r.accion)}</b><div class="m">${esc(DONDE[r.donde] ?? r.donde)} · impacto ${esc(r.impacto)} · esfuerzo ${esc(r.esfuerzo)}</div><p>${esc(r.por_que)}</p><p><b>Cómo:</b> ${esc(r.como_hacerlo)}</p><p><b>Cómo medirlo:</b> ${esc(r.como_medir)}</p></div>`).join("")}
<h2>Hallazgos</h2>${c.hallazgos.map((h) => `<div class="c"><b>${esc(h.titulo)}</b> <span class="m">(${esc(AREA[h.area] ?? h.area)}, confianza ${esc(h.confianza)})</span><p class="m">Evidencia: ${esc(h.evidencia)}</p><p>${esc(h.interpretacion)}</p></div>`).join("")}
${c.experimentos.length ? `<h2>Experimentos</h2>${c.experimentos.map((x) => `<div class="c"><b>${esc(x.nombre)}</b><p>${esc(x.hipotesis)}</p><p class="m">Qué cambiar: ${esc(x.que_cambiar)} · Métrica: ${esc(x.metrica)} · Muestra: ${esc(x.muestra_necesaria)}</p></div>`).join("")}` : ""}
${c.datos_que_faltan.length ? `<h2>Datos que faltan</h2>${c.datos_que_faltan.map((d) => `<div class="c"><b>${esc(d.dato)}</b><p class="m">${esc(d.para_que)}</p><p>${esc(d.como_conseguirlo)}</p></div>`).join("")}` : ""}
${c.advertencias.length ? `<h2>Límites del análisis</h2>${lista(c.advertencias)}` : ""}
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
