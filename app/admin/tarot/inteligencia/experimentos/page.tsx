"use client";
import { useMemo, useState } from "react";
import {
  AlertTriangle, BookOpen, Check, CheckCircle2, ExternalLink, FlaskConical, GitCommit, Globe, History, Layers, ListChecks, Lock, Megaphone, Radar, Scale, Settings2, Tag, Target, type LucideIcon,
} from "lucide-react";
import {
  Pagina, Seccion, Panel, Insignia, Aviso, Vacio, EsqueletoPagina, ErrorCarga, Desplegable, Segmentado, Boton, BotonLink, Actualizar, Campo, claseCampo, Rotulo, Barra, Punto, Enlace,
  useVista, useNotificacion, enviarIC, fechaDia, fechaHora, fechaLarga, porcentaje, type Tono,
} from "@/components/admin/inteligencia/ui";
import type { ExperimentoMedido, CambioRegistrado, TipoCambio } from "@/lib/inteligencia/experimentos";

// Inteligencia comercial · Acciones y experimentos (fase 2; Level Up 2026-11-25).
// Cada experimento con una ficha ejecutiva (dónde está en su ciclo, contra qué
// se mide, cuánta evidencia hay y cuál es la próxima decisión) y la
// metodología completa a pedido. Debajo, lo que se decidió hacer y la línea de
// tiempo de todo lo que cambió (para saber qué pudo influir en un resultado).

const CANAL: Record<string, string> = { google_ads: "Google Ads", meta_ads: "Meta Ads", pagina: "Página", checkout: "Checkout", oferta: "Oferta y precio", publicidad: "Publicidad", negocio: "Negocio" };
const RESULTADO: Record<string, { t: string; tono: Tono }> = { exito: { t: "Funcionó", tono: "positivo" }, fracaso: { t: "No funcionó", tono: "negativo" }, sin_evidencia: { t: "Sin evidencia suficiente", tono: "alerta" }, mixto: { t: "Resultado mixto", tono: "alerta" } };
const ETAPAS = ["Planificado", "Aplicado", "En medición", "En evaluación", "Cerrado"];
const etapa = (e: ExperimentoMedido) => (e.estado === "planificado" ? 0 : e.estado === "cerrado" || e.estado === "cancelado" ? 4 : e.evaluacion === "listo_para_juzgar" ? 3 : 2);
const METRICA: Record<string, string> = { clics: "clics", visitas: "visitas", checkout: "llegadas al checkout", ventas: "ventas" };

function formato(v: number | null, f: string) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (f === "usd") return `US$ ${v.toFixed(2).replace(".", ",")}`;
  if (f === "pesos") return `$ ${Math.round(v).toLocaleString("es-UY")}`;
  if (f === "pct") return `${v.toFixed(1).replace(".", ",")} %`;
  if (f === "entero") return Math.round(v).toLocaleString("es-UY");
  return v.toFixed(1).replace(".", ",");
}
/** Rango esperado a partir del texto del plan ("~7–9", "US$12–17 (meta ≤ US$15)", "4–6"). */
function rango(t: string): { lo: number; hi: number } | null {
  const n = (t.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));
  if (!n.length) return null;
  return n.length >= 2 ? { lo: Math.min(n[0], n[1]), hi: Math.max(n[0], n[1]) } : { lo: n[0], hi: n[0] };
}
const principal = (e: ExperimentoMedido) => e.indicadores.find((k) => k.clave.startsWith("costo_venta")) ?? e.indicadores.find((k) => k.clave === "ventas_100_clics") ?? e.indicadores[0] ?? null;

function proximaDecision(e: ExperimentoMedido): { texto: string; tono: Tono } {
  const dias = e.fin_previsto ? Math.ceil((new Date(`${e.fin_previsto}T23:59:59-03:00`).getTime() - Date.now()) / 86_400_000) : null;
  if (e.estado === "planificado") return { texto: `Aplicar el plan en la cuenta y marcar la fecha${dias != null ? ` (quedan ${Math.max(dias, 0)} ${dias === 1 ? "día" : "días"} hasta el fin previsto)` : ""}, o cancelarlo.`, tono: "alerta" };
  if (e.evaluacion === "juntando_datos" && e.volumen) return { texto: `Esperar: faltan ${Math.max(Math.ceil(e.volumen.minimo - e.volumen.actual), 0)} ${METRICA[e.volumen.metrica] ?? e.volumen.metrica} para poder revisarlo. No tocar lo que está en su alcance.`, tono: "info" };
  if (e.evaluacion === "listo_para_juzgar") return { texto: "Revisarlo con los criterios de decisión y cerrarlo con su conclusión.", tono: "positivo" };
  if (e.estado === "cerrado") return { texto: "Cerrado. Su conclusión quedó en Resultados y aprendizaje.", tono: "neutro" };
  return { texto: "Cancelado.", tono: "neutro" };
}

// ── Acciones del ciclo ──────────────────────────────────────────────────────
const paraInput = (t: number) => new Date(t - 3 * 3600_000).toISOString().slice(0, 16);
function MarcarAplicado({ e, alListo }: { e: ExperimentoMedido; alListo: (t: string) => void }) {
  const sugerida = e.version_detectada ? new Date(e.version_detectada.desde).getTime() : Date.now();
  const [valor, setValor] = useState(paraInput(sugerida));
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!abierto) return <Boton variante="primario" icono={Check} onClick={() => setAbierto(true)}>Ya lo apliqué: marcar la fecha</Boton>;
  return (
    <div className="w-full space-y-3 rounded-lg bg-white/[0.03] p-3.5 ring-1 ring-inset ring-white/[0.08]">
      <Campo etiqueta="¿Desde cuándo está aplicado? (hora de Uruguay)" ayuda="Al confirmar se congela la línea base: los 14 días anteriores a esa fecha, medidos igual que en el Centro de control." className="max-w-sm">
        <input type="datetime-local" value={valor} max={paraInput(Date.now())} onChange={(x) => setValor(x.target.value)} className={`${claseCampo} [color-scheme:dark]`} />
      </Campo>
      <div className="flex flex-wrap gap-2">
        <Boton variante="primario" cargando={enviando} onClick={async () => { setEnviando(true); setError(null); try { await enviarIC({ accion: "experimento_aplicado", id: e.id, aplicado_desde: `${valor}:00-03:00` }); alListo(`${e.id} quedó aplicado desde el ${valor.slice(8, 10)}/${valor.slice(5, 7)}. La línea base se congeló.`); } catch (x) { setError(x instanceof Error ? x.message : String(x)); } finally { setEnviando(false); } }}>Confirmar fecha</Boton>
        <Boton variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
      </div>
      {error && <p className="text-[13px] text-rose-300" role="alert">{error}</p>}
    </div>
  );
}

function Cerrar({ e, alListo }: { e: ExperimentoMedido; alListo: (t: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [aprendizaje, setAprendizaje] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mandar = async (estado: "cerrado" | "cancelado") => {
    if (estado === "cancelado" && !window.confirm(`¿Cancelar ${e.id}? Queda registrado con su motivo y no se puede reactivar.`)) return;
    setEnviando(true); setError(null);
    try { await enviarIC({ accion: "experimento_cerrar", id: e.id, estado, resultado, conclusion, aprendizaje }); alListo(estado === "cerrado" ? `${e.id} cerrado. Su conclusión pasó a la memoria.` : `${e.id} cancelado.`); }
    catch (x) { setError(x instanceof Error ? x.message : String(x)); } finally { setEnviando(false); }
  };
  if (!abierto) return <Boton variante="fantasma" onClick={() => setAbierto(true)}>{e.estado === "planificado" ? "Cancelar el experimento" : "Cerrar el experimento"}</Boton>;
  return (
    <div className="w-full space-y-3 rounded-lg bg-white/[0.03] p-3.5 ring-1 ring-inset ring-white/[0.08]">
      {e.estado === "activo" && (
        <Campo etiqueta="Resultado" className="max-w-xs">
          <select value={resultado} onChange={(x) => setResultado(x.target.value)} className={`${claseCampo} [&>option]:bg-gray-900`}>
            <option value="">Elegí…</option>
            {Object.entries(RESULTADO).map(([k, t]) => <option key={k} value={k}>{t.t}</option>)}
          </select>
        </Campo>
      )}
      <Campo etiqueta={e.estado === "planificado" ? "Por qué se cancela" : "Conclusión (con números)"}><textarea value={conclusion} onChange={(x) => setConclusion(x.target.value)} rows={3} maxLength={2000} className={claseCampo} /></Campo>
      <Campo etiqueta="Aprendizaje (qué hacer distinto la próxima vez)" ayuda={e.evaluacion === "listo_para_juzgar" ? "Con el volumen mínimo alcanzado y un resultado claro, queda como hecho comprobado." : "Sin el volumen mínimo queda como hipótesis en la memoria."}><textarea value={aprendizaje} onChange={(x) => setAprendizaje(x.target.value)} rows={2} maxLength={2000} className={claseCampo} /></Campo>
      <div className="flex flex-wrap gap-2">
        {e.estado === "activo" && <Boton variante="primario" cargando={enviando} onClick={() => mandar("cerrado")}>Cerrar con este resultado</Boton>}
        <Boton variante="peligro" cargando={enviando} onClick={() => mandar("cancelado")}>Cancelarlo</Boton>
        <Boton variante="fantasma" onClick={() => setAbierto(false)}>Volver</Boton>
      </div>
      {error && <p className="text-[13px] text-rose-300" role="alert">{error}</p>}
    </div>
  );
}

// ── Ficha ───────────────────────────────────────────────────────────────────
function Ciclo({ e }: { e: ExperimentoMedido }) {
  const actual = etapa(e);
  const fechas = [fechaDia(e.created_at), e.aplicado_desde ? fechaDia(e.aplicado_desde) : "", "", "", e.estado === "cerrado" || e.estado === "cancelado" ? fechaDia(e.updated_at) : e.fin_previsto ? `prev. ${fechaDia(e.fin_previsto)}` : ""];
  return (
    <div>
    <p className="mb-2 text-[13px] text-gray-300 sm:hidden">Etapa {actual + 1} de 5: <b className="font-semibold text-violet-100">{ETAPAS[actual]}</b>{fechas[actual] ? ` · ${fechas[actual]}` : ""}</p>
    <ol className="grid grid-cols-5 gap-1.5" aria-label={`Etapa actual: ${ETAPAS[actual]}`}>
      {ETAPAS.map((t, i) => {
        const hecho = i < actual, ahora = i === actual;
        return (
          <li key={t} className="min-w-0" aria-current={ahora ? "step" : undefined}>
            <div className={`h-1.5 rounded-full ${hecho ? "bg-violet-400" : ahora ? "bg-violet-300" : "bg-white/[0.08]"}`} />
            <p className={`mt-2 hidden truncate text-[12.5px] font-medium sm:block ${ahora ? "text-violet-100" : hecho ? "text-gray-300" : "text-gray-500"}`}>{t}</p>
            <p className="hidden truncate text-[11.5px] tabular-nums text-gray-500 sm:block">{fechas[i] || " "}</p>
          </li>
        );
      })}
    </ol>
    </div>
  );
}

function Bala({ base, lo, hi, obs, max }: { base: number | null; lo: number; hi: number; obs: number | null; max: number }) {
  const x = (v: number) => `${Math.min(Math.max(v / max, 0), 1) * 100}%`;
  return (
    <div className="relative h-4 w-full min-w-[120px]" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/[0.07]" />
      <div className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm bg-emerald-400/25 ring-1 ring-inset ring-emerald-400/40" style={{ left: x(lo), width: `max(4px, calc(${x(hi)} - ${x(lo)}))` }} />
      {base != null && <div className="absolute top-0 h-4 w-0.5 -translate-x-1/2 rounded bg-gray-300" style={{ left: x(base) }} />}
      {obs != null && <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0b0f17] bg-sky-400" style={{ left: x(obs) }} />}
    </div>
  );
}

function Indicadores({ e }: { e: ExperimentoMedido }) {
  if (!e.indicadores.length) return <Vacio icono={Target} titulo="Sin indicadores definidos" texto="Definí el indicador principal y su valor esperado antes de aplicarlo." />;
  const filas = e.indicadores.map((k) => {
    const r = rango(k.plan_esperado);
    const base = k.antes, obs = e.despues ? k.despues : null;
    const variacion = base != null && obs != null && base !== 0 ? ((obs - base) / Math.abs(base)) * 100 : null;
    let lectura: { t: string; tono: Tono } = { t: e.despues ? "Sin dato" : "Sin aplicar", tono: "neutro" };
    if (obs != null && r) {
      const dentro = obs >= r.lo && obs <= r.hi;
      const mejor = k.mejor === "menos" ? obs < r.lo : k.mejor === "mas" ? obs > r.hi : false;
      lectura = dentro ? { t: "En el objetivo", tono: "positivo" } : mejor ? { t: "Mejor que el objetivo", tono: "positivo" } : { t: "Fuera del objetivo", tono: "alerta" };
    }
    return { k, r, base, obs, variacion, lectura, max: Math.max(base ?? 0, r?.hi ?? 0, obs ?? 0, 0.0001) * 1.25 };
  });
  return (
    <>
      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr className="border-b border-white/[0.07] text-left text-[12.5px] text-gray-400">
              <th scope="col" className="py-2.5 pr-3 font-medium">Indicador</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Línea base real</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Objetivo</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Observado</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Variación</th>
              <th scope="col" className="relative w-[24%] px-3 py-2.5 font-medium"><span className="sr-only">Comparación</span></th>
              <th scope="col" className="py-2.5 pl-3 font-medium">Lectura</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ k, r, base, obs, variacion, lectura, max }) => (
              <tr key={k.clave} className="border-b border-white/[0.04]">
                <th scope="row" className="py-3 pr-3 text-left font-medium text-gray-100">{k.nombre}</th>
                <td className="px-3 py-3 text-right tabular-nums text-gray-100">{formato(base, k.formato)}<span className="block text-[11.5px] font-normal text-gray-500">plan estimaba {k.plan_antes}</span></td>
                <td className="px-3 py-3 text-right tabular-nums text-emerald-200">{k.plan_esperado}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums text-gray-50">{e.despues ? formato(obs, k.formato) : <span className="font-normal text-gray-500">—</span>}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-300">{variacion != null ? `${variacion > 0 ? "+" : ""}${porcentaje(variacion)}` : "—"}</td>
                <td className="px-3 py-3">{r ? <Bala base={base} lo={r.lo} hi={r.hi} obs={obs} max={max} /> : null}</td>
                <td className="py-3 pl-3"><Insignia tono={lectura.tono}>{lectura.t}</Insignia></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-gray-400">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 rounded bg-gray-300" aria-hidden="true" />Línea base</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-emerald-400/25 ring-1 ring-inset ring-emerald-400/40" aria-hidden="true" />Rango objetivo</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-400" aria-hidden="true" />Observado</span>
        </p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:hidden">
        {filas.map(({ k, r, base, obs, lectura, max }) => (
          <div key={k.clave} className="rounded-lg bg-white/[0.025] p-3.5">
            <div className="flex items-start justify-between gap-2"><p className="text-[14px] font-medium text-gray-100">{k.nombre}</p><Insignia tono={lectura.tono}>{lectura.t}</Insignia></div>
            <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[12.5px]">
              <div><dt className="text-gray-400">Base real</dt><dd className="font-medium tabular-nums text-gray-100">{formato(base, k.formato)}</dd></div>
              <div><dt className="text-gray-400">Objetivo</dt><dd className="font-medium tabular-nums text-emerald-200">{k.plan_esperado}</dd></div>
              <div><dt className="text-gray-400">Observado</dt><dd className="font-medium tabular-nums text-gray-50">{e.despues ? formato(obs, k.formato) : "—"}</dd></div>
            </dl>
            {r && <div className="mt-3"><Bala base={base} lo={r.lo} hi={r.hi} obs={obs} max={max} /></div>}
          </div>
        ))}
      </div>
    </>
  );
}

function Ficha({ e, alListo }: { e: ExperimentoMedido; alListo: (t: string) => void }) {
  const k = principal(e);
  const vol = e.volumen;
  const prox = proximaDecision(e);
  const vivo = e.estado === "planificado" || e.estado === "activo";
  const ventas100 = e.indicadores.find((x) => x.clave === "ventas_100_clics")?.antes ?? (e.antes?.clics ? (e.antes.ventas / e.antes.clics) * 100 : null);
  const ventasEsperadas = vol && vol.metrica === "clics" && ventas100 != null ? (vol.minimo * ventas100) / 100 : null;
  const diasTot = e.aplicado_desde && e.fin_previsto ? Math.max((new Date(`${e.fin_previsto}T23:59:59-03:00`).getTime() - new Date(e.aplicado_desde).getTime()) / 86_400_000, 1) : null;
  const diasPas = e.aplicado_desde ? (Math.min(Date.now(), e.estado === "activo" ? Date.now() : new Date(e.updated_at).getTime()) - new Date(e.aplicado_desde).getTime()) / 86_400_000 : null;
  const hipCorta = e.hipotesis.length > 220 ? `${e.hipotesis.slice(0, 217).replace(/\s+\S*$/, "")}…` : e.hipotesis;
  const relacionados = e.otros_cambios;
  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <div className="space-y-5 p-4 md:p-6">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Insignia tono="ia" icono={FlaskConical}>{e.id}</Insignia>
            <Insignia tono={e.estado === "activo" ? "info" : e.estado === "cerrado" ? "positivo" : e.estado === "planificado" ? "alerta" : "neutro"}>{e.estado === "planificado" ? "Planificado, sin aplicar" : e.estado === "activo" ? "En curso" : e.estado === "cerrado" ? "Cerrado" : "Cancelado"}</Insignia>
            <span className="text-[13px] text-gray-400">{CANAL[e.canal] ?? e.canal}</span>
            {e.resultado && <Insignia tono={RESULTADO[e.resultado]?.tono ?? "neutro"}>{RESULTADO[e.resultado]?.t ?? e.resultado}</Insignia>}
          </div>
          <h3 className="mt-2.5 text-[20px] font-semibold leading-snug tracking-[-0.015em] text-gray-50">{e.nombre}</h3>
          <p className="mt-1.5 max-w-[90ch] text-[14px] leading-relaxed text-gray-300">{hipCorta}</p>
        </header>

        <Ciclo e={e} />

        {e.version_detectada && e.estado === "planificado" && (
          <Aviso tono="info" icono={Radar} titulo="La sincronización vio cambios en la campaña">El {fechaHora(e.version_detectada.desde)} apareció la versión {e.version_detectada.version} ({e.version_detectada.cambios} cambios{e.version_detectada.resumen ? `: ${e.version_detectada.resumen}` : ""}). Si es este experimento, marcá esa fecha.</Aviso>
        )}

        <div className="grid gap-px overflow-hidden rounded-lg bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Indicador principal", v: k?.nombre ?? "Sin definir", s: k ? `Objetivo: ${k.plan_esperado}` : "Definilo antes de aplicar" },
            { t: "Línea base real", v: k ? formato(k.antes, k.formato) : "—", s: e.antes_etiqueta },
            { t: "Resultado observado", v: e.despues && k ? formato(k.despues, k.formato) : "—", s: e.despues ? `Desde el ${fechaDia(e.aplicado_desde)}` : "Todavía no hay un después" },
            { t: "Próxima decisión", v: null, s: prox.texto, tono: prox.tono },
          ].map((x) => (
            <div key={x.t} className="bg-[#080b12] p-4">
              <p className="text-[12.5px] text-gray-400">{x.t}</p>
              {x.v != null && <p className="mt-1 text-[18px] font-semibold tabular-nums tracking-[-0.01em] text-gray-50">{x.v}</p>}
              <p className={`mt-1 text-[13px] leading-snug ${x.v == null ? "text-gray-100" : "text-gray-400"}`}>{x.v == null && <Punto tono={x.tono ?? "neutro"} className="mr-1.5" />}{x.s}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {vol && (
            <div className="rounded-lg bg-white/[0.025] p-4">
              <div className="flex items-baseline justify-between gap-3">
                <Rotulo>Evidencia acumulada</Rotulo>
                <span className="text-[13px] tabular-nums text-gray-300"><b className="font-semibold text-gray-50">{e.despues ? Math.round(vol.actual) : 0}</b> de {vol.minimo} {METRICA[vol.metrica] ?? vol.metrica}</span>
              </div>
              <Barra className="mt-2.5" valor={e.despues ? vol.actual : 0} max={vol.minimo} tono="ia" etiqueta="Volumen para revisar" />
              <p className="mt-2.5 text-[13px] leading-relaxed text-gray-400">
                El volumen mínimo habilita la revisión; no prueba por sí solo que sea rentable.
                {ventasEsperadas != null && <> Con la tasa de la línea base ({ventas100!.toFixed(1).replace(".", ",")} ventas cada 100 clics), {vol.minimo} clics son ≈ {ventasEsperadas.toFixed(1).replace(".", ",")} {ventasEsperadas >= 0.95 && ventasEsperadas < 1.05 ? "venta" : "ventas"}: una más o una menos cambia el costo por venta.</>}
              </p>
            </div>
          )}
          <div className="rounded-lg bg-white/[0.025] p-4">
            <Rotulo>Tiempo</Rotulo>
            {e.aplicado_desde && diasTot != null && diasPas != null ? (
              <>
                <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px]"><span className="text-gray-300">Aplicado el {fechaDia(e.aplicado_desde)}</span><span className="tabular-nums text-gray-300">{Math.floor(diasPas)} de {Math.round(diasTot)} días</span></div>
                <Barra className="mt-2.5" valor={diasPas} max={diasTot} tono="neutro" etiqueta="Tiempo transcurrido" />
              </>
            ) : (
              <p className="mt-1 text-[13.5px] leading-relaxed text-gray-300">{e.aplicado_desde ? `Aplicado el ${fechaDia(e.aplicado_desde)}.` : `Cargado el ${fechaDia(e.created_at)}, todavía sin aplicar.`}{e.fin_previsto ? ` Fin previsto: ${fechaLarga(e.fin_previsto)}.` : ""}</p>
            )}
            <p className="mt-2.5 text-[13px] leading-relaxed text-gray-400">Se juzga por volumen, no por días: el tiempo solo dice cuándo revisar.</p>
          </div>
        </div>

        {e.cambios.length > 1 && (
          <Aviso tono="alerta" icono={Layers} titulo={`Cambia ${e.cambios.length} cosas a la vez`}>Solo se podrá evaluar el efecto conjunto: si mejora, no se sabrá cuál de los cambios lo explicó.</Aviso>
        )}

        <div>
          <Rotulo className="mb-2.5">Comparación de indicadores</Rotulo>
          <Indicadores e={e} />
          <p className="mt-2 text-[12.5px] leading-relaxed text-gray-400">Línea base: {e.antes_etiqueta.toLowerCase()}. Ventas de {CANAL[e.canal] ?? e.canal} por último contacto, sin tráfico propio, igual que el Centro de control. Las estimaciones del plan no se mezclan con lo medido.</p>
        </div>

        {(e.conclusion || e.aprendizaje) && (
          <Aviso tono={RESULTADO[e.resultado ?? ""]?.tono ?? "neutro"} icono={CheckCircle2} titulo={RESULTADO[e.resultado ?? ""]?.t ?? "Conclusión"}>
            {e.conclusion && <p>{e.conclusion}</p>}
            {e.aprendizaje && <p className="mt-1 text-gray-300"><b className="font-medium text-gray-100">Aprendizaje:</b> {e.aprendizaje}</p>}
          </Aviso>
        )}

        <div className="space-y-2">
          <Rotulo>Metodología</Rotulo>
          <div className="divide-y divide-white/[0.06] rounded-lg ring-1 ring-inset ring-white/[0.07]">
            <Desplegable plano titulo="Hipótesis completa" icono={Target}><p className="text-[14px] leading-relaxed text-gray-200">{e.hipotesis}</p></Desplegable>
            <Desplegable plano titulo="Cambios previstos" icono={ListChecks} resumen={`${e.cambios.length}`}>
              <ol className="list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-gray-200">{e.cambios.map((c, i) => <li key={i}>{c}</li>)}</ol>
            </Desplegable>
            <Desplegable plano titulo="Cambios efectivamente aplicados" icono={Settings2}>
              <p className="text-[14px] leading-relaxed text-gray-200">{e.aplicado_desde ? `Aplicado desde el ${fechaHora(e.aplicado_desde)}. La versión de la campaña de las primeras 24 h se toma como la aplicación misma.` : e.version_detectada ? `Sin marcar todavía. La sincronización detectó la versión ${e.version_detectada.version} el ${fechaHora(e.version_detectada.desde)}.` : "Todavía no se aplicó ningún cambio de este plan."}</p>
            </Desplegable>
            <Desplegable plano titulo="Línea base" icono={Scale} resumen={e.antes ? `${e.antes.ventas} ${e.antes.ventas === 1 ? "venta" : "ventas"}` : undefined}>
              <p className="text-[14px] leading-relaxed text-gray-200">{e.antes_etiqueta}.</p>
              {e.antes && <p className="mt-1.5 text-[13.5px] tabular-nums text-gray-300">{e.antes.clics ?? "—"} clics · {e.antes.visitas} visitas medidas · {e.antes.checkout} llegaron al checkout · {e.antes.ventas} {e.antes.ventas === 1 ? "venta" : "ventas"} · dólar a {e.dolar.valor}{e.dolar.estimado ? " (estimado)" : ""}</p>}
              {e.despues && <p className="mt-1 text-[13.5px] tabular-nums text-gray-300">Después: {e.despues.clics ?? "—"} clics · {e.despues.visitas} visitas · {e.despues.checkout} al checkout · {e.despues.ventas} {e.despues.ventas === 1 ? "venta" : "ventas"}</p>}
            </Desplegable>
            <Desplegable plano titulo="Criterios de evaluación" icono={CheckCircle2} resumen={`${e.criterios.length}`}>
              {e.criterios.length === 0 ? <p className="text-[13.5px] text-gray-400">Sin criterios definidos todavía.</p> : (
                <ul className="divide-y divide-white/[0.05]">{e.criterios.map((c, i) => <li key={i} className="grid gap-1 py-2 text-[14px] md:grid-cols-[240px_1fr] md:gap-4"><span className="font-medium text-gray-100">Si {c.si.charAt(0).toLowerCase() + c.si.slice(1)}</span><span className="text-gray-300">{c.entonces}</span></li>)}</ul>
              )}
            </Desplegable>
            <Desplegable plano titulo="Restricciones: qué no se toca mientras corre" icono={Lock} resumen={e.alcance.map((a) => CANAL[a] ?? a).join(", ")}>
              <p className="flex flex-wrap gap-1.5">{e.alcance.map((a) => <Insignia key={a} tono="alerta">{CANAL[a] ?? a}</Insignia>)}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-gray-400">Si se cambian junto con el experimento, no se sabe qué funcionó. Mientras esté en curso, la bandeja bloquea las recomendaciones que tocan algo de esto; mientras solo esté planificado, las deja ejecutables con un aviso para coordinarlas.</p>
            </Desplegable>
            <Desplegable plano titulo="Riesgos y atribución" icono={AlertTriangle}>
              <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-gray-200">
                <li>{e.atribucion}</li>
                {e.cambios.length > 1 && <li>Cambia {e.cambios.length} cosas a la vez: el resultado será del conjunto.</li>}
              </ul>
            </Desplegable>
            {e.faltantes.length > 0 && (
              <Desplegable plano titulo="Información faltante" icono={AlertTriangle} resumen={`${e.faltantes.length}`}>
                <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-gray-200">{e.faltantes.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </Desplegable>
            )}
            <Desplegable plano titulo="Historial" icono={History} resumen={relacionados.length ? `${relacionados.length} cambios durante el experimento` : undefined}>
              <ul className="space-y-1.5 text-[13.5px] text-gray-300">
                <li><span className="tabular-nums text-gray-400">{fechaDia(e.created_at)}</span> · Se planificó.</li>
                {e.aplicado_desde && <li><span className="tabular-nums text-gray-400">{fechaDia(e.aplicado_desde)}</span> · Se aplicó y se congeló la línea base.</li>}
                {relacionados.map((c, i) => <li key={i}><span className="tabular-nums text-gray-400">{fechaDia(c.fecha)}</span> · {c.titulo}{c.detalle ? `: ${c.detalle.slice(0, 120)}` : ""}</li>)}
                {(e.estado === "cerrado" || e.estado === "cancelado") && <li><span className="tabular-nums text-gray-400">{fechaDia(e.updated_at)}</span> · {e.estado === "cerrado" ? "Se cerró." : "Se canceló."}</li>}
              </ul>
            </Desplegable>
          </div>
        </div>
      </div>
      {(vivo || e.referencias.length > 0) && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] bg-white/[0.015] px-4 py-3.5 md:px-6">
          {e.estado === "planificado" && <MarcarAplicado e={e} alListo={alListo} />}
          {vivo && <Cerrar e={e} alListo={alListo} />}
          {e.referencias.map((r) => <BotonLink key={r.url} href={r.url} externo variante="fantasma" icono={ExternalLink}>{r.titulo}</BotonLink>)}
        </footer>
      )}
    </article>
  );
}

// ── Línea de tiempo de cambios ──────────────────────────────────────────────
type Decision = { clave: string; titulo: string; estado: string; nota: string | null; canal: string | null; decidida_at: string; experimento_id: string | null };
type Item = { fecha: string; tipo: TipoCambio; registro: "automatico" | "manual"; titulo: string; detalle: string | null; experimentos: string[]; conHora: boolean };
const TIPO: Record<TipoCambio, { t: string; icono: LucideIcon; tono: Tono }> = {
  publicidad: { t: "Publicidad", icono: Megaphone, tono: "info" }, web: { t: "Web", icono: Globe, tono: "neutro" }, oferta: { t: "Oferta y precio", icono: Tag, tono: "alerta" },
  decision: { t: "Decisión", icono: CheckCircle2, tono: "positivo" }, experimento: { t: "Experimento", icono: FlaskConical, tono: "ia" }, otro: { t: "Otro", icono: GitCommit, tono: "neutro" },
};
const ESTADO_DEC: Record<string, string> = { aceptada: "Aceptada", descartada: "Descartada", pospuesta: "Pospuesta", no_aplica: "Ya no aplica", revalidada: "Confirmada vigente" };

function LineaDeTiempo({ cambios, decisiones }: { cambios: CambioRegistrado[]; decisiones: Decision[] }) {
  const [filtro, setFiltro] = useState<"todos" | TipoCambio>("todos");
  const [todos, setTodos] = useState(false);
  const items: Item[] = useMemo(() => [
    ...cambios.map((c) => ({ fecha: c.fecha, tipo: c.tipo, registro: c.registro, titulo: c.titulo.replace(/^Bitácora · \w+$/, c.tipo === "web" ? "Cambio en la web" : c.tipo === "publicidad" ? "Nota de publicidad" : "Nota en la bitácora"), detalle: c.detalle, experimentos: c.experimentos, conHora: c.origen !== "bitacora" })),
    // Las "hechas" ya están en la bitácora; acá van el resto de las decisiones (aceptar, descartar, posponer…).
    ...decisiones.filter((x) => x.estado !== "hecha").map((x) => ({ fecha: x.decidida_at, tipo: "decision" as TipoCambio, registro: "manual" as const, titulo: `${ESTADO_DEC[x.estado] ?? x.estado}: ${x.titulo}`, detalle: x.nota, experimentos: x.experimento_id ? [x.experimento_id] : [], conHora: true })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha)), [cambios, decisiones]);
  const presentes = Array.from(new Set(items.map((i) => i.tipo)));
  const lista = items.filter((i) => filtro === "todos" || i.tipo === filtro);
  const visibles = todos ? lista : lista.slice(0, 12);
  const porDia = new Map<string, Item[]>();
  for (const i of visibles) { const k = fechaLarga(i.fecha); porDia.set(k, [...(porDia.get(k) ?? []), i]); }
  return (
    <Panel cuerpo="p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado etiqueta="Tipo de cambio" tamano="sm" valor={filtro} onChange={(v) => { setFiltro(v); setTodos(false); }} opciones={[{ id: "todos" as const, t: "Todos", n: items.length }, ...presentes.map((t) => ({ id: t, t: TIPO[t].t, n: items.filter((i) => i.tipo === t).length }))]} />
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-gray-400">
          <span className="inline-flex items-center gap-1.5"><Radar size={13} aria-hidden="true" />Detectado automáticamente</span>
          <span className="inline-flex items-center gap-1.5"><BookOpen size={13} aria-hidden="true" />Registrado a mano</span>
        </p>
      </div>
      {lista.length === 0 ? <Vacio className="mt-4" titulo="Sin cambios registrados" /> : (
        <div className="mt-5 space-y-5">
          {Array.from(porDia.entries()).map(([dia, xs]) => (
            <section key={dia} aria-label={dia}>
              <p className="mb-2 text-[12.5px] font-medium text-gray-400">{dia}</p>
              <ol className="relative space-y-1 border-l border-white/[0.08] pl-5">
                {xs.map((i, k) => {
                  const T = TIPO[i.tipo];
                  return (
                    <li key={k} className="relative rounded-lg py-2 pr-2">
                      <span className={`absolute -left-[29px] top-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-4 ring-[#05070d] ${i.tipo === "decision" ? "bg-emerald-400/20 text-emerald-300" : i.tipo === "experimento" ? "bg-violet-400/20 text-violet-300" : i.tipo === "publicidad" ? "bg-sky-400/20 text-sky-300" : i.tipo === "oferta" ? "bg-amber-400/20 text-amber-300" : "bg-white/10 text-gray-300"}`}><T.icono size={10} aria-hidden="true" /></span>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
                        <span className="font-medium text-gray-100">{i.titulo}</span>
                        {i.conHora && <span className="text-[12.5px] tabular-nums text-gray-500">{new Date(i.fecha).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" })}</span>}
                      </p>
                      {i.detalle && <p className="mt-0.5 line-clamp-2 max-w-[100ch] text-[13px] leading-relaxed text-gray-400">{i.detalle}</p>}
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Insignia tono={T.tono}>{T.t}</Insignia>
                        <Insignia icono={i.registro === "automatico" ? Radar : BookOpen}>{i.registro === "automatico" ? "Automático" : "Manual"}</Insignia>
                        {i.experimentos.map((x) => <Insignia key={x} tono="ia">Durante {x}</Insignia>)}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {lista.length > 12 && <Boton tamano="sm" onClick={() => setTodos(!todos)}>{todos ? "Ver solo los últimos 12" : `Ver los ${lista.length} cambios`}</Boton>}
        </div>
      )}
      <p className="mt-4 text-[12.5px] leading-relaxed text-gray-400">Versiones de las campañas que detecta la sincronización, acciones del motor de reglas, notas de la bitácora y tus decisiones. Los cambios en la web solo aparecen si se anotan en la bitácora.</p>
    </Panel>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
type Datos = { experimentos: ExperimentoMedido[]; cambios: CambioRegistrado[]; aceptadas: { clave: string; titulo: string; canal: string | null; nota: string | null; decidida_at: string; fuentes: { tipo: string; id: string }[]; experimento_id: string | null }[]; decisiones: Decision[] };

export default function ExperimentosPage() {
  const { d, error, cargando, cargar, actualizado } = useVista<Datos>("experimentos");
  const { nodo, avisar } = useNotificacion();
  const alListo = (t: string) => { avisar(t); cargar(); };
  const exps = d?.experimentos ?? [];
  const vivos = exps.filter((e) => e.estado === "planificado" || e.estado === "activo");
  const terminados = exps.filter((e) => e.estado === "cerrado" || e.estado === "cancelado");
  const acciones = (d?.aceptadas ?? []).filter((a) => !a.experimento_id);
  const tiles: { t: string; n: number; s: string; tono: Tono }[] = [
    { t: "Planificados", n: exps.filter((e) => e.estado === "planificado").length, s: "Decididos, sin aplicar", tono: "alerta" },
    { t: "En medición", n: exps.filter((e) => e.estado === "activo").length, s: `${exps.filter((e) => e.evaluacion === "juntando_datos").length} esperando evidencia`, tono: "info" },
    { t: "Listos para evaluar", n: exps.filter((e) => e.evaluacion === "listo_para_juzgar").length, s: "Con el volumen mínimo", tono: "positivo" },
    { t: "Acciones por implementar", n: acciones.length, s: "Aceptadas, sin medición", tono: "neutro" },
    { t: "Cerrados", n: terminados.length, s: `${exps.filter((e) => e.resultado === "exito").length} funcionaron`, tono: "neutro" },
  ];
  return (
    <Pagina titulo="Acciones y experimentos" icono={FlaskConical} descripcion="Cada cambio importante como experimento: contra qué se mide, cuánta evidencia hay y cuál es la próxima decisión. Las acciones simples se marcan como realizadas."
      acciones={<Actualizar cargando={cargando} onClick={cargar} actualizado={actualizado} />}>
      {nodo}
      {error && <ErrorCarga mensaje={error} reintentar={cargar} />}
      {!d && !error && <EsqueletoPagina tarjetas={5} />}
      {d && (
        <div className={`space-y-8 transition-opacity md:space-y-10 ${cargando ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
            {tiles.map((x) => (
              <div key={x.t} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-gray-400"><Punto tono={x.n > 0 ? x.tono : "neutro"} />{x.t}</p>
                <p className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums text-gray-50">{x.n}</p>
                <p className="mt-1.5 text-[12.5px] text-gray-400">{x.s}</p>
              </div>
            ))}
          </div>

          <Seccion titulo="Experimentos en curso y planificados" icono={FlaskConical}>
            {vivos.length === 0 ? <Vacio icono={FlaskConical} titulo="No hay experimentos en curso" texto={<>Se crean desde <Enlace href="/admin/tarot/inteligencia/recomendaciones">Recomendaciones</Enlace> con «Convertir en experimento».</>} /> : vivos.map((e) => <Ficha key={e.id} e={e} alListo={alListo} />)}
          </Seccion>

          <Seccion titulo="Acciones por implementar" icono={ListChecks} descripcion="Recomendaciones aceptadas que no necesitan medición propia. Al marcarlas realizadas quedan en la línea de tiempo.">
            {acciones.length === 0 ? <Vacio titulo="Nada pendiente" texto={<>Lo que aceptes en <Enlace href="/admin/tarot/inteligencia/recomendaciones">Recomendaciones</Enlace> aparece acá hasta que lo marques realizado.</>} /> : (
              <Panel cuerpo="divide-y divide-white/[0.06]">
                {acciones.map((a) => (
                  <div key={a.clave} className="flex flex-col gap-2 px-4 py-3.5 md:flex-row md:items-center md:justify-between md:px-5">
                    <div className="min-w-0">
                      <p className="text-[14px] text-gray-100">{a.titulo}</p>
                      <p className="mt-0.5 text-[12.5px] text-gray-400">Aceptada el {fechaDia(a.decidida_at)}{a.canal ? ` · ${CANAL[a.canal] ?? a.canal}` : ""}{a.nota ? ` · ${a.nota}` : ""}</p>
                    </div>
                    <Boton tamano="sm" variante="positivo" icono={Check} className="self-start md:self-center" onClick={async () => { try { await enviarIC({ accion: "decidir", clave: a.clave, estado: "hecha", titulo: a.titulo, canal: a.canal, refs: a.fuentes }); alListo("Marcada como realizada."); } catch (x) { avisar(x instanceof Error ? x.message : String(x), "negativo"); } }}>Marcar realizada</Boton>
                  </div>
                ))}
              </Panel>
            )}
          </Seccion>

          <Seccion titulo="Registro de cambios" icono={History} descripcion="Últimos 30 días, en orden. Sirve para saber qué más cambió mientras corría un experimento.">
            <LineaDeTiempo cambios={d.cambios} decisiones={d.decisiones ?? []} />
          </Seccion>

          {terminados.length > 0 && (
            <Seccion titulo="Experimentos terminados" icono={CheckCircle2}>
              {terminados.map((e) => <Ficha key={e.id} e={e} alListo={alListo} />)}
            </Seccion>
          )}
        </div>
      )}
    </Pagina>
  );
}
