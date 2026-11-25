"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { BookOpen, Check, ChevronDown, FlaskConical, Pencil, Plus, RefreshCw, RotateCcw, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { MarcoInteligencia } from "@/components/admin/inteligencia/Marco";
import type { Recuerdo, Nivel } from "@/lib/inteligencia/memoria";
import type { Experimento, EstadoDecision } from "@/lib/inteligencia/recomendaciones";

// Inteligencia comercial · Resultados y aprendizaje (fase 3, 2026-11-25).
// Qué se probó y qué pasó, qué se decidió y por qué, y la memoria única del
// negocio (la misma que usan el Analista, el Estratega y la bandeja), separada
// en hechos comprobados, señales e hipótesis. Los fracasos y lo que dejó de
// valer se guardan: también son aprendizaje.

const NIVELES: { id: Nivel; t: string; ayuda: string; c: string }[] = [
  { id: "hecho", t: "Hechos comprobados", ayuda: "Medido con volumen suficiente. Se puede decidir sobre esto.", c: "text-emerald-300" },
  { id: "senal", t: "Señales", ayuda: "Hay datos, pero pocos o sin validar con un antes y después.", c: "text-amber-300" },
  { id: "hipotesis", t: "Hipótesis", ayuda: "Ideas a probar. Todavía no son conocimiento.", c: "text-gray-300" },
];
const AREAS: Record<string, string> = { trafico: "Tráfico y anuncios", pagina: "Página", checkout: "Checkout", pago: "Pago", postcompra: "Después de la compra", oferta: "Oferta y precio", medicion: "Medición", otro: "Otro" };
const CANALES: Record<string, string> = { google_ads: "Google Ads", meta_ads: "Meta Ads", seo: "Buscadores", social: "Redes", mensajeria: "WhatsApp", referidos: "Referidos", directo: "Directo", negocio: "Negocio" };
const ORIGEN: Record<string, string> = { ia: "Analista (IA)", manual: "Manuel", experimento: "Experimento" };
const RESULTADO_EXP: Record<string, string> = { exito: "Funcionó", fracaso: "No funcionó", sin_evidencia: "Sin evidencia suficiente", mixto: "Resultado mixto" };
const ESTADO_DEC: Record<EstadoDecision, string> = { aceptada: "Aceptada", descartada: "Descartada", pospuesta: "Pospuesta", hecha: "Hecha", no_aplica: "Ya no aplica" };
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Montevideo" });

type Decision = { clave: string; titulo: string; estado: EstadoDecision; nota: string | null; canal: string | null; decidida_at: string };
type Datos = { memoria: Recuerdo[]; experimentos: Experimento[]; decisiones: Decision[] };

async function enviar(cuerpo: Record<string, unknown>) {
  const r = await fetch("/api/admin/tarot/inteligencia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.motivo || d.detalle || "No se pudo guardar.");
}

function Tile({ t, v, sub }: { t: string; v: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
      <p className="text-[11.5px] text-gray-400">{t}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-white">{v}</p>
      {sub && <p className="mt-0.5 text-[11.5px] text-gray-500">{sub}</p>}
    </div>
  );
}

function Formulario({ inicial, alGuardar, alCancelar }: { inicial?: Partial<Recuerdo>; alGuardar: (x: Record<string, unknown>) => Promise<void>; alCancelar: () => void }) {
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [nivel, setNivel] = useState<Nivel>(inicial?.nivel ?? "senal");
  const [area, setArea] = useState(inicial?.area ?? "otro");
  const [canal, setCanal] = useState(inicial?.canal ?? "");
  const [resultado, setResultado] = useState(inicial?.resultado ?? "");
  const [evidencia, setEvidencia] = useState(inicial?.evidencia ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campo = "mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-[13px] text-gray-100";
  return (
    <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/60 p-3">
      <label className="block text-[12.5px] text-gray-300">Qué aprendimos (una frase)
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={600} className={campo} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-[12.5px] text-gray-300">Nivel
          <select value={nivel} onChange={(e) => setNivel(e.target.value as Nivel)} className={campo}>{NIVELES.map((n) => <option key={n.id} value={n.id}>{n.t.replace(/s$/, "").replace("Hechos comprobado", "Hecho comprobado")}</option>)}</select>
        </label>
        <label className="block text-[12.5px] text-gray-300">Área
          <select value={area} onChange={(e) => setArea(e.target.value)} className={campo}>{Object.entries(AREAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        </label>
        <label className="block text-[12.5px] text-gray-300">Canal
          <select value={canal} onChange={(e) => setCanal(e.target.value)} className={campo}><option value="">General</option>{Object.entries(CANALES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        </label>
        <label className="block text-[12.5px] text-gray-300">¿Se probó?
          <select value={resultado ?? ""} onChange={(e) => setResultado(e.target.value)} className={campo}><option value="">No aplica</option><option value="funciono">Funcionó</option><option value="no_funciono">No funcionó</option></select>
        </label>
      </div>
      <label className="block text-[12.5px] text-gray-300">Con qué datos (opcional)
        <textarea value={evidencia} onChange={(e) => setEvidencia(e.target.value)} rows={2} maxLength={1000} className={campo} />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={enviando} onClick={async () => { setEnviando(true); setError(null); try { await alGuardar({ texto, nivel, area, canal: canal || null, resultado: resultado || null, evidencia }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setEnviando(false); } }} className="min-h-[40px] rounded-lg border border-amber-700 bg-amber-900/40 px-3 text-[13px] text-amber-100 disabled:opacity-50">Guardar</button>
        <button type="button" onClick={alCancelar} className="min-h-[40px] rounded-lg border border-gray-700 px-3 text-[13px] text-gray-300">Cancelar</button>
      </div>
      {error && <p className="text-[13px] text-red-300">{error}</p>}
    </div>
  );
}

function ItemMemoria({ m, alListo }: { m: Recuerdo; alListo: () => void }) {
  const [editando, setEditando] = useState(false);
  const [baja, setBaja] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (editando) return <Formulario inicial={m} alCancelar={() => setEditando(false)} alGuardar={async (x) => { await enviar({ accion: "memoria_editar", id: m.id, ref: m.ref, ...x }); setEditando(false); alListo(); }} />;
  return (
    <li className={`space-y-1.5 p-3 ${m.activo ? "" : "opacity-70"}`}>
      <p className="text-[13.5px] leading-relaxed text-gray-100">{m.texto}</p>
      <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-gray-500">
        {m.resultado === "funciono" && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-900 bg-emerald-950/40 px-2 py-0.5 text-emerald-300"><ThumbsUp size={11} /> Funcionó</span>}
        {m.resultado === "no_funciono" && <span className="inline-flex items-center gap-1 rounded-full border border-red-900 bg-red-950/40 px-2 py-0.5 text-red-300"><ThumbsDown size={11} /> No funcionó</span>}
        <span>{AREAS[m.area] ?? m.area}</span>
        {m.canal && <span>· {CANALES[m.canal] ?? m.canal}</span>}
        {m.ref && <span>· {m.ref}</span>}
        <span>· {ORIGEN[m.origen] ?? m.origen}</span>
        <span>· {fecha(m.updated_at)}</span>
      </p>
      {m.evidencia && <p className="text-[12.5px] text-gray-400">{m.evidencia}</p>}
      {!m.activo && m.motivo_baja && <p className="text-[12.5px] text-amber-200/80">Dejó de valer: {m.motivo_baja}</p>}
      <div className="flex flex-wrap gap-2 pt-0.5">
        <button type="button" onClick={() => setEditando(true)} className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-gray-700 px-2.5 text-[12px] text-gray-300 hover:bg-gray-800"><Pencil size={12} /> Corregir</button>
        {m.activo
          ? <button type="button" onClick={() => setBaja(!baja)} className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-gray-700 px-2.5 text-[12px] text-gray-300 hover:bg-gray-800"><X size={12} /> Ya no vale</button>
          : <button type="button" onClick={async () => { try { await enviar({ accion: "memoria_reactivar", id: m.id }); alListo(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }} className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-gray-700 px-2.5 text-[12px] text-gray-300 hover:bg-gray-800"><RotateCcw size={12} /> Volver a darlo por válido</button>}
      </div>
      {baja && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={600} placeholder="Por qué deja de valer (queda guardado)" className="min-h-[38px] flex-1 rounded-md border border-gray-700 bg-gray-900 px-2 text-[13px] text-gray-100" />
          <button type="button" onClick={async () => { try { await enviar({ accion: "memoria_baja", id: m.id, motivo }); alListo(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }} className="min-h-[38px] rounded-lg border border-amber-700 bg-amber-900/40 px-3 text-[13px] text-amber-100">Confirmar</button>
        </div>
      )}
      {error && <p className="text-[12.5px] text-red-300">{error}</p>}
    </li>
  );
}

export default function AprendizajePage() {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [agregando, setAgregando] = useState<null | Partial<Recuerdo>>(null);
  const [verBajas, setVerBajas] = useState(false);
  const [canal, setCanal] = useState("todos");

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch("/api/admin/tarot/inteligencia?vista=aprendizaje", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.detalle || j.motivo || "Error");
      setD(j);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const memoria = useMemo(() => (d?.memoria ?? []).filter((m) => canal === "todos" || (canal === "general" ? !m.canal : m.canal === canal)), [d, canal]);
  const activos = memoria.filter((m) => m.activo), bajas = memoria.filter((m) => !m.activo);
  const exps = d?.experimentos ?? [];
  const dec = d?.decisiones ?? [];
  const cuenta = (e: EstadoDecision) => dec.filter((x) => x.estado === e).length;
  const conMotivo = dec.filter((x) => (x.estado === "descartada" || x.estado === "no_aplica") && x.nota && !/^Vieja \(/.test(x.nota));
  const hechas = dec.filter((x) => x.estado === "hecha");

  return (
    <MarcoInteligencia
      bajada="Qué se probó y qué pasó, qué se decidió y por qué, y lo que ya sabe el negocio. Es la misma memoria que consultan la bandeja, el Analista y el Estratega antes de recomendar. Los fracasos también quedan."
      extra={<button type="button" onClick={cargar} disabled={cargando} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-700 px-3 text-[13px] text-gray-200 hover:bg-gray-800 disabled:opacity-50"><RefreshCw size={14} className={cargando ? "animate-spin" : ""} /> Actualizar</button>}
    >
      {error && <p className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-[13px] text-red-200">{error}</p>}
      {!d && !error && <p className="py-16 text-center text-[14px] text-gray-400">Leyendo la memoria…</p>}
      {d && (
        <>
          <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Tile t="Experimentos" v={exps.length} sub={`${exps.filter((e) => e.estado === "activo" || e.estado === "planificado").length} en curso o planificados · ${exps.filter((e) => e.estado === "cerrado").length} cerrados`} />
            <Tile t="Funcionaron / no funcionaron" v={`${exps.filter((e) => e.resultado === "exito").length} / ${exps.filter((e) => e.resultado === "fracaso").length}`} sub={`${exps.filter((e) => e.resultado === "sin_evidencia" || e.resultado === "mixto").length} sin evidencia clara`} />
            <Tile t="Decisiones tomadas" v={dec.length} sub={`${cuenta("hecha")} hechas · ${cuenta("aceptada")} aceptadas · ${cuenta("descartada") + cuenta("no_aplica")} descartadas`} />
            <Tile t="Lo que sabe el negocio" v={(d.memoria ?? []).filter((m) => m.activo).length} sub={`${(d.memoria ?? []).filter((m) => m.activo && m.nivel === "hecho").length} hechos · ${(d.memoria ?? []).filter((m) => m.activo && m.nivel === "senal").length} señales · ${(d.memoria ?? []).filter((m) => m.activo && m.nivel === "hipotesis").length} hipótesis`} />
          </section>

          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white"><FlaskConical size={16} className="text-violet-300" /> Resultados de los experimentos</h2>
            {exps.length === 0 && <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 text-[13px] text-gray-400">Todavía no hay experimentos.</p>}
            <div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/60">
              {exps.map((e) => (
                <div key={e.id} className="space-y-1 p-3">
                  <p className="text-[13.5px] text-gray-100"><b className="text-violet-200">{e.id}</b> {e.nombre}</p>
                  <p className="text-[12.5px] text-gray-400">
                    {e.estado === "cerrado" ? <span className={e.resultado === "exito" ? "text-emerald-300" : e.resultado === "fracaso" ? "text-red-300" : "text-amber-300"}>{RESULTADO_EXP[e.resultado ?? ""] ?? "Cerrado"}</span> : e.estado === "cancelado" ? "Cancelado" : e.estado === "activo" ? "En curso: todavía sin resultado" : "Planificado, sin aplicar"}
                    {e.aplicado_desde ? ` · aplicado el ${fecha(e.aplicado_desde)}` : ""}
                  </p>
                  {e.conclusion && <p className="text-[13px] text-gray-300">{e.conclusion}</p>}
                  {e.aprendizaje && <p className="text-[13px] text-gray-300"><b>Aprendizaje:</b> {e.aprendizaje}</p>}
                  {(e.estado === "activo" || e.estado === "planificado") && <Link href={"/admin/tarot/inteligencia/experimentos" as Route<string>} className="text-[12.5px] text-sky-300 hover:underline">Ver cómo va →</Link>}
                </div>
              ))}
            </div>
            <p className="text-[12px] text-gray-500">Al cerrar un experimento, su conclusión pasa sola a la memoria: como hecho comprobado si se juzgó con el volumen mínimo y dio un resultado claro; si no, como hipótesis.</p>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold text-white"><BookOpen size={16} className="text-amber-300" /> Lo que sabe el negocio</h2>
              <button type="button" onClick={() => setAgregando(agregando ? null : {})} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-700 px-3 text-[13px] text-gray-200 hover:bg-gray-800"><Plus size={14} /> Agregar</button>
            </div>
            <div id="nuevo-aprendizaje" className="scroll-mt-4" />
            {agregando && <Formulario inicial={agregando} alCancelar={() => setAgregando(null)} alGuardar={async (x) => { await enviar({ accion: "memoria_crear", ...x }); setAgregando(null); cargar(); }} />}
            <div className="flex flex-wrap gap-1.5">
              {["todos", "general", ...Array.from(new Set((d.memoria ?? []).map((m) => m.canal).filter((c): c is string => !!c)))].map((c) => (
                <button key={c} type="button" onClick={() => setCanal(c)} className={`min-h-[32px] rounded-full border px-3 text-[12px] ${canal === c ? "border-sky-700 bg-sky-950/50 text-sky-200" : "border-gray-800 text-gray-400 hover:text-gray-200"}`}>{c === "todos" ? "Todo" : c === "general" ? "General" : CANALES[c] ?? c}</button>
              ))}
            </div>
            {NIVELES.map((n) => {
              const xs = activos.filter((m) => m.nivel === n.id);
              return (
                <div key={n.id} className="space-y-1">
                  <h3 className={`text-[14px] font-semibold ${n.c}`}>{n.t} <span className="tabular-nums text-gray-500">({xs.length})</span></h3>
                  <p className="text-[12px] text-gray-500">{n.ayuda}</p>
                  {xs.length === 0
                    ? <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 text-[13px] text-gray-500">Nada todavía.</p>
                    : <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/60">{xs.map((m) => <ItemMemoria key={m.id} m={m} alListo={cargar} />)}</ul>}
                </div>
              );
            })}
            {bajas.length > 0 && (
              <div className="space-y-1">
                <button type="button" onClick={() => setVerBajas(!verBajas)} className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] text-gray-300 hover:text-white"><ChevronDown size={15} className={verBajas ? "rotate-180" : ""} /> Lo que dejó de valer ({bajas.length}), con su motivo</button>
                {verBajas && <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/60">{bajas.map((m) => <ItemMemoria key={m.id} m={m} alListo={cargar} />)}</ul>}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">Lo que se decidió y por qué</h2>
            {dec.length === 0 && <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 text-[13px] text-gray-400">Todavía no hay decisiones. Se toman en <Link href={"/admin/tarot/inteligencia/recomendaciones" as Route<string>} className="text-sky-300 hover:underline">Recomendaciones</Link>.</p>}
            {hechas.length > 0 && (
              <>
                <h3 className="flex items-center gap-1.5 text-[13.5px] font-semibold text-emerald-300"><Check size={14} /> Hechas ({hechas.length})</h3>
                <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/60">
                  {hechas.map((x) => <li key={x.clave} className="p-3 text-[13px] text-gray-200">{x.titulo} <span className="text-gray-500">· {fecha(x.decidida_at)}{x.nota ? ` · ${x.nota}` : ""}</span></li>)}
                </ul>
              </>
            )}
            {conMotivo.length > 0 && (
              <>
                <h3 className="text-[13.5px] font-semibold text-gray-200">Descartadas, con su motivo ({conMotivo.length})</h3>
                <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/60">
                  {conMotivo.map((x) => (
                    <li key={x.clave} className="flex flex-col gap-1.5 p-3 md:flex-row md:items-start md:justify-between md:gap-4">
                      <div className="min-w-0 text-[13px]">
                        <p className="text-gray-200">{x.titulo}</p>
                        <p className="text-gray-400">{ESTADO_DEC[x.estado]} el {fecha(x.decidida_at)}: {x.nota}</p>
                      </div>
                      <button type="button" onClick={() => { setAgregando({ texto: `${x.titulo}: ${x.nota}`.slice(0, 600), nivel: "senal", area: "otro", canal: x.canal && x.canal !== "negocio" ? x.canal : null }); setTimeout(() => document.getElementById("nuevo-aprendizaje")?.scrollIntoView({ behavior: "smooth" }), 50); }} className="inline-flex min-h-[34px] shrink-0 items-center gap-1 self-start rounded-lg border border-gray-700 px-2.5 text-[12px] text-gray-300 hover:bg-gray-800"><Plus size={12} /> Guardar como aprendizaje</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {dec.some((x) => x.nota && /^Vieja \(/.test(x.nota)) && <p className="text-[12px] text-gray-500">Las recomendaciones viejas archivadas sin revisar no se listan acá: no tienen un motivo que enseñe algo.</p>}
          </section>
        </>
      )}
    </MarcoInteligencia>
  );
}
