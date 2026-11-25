"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, Archive, Check, ChevronDown, Clock, ExternalLink, Hourglass, Info, Layers, RefreshCw, RotateCcw, ThumbsUp, X } from "lucide-react";
import { MarcoInteligencia } from "@/components/admin/inteligencia/Marco";
import type { Bandeja, Recomendacion, EstadoDecision } from "@/lib/inteligencia/recomendaciones";

// Inteligencia comercial · Recomendaciones (fase 2, 2026-11-25).
// Una sola bandeja con lo que proponen el motor de reglas de Google Ads, el
// Centro de control, el Analista, el Estratega y los experimentos: sin
// repetidas, ordenada por lo que más mueve la plata, con los choques a la
// vista. Manuel decide; nada se ejecuta solo.

const NOMBRE_CANAL: Record<string, string> = { google_ads: "Google Ads", meta_ads: "Meta Ads", seo: "Buscadores", social: "Redes", mensajeria: "WhatsApp", referidos: "Referidos", directo: "Directo", otro: "Otros", negocio: "Negocio" };
const EVIDENCIA: Record<Recomendacion["evidencia"], { t: string; c: string; ayuda: string }> = {
  hecho: { t: "Hecho", c: "border-emerald-800 bg-emerald-950/40 text-emerald-300", ayuda: "Comprobado con datos reales y suficientes." },
  senal: { t: "Señal", c: "border-amber-800 bg-amber-950/40 text-amber-300", ayuda: "Hay datos, pero pocos o es un juicio no validado todavía." },
  hipotesis: { t: "Hipótesis", c: "border-gray-700 bg-gray-900 text-gray-300", ayuda: "Idea a probar; todavía sin datos." },
};
const ESTADO_DECISION: Record<EstadoDecision, string> = { aceptada: "Aceptada", descartada: "Descartada", pospuesta: "Pospuesta", hecha: "Hecha", no_aplica: "Ya no aplica" };
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: "America/Montevideo" }) : "—");
const refsDe = (r: Recomendacion) => r.fuentes.filter((f) => f.tipo === "analista" || f.tipo === "estratega").map((f) => ({ tipo: f.tipo, id: f.ref }));

type Vista = "decidir" | "esperando" | "aceptadas" | "pospuestas" | "decididas";

async function enviar(cuerpo: Record<string, unknown>) {
  const r = await fetch("/api/admin/tarot/inteligencia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.motivo || "No se pudo guardar.");
  return d as { ok: true; aviso?: string | null };
}

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}

function Campo({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t}</p>
      <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-gray-200">{children}</p>
    </div>
  );
}

function BarraDecision({ r, alListo }: { r: Recomendacion; alListo: (aviso?: string | null) => void }) {
  const [modo, setModo] = useState<null | "descartada" | "no_aplica" | "pospuesta" | "hecha">(null);
  const [nota, setNota] = useState("");
  const [hasta, setHasta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decidir = async (estado: EstadoDecision) => {
    setEnviando(true); setError(null);
    try {
      await enviar({ accion: "decidir", clave: r.clave, estado, nota: nota || undefined, posponer_hasta: hasta || undefined, titulo: r.titulo, canal: r.canal, refs: refsDe(r) });
      alListo();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setEnviando(false); }
  };
  const aceptada = r.decision?.estado === "aceptada";
  const boton = "inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium disabled:opacity-50";
  return (
    <div className="space-y-2 border-t border-gray-800 pt-3">
      <div className="flex flex-wrap gap-2">
        {!aceptada && <button type="button" disabled={enviando} onClick={() => decidir("aceptada")} className={`${boton} border-sky-700 bg-sky-900/40 text-sky-100 hover:bg-sky-900/70`}><ThumbsUp size={14} /> Aceptar</button>}
        <button type="button" disabled={enviando} onClick={() => setModo(modo === "hecha" ? null : "hecha")} className={`${boton} border-emerald-800 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/50`}><Check size={14} /> {aceptada ? "Marcar hecha" : "Ya está hecha"}</button>
        {!aceptada && <button type="button" disabled={enviando} onClick={() => setModo(modo === "pospuesta" ? null : "pospuesta")} className={`${boton} border-gray-700 text-gray-200 hover:bg-gray-800`}><Clock size={14} /> Posponer</button>}
        <button type="button" disabled={enviando} onClick={() => setModo(modo === "no_aplica" ? null : "no_aplica")} className={`${boton} border-gray-700 text-gray-200 hover:bg-gray-800`}><Archive size={14} /> Ya no aplica</button>
        <button type="button" disabled={enviando} onClick={() => setModo(modo === "descartada" ? null : "descartada")} className={`${boton} border-gray-700 text-gray-300 hover:bg-gray-800`}><X size={14} /> Descartar</button>
        {aceptada && <button type="button" disabled={enviando} onClick={async () => { setEnviando(true); try { const d = await enviar({ accion: "reabrir", clave: r.clave, refs: refsDe(r) }); alListo(d.aviso); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setEnviando(false); } }} className={`${boton} border-gray-700 text-gray-300 hover:bg-gray-800`}><RotateCcw size={14} /> Volver a la bandeja</button>}
      </div>
      {modo && (
        <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/60 p-3">
          {modo === "pospuesta" && (
            <label className="block text-[13px] text-gray-300">Volver a mostrarla el
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="ml-2 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-gray-100" />
            </label>
          )}
          <label className="block text-[13px] text-gray-300">
            {modo === "descartada" || modo === "no_aplica" ? "Por qué (queda como aprendizaje)" : "Nota (opcional)"}
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={500} className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-[13px] text-gray-100" placeholder={modo === "no_aplica" ? "Ej.: ya se hizo el 17/11" : modo === "descartada" ? "Ej.: no conviene porque…" : ""} />
          </label>
          <button type="button" disabled={enviando} onClick={() => decidir(modo)} className={`${boton} border-amber-700 bg-amber-900/40 text-amber-100 hover:bg-amber-900/70`}>
            Confirmar: {modo === "hecha" ? "hecha" : ESTADO_DECISION[modo].toLowerCase()}
          </button>
        </div>
      )}
      {error && <p className="text-[13px] text-red-300">{error}</p>}
      {r.fuentes.some((f) => f.tipo === "analista" || f.tipo === "estratega") && (
        <p className="text-[11.5px] text-gray-500">Tu decisión también queda marcada en {Array.from(new Set(r.fuentes.filter((f) => f.tipo === "analista" || f.tipo === "estratega").map((f) => f.nombre))).join(" y ")}.</p>
      )}
    </div>
  );
}

function Tarjeta({ r, puesto, alListo }: { r: Recomendacion; puesto?: number; alListo: (aviso?: string | null) => void }) {
  const [abierta, setAbierta] = useState(false);
  const ev = EVIDENCIA[r.evidencia];
  const fuentesUnicas = Array.from(new Map(r.fuentes.map((f) => [`${f.nombre}`, f])).values());
  return (
    <article className={`rounded-xl border bg-gray-900/60 ${r.conflictos.length ? "border-amber-900/70" : "border-gray-800"}`}>
      <button type="button" onClick={() => setAbierta(!abierta)} aria-expanded={abierta} className="flex w-full items-start gap-3 p-3.5 text-left hover:bg-gray-800/30 md:p-4">
        {puesto != null && <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-800 text-[12px] font-bold tabular-nums text-gray-200">{puesto}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold leading-snug text-white">{r.titulo}</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip className="border-gray-700 bg-gray-800/60 text-gray-200">{NOMBRE_CANAL[r.canal] ?? r.canal}</Chip>
            <Chip className="border-gray-700 bg-gray-800/60 text-gray-300">{r.efecto}</Chip>
            <Chip className={ev.c}>{ev.t}</Chip>
            {r.repeticiones > 1 && <Chip className="border-sky-900 bg-sky-950/40 text-sky-300"><Layers size={11} /> {r.repeticiones} veces</Chip>}
            {r.vieja && <Chip className="border-gray-700 bg-gray-900 text-gray-400"><Hourglass size={11} /> Vieja ({fecha(r.fecha)})</Chip>}
            {r.posible_resuelta && <Chip className="border-emerald-900 bg-emerald-950/40 text-emerald-300"><Check size={11} /> Quizás ya resuelta</Chip>}
            {r.conflictos.length > 0 && <Chip className="border-amber-800 bg-amber-950/50 text-amber-300"><AlertTriangle size={11} /> {r.conflictos.some((c) => c.tipo === "contradiccion") ? "Contradicción" : r.conflictos.some((c) => c.tipo === "memoria") ? "La memoria advierte" : r.conflictos.some((c) => c.tipo === "interferencia") ? "Choca con un experimento" : "Pide esperar"}</Chip>}
            {r.sube_gasto && <Chip className="border-violet-900 bg-violet-950/40 text-violet-300">Sube el gasto: lo decidís vos</Chip>}
          </span>
        </span>
        <ChevronDown size={18} className={`mt-1 shrink-0 text-gray-500 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {abierta && (
        <div className="space-y-3 px-3.5 pb-3.5 md:px-4 md:pb-4">
          {r.posible_resuelta && <p className="rounded-lg border border-emerald-900/70 bg-emerald-950/30 p-2.5 text-[13px] text-emerald-200">{r.posible_resuelta}</p>}
          {r.conflictos.map((c, i) => (
            <p key={i} className="flex gap-2 rounded-lg border border-amber-900/70 bg-amber-950/25 p-2.5 text-[13px] text-amber-100"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />{c.texto}</p>
          ))}
          <div className="grid gap-3 md:grid-cols-2">
            <Campo t="Qué pasa">{r.que_pasa}</Campo>
            <Campo t="Por qué importa">{r.por_que_importa}</Campo>
            <Campo t="Qué hacer">{r.accion}</Campo>
            <Campo t="Principio comercial">{r.principio}</Campo>
            <Campo t="Resultado esperado">{r.resultado_esperado}</Campo>
            <Campo t="Cómo se mide">{r.como_medir}</Campo>
          </div>
          {r.memoria.length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-2.5 text-[12.5px]">
              <p className="font-semibold text-gray-300">Lo que ya sabe el negocio sobre esto</p>
              <ul className="mt-1 space-y-1 text-gray-400">
                {r.memoria.map((m) => <li key={m.id}><span className={m.nivel === "hecho" ? "text-emerald-300" : m.nivel === "senal" ? "text-amber-300" : "text-gray-300"}>{m.nivel === "hecho" ? "Hecho" : m.nivel === "senal" ? "Señal" : "Hipótesis"}{m.resultado === "no_funciono" ? " · no funcionó" : m.resultado === "funciono" ? " · funcionó" : ""}:</span> {m.texto}</li>)}
              </ul>
            </div>
          )}
          <div className="grid gap-3 rounded-lg bg-gray-950/50 p-2.5 text-[12.5px] text-gray-400 md:grid-cols-2">
            <p><b className="text-gray-300">Evidencia: {ev.t}.</b> {r.evidencia_motivo}</p>
            <p><b className="text-gray-300">Por qué está en este lugar:</b> {r.prioridad_motivo.join(" · ")}.</p>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-500">
            Viene de:
            {fuentesUnicas.map((f) => (
              <Link key={f.nombre + f.ref} href={f.enlace as Route<string>} className="inline-flex items-center gap-1 text-sky-300 hover:underline">{f.nombre}{r.fuentes.filter((x) => x.nombre === f.nombre).length > 1 ? ` (${r.fuentes.filter((x) => x.nombre === f.nombre).length} informes)` : ""} <ExternalLink size={11} /></Link>
            ))}
          </p>
          {r.clave.startsWith("experimento:")
            ? <Link href={"/admin/tarot/inteligencia/experimentos" as Route<string>} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-violet-800 bg-violet-950/40 px-3 text-[13px] font-medium text-violet-100 hover:bg-violet-900/50">Abrir {r.fuentes[0]?.nombre} en Acciones y experimentos →</Link>
            : <BarraDecision r={r} alListo={alListo} />}
        </div>
      )}
    </article>
  );
}

export default function RecomendacionesPage() {
  const [d, setD] = useState<Bandeja | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [vista, setVista] = useState<Vista>("decidir");
  const [canal, setCanal] = useState<string>("todos");
  const [aviso, setAviso] = useState<string | null>(null);
  const [archivando, setArchivando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch("/api/admin/tarot/inteligencia?vista=recomendaciones", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.detalle || j.motivo || "Error");
      setD(j);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const alListo = useCallback((a?: string | null) => { setAviso(a ?? null); cargar(); }, [cargar]);

  const listas = useMemo(() => {
    if (!d) return null;
    const f = (xs: Recomendacion[]) => (canal === "todos" ? xs : xs.filter((x) => x.canal === canal));
    return { decidir: f(d.para_decidir), esperando: f(d.esperando), aceptadas: f(d.aceptadas), pospuestas: f(d.pospuestas) };
  }, [d, canal]);
  const canales = useMemo(() => (d ? Array.from(new Set([...d.para_decidir, ...d.esperando, ...d.aceptadas, ...d.pospuestas].map((x) => x.canal))) : []), [d]);

  const recientes = listas?.decidir.filter((x) => !x.vieja) ?? [];
  const viejas = listas?.decidir.filter((x) => x.vieja) ?? [];

  async function archivarViejas() {
    if (!viejas.length || !window.confirm(`¿Marcar las ${viejas.length} recomendaciones viejas como «ya no aplica»? Quedan en Decididas y las podés reabrir.`)) return;
    setArchivando(true);
    try {
      for (const r of viejas) await enviar({ accion: "decidir", clave: r.clave, estado: "no_aplica", nota: `Vieja (del ${fecha(r.fecha)}): archivada sin revisar desde la bandeja.`, titulo: r.titulo, canal: r.canal, refs: refsDe(r) });
      alListo();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setArchivando(false); }
  }

  const pestañas: { id: Vista; t: string; n: number | null }[] = [
    { id: "decidir", t: "Para decidir", n: listas?.decidir.length ?? null },
    { id: "esperando", t: "Esperando datos", n: listas?.esperando.length ?? null },
    { id: "aceptadas", t: "Aceptadas", n: listas?.aceptadas.length ?? null },
    { id: "pospuestas", t: "Pospuestas", n: listas?.pospuestas.length ?? null },
    { id: "decididas", t: "Decididas", n: d?.decididas.length ?? null },
  ];

  return (
    <MarcoInteligencia
      bajada="Lo que proponen el motor de Google Ads, el Centro de control, el Analista, el Estratega y los experimentos, en una sola lista: sin repetidas y ordenada por lo que más mueve la plata. Vos decidís; nada se aplica solo."
      extra={<button type="button" onClick={cargar} disabled={cargando} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-700 px-3 text-[13px] text-gray-200 hover:bg-gray-800 disabled:opacity-50"><RefreshCw size={14} className={cargando ? "animate-spin" : ""} /> Actualizar</button>}
    >
      {error && <p className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-[13px] text-red-200">{error}</p>}
      {aviso && <p className="rounded-xl border border-amber-900 bg-amber-950/30 p-3 text-[13px] text-amber-200">{aviso}</p>}
      {!d && !error && <p className="py-16 text-center text-[14px] text-gray-400">Juntando las recomendaciones de todas las herramientas…</p>}

      {d && listas && (
        <>
          <section className="flex flex-wrap gap-2 text-[12px]" aria-label="Fuentes">
            {d.fuentes.map((f) => (
              <Link key={f.nombre} href={f.enlace as Route<string>} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 hover:bg-gray-800/40 ${f.ok ? "border-gray-800 text-gray-300" : "border-red-900 text-red-300"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${f.ok ? "bg-emerald-400" : "bg-red-400"}`} aria-hidden="true" />
                <b className="font-semibold text-gray-100">{f.nombre}</b> {f.detalle}
              </Link>
            ))}
          </section>
          {d.esperar_google?.esperar && (
            <p className="flex gap-2 rounded-xl border border-amber-900/70 bg-amber-950/25 p-3 text-[13px] text-amber-100"><Hourglass size={15} className="mt-0.5 shrink-0 text-amber-400" /> Google Ads: {d.esperar_google.motivo}</p>
          )}

          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <div role="tablist" className="flex w-max gap-1 rounded-xl border border-gray-800 bg-gray-900/60 p-1">
              {pestañas.map((p) => (
                <button key={p.id} type="button" role="tab" aria-selected={vista === p.id} onClick={() => setVista(p.id)} className={`min-h-[36px] whitespace-nowrap rounded-lg px-3 text-[13px] font-medium ${vista === p.id ? "bg-amber-400/15 text-amber-200" : "text-gray-400 hover:text-gray-200"}`}>
                  {p.t}{p.n != null && <span className="ml-1.5 tabular-nums text-gray-500">{p.n}</span>}
                </button>
              ))}
            </div>
          </div>

          {vista !== "decididas" && canales.length > 1 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por canal">
              {["todos", ...canales].map((c) => (
                <button key={c} type="button" onClick={() => setCanal(c)} className={`min-h-[32px] rounded-full border px-3 text-[12px] ${canal === c ? "border-sky-700 bg-sky-950/50 text-sky-200" : "border-gray-800 text-gray-400 hover:text-gray-200"}`}>{c === "todos" ? "Todos los canales" : NOMBRE_CANAL[c] ?? c}</button>
              ))}
            </div>
          )}

          {vista === "decidir" && (
            <section className="space-y-2.5">
              {recientes.length === 0 && viejas.length === 0 && <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-[13px] text-gray-400">No hay nada para decidir ahora.</p>}
              {recientes.map((r, i) => <Tarjeta key={r.clave} r={r} puesto={i + 1} alListo={alListo} />)}
              {viejas.length > 0 && (
                <div className="space-y-2.5 pt-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 className="text-[15px] font-semibold text-white">Viejas: más de 14 días sin decidir ({viejas.length})</h2>
                      <p className="text-[12.5px] text-gray-500">Se armaron con datos de otro momento y pueden no aplicar más. Revisalas o archivalas.</p>
                    </div>
                    <button type="button" onClick={archivarViejas} disabled={archivando} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-700 px-3 text-[13px] text-gray-200 hover:bg-gray-800 disabled:opacity-50"><Archive size={14} /> {archivando ? "Archivando…" : "Archivar todas"}</button>
                  </div>
                  {viejas.map((r) => <Tarjeta key={r.clave} r={r} alListo={alListo} />)}
                </div>
              )}
            </section>
          )}
          {vista === "esperando" && (
            <section className="space-y-2.5">
              <p className="flex gap-2 text-[12.5px] text-gray-400"><Info size={14} className="mt-0.5 shrink-0" /> Puntos donde todavía no hay datos suficientes para decidir. Cambiar antes de tiempo es reaccionar al ruido.</p>
              {listas.esperando.length === 0 && <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-[13px] text-gray-400">Nada esperando datos.</p>}
              {listas.esperando.map((r) => <Tarjeta key={r.clave} r={r} alListo={alListo} />)}
            </section>
          )}
          {vista === "aceptadas" && (
            <section className="space-y-2.5">
              <p className="flex gap-2 text-[12.5px] text-gray-400"><Info size={14} className="mt-0.5 shrink-0" /> Lo que decidiste hacer. Cuando lo apliques, marcalo hecho: queda en la bitácora y los experimentos lo tienen en cuenta.</p>
              {listas.aceptadas.length === 0 && <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-[13px] text-gray-400">No hay recomendaciones aceptadas sin terminar.</p>}
              {listas.aceptadas.map((r) => <Tarjeta key={r.clave} r={r} alListo={alListo} />)}
            </section>
          )}
          {vista === "pospuestas" && (
            <section className="space-y-2.5">
              {listas.pospuestas.length === 0 && <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-[13px] text-gray-400">Nada pospuesto.</p>}
              {listas.pospuestas.map((r) => (
                <div key={r.clave} className="space-y-1">
                  <p className="text-[12px] text-gray-500">Vuelve a la bandeja el {r.decision?.posponer_hasta?.split("-").reverse().slice(0, 2).join("/")}</p>
                  <Tarjeta r={r} alListo={alListo} />
                </div>
              ))}
            </section>
          )}
          {vista === "decididas" && (
            <section className="space-y-2">
              <p className="flex gap-2 text-[12.5px] text-gray-400"><Info size={14} className="mt-0.5 shrink-0" /> Lo que ya decidiste, con el motivo. Es memoria del negocio: también cuenta lo que se descartó.</p>
              {d.decididas.length === 0 && <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-[13px] text-gray-400">Todavía no decidiste ninguna.</p>}
              <div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/60">
                {d.decididas.map((x) => (
                  <div key={x.clave} className="flex flex-col gap-1.5 p-3 md:flex-row md:items-start md:justify-between md:gap-4">
                    <div className="min-w-0">
                      <p className="text-[13.5px] text-gray-100">{x.titulo}</p>
                      <p className="mt-0.5 text-[12px] text-gray-500"><span className={x.estado === "hecha" ? "text-emerald-300" : "text-gray-300"}>{ESTADO_DECISION[x.estado]}</span> · {fecha(x.decidida_at)}{x.canal ? ` · ${NOMBRE_CANAL[x.canal] ?? x.canal}` : ""}{x.nota ? ` · ${x.nota}` : ""}</p>
                    </div>
                    <button type="button" onClick={async () => { try { const r = await enviar({ accion: "reabrir", clave: x.clave }); alListo(r.aviso); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }} className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 self-start rounded-lg border border-gray-700 px-2.5 text-[12.5px] text-gray-300 hover:bg-gray-800"><RotateCcw size={13} /> Reabrir</button>
                  </div>
                ))}
              </div>
            </section>
          )}
          <p className="text-[12px] text-gray-500">
            Se recalcula cada vez que abrís la pantalla. Las herramientas de origen siguen disponibles con todo su detalle. La prioridad pesa primero lo que frena pérdidas de plata, después lo que mejora la conversión del tráfico que ya se paga y la medición; baja las viejas, las probablemente resueltas y las que chocan con un experimento.
          </p>
        </>
      )}
    </MarcoInteligencia>
  );
}
