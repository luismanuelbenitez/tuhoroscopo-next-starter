"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronDown, Database, FileText, Loader2, MessageSquare, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { MarkdownSimple } from "@/components/admin/MarkdownSimple";

// Estratega de anuncios (2026-11-04). Una IA (Claude) que primero lee "Qué
// sabe" (documentos editables acá) y después consulta los datos del negocio
// ("Qué datos ve", solo lectura). Chat + informe semanal (lunes 9:00, sin
// email). Sus propuestas quedan para aceptar o descartar; aceptadas pasan a
// Pendientes y a "Decisiones tomadas". No toca Meta, Google ni clientes.

interface Documento { clave: string; titulo: string; descripcion: string | null; contenido: string; updated_at: string; updated_por: string }
interface Conversacion { id: string; titulo: string | null; updated_at: string }
interface Consulta { herramienta: string; entrada: unknown; error: boolean; caracteres: number }
interface Mensaje { id: string; rol: "user" | "assistant"; texto: string; estado: "generando" | "listo" | "error"; consultas: Consulta[]; costo_usd: number | null; duracion_ms: number | null; error: string | null; created_at: string }
interface Propuesta { id: string; mensaje_id: string | null; informe_id: string | null; titulo: string; detalle: string; prioridad: string; estado: "propuesta" | "aceptada" | "descartada"; created_at: string }
interface InformeFila { id: string; semana: string; origen: string; estado: string; costo_usd: number | null; error: string | null; created_at: string }
interface Informe extends InformeFila { texto: string | null; consultas: Consulta[] }
interface Herramienta { name: string; titulo: string; description: string; vista_previa: boolean }
interface Datos { ok: boolean; motivo?: string; configurado: boolean; modelo: string; documentos: Documento[]; conversaciones: Conversacion[]; informes: InformeFila[]; propuestas: Propuesta[]; herramientas: Herramienta[] }

type Pestana = "chat" | "informe" | "sabe" | "datos";
const PESTANAS: { id: Pestana; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "informe", label: "Informe semanal", icon: FileText },
  { id: "sabe", label: "Qué sabe", icon: BookOpen },
  { id: "datos", label: "Qué datos ve", icon: Database },
];
const SUGERENCIAS = [
  "¿Dónde pongo la plata esta semana: Meta o Google?",
  "¿Cómo va el exp 2 de Meta? ¿Lo pauso?",
  "Armame el experimento 3 de Meta, pantalla por pantalla.",
  "¿Cuánto puedo pagar por cliente y cómo vengo?",
];

const fechaHora = (s: string) => new Date(s).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" });
const usd = (n: number | null) => (n == null ? "" : `US$ ${Number(n).toFixed(2)}`);
const segundos = (ms: number | null) => (ms == null ? "" : `${Math.round(ms / 1000)} s`);
const NOMBRES: Record<string, string> = { economia: "Economía", embudo: "Embudo", sesiones: "Visitas", meta_ads: "Meta Ads", google_ads: "Google Ads", experimentos: "Campañas", pendientes: "Pendientes", proponer: "Propuesta" };
const detalleEntrada = (e: unknown) => {
  if (!e || typeof e !== "object") return "";
  const v = Object.entries(e as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== null && x !== "").map(([k, x]) => (k === "titulo" || k === "detalle" ? null : `${k}: ${String(x)}`)).filter(Boolean);
  return v.join(", ");
};

async function api<T>(init?: RequestInit, query = ""): Promise<T> {
  const r = await fetch(`/api/admin/tarot/estratega${query}`, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({ ok: false, motivo: `HTTP ${r.status}` }));
  if (!r.ok || j.ok === false) throw new Error(j.detalle ?? j.motivo ?? `HTTP ${r.status}`);
  return j as T;
}
const post = <T,>(body: Record<string, unknown>) => api<T>({ method: "POST", body: JSON.stringify(body) });

function Consultas({ consultas }: { consultas: Consulta[] }) {
  const [abierto, setAbierto] = useState(false);
  const datos = consultas.filter((c) => c.herramienta !== "proponer");
  if (!datos.length) return null;
  return (
    <div className="mt-3 border-t border-gray-800 pt-2">
      <button onClick={() => setAbierto((v) => !v)} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300">
        <Database size={11} /> Consultó {datos.length} {datos.length === 1 ? "dato" : "datos"}
        <ChevronDown size={11} className={abierto ? "rotate-180" : ""} />
      </button>
      {abierto && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-gray-400">
          {datos.map((c, i) => (
            <li key={i} className={c.error ? "text-red-300" : ""}>
              <span className="text-gray-300">{NOMBRES[c.herramienta] ?? c.herramienta}</span>
              {detalleEntrada(c.entrada) ? <span className="text-gray-500"> · {detalleEntrada(c.entrada)}</span> : null}
              {c.error ? " · error" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TarjetaPropuesta({ p, alCambiar }: { p: Propuesta; alCambiar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actuar = async (accion: "aceptar_propuesta" | "descartar_propuesta") => {
    setOcupado(true); setError(null);
    try { await post({ accion, id: p.id }); alCambiar(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setOcupado(false); }
  };
  const color = p.estado === "aceptada" ? "border-emerald-900/70 bg-emerald-950/30" : p.estado === "descartada" ? "border-gray-800 bg-gray-900/40 opacity-60" : "border-violet-900/60 bg-violet-950/25";
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setAbierta((v) => !v)} className="text-left">
          <p className="text-[13px] font-medium text-white">{p.titulo}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            Propuesta · prioridad {p.prioridad}
            {p.estado === "aceptada" ? " · aceptada, está en Pendientes" : p.estado === "descartada" ? " · descartada" : ""}
          </p>
        </button>
        <ChevronDown size={14} className={`mt-1 shrink-0 text-gray-500 ${abierta ? "rotate-180" : ""}`} />
      </div>
      {abierta && <MarkdownSimple texto={p.detalle} className="mt-2 text-[13px]" />}
      {p.estado === "propuesta" && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button disabled={ocupado} onClick={() => actuar("aceptar_propuesta")} className="flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"><Check size={12} /> Aceptar</button>
          <button disabled={ocupado} onClick={() => actuar("descartar_propuesta")} className="flex items-center gap-1 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"><X size={12} /> Descartar</button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}

function Burbuja({ m, propuestas, alCambiar }: { m: Mensaje; propuestas: Propuesta[]; alCambiar: () => void }) {
  if (m.rol === "user") {
    return <div className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-violet-700/80 px-3.5 py-2.5 text-sm text-white">{m.texto}</div>;
  }
  return (
    <div className="max-w-full rounded-2xl rounded-bl-sm border border-gray-800 bg-gray-900/70 px-3.5 py-3 sm:max-w-[92%]">
      {m.estado === "generando" ? (
        <p className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> Leyendo lo que sabe y consultando los datos… (1 a 2 minutos)</p>
      ) : m.estado === "error" ? (
        <p className="text-sm text-red-300">No pudo responder: {m.error}</p>
      ) : (
        <MarkdownSimple texto={m.texto} />
      )}
      {propuestas.length > 0 && <div className="mt-3 space-y-2">{propuestas.map((p) => <TarjetaPropuesta key={p.id} p={p} alCambiar={alCambiar} />)}</div>}
      {m.estado === "listo" && (
        <>
          <Consultas consultas={m.consultas ?? []} />
          <p className="mt-1 text-[10px] text-gray-600">{[usd(m.costo_usd), segundos(m.duracion_ms)].filter(Boolean).join(" · ")}</p>
        </>
      )}
    </div>
  );
}

function Chat({ d, recargar }: { d: Datos; recargar: () => void }) {
  const [convId, setConvId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async (id: string) => {
    const r = await api<{ mensajes: Mensaje[]; propuestas: Propuesta[] }>(undefined, `?conversacion=${id}`);
    setMensajes(r.mensajes); setPropuestas(r.propuestas);
  }, []);
  useEffect(() => { if (convId) cargar(convId).catch((e) => setError(String(e))); else { setMensajes([]); setPropuestas([]); } }, [convId, cargar]);
  // Mientras haya una respuesta generándose, se consulta cada 4 s.
  const generando = mensajes.some((m) => m.estado === "generando");
  useEffect(() => {
    if (!generando || !convId) return;
    const t = setInterval(() => cargar(convId).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [generando, convId, cargar]);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [mensajes.length, generando]);

  const enviar = async (t = texto) => {
    const q = t.trim();
    if (!q || enviando) return;
    setEnviando(true); setError(null);
    try {
      const r = await post<{ conversacion_id: string; pregunta: Mensaje; respuesta: Mensaje }>({ accion: "preguntar", texto: q, conversacion_id: convId });
      setTexto("");
      if (r.conversacion_id !== convId) { setConvId(r.conversacion_id); recargar(); }
      else setMensajes((ms) => [...ms, r.pregunta, r.respuesta]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setEnviando(false); }
  };
  const borrar = async (id: string) => {
    if (!confirm("¿Borrar esta conversación?")) return;
    await post({ accion: "borrar_conversacion", id }).catch(() => {});
    if (convId === id) setConvId(null);
    recargar();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <div className="space-y-2">
        <button onClick={() => setConvId(null)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-800/70 bg-violet-950/40 px-3 py-2 text-sm text-violet-200 hover:bg-violet-900/40"><Plus size={14} /> Nueva conversación</button>
        {d.conversaciones.length > 0 && (
          <>
            {/* Móvil: lista desplegable; escritorio: columna. */}
            <select value={convId ?? ""} onChange={(e) => setConvId(e.target.value || null)} className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200 lg:hidden">
              <option value="">Conversaciones anteriores…</option>
              {d.conversaciones.map((c) => <option key={c.id} value={c.id}>{c.titulo ?? "Sin título"}</option>)}
            </select>
            <ul className="hidden space-y-1 lg:block">
              {d.conversaciones.map((c) => (
                <li key={c.id} className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs ${convId === c.id ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-900"}`}>
                  <button onClick={() => setConvId(c.id)} className="min-w-0 flex-1 text-left"><p className="truncate">{c.titulo ?? "Sin título"}</p><p className="text-[10px] text-gray-600">{fechaHora(c.updated_at)}</p></button>
                  <button onClick={() => borrar(c.id)} aria-label="Borrar" className="hidden text-gray-600 hover:text-red-300 group-hover:block"><Trash2 size={12} /></button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="flex min-h-[60vh] flex-col rounded-xl border border-gray-800 bg-gray-950/40">
        <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          {!mensajes.length && (
            <div className="py-6 text-center">
              <p className="text-sm text-gray-300">Preguntale sobre tus anuncios, ventas o costos.</p>
              <p className="mt-1 text-xs text-gray-500">Antes de responder lee &quot;Qué sabe&quot; y consulta los datos de la base. Cada respuesta cuesta entre US$ 0,10 y US$ 0,50.</p>
              <div className="mx-auto mt-4 grid max-w-xl gap-2 sm:grid-cols-2">
                {SUGERENCIAS.map((s) => <button key={s} onClick={() => enviar(s)} disabled={enviando || !d.configurado} className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-left text-[13px] text-gray-300 hover:border-violet-800 hover:text-white disabled:opacity-50">{s}</button>)}
              </div>
            </div>
          )}
          {mensajes.map((m) => <Burbuja key={m.id} m={m} propuestas={propuestas.filter((p) => p.mensaje_id === m.id)} alCambiar={() => convId && cargar(convId)} />)}
          <div ref={fin} />
        </div>
        <div className="border-t border-gray-800 p-2.5 sm:p-3">
          {error && <p className="mb-2 text-xs text-red-300">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={4000}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              placeholder={d.configurado ? "Escribí tu pregunta…" : "Falta la clave de Anthropic del panel en Vercel"}
              disabled={!d.configurado || generando}
              className="min-h-[44px] flex-1 resize-none rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-[15px] text-white placeholder:text-gray-600 focus:border-violet-700 focus:outline-none disabled:opacity-60"
            />
            <button onClick={() => enviar()} disabled={!texto.trim() || enviando || generando || !d.configurado} aria-label="Enviar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-700 text-white hover:bg-violet-600 disabled:opacity-40">
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InformeSemanal({ d, recargar }: { d: Datos; recargar: () => void }) {
  const [elegido, setElegido] = useState<string | null>(d.informes[0]?.id ?? null);
  const [inf, setInf] = useState<Informe | null>(null);
  const [props, setProps] = useState<Propuesta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async (id: string) => {
    const r = await api<{ informe: Informe; propuestas: Propuesta[] }>(undefined, `?informe=${id}`);
    setInf(r.informe); setProps(r.propuestas);
  }, []);
  useEffect(() => { if (elegido) cargar(elegido).catch((e) => setError(String(e))); }, [elegido, cargar]);
  useEffect(() => {
    if (inf?.estado !== "generando" || !elegido) return;
    const t = setInterval(() => cargar(elegido).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [inf?.estado, elegido, cargar]);
  useEffect(() => { if (inf && inf.estado !== "generando") recargar(); }, [inf?.estado]); // eslint-disable-line react-hooks/exhaustive-deps

  const generar = async () => {
    setError(null);
    try { const r = await post<{ informe: InformeFila }>({ accion: "generar_informe" }); setElegido(r.informe.id); recargar(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={generar} disabled={!d.configurado || inf?.estado === "generando"} className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"><RefreshCw size={14} /> Generar ahora</button>
        {d.informes.length > 0 && (
          <select value={elegido ?? ""} onChange={(e) => setElegido(e.target.value)} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200">
            {d.informes.map((i) => <option key={i.id} value={i.id}>{fechaHora(i.created_at)} · {i.origen === "cron" ? "automático" : "a pedido"}{i.estado !== "listo" ? ` · ${i.estado}` : ""}</option>)}
          </select>
        )}
        <p className="w-full text-xs text-gray-500 sm:w-auto">Se arma solo los lunes a las 9:00. Queda acá, no se manda por mail.</p>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {!d.informes.length && !inf && <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 text-sm text-gray-400">Todavía no hay informes. El primero sale el lunes, o tocá &quot;Generar ahora&quot; (cuesta unos US$ 0,50).</p>}
      {inf && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 sm:p-5">
          {inf.estado === "generando" ? (
            <p className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> Armando el informe: consulta ventas, embudo, Meta y Google… (2 a 4 minutos)</p>
          ) : inf.estado === "error" ? (
            <p className="text-sm text-red-300">No se pudo armar: {inf.error}</p>
          ) : (
            <MarkdownSimple texto={inf.texto ?? ""} />
          )}
          {props.length > 0 && <div className="mt-4 space-y-2">{props.map((p) => <TarjetaPropuesta key={p.id} p={p} alCambiar={() => elegido && cargar(elegido)} />)}</div>}
          {inf.estado === "listo" && <><Consultas consultas={inf.consultas ?? []} /><p className="mt-1 text-[10px] text-gray-600">{[usd(inf.costo_usd), segundos((inf as Informe & { duracion_ms?: number }).duracion_ms ?? null)].filter(Boolean).join(" · ")}</p></>}
        </div>
      )}
    </div>
  );
}

function DocumentoItem({ doc, alGuardar }: { doc: Documento; alGuardar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(doc.contenido);
  const [estado, setEstado] = useState<string | null>(null);
  useEffect(() => { if (!editando) setTexto(doc.contenido); }, [doc.contenido, editando]);
  const guardar = async () => {
    setEstado("Guardando…");
    try { await post({ accion: "guardar_documento", clave: doc.clave, contenido: texto }); setEditando(false); setEstado("Guardado"); alGuardar(); }
    catch (e) { setEstado(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <div>
          <p className="text-sm font-semibold text-white">{doc.titulo}</p>
          {doc.descripcion && <p className="mt-0.5 text-xs text-gray-400">{doc.descripcion}</p>}
          <p className="mt-1 text-[10px] text-gray-600">Actualizado {fechaHora(doc.updated_at)} por {doc.updated_por === "manuel" ? "vos" : "Claude"}</p>
        </div>
        <ChevronDown size={16} className={`mt-0.5 shrink-0 text-gray-500 ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className="border-t border-gray-800 p-4">
          {editando ? (
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={18} className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-[13px] leading-relaxed text-gray-200 focus:border-violet-700 focus:outline-none" />
          ) : (
            <MarkdownSimple texto={doc.contenido} />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {editando ? (
              <>
                <button onClick={guardar} className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600">Guardar</button>
                <button onClick={() => { setEditando(false); setTexto(doc.contenido); }} className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">Cancelar</button>
              </>
            ) : (
              <button onClick={() => { setEditando(true); setEstado(null); }} className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">Editar</button>
            )}
            {estado && <span className="text-xs text-gray-400">{estado}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function QueDatosVe({ d }: { d: Datos }) {
  const [vista, setVista] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState<string | null>(null);
  const ver = async (name: string) => {
    if (vista[name]) { setVista((v) => { const n = { ...v }; delete n[name]; return n; }); return; }
    setCargando(name);
    try {
      const r = await api<{ resultado: string }>(undefined, `?vista_previa=${name}`);
      let lindo = r.resultado;
      try { lindo = JSON.stringify(JSON.parse(r.resultado), null, 2); } catch { /* queda como vino */ }
      setVista((v) => ({ ...v, [name]: lindo.length > 8000 ? `${lindo.slice(0, 8000)}\n…` : lindo }));
    } catch (e) { setVista((v) => ({ ...v, [name]: `Error: ${e instanceof Error ? e.message : String(e)}` })); }
    finally { setCargando(null); }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">Estas son todas las consultas que puede hacer la IA. Son de solo lectura y no traen nombres, teléfonos ni emails de clientes. Con &quot;Ver ejemplo&quot; ves exactamente lo que recibe.</p>
      {d.herramientas.map((h) => (
        <div key={h.name} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold text-white">{h.titulo}</p>
            {h.vista_previa && (
              <button onClick={() => ver(h.name)} className="flex items-center gap-1 rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800">
                {cargando === h.name ? <Loader2 size={12} className="animate-spin" /> : null}{vista[h.name] ? "Ocultar" : "Ver ejemplo"}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">{h.description}</p>
          {vista[h.name] && <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-gray-950 p-3 text-[11px] leading-snug text-gray-300">{vista[h.name]}</pre>}
        </div>
      ))}
      <p className="text-xs text-gray-500">Google Ads: hoy ve lo que mide la web. El gasto, las palabras clave y los términos de búsqueda se suman cuando conectes la cuenta (<Link href="/admin/tarot/pendientes" className="text-violet-300 underline">Pendientes &quot;Google Ads API&quot;</Link>).</p>
    </div>
  );
}

export default function EstrategaPage() {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("chat");
  const cargar = useCallback(() => { api<Datos>().then(setD).catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const abiertas = d?.propuestas.length ?? 0;

  return (
    <TarotAdminShell>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Estratega de anuncios</h1>
          <p className="mt-1 text-sm text-gray-400">Claude lee lo que sabe del negocio, consulta tus datos y te dice dónde poner la plata. Propone; vos decidís y ejecutás.</p>
        </div>
        {error && <p className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
        {d && !d.configurado && <p className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-sm text-amber-200">Falta la clave de Anthropic del panel (ANTHROPIC_API_KEY_PANEL_ADMIN) en Vercel: sin ella no puede responder.</p>}
        {abiertas > 0 && pestana !== "chat" && pestana !== "informe" && (
          <p className="rounded-lg border border-violet-900/60 bg-violet-950/25 p-3 text-sm text-violet-200">{abiertas === 1 ? "Hay 1 propuesta" : `Hay ${abiertas} propuestas`} esperando que la aceptes o descartes (en el chat o el informe).</p>
        )}
        <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-gray-800 px-4 sm:mx-0 sm:px-0">
          {PESTANAS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setPestana(id)} className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${pestana === id ? "border-violet-500 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {!d ? (
          <p className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> Cargando…</p>
        ) : pestana === "chat" ? (
          <Chat d={d} recargar={cargar} />
        ) : pestana === "informe" ? (
          <InformeSemanal d={d} recargar={cargar} />
        ) : pestana === "sabe" ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Lo que la IA lee antes de cada respuesta. Corregí lo que esté mal o sumá lo que sepas: lo tiene en cuenta desde la próxima pregunta.</p>
            {d.documentos.map((doc) => <DocumentoItem key={doc.clave} doc={doc} alGuardar={cargar} />)}
          </div>
        ) : (
          <QueDatosVe d={d} />
        )}
      </div>
    </TarotAdminShell>
  );
}
