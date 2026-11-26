"use client";
import { Fragment, useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, FlaskConical, History, Pencil, Plus, RotateCcw, Search, ThumbsDown, ThumbsUp, X, AlertTriangle } from "lucide-react";
import {
  Pagina, Seccion, Panel, Insignia, Aviso, Vacio, EsqueletoPagina, ErrorCarga, Segmentado, Selector, Boton, BotonLink, Actualizar, Campo, claseCampo, Rotulo, Punto, Enlace,
  useVista, useNotificacion, enviarIC, fechaDia, fechaLarga, type Tono,
} from "@/components/admin/inteligencia/ui";
import type { Recuerdo, Nivel } from "@/lib/inteligencia/memoria";
import type { Experimento, EstadoDecision } from "@/lib/inteligencia/recomendaciones";

// Inteligencia comercial · Resultados y aprendizaje (fase 3; Level Up 2026-11-25).
// Biblioteca de conocimiento comercial: lo que el negocio sabe, con cuánta
// evidencia y con qué alcance; lo que se probó y qué pasó; lo que se decidió
// y por qué. Es la misma memoria que consultan la bandeja, el Analista y el
// Estratega. Lo que deja de valer se conserva con su motivo y su historial.

const NIVEL: Record<Nivel, { t: string; plural: string; tono: Tono; ayuda: string }> = {
  hecho: { t: "Hecho comprobado", plural: "Hechos comprobados", tono: "positivo", ayuda: "Medido con volumen suficiente. Se puede decidir sobre esto, dentro de su alcance." },
  senal: { t: "Señal", plural: "Señales", tono: "alerta", ayuda: "Hay datos, pero pocos o sin validar con un antes y después." },
  hipotesis: { t: "Hipótesis", plural: "Hipótesis", tono: "ia", ayuda: "Idea a probar. Todavía no es conocimiento." },
};
const AREAS: Record<string, string> = { trafico: "Tráfico y anuncios", pagina: "Página", checkout: "Checkout", pago: "Pago", postcompra: "Después de la compra", oferta: "Oferta y precio", medicion: "Medición", otro: "Otro" };
const CANALES: Record<string, string> = { google_ads: "Google Ads", meta_ads: "Meta Ads", seo: "Búsqueda orgánica", social: "Redes", mensajeria: "WhatsApp y email", referidos: "Referidos", directo: "Directo", negocio: "Negocio" };
const ORIGEN: Record<string, string> = { ia: "Analista (IA)", manual: "Manuel", experimento: "Experimento" };
const RESULTADO_EXP: Record<string, { t: string; tono: Tono }> = { exito: { t: "Funcionó", tono: "positivo" }, fracaso: { t: "No funcionó", tono: "negativo" }, sin_evidencia: { t: "Sin evidencia suficiente", tono: "alerta" }, mixto: { t: "Resultado mixto", tono: "alerta" } };
const ESTADO_DEC: Record<EstadoDecision, string> = { aceptada: "Aceptada", descartada: "Descartada", pospuesta: "Pospuesta", hecha: "Hecha", no_aplica: "Ya no aplica", revalidada: "Confirmada vigente" };
const EVENTO: Record<string, string> = { correccion: "Corregido", baja: "Dado de baja", reactivacion: "Reactivado" };
const NIVEL_CONF: Record<string, Nivel> = { alta: "hecho", media: "senal", baja: "hipotesis" };
const ORDEN: Record<Nivel, number> = { hecho: 0, senal: 1, hipotesis: 2 };
const plano = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type Decision = { clave: string; titulo: string; estado: EstadoDecision; nota: string | null; canal: string | null; decidida_at: string };
type Datos = { memoria: Recuerdo[]; experimentos: Experimento[]; decisiones: Decision[] };

// ── Evidencia: período, datos clave y números resaltados ───────────────────
const periodoDe = (t: string | null) => { const m = t ? /Del\s+(\d{1,2}\/\d{1,2})\s+al\s+(\d{1,2}\/\d{1,2})/i.exec(t) : null; return m ? `${m[1]} al ${m[2]}` : null; };
/** Cifras del primer tramo de la evidencia (antes del primer ";" o punto): solo si hay al menos dos, para no mezclar contextos. */
function datosClave(t: string | null): { t: string; v: string }[] {
  if (!t) return [];
  const tramo = t.replace(/^Del\s+\d{1,2}\/\d{1,2}\s+al\s+\d{1,2}\/\d{1,2}:\s*/i, "").split(/;|\.\s+(?=[A-ZÁÉÍÓÚ¿«])/)[0];
  const pats: [string, RegExp][] = [["Visitas", /(\d[\d.]*)\s+visitas/i], ["Clics", /(\d[\d.]*)\s+clics/i], ["Checkouts", /(\d[\d.]*)\s+checkouts?\b/i], ["Ventas", /(\d[\d.]*)\s+(?:ventas?|compras?)\b/i], ["Gasto", /\$U\s?([\d.,]+)\s+de gasto/i]];
  const out = pats.map(([n, re]) => { const m = re.exec(tramo); return m ? { t: n, v: n === "Gasto" ? `$U ${m[1]}` : m[1] } : null; }).filter((x): x is { t: string; v: string } => !!x);
  // Solo cifras del embudo comercial (con visitas o checkouts): "43 clics en descargar el PDF" no es un clic de anuncio.
  return out.length >= 2 && out.some((x) => x.t === "Visitas" || x.t === "Checkouts") ? out : [];
}
function ConNumeros({ texto }: { texto: string }) {
  const partes = texto.split(/(\$U\s?[\d.,]+|US\$\s?[\d.,]+|\d+(?:[.,]\d+)?\s?%|\b\d+(?:[.,]\d+)?\b)/g);
  return <>{partes.map((p, i) => (i % 2 === 1 ? <b key={i} className="font-semibold tabular-nums text-gray-100">{p}</b> : <Fragment key={i}>{p}</Fragment>))}</>;
}

// ── Formulario ──────────────────────────────────────────────────────────────
function Formulario({ inicial, alGuardar, alCancelar, titulo }: { inicial?: Partial<Recuerdo>; alGuardar: (x: Record<string, unknown>) => Promise<void>; alCancelar: () => void; titulo: string }) {
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [nivel, setNivel] = useState<Nivel>(inicial?.nivel ?? "senal");
  const [area, setArea] = useState(inicial?.area ?? "otro");
  const [canal, setCanal] = useState(inicial?.canal ?? "");
  const [resultado, setResultado] = useState(inicial?.resultado ?? "");
  const [evidencia, setEvidencia] = useState(inicial?.evidencia ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const sel = `${claseCampo} [&>option]:bg-gray-900`;
  return (
    <div className="space-y-3.5 rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.1] md:p-5">
      <p className="text-[15px] font-semibold text-gray-50">{titulo}</p>
      <Campo etiqueta="Qué aprendimos" ayuda="Una conclusión, en una o dos frases."><textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={600} className={claseCampo} /></Campo>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Nivel de evidencia"><select value={nivel} onChange={(e) => setNivel(e.target.value as Nivel)} className={sel}>{(Object.keys(NIVEL) as Nivel[]).map((n) => <option key={n} value={n}>{NIVEL[n].t}</option>)}</select></Campo>
        <Campo etiqueta="Categoría"><select value={area} onChange={(e) => setArea(e.target.value)} className={sel}>{Object.entries(AREAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
        <Campo etiqueta="Canal (alcance)"><select value={canal} onChange={(e) => setCanal(e.target.value)} className={sel}><option value="">General</option>{Object.entries(CANALES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
        <Campo etiqueta="¿Se probó?"><select value={resultado ?? ""} onChange={(e) => setResultado(e.target.value)} className={sel}><option value="">No aplica</option><option value="funciono">Funcionó</option><option value="no_funciono">No funcionó</option></select></Campo>
      </div>
      <Campo etiqueta="Evidencia" ayuda="Con qué datos y de qué período (ej.: «Del 27/10 al 03/11: 136 visitas, 0 ventas…»)."><textarea value={evidencia} onChange={(e) => setEvidencia(e.target.value)} rows={2} maxLength={1000} className={claseCampo} /></Campo>
      {nivel === "hecho" && !canal && !periodoDe(evidencia) && <Aviso tono="alerta" icono={AlertTriangle}>Un hecho necesita alcance: indicá el canal o el período de los datos, para no convertir una observación chica en una verdad general.</Aviso>}
      {error && <p className="text-[13px] text-rose-300" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton variante="primario" cargando={enviando} onClick={async () => { setEnviando(true); setError(null); try { await alGuardar({ texto, nivel, area, canal: canal || null, resultado: resultado || null, evidencia }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setEnviando(false); } }}>Guardar</Boton>
        <Boton variante="fantasma" onClick={alCancelar}>Cancelar</Boton>
      </div>
    </div>
  );
}

// ── Tarjeta de conocimiento ─────────────────────────────────────────────────
function TarjetaConocimiento({ m, alListo }: { m: Recuerdo; alListo: (t: string, tono?: Tono) => void }) {
  const [modo, setModo] = useState<null | "editar" | "baja">(null);
  const [verEv, setVerEv] = useState(false);
  const [verHist, setVerHist] = useState(false);
  const [motivo, setMotivo] = useState("");
  const n = NIVEL[m.nivel];
  const periodo = periodoDe(m.evidencia);
  const datos = datosClave(m.evidencia);
  const sinAlcance = m.nivel === "hecho" && !m.canal && !periodo;
  if (modo === "editar") return <Formulario titulo="Corregir aprendizaje" inicial={m} alCancelar={() => setModo(null)} alGuardar={async (x) => { await enviarIC({ accion: "memoria_editar", id: m.id, ref: m.ref, ...x }); setModo(null); alListo("Corregido. La versión anterior quedó en el historial."); }} />;
  return (
    <article className={`flex min-w-0 flex-col rounded-xl border bg-white/[0.02] ${m.activo ? "border-white/[0.07]" : "border-dashed border-white/[0.1] opacity-80"}`}>
      <div className="flex-1 space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Insignia tono={n.tono}>{n.t}</Insignia>
          {m.resultado === "funciono" && <Insignia tono="positivo" icono={ThumbsUp}>Funcionó</Insignia>}
          {m.resultado === "no_funciono" && <Insignia tono="negativo" icono={ThumbsDown}>No funcionó</Insignia>}
          {!m.activo && <Insignia>Dejó de valer</Insignia>}
          {sinAlcance && <Insignia tono="alerta" icono={AlertTriangle}>Sin alcance definido</Insignia>}
        </div>
        <p className="text-[15px] font-medium leading-snug text-gray-50">{m.texto}</p>
        {datos.length > 0 && (
          <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {datos.map((x) => <div key={x.t} className="rounded-md bg-white/[0.035] px-2.5 py-2"><dt className="text-[11.5px] text-gray-400">{x.t}</dt><dd className="text-[15px] font-semibold tabular-nums text-gray-50">{x.v}</dd></div>)}
          </dl>
        )}
        <dl className="grid gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
          <div><dt className="inline text-gray-400">Alcance: </dt><dd className="inline text-gray-200">{m.canal ? CANALES[m.canal] ?? m.canal : "General"}{periodo ? ` · ${periodo}` : ""}</dd></div>
          <div><dt className="inline text-gray-400">Categoría: </dt><dd className="inline text-gray-200">{AREAS[m.area] ?? m.area}</dd></div>
          <div><dt className="inline text-gray-400">Origen: </dt><dd className="inline text-gray-200">{ORIGEN[m.origen] ?? m.origen}{m.ref ? ` · ${m.ref}` : ""}</dd></div>
          <div><dt className="inline text-gray-400">Actualizado: </dt><dd className="inline tabular-nums text-gray-200">{fechaDia(m.updated_at)}</dd></div>
        </dl>
        {!m.activo && m.motivo_baja && <p className="rounded-md bg-white/[0.03] px-3 py-2 text-[13px] text-gray-300"><span className="text-gray-400">Dejó de valer: </span>{m.motivo_baja}</p>}
        {m.evidencia && (
          <div>
            <button type="button" onClick={() => setVerEv(!verEv)} aria-expanded={verEv} className="inline-flex min-h-[32px] items-center gap-1 rounded text-[13px] font-medium text-sky-300 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70">Evidencia completa<ChevronDown size={14} aria-hidden="true" className={`transition-transform ${verEv ? "rotate-180" : ""}`} /></button>
            {verEv && <p className="mt-1 text-[13.5px] leading-relaxed text-gray-400"><ConNumeros texto={m.evidencia} /></p>}
          </div>
        )}
        {(m.historial?.length ?? 0) > 0 && (
          <div>
            <button type="button" onClick={() => setVerHist(!verHist)} aria-expanded={verHist} className="inline-flex min-h-[32px] items-center gap-1 rounded text-[13px] font-medium text-gray-300 hover:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"><History size={13} aria-hidden="true" />Historial ({m.historial!.length})<ChevronDown size={14} aria-hidden="true" className={`transition-transform ${verHist ? "rotate-180" : ""}`} /></button>
            {verHist && (
              <ol className="mt-1.5 space-y-2 border-l border-white/[0.08] pl-3">
                {m.historial!.map((h, i) => <li key={i} className="text-[13px] text-gray-400"><span className="tabular-nums text-gray-300">{fechaDia(h.at)}</span> · {EVENTO[h.evento] ?? h.evento}{h.motivo ? ` (${h.motivo})` : ""}. Antes decía: «{h.texto}» ({NIVEL[NIVEL_CONF[h.confianza] ?? "hipotesis"].t.toLowerCase()})</li>)}
              </ol>
            )}
          </div>
        )}
        {modo === "baja" && (
          <div className="space-y-2 rounded-lg bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.08]">
            <Campo etiqueta="Por qué deja de valer (queda guardado)"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={600} className={claseCampo} placeholder="Ej.: un dato nuevo lo contradice" /></Campo>
            <div className="flex gap-2">
              <Boton tamano="sm" variante="primario" onClick={async () => { try { await enviarIC({ accion: "memoria_baja", id: m.id, motivo }); alListo("Dado de baja. Se conserva con su motivo."); } catch (e) { alListo(e instanceof Error ? e.message : String(e), "negativo"); } }}>Confirmar</Boton>
              <Boton tamano="sm" variante="fantasma" onClick={() => setModo(null)}>Cancelar</Boton>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-white/[0.06] px-3 py-2">
        <Boton tamano="sm" variante="fantasma" icono={Pencil} onClick={() => setModo("editar")}>Corregir</Boton>
        {m.activo
          ? <Boton tamano="sm" variante="fantasma" icono={X} onClick={() => setModo(modo === "baja" ? null : "baja")}>Ya no vale</Boton>
          : <Boton tamano="sm" variante="fantasma" icono={RotateCcw} onClick={async () => { try { await enviarIC({ accion: "memoria_reactivar", id: m.id }); alListo("Vuelve a estar vigente."); } catch (e) { alListo(e instanceof Error ? e.message : String(e), "negativo"); } }}>Volver a darlo por válido</Boton>}
      </div>
    </article>
  );
}

// ── Resultado de un experimento ─────────────────────────────────────────────
function ResultadoExperimento({ e }: { e: Experimento }) {
  const k = e.kpis.find((x) => x.clave.startsWith("costo_venta")) ?? e.kpis[0];
  const r = e.resultado ? RESULTADO_EXP[e.resultado] : null;
  const vivo = e.estado === "planificado" || e.estado === "activo";
  const base = (e.linea_base as { medida?: { ventas: number; clics: number | null; visitas: number } } | null)?.medida;
  return (
    <Panel cuerpo="p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono="ia" icono={FlaskConical}>{e.id}</Insignia>
        {r ? <Insignia tono={r.tono}>{r.t}</Insignia> : <Insignia tono={vivo ? "info" : "neutro"}>{e.estado === "planificado" ? "Planificado, sin aplicar" : e.estado === "activo" ? "En curso: sin resultado todavía" : "Cancelado"}</Insignia>}
        <span className="text-[13px] text-gray-400">{CANALES[e.canal] ?? e.canal}{e.aplicado_desde ? ` · aplicado el ${fechaDia(e.aplicado_desde)}` : ""}</span>
      </div>
      <h3 className="mt-2.5 text-[16px] font-semibold text-gray-50">{e.nombre}</h3>
      <dl className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-3">
        <div><dt className="text-[12.5px] text-gray-400">Qué se probó</dt><dd className="mt-0.5 line-clamp-3 text-[13.5px] leading-relaxed text-gray-200">{e.hipotesis}</dd></div>
        <div><dt className="text-[12.5px] text-gray-400">Qué esperábamos</dt><dd className="mt-0.5 text-[13.5px] leading-relaxed text-gray-200">{k ? <>{k.nombre}: <b className="font-semibold text-emerald-200">{k.esperado}</b></> : "Sin indicador definido"}</dd></div>
        <div><dt className="text-[12.5px] text-gray-400">Qué ocurrió</dt><dd className="mt-0.5 text-[13.5px] leading-relaxed text-gray-200">{e.conclusion ?? (vivo ? "Todavía no hay resultado." : "Sin conclusión registrada.")}</dd></div>
      </dl>
      {(base || e.aprendizaje) && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {base && <p className="rounded-md bg-white/[0.03] px-3 py-2 text-[13px] text-gray-300"><span className="text-gray-400">Línea base congelada: </span>{base.clics ?? "—"} clics · {base.visitas} visitas · {base.ventas} {base.ventas === 1 ? "venta" : "ventas"}</p>}
          {e.aprendizaje && <p className="rounded-md bg-white/[0.03] px-3 py-2 text-[13px] text-gray-200"><span className="text-gray-400">Aprendizaje registrado: </span>{e.aprendizaje}</p>}
        </div>
      )}
      <p className="mt-3 text-[12.5px] leading-relaxed text-gray-400">{vivo ? <>Se sigue en <Enlace href="/admin/tarot/inteligencia/experimentos">Acciones y experimentos</Enlace>.</> : "Un resultado observado es atribuible al experimento solo si no hubo otros cambios en el período (lo indica su ficha)."}</p>
    </Panel>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function AprendizajePage() {
  const { d, error, cargando, cargar, actualizado } = useVista<Datos>("aprendizaje");
  const { nodo, avisar } = useNotificacion();
  const alListo = (t: string, tono: Tono = "positivo") => { avisar(t, tono); if (tono !== "negativo") cargar(); };
  const [agregando, setAgregando] = useState<null | Partial<Recuerdo>>(null);
  const [nivel, setNivel] = useState<"todos" | Nivel>("todos");
  const [vigencia, setVigencia] = useState<"vigentes" | "bajas">("vigentes");
  const [canal, setCanal] = useState("todos");
  const [area, setArea] = useState("todas");
  const [busca, setBusca] = useState("");

  const memoria = useMemo(() => d?.memoria ?? [], [d]);
  const vigentes = memoria.filter((m) => m.activo);
  const enVigencia = (m: Recuerdo) => (vigencia === "vigentes" ? m.activo : !m.activo);
  const lista = useMemo(() => {
    const q = plano(busca.trim());
    return memoria.filter((m) => (vigencia === "vigentes" ? m.activo : !m.activo) && (nivel === "todos" || m.nivel === nivel) && (canal === "todos" || (canal === "general" ? !m.canal : m.canal === canal)) && (area === "todas" || m.area === area)
      && (!q || plano(`${m.texto} ${m.evidencia ?? ""}`).includes(q)))
      .sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel] || b.updated_at.localeCompare(a.updated_at));
  }, [memoria, vigencia, nivel, canal, area, busca]);
  const exps = d?.experimentos ?? [];
  const cerrados = exps.filter((e) => e.estado === "cerrado");
  const dec = d?.decisiones ?? [];
  const conMotivo = dec.filter((x) => (x.estado === "descartada" || x.estado === "no_aplica") && x.nota && !/^Vieja \(/.test(x.nota));
  const hechas = dec.filter((x) => x.estado === "hecha");
  const cuenta = (n: Nivel) => vigentes.filter((m) => m.nivel === n).length;
  const total = Math.max(vigentes.length, 1);
  const destacados = vigentes.filter((m) => m.nivel === "hecho").slice(0, 2);
  const canalesPresentes = Array.from(new Set(memoria.map((m) => m.canal).filter((c): c is string => !!c)));
  const abrirNuevo = (inicial: Partial<Recuerdo>) => { setAgregando(inicial); setTimeout(() => document.getElementById("nuevo")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); };

  return (
    <Pagina titulo="Resultados y aprendizaje" icono={BookOpen} descripcion="Lo que el negocio ya sabe, con cuánta evidencia y con qué alcance; lo que se probó y lo que se decidió. Es la memoria que consultan la bandeja, el Analista y el Estratega."
      acciones={<><Actualizar cargando={cargando} onClick={cargar} actualizado={actualizado} /><Boton tamano="sm" variante="primario" icono={Plus} onClick={() => abrirNuevo({})}>Agregar aprendizaje</Boton></>}>
      {nodo}
      {error && <ErrorCarga mensaje={error} reintentar={cargar} />}
      {!d && !error && <EsqueletoPagina />}
      {d && (
        <div className={`space-y-8 transition-opacity md:space-y-10 ${cargando ? "opacity-60" : ""}`}>
          {/* Resumen: protagonismo a lo aprendido */}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Panel cuerpo="p-5 md:p-6">
              <Rotulo>Lo que sabe el negocio</Rotulo>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2"><span className="text-[36px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-gray-50">{vigentes.length}</span><span className="text-[14px] text-gray-400">aprendizajes vigentes{memoria.length > vigentes.length ? ` · ${memoria.length - vigentes.length} dejaron de valer` : ""}</span></p>
              <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${cuenta("hecho")} hechos, ${cuenta("senal")} señales, ${cuenta("hipotesis")} hipótesis`}>
                <div className="bg-emerald-400" style={{ width: `${(cuenta("hecho") / total) * 100}%` }} />
                <div className="border-l-2 border-[#0b0f17] bg-amber-400" style={{ width: `${(cuenta("senal") / total) * 100}%` }} />
                <div className="border-l-2 border-[#0b0f17] bg-violet-400" style={{ width: `${(cuenta("hipotesis") / total) * 100}%` }} />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
                {(Object.keys(NIVEL) as Nivel[]).map((n) => <span key={n} className="inline-flex items-center gap-1.5 text-gray-300"><Punto tono={NIVEL[n].tono} /><b className="font-semibold tabular-nums text-gray-50">{cuenta(n)}</b> {NIVEL[n].plural.toLowerCase()}</span>)}
              </div>
              {destacados.length > 0 && (
                <div className="mt-5 space-y-3">
                  {destacados.map((m) => (
                    <blockquote key={m.id} className="border-l-2 border-emerald-400/60 pl-3.5">
                      <p className="text-[14.5px] font-medium leading-snug text-gray-100">{m.texto}</p>
                      <p className="mt-1 text-[12.5px] text-gray-400">Hecho comprobado · {m.canal ? CANALES[m.canal] ?? m.canal : "general"}{periodoDe(m.evidencia) ? ` · ${periodoDe(m.evidencia)}` : ""}</p>
                    </blockquote>
                  ))}
                </div>
              )}
            </Panel>
            <div className="grid grid-cols-2 gap-3">
              {[
                { t: "Experimentos cerrados", v: cerrados.length, s: `${exps.filter((e) => e.estado === "planificado" || e.estado === "activo").length} en curso o planificados` },
                { t: "Favorables", v: exps.filter((e) => e.resultado === "exito").length, s: "Funcionaron", tono: "positivo" as Tono },
                { t: "Desfavorables", v: exps.filter((e) => e.resultado === "fracaso").length, s: "No funcionaron: también enseñan", tono: "negativo" as Tono },
                { t: "Sin evidencia suficiente", v: exps.filter((e) => e.resultado === "sin_evidencia" || e.resultado === "mixto").length, s: "O con resultado mixto", tono: "alerta" as Tono },
                { t: "Decisiones tomadas", v: dec.length, s: `${hechas.length} realizadas · ${conMotivo.length} descartadas con motivo` },
                { t: "Hipótesis por validar", v: cuenta("hipotesis"), s: "Ideas que todavía no son conocimiento", tono: "ia" as Tono },
              ].map((x) => (
                <div key={x.t} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 md:p-4">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-gray-400">{x.tono && <Punto tono={x.v > 0 ? x.tono : "neutro"} />}{x.t}</p>
                  <p className="mt-1 text-[24px] font-semibold leading-none tabular-nums text-gray-50">{x.v}</p>
                  <p className="mt-1.5 text-[12px] leading-snug text-gray-400">{x.s}</p>
                </div>
              ))}
            </div>
          </div>

          <Seccion titulo="Resultados de los experimentos" icono={FlaskConical} descripcion="Qué se probó, qué se esperaba y qué pasó. Al cerrar un experimento su conclusión entra sola a la memoria: como hecho solo si se juzgó con el volumen mínimo.">
            {exps.length === 0 ? <Vacio icono={FlaskConical} titulo="Todavía no hay experimentos" /> : <div className="space-y-3">{exps.map((e) => <ResultadoExperimento key={e.id} e={e} />)}</div>}
          </Seccion>

          <Seccion id="biblioteca" titulo="Biblioteca de conocimiento" icono={BookOpen} descripcion="Cada aprendizaje con su nivel de evidencia, su alcance y su historial. Se puede corregir o dar de baja sin perder lo anterior.">
            <div id="nuevo" className="scroll-mt-24" />
            {agregando && <Formulario titulo="Nuevo aprendizaje" inicial={agregando} alCancelar={() => setAgregando(null)} alGuardar={async (x) => { await enviarIC({ accion: "memoria_crear", ...x }); setAgregando(null); alListo("Aprendizaje guardado."); }} />}
            <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center">
              <Segmentado etiqueta="Nivel de evidencia" tamano="sm" valor={nivel} onChange={setNivel} opciones={[{ id: "todos" as const, t: "Todos", n: memoria.filter(enVigencia).length }, ...(Object.keys(NIVEL) as Nivel[]).map((n) => ({ id: n, t: NIVEL[n].plural, n: memoria.filter((m) => m.nivel === n && enVigencia(m)).length, tono: NIVEL[n].tono }))]} />
              <div className="flex flex-wrap items-center gap-2">
                <Selector etiqueta="Canal" valor={canal} onChange={setCanal} opciones={[{ id: "todos", t: "Todos los canales" }, { id: "general", t: "General" }, ...canalesPresentes.map((c) => ({ id: c, t: CANALES[c] ?? c }))]} />
                <Selector etiqueta="Categoría" valor={area} onChange={setArea} opciones={[{ id: "todas", t: "Todas las categorías" }, ...Array.from(new Set(memoria.map((m) => m.area))).map((a) => ({ id: a, t: AREAS[a] ?? a }))]} />
                <Segmentado etiqueta="Vigencia" tamano="sm" valor={vigencia} onChange={setVigencia} opciones={[{ id: "vigentes" as const, t: "Vigentes" }, { id: "bajas" as const, t: "Dejaron de valer", n: memoria.length - vigentes.length }]} />
              </div>
              <label className="relative min-w-0 xl:ml-auto xl:w-64">
                <span className="sr-only">Buscar en la memoria</span>
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar en la memoria…" className={`${claseCampo} min-h-[38px] pl-9 text-[13.5px]`} />
              </label>
            </div>
            {nivel !== "todos" && <p className="text-[13px] text-gray-400">{NIVEL[nivel].ayuda}</p>}
            {lista.length === 0 ? <Vacio icono={BookOpen} titulo="Nada con estos filtros" texto="Probá con otro nivel, canal o categoría." /> : (
              <div className="grid gap-3 md:grid-cols-2">{lista.map((m) => <TarjetaConocimiento key={m.id} m={m} alListo={alListo} />)}</div>
            )}
          </Seccion>

          <Seccion titulo="Lo que se decidió y por qué" icono={Check} descripcion="Las decisiones con su motivo también son conocimiento: evitan volver a proponer lo que ya se descartó.">
            {dec.length === 0 ? <Vacio titulo="Todavía no hay decisiones" texto="Se toman en Recomendaciones." accion={<BotonLink href="/admin/tarot/inteligencia/recomendaciones" tamano="sm">Ir a Recomendaciones</BotonLink>} /> : (
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel titulo={`Realizadas (${hechas.length})`} cuerpo="divide-y divide-white/[0.06]">
                  {hechas.length === 0 ? <p className="px-4 py-3.5 text-[13.5px] text-gray-400 md:px-5">Ninguna todavía.</p> : hechas.map((x) => <div key={x.clave} className="px-4 py-3 text-[13.5px] md:px-5"><p className="text-gray-100">{x.titulo}</p><p className="mt-0.5 text-[12.5px] text-gray-400">{fechaLarga(x.decidida_at)}{x.nota ? ` · ${x.nota}` : ""}</p></div>)}
                </Panel>
                <Panel titulo={`Descartadas con motivo (${conMotivo.length})`} cuerpo="divide-y divide-white/[0.06]">
                  {conMotivo.length === 0 ? <p className="px-4 py-3.5 text-[13.5px] text-gray-400 md:px-5">Ninguna todavía.</p> : conMotivo.map((x) => (
                    <div key={x.clave} className="flex flex-col gap-2 px-4 py-3 md:px-5">
                      <div className="text-[13.5px]"><p className="text-gray-100">{x.titulo}</p><p className="mt-0.5 text-gray-400">{ESTADO_DEC[x.estado]} el {fechaDia(x.decidida_at)}: {x.nota}</p></div>
                      <Boton tamano="sm" variante="fantasma" icono={Plus} className="self-start" onClick={() => abrirNuevo({ texto: `${x.titulo}: ${x.nota}`.slice(0, 600), nivel: "senal", area: "otro", canal: x.canal && x.canal !== "negocio" ? x.canal : null })}>Guardar como aprendizaje</Boton>
                    </div>
                  ))}
                </Panel>
              </div>
            )}
            {dec.some((x) => x.nota && /^Vieja \(/.test(x.nota)) && <p className="text-[12.5px] text-gray-400">Las recomendaciones viejas archivadas sin revisar no se listan: no tienen un motivo que enseñe algo.</p>}
          </Seccion>
        </div>
      )}
    </Pagina>
  );
}
