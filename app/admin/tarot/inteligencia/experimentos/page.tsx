"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, BookOpen, Check, ExternalLink, FlaskConical, GitCommit, Info, ListChecks, Radar, RefreshCw, Settings2 } from "lucide-react";
import { MarcoInteligencia } from "@/components/admin/inteligencia/Marco";
import type { ExperimentoMedido, CambioRegistrado } from "@/lib/inteligencia/experimentos";

// Inteligencia comercial · Acciones y experimentos (fase 2, 2026-11-25).
// Cada experimento con su hipótesis, lo que cambia, lo que no se toca
// mientras corre, la línea base, el avance hacia el volumen mínimo para
// juzgarlo, sus criterios y lo que falta saber. Debajo, lo que se decidió
// hacer y todos los cambios registrados (para saber qué pudo influir).

const NOMBRE: Record<string, string> = { google_ads: "Google Ads", meta_ads: "Meta Ads", pagina: "páginas", checkout: "checkout", oferta: "oferta", publicidad: "publicidad", negocio: "negocio" };
const ESTADO: Record<string, { t: string; c: string }> = {
  planificado: { t: "Planificado", c: "border-gray-700 bg-gray-800 text-gray-200" },
  activo: { t: "En curso", c: "border-sky-800 bg-sky-950/50 text-sky-200" },
  cerrado: { t: "Cerrado", c: "border-emerald-800 bg-emerald-950/40 text-emerald-200" },
  cancelado: { t: "Cancelado", c: "border-gray-700 bg-gray-900 text-gray-400" },
};
const EVALUACION: Record<ExperimentoMedido["evaluacion"], string> = {
  sin_aplicar: "Todavía sin aplicar", juntando_datos: "Juntando datos: todavía no se juzga", listo_para_juzgar: "Con volumen suficiente para juzgar", cerrado: "Cerrado",
};
const RESULTADO: Record<string, string> = { exito: "Funcionó", fracaso: "No funcionó", sin_evidencia: "Sin evidencia suficiente", mixto: "Resultado mixto" };
const fechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" }) : "—");
const fecha = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: "America/Montevideo" }) : "—");

function formato(v: number | null, f: string) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (f === "usd") return `US$${v.toFixed(2).replace(".", ",")}`;
  if (f === "pesos") return `$ ${Math.round(v).toLocaleString("es-UY")}`;
  if (f === "pct") return `${v.toFixed(1).replace(".", ",")} %`;
  if (f === "entero") return Math.round(v).toLocaleString("es-UY");
  return v.toFixed(1).replace(".", ",");
}

async function enviar(cuerpo: Record<string, unknown>) {
  const r = await fetch("/api/admin/tarot/inteligencia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.motivo || "No se pudo guardar.");
}

/** "YYYY-MM-DDTHH:mm" en hora de Montevideo, para el input datetime-local. */
const paraInput = (t: number) => new Date(t - 3 * 3600_000).toISOString().slice(0, 16);

function MarcarAplicado({ e, alListo }: { e: ExperimentoMedido; alListo: () => void }) {
  const sugerida = e.version_detectada ? new Date(e.version_detectada.desde).getTime() : Date.now();
  const [valor, setValor] = useState(paraInput(sugerida));
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    setEnviando(true); setError(null);
    try { await enviar({ accion: "experimento_aplicado", id: e.id, aplicado_desde: `${valor}:00-03:00` }); alListo(); }
    catch (x) { setError(x instanceof Error ? x.message : String(x)); } finally { setEnviando(false); }
  };
  if (!abierto) return <button type="button" onClick={() => setAbierto(true)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-sky-700 bg-sky-900/40 px-3 text-[13px] font-medium text-sky-100 hover:bg-sky-900/70"><Check size={14} /> Ya lo apliqué: marcar la fecha</button>;
  return (
    <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/60 p-3">
      <label className="block text-[13px] text-gray-300">¿Desde cuándo está aplicado? (hora de Uruguay)
        <input type="datetime-local" value={valor} max={paraInput(Date.now())} onChange={(x) => setValor(x.target.value)} className="mt-1 block rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-gray-100" />
      </label>
      <p className="text-[12px] text-gray-500">Al guardar se congela la línea base: los {14} días anteriores a esa fecha, medidos igual que en el Centro de control. Desde ahí se cuenta el después.</p>
      <div className="flex gap-2">
        <button type="button" onClick={guardar} disabled={enviando} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-700 bg-amber-900/40 px-3 text-[13px] text-amber-100 disabled:opacity-50">Confirmar</button>
        <button type="button" onClick={() => setAbierto(false)} className="min-h-[40px] rounded-lg border border-gray-700 px-3 text-[13px] text-gray-300">Cancelar</button>
      </div>
      {error && <p className="text-[13px] text-red-300">{error}</p>}
    </div>
  );
}

function Cerrar({ e, alListo }: { e: ExperimentoMedido; alListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [aprendizaje, setAprendizaje] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mandar = async (estado: "cerrado" | "cancelado") => {
    setEnviando(true); setError(null);
    try { await enviar({ accion: "experimento_cerrar", id: e.id, estado, resultado, conclusion, aprendizaje }); alListo(); }
    catch (x) { setError(x instanceof Error ? x.message : String(x)); } finally { setEnviando(false); }
  };
  if (!abierto) return <button type="button" onClick={() => setAbierto(true)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-700 px-3 text-[13px] text-gray-200 hover:bg-gray-800">{e.estado === "planificado" ? "Cancelar el experimento" : "Cerrar el experimento"}</button>;
  return (
    <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/60 p-3">
      {e.estado === "activo" && (
        <label className="block text-[13px] text-gray-300">Resultado
          <select value={resultado} onChange={(x) => setResultado(x.target.value)} className="mt-1 block rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-gray-100">
            <option value="">Elegí…</option>
            {Object.entries(RESULTADO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
      )}
      <label className="block text-[13px] text-gray-300">Conclusión (con números)
        <textarea value={conclusion} onChange={(x) => setConclusion(x.target.value)} rows={3} maxLength={2000} className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-[13px] text-gray-100" />
      </label>
      <label className="block text-[13px] text-gray-300">Aprendizaje (qué hacer distinto la próxima vez)
        <textarea value={aprendizaje} onChange={(x) => setAprendizaje(x.target.value)} rows={2} maxLength={2000} className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-[13px] text-gray-100" />
      </label>
      <div className="flex flex-wrap gap-2">
        {e.estado === "activo" && <button type="button" disabled={enviando} onClick={() => mandar("cerrado")} className="min-h-[40px] rounded-lg border border-amber-700 bg-amber-900/40 px-3 text-[13px] text-amber-100 disabled:opacity-50">Cerrar con este resultado</button>}
        <button type="button" disabled={enviando} onClick={() => mandar("cancelado")} className="min-h-[40px] rounded-lg border border-gray-700 px-3 text-[13px] text-gray-300 disabled:opacity-50">Cancelarlo</button>
        <button type="button" onClick={() => setAbierto(false)} className="min-h-[40px] rounded-lg px-3 text-[13px] text-gray-400">Volver</button>
      </div>
      {error && <p className="text-[13px] text-red-300">{error}</p>}
    </div>
  );
}

function TarjetaExperimento({ e, alListo }: { e: ExperimentoMedido; alListo: () => void }) {
  const est = ESTADO[e.estado];
  const vol = e.volumen;
  return (
    <article className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 md:p-5">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-violet-950/60 px-2 py-0.5 text-[12px] font-bold tracking-wide text-violet-200">{e.id}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${est.c}`}>{est.t}</span>
          <span className="text-[12px] text-gray-400">{NOMBRE[e.canal] ?? e.canal} · {EVALUACION[e.evaluacion]}</span>
        </div>
        <h2 className="text-[17px] font-semibold leading-snug text-white">{e.nombre}</h2>
        <p className="text-[12.5px] text-gray-400">Cargado el {fecha(e.created_at)} · {e.aplicado_desde ? `aplicado desde el ${fechaHora(e.aplicado_desde)}` : "sin aplicar"}{e.fin_previsto ? ` · fin previsto ${fecha(e.fin_previsto)}` : ""}</p>
      </header>

      {e.version_detectada && e.estado === "planificado" && (
        <p className="flex gap-2 rounded-lg border border-sky-900 bg-sky-950/30 p-3 text-[13px] text-sky-100"><Radar size={15} className="mt-0.5 shrink-0 text-sky-300" /> La sincronización detectó cambios en la campaña el {fechaHora(e.version_detectada.desde)} (versión {e.version_detectada.version}, {e.version_detectada.cambios} cambios{e.version_detectada.resumen ? `: ${e.version_detectada.resumen}` : ""}). Si es este experimento, marcá esa fecha.</p>
      )}

      <section className="space-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Hipótesis</h3>
        <p className="text-[14px] leading-relaxed text-gray-100">{e.hipotesis}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Qué se cambia</h3>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-gray-200">{e.cambios.map((c, i) => <li key={i}>{c}</li>)}</ol>
        </section>
        <section className="space-y-2">
          {e.alcance.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">No se toca mientras corre</h3>
              <p className="mt-1 flex flex-wrap gap-1.5">{e.alcance.map((a) => <span key={a} className="rounded-full border border-amber-900 bg-amber-950/30 px-2 py-0.5 text-[12px] text-amber-200">{NOMBRE[a] ?? a}</span>)}</p>
              <p className="mt-1 text-[12px] text-gray-500">Si se cambian junto con el experimento, no se sabe qué funcionó. La bandeja avisa cuando una recomendación toca algo de esto.</p>
            </div>
          )}
          {vol && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Volumen para juzgarlo</h3>
              <p className="mt-1 text-[13px] text-gray-200"><b className="tabular-nums">{e.despues ? Math.round(vol.actual) : 0}</b> de {vol.minimo} {vol.metrica} desde que se aplicó</p>
              <div className="mt-1.5 h-2 rounded-full bg-gray-800" role="img" aria-label={`${Math.round(vol.actual)} de ${vol.minimo} ${vol.metrica}`}>
                <div className="h-2 rounded-full bg-violet-400" style={{ width: `${Math.min(e.despues ? vol.actual / vol.minimo : 0, 1) * 100}%` }} />
              </div>
              <p className="mt-1 text-[12px] text-gray-500">Se juzga por cantidad, no por días: con pocos datos, una venta más o menos cambia todo.</p>
            </div>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Indicadores</h3>
        <div className="hidden overflow-hidden rounded-xl border border-gray-800 md:block">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-950/60 text-left text-[11.5px] text-gray-400">
              <tr><th className="px-3 py-2 font-medium">Indicador</th><th className="px-3 py-2 font-medium">Plan: antes</th><th className="px-3 py-2 font-medium">Plan: esperado</th><th className="px-3 py-2 font-medium">Medido: {e.antes_etiqueta.toLowerCase()}</th><th className="px-3 py-2 font-medium">Medido: después</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {e.indicadores.map((k) => (
                <tr key={k.clave}><td className="px-3 py-2 text-gray-200">{k.nombre}</td><td className="px-3 py-2 tabular-nums text-gray-400">{k.plan_antes}</td><td className="px-3 py-2 tabular-nums text-gray-300">{k.plan_esperado}</td><td className="px-3 py-2 tabular-nums text-gray-100">{formato(k.antes, k.formato)}</td><td className="px-3 py-2 tabular-nums text-white">{e.despues ? formato(k.despues, k.formato) : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 md:hidden">
          {e.indicadores.map((k) => (
            <div key={k.clave} className="rounded-lg border border-gray-800 bg-gray-950/40 p-2.5">
              <p className="text-[13px] font-medium text-gray-100">{k.nombre}</p>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12.5px]">
                <dt className="text-gray-500">Plan: antes</dt><dd className="tabular-nums text-gray-300">{k.plan_antes}</dd>
                <dt className="text-gray-500">Plan: esperado</dt><dd className="tabular-nums text-gray-300">{k.plan_esperado}</dd>
                <dt className="text-gray-500">Medido antes</dt><dd className="tabular-nums text-gray-100">{formato(k.antes, k.formato)}</dd>
                <dt className="text-gray-500">Medido después</dt><dd className="tabular-nums text-white">{e.despues ? formato(k.despues, k.formato) : "—"}</dd>
              </dl>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-gray-500">«Medido antes»: {e.antes_etiqueta}. Ventas de {NOMBRE[e.canal] ?? e.canal} por último contacto, sin tráfico propio, igual que el Centro de control. Dólar a {e.dolar.valor}{e.dolar.estimado ? " (estimado)" : ""}; el gasto se cuenta por día completo.</p>
        {e.antes && <p className="text-[12px] text-gray-500">Base: {e.antes.clics ?? "—"} clics, {e.antes.visitas} visitas medidas, {e.antes.checkout} llegaron al checkout, {e.antes.ventas} {e.antes.ventas === 1 ? "venta" : "ventas"}.{e.despues ? ` Después: ${e.despues.clics ?? "—"} clics, ${e.despues.visitas} visitas, ${e.despues.checkout} al checkout, ${e.despues.ventas} ${e.despues.ventas === 1 ? "venta" : "ventas"}.` : ""}</p>}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Cómo se decide</h3>
        <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800">
          {e.criterios.map((c, i) => <li key={i} className="grid gap-0.5 px-3 py-2 text-[13px] md:grid-cols-[220px_1fr] md:gap-3"><span className="font-medium text-gray-100">Si {c.si.charAt(0).toLowerCase() + c.si.slice(1)}</span><span className="text-gray-300">{c.entonces}</span></li>)}
        </ul>
      </section>

      <p className="flex gap-2 rounded-lg bg-gray-950/50 p-2.5 text-[12.5px] text-gray-300"><Info size={14} className="mt-0.5 shrink-0 text-gray-400" /><span><b className="text-gray-100">Observado o atribuible:</b> {e.atribucion}</span></p>
      {e.otros_cambios.length > 0 && (
        <ul className="space-y-1 pl-6 text-[12.5px] text-gray-400">{e.otros_cambios.map((c, i) => <li key={i} className="list-disc">{fecha(c.fecha)} · {c.titulo}</li>)}</ul>
      )}

      {e.faltantes.length > 0 && (
        <section className="space-y-1 rounded-lg border border-amber-900/70 bg-amber-950/20 p-3">
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-amber-300"><AlertTriangle size={13} /> Lo que falta saber</h3>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-amber-100/90">{e.faltantes.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </section>
      )}

      {(e.conclusion || e.aprendizaje) && (
        <section className="space-y-1 rounded-lg border border-emerald-900/70 bg-emerald-950/20 p-3 text-[13px]">
          {e.resultado && <p className="font-semibold text-emerald-200">{RESULTADO[e.resultado] ?? e.resultado}</p>}
          {e.conclusion && <p className="text-gray-100">{e.conclusion}</p>}
          {e.aprendizaje && <p className="text-gray-300"><b>Aprendizaje:</b> {e.aprendizaje}</p>}
        </section>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-gray-800 pt-3">
        {e.estado === "planificado" && <MarcarAplicado e={e} alListo={alListo} />}
        {(e.estado === "planificado" || e.estado === "activo") && <Cerrar e={e} alListo={alListo} />}
        {e.referencias.map((r) => <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-1 px-1 text-[13px] text-sky-300 hover:underline">{r.titulo} <ExternalLink size={12} /></a>)}
      </footer>
    </article>
  );
}

const ICONO_CAMBIO: Record<CambioRegistrado["origen"], typeof GitCommit> = { campana: Settings2, bitacora: BookOpen, motor: GitCommit };

export default function ExperimentosPage() {
  const [d, setD] = useState<{ experimentos: ExperimentoMedido[]; cambios: CambioRegistrado[]; aceptadas: { clave: string; titulo: string; canal: string | null; nota: string | null; decidida_at: string; fuentes: { tipo: string; id: string }[] }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [todosCambios, setTodosCambios] = useState(false);
  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch("/api/admin/tarot/inteligencia?vista=experimentos", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.detalle || j.motivo || "Error");
      setD(j);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const vivos = d?.experimentos.filter((e) => e.estado === "planificado" || e.estado === "activo") ?? [];
  const terminados = d?.experimentos.filter((e) => e.estado === "cerrado" || e.estado === "cancelado") ?? [];

  return (
    <MarcoInteligencia
      bajada="Cada cambio importante como experimento: qué se espera, cómo se mide, cuándo se juzga y qué falta saber. Debajo, lo que decidiste hacer y todo lo que cambió en los últimos 30 días."
      extra={<button type="button" onClick={cargar} disabled={cargando} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-700 px-3 text-[13px] text-gray-200 hover:bg-gray-800 disabled:opacity-50"><RefreshCw size={14} className={cargando ? "animate-spin" : ""} /> Actualizar</button>}
    >
      {error && <p className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-[13px] text-red-200">{error}</p>}
      {!d && !error && <p className="py-16 text-center text-[14px] text-gray-400">Midiendo los experimentos…</p>}
      {d && (
        <>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white"><FlaskConical size={16} className="text-violet-300" /> Experimentos en curso o planificados</h2>
          {vivos.length === 0 && <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-[13px] text-gray-400">No hay experimentos en curso.</p>}
          {vivos.map((e) => <TarjetaExperimento key={e.id} e={e} alListo={cargar} />)}

          <h2 className="flex items-center gap-2 pt-2 text-base font-semibold text-white"><ListChecks size={16} className="text-sky-300" /> Acciones aceptadas sin terminar</h2>
          {d.aceptadas.length === 0
            ? <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-[13px] text-gray-400">Ninguna. Lo que aceptes en <Link href={"/admin/tarot/inteligencia/recomendaciones" as Route<string>} className="text-sky-300 hover:underline">Recomendaciones</Link> aparece acá hasta que lo marques hecho.</p>
            : (
              <div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/60">
                {d.aceptadas.map((a) => (
                  <div key={a.clave} className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="text-[13.5px] text-gray-100">{a.titulo}</p>
                      <p className="text-[12px] text-gray-500">Aceptada el {fecha(a.decidida_at)}{a.canal ? ` · ${NOMBRE[a.canal] ?? a.canal}` : ""}{a.nota ? ` · ${a.nota}` : ""}</p>
                    </div>
                    <button type="button" onClick={async () => { try { await enviar({ accion: "decidir", clave: a.clave, estado: "hecha", titulo: a.titulo, canal: a.canal, refs: a.fuentes }); cargar(); } catch (x) { setError(x instanceof Error ? x.message : String(x)); } }} className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 self-start rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 text-[13px] text-emerald-200 hover:bg-emerald-900/50"><Check size={14} /> Marcar hecha</button>
                  </div>
                ))}
              </div>
            )}

          <h2 className="flex items-center gap-2 pt-2 text-base font-semibold text-white"><Settings2 size={16} className="text-gray-300" /> Cambios registrados (últimos 30 días)</h2>
          <p className="text-[12.5px] text-gray-500">Versiones de las campañas que detecta la sincronización, cambios aplicados desde el motor de reglas y lo anotado en la bitácora. Los cambios en la web solo aparecen si se anotan en la bitácora.</p>
          <ol className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/60">
            {d.cambios.length === 0 && <li className="p-3 text-[13px] text-gray-400">Sin cambios registrados.</li>}
            {(todosCambios ? d.cambios : d.cambios.slice(0, 8)).map((c, i) => {
              const Icono = ICONO_CAMBIO[c.origen];
              return (
                <li key={i} className="flex gap-3 p-3">
                  <Icono size={15} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[13px] text-gray-100"><span className="tabular-nums text-gray-400">{c.origen === "bitacora" ? fecha(c.fecha) : fechaHora(c.fecha)}</span> · {c.titulo}{c.experimentos.map((x) => <span key={x} className="ml-1.5 rounded-full border border-violet-900 bg-violet-950/40 px-1.5 py-0.5 text-[10.5px] text-violet-200">durante {x}</span>)}</p>
                    {c.detalle && <p className="mt-0.5 line-clamp-3 text-[12.5px] text-gray-400">{c.detalle}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
          {d.cambios.length > 8 && (
            <button type="button" onClick={() => setTodosCambios(!todosCambios)} className="min-h-[40px] rounded-lg border border-gray-700 px-3 text-[13px] text-gray-200 hover:bg-gray-800">
              {todosCambios ? "Ver solo los últimos 8" : `Ver los ${d.cambios.length} cambios`}
            </button>
          )}

          {terminados.length > 0 && (
            <>
              <h2 className="pt-2 text-base font-semibold text-white">Experimentos terminados</h2>
              {terminados.map((e) => <TarjetaExperimento key={e.id} e={e} alListo={cargar} />)}
            </>
          )}
        </>
      )}
    </MarcoInteligencia>
  );
}
