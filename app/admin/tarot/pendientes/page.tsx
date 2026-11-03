"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, Check, ChevronDown, ChevronRight, ExternalLink, ListTodo, Plus, Radar, Scale, Trash2, X } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import {
  AREAS_PENDIENTE, ESTADOS_ACTIVOS, ESTADOS_PENDIENTE, RESPONSABLES, estaVencido, venceHoy,
  type AreaPendiente, type EstadoPendiente, type Pendiente, type Senal,
} from "@/lib/pendientes";

// Pendientes (2026-11-02): lo que hay que hacer, en un solo lugar. Lista propia
// + señales de Normativa y Meta Ads que se pueden convertir en pendiente. El
// Asistente CEO avisa de los vencidos y de los de prioridad alta.

const PRIO: Record<string, { label: string; dot: string }> = {
  alta: { label: "Alta", dot: "bg-red-400" }, media: { label: "Media", dot: "bg-amber-400" }, baja: { label: "Baja", dot: "bg-gray-500" },
};
const ORDEN_PRIO: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const fmtVence = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;
const input = "w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white placeholder:text-gray-600";
const sel = "rounded border border-gray-700 bg-gray-900 px-1.5 py-1 text-[11px] text-gray-200";

type Form = { id?: string; titulo: string; detalle: string; area: AreaPendiente; responsable: string; prioridad: string; vence: string; enlace: string; notas: string };
const VACIO: Form = { titulo: "", detalle: "", area: "otros", responsable: "manuel", prioridad: "media", vence: "", enlace: "", notas: "" };

function orden(a: Pendiente, b: Pendiente) {
  const v = Number(estaVencido(b)) - Number(estaVencido(a));
  if (v) return v;
  const h = Number(venceHoy(b)) - Number(venceHoy(a));
  if (h) return h;
  const p = ORDEN_PRIO[a.prioridad] - ORDEN_PRIO[b.prioridad];
  if (p) return p;
  return (a.vence ?? "9999") < (b.vence ?? "9999") ? -1 : (a.vence ?? "9999") > (b.vence ?? "9999") ? 1 : 0;
}

export default function PendientesPage() {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [senales, setSenales] = useState<Senal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<"activos" | "cerrados">("activos");
  const [responsable, setResponsable] = useState("");
  const [area, setArea] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [verSenales, setVerSenales] = useState(true);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/admin/tarot/pendientes", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setPendientes(r.pendientes); setSenales(r.senales); setError(null); } else setError(r?.detalle ?? r?.motivo ?? "No se pudieron cargar los pendientes.");
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function enviar(metodo: "POST" | "PATCH", cuerpo: Record<string, unknown>) {
    const r = await fetch("/api/admin/tarot/pendientes", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) })
      .then((x) => x.json()).catch(() => null);
    if (!r?.ok) setError(r?.motivo === "ya_existe" ? "Ese aviso ya está en tus pendientes." : r?.detalle ?? r?.motivo ?? "No se pudo guardar.");
    await cargar();
    return !!r?.ok;
  }
  async function borrar(id: string) {
    if (!confirm("¿Borrar este pendiente? Si solo ya no aplica, mejor marcalo como Descartado.")) return;
    await fetch(`/api/admin/tarot/pendientes?id=${id}`, { method: "DELETE" });
    cargar();
  }
  async function guardarForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const { id, ...resto } = form;
    if (await enviar(id ? "PATCH" : "POST", id ? { id, ...resto } : resto)) setForm(null);
  }
  const convertir = (s: Senal) =>
    enviar("POST", { titulo: s.titulo, detalle: s.detalle, area: s.area, prioridad: s.prioridad, enlace: s.enlace, origen: s.origen, origen_ref: s.origen_ref, responsable: "manuel" });

  const lista = useMemo(() => pendientes
    .filter((p) => (vista === "activos" ? ESTADOS_ACTIVOS.includes(p.estado) : !ESTADOS_ACTIVOS.includes(p.estado)))
    .filter((p) => !responsable || p.responsable === responsable)
    .filter((p) => !area || p.area === area)
    .sort(vista === "activos" ? orden : (a, b) => (b.resuelto_at ?? b.updated_at).localeCompare(a.resuelto_at ?? a.updated_at)), [pendientes, vista, responsable, area]);

  const activos = pendientes.filter((p) => ESTADOS_ACTIVOS.includes(p.estado));
  const vencidos = activos.filter(estaVencido).length;
  const hoy = activos.filter(venceHoy).length;
  const altas = activos.filter((p) => p.prioridad === "alta").length;
  const senalesNuevas = senales.filter((s) => !s.ya_es_pendiente);

  return (
    <TarotAdminShell>
      <div className="p-6 max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white"><ListTodo size={18} className="text-amber-400" /> Pendientes</h1>
            <p className="text-xs text-gray-500">Lo que hay que hacer, en un solo lugar. El Asistente CEO avisa de los vencidos y de los de prioridad alta.</p>
          </div>
          <button onClick={() => setForm({ ...VACIO })} className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-gray-950 hover:bg-amber-400">
            <Plus size={14} /> Nuevo pendiente
          </button>
        </div>

        {error && <p className="flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-200"><AlertCircle size={14} /> {error}</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Activos", activos.length, "text-white"],
            ["Vencidos", vencidos, vencidos ? "text-red-300" : "text-white"],
            ["Vencen hoy", hoy, hoy ? "text-amber-300" : "text-white"],
            ["Prioridad alta", altas, "text-white"],
          ].map(([k, v, c]) => (
            <div key={k as string} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
              <p className="text-[11px] text-gray-500">{k}</p><p className={`mt-1 text-lg font-semibold ${c}`}>{v}</p>
            </div>
          ))}
        </div>

        {senales.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <button onClick={() => setVerSenales(!verSenales)} className="flex w-full items-center justify-between text-left">
              <span className="text-sm font-semibold text-white">Avisos de otros módulos <span className="font-normal text-gray-500">· {senalesNuevas.length} sin convertir</span></span>
              {verSenales ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
            </button>
            {verSenales && (
              <ul className="mt-3 space-y-2">
                {senales.map((s) => (
                  <li key={s.origen_ref} className="flex items-start gap-3 rounded-lg border border-gray-800 bg-black/20 px-3 py-2">
                    {s.origen === "normativa" ? <Scale size={14} className="mt-0.5 shrink-0 text-gray-400" /> : <Radar size={14} className="mt-0.5 shrink-0 text-sky-300" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-200"><span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${PRIO[s.prioridad].dot}`} />{s.titulo}</p>
                      <p className="text-[11px] text-gray-500">{s.origen === "normativa" ? "Normativa" : "Meta Ads"} · {s.detalle}</p>
                    </div>
                    <Link href={s.enlace as Route} className="shrink-0 text-[11px] text-sky-300 hover:underline">ver</Link>
                    {s.ya_es_pendiente
                      ? <span className="shrink-0 text-[11px] text-emerald-400">ya en pendientes</span>
                      : <button onClick={() => convertir(s)} className="shrink-0 rounded border border-gray-700 px-2 py-0.5 text-[11px] text-gray-200 hover:border-gray-500">+ pendiente</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {(["activos", "cerrados"] as const).map((v) => (
            <button key={v} onClick={() => setVista(v)} className={`rounded-md border px-3 py-1 text-xs ${vista === v ? "border-amber-500/60 bg-amber-500/10 text-amber-200" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
              {v === "activos" ? "Activos" : "Resueltos y descartados"}
            </button>
          ))}
          <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={`${sel} ml-auto`}>
            <option value="">Todos los responsables</option>
            {Object.entries(RESPONSABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={area} onChange={(e) => setArea(e.target.value)} className={sel}>
            <option value="">Todas las áreas</option>
            {Object.entries(AREAS_PENDIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          {lista.length === 0 && <p className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-6 text-center text-xs text-gray-500">Nada por acá.</p>}
          {lista.map((p) => {
            const vencido = estaVencido(p), hoyV = venceHoy(p), abierto = !!abiertos[p.id];
            return (
              <div key={p.id} className={`rounded-xl border px-4 py-3 ${vencido ? "border-red-900/60 bg-red-950/15" : "border-gray-800 bg-gray-900/60"}`}>
                <div className="flex flex-wrap items-start gap-3">
                  {ESTADOS_ACTIVOS.includes(p.estado) && (
                    <button onClick={() => enviar("PATCH", { id: p.id, estado: "resuelto" })} title="Marcar como resuelto"
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-600 text-transparent hover:border-emerald-500 hover:text-emerald-400">
                      <Check size={12} />
                    </button>
                  )}
                  <button onClick={() => setAbiertos({ ...abiertos, [p.id]: !abierto })} className="min-w-0 flex-1 text-left">
                    <p className={`text-sm ${ESTADOS_ACTIVOS.includes(p.estado) ? "text-gray-100" : "text-gray-500 line-through"}`}>
                      <span className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${PRIO[p.prioridad].dot}`} title={`Prioridad ${PRIO[p.prioridad].label}`} />
                      {p.titulo}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-gray-500">
                      <span>{AREAS_PENDIENTE[p.area]}</span>
                      <span>{RESPONSABLES[p.responsable]}</span>
                      {p.vence && <span className={vencido ? "font-semibold text-red-300" : hoyV ? "font-semibold text-amber-300" : ""}>{vencido ? "venció" : hoyV ? "vence hoy" : "vence"} {fmtVence(p.vence)}</span>}
                      {p.origen !== "manual" && <span className="text-sky-400/80">desde {p.origen === "meta_ads" ? "Meta Ads" : p.origen === "normativa" ? "Normativa" : "Asistente"}</span>}
                      {p.estado !== "abierto" && <span className="text-gray-400">{ESTADOS_PENDIENTE[p.estado]}</span>}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.enlace && (p.enlace.startsWith("/")
                      ? <Link href={p.enlace as Route} className="text-[11px] text-sky-300 hover:underline">ir</Link>
                      : <a href={p.enlace} target="_blank" rel="noreferrer" className="text-sky-300"><ExternalLink size={12} /></a>)}
                    <select value={p.estado} onChange={(e) => enviar("PATCH", { id: p.id, estado: e.target.value as EstadoPendiente })} className={sel}>
                      {Object.entries(ESTADOS_PENDIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                {abierto && (
                  <div className="mt-2 pl-8 text-xs text-gray-400">
                    {p.detalle && <p className="whitespace-pre-line leading-relaxed">{p.detalle}</p>}
                    {p.notas && <p className="mt-1.5 whitespace-pre-line text-gray-500">Notas: {p.notas}</p>}
                    <div className="mt-2 flex gap-3">
                      <button onClick={() => setForm({ id: p.id, titulo: p.titulo, detalle: p.detalle ?? "", area: p.area, responsable: p.responsable, prioridad: p.prioridad, vence: p.vence ?? "", enlace: p.enlace ?? "", notas: p.notas ?? "" })}
                        className="text-[11px] text-sky-300 hover:underline">editar</button>
                      <button onClick={() => borrar(p.id)} className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-300"><Trash2 size={11} /> borrar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setForm(null)}>
          <form onSubmit={guardarForm} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg space-y-3 rounded-xl border border-gray-700 bg-gray-950 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">{form.id ? "Editar pendiente" : "Nuevo pendiente"}</p>
              <button type="button" onClick={() => setForm(null)} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
            </div>
            <input autoFocus required minLength={3} maxLength={160} className={input} placeholder="Qué hay que hacer" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            <textarea rows={3} className={input} placeholder="Detalle (opcional)" value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <select className={input} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value as AreaPendiente })}>
                {Object.entries(AREAS_PENDIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className={input} value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })}>
                {Object.entries(RESPONSABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className={input} value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
                <option value="alta">Prioridad alta</option><option value="media">Prioridad media</option><option value="baja">Prioridad baja</option>
              </select>
              <input type="date" className={input} value={form.vence} onChange={(e) => setForm({ ...form, vence: e.target.value })} title="Vence (opcional)" />
            </div>
            <input className={input} placeholder="Enlace (opcional): /admin/... o https://..." value={form.enlace} onChange={(e) => setForm({ ...form, enlace: e.target.value })} />
            <textarea rows={2} className={input} placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300">Cancelar</button>
              <button type="submit" className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-gray-950 hover:bg-amber-400">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </TarotAdminShell>
  );
}
