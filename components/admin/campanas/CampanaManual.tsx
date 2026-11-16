"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, ArrowLeft, Check, CheckCheck, Loader2, Pause, Play, RefreshCw, Send, Smartphone, Star } from "lucide-react";
import { PLANTILLAS_META_UI, TIPO_CAMPANA_UI, fmtFecha, fmtMoneda, fmtPct, type CampanaResumen } from "@/components/admin/campanas/ui";

// ============================================================================
// Campaña MANUAL (2026-11-14): 1) el mensaje (plantilla de Meta) · 2) a quién
// · 3) probar y disparar · seguimiento por persona. Nada se manda a clientes
// sin el botón Disparar + confirmación; la prueba va solo a tu número.
// ============================================================================

interface Fila {
  id: string; telefono: string | null; nombre: string | null; estado: string; es_prueba: boolean; simulado: boolean;
  intentos: number; ultimo_error: string | null; enviado_at: string | null;
  whatsapp: string | null; entregado: boolean; leido: boolean; abrio_link_at: string | null; visitas: number;
  opinion: { rating: number; comentario: string | null } | null; cupon: "usado" | "en_checkout" | null;
  compro: boolean; compras: number; costo_estimado: number | null;
}
interface Cupon { id: string; codigo: string; tipo_descuento: string; valor_descuento: number; fecha_fin: string | null; activo: boolean }
export interface DetalleManual {
  campana: CampanaResumen;
  costos: CampanaResumen["costos"];
  manual: { seguimiento: Fila[]; cupon: Cupon | null };
}
interface Persona {
  telefono: string; nombre: string | null; ultima_entrega_at: string; tema: string | null; tipo_orden: string;
  ventas: number; cortesias: number; es_prueba: boolean; es_qa: boolean; con_reclamo: boolean;
  estado_en_campana: string | null; ultima_campana_at: string | null;
}
interface Plantilla { ok?: boolean; estado?: string; nombre?: string; cuerpo?: string; boton?: string; motivo_rechazo?: string | null; detalle?: string; motivo?: string }

const card = "rounded-xl border border-gray-800 bg-gray-900/40 px-4 sm:px-5 py-4";
const btn = "flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed";
const dig = (t: string) => t.replace(/\D/g, "");

// Normaliza lo que pegue Manuel: 099 123 456 · 99123456 · +598 99 123 456 → 59899123456
function normalizarPegado(t: string): string | null {
  let d = dig(t);
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (/^09\d{7}$/.test(d)) d = "598" + d.slice(1);
  else if (/^9\d{7}$/.test(d)) d = "598" + d;
  return d.length >= 10 ? d : null;
}

const ESTADO_PLANTILLA: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Aprobada por Meta", cls: "bg-emerald-900/50 text-emerald-300" },
  PENDING: { label: "En revisión de Meta", cls: "bg-amber-900/50 text-amber-300" },
  IN_APPEAL: { label: "En apelación", cls: "bg-amber-900/50 text-amber-300" },
  REJECTED: { label: "Rechazada por Meta", cls: "bg-red-900/50 text-red-300" },
  PAUSED: { label: "Pausada por Meta", cls: "bg-red-900/50 text-red-300" },
  DISABLED: { label: "Deshabilitada", cls: "bg-red-900/50 text-red-300" },
  NO_CREADA: { label: "Sin mandar a Meta", cls: "bg-gray-800 text-gray-300" },
};

const ESTADO_ENVIO: Record<string, { label: string; cls: string }> = {
  seleccionado: { label: "Elegida", cls: "bg-gray-800 text-gray-300" },
  pendiente: { label: "En cola", cls: "bg-sky-900/50 text-sky-300" },
  enviando: { label: "Enviando", cls: "bg-sky-900/50 text-sky-300" },
  enviado: { label: "Enviado", cls: "bg-emerald-900/50 text-emerald-300" },
  error: { label: "Error", cls: "bg-red-900/50 text-red-300" },
  descartado: { label: "Descartado", cls: "bg-gray-800 text-gray-500" },
};

function Kpi({ label, valor, sub }: { label: string; valor: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-white">{valor}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

function Paso({ n, titulo, children, hecho }: { n: number; titulo: string; children: React.ReactNode; hecho?: boolean }) {
  return (
    <section className={card}>
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${hecho ? "bg-emerald-800 text-emerald-100" : "bg-amber-900 text-amber-100"}`}>
          {hecho ? <Check size={13} /> : n}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

export function CampanaManual({ detalle, recargar }: { detalle: DetalleManual; recargar: () => void }) {
  const { campana: c, costos, manual } = detalle;
  const esCupon = c.tipo === "cupon_descuento";
  const borrador = c.estado === "borrador" && !c.disparada_at;

  const [plantilla, setPlantilla] = useState<Plantilla | null>(null);
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [guardados, setGuardados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<"todas" | "ventas" | "cortesias">("ventas");
  const [busqueda, setBusqueda] = useState("");
  const [pegado, setPegado] = useState("");
  const [noEncontrados, setNoEncontrados] = useState<string[]>([]);
  const [costo, setCosto] = useState(String(c.costo_estimado_por_envio ?? ""));
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  const cargarPlantilla = useCallback(async () => {
    const r = await fetch(`/api/admin/tarot/campanas/${c.id}/plantilla`, { cache: "no-store" }).catch(() => null);
    setPlantilla(r ? await r.json().catch(() => ({ estado: "error" })) : { estado: "error" });
  }, [c.id]);

  const cargarPersonas = useCallback(async () => {
    const r = await fetch(`/api/admin/tarot/campanas/${c.id}/audiencia`, { cache: "no-store" }).catch(() => null);
    const json = r ? await r.json().catch(() => ({})) : {};
    if (json.ok) {
      const lista = json.personas as Persona[];
      setPersonas(lista);
      const ya = new Set(lista.filter((p) => p.estado_en_campana).map((p) => dig(p.telefono)));
      setMarcados(ya);
      setGuardados(ya);
    }
  }, [c.id]);

  useEffect(() => { cargarPlantilla(); }, [cargarPlantilla]);
  useEffect(() => { if (borrador) cargarPersonas(); }, [borrador, cargarPersonas]);

  const sucio = useMemo(() => marcados.size !== guardados.size || [...marcados].some((t) => !guardados.has(t)), [marcados, guardados]);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    // Las ya elegidas se ven siempre (arriba), aunque el filtro no las incluya.
    const coincide = (p: Persona) => !q || (p.nombre ?? "").toLowerCase().includes(q) || dig(p.telefono).includes(dig(q) || "~");
    const pasaFiltro = (p: Persona) => filtro === "todas" || (filtro === "ventas" ? p.ventas > 0 : p.ventas === 0);
    const lista = (personas ?? []).filter((p) => coincide(p) && (pasaFiltro(p) || guardados.has(dig(p.telefono))));
    return [...lista.filter((p) => guardados.has(dig(p.telefono))), ...lista.filter((p) => !guardados.has(dig(p.telefono)))];
  }, [personas, filtro, busqueda, guardados]);

  const seguimiento = manual.seguimiento.filter((f) => !f.es_prueba);
  const prueba = manual.seguimiento.find((f) => f.es_prueba) ?? null;
  const elegidas = borrador ? guardados.size : seguimiento.length;
  const costoNum = c.costo_estimado_por_envio === null || c.costo_estimado_por_envio === undefined ? null : Number(c.costo_estimado_por_envio);
  const aprobada = plantilla?.estado === "APPROVED";

  const faltantes: string[] = [];
  if (!aprobada) faltantes.push("que Meta apruebe la plantilla");
  if (costoNum === null) faltantes.push("cargar el costo por mensaje");
  if (guardados.size === 0) faltantes.push("elegir a quién mandarle");
  if (sucio) faltantes.push("guardar los cambios de la lista");

  async function llamar(clave: string, url: string, init: RequestInit, ok: (j: Record<string, unknown>) => string) {
    setOcupado(clave);
    setMsg(null);
    try {
      const r = await fetch(url, init);
      const j = await r.json().catch(() => ({}));
      setMsg(j.ok ? { tipo: "ok", texto: ok(j) } : { tipo: "err", texto: String(j.detalle ?? j.motivo ?? `Error HTTP ${r.status}`) });
      return j;
    } catch {
      setMsg({ tipo: "err", texto: "Error de red" });
      return {};
    } finally {
      setOcupado(null);
    }
  }

  const json = (body: unknown, method = "POST"): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function mandarAMeta() {
    if (!window.confirm("Se manda el texto de la plantilla a revisión de Meta. No le llega nada a nadie. ¿Seguimos?")) return;
    await llamar("meta", `/api/admin/tarot/campanas/${c.id}/plantilla`, { method: "POST" }, () => "Plantilla enviada a revisión de Meta. Suele tardar de minutos a un día.");
    cargarPlantilla();
  }

  async function guardarLista() {
    const j = await llamar("lista", `/api/admin/tarot/campanas/${c.id}/audiencia`, json({ telefonos: [...marcados] }, "PUT"),
      (r) => `Lista guardada: ${r.seleccionados} personas.`);
    if (j.ok) { setGuardados(new Set(marcados)); recargar(); }
  }

  async function guardarCosto() {
    await llamar("costo", `/api/admin/tarot/campanas/${c.id}`, json({ accion: "config", costo_estimado_por_envio: costo }, "PATCH"), () => "Costo guardado.");
    recargar();
  }

  async function probar() {
    if (!window.confirm("Se manda el mensaje REAL a tu número de prueba (solo a vos). Meta lo cobra como 1 mensaje. ¿Seguimos?")) return;
    await llamar("prueba", `/api/admin/tarot/campanas/${c.id}/prueba`, { method: "POST" }, (r) => `Listo: te llegó a ${String(r.enviado_a ?? "tu número")}. Abrí el link para ver cómo queda.`);
    recargar();
  }

  async function dispararYa() {
    const j = await llamar("disparar", `/api/admin/tarot/campanas/${c.id}/disparar`, json({ confirmacion: guardados.size }),
      (r) => `Disparada a ${r.personas} personas. Se mandan de a una, en horario (10 a 21 h).`);
    setConfirmando(false);
    if (j.ok) recargar();
  }

  async function cambiar(accion: "pausar" | "activar") {
    await llamar(accion, `/api/admin/tarot/campanas/${c.id}`, json({ accion }, "PATCH"), () => (accion === "pausar" ? "Pausada: no se manda nada más." : "Reanudada."));
    recargar();
  }

  function marcarPegados() {
    const nums = pegado.split(/[\n,;]+/).map(normalizarPegado).filter(Boolean) as string[];
    const conocidos = new Set((personas ?? []).map((p) => dig(p.telefono)));
    const nuevos = new Set(marcados);
    const fuera: string[] = [];
    for (const n of nums) (conocidos.has(n) ? nuevos.add(n) : fuera.push(`+${n}`));
    setMarcados(nuevos);
    setNoEncontrados(fuera);
    setPegado("");
  }

  const toggle = (t: string) => setMarcados((prev) => { const s = new Set(prev); if (s.has(t)) s.delete(t); else s.add(t); return s; });

  // Vista previa del mensaje con datos de ejemplo (y los reales del cupón).
  const cupon = manual.cupon;
  const cuponTxt = cupon ? (cupon.tipo_descuento === "porcentaje" ? `${cupon.valor_descuento} %` : `$${cupon.valor_descuento}`) : "";
  const venceTxt = cupon?.fecha_fin ? new Date(cupon.fecha_fin).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" }) : "";
  const vista = (plantilla?.cuerpo ?? "").replace(/\{\{(\d)\}\}/g, (_, n) => [ "Paula", cuponTxt, cupon?.codigo ?? "", venceTxt ][Number(n) - 1] ?? "");

  const m = {
    enviados: seguimiento.filter((f) => f.estado === "enviado").length,
    entregados: seguimiento.filter((f) => f.entregado).length,
    leidos: seguimiento.filter((f) => f.leido).length,
    abrieron: seguimiento.filter((f) => f.abrio_link_at).length,
    respondieron: seguimiento.filter((f) => f.opinion).length,
    cupon: seguimiento.filter((f) => f.cupon).length,
    cuponUsado: seguimiento.filter((f) => f.cupon === "usado").length,
    compraron: seguimiento.filter((f) => f.compro).length,
    enCola: seguimiento.filter((f) => f.estado === "pendiente" || f.estado === "enviando").length,
    errores: seguimiento.filter((f) => f.estado === "error").length,
  };
  const est = borrador ? { label: "Sin enviar", cls: "bg-gray-800 text-gray-300" }
    : c.estado === "activa" ? { label: "Enviando", cls: "bg-sky-900/50 text-sky-300" }
    : c.estado === "pausada" ? { label: "Pausada", cls: "bg-amber-900/50 text-amber-300" }
    : { label: "Enviada", cls: "bg-emerald-900/50 text-emerald-300" };
  const ep = ESTADO_PLANTILLA[plantilla?.estado ?? ""] ?? { label: plantilla ? `Plantilla: ${plantilla.estado ?? "error"}` : "Consultando…", cls: "bg-gray-800 text-gray-400" };

  return (
    <main className="px-4 sm:px-6 py-6 space-y-5 max-w-5xl">
      <div>
        <Link href={"/admin/tarot/campanas" as Route} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"><ArrowLeft size={12} /> Campañas</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-white mr-1">{c.nombre}</h2>
          <span className={`rounded px-2 py-0.5 text-xs ${est.cls}`}>{est.label}</span>
          <span className="text-xs text-gray-500">{TIPO_CAMPANA_UI[c.tipo]} · WhatsApp · elegida a mano</span>
        </div>
        {c.disparada_at && <p className="text-[11px] text-gray-500 mt-1">Disparada el {fmtFecha(c.disparada_at)}{c.finalizada_at ? ` · terminó el ${fmtFecha(c.finalizada_at)}` : ""}</p>}
        {!borrador && (
          <div className="mt-3 flex flex-wrap gap-2">
            {c.estado === "activa" && <button disabled={!!ocupado} onClick={() => cambiar("pausar")} className={`${btn} border-amber-700/60 bg-amber-900/30 text-amber-200`}><Pause size={13} /> Pausar</button>}
            {c.estado === "pausada" && <button disabled={!!ocupado} onClick={() => cambiar("activar")} className={`${btn} border-emerald-700/60 bg-emerald-900/30 text-emerald-200`}><Play size={13} /> Reanudar</button>}
            <button onClick={recargar} className={`${btn} border-gray-700 bg-gray-900 text-gray-300`}><RefreshCw size={13} /> Actualizar</button>
          </div>
        )}
      </div>

      {msg && (
        <div role="status" className={`flex items-start gap-2 rounded-lg px-4 py-2.5 text-sm ${msg.tipo === "ok" ? "border border-emerald-800/50 bg-emerald-950/30 text-emerald-300" : "border border-red-800/50 bg-red-950/40 text-red-300"}`}>
          {msg.tipo === "err" && <AlertCircle size={15} className="shrink-0 mt-0.5" />} {msg.texto}
        </div>
      )}

      {/* 1 · El mensaje */}
      <Paso n={1} titulo="El mensaje" hecho={aprobada}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,340px)_1fr]">
          <div className="rounded-2xl bg-[#0b141a] p-3">
            <div className="rounded-lg rounded-tl-none bg-[#202c33] px-3 py-2 text-[14px] leading-snug text-gray-100 whitespace-pre-line">
              {vista || <span className="text-gray-500">Cargando texto…</span>}
              <span className="block text-right text-[10px] text-gray-500 mt-1">Tu Oráculo</span>
            </div>
            {plantilla?.boton && <div className="mt-1 rounded-lg bg-[#202c33] py-2 text-center text-[14px] text-sky-400">↗ {plantilla.boton}</div>}
            <p className="mt-2 text-[11px] text-gray-500">Vista previa con un nombre de ejemplo. Cada persona recibe su nombre de pila y su link personal.</p>
          </div>
          <div className="space-y-3 text-sm text-gray-300">
            <p className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs ${ep.cls}`}>{ep.label}</span>
              <span className="text-xs text-gray-500 font-mono">{plantilla?.nombre ?? String(c.mensaje.template_nombre ?? "")}</span>
              <button onClick={cargarPlantilla} className="text-xs text-gray-400 underline">volver a consultar</button>
            </p>
            {PLANTILLAS_META_UI[c.tipo] && (
              <p className="text-xs text-gray-400 leading-relaxed">
                Link del botón (así se manda a Meta):{" "}
                <span className="font-mono text-gray-200 break-all">{PLANTILLAS_META_UI[c.tipo].url}{"{{1}}"}</span>
                <br />Ejemplo que pide Meta:{" "}
                <span className="font-mono text-gray-300 break-all">{PLANTILLAS_META_UI[c.tipo].url}ejemplo123</span>
                <br />El {"{{1}}"} lo completa el sistema con la clave personal de cada clienta: abre {PLANTILLAS_META_UI[c.tipo].destino}.
              </p>
            )}
            {plantilla?.estado === "NO_CREADA" && (
              <>
                <p className="text-xs text-gray-400">WhatsApp solo deja escribirle primero a una persona con un mensaje aprobado por Meta. Mandalo a revisión una vez; después sirve para todas las campañas de este tipo.</p>
                <button disabled={!!ocupado} onClick={mandarAMeta} className={`${btn} border-amber-600 bg-amber-900/40 text-amber-100`}>
                  {ocupado === "meta" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Mandar a aprobación de Meta
                </button>
              </>
            )}
            {plantilla?.estado === "PENDING" && <p className="text-xs text-gray-400">Meta la está revisando. Suele tardar de minutos a un día. Mientras tanto podés armar la lista.</p>}
            {plantilla?.estado === "REJECTED" && <p className="text-xs text-red-300">Meta la rechazó{plantilla.motivo_rechazo ? ` (${plantilla.motivo_rechazo})` : ""}. Avisame y ajusto el texto.</p>}
            {plantilla?.estado === "error" && <p className="text-xs text-red-300">No se pudo consultar a Meta: {plantilla.detalle ?? plantilla.motivo ?? "error"}.</p>}
            {esCupon && cupon && (
              <p className="text-xs text-gray-400">
                Cupón <span className="font-mono text-amber-200">{cupon.codigo}</span> · {cuponTxt} · vence {cupon.fecha_fin ? new Date(cupon.fecha_fin).toLocaleDateString("es-UY") : "—"} · un uso por persona.
                El botón lleva directo al checkout con el código puesto.{!cupon.activo && <span className="text-red-300"> El cupón está inactivo.</span>}
              </p>
            )}
            {!esCupon && <p className="text-xs text-gray-400">El botón abre la página de opinión (estrellas y comentario). Si autorizan, la opinión queda como candidata en Testimonios; nunca se publica sola.</p>}
          </div>
        </div>
      </Paso>

      {/* 2 · A quién */}
      {borrador && (
        <Paso n={2} titulo={`A quién se le manda (${guardados.size} ${guardados.size === 1 ? "persona" : "personas"})`} hecho={guardados.size > 0 && !sucio}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {(["ventas", "cortesias", "todas"] as const).map((f) => (
              <button key={f} onClick={() => setFiltro(f)} className={`text-xs rounded-full px-3 py-1.5 border ${filtro === f ? "border-amber-500 text-amber-200 bg-amber-950/40" : "border-gray-700 text-gray-400"}`}>
                {f === "ventas" ? "Compradoras" : f === "cortesias" ? "Solo cortesías" : "Todas"}
              </button>
            ))}
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar nombre o número" aria-label="Buscar"
              className="flex-1 min-w-[160px] border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-1.5" />
          </div>
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            <button onClick={() => setMarcados((p) => new Set([...p, ...visibles.filter((x) => !x.es_prueba && !x.es_qa && !x.con_reclamo).map((x) => dig(x.telefono))]))} className="text-amber-300 underline">Marcar las de la lista</button>
            <button onClick={() => setMarcados(new Set())} className="text-gray-400 underline">Desmarcar todas</button>
          </div>
          <div className="rounded-lg border border-gray-800 divide-y divide-gray-800/70 max-h-[420px] overflow-y-auto">
            {personas === null && <p className="px-3 py-4 text-sm text-gray-500"><Loader2 size={14} className="inline animate-spin mr-1" /> Cargando…</p>}
            {personas !== null && visibles.length === 0 && <p className="px-3 py-4 text-sm text-gray-500">Nadie con ese filtro.</p>}
            {visibles.map((p) => {
              const t = dig(p.telefono);
              return (
                <label key={t} className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-800/40 cursor-pointer">
                  <input type="checkbox" className="accent-amber-500 mt-1 h-4 w-4" checked={marcados.has(t)} onChange={() => toggle(t)} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-100">{p.nombre ?? "Sin nombre"} <span className="text-xs text-gray-500 font-mono">{p.telefono}</span></span>
                    <span className="block text-xs text-gray-500">
                      Última lectura {new Date(p.ultima_entrega_at).toLocaleDateString("es-UY")}{p.tema ? ` · ${p.tema}` : ""} · {p.ventas} {p.ventas === 1 ? "compra" : "compras"}{p.cortesias ? ` · ${p.cortesias} cortesía${p.cortesias > 1 ? "s" : ""}` : ""}
                    </span>
                    <span className="flex flex-wrap gap-1 mt-1">
                      {p.es_prueba && <span className="rounded px-1.5 py-0.5 text-[10px] bg-sky-950 text-sky-300">número de prueba</span>}
                      {p.es_qa && <span className="rounded px-1.5 py-0.5 text-[10px] bg-gray-800 text-gray-400">QA</span>}
                      {p.con_reclamo && <span className="rounded px-1.5 py-0.5 text-[10px] bg-red-950 text-red-300">tuvo un reclamo</span>}
                      {p.ultima_campana_at && <span className="rounded px-1.5 py-0.5 text-[10px] bg-amber-950 text-amber-300">recibió una campaña el {new Date(p.ultima_campana_at).toLocaleDateString("es-UY")}</span>}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto] items-start">
            <textarea value={pegado} onChange={(e) => setPegado(e.target.value)} rows={2} aria-label="Pegar números"
              placeholder="O pegá números (uno por línea o separados por coma). Ej.: 099 123 456"
              className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2" />
            <button onClick={marcarPegados} disabled={!pegado.trim()} className={`${btn} border-gray-700 bg-gray-900 text-gray-200`}>Marcar esos números</button>
          </div>
          {noEncontrados.length > 0 && (
            <p className="mt-2 text-xs text-amber-300">No son clientas con una lectura entregada (no se agregan): {noEncontrados.join(", ")}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button disabled={!sucio || !!ocupado} onClick={guardarLista} className={`${btn} border-amber-600 bg-amber-900/40 text-amber-100`}>
              {ocupado === "lista" && <Loader2 size={14} className="animate-spin" />} Guardar lista ({marcados.size})
            </button>
            {sucio && <span className="text-xs text-amber-300">Hay cambios sin guardar.</span>}
          </div>
        </Paso>
      )}

      {/* 3 · Probar y disparar */}
      {borrador && (
        <Paso n={3} titulo="Probar y disparar">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs text-gray-400" htmlFor="cm-costo">Costo por mensaje de WhatsApp ({c.costo_moneda})</label>
              <div className="flex gap-2">
                <input id="cm-costo" type="number" step="0.0001" min={0} value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Ej.: 0.0700"
                  className="w-full border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2" />
                <button disabled={!!ocupado || costo === String(c.costo_estimado_por_envio ?? "")} onClick={guardarCosto} className={`${btn} border-gray-700 bg-gray-900 text-gray-200`}>Guardar</button>
              </div>
              <p className="text-sm text-gray-200">
                {guardados.size} {guardados.size === 1 ? "persona" : "personas"} · costo estimado{" "}
                <strong>{costoNum === null ? "—" : fmtMoneda(costoNum * guardados.size, c.costo_moneda)}</strong>
              </p>
            </div>
            <div className="space-y-2">
              <button disabled={!!ocupado || !aprobada} onClick={probar} className={`${btn} w-full border-sky-700/60 bg-sky-950/40 text-sky-200`}>
                {ocupado === "prueba" ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />} Probarlo en mi WhatsApp
              </button>
              <p className="text-[11px] text-gray-500">
                Va solo a tu número de prueba.{prueba?.enviado_at ? ` Última prueba: ${fmtFecha(prueba.enviado_at)}${prueba.abrio_link_at ? " · abriste el link" : ""}${prueba.opinion ? ` · respondiste ${prueba.opinion.rating}★` : ""}${prueba.cupon ? " · usaste el cupón" : ""}.` : ""}
                {prueba?.estado === "error" && <span className="text-red-300"> Falló: {prueba.ultimo_error}</span>}
              </p>
              {!confirmando ? (
                <button disabled={faltantes.length > 0 || !!ocupado} onClick={() => setConfirmando(true)} className={`${btn} w-full border-emerald-600 bg-emerald-900/40 text-emerald-100 font-semibold`}>
                  <Send size={14} /> Disparar a {guardados.size} {guardados.size === 1 ? "persona" : "personas"}
                </button>
              ) : (
                <div className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-3 space-y-2">
                  <p className="text-sm text-emerald-100">
                    Vas a mandar un WhatsApp real a <strong>{guardados.size} {guardados.size === 1 ? "persona" : "personas"}</strong>.
                    Costo estimado <strong>{costoNum === null ? "—" : fmtMoneda(costoNum * guardados.size, c.costo_moneda)}</strong>. Se mandan de a una, de 10 a 21 h. No se puede deshacer.
                  </p>
                  <div className="flex gap-2">
                    <button disabled={!!ocupado} onClick={dispararYa} className={`${btn} flex-1 border-emerald-500 bg-emerald-700 text-white font-semibold`}>
                      {ocupado === "disparar" && <Loader2 size={14} className="animate-spin" />} Sí, disparar
                    </button>
                    <button onClick={() => setConfirmando(false)} className={`${btn} border-gray-700 text-gray-300`}>Cancelar</button>
                  </div>
                </div>
              )}
              {faltantes.length > 0 && <p className="text-[11px] text-amber-300">Para disparar falta: {faltantes.join(", ")}.</p>}
            </div>
          </div>
        </Paso>
      )}

      {/* Seguimiento */}
      {!borrador && (
        <section className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <Kpi label="Enviados" valor={m.enviados} sub={m.enCola ? `${m.enCola} en cola` : m.errores ? `${m.errores} con error` : `de ${elegidas}`} />
            <Kpi label="Entregados" valor={m.entregados} sub={fmtPct(m.entregados, m.enviados)} />
            <Kpi label="Leídos" valor={m.leidos} sub="si tienen el tilde azul" />
            <Kpi label="Abrieron el link" valor={m.abrieron} sub={fmtPct(m.abrieron, m.enviados)} />
            {esCupon
              ? <Kpi label="Usaron el cupón" valor={m.cuponUsado} sub={`${m.cupon - m.cuponUsado} en el checkout`} />
              : <Kpi label="Respondieron" valor={m.respondieron} sub={fmtPct(m.respondieron, m.enviados)} />}
            <Kpi label="Volvieron a comprar" valor={m.compraron} sub={fmtPct(m.compraron, m.enviados)} />
            <Kpi label="Costo" valor={fmtMoneda(costos.real ?? costos.estimado, costos.moneda)} sub={costos.fuente === "real" ? "real" : "estimado"} />
          </div>
        </section>
      )}

      {seguimiento.length > 0 && !borrador && (
        <section>
          <h3 className="text-sm font-semibold text-white mb-2">Persona por persona</h3>
          <div className="rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-900 border-b border-gray-800 text-left">
                {["Persona", "Envío", "WhatsApp", "Abrió el link", esCupon ? "Cupón" : "Opinión", "Compró", "Costo"].map((h) => <th key={h} className="px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {seguimiento.map((f) => {
                  const e = ESTADO_ENVIO[f.estado] ?? { label: f.estado, cls: "" };
                  return (
                    <tr key={f.id} className="border-b border-gray-800/60 align-top">
                      <td className="px-3 py-2.5 text-gray-200 whitespace-nowrap">{f.nombre ?? "—"}<span className="block text-xs text-gray-500 font-mono">{f.telefono}</span></td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded px-2 py-0.5 text-xs ${e.cls}`}>{e.label}{f.simulado ? " (sim.)" : ""}</span>
                        {f.enviado_at && <span className="block text-[11px] text-gray-500 mt-0.5">{fmtFecha(f.enviado_at)}</span>}
                        {f.ultimo_error && <span className="block text-[11px] text-red-300 max-w-[220px] break-words">{f.ultimo_error}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {f.leido ? <span className="text-sky-300 flex items-center gap-1"><CheckCheck size={14} /> Leído</span>
                          : f.entregado ? <span className="text-gray-300 flex items-center gap-1"><CheckCheck size={14} /> Entregado</span>
                          : f.whatsapp ? <span className="text-gray-400">{f.whatsapp}</span> : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-300 whitespace-nowrap">{f.abrio_link_at ? `${fmtFecha(f.abrio_link_at)}${f.visitas > 1 ? ` · ${f.visitas} veces` : ""}` : <span className="text-gray-600">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs max-w-[280px]">
                        {esCupon
                          ? (f.cupon === "usado" ? <span className="text-emerald-300">Usado</span> : f.cupon === "en_checkout" ? <span className="text-amber-300">Lo puso en el checkout</span> : <span className="text-gray-600">—</span>)
                          : f.opinion
                            ? <span className="text-gray-200"><span className="text-amber-400">{"★".repeat(f.opinion.rating)}</span><span className="text-gray-700">{"★".repeat(5 - f.opinion.rating)}</span>{f.opinion.comentario && <span className="block text-gray-400 mt-0.5">“{f.opinion.comentario}”</span>}</span>
                            : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">{f.compro ? <span className="text-emerald-300">Sí{f.compras > 1 ? ` (${f.compras})` : ""}</span> : <span className="text-gray-600">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{f.costo_estimado === null ? "—" : fmtMoneda(f.costo_estimado, c.costo_moneda)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!esCupon && m.respondieron > 0 && (
            <p className="mt-2 text-xs text-gray-500"><Star size={11} className="inline text-amber-400" /> Las opiniones con autorización quedan como candidatas en <Link href={"/admin/tarot/testimonios" as Route} className="underline">Testimonios</Link>; publicarlas es siempre una decisión tuya.</p>
          )}
        </section>
      )}
    </main>
  );
}
