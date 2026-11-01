"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, ChevronDown, Database, FileSpreadsheet, FlaskConical, Lightbulb, Search, Settings2, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Analista de conversión (2026-11-01): informes a demanda escritos por IA
// sobre por qué la gente entra y no compra, con recomendaciones priorizadas.
// La configuración (modelo, datos que analiza, bitácora, CSVs de Meta) está
// en /admin/tarot/analista/config.

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
    if (j?.ok) setAbierto(j.informe);
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

            {c && abierto && <VistaInforme inf={abierto} c={c} onDatos={mostrarDatos} verDatos={verDatos} />}
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
            <p className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-800">Informes anteriores</p>
            <div className="divide-y divide-gray-800/70 max-h-[70vh] overflow-y-auto">
              {(datos?.historial ?? []).length === 0 && <p className="px-4 py-5 text-xs text-gray-500">Sin informes todavía.</p>}
              {(datos?.historial ?? []).map((h) => {
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

function VistaInforme({ inf, c, onDatos, verDatos }: { inf: Informe; c: Contenido; onDatos: () => void; verDatos: unknown }) {
  const est = ESTADO[c.estado] ?? ESTADO.atencion;
  const recs = [...c.recomendaciones].sort((a, b) => a.prioridad - b.prioridad);
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
          {recs.map((r, i) => <Recomendacion key={i} r={r} abierta={i === 0} />)}
        </div>
      </section>

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

function Recomendacion({ r, abierta }: { r: Contenido["recomendaciones"][number]; abierta: boolean }) {
  const [open, setOpen] = useState(abierta);
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
          </div>
        </div>
        <ChevronDown size={15} className={`mt-1 shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pl-[52px] space-y-2 text-[12.5px] leading-relaxed">
          <p className="text-gray-300"><span className="text-gray-500">Por qué: </span>{r.por_que}</p>
          <p className="text-gray-200 whitespace-pre-line"><span className="text-gray-500">Cómo: </span>{r.como_hacerlo}</p>
          <p className="text-gray-300"><span className="text-gray-500">Cómo saber si funcionó: </span>{r.como_medir}</p>
        </div>
      )}
    </div>
  );
}
