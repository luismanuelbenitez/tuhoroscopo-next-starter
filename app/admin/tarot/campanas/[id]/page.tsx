"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, ArrowLeft, Loader2, Pause, Play, Square, Zap, Star, Save } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { ESTADO_CAMPANA_UI, TIPO_CAMPANA_UI, fmtFecha, fmtMoneda, fmtPct, type CampanaResumen } from "@/components/admin/campanas/ui";

// ============================================================================
// Detalle de campaña (2026-10-19): métricas, configuración, envíos y
// respuestas. Publicar un testimonio se hace SIEMPRE desde Testimonios.
// ============================================================================

interface OrdenRef { external_reference?: string; nombre_snapshot?: string; telefono_snapshot?: string }
interface Envio {
  id: string; orden_id: string; estado: string; motivo_disparo: string | null; programado_para: string | null;
  intentos: number; ultimo_error: string | null; simulado: boolean; enviado_at: string | null;
  primera_visita_at: string | null; visitas: number; respondido_at: string | null; costo_estimado: number | null;
  tarot_whatsapp_mensajes: { estado: string } | null; tarot_ordenes: OrdenRef | null;
}
interface Respuesta {
  id: string; orden_id: string; rating: number; comentario: string | null; identidad_publica: string; identidad_prevista: string;
  consentimiento_sitio: boolean; consentimiento_sitio_at: string | null; consentimiento_sitio_version: string | null;
  consentimiento_difusion: boolean; consentimiento_difusion_at: string | null; consentimiento_difusion_version: string | null;
  testimonio_id: string | null; created_at: string; tarot_ordenes: OrdenRef | null; tarot_testimonios: { publicado: boolean } | null;
}
interface Detalle {
  campana: CampanaResumen; metricas: CampanaResumen["metricas"]; elegibles: CampanaResumen["elegibles"];
  costos: CampanaResumen["costos"]; envios: Envio[]; respuestas: Respuesta[];
}

const inputCls = "w-full border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500";
const labelCls = "block text-xs text-gray-400 mb-1";

function Kpi({ label, valor, sub }: { label: string; valor: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{valor}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
      <input type="checkbox" className="accent-amber-500" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

const ESTADO_ENVIO: Record<string, string> = {
  pendiente: "bg-gray-800 text-gray-300", enviando: "bg-sky-900/50 text-sky-300", enviado: "bg-emerald-900/50 text-emerald-300",
  error: "bg-red-900/50 text-red-300", descartado: "bg-gray-800 text-gray-500",
};

export default function CampanaDetallePage({ params }: { params: { id: string } }) {
  const [d, setD] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cfg, setCfg] = useState<Record<string, unknown> | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`/api/admin/tarot/campanas/${params.id}`, { cache: "no-store" });
      const json = await r.json();
      if (json.ok) {
        setD(json);
        const c = json.campana as CampanaResumen;
        setCfg({
          modo_envio: c.modo_envio,
          costo_estimado_por_envio: c.costo_estimado_por_envio ?? "",
          costo_moneda: c.costo_moneda,
          costo_real_total: c.costo_real_total ?? "",
          costo_real_fuente: c.costo_real_fuente ?? "",
          limite_diario: c.limite_diario,
          ventana_desde: c.ventana_horaria?.desde ?? 10,
          ventana_hasta: c.ventana_horaria?.hasta ?? 21,
          audiencia: { ...c.audiencia },
          disparador: { ...c.disparador },
        });
      } else setMsg({ tipo: "err", texto: json.detalle ?? json.motivo ?? `Error HTTP ${r.status}` });
    } catch {
      setMsg({ tipo: "err", texto: "Error de red" });
    } finally {
      setCargando(false);
    }
  }, [params.id]);

  useEffect(() => { cargar(); }, [cargar]);

  async function accion(nombre: "activar" | "pausar" | "finalizar") {
    if (!d) return;
    const real = d.campana.modo_envio === "real";
    const textos = {
      activar: real
        ? "Vas a ACTIVAR la campaña en modo REAL: va a enviar WhatsApp a clientes reales elegibles (dentro de la ventana horaria y el límite diario). ¿Confirmás?"
        : "Activar en modo SIMULADO: procesa candidatos y genera métricas, pero no envía ningún WhatsApp. ¿Confirmás?",
      pausar: "Pausar: no se envía nada nuevo; los pendientes quedan esperando. ¿Confirmás?",
      finalizar: "Finalizar la campaña: deja de procesarse definitivamente. ¿Confirmás?",
    };
    if (!window.confirm(textos[nombre])) return;
    setOcupado(true);
    setMsg(null);
    const r = await fetch(`/api/admin/tarot/campanas/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: nombre }) });
    const json = await r.json().catch(() => ({}));
    setMsg(json.ok ? { tipo: "ok", texto: "Listo." } : { tipo: "err", texto: json.detalle ?? json.motivo ?? "Error" });
    setOcupado(false);
    cargar();
  }

  async function ejecutar() {
    setOcupado(true);
    setMsg(null);
    const r = await fetch(`/api/admin/tarot/campanas/${params.id}/ejecutar`, { method: "POST" });
    const json = await r.json().catch(() => ({}));
    const res = json?.resultado?.campanas?.[0];
    setMsg(json.ok
      ? { tipo: "ok", texto: res ? `Ejecutada: ${JSON.stringify(res)}` : "La campaña no está activa: no se procesó nada." }
      : { tipo: "err", texto: JSON.stringify(json.detalle ?? json.motivo ?? "Error") });
    setOcupado(false);
    cargar();
  }

  async function guardar() {
    if (!cfg) return;
    setOcupado(true);
    setMsg(null);
    const body = {
      accion: "config",
      modo_envio: cfg.modo_envio,
      costo_estimado_por_envio: cfg.costo_estimado_por_envio,
      costo_moneda: cfg.costo_moneda,
      costo_real_total: cfg.costo_real_total,
      costo_real_fuente: cfg.costo_real_fuente,
      limite_diario: Number(cfg.limite_diario),
      ventana_horaria: { desde: Number(cfg.ventana_desde), hasta: Number(cfg.ventana_hasta) },
      audiencia: cfg.audiencia,
      disparador: cfg.disparador,
    };
    const r = await fetch(`/api/admin/tarot/campanas/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await r.json().catch(() => ({}));
    setMsg(json.ok ? { tipo: "ok", texto: "Configuración guardada." } : { tipo: "err", texto: json.detalle ?? json.motivo ?? "Error" });
    setOcupado(false);
    cargar();
  }

  const setAud = (k: string, v: unknown) => setCfg((p) => p && { ...p, audiencia: { ...(p.audiencia as object), [k]: v } });
  const setDisp = (k: string, v: unknown) => setCfg((p) => p && { ...p, disparador: { ...(p.disparador as object), [k]: v } });
  const aud = (cfg?.audiencia ?? {}) as Record<string, unknown>;
  const disp = (cfg?.disparador ?? {}) as Record<string, unknown>;
  const tipos = (aud.tipos_orden as string[] | undefined) ?? ["venta", "cortesia"];

  if (cargando && !d) {
    return <TarotAdminShell><main className="px-6 py-10 text-gray-500"><Loader2 size={16} className="inline animate-spin mr-2" />Cargando…</main></TarotAdminShell>;
  }
  if (!d || !cfg) {
    return <TarotAdminShell><main className="px-6 py-10 text-red-300">{msg?.texto ?? "No encontrada"}</main></TarotAdminShell>;
  }

  const { campana: c, metricas: m, costos, elegibles } = d;
  const est = ESTADO_CAMPANA_UI[c.estado] ?? ESTADO_CAMPANA_UI.borrador;
  const reales = m.enviados - m.simulados;
  const maxRating = Math.max(1, m.rating_1, m.rating_2, m.rating_3, m.rating_4, m.rating_5);

  return (
    <TarotAdminShell>
      <main className="px-6 py-6 space-y-6">
        <div>
          <Link href={"/admin/tarot/campanas" as Route} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"><ArrowLeft size={12} /> Campañas</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-white">{c.nombre}</h2>
            <span className={`rounded px-2 py-0.5 text-xs ${est.cls}`}>{est.label}</span>
            <span className={`rounded px-2 py-0.5 text-xs ${c.modo_envio === "real" ? "bg-fuchsia-900/50 text-fuchsia-300" : "bg-gray-800 text-gray-400"}`}>
              {c.modo_envio === "real" ? "Envío REAL" : "Envío simulado"}
            </span>
            <span className="text-xs text-gray-500">{TIPO_CAMPANA_UI[c.tipo]} · WhatsApp · plantilla {String(c.mensaje.template_nombre ?? "—")}</span>
          </div>
          {c.descripcion && <p className="text-xs text-gray-500 mt-1">{c.descripcion}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {(c.estado === "borrador" || c.estado === "pausada") && (
              <button disabled={ocupado} onClick={() => accion("activar")} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-emerald-700/60 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-800/40 disabled:opacity-50"><Play size={13} /> {c.estado === "pausada" ? "Reanudar" : "Activar"}</button>
            )}
            {c.estado === "activa" && (
              <button disabled={ocupado} onClick={() => accion("pausar")} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-900/30 text-amber-200 hover:bg-amber-800/40 disabled:opacity-50"><Pause size={13} /> Pausar</button>
            )}
            {c.estado === "activa" && (
              <button disabled={ocupado} onClick={ejecutar} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800 disabled:opacity-50"><Zap size={13} /> Ejecutar ahora</button>
            )}
            {c.estado !== "finalizada" && (
              <button disabled={ocupado} onClick={() => accion("finalizar")} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800 disabled:opacity-50"><Square size={13} /> Finalizar</button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Última ejecución: {fmtFecha(c.ultima_ejecucion_at)}{c.ultima_ejecucion_resumen ? ` · ${JSON.stringify(c.ultima_ejecucion_resumen)}` : ""}
          </p>
        </div>

        {msg && (
          <div className={`flex items-start gap-2 rounded-lg px-4 py-2.5 text-sm break-all ${msg.tipo === "ok" ? "border border-emerald-800/50 bg-emerald-950/30 text-emerald-300" : "border border-red-800/50 bg-red-950/40 text-red-300"}`}>
            {msg.tipo === "err" && <AlertCircle size={15} className="shrink-0 mt-0.5" />} {msg.texto}
          </div>
        )}

        {/* Funnel */}
        <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <Kpi label="Elegibles" valor={elegibles.total + elegibles.encolados} sub={`${elegibles.vencidos} listos · ${elegibles.total - elegibles.vencidos} esperando`} />
          <Kpi label="Enviados" valor={reales} sub={m.simulados > 0 ? `+${m.simulados} simulados · ${m.pendientes} pendientes` : `${m.pendientes} pendientes`} />
          <Kpi label="Entregados" valor={m.entregados} sub={`${m.leidos} leídos · ${fmtPct(m.entregados, reales)}`} />
          <Kpi label="Visitas mini web" valor={m.visitas} sub={fmtPct(m.visitas, m.enviados)} />
          <Kpi label="Respuestas" valor={m.respuestas} sub={`Tasa ${fmtPct(m.respuestas, m.enviados)}`} />
          <Kpi label="Rating promedio" valor={m.rating_promedio ?? "—"} sub={`${m.con_comentario} con comentario`} />
          <Kpi label="Autoriza sitio" valor={m.autoriza_sitio} />
          <Kpi label="Autoriza difusión" valor={m.autoriza_difusion} />
          <Kpi label="Candidatos testimonio" valor={m.candidatos_testimonio} sub={<Link href={"/admin/tarot/testimonios" as Route} className="underline">Revisar en Testimonios</Link>} />
          <Kpi label="Errores" valor={m.errores} sub={`${m.descartados} descartados`} />
          <Kpi label={`Costo (${costos.fuente})`} valor={fmtMoneda(costos.real ?? costos.estimado, costos.moneda)} sub={`Estimado ${fmtMoneda(costos.estimado, costos.moneda)} · real ${costos.real === null ? "sin cargar" : fmtMoneda(costos.real, costos.moneda)}`} />
          <Kpi label="Costo por respuesta" valor={costos.por_respuesta === null ? "—" : fmtMoneda(costos.por_respuesta, costos.moneda)} sub={costos.por_envio_real === null ? undefined : `por envío ${fmtMoneda(costos.por_envio_real, costos.moneda)}`} />
        </section>

        {/* Distribución */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-4">
          <h3 className="text-sm font-semibold text-white mb-3">Distribución de estrellas</h3>
          {[5, 4, 3, 2, 1].map((n) => {
            const v = m[`rating_${n}` as keyof typeof m] as number;
            return (
              <div key={n} className="flex items-center gap-3 text-xs text-gray-300 mb-1.5">
                <span className="w-10 flex items-center gap-1">{n} <Star size={11} className="text-amber-400 fill-amber-400" /></span>
                <div className="flex-1 h-2.5 rounded bg-gray-800 overflow-hidden"><div className="h-full bg-amber-500/80" style={{ width: `${(v / maxRating) * 100}%` }} /></div>
                <span className="w-8 text-right">{v}</span>
              </div>
            );
          })}
        </section>

        {/* Configuración */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-4 space-y-4">
          <h3 className="text-sm font-semibold text-white">Configuración</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Modo de envío</label>
              <select className={inputCls} value={String(cfg.modo_envio)} onChange={(e) => setCfg({ ...cfg, modo_envio: e.target.value })}>
                <option value="simulado">Simulado (no envía WhatsApp)</option>
                <option value="real">Real (envía WhatsApp)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Costo estimado por envío *</label>
              <div className="flex gap-2">
                <input className={inputCls} type="number" step="0.0001" min={0} value={String(cfg.costo_estimado_por_envio)} onChange={(e) => setCfg({ ...cfg, costo_estimado_por_envio: e.target.value })} placeholder="ej. 0.0750" />
                <input className={inputCls + " w-20"} value={String(cfg.costo_moneda)} onChange={(e) => setCfg({ ...cfg, costo_moneda: e.target.value.toUpperCase() })} maxLength={3} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Costo real total (facturación)</label>
              <input className={inputCls} type="number" step="0.01" min={0} value={String(cfg.costo_real_total)} onChange={(e) => setCfg({ ...cfg, costo_real_total: e.target.value })} placeholder="vacío = usar estimado" />
            </div>
            <div>
              <label className={labelCls}>Fuente del costo real</label>
              <input className={inputCls} value={String(cfg.costo_real_fuente)} onChange={(e) => setCfg({ ...cfg, costo_real_fuente: e.target.value })} placeholder="ej. factura Meta oct-2026" />
            </div>
            <div>
              <label className={labelCls}>Límite diario de envíos</label>
              <input className={inputCls} type="number" min={1} value={String(cfg.limite_diario)} onChange={(e) => setCfg({ ...cfg, limite_diario: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Ventana horaria (hora UY)</label>
              <div className="flex gap-2 items-center">
                <input className={inputCls} type="number" min={0} max={23} value={String(cfg.ventana_desde)} onChange={(e) => setCfg({ ...cfg, ventana_desde: e.target.value })} />
                <span className="text-gray-500">a</span>
                <input className={inputCls} type="number" min={1} max={24} value={String(cfg.ventana_hasta)} onChange={(e) => setCfg({ ...cfg, ventana_hasta: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Horas desde 1ª apertura</label>
              <input className={inputCls} type="number" min={1} value={String(disp.horas_desde_apertura ?? 24)} onChange={(e) => setDisp("horas_desde_apertura", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Fallback: horas desde entrega</label>
              <input className={inputCls} type="number" min={1} value={String(disp.horas_fallback_entrega ?? 48)} onChange={(e) => setDisp("horas_fallback_entrega", e.target.value)} />
            </div>
          </div>
          <div>
            <p className={labelCls}>Audiencia</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Check label="Ventas" checked={tipos.includes("venta")} onChange={(v) => setAud("tipos_orden", v ? [...new Set([...tipos, "venta"])] : tipos.filter((t) => t !== "venta"))} />
              <Check label="Cortesías" checked={tipos.includes("cortesia")} onChange={(v) => setAud("tipos_orden", v ? [...new Set([...tipos, "cortesia"])] : tipos.filter((t) => t !== "cortesia"))} />
              <Check label="Incluir cobros manuales" checked={aud.incluir_cobro_manual === true} onChange={(v) => setAud("incluir_cobro_manual", v)} />
              <Check label="Incluir entregas simuladas" checked={aud.incluir_entregas_simuladas === true} onChange={(v) => setAud("incluir_entregas_simuladas", v)} />
              <Check label="Excluir teléfonos de prueba" checked={aud.excluir_telefonos_prueba !== false} onChange={(v) => setAud("excluir_telefonos_prueba", v)} />
              <Check label="Excluir órdenes QA" checked={aud.excluir_qa !== false} onChange={(v) => setAud("excluir_qa", v)} />
              <Check label="Excluir con reclamo" checked={aud.excluir_con_reclamo !== false} onChange={(v) => setAud("excluir_con_reclamo", v)} />
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Entregadas desde (vacío = desde la activación)</label>
                <input className={inputCls} type="datetime-local" value={aud.entregadas_desde ? String(aud.entregadas_desde).slice(0, 16) : ""} onChange={(e) => setAud("entregadas_desde", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </div>
              <div>
                <label className={labelCls}>Días mínimos entre pedidos al mismo cliente</label>
                <input className={inputCls} type="number" min={0} value={String(aud.dias_entre_envios_por_cliente ?? 30)} onChange={(e) => setAud("dias_entre_envios_por_cliente", Number(e.target.value))} />
              </div>
            </div>
          </div>
          <button disabled={ocupado} onClick={guardar} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-amber-700/60 bg-amber-900/30 text-amber-200 hover:bg-amber-800/40 disabled:opacity-50"><Save size={13} /> Guardar configuración</button>
        </section>

        {/* Respuestas */}
        <section>
          <h3 className="text-sm font-semibold text-white mb-2">Respuestas ({d.respuestas.length})</h3>
          <div className="rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-900 border-b border-gray-800 text-left">
                {["Fecha", "Cliente (privado)", "Identidad pública", "Rating", "Opinión", "Sitio", "Difusión", "Orden", "Testimonio"].map((h) => <th key={h} className="px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {d.respuestas.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-500">Todavía no hay respuestas.</td></tr>}
                {d.respuestas.map((r) => (
                  <tr key={r.id} className="border-b border-gray-800/60 align-top">
                    <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{fmtFecha(r.created_at)}</td>
                    <td className="px-3 py-2.5 text-gray-200">{r.tarot_ordenes?.nombre_snapshot ?? "—"}<span className="block text-xs text-gray-500 font-mono">{r.tarot_ordenes?.telefono_snapshot}</span></td>
                    <td className="px-3 py-2.5 text-amber-200 whitespace-nowrap">{r.identidad_publica}{r.identidad_prevista !== r.identidad_publica && <span className="block text-[10px] text-gray-500">hoy: {r.identidad_prevista}</span>}</td>
                    <td className="px-3 py-2.5 text-gray-200 whitespace-nowrap">{"★".repeat(r.rating)}<span className="text-gray-600">{"★".repeat(5 - r.rating)}</span></td>
                    <td className="px-3 py-2.5 text-gray-300 max-w-[320px]">{r.comentario ?? <span className="text-gray-600">—</span>}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">{r.consentimiento_sitio ? <span className="text-emerald-300">Sí<span className="block text-gray-500">{fmtFecha(r.consentimiento_sitio_at)} · {r.consentimiento_sitio_version}</span></span> : <span className="text-gray-500">No</span>}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">{r.consentimiento_difusion ? <span className="text-emerald-300">Sí<span className="block text-gray-500">{fmtFecha(r.consentimiento_difusion_at)} · {r.consentimiento_difusion_version}</span></span> : <span className="text-gray-500">No</span>}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-gray-400">{r.tarot_ordenes?.external_reference?.slice(0, 15) ?? r.orden_id.slice(0, 8)}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {r.testimonio_id
                        ? (r.tarot_testimonios?.publicado ? <span className="text-emerald-300">Publicado</span> : <Link href={"/admin/tarot/testimonios" as Route} className="text-fuchsia-300 underline">Candidato (sin publicar)</Link>)
                        : <span className="text-gray-500">{r.consentimiento_sitio || r.consentimiento_difusion ? "Sin comentario" : "Solo feedback"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Envíos */}
        <section>
          <h3 className="text-sm font-semibold text-white mb-2">Envíos ({d.envios.length})</h3>
          <div className="rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-900 border-b border-gray-800 text-left">
                {["Orden", "Cliente", "Estado", "Disparo", "Programado", "Enviado", "WhatsApp", "Intentos / error", "Visitas", "Respondió", "Costo"].map((h) => <th key={h} className="px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {d.envios.length === 0 && <tr><td colSpan={11} className="px-4 py-6 text-center text-gray-500">Sin envíos.</td></tr>}
                {d.envios.map((e) => (
                  <tr key={e.id} className="border-b border-gray-800/60 align-top">
                    <td className="px-3 py-2.5 text-xs font-mono text-gray-400">{e.tarot_ordenes?.external_reference?.slice(0, 15) ?? e.orden_id.slice(0, 8)}</td>
                    <td className="px-3 py-2.5 text-gray-200 whitespace-nowrap">{e.tarot_ordenes?.nombre_snapshot ?? "—"}</td>
                    <td className="px-3 py-2.5"><span className={`rounded px-2 py-0.5 text-xs ${ESTADO_ENVIO[e.estado] ?? ""}`}>{e.estado}{e.simulado ? " (sim.)" : ""}</span></td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{e.motivo_disparo === "apertura" ? "24 h tras apertura" : e.motivo_disparo === "fallback_entrega" ? "48 h tras entrega" : "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtFecha(e.programado_para)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtFecha(e.enviado_at)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-300">{e.simulado ? "—" : e.tarot_whatsapp_mensajes?.estado ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-300 max-w-[260px]">{e.intentos}{e.ultimo_error && <span className="block text-red-300 break-words">{e.ultimo_error}</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-300">{e.visitas}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-300 whitespace-nowrap">{fmtFecha(e.respondido_at)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-300 whitespace-nowrap">{e.costo_estimado === null ? "—" : fmtMoneda(e.costo_estimado, c.costo_moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </TarotAdminShell>
  );
}
