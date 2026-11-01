"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, ArrowLeft, Brain, Check, ListChecks, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Memoria del Analista de conversión (2026-11-01): "lo que ya sabemos"
// (aprendizajes que la IA guarda sola en cada informe, más los de Manuel;
// todo editable) y el plan de acción con todas las recomendaciones, su
// estado y la evaluación de si funcionaron. Todo esto alimenta cada informe.

type Confianza = "alta" | "media" | "baja";
type EstadoRec = "pendiente" | "en_curso" | "hecha" | "descartada";
type Veredicto = "funciono" | "no_funciono" | "sin_datos_aun" | "no_aplica";
interface Aprendizaje {
  id: string; texto: string; area: string; confianza: Confianza; evidencia: string | null; origen: "ia" | "manual";
  activo: boolean; motivo_baja: string | null; created_at: string; updated_at: string;
}
interface Rec {
  id: string; informe_id: string; prioridad: number | null; accion: string; donde: string | null; impacto: string | null; esfuerzo: string | null;
  estado: EstadoRec; nota: string | null; estado_at: string | null; evaluacion_veredicto: Veredicto | null; evaluacion_texto: string | null;
  created_at: string; informe: { created_at: string; foco: string } | null;
}

const AREAS: Record<string, string> = { trafico: "Tráfico", pagina: "Página", checkout: "Checkout", pago: "Pago", postcompra: "Post-compra", oferta: "Oferta", medicion: "Medición", otro: "Otro" };
const CONFIANZA_CLS: Record<Confianza, string> = { alta: "text-emerald-300 border-emerald-800/60", media: "text-amber-200 border-amber-800/50", baja: "text-gray-400 border-gray-700" };
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
const DONDE: Record<string, string> = { meta: "Meta", pagina_tarot: "Página de tarot", checkout: "Checkout", oferta: "Oferta", postcompra: "Post-compra", medicion: "Medición", otro: "Otro" };
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: "America/Montevideo" }) : "—");
const VACIO = { texto: "", area: "trafico", confianza: "media" as Confianza, evidencia: "" };

export default function AnalistaMemoriaPage() {
  const [aprendizajes, setAprendizajes] = useState<Aprendizaje[] | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(VACIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState(VACIO);
  const [filtroRec, setFiltroRec] = useState<EstadoRec | "abiertas" | "todas">("abiertas");
  const [verDescartados, setVerDescartados] = useState(false);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/admin/tarot/analista/memoria", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`); return; }
    setAprendizajes(j.aprendizajes);
    setRecs(j.recomendaciones);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const post = async (url: string, cuerpo: Record<string, unknown>) => {
    setErrorMsg(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`); return false; }
    await cargar();
    return true;
  };
  const memoria = (cuerpo: Record<string, unknown>) => post("/api/admin/tarot/analista/memoria", cuerpo);

  const vigentes = (aprendizajes ?? []).filter((a) => a.activo);
  const descartados = (aprendizajes ?? []).filter((a) => !a.activo);
  const porArea = Object.keys(AREAS).map((k) => ({ k, items: vigentes.filter((a) => a.area === k) })).filter((g) => g.items.length);
  const recsFiltradas = recs.filter((r) => filtroRec === "todas" || (filtroRec === "abiertas" ? r.estado === "pendiente" || r.estado === "en_curso" : r.estado === filtroRec));
  const cuenta = (e: EstadoRec) => recs.filter((r) => r.estado === e).length;

  return (
    <TarotAdminShell>
      <main className="px-6 py-6 max-w-[1100px]">
        <Link href={"/admin/tarot/analista" as Route} className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 mb-3"><ArrowLeft size={13} /> Analista de conversión</Link>
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-100">Memoria y plan de acción</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">Lo que el analista ya sabe de tu negocio y todo lo que te recomendó. Cada informe nuevo parte de acá: compara, evalúa lo que hiciste y actualiza lo aprendido.</p>
        </div>
        {errorMsg && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300"><AlertCircle size={15} className="shrink-0" /> {errorMsg}</div>}

        {/* Lo que ya sabemos */}
        <section className="mb-8">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-100"><Brain size={15} className="text-violet-300" /> Lo que ya sabemos <span className="text-gray-600 font-normal">{vigentes.length}</span></h3>
          <p className="text-[12px] text-gray-500 mb-3">La IA agrega y actualiza estos aprendizajes en cada informe. Si corregís uno, pasa a ser tuyo y la IA ya no lo cambia.</p>

          <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-3 mb-3">
            <p className="text-[11px] text-gray-500 mb-2">Agregar uno tuyo</p>
            <div className="flex flex-wrap gap-2">
              <input value={nuevo.texto} onChange={(e) => setNuevo({ ...nuevo, texto: e.target.value })} maxLength={600} placeholder="Ej.: Mis clientas llegan sobre todo por consultas de amor"
                className="flex-1 min-w-[260px] rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200 placeholder:text-gray-600" />
              <Selector valor={nuevo.area} opciones={AREAS} onChange={(v) => setNuevo({ ...nuevo, area: v })} />
              <Selector valor={nuevo.confianza} opciones={{ alta: "Confianza alta", media: "Confianza media", baja: "Confianza baja" }} onChange={(v) => setNuevo({ ...nuevo, confianza: v as Confianza })} />
              <button onClick={async () => { if (await memoria({ accion: "crear", ...nuevo })) setNuevo(VACIO); }} disabled={nuevo.texto.trim().length < 3}
                className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-40"><Plus size={12} /> Agregar</button>
            </div>
          </div>

          {aprendizajes === null ? <p className="text-sm text-gray-500">Cargando…</p> : vigentes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800 px-5 py-8 text-center text-xs text-gray-500">Todavía no hay aprendizajes. Se van a ir sumando con cada informe.</div>
          ) : (
            <div className="space-y-4">
              {porArea.map((g) => (
                <div key={g.k}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{AREAS[g.k]}</p>
                  <div className="rounded-xl border border-gray-800 divide-y divide-gray-800/70">
                    {g.items.map((a) => editando === a.id ? (
                      <div key={a.id} className="px-4 py-3 space-y-2">
                        <textarea value={borrador.texto} onChange={(e) => setBorrador({ ...borrador, texto: e.target.value })} rows={2} maxLength={600}
                          className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200" />
                        <input value={borrador.evidencia} onChange={(e) => setBorrador({ ...borrador, evidencia: e.target.value })} maxLength={1000} placeholder="Evidencia (opcional)"
                          className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-300 placeholder:text-gray-600" />
                        <div className="flex flex-wrap items-center gap-2">
                          <Selector valor={borrador.area} opciones={AREAS} onChange={(v) => setBorrador({ ...borrador, area: v })} />
                          <Selector valor={borrador.confianza} opciones={{ alta: "Confianza alta", media: "Confianza media", baja: "Confianza baja" }} onChange={(v) => setBorrador({ ...borrador, confianza: v as Confianza })} />
                          <button onClick={async () => { if (await memoria({ accion: "editar", id: a.id, ...borrador })) setEditando(null); }}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-800 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-950/40"><Check size={12} /> Guardar</button>
                          <button onClick={() => setEditando(null)} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"><X size={12} /> Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div key={a.id} className="group px-4 py-3">
                        <div className="flex items-start gap-3">
                          <p className="flex-1 text-[13px] text-gray-100 leading-relaxed">{a.texto}</p>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                            <button onClick={() => { setEditando(a.id); setBorrador({ texto: a.texto, area: a.area, confianza: a.confianza, evidencia: a.evidencia ?? "" }); }} className="text-gray-500 hover:text-gray-200" aria-label="Editar"><Pencil size={12} /></button>
                            <button onClick={() => { const motivo = prompt("¿Por qué lo descartás? (opcional)") ?? undefined; if (motivo !== undefined) memoria({ accion: "descartar", id: a.id, motivo: motivo || undefined }); }} className="text-gray-500 hover:text-amber-300" aria-label="Descartar"><X size={13} /></button>
                          </div>
                        </div>
                        {a.evidencia && <p className="mt-1 text-[11.5px] text-gray-500 leading-relaxed">Evidencia: {a.evidencia}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10.5px]">
                          <span className={`rounded border px-1.5 py-0.5 ${CONFIANZA_CLS[a.confianza]}`}>confianza {a.confianza}</span>
                          <span className="text-gray-500">{a.origen === "ia" ? "La IA" : "Vos"} · {fecha(a.updated_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {descartados.length > 0 && (
            <div className="mt-3">
              <button onClick={() => setVerDescartados((v) => !v)} className="text-xs text-gray-500 hover:text-gray-300">{verDescartados ? "Ocultar" : "Ver"} descartados ({descartados.length})</button>
              {verDescartados && (
                <div className="mt-2 rounded-xl border border-gray-800 divide-y divide-gray-800/70">
                  {descartados.map((a) => (
                    <div key={a.id} className="group flex items-start gap-3 px-4 py-2.5">
                      <div className="flex-1">
                        <p className="text-[12.5px] text-gray-400 line-through decoration-gray-600">{a.texto}</p>
                        {a.motivo_baja && <p className="text-[11.5px] text-gray-500">Motivo: {a.motivo_baja}</p>}
                      </div>
                      <button onClick={() => memoria({ accion: "reactivar", id: a.id })} className="text-gray-500 hover:text-gray-200" aria-label="Reactivar"><RotateCcw size={12} /></button>
                      <button onClick={() => { if (confirm("¿Borrar definitivamente?")) memoria({ accion: "borrar", id: a.id }); }} className="text-gray-600 hover:text-red-400" aria-label="Borrar"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Plan de acción */}
        <section>
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-100"><ListChecks size={15} className="text-amber-400" /> Plan de acción</h3>
          <p className="text-[12px] text-gray-500 mb-3">Todas las recomendaciones de todos los informes. Marcá lo que hiciste: queda en la bitácora y el próximo informe evalúa si funcionó.</p>
          <div className="mb-3 inline-flex flex-wrap rounded-lg border border-gray-800 p-0.5">
            {([["abiertas", `Abiertas (${cuenta("pendiente") + cuenta("en_curso")})`], ["hecha", `Hechas (${cuenta("hecha")})`], ["descartada", `Descartadas (${cuenta("descartada")})`], ["todas", `Todas (${recs.length})`]] as const).map(([k, v]) => (
              <button key={k} onClick={() => setFiltroRec(k)} className={`px-2.5 py-1 text-xs rounded-md ${filtroRec === k ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>{v}</button>
            ))}
          </div>
          <div className="rounded-xl border border-gray-800 divide-y divide-gray-800/70">
            {recsFiltradas.length === 0 && <p className="px-4 py-6 text-center text-xs text-gray-500">Nada para mostrar acá.</p>}
            {recsFiltradas.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-2">
                  <p className="flex-1 min-w-[240px] text-[13px] text-gray-100 leading-snug">{r.accion}</p>
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(ESTADO_REC) as EstadoRec[]).map((e) => (
                      <button key={e} onClick={() => post("/api/admin/tarot/analista", { accion: "recomendacion_estado", id: r.id, estado: e, nota: r.nota ?? "" })}
                        className={`rounded-md border px-2 py-0.5 text-[11px] ${r.estado === e ? ESTADO_REC[e].cls : "border-gray-800 text-gray-500 hover:text-gray-300"}`}>{ESTADO_REC[e].texto}</button>
                    ))}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                  <span>Informe del {fecha(r.informe?.created_at ?? r.created_at)}</span>
                  {r.donde && <span>· {DONDE[r.donde] ?? r.donde}</span>}
                  {r.impacto && <span>· impacto {r.impacto}</span>}
                  {r.estado_at && r.estado !== "pendiente" && <span>· {ESTADO_REC[r.estado].texto.toLowerCase()} el {fecha(r.estado_at)}</span>}
                  {r.nota && <span className="text-gray-400">· “{r.nota}”</span>}
                </div>
                {r.evaluacion_veredicto && (
                  <p className="mt-1.5 text-[12px] leading-relaxed"><span className={`font-semibold ${VEREDICTO[r.evaluacion_veredicto].cls}`}>{VEREDICTO[r.evaluacion_veredicto].texto}:</span> <span className="text-gray-300">{r.evaluacion_texto}</span></p>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </TarotAdminShell>
  );
}

function Selector({ valor, opciones, onChange }: { valor: string; opciones: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200">
      {Object.entries(opciones).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}
