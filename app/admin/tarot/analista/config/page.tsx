"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, ArrowLeft, Check, Database, Eye, FileSpreadsheet, History, Lock, Save, Trash2, Upload } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Configuración del Analista de conversión (2026-11-01): modelo y
// profundidad, qué datos analiza (y verlos tal cual los recibe la IA),
// contexto del negocio, reglas de rigor, tope de gasto, bitácora de cambios
// y exportaciones CSV de Meta.

interface Config { modelo: string; esfuerzo: string; fuentes: Record<string, boolean>; contexto_negocio: string; minimo_visitas: number; tope_mensual_usd: number | null; updated_at: string }
interface Fuente { clave: string; descripcion: string; activa: boolean; desde: string | null; registros_30d: number | null }
interface Modelo { id: string; nombre: string; calidad: string; costo_estimado_usd: Record<string, number> }
interface Bitacora { id: string; fecha: string; categoria: string; descripcion: string }
interface Csv { id: string; nombre_archivo: string; desglose: string; periodo_desde: string | null; periodo_hasta: string | null; columnas: string[]; notas: string | null; created_at: string; filas_total: number }
interface Respuesta { ok: boolean; config: Config; catalogo: Fuente[]; modelos: Modelo[]; esfuerzos: Record<string, string>; bitacora: Bitacora[]; csvs: Csv[]; clave_configurada: boolean }

const CATEGORIAS: Record<string, string> = { publicidad: "Publicidad", web: "Web", precio: "Precio", producto: "Producto", otro: "Otro" };
const DESGLOSES: Record<string, string> = { general: "General (sin desglose)", edad_sexo: "Edad y sexo", ubicacion: "Ubicación (plataforma)", region: "Región", hora: "Hora del día", otro: "Otro" };
const NOMBRE_FUENTE: Record<string, string> = {
  trafico: "Tráfico", calidad: "Calidad de la visita", embudo: "Embudo", formulario: "Formulario del checkout", secciones: "Secciones de /tarot",
  ventas: "Ventas", postcompra: "Post-compra", meta_csv: "CSVs de Meta", bitacora: "Bitácora de cambios", memoria: "Memoria del analista", contenido_web: "Contenido de la web",
};
const TC = 40;
const hoyUY = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const fechaCorta = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Montevideo" }) : "—");

export default function AnalistaConfigPage() {
  const [d, setD] = useState<Respuesta | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState<{ paquete: unknown; caracteres: number; tokens_aprox: number } | null>(null);
  const [vistaDias, setVistaDias] = useState(7);
  const [cargandoVista, setCargandoVista] = useState(false);
  const [nueva, setNueva] = useState({ fecha: hoyUY(), categoria: "publicidad", descripcion: "" });
  const [csv, setCsv] = useState<{ archivo: File | null; desglose: string; notas: string }>({ archivo: null, desglose: "edad_sexo", notas: "" });
  const [subiendo, setSubiendo] = useState(false);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/admin/tarot/analista/config", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`); return; }
    setD(j);
    setCfg((c) => c ?? { ...j.config, fuentes: Object.fromEntries(j.catalogo.map((f: Fuente) => [f.clave, f.activa])) });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const post = async (cuerpo: Record<string, unknown>) => {
    setErrorMsg(null);
    const r = await fetch("/api/admin/tarot/analista/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`); return null; }
    return j;
  };
  const avisar = (t: string) => { setAviso(t); setTimeout(() => setAviso(null), 3500); };

  const guardar = async () => {
    if (!cfg) return;
    setGuardando(true);
    const ok = await post({ accion: "guardar_config", config: cfg });
    setGuardando(false);
    if (ok) { avisar("Configuración guardada."); setVista(null); cargar(); }
  };

  const verPaquete = async () => {
    setCargandoVista(true);
    const r = await fetch(`/api/admin/tarot/analista/config?vista_previa=${vistaDias}`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    setCargandoVista(false);
    if (j?.ok) setVista(j); else setErrorMsg(j?.detalle ?? "No se pudo armar la vista previa.");
  };

  const agregarBitacora = async () => {
    if (await post({ accion: "agregar_bitacora", ...nueva })) { setNueva({ ...nueva, descripcion: "" }); avisar("Cambio agregado a la bitácora."); cargar(); }
  };

  const subirCsv = async () => {
    if (!csv.archivo) return;
    if (!/\.csv$/i.test(csv.archivo.name)) { setErrorMsg("Subí el archivo en formato CSV (en Meta: Exportar → CSV)."); return; }
    setSubiendo(true);
    const texto = await csv.archivo.text();
    const j = await post({ accion: "subir_csv", nombre_archivo: csv.archivo.name, desglose: csv.desglose, notas: csv.notas, texto });
    setSubiendo(false);
    if (j) { avisar(`CSV cargado: ${j.filas} filas, ${j.columnas} columnas.`); setCsv({ archivo: null, desglose: csv.desglose, notas: "" }); cargar(); }
  };

  const modeloSel = d?.modelos.find((m) => m.id === cfg?.modelo);
  const costoSel = modeloSel && cfg ? modeloSel.costo_estimado_usd[cfg.esfuerzo] : null;

  return (
    <TarotAdminShell>
      <main className="px-6 py-6 max-w-[1100px]">
        <Link href={"/admin/tarot/analista" as Route} className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 mb-3"><ArrowLeft size={13} /> Analista de conversión</Link>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Configuración del analista</h2>
            <p className="text-xs text-gray-500 mt-0.5">Qué modelo usa, qué datos mira y qué contexto tiene para analizar.</p>
          </div>
          <button onClick={guardar} disabled={guardando || !cfg}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-700 bg-amber-900/40 px-4 py-2 text-sm text-amber-100 hover:bg-amber-800/50 disabled:opacity-50">
            <Save size={14} /> {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>

        {d && !d.clave_configurada && (
          <div className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-200">
            Falta <span className="font-mono">ANTHROPIC_API_KEY_PANEL_ADMIN</span> en Vercel para generar informes. Lo demás de esta pantalla funciona igual.
          </div>
        )}
        {aviso && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-4 py-2.5 text-xs text-emerald-200"><Check size={13} /> {aviso}</div>}
        {errorMsg && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300"><AlertCircle size={15} className="shrink-0" /> {errorMsg}</div>}

        {!cfg || !d ? <p className="text-sm text-gray-500">Cargando…</p> : (
          <div className="space-y-6">
            {/* Modelo */}
            <Bloque titulo="Modelo de IA" bajada="Más capacidad = mejor razonamiento y más costo por informe. El costo real de cada informe queda registrado.">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {d.modelos.map((m) => (
                  <button key={m.id} onClick={() => setCfg({ ...cfg, modelo: m.id })}
                    className={`text-left rounded-lg border px-3 py-2.5 ${cfg.modelo === m.id ? "border-amber-600 bg-amber-950/30" : "border-gray-800 hover:border-gray-700"}`}>
                    <p className={`text-sm font-medium ${cfg.modelo === m.id ? "text-amber-200" : "text-gray-200"}`}>{m.nombre}</p>
                    <p className="text-[11.5px] text-gray-500">{m.calidad}</p>
                    <p className="mt-1.5 text-[11.5px] text-gray-400 tabular-nums">~US$ {m.costo_estimado_usd[cfg.esfuerzo]?.toFixed(2)} por informe</p>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xs text-gray-500">Profundidad del análisis</span>
                <div className="inline-flex rounded-lg border border-gray-800 p-0.5">
                  {Object.entries(d.esfuerzos).map(([k, v]) => (
                    <button key={k} onClick={() => setCfg({ ...cfg, esfuerzo: k })}
                      className={`px-3 py-1 text-xs rounded-md ${cfg.esfuerzo === k ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>{v}</button>
                  ))}
                </div>
                {costoSel != null && <span className="text-xs text-gray-400">Estimado: <span className="text-gray-200">US$ {costoSel.toFixed(2)}</span> (~$ {Math.round(costoSel * TC)} pesos) por informe</span>}
              </div>
            </Bloque>

            {/* Fuentes */}
            <Bloque titulo="Qué datos analiza" bajada="Prendé o apagá cada fuente. Las cifras son de los últimos 30 días.">
              <div className="rounded-xl border border-gray-800 divide-y divide-gray-800/70">
                {d.catalogo.map((f) => (
                  <label key={f.clave} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-900/40">
                    <input type="checkbox" checked={cfg.fuentes[f.clave] !== false} onChange={(e) => setCfg({ ...cfg, fuentes: { ...cfg.fuentes, [f.clave]: e.target.checked } })} className="h-4 w-4 accent-amber-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200">{NOMBRE_FUENTE[f.clave] ?? f.clave}</p>
                      <p className="text-[11.5px] text-gray-500">{f.descripcion}</p>
                    </div>
                    <div className="text-right text-[11.5px] tabular-nums">
                      <p className={f.registros_30d ? "text-gray-300" : "text-gray-600"}>{f.registros_30d == null ? "—" : `${f.registros_30d.toLocaleString("es-UY")} registros`}</p>
                      {f.desde && <p className="text-gray-600">desde {fechaCorta(f.desde)}</p>}
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-gray-300"><Lock size={12} className="text-emerald-400" /> Lo que nunca se manda</p>
                <p className="mt-1 text-[12px] text-gray-500 leading-relaxed">Nombres, emails, teléfonos, fechas de nacimiento, preguntas de los clientes, IP ni textos escritos en el formulario. Solo conteos y comportamientos agregados, sin tus propios dispositivos.</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={verPaquete} disabled={cargandoVista} className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-60">
                  <Eye size={13} /> {cargandoVista ? "Armando…" : "Ver exactamente lo que se le manda a la IA"}
                </button>
                <select value={vistaDias} onChange={(e) => setVistaDias(Number(e.target.value))} className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-300">
                  {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>últimos {n} días</option>)}
                </select>
                <span className="text-[11px] text-gray-600">(con la configuración guardada)</span>
              </div>
              {vista && (
                <div className="mt-2">
                  <p className="text-[11px] text-gray-500 mb-1"><Database size={11} className="inline mr-1" />{vista.caracteres.toLocaleString("es-UY")} caracteres · ~{vista.tokens_aprox.toLocaleString("es-UY")} tokens de entrada</p>
                  <pre className="max-h-[420px] overflow-auto rounded-lg border border-gray-800 bg-gray-950 p-3 text-[11px] text-gray-400">{JSON.stringify(vista.paquete, null, 2)}</pre>
                </div>
              )}
            </Bloque>

            {/* Contexto */}
            <Bloque titulo="Contexto del negocio" bajada="Lo que el analista tiene que saber y no está en los datos: objetivos, público, ideas que querés validar, restricciones.">
              <textarea value={cfg.contexto_negocio} onChange={(e) => setCfg({ ...cfg, contexto_negocio: e.target.value })} rows={6} maxLength={4000}
                placeholder="Ej.: Objetivo de noviembre: 20 ventas. Público principal: mujeres de 25 a 55. Presupuesto en Meta: $300 por día. No quiero bajar el precio de $690."
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-700" />
              <p className="mt-1 text-right text-[11px] text-gray-600">{cfg.contexto_negocio.length}/4000</p>
            </Bloque>

            {/* Rigor y gasto */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Bloque titulo="Reglas de rigor" bajada="Con menos visitas que esto, el analista no afirma conclusiones: dice que no alcanza y cuánto falta.">
                <div className="flex items-center gap-2">
                  <input type="number" min={10} max={10000} value={cfg.minimo_visitas} onChange={(e) => setCfg({ ...cfg, minimo_visitas: Number(e.target.value) })}
                    className="w-28 rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200" />
                  <span className="text-xs text-gray-500">visitas mínimas para concluir</span>
                </div>
              </Bloque>
              <Bloque titulo="Tope de gasto" bajada="Si se llega al tope en el mes, no deja generar más informes. Vacío = sin tope.">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">US$</span>
                  <input type="number" min={0} max={1000} step={1} value={cfg.tope_mensual_usd ?? ""} onChange={(e) => setCfg({ ...cfg, tope_mensual_usd: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-28 rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200" placeholder="sin tope" />
                  <span className="text-xs text-gray-500">por mes</span>
                </div>
              </Bloque>
            </div>

            {/* Bitácora */}
            <Bloque titulo="Bitácora de cambios" icono={History} bajada="Anotá cada cambio importante (campaña, página, precio). Así el analista separa el efecto de un cambio de la casualidad. Se guarda al tocar “Agregar”.">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input type="date" value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200 [color-scheme:dark]" />
                <select value={nueva.categoria} onChange={(e) => setNueva({ ...nueva, categoria: e.target.value })} className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200">
                  {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input value={nueva.descripcion} onChange={(e) => setNueva({ ...nueva, descripcion: e.target.value })} maxLength={500} placeholder="Qué cambiaste (ej.: subí el presupuesto a $400 por día)"
                  onKeyDown={(e) => e.key === "Enter" && nueva.descripcion.trim().length >= 3 && agregarBitacora()}
                  className="flex-1 min-w-[240px] rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200 placeholder:text-gray-600" />
                <button onClick={agregarBitacora} disabled={nueva.descripcion.trim().length < 3} className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-40">Agregar</button>
              </div>
              <div className="rounded-xl border border-gray-800 divide-y divide-gray-800/70">
                {d.bitacora.length === 0 && <p className="px-4 py-4 text-xs text-gray-500">Sin cambios anotados.</p>}
                {d.bitacora.map((b) => (
                  <div key={b.id} className="group flex items-start gap-3 px-4 py-2.5">
                    <span className="w-16 shrink-0 text-[11.5px] text-gray-500 tabular-nums">{fechaCorta(b.fecha)}</span>
                    <span className="w-20 shrink-0 text-[11px] text-gray-400">{CATEGORIAS[b.categoria] ?? b.categoria}</span>
                    <p className="flex-1 text-[12.5px] text-gray-200 leading-relaxed">{b.descripcion}</p>
                    <button onClick={async () => { if (confirm("¿Borrar este cambio de la bitácora?") && (await post({ accion: "borrar_bitacora", id: b.id }))) cargar(); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400" aria-label="Borrar"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </Bloque>

            {/* CSVs de Meta */}
            <div id="meta">
              <Bloque titulo="Exportaciones de Meta (CSV)" icono={FileSpreadsheet} bajada="Gasto, alcance, clics y compras de tus anuncios. Subí un archivo por cada desglose.">
                <details className="mb-3 rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-2.5">
                  <summary className="cursor-pointer text-xs text-gray-300">Cómo exportarlo de Meta</summary>
                  <ol className="mt-2 space-y-1 text-[12px] text-gray-400 list-decimal pl-4 leading-relaxed">
                    <li>Administrador de anuncios → tu campaña → nivel <b>Anuncios</b> o <b>Conjuntos</b>.</li>
                    <li>Rango de fechas: desde que empezó la campaña hasta hoy.</li>
                    <li>Columnas → Personalizar: importe gastado, impresiones, alcance, frecuencia, clics en el enlace, CTR, CPC, visitas a la página de destino, pagos iniciados y compras.</li>
                    <li>Botón <b>Desglose</b> → elegí uno (Edad y sexo, Ubicación, Región u Hora).</li>
                    <li>Informes → <b>Exportar datos de la tabla</b> → formato <b>.csv</b>.</li>
                    <li>Subilo acá indicando qué desglose es. Repetí para cada desglose.</li>
                  </ol>
                </details>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <label className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 cursor-pointer">
                    <Upload size={13} /> {csv.archivo ? csv.archivo.name : "Elegir archivo .csv"}
                    <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => setCsv({ ...csv, archivo: e.target.files?.[0] ?? null })} />
                  </label>
                  <select value={csv.desglose} onChange={(e) => setCsv({ ...csv, desglose: e.target.value })} className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200">
                    {Object.entries(DESGLOSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input value={csv.notas} onChange={(e) => setCsv({ ...csv, notas: e.target.value })} maxLength={500} placeholder="Nota opcional (ej.: antes de sacar Audience Network)"
                    className="flex-1 min-w-[220px] rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200 placeholder:text-gray-600" />
                  <button onClick={subirCsv} disabled={!csv.archivo || subiendo} className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-40">{subiendo ? "Subiendo…" : "Subir"}</button>
                </div>
                <div className="rounded-xl border border-gray-800 divide-y divide-gray-800/70">
                  {d.csvs.length === 0 && <p className="px-4 py-4 text-xs text-gray-500">Todavía no subiste ningún CSV.</p>}
                  {d.csvs.map((c) => (
                    <div key={c.id} className="group flex items-start gap-3 px-4 py-2.5">
                      <FileSpreadsheet size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] text-gray-200 truncate">{c.nombre_archivo}</p>
                        <p className="text-[11px] text-gray-500">
                          {DESGLOSES[c.desglose] ?? c.desglose} · {c.filas_total} filas · {c.columnas.length} columnas
                          {c.periodo_desde && <> · {fechaCorta(c.periodo_desde)} al {fechaCorta(c.periodo_hasta)}</>} · subido {fechaCorta(c.created_at)}
                        </p>
                        {c.notas && <p className="text-[11px] text-gray-400 mt-0.5">{c.notas}</p>}
                      </div>
                      <button onClick={async () => { if (confirm("¿Borrar este CSV?") && (await post({ accion: "borrar_csv", id: c.id }))) cargar(); }}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400" aria-label="Borrar"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              </Bloque>
            </div>

            <div className="flex justify-end">
              <button onClick={guardar} disabled={guardando}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-700 bg-amber-900/40 px-4 py-2 text-sm text-amber-100 hover:bg-amber-800/50 disabled:opacity-50">
                <Save size={14} /> {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}
      </main>
    </TarotAdminShell>
  );
}

function Bloque({ titulo, bajada, icono: Icon, children }: { titulo: string; bajada?: string; icono?: typeof History; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/30 p-5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-100">{Icon && <Icon size={14} className="text-amber-400" />}{titulo}</h3>
      {bajada && <p className="text-[12px] text-gray-500 mt-0.5 mb-3">{bajada}</p>}
      {children}
    </section>
  );
}
