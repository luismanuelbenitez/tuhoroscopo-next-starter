"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  AlertTriangle, Archive, ArrowRight, BookOpen, Check, ChevronDown, Clock, ExternalLink, FlaskConical, Hourglass, Info, ListChecks, Lock,
  RotateCcw, ShieldAlert, ThumbsUp, X, type LucideIcon,
} from "lucide-react";
import {
  Pagina, Panel, Insignia, Punto, Aviso, Vacio, EsqueletoPagina, ErrorCarga, Desplegable, Segmentado, Boton, BotonLink, Actualizar, Campo, claseCampo, Rotulo, Ayuda,
  useVista, useNotificacion, enviarIC, fechaDia, TONO, type Tono,
} from "@/components/admin/inteligencia/ui";
import type { Bandeja, Recomendacion, EstadoDecision } from "@/lib/inteligencia/recomendaciones";
import { clasificar, PALANCA, dondeSeHace, periodoDe, type Problema } from "@/lib/inteligencia/bandeja";

// Inteligencia comercial · Recomendaciones (fase 2; Level Up 2026-11-25).
// Bandeja ejecutiva de decisiones: arriba lo que se puede decidir y hacer
// ahora; aparte lo que espera evidencia, lo bloqueado por un experimento (con
// lo que lo libera) y lo viejo, que no compite por atención hasta revalidarlo.
// Los problemas económicos se muestran como problemas (con sus palancas), no
// como una acción más. Manuel decide; nada se aplica solo.

const CANAL: Record<string, string> = { google_ads: "Google Ads", meta_ads: "Meta Ads", seo: "Búsqueda orgánica", social: "Redes", mensajeria: "WhatsApp y email", referidos: "Referidos", directo: "Directo", otro: "Otros", negocio: "Negocio" };
const EVIDENCIA: Record<Recomendacion["evidencia"], { t: string; tono: Tono; ayuda: string }> = {
  hecho: { t: "Hecho", tono: "positivo", ayuda: "Comprobado con datos reales y suficientes." },
  senal: { t: "Señal", tono: "alerta", ayuda: "Hay datos, pero pocos o es un juicio todavía no validado." },
  hipotesis: { t: "Hipótesis", tono: "ia", ayuda: "Idea a probar; todavía sin datos." },
};
const ESTADO: Record<EstadoDecision, string> = { aceptada: "Aceptada", descartada: "Descartada", pospuesta: "Pospuesta", hecha: "Hecha", no_aplica: "Ya no aplica", revalidada: "Confirmada vigente" };
const TONO_EFECTO: Record<string, Tono> = { "Frena una pérdida": "negativo", "Mejora la conversión": "info", "Mide mejor": "neutro", "Escala lo rentable": "positivo", "Ordena la decisión": "neutro" };
/** Corta en el último espacio (sin partir palabras). */
const corte = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`);
const refsDe = (r: Recomendacion) => r.fuentes.filter((f) => f.tipo === "analista" || f.tipo === "estratega").map((f) => ({ tipo: f.tipo, id: f.ref }));
const KPIS_UI = [
  { id: "costo_venta_usd", t: "Costo por venta (US$)" }, { id: "ventas_100_clics", t: "Ventas cada 100 clics" }, { id: "cpc_usd", t: "Costo por clic (US$)" },
  { id: "clics_dia", t: "Clics por día" }, { id: "pct_checkout", t: "Visitas que llegan al checkout" }, { id: "ventas", t: "Ventas" }, { id: "gasto_dia_usd", t: "Gasto por día (US$)" },
];
const ALCANCES = [{ id: "google_ads", t: "Google Ads" }, { id: "meta_ads", t: "Meta Ads" }, { id: "pagina", t: "Página" }, { id: "checkout", t: "Checkout" }, { id: "oferta", t: "Oferta y precio" }];

type Vista = "decidir" | "bloqueadas" | "esperando" | "revalidar" | "decididas";
type SubDecididas = "marcha" | "pospuestas" | "cerradas";

// ── Convertir en experimento ────────────────────────────────────────────────
function FormExperimento({ r, alListo, cancelar }: { r: Recomendacion; alListo: (t: string) => void; cancelar: () => void }) {
  const alcanceInicial = [r.canal === "google_ads" || r.canal === "meta_ads" ? r.canal : null, ["pagina", "checkout", "oferta"].includes(r.area) ? r.area : null].filter(Boolean) as string[];
  const [f, setF] = useState({
    nombre: corte(r.titulo, 160), hipotesis: `Si hacemos esto: ${corte(r.accion, 420)}\nEsperamos: ${corte(r.resultado_esperado, 300)}`, canal: r.canal,
    kpi: r.canal === "google_ads" ? "costo_venta_usd" : r.area === "checkout" || r.area === "pagina" ? "pct_checkout" : "ventas", esperado: "",
    volumen: "", metrica: "clics", fin: "", cambios: r.accion.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚ¿])/).map((x) => corte(x.trim(), 300)).filter(Boolean).slice(0, 8).join("\n"), alcance: alcanceInicial,
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const crear = async () => {
    setEnviando(true); setError(null);
    try {
      const j = await enviarIC<{ ok: true; id: string; aviso?: string }>({
        accion: "experimento_crear", clave: r.clave, titulo: r.titulo, refs: refsDe(r), nombre: f.nombre, hipotesis: f.hipotesis, canal: f.canal, kpi: f.kpi, esperado: f.esperado,
        volumen_minimo: f.volumen ? { metrica: f.metrica, valor: Number(f.volumen) } : null, fin_previsto: f.fin || null, cambios: f.cambios.split("\n").map((x) => x.trim()).filter(Boolean), alcance: f.alcance,
      });
      alListo(j.aviso ?? `Se creó ${j.id} como experimento planificado. La recomendación quedó aceptada y vinculada.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setEnviando(false); }
  };
  return (
    <div className="space-y-3.5 rounded-lg bg-violet-400/[0.05] p-4 ring-1 ring-inset ring-violet-400/20">
      <div>
        <p className="flex items-center gap-2 text-[14.5px] font-semibold text-violet-100"><FlaskConical size={15} aria-hidden="true" /> Convertir en experimento</p>
        <p className="mt-0.5 text-[13px] text-gray-400">Queda planificado: no se aplica nada. La línea base se congela cuando marques la fecha en que lo aplicaste.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Campo etiqueta="Nombre"><input className={claseCampo} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} maxLength={160} /></Campo>
        <Campo etiqueta="Canal o ámbito">
          <select className={`${claseCampo} [&>option]:bg-gray-900`} value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value as Recomendacion["canal"] })}>
            {Object.entries(CANAL).filter(([k]) => k !== "otro").map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </Campo>
      </div>
      <Campo etiqueta="Hipótesis" ayuda="Qué cambia y qué esperás que pase, con un número si se puede."><textarea className={claseCampo} rows={3} value={f.hipotesis} onChange={(e) => setF({ ...f, hipotesis: e.target.value })} maxLength={1000} /></Campo>
      <Campo etiqueta="Cambios concretos" ayuda="Uno por línea. Si son varios a la vez, solo se podrá evaluar el efecto conjunto."><textarea className={claseCampo} rows={3} value={f.cambios} onChange={(e) => setF({ ...f, cambios: e.target.value })} /></Campo>
      <div className="grid gap-3 md:grid-cols-4">
        <Campo etiqueta="Indicador principal" className="md:col-span-2">
          <select className={`${claseCampo} [&>option]:bg-gray-900`} value={f.kpi} onChange={(e) => setF({ ...f, kpi: e.target.value })}>{KPIS_UI.map((k) => <option key={k.id} value={k.id}>{k.t}</option>)}</select>
        </Campo>
        <Campo etiqueta="Valor esperado" className="md:col-span-2"><input className={claseCampo} value={f.esperado} onChange={(e) => setF({ ...f, esperado: e.target.value })} maxLength={80} placeholder="Ej.: US$ 15 o menos" /></Campo>
        <Campo etiqueta="Volumen mínimo para juzgarlo">
          <input className={`${claseCampo} tabular-nums`} inputMode="numeric" value={f.volumen} onChange={(e) => setF({ ...f, volumen: e.target.value.replace(/\D/g, "") })} placeholder="Ej.: 45" />
        </Campo>
        <Campo etiqueta="Medido en">
          <select className={`${claseCampo} [&>option]:bg-gray-900`} value={f.metrica} onChange={(e) => setF({ ...f, metrica: e.target.value })}>{["clics", "visitas", "checkout", "ventas"].map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </Campo>
        <Campo etiqueta="Fin previsto" className="md:col-span-2"><input type="date" className={`${claseCampo} [color-scheme:dark]`} value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} /></Campo>
      </div>
      <fieldset>
        <legend className="text-[13px] font-medium text-gray-200">Qué no se toca mientras corre</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALCANCES.map((a) => {
            const on = f.alcance.includes(a.id);
            return <button key={a.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, alcance: on ? f.alcance.filter((x) => x !== a.id) : [...f.alcance, a.id] })}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-2.5 text-[13px] ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${on ? "bg-amber-400/10 text-amber-100 ring-amber-400/30" : "text-gray-400 ring-white/10 hover:text-gray-200"}`}>{on && <Check size={13} aria-hidden="true" />}{a.t}</button>;
          })}
        </div>
      </fieldset>
      {error && <p className="text-[13px] text-rose-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton variante="ia" icono={FlaskConical} cargando={enviando} onClick={crear}>Crear experimento planificado</Boton>
        <Boton variante="fantasma" onClick={cancelar}>Cancelar</Boton>
      </div>
    </div>
  );
}

// ── Barra de decisión ───────────────────────────────────────────────────────
type Modo = null | "descartada" | "no_aplica" | "pospuesta" | "hecha" | "experimento";
function BarraDecision({ r, alListo, vieja }: { r: Recomendacion; alListo: (t: string, tono?: Tono) => void; vieja?: boolean }) {
  const [modo, setModo] = useState<Modo>(null);
  const [nota, setNota] = useState("");
  const [hasta, setHasta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decidir = async (estado: EstadoDecision) => {
    if (estado === "aceptada" && r.sube_gasto && !window.confirm("Esta recomendación sube la inversión publicitaria. ¿La aceptás igual? No se aplica nada en la cuenta: solo queda registrada tu decisión.")) return;
    setEnviando(true); setError(null);
    try {
      await enviarIC({ accion: "decidir", clave: r.clave, estado, nota: nota || undefined, posponer_hasta: hasta || undefined, titulo: r.titulo, canal: r.canal, refs: refsDe(r) });
      alListo(estado === "revalidada" ? "Vuelve a la bandeja con fecha de hoy." : `Decisión guardada: ${ESTADO[estado].toLowerCase()}.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setEnviando(false); }
  };
  const aceptada = r.decision?.estado === "aceptada";
  const abrir = (m: Modo) => { setModo(modo === m ? null : m); setError(null); };
  const fuentesOrigen = Array.from(new Set(r.fuentes.filter((f) => f.tipo === "analista" || f.tipo === "estratega").map((f) => f.nombre)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {vieja ? (
          <>
            <Boton variante="primario" icono={RotateCcw} cargando={enviando} onClick={() => decidir("revalidada")}>Sigue vigente</Boton>
            <Boton icono={Archive} onClick={() => abrir("no_aplica")}>Ya no aplica</Boton>
            <Boton variante="fantasma" icono={Check} onClick={() => abrir("hecha")}>Ya está hecha</Boton>
          </>
        ) : aceptada ? (
          <>
            <Boton variante="positivo" icono={Check} onClick={() => abrir("hecha")}>Marcar realizada</Boton>
            <Boton variante="fantasma" icono={RotateCcw} cargando={enviando} onClick={async () => { setEnviando(true); try { const d = await enviarIC({ accion: "reabrir", clave: r.clave, refs: refsDe(r) }); alListo(d.aviso ?? "Volvió a la bandeja."); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setEnviando(false); } }}>Volver a la bandeja</Boton>
          </>
        ) : (
          <>
            <Boton variante="primario" icono={ThumbsUp} cargando={enviando} onClick={() => decidir("aceptada")}>Aceptar</Boton>
            <Boton variante="ia" icono={FlaskConical} onClick={() => abrir("experimento")}>Convertir en experimento</Boton>
            <Boton icono={Clock} onClick={() => abrir("pospuesta")}>Posponer</Boton>
            <Boton icono={X} onClick={() => abrir("descartada")}>Descartar</Boton>
            <Boton variante="fantasma" icono={Check} onClick={() => abrir("hecha")}>Ya está hecha</Boton>
            <Boton variante="fantasma" icono={Archive} onClick={() => abrir("no_aplica")}>Ya no aplica</Boton>
          </>
        )}
      </div>
      {modo === "experimento" && <FormExperimento r={r} alListo={(t) => alListo(t)} cancelar={() => setModo(null)} />}
      {modo && modo !== "experimento" && (
        <div className="space-y-3 rounded-lg bg-white/[0.03] p-3.5 ring-1 ring-inset ring-white/[0.08]">
          {modo === "pospuesta" && (
            <Campo etiqueta="Volver a mostrarla el" className="max-w-[220px]"><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={`${claseCampo} [color-scheme:dark]`} /></Campo>
          )}
          <Campo etiqueta={modo === "descartada" || modo === "no_aplica" ? "Por qué (queda como aprendizaje)" : "Nota (opcional)"}>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={500} className={claseCampo} placeholder={modo === "no_aplica" ? "Ej.: ya se hizo el 17/11" : modo === "descartada" ? "Ej.: no conviene porque…" : ""} />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <Boton variante="primario" cargando={enviando} onClick={() => decidir(modo)}>Confirmar: {ESTADO[modo].toLowerCase()}</Boton>
            <Boton variante="fantasma" onClick={() => setModo(null)}>Cancelar</Boton>
          </div>
        </div>
      )}
      {error && <p className="text-[13px] text-rose-300" role="alert">{error}</p>}
      {fuentesOrigen.length > 0 && <p className="text-[12.5px] text-gray-400">La decisión también queda registrada en {fuentesOrigen.join(" y ")}.</p>}
    </div>
  );
}

// ── Tarjeta de recomendación ────────────────────────────────────────────────
function Seccioncita({ t, children, icono: Icono }: { t: string; children: React.ReactNode; icono?: LucideIcon }) {
  return (
    <div className="min-w-0">
      <Rotulo className="flex items-center gap-1.5">{Icono && <Icono size={12} aria-hidden="true" />}{t}</Rotulo>
      <div className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-gray-200">{children}</div>
    </div>
  );
}

function Tarjeta({ r, puesto, problema, libera, alListo, abierta, alternar, vieja }: {
  r: Recomendacion; puesto?: number; problema?: Problema; libera?: string; alListo: (t: string, tono?: Tono) => void; abierta: boolean; alternar: () => void; vieja?: boolean;
}) {
  const ev = EVIDENCIA[r.evidencia];
  const fuentes = Array.from(new Map(r.fuentes.map((f) => [f.nombre, f])).values());
  const riesgo = r.conflictos.find((c) => c.tipo === "contradiccion") ? "Contradice al Centro de control" : r.conflictos.find((c) => c.tipo === "memoria") ? "La memoria advierte" : r.sube_gasto ? "Sube el gasto" : null;
  const coordinar = r.conflictos.find((c) => c.tipo === "posible_interferencia")?.texto.match(/EXP-\d{3,}/)?.[0] ?? null;
  const bloqueada = r.conflictos.some((c) => c.tipo === "interferencia" || c.tipo === "esperar");
  const exps = Array.from(new Set(r.conflictos.flatMap((c) => c.texto.match(/EXP-\d{3,}/g) ?? [])));
  return (
    <article id={`r-${r.clave}`} className={`scroll-mt-24 rounded-xl border bg-white/[0.02] transition-colors ${abierta ? "border-white/[0.14]" : "border-white/[0.07] hover:border-white/[0.12]"}`}>
      <button type="button" data-expandir onClick={alternar} aria-expanded={abierta} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 md:grid-cols-[32px_minmax(0,1fr)_auto] md:p-5">
        {puesto != null
          ? <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-[13px] font-semibold tabular-nums text-gray-100 md:flex">{puesto}</span>
          : <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] text-gray-400 md:flex">{bloqueada ? <Lock size={14} aria-hidden="true" /> : vieja ? <Hourglass size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}</span>}
        <span className="min-w-0">
          <span className="block text-[15.5px] font-semibold leading-snug tracking-[-0.005em] text-gray-50">{r.titulo}</span>
          {problema && <span className="mt-1 flex items-center gap-1.5 text-[13px] text-gray-400"><ShieldAlert size={13} aria-hidden="true" className="shrink-0 text-rose-300/80" /><span className="truncate">Ataca: {problema.r.titulo.toLowerCase()}</span></span>}
          <span className="mt-1.5 line-clamp-2 block text-[13.5px] leading-relaxed text-gray-400">{r.por_que_importa}</span>
          <span className="mt-3 flex flex-wrap items-center gap-1.5">
            <Insignia>{CANAL[r.canal] ?? r.canal}</Insignia>
            <Insignia>{PALANCA[r.area]}</Insignia>
            <Insignia tono={TONO_EFECTO[r.efecto] ?? "neutro"}>{r.efecto}</Insignia>
            <Insignia tono={ev.tono} title={ev.ayuda}>Confianza: {ev.t.toLowerCase()}</Insignia>
            {r.repeticiones > 1 && <Insignia tono="info">Se repitió {r.repeticiones} veces</Insignia>}
            {r.posible_resuelta && <Insignia tono="positivo" icono={Check}>Quizás ya resuelta</Insignia>}
            {riesgo && <Insignia tono="alerta" icono={AlertTriangle}>{riesgo}</Insignia>}
            {coordinar && <Insignia tono="ia" icono={FlaskConical} title="Experimento planificado, todavía sin aplicar: no bloquea">Coordinar con {coordinar}</Insignia>}
            {r.decision && r.decision.estado !== "revalidada" && <Insignia tono="info">{ESTADO[r.decision.estado]}{r.decision.posponer_hasta ? ` hasta el ${fechaDia(r.decision.posponer_hasta)}` : ""}</Insignia>}
            {vieja && <Insignia icono={Hourglass}>Del {fechaDia(r.fecha)}</Insignia>}
          </span>
          {bloqueada && libera && <span className="mt-2.5 flex gap-1.5 text-[13px] text-amber-100/90"><Lock size={13} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" /><span>Se libera {libera}.</span></span>}
        </span>
        <ChevronDown size={18} aria-hidden="true" className={`mt-1 shrink-0 text-gray-400 transition-transform duration-200 ${abierta ? "rotate-180" : ""}`} />
      </button>
      {abierta && (
        <div className="space-y-5 border-t border-white/[0.06] px-4 pb-5 pt-4 md:px-5 md:pl-[68px]">
          {r.posible_resuelta && <Aviso tono="positivo" icono={Check}>{r.posible_resuelta}</Aviso>}
          {r.conflictos.length > 0 && (
            <div className="space-y-2">
              {r.conflictos.map((c, i) => <Aviso key={i} tono={c.tipo === "contradiccion" ? "negativo" : c.tipo === "posible_interferencia" ? "ia" : "alerta"} icono={c.tipo === "interferencia" || c.tipo === "esperar" ? Lock : c.tipo === "posible_interferencia" ? FlaskConical : AlertTriangle} titulo={c.tipo === "interferencia" ? "Bloqueada por un experimento en curso" : c.tipo === "posible_interferencia" ? "Coordinar con un experimento planificado" : c.tipo === "esperar" ? "El motor de Google Ads pide esperar" : c.tipo === "memoria" ? "La memoria advierte" : "Contradicción"}>{c.texto}</Aviso>)}
            </div>
          )}
          <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Seccioncita t="Qué pasa">{r.que_pasa}</Seccioncita>
              <Seccioncita t="Por qué importa">{r.por_que_importa}</Seccioncita>
              <Seccioncita t="Evidencia">
                <span className="mb-1 flex items-center gap-2"><Insignia tono={ev.tono}>{ev.t}</Insignia><span className="text-[13px] text-gray-400">{periodoDe(r)}</span></span>
                {r.evidencia_motivo}
              </Seccioncita>
            </div>
            <div className="space-y-4">
              <Seccioncita t="Qué hacer">{r.accion}</Seccioncita>
              <Seccioncita t="Dónde se hace">{dondeSeHace(r)}</Seccioncita>
              <Seccioncita t="Impacto esperado">{r.resultado_esperado}</Seccioncita>
              <Seccioncita t="Criterio de éxito y cómo se mide">{r.como_medir}</Seccioncita>
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.025] p-3.5">
            <Rotulo>Principio comercial</Rotulo>
            <p className="mt-1 text-[14px] italic leading-relaxed text-gray-300">{r.principio}</p>
          </div>
          {(r.memoria.length > 0 || exps.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {r.memoria.length > 0 && (
                <div>
                  <Rotulo className="flex items-center gap-1.5"><BookOpen size={12} aria-hidden="true" />Lo que ya sabe el negocio</Rotulo>
                  <ul className="mt-2 space-y-2">
                    {r.memoria.map((m) => (
                      <li key={m.id} className="flex gap-2 text-[13.5px] leading-snug text-gray-300">
                        <Punto tono={m.nivel === "hecho" ? "positivo" : m.nivel === "senal" ? "alerta" : "ia"} className="mt-1.5" />
                        <span><span className="text-gray-400">{m.nivel === "hecho" ? "Hecho" : m.nivel === "senal" ? "Señal" : "Hipótesis"}{m.resultado === "no_funciono" ? " · no funcionó" : m.resultado === "funciono" ? " · funcionó" : ""}:</span> {m.texto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {exps.length > 0 && (
                <div>
                  <Rotulo className="flex items-center gap-1.5"><FlaskConical size={12} aria-hidden="true" />Experimentos relacionados</Rotulo>
                  <p className="mt-2 flex flex-wrap gap-2">{exps.map((x) => <BotonLink key={x} href="/admin/tarot/inteligencia/experimentos" tamano="sm" variante="ia">{x} <ArrowRight size={13} aria-hidden="true" /></BotonLink>)}</p>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5 text-[12.5px] text-gray-400 md:flex-row md:flex-wrap md:items-center md:gap-x-4">
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">Viene de:
              {fuentes.map((f) => <Link key={f.nombre + f.ref} href={f.enlace as Route<string>} className="inline-flex items-center gap-1 font-medium text-sky-300 hover:text-sky-200 hover:underline">{f.nombre}{r.fuentes.filter((x) => x.nombre === f.nombre).length > 1 ? ` (${r.fuentes.filter((x) => x.nombre === f.nombre).length})` : ""}<ExternalLink size={11} aria-hidden="true" /></Link>)}
            </span>
            <span>Prioridad {r.prioridad}/100: {r.prioridad_motivo.join(" · ")}</span>
          </div>
          <div className="border-t border-white/[0.06] pt-4">
            {r.clave.startsWith("experimento:")
              ? <BotonLink href="/admin/tarot/inteligencia/experimentos" variante="ia" icono={FlaskConical}>Abrir {r.fuentes[0]?.nombre} en Acciones y experimentos</BotonLink>
              : <BarraDecision r={r} alListo={alListo} vieja={vieja} />}
          </div>
        </div>
      )}
    </article>
  );
}

// ── Problema económico ──────────────────────────────────────────────────────
function TarjetaProblema({ p, alListo, abierta, alternar, irA }: { p: Problema; alListo: (t: string) => void; abierta: boolean; alternar: () => void; irA: (v: Vista) => void }) {
  const r = p.r;
  return (
    <article id={`r-${r.clave}`} className="scroll-mt-24 overflow-hidden rounded-xl border border-rose-400/20 bg-gradient-to-br from-rose-400/[0.06] to-transparent">
      <div className="p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2"><Insignia tono="negativo" icono={ShieldAlert}>Problema económico</Insignia><Insignia tono={EVIDENCIA[r.evidencia].tono}>Confianza: {EVIDENCIA[r.evidencia].t.toLowerCase()}</Insignia></div>
        <h3 className="mt-2.5 text-[18px] font-semibold tracking-[-0.015em] text-gray-50">{r.titulo}</h3>
        <p className="mt-1 max-w-[80ch] text-[14px] leading-relaxed text-gray-300">{r.que_pasa}</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="rounded-lg bg-black/20 p-3.5">
            <Rotulo>Postura recomendada</Rotulo>
            <p className="mt-1 text-[14px] leading-relaxed text-gray-100">{r.accion}</p>
          </div>
          <div className="rounded-lg bg-black/20 p-3.5">
            <Rotulo>Palancas que lo atacan</Rotulo>
            {p.palancas.length === 0 ? <p className="mt-1 text-[13.5px] text-gray-400">No hay recomendaciones abiertas sobre tráfico, página, checkout u oferta.</p> : (
              <ul className="mt-2 space-y-1.5">
                {p.palancas.map((x) => (
                  <li key={x.area} className="flex items-center justify-between gap-3 text-[13.5px]">
                    <span className="text-gray-200">{x.nombre}</span>
                    <span className="flex shrink-0 items-center gap-3 tabular-nums">
                      {x.ejecutables > 0 && <span className="text-gray-100">{x.ejecutables} {x.ejecutables === 1 ? "ejecutable" : "ejecutables"}</span>}
                      {x.bloqueadas > 0 && <span className="inline-flex items-center gap-1 text-amber-200"><Lock size={12} aria-hidden="true" />{x.bloqueadas}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {p.bloqueadas > 0 && <button type="button" onClick={() => irA("bloqueadas")} className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-sky-300 hover:text-sky-200">Ver las {p.bloqueadas} bloqueadas <ArrowRight size={13} aria-hidden="true" /></button>}
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.06]">
        <button type="button" onClick={alternar} aria-expanded={abierta} className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-[13.5px] font-medium text-gray-200 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 md:px-5">
          <span className="flex-1">{abierta ? "Ocultar detalle y decisión" : "Ver detalle y decidir"}</span><ChevronDown size={16} aria-hidden="true" className={`text-gray-400 transition-transform ${abierta ? "rotate-180" : ""}`} />
        </button>
        {abierta && (
          <div className="space-y-4 px-4 pb-5 md:px-5">
            <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
              <Seccioncita t="Por qué importa">{r.por_que_importa}</Seccioncita>
              <Seccioncita t="Criterio de éxito">{r.resultado_esperado} {r.como_medir}</Seccioncita>
              <Seccioncita t="Evidencia">{r.evidencia_motivo} <span className="text-gray-400">({periodoDe(r)})</span></Seccioncita>
              <Seccioncita t="Principio comercial">{r.principio}</Seccioncita>
            </div>
            <BarraDecision r={r} alListo={alListo} />
          </div>
        )}
      </div>
    </article>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function RecomendacionesPage() {
  const { d, error, cargando, cargar, actualizado } = useVista<Bandeja>("recomendaciones");
  const { nodo, avisar } = useNotificacion();
  const [vista, setVista] = useState<Vista>("decidir");
  const [sub, setSub] = useState<SubDecididas>("marcha");
  const [canal, setCanal] = useState("todos");
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [archivando, setArchivando] = useState(false);
  const alternar = (k: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const alListo = useCallback((t: string, tono: Tono = "positivo") => { avisar(t, tono); cargar(); }, [avisar, cargar]);

  const c = useMemo(() => (d ? clasificar(d, (r) => canal === "todos" || r.canal === canal) : null), [d, canal]);
  const canales = useMemo(() => (d ? Array.from(new Set([...d.para_decidir, ...d.esperando, ...d.aceptadas, ...d.pospuestas].map((x) => x.canal))) : []), [d]);

  // Enlace directo desde el Centro de control: ?r=<clave> abre esa recomendación.
  const [destino, setDestino] = useState<string | null>(null);
  useEffect(() => { const k = new URLSearchParams(window.location.search).get("r"); if (k) setDestino(k); }, []);
  useEffect(() => {
    if (!destino || !c) return;
    const en = (xs: Recomendacion[]) => xs.some((x) => x.clave === destino);
    const v: Vista | null = en(c.problemas.map((p) => p.r)) || en(c.ejecutables) ? "decidir" : en(c.bloqueadas) ? "bloqueadas" : en(c.revalidar) ? "revalidar" : en(c.esperando) ? "esperando" : en(c.aceptadas) || en(c.pospuestas) ? "decididas" : null;
    if (v) { setVista(v); setAbiertas(new Set([destino])); setTimeout(() => document.getElementById(`r-${destino}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120); }
    setDestino(null);
  }, [destino, c]);

  async function archivarViejas() {
    if (!c?.revalidar.length || !window.confirm(`¿Marcar las ${c.revalidar.length} recomendaciones viejas como «ya no aplica»? Quedan en Decididas y se pueden reabrir.`)) return;
    setArchivando(true);
    try {
      for (const r of c.revalidar) await enviarIC({ accion: "decidir", clave: r.clave, estado: "no_aplica", nota: `Vieja (del ${fechaDia(r.fecha)}): archivada sin revisar desde la bandeja.`, titulo: r.titulo, canal: r.canal, refs: refsDe(r) });
      alListo(`Se archivaron ${c.revalidar.length} recomendaciones viejas.`);
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), "negativo"); } finally { setArchivando(false); }
  }

  const nDecidir = c ? c.problemas.length + c.ejecutables.length : 0;
  const nDecididas = c && d ? c.aceptadas.length + c.pospuestas.length + d.decididas.length : 0;
  const resumen: { id: Vista; t: string; n: number; icono: LucideIcon; tono: Tono; sub: string }[] = c && d ? [
    { id: "bloqueadas", t: "Bloqueadas", n: c.bloqueadas.length, icono: Lock, tono: "alerta", sub: "Chocan con un experimento en curso" },
    { id: "esperando", t: "Esperando evidencia", n: c.esperando.length, icono: Hourglass, tono: "info", sub: "Faltan datos para decidir" },
    { id: "revalidar", t: "Para revalidar", n: c.revalidar.length, icono: Clock, tono: "neutro", sub: "Más de 14 días sin decidir" },
    { id: "decididas", t: "Decididas", n: nDecididas, icono: Check, tono: "positivo", sub: `${c.aceptadas.length} en marcha` },
  ] : [];
  const fila = (r: Recomendacion, i?: number, vieja?: boolean) => <Tarjeta key={r.clave} r={r} puesto={i} problema={c?.problemaDe.get(r.clave)} libera={c?.liberaCuando.get(r.clave)} alListo={alListo} abierta={abiertas.has(r.clave)} alternar={() => alternar(r.clave)} vieja={vieja} />;

  return (
    <Pagina titulo="Recomendaciones" icono={ListChecks} descripcion="Qué decidir ahora, qué espera evidencia y qué está bloqueado por un experimento. Ordenado por lo que mueve la plata; nada se aplica solo."
      acciones={<Actualizar cargando={cargando} onClick={cargar} actualizado={actualizado} />}>
      {nodo}
      {error && <ErrorCarga mensaje={error} reintentar={cargar} />}
      {!d && !error && <EsqueletoPagina />}
      {d && c && (
        <div className={`space-y-6 transition-opacity ${cargando ? "opacity-60" : ""}`}>
          {/* Resumen: lo decidible pesa más que el resto */}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_repeat(4,minmax(0,1fr))]">
            <button type="button" onClick={() => setVista("decidir")} aria-pressed={vista === "decidir"}
              className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 md:p-5 ${vista === "decidir" ? "border-white/20 bg-white/[0.06]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]"}`}>
              <p className="text-[13px] font-medium text-gray-300">Para decidir ahora</p>
              <p className="mt-1.5 text-[36px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-gray-50">{nDecidir}</p>
              <p className="mt-2 text-[13px] text-gray-400">{c.problemas.length > 0 ? `${c.problemas.length} ${c.problemas.length === 1 ? "problema económico" : "problemas económicos"} y ${c.ejecutables.length} ${c.ejecutables.length === 1 ? "acción ejecutable" : "acciones ejecutables"}` : `${c.ejecutables.length} ${c.ejecutables.length === 1 ? "acción ejecutable" : "acciones ejecutables"}`}</p>
            </button>
            <div className="grid grid-cols-2 gap-3 lg:contents">
              {resumen.map((x) => (
                <button key={x.id} type="button" onClick={() => setVista(x.id)} aria-pressed={vista === x.id}
                  className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${vista === x.id ? "border-white/20 bg-white/[0.06]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]"}`}>
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-gray-400"><x.icono size={14} className={x.n > 0 ? TONO[x.tono].fuerte : ""} aria-hidden="true" />{x.t}</p>
                  <p className="mt-1.5 text-[24px] font-semibold leading-none tabular-nums text-gray-100">{x.n}</p>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-gray-400">{x.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {canales.length > 1 && <Segmentado etiqueta="Filtrar por canal" tamano="sm" valor={canal} onChange={setCanal} opciones={[{ id: "todos", t: "Todos los canales" }, ...canales.map((k) => ({ id: k, t: CANAL[k] ?? k }))]} />}
            {d.esperar_google?.esperar && <Insignia tono="alerta" icono={Lock}>Google Ads: el motor pide esperar</Insignia>}
          </div>

          {vista === "decidir" && (
            <div className="space-y-6">
              {c.problemas.map((p) => <TarjetaProblema key={p.r.clave} p={p} alListo={alListo} abierta={abiertas.has(p.r.clave)} alternar={() => alternar(p.r.clave)} irA={setVista} />)}
              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-gray-50">Acciones ejecutables</h2>
                    <p className="text-[13.5px] text-gray-400">Se pueden decidir y hacer ahora. Las marcadas «Coordinar con…» tocan lo mismo que un experimento planificado: no lo bloquean, pero conviene decidir si van antes o dentro del plan.</p>
                  </div>
                </div>
                {c.ejecutables.length === 0 ? <Vacio titulo="Nada ejecutable por ahora" texto="Lo demás está bloqueado por un experimento, espera evidencia o es viejo y hay que revalidarlo." /> : c.ejecutables.map((r, i) => fila(r, i + 1))}
              </section>
            </div>
          )}
          {vista === "bloqueadas" && (
            <section className="space-y-3">
              <Aviso tono="alerta" icono={Lock} titulo="Por qué están bloqueadas">Cambiar algo que un experimento en curso está midiendo impide saber qué funcionó. Cada una dice qué la libera; también se pueden sumar al experimento. Un experimento solo planificado no bloquea: esas recomendaciones siguen en «Para decidir ahora» con un aviso para coordinarlas.</Aviso>
              {c.bloqueadas.length === 0 ? <Vacio titulo="Nada bloqueado" /> : c.bloqueadas.map((r) => fila(r))}
            </section>
          )}
          {vista === "esperando" && (
            <section className="space-y-3">
              <Aviso tono="info" icono={Hourglass} titulo="Esperar también es una decisión">Todavía no hay datos suficientes. Cambiar antes de tiempo es reaccionar al ruido.</Aviso>
              {c.esperando.length === 0 ? <Vacio titulo="Nada esperando evidencia" /> : c.esperando.map((r) => fila(r))}
            </section>
          )}
          {vista === "revalidar" && (
            <section className="space-y-3">
              <Aviso icono={Clock} tono="neutro" titulo="Viejas: más de 14 días sin decidir"
                accion={c.revalidar.length > 0 && <Boton tamano="sm" icono={Archive} cargando={archivando} onClick={archivarViejas}>Archivar todas</Boton>}>
                Se armaron con datos de otro momento. No compiten por atención hasta que confirmes que siguen vigentes; si ya no aplican, archivalas.
              </Aviso>
              {c.revalidar.length === 0 ? <Vacio titulo="Nada para revalidar" /> : c.revalidar.map((r) => fila(r, undefined, true))}
            </section>
          )}
          {vista === "decididas" && (
            <section className="space-y-3">
              <Segmentado etiqueta="Decididas" tamano="sm" valor={sub} onChange={setSub} opciones={[{ id: "marcha", t: "En marcha", n: c.aceptadas.length }, { id: "pospuestas", t: "Pospuestas", n: c.pospuestas.length }, { id: "cerradas", t: "Cerradas", n: d.decididas.length }]} />
              {sub === "marcha" && (c.aceptadas.length === 0 ? <Vacio titulo="Nada aceptado sin terminar" texto="Lo que aceptes aparece acá hasta que lo marques realizado." /> : c.aceptadas.map((r) => fila(r)))}
              {sub === "pospuestas" && (c.pospuestas.length === 0 ? <Vacio titulo="Nada pospuesto" /> : c.pospuestas.map((r) => fila(r)))}
              {sub === "cerradas" && (d.decididas.length === 0 ? <Vacio titulo="Todavía no hay decisiones cerradas" /> : (
                <Panel cuerpo="divide-y divide-white/[0.06]">
                  {d.decididas.map((x) => (
                    <div key={x.clave} className="flex flex-col gap-2 px-4 py-3.5 md:flex-row md:items-center md:justify-between md:gap-4 md:px-5">
                      <div className="min-w-0">
                        <p className="text-[14px] text-gray-100">{x.titulo}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-gray-400">
                          <Insignia tono={x.estado === "hecha" ? "positivo" : "neutro"}>{ESTADO[x.estado]}</Insignia>
                          <span>{fechaDia(x.decidida_at)}</span>{x.canal && <span>· {CANAL[x.canal] ?? x.canal}</span>}{x.nota && <span className="min-w-0">· {x.nota}</span>}
                        </p>
                      </div>
                      <Boton tamano="sm" variante="fantasma" icono={RotateCcw} className="self-start md:self-center" onClick={async () => { try { const r = await enviarIC({ accion: "reabrir", clave: x.clave }); alListo(r.aviso ?? "Volvió a la bandeja."); } catch (e) { avisar(e instanceof Error ? e.message : String(e), "negativo"); } }}>Reabrir</Boton>
                    </div>
                  ))}
                </Panel>
              ))}
            </section>
          )}

          <Desplegable titulo="Cómo se arma esta bandeja" icono={Info} resumen={`${d.fuentes.length} fuentes · ${d.unidas} repetidas unidas`}>
            <ul className="space-y-2">
              {d.fuentes.map((f) => (
                <li key={f.nombre} className="flex items-center gap-2.5 text-[13.5px]">
                  <Punto tono={f.ok ? "positivo" : "negativo"} />
                  <Link href={f.enlace as Route<string>} className="font-medium text-gray-100 hover:underline">{f.nombre}</Link>
                  <span className="text-gray-400">{f.detalle}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] leading-relaxed text-gray-400">Se recalcula cada vez que abrís la pantalla; las herramientas de origen siguen con todo su detalle. La prioridad pesa primero lo que frena pérdidas, después lo que mejora la conversión del tráfico que ya se paga y la medición; baja las viejas, las que probablemente ya se resolvieron y las que chocan con un experimento. Las recomendaciones repetidas se unen y conservan sus fuentes. <Ayuda texto="Confianza: Hecho = comprobado con datos suficientes; Señal = hay datos pero pocos o sin validar; Hipótesis = idea a probar." /></p>
          </Desplegable>
        </div>
      )}
    </Pagina>
  );
}
