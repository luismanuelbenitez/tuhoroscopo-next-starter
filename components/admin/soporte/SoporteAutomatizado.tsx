"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, Check, CheckCircle2, Copy, Hand, Loader2, Play, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Soporte Automatizado · etapa 1 (2026-11-16). Cuando una clienta escribe por
// WhatsApp, el cerebro (IA) entiende qué quiere y propone una respuesta; los
// controles (sin IA) la revisan. Acá Manuel aprueba, edita o la toma él.
// ETAPA 1: no se envía nada. Aprobar arma el texto final (con el link o el
// código que agrega el sistema) para copiarlo en la bandeja de WhatsApp.

type Control = { tipo: "falla" | "ajuste" | "aviso"; texto: string };
type Caso = {
  id: string; conversacion_id: string; nombre: string | null; estado: string; intencion: string | null; confianza: number | null; riesgo: string | null;
  resumen: string | null; razon: string | null; accion: string | null; pregunta_sugerida: string | null; respuesta_ia: string | null; respuesta_final: string | null;
  controles: Control[]; contexto: Record<string, any>; modelo: string | null; tokens_entrada: number | null; tokens_salida: number | null; costo_usd: number | null;
  error: string | null; codigo_creado: string | null; created_at: string; config_version: number | null;
};
type Intencion = { nombre: string; modo: "borrador" | "humano" | "automatico"; descripcion: string };
type Config = {
  version: number; activo: boolean; modo_prueba: boolean; telefono_prueba: string; modelo: string; identidad: string; reglas: string[]; frases_prohibidas: string[];
  intenciones: Record<string, Intencion>; politica: { regla_descuento: string; ofrecer_descuento_en: string[]; max_descuento_cada_dias: number; texto_link: string };
  confianza_minima: number; max_mensajes_ia: number; largo_maximo: number;
};

const ESTADO: Record<string, { label: string; clase: string }> = {
  pendiente: { label: "Para aprobar", clase: "border-amber-800 bg-amber-950/40 text-amber-200" },
  humano: { label: "Para vos", clase: "border-red-900 bg-red-950/40 text-red-200" },
  error: { label: "Error", clase: "border-red-900 bg-red-950/40 text-red-200" },
  aprobado: { label: "Aprobado", clase: "border-emerald-800 bg-emerald-950/40 text-emerald-200" },
  editado: { label: "Aprobado con cambios", clase: "border-emerald-800 bg-emerald-950/40 text-emerald-200" },
  descartado: { label: "Descartado", clase: "border-gray-700 bg-gray-900 text-gray-400" },
};
const ACCION: Record<string, string> = {
  ninguna: "Solo responder", link_checkout: "Se agrega el link de una lectura nueva", descuento: "Se agrega código personal + link (Reglas comerciales)",
  reenviar_lectura: "Reenviar la lectura (desde Órdenes)", humano: "Pasa a una persona",
};
// La base guarda las intenciones como objeto (sin orden): se muestran en este orden.
const ORDEN = ["duda_lectura", "otra_pregunta", "problema_tecnico", "saludo", "reclamo", "sensible", "otro", "spam"];
const ordenadas = (o: Record<string, Intencion>) => Object.entries(o).sort(([a], [b]) => (ORDEN.indexOf(a) + 99 * +(ORDEN.indexOf(a) < 0)) - (ORDEN.indexOf(b) + 99 * +(ORDEN.indexOf(b) < 0)));
const hora = (s: string) => new Date(s).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" });
const campo = "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-[15px] text-gray-100 focus:border-amber-500 focus:outline-none";
const etiqueta = "mb-1 block text-[13px] text-gray-400";

function Copiar({ texto, label }: { texto: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* */ } }}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-700 px-3 text-[14px] text-gray-200 hover:bg-gray-800">
      {ok ? <Check size={15} /> : <Copy size={15} />} {ok ? "Copiado" : label}
    </button>
  );
}

function TarjetaCaso({ c, intenciones, alCambiar }: { c: Caso; intenciones: Record<string, Intencion>; alCambiar: () => void }) {
  const [texto, setTexto] = useState(c.respuesta_ia ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [final, setFinal] = useState<string | null>(c.respuesta_final);
  const [error, setError] = useState<string | null>(null);
  const resuelto = ["aprobado", "editado", "descartado"].includes(c.estado);
  const accionar = async (accion: string, extra: Record<string, unknown> = {}) => {
    setOcupado(true); setError(null);
    try {
      const r = await fetch("/api/admin/tarot/soporte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion, id: c.id, ...extra }) });
      const j = await r.json();
      if (!j.ok) setError(j.detalle ?? j.motivo ?? "No se pudo.");
      else { if (j.texto) setFinal(j.texto); alCambiar(); }
    } catch { setError("No se pudo."); }
    setOcupado(false);
  };
  const e = ESTADO[c.estado] ?? ESTADO.pendiente;
  return (
    <article className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[16px] font-semibold text-white">{c.nombre || "Sin nombre"} <span className="ml-1 text-[13px] font-normal text-gray-500">{hora(c.created_at)}</span></p>
        <span className={`rounded-full border px-2.5 py-0.5 text-[12.5px] ${e.clase}`}>{e.label}</span>
      </div>
      <div className="mt-3 rounded-xl border border-gray-800 bg-gray-950 p-3">
        <p className="text-[12.5px] text-gray-500">Escribió</p>
        <p className="whitespace-pre-wrap text-[15px] text-gray-100">{c.contexto?.ultimos_mensajes_clienta ?? "—"}</p>
      </div>
      {c.error ? (
        <p className="mt-3 flex items-start gap-2 text-[14px] text-red-300"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {c.error}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[12.5px]">
            {c.intencion && <span className="rounded-full border border-gray-700 px-2 py-0.5 text-gray-200">{intenciones[c.intencion]?.nombre ?? c.intencion}</span>}
            {c.confianza != null && <span className="rounded-full border border-gray-700 px-2 py-0.5 text-gray-300">Confianza {Math.round(Number(c.confianza) * 100)} %</span>}
            {c.riesgo && <span className={`rounded-full border px-2 py-0.5 ${c.riesgo === "alto" ? "border-red-900 text-red-300" : "border-gray-700 text-gray-300"}`}>Riesgo {c.riesgo}</span>}
            {c.contexto?.tiene_lectura === false && <span className="rounded-full border border-gray-700 px-2 py-0.5 text-gray-400">Sin lectura</span>}
          </div>
          {c.resumen && <p className="mt-2 text-[14.5px] text-gray-300"><b className="text-gray-200">Qué quiere:</b> {c.resumen}</p>}
          {c.razon && <p className="mt-1 text-[14.5px] text-gray-400"><b className="text-gray-300">Por qué responde así:</b> {c.razon}</p>}
          {c.controles?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {c.controles.map((k, i) => (
                <li key={i} className={`flex items-start gap-1.5 text-[13.5px] ${k.tipo === "falla" ? "text-red-300" : k.tipo === "ajuste" ? "text-amber-200" : "text-gray-400"}`}>
                  <ShieldCheck size={14} className="mt-0.5 shrink-0" /> {k.texto}
                </li>
              ))}
            </ul>
          )}
          {final ? (
            <div className="mt-3 rounded-xl border border-emerald-900 bg-emerald-950/20 p-3">
              <p className="mb-1 text-[12.5px] text-emerald-300">Texto final para mandar {c.codigo_creado && <>· código <b>{c.codigo_creado}</b></>}</p>
              <p className="whitespace-pre-wrap break-words text-[15px] text-gray-100">{final}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Copiar texto={final} label="Copiar" />
                <Link href="/admin/tarot/whatsapp" className="inline-flex min-h-[40px] items-center rounded-lg border border-gray-700 px-3 text-[14px] text-gray-200 hover:bg-gray-800">Ir a la bandeja</Link>
              </div>
            </div>
          ) : !resuelto && (
            <div className="mt-3">
              <span className={etiqueta}>Respuesta propuesta (podés editarla)</span>
              <textarea rows={5} value={texto} onChange={(ev) => setTexto(ev.target.value)} className={`${campo} resize-y`} />
              {c.accion && <p className="mt-1 text-[13px] text-gray-400">Acción: <b className="text-gray-200">{ACCION[c.accion] ?? c.accion}</b>{c.pregunta_sugerida ? ` · ejemplo de pregunta: "${c.pregunta_sugerida}"` : ""}</p>}
            </div>
          )}
        </>
      )}
      {!resuelto && !final && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!c.error && (
            <button disabled={ocupado || !texto.trim()} onClick={() => accionar("aprobar", { texto })}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-amber-500 px-4 text-[15px] font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60">
              {ocupado ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Aprobar
            </button>
          )}
          {c.estado !== "humano" && (
            <button disabled={ocupado} onClick={() => accionar("humano")} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-700 px-4 text-[15px] text-gray-200 hover:bg-gray-800"><Hand size={16} /> La tomo yo</button>
          )}
          <button disabled={ocupado} onClick={() => accionar("descartar")} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-800 px-4 text-[15px] text-gray-400 hover:bg-gray-800"><Trash2 size={16} /> Descartar</button>
        </div>
      )}
      {error && <p className="mt-2 text-[14px] text-red-300">{error}</p>}
      {c.modelo && <p className="mt-3 text-[12px] text-gray-600">{c.modelo} · v{c.config_version} · {(c.tokens_entrada ?? 0).toLocaleString("es-UY")} + {(c.tokens_salida ?? 0).toLocaleString("es-UY")} tokens · US$ {Number(c.costo_usd ?? 0).toFixed(4)}</p>}
    </article>
  );
}

function Casos() {
  const [filtro, setFiltro] = useState("pendientes");
  const [d, setD] = useState<{ casos: Caso[]; config: { activo: boolean; modo_prueba: boolean; version: number; modelo: string; intenciones: Record<string, Intencion> } | null } | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/admin/tarot/soporte?vista=casos&filtro=${filtro}`, { cache: "no-store" });
    const j = await r.json(); if (j.ok) setD(j);
  }, [filtro]);
  useEffect(() => { cargar(); }, [cargar]);
  const revisar = async () => {
    setRevisando(true); setAviso(null);
    try {
      const r = await fetch("/api/admin/tarot/soporte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "procesar" }) });
      const j = await r.json();
      const n = (j.resultados ?? []).filter((x: { resultado: string }) => x.resultado === "caso").length;
      setAviso(j.apagado ? "El soporte está apagado (Cerebro → Activo)." : n ? `${n} caso${n === 1 ? "" : "s"} nuevo${n === 1 ? "" : "s"}.` : "No hay clientas esperando respuesta.");
      await cargar();
    } catch { setAviso("No se pudo revisar."); }
    setRevisando(false);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[["pendientes", "Para aprobar"], ["humano", "Para vos"], ["resueltos", "Resueltos"], ["todos", "Todos"]].map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)} className={`min-h-[40px] rounded-full border px-3.5 text-[14px] ${filtro === k ? "border-amber-500 bg-amber-500/10 text-amber-200" : "border-gray-700 text-gray-300 hover:bg-gray-800"}`}>{l}</button>
        ))}
        <button onClick={revisar} disabled={revisando} className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-700 px-3 text-[14px] text-gray-200 hover:bg-gray-800">
          {revisando ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Revisar mensajes ahora
        </button>
      </div>
      {aviso && <p className="text-[14px] text-gray-300">{aviso}</p>}
      {!d ? <p className="flex items-center gap-2 text-[14px] text-gray-400"><Loader2 size={16} className="animate-spin" /> Cargando…</p>
        : d.casos.length === 0 ? <p className="rounded-xl border border-gray-800 bg-gray-900/30 p-4 text-[14.5px] text-gray-400">No hay casos en esta vista. El sistema revisa los mensajes nuevos cada 5 minutos.</p>
        : d.casos.map((c) => <TarjetaCaso key={c.id} c={c} intenciones={d.config?.intenciones ?? {}} alCambiar={cargar} />)}
    </div>
  );
}

function Cerebro() {
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState<Config | null>(null);
  const [nota, setNota] = useState("");
  const [estado, setEstado] = useState<{ ok: boolean; t: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cargar = useCallback(async () => {
    const r = await fetch("/api/admin/tarot/soporte?vista=cerebro", { cache: "no-store" });
    const j = await r.json(); if (j.ok) { setD(j); setF(j.config); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!d || !f) return <p className="flex items-center gap-2 text-[14px] text-gray-400"><Loader2 size={16} className="animate-spin" /> Cargando…</p>;

  const guardar = async () => {
    setGuardando(true); setEstado(null);
    const cambios = { activo: f.activo, modo_prueba: f.modo_prueba, modelo: f.modelo, identidad: f.identidad, reglas: f.reglas, frases_prohibidas: f.frases_prohibidas, intenciones: f.intenciones, politica: f.politica, confianza_minima: f.confianza_minima, max_mensajes_ia: f.max_mensajes_ia, largo_maximo: f.largo_maximo };
    try {
      const r = await fetch("/api/admin/tarot/soporte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "guardar_config", cambios, nota }) });
      const j = await r.json();
      if (!j.ok) setEstado({ ok: false, t: j.detalle ?? j.motivo ?? "No se pudo guardar." });
      else { setEstado({ ok: true, t: `Guardado como versión ${j.version}.` }); setNota(""); await cargar(); }
    } catch { setEstado({ ok: false, t: "No se pudo guardar." }); }
    setGuardando(false);
  };
  const lineas = (a: string[]) => a.join("\n");
  const aLineas = (t: string) => t.split("\n");
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 space-y-3">
        <h2 className="text-[16px] font-semibold text-white">Estado</h2>
        <label className="flex items-center gap-2 text-[15px] text-gray-200"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} className="h-4 w-4 accent-amber-500" /> Activo (arma borradores con los mensajes nuevos)</label>
        <label className="flex items-center gap-2 text-[15px] text-gray-200"><input type="checkbox" checked={f.modo_prueba} onChange={(e) => setF({ ...f, modo_prueba: e.target.checked })} className="h-4 w-4 accent-amber-500" /> Modo prueba (solo tu número, {f.telefono_prueba})</label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2"><span className={etiqueta}>Modelo de IA</span>
            <select value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} className={campo}>
              {d.modelos.map((m: { id: string; nombre: string; entrada: number; salida: number }) => <option key={m.id} value={m.id}>{m.nombre} (US$ {m.entrada} / {m.salida} por millón)</option>)}
            </select></div>
          <div><span className={etiqueta}>Confianza mínima</span><input inputMode="decimal" value={f.confianza_minima} onChange={(e) => setF({ ...f, confianza_minima: e.target.value as unknown as number })} className={campo} /></div>
          <div><span className={etiqueta}>Largo máximo</span><input inputMode="numeric" value={f.largo_maximo} onChange={(e) => setF({ ...f, largo_maximo: e.target.value as unknown as number })} className={campo} /></div>
          <div><span className={etiqueta}>Casos por conversación (24 h)</span><input inputMode="numeric" value={f.max_mensajes_ia} onChange={(e) => setF({ ...f, max_mensajes_ia: e.target.value as unknown as number })} className={campo} /></div>
        </div>
        <p className="text-[13px] text-gray-500">Etapa 1: el sistema no envía nada. Todo queda como borrador para que lo apruebes.</p>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 space-y-3">
        <h2 className="text-[16px] font-semibold text-white">Identidad y tono</h2>
        <textarea rows={6} value={f.identidad} onChange={(e) => setF({ ...f, identidad: e.target.value })} className={`${campo} resize-y`} />
        <div><span className={etiqueta}>Reglas que nunca se rompen (una por línea)</span>
          <textarea rows={10} value={lineas(f.reglas)} onChange={(e) => setF({ ...f, reglas: aLineas(e.target.value) })} className={`${campo} resize-y`} /></div>
        <div><span className={etiqueta}>Frases prohibidas (una por línea; si aparecen, el caso pasa a vos)</span>
          <textarea rows={5} value={lineas(f.frases_prohibidas)} onChange={(e) => setF({ ...f, frases_prohibidas: aLineas(e.target.value) })} className={`${campo} resize-y`} /></div>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 space-y-3">
        <h2 className="text-[16px] font-semibold text-white">Qué hacer con cada intención</h2>
        <div className="space-y-2">
          {ordenadas(f.intenciones).map(([k, v]) => (
            <div key={k} className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-950/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1"><p className="text-[15px] text-gray-100">{v.nombre}</p><p className="text-[13px] text-gray-500">{v.descripcion}</p></div>
              <select value={v.modo} onChange={(e) => setF({ ...f, intenciones: { ...f.intenciones, [k]: { ...v, modo: e.target.value as Intencion["modo"] } } })} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-[14px] text-gray-100 sm:w-auto">
                <option value="borrador">Borrador para aprobar</option>
                <option value="humano">Pasa a vos</option>
                <option value="automatico" disabled>Automático (etapa 3)</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 space-y-3">
        <h2 className="text-[16px] font-semibold text-white">Política comercial</h2>
        <p className="text-[14.5px] text-gray-300">
          El descuento lo define la regla <b>{d.regla?.nombre ?? f.politica.regla_descuento}</b>: {d.regla ? <>{d.regla.porcentaje} %, código {d.regla.formato_codigo?.replace("{NOMBRE}", "NOMBRE")}, {d.regla.vigencia_horas} h, {d.regla.activa ? "activa" : "apagada"}</> : "no encontrada"}.{" "}
          <Link href="/admin/tarot/reglas-comerciales" className="text-amber-300 underline underline-offset-4">Cambiarla en Reglas comerciales</Link>. La IA nunca decide montos.
        </p>
        <div><span className={etiqueta}>Se puede ofrecer en</span>
          <div className="flex flex-wrap gap-2">
            {ordenadas(f.intenciones).map(([k, v]) => (
              <label key={k} className="flex items-center gap-1.5 rounded-lg border border-gray-800 px-2.5 py-1.5 text-[14px] text-gray-200">
                <input type="checkbox" className="accent-amber-500" checked={f.politica.ofrecer_descuento_en.includes(k)} onChange={(e) => setF({ ...f, politica: { ...f.politica, ofrecer_descuento_en: e.target.checked ? [...f.politica.ofrecer_descuento_en, k] : f.politica.ofrecer_descuento_en.filter((x) => x !== k) } })} /> {v.nombre}
              </label>
            ))}
          </div></div>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <div><span className={etiqueta}>Como máximo 1 cada (días)</span><input inputMode="numeric" value={f.politica.max_descuento_cada_dias} onChange={(e) => setF({ ...f, politica: { ...f.politica, max_descuento_cada_dias: Number(e.target.value) || 0 } })} className={campo} /></div>
          <div><span className={etiqueta}>Texto del link sin descuento ({"{LINK}"} = el link)</span><input value={f.politica.texto_link} onChange={(e) => setF({ ...f, politica: { ...f.politica, texto_link: e.target.value } })} className={campo} /></div>
        </div>
      </section>

      <section className="sticky bottom-3 rounded-2xl border border-amber-900/60 bg-gray-950/95 p-3 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="¿Por qué cambia? (queda en el historial de versiones)" className={campo} />
          <button onClick={guardar} disabled={guardando} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-[15px] font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60">
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Guardar versión {f.version + 1}
          </button>
        </div>
        {estado && <p className={`mt-1.5 text-[14px] ${estado.ok ? "text-emerald-300" : "text-red-300"}`}>{estado.t}</p>}
      </section>

      <details className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
        <summary className="cursor-pointer text-[15px] font-semibold text-gray-200">Ejemplos aprobados ({d.ejemplos.filter((e: { activo: boolean }) => e.activo).length} activos)</summary>
        <p className="mt-2 text-[13px] text-gray-500">Cada respuesta que aprobás se suma acá y le enseña tu forma de responder. Se usan los 8 más recientes.</p>
        <div className="mt-2 space-y-2">
          {d.ejemplos.map((e: { id: string; intencion: string; mensaje_cliente: string; respuesta: string; activo: boolean }) => (
            <div key={e.id} className={`rounded-xl border border-gray-800 p-3 ${e.activo ? "" : "opacity-50"}`}>
              <p className="text-[13px] text-gray-500">{f.intenciones[e.intencion]?.nombre ?? e.intencion} · Clienta: “{e.mensaje_cliente}”</p>
              <p className="mt-1 whitespace-pre-wrap text-[14.5px] text-gray-200">{e.respuesta}</p>
              <button onClick={async () => { await fetch("/api/admin/tarot/soporte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "ejemplo", id: e.id, activo: !e.activo }) }); cargar(); }}
                className="mt-2 text-[13px] text-amber-300 underline underline-offset-4">{e.activo ? "Dejar de usar" : "Volver a usar"}</button>
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
        <summary className="cursor-pointer text-[15px] font-semibold text-gray-200">Historial de versiones</summary>
        <ol className="mt-3 space-y-2">
          {d.versiones.map((v: { version: number; nota: string; creado_por: string; created_at: string; modelo: string }) => (
            <li key={v.version} className="border-l-2 border-amber-700/60 pl-3">
              <p className="text-[12.5px] text-gray-500">v{v.version} · {hora(v.created_at)} · {v.creado_por} · {v.modelo}</p>
              <p className="text-[14.5px] text-gray-200">{v.nota}</p>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function Numeros() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/admin/tarot/soporte?vista=numeros&dias=30", { cache: "no-store" }).then((r) => r.json()).then((j) => j.ok && setD(j)).catch(() => null); }, []);
  if (!d) return <p className="flex items-center gap-2 text-[14px] text-gray-400"><Loader2 size={16} className="animate-spin" /> Cargando…</p>;
  const tiles: [string, string][] = [
    ["Casos (30 días)", String(d.casos)], ["Aprobados sin editar", d.tasa_sin_editar == null ? "—" : `${d.tasa_sin_editar} %`],
    ["Ventas desde soporte", String(d.ventas)], ["Ingresos", `$${Math.round(d.ingresos).toLocaleString("es-UY")}`],
    ["Costo de IA", `US$ ${Number(d.costo_usd).toFixed(2)}`], ["Códigos creados", String(d.codigos_creados)],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map(([k, v]) => <div key={k} className="rounded-xl border border-gray-800 bg-gray-900/40 px-3 py-2.5"><p className="text-[12.5px] text-gray-500">{k}</p><p className="text-[20px] font-semibold text-gray-100">{v}</p></div>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[["Cómo se resolvieron", d.por_estado], ["Qué preguntan", d.por_intencion]].map(([t, o]) => (
          <div key={t as string} className="rounded-xl border border-gray-800 bg-gray-900/40 p-3">
            <p className="mb-2 text-[14px] font-semibold text-gray-200">{t as string}</p>
            {Object.keys(o as object).length === 0 ? <p className="text-[14px] text-gray-500">Sin datos todavía.</p> :
              Object.entries(o as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <p key={k} className="flex justify-between text-[14px] text-gray-300"><span>{ESTADO[k]?.label ?? k}</span><span>{n}</span></p>
              ))}
          </div>
        ))}
      </div>
      <p className="text-[13px] text-gray-500">Tokens: {Number(d.tokens_entrada).toLocaleString("es-UY")} de entrada y {Number(d.tokens_salida).toLocaleString("es-UY")} de salida.</p>
    </div>
  );
}

export function SoporteAutomatizado() {
  const [tab, setTab] = useState<"casos" | "cerebro" | "numeros">("casos");
  return (
    <TarotAdminShell>
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <Bot size={22} className="mt-1 shrink-0 text-amber-400" />
          <div>
            <h1 className="text-[20px] font-semibold text-white">Soporte automatizado</h1>
            <p className="mt-1 text-[14.5px] leading-relaxed text-gray-400">
              Cuando una clienta escribe, la IA entiende qué quiere y propone la respuesta; el sistema agrega links y beneficios según las Reglas comerciales.
              <b className="text-gray-200"> Etapa 1: no se envía nada</b>, vos aprobás y lo mandás desde la bandeja.
            </p>
          </div>
        </div>
        <div className="flex gap-1 border-b border-gray-800">
          {([["casos", "Casos"], ["cerebro", "Cerebro"], ["numeros", "Números"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`min-h-[44px] border-b-2 px-3 text-[15px] ${tab === k ? "border-amber-500 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>{l}</button>
          ))}
          <button onClick={() => window.location.reload()} aria-label="Actualizar" className="ml-auto self-center rounded-lg p-2 text-gray-400 hover:bg-gray-800"><RefreshCw size={16} /></button>
        </div>
        {tab === "casos" ? <Casos /> : tab === "cerebro" ? <Cerebro /> : <Numeros />}
      </div>
    </TarotAdminShell>
  );
}
