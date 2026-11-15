"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Info, RefreshCw, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { MarcoGoogleAds } from "@/components/admin/googleAds/gobernanza/Marco";

// Google Ads · Palabras del mercado (2026-11-15). Cuánta gente busca cada
// frase por mes (Planificador de Google), en Uruguay y en EE. UU., separada
// por tema y por intención: quién puede comprar, quién busca gratis, quién
// quiere aprender. Sirve para elegir grupos, páginas y títulos con datos.

type Mercado = "uy" | "us";
type Intencion = "compra" | "gratis" | "aprender" | "otro_servicio" | "fuera";
type Tema = "general" | "amor" | "decisiones" | "trabajo";
type Fila = { texto: string; mensual: number; rango: [number, number] | null; competencia: string | null; cpc_bajo: number | null; cpc_alto: number | null; tendencia: number | null; intencion: Intencion; tema: Tema; en_campana: boolean; ya_aparecio: boolean; fuente: string };
type Resumen = { tema: Tema; total: number; compra: number; gratis: number; aprender: number; cpc_medio: number | null; principal: string | null; top: { texto: string; mensual: number; en_campana: boolean }[]; oportunidades: { texto: string; mensual: number }[] };
type Datos = { ok: boolean; motivo?: string; mercado: Mercado; nombre: string; idioma: string; semillas: string[]; acceso: "ok" | "sin_basic" | "error" | "sin_probar"; consultas: { fuente: string; filas: number; ok: boolean; error: string | null; created_at: string }[]; filas: Fila[]; resumen: Resumen[]; hay_rangos: boolean };

const TEMA: Record<Tema, string> = { general: "Tarot general", amor: "Tarot del amor", decisiones: "Decisiones (sí o no)", trabajo: "Trabajo y dinero" };
const INTENCION: Record<Intencion, { label: string; clase: string }> = {
  compra: { label: "Puede comprar", clase: "border-emerald-900 bg-emerald-950/40 text-emerald-200" },
  gratis: { label: "Busca gratis", clase: "border-gray-700 bg-gray-900 text-gray-300" },
  aprender: { label: "Quiere aprender", clase: "border-sky-900 bg-sky-950/40 text-sky-200" },
  otro_servicio: { label: "Otro servicio", clase: "border-gray-700 bg-gray-900 text-gray-400" },
  fuera: { label: "No es tarot", clase: "border-gray-800 bg-gray-950 text-gray-500" },
};
const COMP: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta" };
const entero = (n: number) => Math.round(n).toLocaleString("es-UY");
const usd = (n: number | null) => (n == null ? "—" : `US$ ${n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fechaHora = (s: string) => new Date(s).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" });

function Volumen({ f }: { f: Fila }) {
  return f.rango ? <span title={`Entre ${entero(f.rango[0])} y ${entero(f.rango[1])}`}>{entero(f.rango[0])}–{entero(f.rango[1])}</span> : <>{entero(f.mensual)}</>;
}

function Pasos({ d }: { d: Datos }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => { try { await navigator.clipboard.writeText(d.semillas.join("\n")); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin portapapeles */ } };
  return (
    <details className="rounded-xl border border-gray-800 bg-gray-950/50 p-3.5" open={!d.filas.length}>
      <summary className="cursor-pointer text-[13px] font-semibold text-gray-200">Cómo cargarlo a mano desde el Planificador ({d.nombre})</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-gray-300">
        <li>Google Ads → <b>Herramientas</b> → <b>Planificador de palabras clave</b> → <b>Obtener volumen de búsqueda y previsiones</b>.</li>
        <li>Pegá la lista de abajo. Ubicación: <b>{d.nombre}</b>. Idioma: <b>{d.idioma}</b>.</li>
        <li>En <b>Volumen y previsiones históricos</b>, tocá <b>Descargar</b> (CSV) y subilo acá con «Subir archivo».</li>
        <li>Opcional: repetí con <b>Descubrir nuevas palabras clave</b> para sumar las ideas de Google.</li>
      </ol>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={copiar} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-[12.5px] text-gray-200 hover:bg-gray-800">
          {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? "Copiada" : `Copiar la lista (${d.semillas.length})`}
        </button>
      </div>
    </details>
  );
}

export function MercadoPalabras() {
  const [mercado, setMercado] = useState<Mercado>("uy");
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [fTema, setFTema] = useState<Tema | "">("");
  const [fInt, setFInt] = useState<Intencion | "relevantes">("relevantes");
  const [buscar, setBuscar] = useState("");
  const [mostrar, setMostrar] = useState(60);
  const archivoRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch(`/api/admin/tarot/google-ads/mercado?mercado=${mercado}`, { cache: "no-store" });
      const j = (await r.json()) as Datos;
      if (!r.ok || !j.ok) throw new Error(j.motivo ?? `HTTP ${r.status}`);
      setD(j);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setCargando(false);
  }, [mercado]);
  useEffect(() => { setD(null); setMostrar(60); void cargar(); }, [cargar]);

  const consultar = async () => {
    setCargando(true); setAviso(null);
    try {
      const r = await fetch("/api/admin/tarot/google-ads/mercado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "consultar", mercado }) });
      const j = await r.json();
      setAviso(j.ok ? { tipo: "ok", texto: `Listo: ${entero(j.filas)} frases actualizadas.` }
        : { tipo: "error", texto: j.motivo === "sin_acceso_basic" ? "Google todavía no habilitó el acceso Basic: por ahora, subí el archivo del Planificador." : `Google respondió: ${j.detalle ?? j.motivo}` });
    } catch (e) { setAviso({ tipo: "error", texto: e instanceof Error ? e.message : String(e) }); }
    await cargar();
  };

  const subir = async (archivo: File) => {
    setCargando(true); setAviso(null);
    try {
      const fd = new FormData(); fd.append("mercado", mercado); fd.append("archivo", archivo);
      const r = await fetch("/api/admin/tarot/google-ads/mercado", { method: "POST", body: fd });
      const j = await r.json();
      setAviso(j.ok ? { tipo: "ok", texto: `Archivo cargado: ${entero(j.filas)} frases.` } : { tipo: "error", texto: j.detalle ?? j.motivo ?? "No se pudo leer el archivo." });
    } catch (e) { setAviso({ tipo: "error", texto: e instanceof Error ? e.message : String(e) }); }
    if (archivoRef.current) archivoRef.current.value = "";
    await cargar();
  };

  const filas = useMemo(() => {
    if (!d) return [];
    const q = buscar.trim().toLowerCase();
    return d.filas.filter((f) => (!fTema || f.tema === fTema) && (fInt === "relevantes" ? f.intencion !== "fuera" : f.intencion === fInt) && (!q || f.texto.toLowerCase().includes(q)));
  }, [d, fTema, fInt, buscar]);
  const totalCompra = d?.resumen.reduce((s, r) => s + r.compra, 0) ?? 0;

  return (
    <MarcoGoogleAds
      bajada="Cuánta gente busca cada frase por mes, separada por tema y por intención. Con esto se eligen las palabras de cada grupo, la página y el título."
      extra={
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Mercado" className="flex rounded-lg border border-gray-700 p-0.5">
            {(["uy", "us"] as Mercado[]).map((m) => (
              <button key={m} role="tab" aria-selected={mercado === m} onClick={() => setMercado(m)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${mercado === m ? "bg-sky-600 text-white" : "text-gray-300 hover:text-white"}`}>
                {m === "uy" ? "Uruguay" : "EE. UU."}
              </button>
            ))}
          </div>
          <button onClick={consultar} disabled={cargando} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-[13px] text-gray-200 hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw size={14} className={cargando ? "animate-spin" : ""} /> Consultar a Google
          </button>
          <button onClick={() => archivoRef.current?.click()} disabled={cargando} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-[13px] text-gray-200 hover:bg-gray-800 disabled:opacity-50">
            <Upload size={14} /> Subir archivo
          </button>
          <input ref={archivoRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); }} />
        </div>
      }
    >
      {error && <p className="rounded-xl border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200">No se pudieron cargar los datos ({error}).</p>}
      {aviso && <p className={`rounded-xl border p-3 text-sm ${aviso.tipo === "ok" ? "border-emerald-900 bg-emerald-950/30 text-emerald-200" : "border-amber-900 bg-amber-950/30 text-amber-200"}`}>{aviso.texto}</p>}
      {!d && !error && <p className="text-sm text-gray-400">Cargando…</p>}
      {d && (
        <>
          {d.acceso === "sin_basic" && (
            <div className="flex gap-2 rounded-xl border border-amber-900/70 bg-amber-950/20 p-3.5 text-[13px] text-amber-100">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
              <p><b>La consulta automática está esperando a Google.</b> Nuestro acceso a la API es «Explorer» y el Planificador pide «Basic»: se pide una vez a Google (pasos en Pendientes) y desde ahí se actualiza solo todos los lunes. Mientras tanto, el archivo del Planificador carga lo mismo.</p>
            </div>
          )}
          {d.acceso === "ok" && d.consultas[0] && (
            <p className="flex items-center gap-1.5 text-[12.5px] text-emerald-300"><CheckCircle2 size={14} /> Actualizado solo desde Google el {fechaHora(d.consultas.find((c) => c.fuente === "api")!.created_at)}. Se renueva los lunes.</p>
          )}
          {!d.filas.length ? <Pasos d={d} /> : (
            <>
              {/* Resumen por tema */}
              <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-4">
                <p className="text-[13px] text-gray-400">En {d.nombre}, por mes, buscan algo que podemos vender</p>
                <p className="mt-0.5 text-3xl font-bold tabular-nums text-white">{entero(totalCompra)} <span className="text-base font-medium text-gray-400">búsquedas</span></p>
                {d.hay_rangos && <p className="mt-1 text-[12px] text-gray-500">Google mostró algunos volúmenes en rangos: se usa un valor intermedio.</p>}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {d.resumen.filter((r) => r.total > 0).map((r) => (
                  <section key={r.tema} className="rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-900/80 to-gray-950/60 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-base font-bold text-white">{TEMA[r.tema]}</h2>
                      <span className="text-[12px] text-gray-400">clic medio {usd(r.cpc_medio)}</span>
                    </div>
                    <p className="mt-1 text-[13px] text-gray-300"><span className="text-xl font-bold tabular-nums text-emerald-300">{entero(r.compra)}</span> búsquedas/mes que pueden comprar</p>
                    <p className="text-[12px] text-gray-500">de {entero(r.total)} en total · {entero(r.gratis)} buscan gratis · {entero(r.aprender)} quieren aprender</p>
                    {r.principal && <p className="mt-2 text-[13px] text-gray-300">Frase principal: <span className="font-semibold text-white">«{r.principal}»</span> → título de la página y del anuncio.</p>}
                    {r.top.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {r.top.map((t) => (
                          <li key={t.texto} className="flex items-center justify-between gap-2 text-[12.5px]">
                            <span className="truncate text-gray-200">{t.texto}</span>
                            <span className="flex shrink-0 items-center gap-2 tabular-nums text-gray-300">{entero(t.mensual)}{t.en_campana ? <span className="rounded border border-emerald-900 px-1 text-[10.5px] text-emerald-300">en campaña</span> : <span className="rounded border border-amber-900 px-1 text-[10.5px] text-amber-300">falta</span>}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>

              {/* Tabla */}
              <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar frase…" aria-label="Buscar frase" className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500" />
                  <select value={fTema} onChange={(e) => setFTema(e.target.value as Tema | "")} aria-label="Tema" className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-2 text-sm text-white">
                    <option value="">Todos los temas</option>{(Object.keys(TEMA) as Tema[]).map((t) => <option key={t} value={t}>{TEMA[t]}</option>)}
                  </select>
                  <select value={fInt} onChange={(e) => setFInt(e.target.value as Intencion | "relevantes")} aria-label="Intención" className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-2 text-sm text-white">
                    <option value="relevantes">Todo lo de tarot</option>{(Object.keys(INTENCION) as Intencion[]).map((i) => <option key={i} value={i}>{INTENCION[i].label}</option>)}
                  </select>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-[12.5px]">
                    <thead><tr className="text-left text-gray-400">
                      <th className="py-1.5 pr-3 font-medium">Frase</th><th className="py-1.5 pr-3 text-right font-medium">Búsquedas/mes</th><th className="py-1.5 pr-3 text-right font-medium">Tendencia</th>
                      <th className="py-1.5 pr-3 font-medium">Competencia</th><th className="py-1.5 pr-3 text-right font-medium">Clic</th><th className="py-1.5 pr-3 font-medium">Intención</th><th className="py-1.5 pr-3 font-medium">Tema</th><th className="py-1.5 font-medium">Campaña</th>
                    </tr></thead>
                    <tbody>
                      {filas.slice(0, mostrar).map((f) => (
                        <tr key={f.texto} className="border-t border-gray-800">
                          <td className="py-1.5 pr-3 text-gray-100">{f.texto}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-white"><Volumen f={f} /></td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{f.tendencia == null ? <span className="text-gray-600">—</span> : <span className={`inline-flex items-center gap-0.5 ${f.tendencia >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{f.tendencia >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{f.tendencia > 0 ? "+" : ""}{f.tendencia}%</span>}</td>
                          <td className="py-1.5 pr-3 text-gray-300">{f.competencia ? COMP[f.competencia] ?? f.competencia : "—"}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-gray-300">{f.cpc_bajo != null && f.cpc_alto != null ? `${f.cpc_bajo.toFixed(2)}–${f.cpc_alto.toFixed(2)}` : "—"}</td>
                          <td className="py-1.5 pr-3"><span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${INTENCION[f.intencion].clase}`}>{INTENCION[f.intencion].label}</span></td>
                          <td className="py-1.5 pr-3 whitespace-nowrap text-gray-300">{TEMA[f.tema]}</td>
                          <td className="py-1.5 whitespace-nowrap">{f.en_campana ? <span className="text-emerald-300">la tenemos</span> : f.ya_aparecio ? <span className="text-gray-400">apareció</span> : <span className="text-gray-600">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filas.length > mostrar && <button onClick={() => setMostrar((n) => n + 100)} className="mt-3 rounded-lg border border-gray-700 px-3 py-1.5 text-[12.5px] text-gray-200 hover:bg-gray-800">Ver más ({entero(filas.length - mostrar)})</button>}
                {!filas.length && <p className="text-[12.5px] text-gray-500">Nada con esos filtros.</p>}
              </div>
              <p className="flex gap-1.5 text-[12px] text-gray-500"><Info size={13} className="mt-0.5 shrink-0" /> Promedio de los últimos 12 meses según Google. «Clic»: lo que suele costar aparecer arriba (rango bajo–alto, en la moneda de la cuenta). La intención se calcula por las palabras de la frase: «gratis», «significado», nombres de cartas, horóscopo, etc.</p>
              <Pasos d={d} />
            </>
          )}
        </>
      )}
    </MarcoGoogleAds>
  );
}
