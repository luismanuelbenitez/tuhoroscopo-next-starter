// Admin de Campañas (2026-10-19) — server-only (usa SUPABASE_SECRET_KEY).
// Lo usan las rutas /api/admin/tarot/campanas/*; nunca un Client Component.
import { createClient } from "@supabase/supabase-js";
import { identidadPublica } from "@/lib/identidadPublica";

export const ESTADOS_CAMPANA = ["borrador", "activa", "pausada", "finalizada"] as const;
export type EstadoCampana = (typeof ESTADOS_CAMPANA)[number];

export function db() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

type Db = NonNullable<ReturnType<typeof db>>;

export interface MetricasCampana {
  encolados: number; pendientes: number; enviados: number; simulados: number;
  entregados: number; leidos: number; errores: number; descartados: number;
  visitas: number; respuestas: number; rating_promedio: number | null;
  rating_1: number; rating_2: number; rating_3: number; rating_4: number; rating_5: number;
  con_comentario: number; autoriza_sitio: number; autoriza_difusion: number;
  candidatos_testimonio: number; costo_estimado_total: number; costo_real_envios: number;
  primer_envio_at: string | null;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

function normalizarMetricas(m: Record<string, unknown> | undefined): MetricasCampana {
  const r = m ?? {};
  return {
    encolados: num(r.encolados), pendientes: num(r.pendientes), enviados: num(r.enviados), simulados: num(r.simulados),
    entregados: num(r.entregados), leidos: num(r.leidos), errores: num(r.errores), descartados: num(r.descartados),
    visitas: num(r.visitas), respuestas: num(r.respuestas),
    rating_promedio: r.rating_promedio === null || r.rating_promedio === undefined ? null : Number(r.rating_promedio),
    rating_1: num(r.rating_1), rating_2: num(r.rating_2), rating_3: num(r.rating_3), rating_4: num(r.rating_4), rating_5: num(r.rating_5),
    con_comentario: num(r.con_comentario), autoriza_sitio: num(r.autoriza_sitio), autoriza_difusion: num(r.autoriza_difusion),
    candidatos_testimonio: num(r.candidatos_testimonio),
    costo_estimado_total: num(r.costo_estimado_total), costo_real_envios: num(r.costo_real_envios),
    primer_envio_at: (r.primer_envio_at as string | null) ?? null,
  };
}

// Costo: el real (cargado desde la facturación del proveedor) manda si existe;
// si no, el estimado (costo_estimado_por_envio × envíos reales).
export function costosDe(c: { costo_real_total: number | null; costo_moneda: string }, m: MetricasCampana) {
  const real = c.costo_real_total !== null && c.costo_real_total !== undefined ? Number(c.costo_real_total) : (m.costo_real_envios > 0 ? m.costo_real_envios : null);
  const estimado = m.costo_estimado_total;
  const vigente = real ?? estimado;
  return {
    moneda: c.costo_moneda,
    estimado,
    real,
    fuente: real !== null ? "real" : "estimado",
    por_envio_real: m.enviados - m.simulados > 0 ? vigente / (m.enviados - m.simulados) : null,
    por_respuesta: m.respuestas > 0 ? vigente / m.respuestas : null,
  };
}

async function elegibles(supabase: Db, campanaId: string, tipo: string) {
  if (tipo !== "feedback_experiencia") return { total: 0, vencidos: 0 };
  const { data } = await supabase.rpc("tarot_campana_feedback_candidatos", { p_campana_id: campanaId });
  const filas = (data ?? []) as { vencido: boolean }[];
  return { total: filas.length, vencidos: filas.filter((f) => f.vencido).length };
}

export async function listarCampanas(supabase: Db) {
  const [{ data: campanas, error }, { data: metricas }] = await Promise.all([
    supabase.from("tarot_campanas").select("*").order("created_at", { ascending: true }),
    supabase.from("tarot_campanas_metricas").select("*"),
  ]);
  if (error) throw new Error(error.message);
  const porId = new Map((metricas ?? []).map((m) => [m.campana_id as string, m]));
  return Promise.all((campanas ?? []).map(async (c) => {
    const m = normalizarMetricas(porId.get(c.id));
    const e = await elegibles(supabase, c.id, c.tipo);
    return { ...c, metricas: m, elegibles: { ...e, encolados: m.encolados }, costos: costosDe(c, m) };
  }));
}

export async function detalleCampana(supabase: Db, id: string) {
  const { data: c, error } = await supabase.from("tarot_campanas").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) return null;
  const [{ data: met }, el, { data: envios }, { data: respuestas }] = await Promise.all([
    supabase.from("tarot_campanas_metricas").select("*").eq("campana_id", id).maybeSingle(),
    elegibles(supabase, id, c.tipo),
    supabase.from("tarot_campana_envios")
      .select("id, orden_id, estado, motivo_disparo, programado_para, intentos, ultimo_intento_at, ultimo_error, simulado, enviado_at, primera_visita_at, visitas, respondido_at, costo_estimado, tarot_whatsapp_mensajes(estado), tarot_ordenes(external_reference, nombre_snapshot, telefono_snapshot)")
      .eq("campana_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("tarot_feedback_respuestas")
      .select("id, orden_id, rating, comentario, identidad_publica, consentimiento_sitio, consentimiento_sitio_at, consentimiento_sitio_version, consentimiento_difusion, consentimiento_difusion_at, consentimiento_difusion_version, testimonio_id, created_at, tarot_ordenes(external_reference, nombre_snapshot, telefono_snapshot), tarot_testimonios!tarot_feedback_respuestas_testimonio_id_fkey(publicado)")
      .eq("campana_id", id).order("created_at", { ascending: false }).limit(500),
  ]);
  const m = normalizarMetricas(met ?? undefined);
  return {
    campana: c,
    metricas: m,
    elegibles: { ...el, encolados: m.encolados },
    costos: costosDe(c, m),
    envios: envios ?? [],
    respuestas: (respuestas ?? []).map((r) => ({
      ...r,
      // Identidad pública guardada al responder; la "prevista" recalcula con el helper canónico.
      identidad_prevista: identidadPublica((r.tarot_ordenes as { nombre_snapshot?: string } | null)?.nombre_snapshot ?? null),
    })),
  };
}

// ── Acciones ────────────────────────────────────────────────────────────────
const TRANSICIONES: Record<string, { desde: EstadoCampana[]; hacia: EstadoCampana }> = {
  activar:   { desde: ["borrador", "pausada"], hacia: "activa" },
  pausar:    { desde: ["activa"], hacia: "pausada" },
  finalizar: { desde: ["borrador", "activa", "pausada"], hacia: "finalizada" },
};

export async function cambiarEstado(supabase: Db, id: string, accion: string, operador: string) {
  const t = TRANSICIONES[accion];
  if (!t) return { ok: false, motivo: "accion_invalida" };
  const { data: c } = await supabase.from("tarot_campanas").select("*").eq("id", id).maybeSingle();
  if (!c) return { ok: false, motivo: "no_encontrada" };
  if (!t.desde.includes(c.estado)) return { ok: false, motivo: "transicion_invalida", detalle: `${c.estado} → ${t.hacia}` };
  if (t.hacia === "activa" && (c.costo_estimado_por_envio === null || c.costo_estimado_por_envio === undefined)) {
    return { ok: false, motivo: "costo_requerido", detalle: "Definí el costo estimado por envío antes de activar." };
  }
  const ahora = new Date().toISOString();
  const patch: Record<string, unknown> = { estado: t.hacia, actualizado_por: operador };
  if (t.hacia === "activa") {
    patch.activada_at = c.activada_at ?? ahora;
    // Por defecto, al activar por primera vez solo entran entregas desde ese
    // momento: activar nunca dispara una tanda sobre clientes históricos.
    const aud = (c.audiencia ?? {}) as Record<string, unknown>;
    if (!aud.entregadas_desde) patch.audiencia = { ...aud, entregadas_desde: ahora };
  }
  if (t.hacia === "pausada") patch.pausada_at = ahora;
  if (t.hacia === "finalizada") patch.finalizada_at = ahora;
  const { error } = await supabase.from("tarot_campanas").update(patch).eq("id", id).eq("estado", c.estado);
  if (error) return { ok: false, motivo: "db_error", detalle: error.message };
  await supabase.from("tarot_logs").insert({
    evento: `campana_${accion}`, nivel: "info", funcion_origen: "admin_campanas",
    mensaje: `Campaña ${c.slug}: ${c.estado} → ${t.hacia} (por ${operador})`,
    payload: { campana_id: id, desde: c.estado, hacia: t.hacia },
  });
  return { ok: true };
}

const CLAVES_AUDIENCIA = ["tipos_orden", "incluir_cobro_manual", "incluir_entregas_simuladas", "excluir_telefonos_prueba", "excluir_qa", "solo_ordenes_qa", "excluir_con_reclamo", "entregadas_desde", "dias_entre_envios_por_cliente"];
const CLAVES_DISPARADOR = ["horas_desde_apertura", "horas_fallback_entrega", "max_dias_desde_entrega", "dias_validez_link"];

export async function actualizarConfig(supabase: Db, id: string, body: Record<string, unknown>, operador: string) {
  const { data: c } = await supabase.from("tarot_campanas").select("*").eq("id", id).maybeSingle();
  if (!c) return { ok: false, motivo: "no_encontrada" };
  const patch: Record<string, unknown> = { actualizado_por: operador };

  if (body.costo_estimado_por_envio !== undefined) {
    const v = body.costo_estimado_por_envio === "" || body.costo_estimado_por_envio === null ? null : Number(body.costo_estimado_por_envio);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return { ok: false, motivo: "costo_invalido" };
    if (v === null && c.estado === "activa") return { ok: false, motivo: "costo_requerido" };
    patch.costo_estimado_por_envio = v;
  }
  if (typeof body.costo_moneda === "string" && /^[A-Z]{3}$/.test(body.costo_moneda)) patch.costo_moneda = body.costo_moneda;
  if (body.costo_real_total !== undefined) {
    const v = body.costo_real_total === "" || body.costo_real_total === null ? null : Number(body.costo_real_total);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return { ok: false, motivo: "costo_invalido" };
    patch.costo_real_total = v;
    patch.costo_real_fuente = typeof body.costo_real_fuente === "string" ? body.costo_real_fuente.slice(0, 200) : c.costo_real_fuente;
    patch.costo_real_actualizado_at = new Date().toISOString();
  }
  if (body.limite_diario !== undefined) {
    const v = Number(body.limite_diario);
    if (!Number.isInteger(v) || v < 1 || v > 1000) return { ok: false, motivo: "limite_invalido" };
    patch.limite_diario = v;
  }
  if (body.modo_envio === "simulado" || body.modo_envio === "real") patch.modo_envio = body.modo_envio;
  if (body.ventana_horaria && typeof body.ventana_horaria === "object") {
    const v = body.ventana_horaria as Record<string, unknown>;
    const desde = Number(v.desde), hasta = Number(v.hasta);
    if (!(desde >= 0 && desde <= 23 && hasta >= 1 && hasta <= 24 && desde < hasta)) return { ok: false, motivo: "ventana_invalida" };
    patch.ventana_horaria = { ...(c.ventana_horaria ?? {}), desde, hasta };
  }
  if (body.audiencia && typeof body.audiencia === "object") {
    const a = body.audiencia as Record<string, unknown>;
    const limpio = Object.fromEntries(Object.entries(a).filter(([k]) => CLAVES_AUDIENCIA.includes(k)));
    if (limpio.tipos_orden !== undefined) {
      const tipos = Array.isArray(limpio.tipos_orden) ? limpio.tipos_orden.filter((t) => t === "venta" || t === "cortesia") : [];
      if (tipos.length === 0) return { ok: false, motivo: "audiencia_sin_tipos" };
      limpio.tipos_orden = tipos;
    }
    patch.audiencia = { ...(c.audiencia ?? {}), ...limpio };
  }
  if (body.disparador && typeof body.disparador === "object") {
    const d = body.disparador as Record<string, unknown>;
    const limpio = Object.fromEntries(Object.entries(d).filter(([k, v]) => CLAVES_DISPARADOR.includes(k) && Number(v) > 0).map(([k, v]) => [k, Number(v)]));
    patch.disparador = { ...(c.disparador ?? {}), ...limpio };
  }

  const { error } = await supabase.from("tarot_campanas").update(patch).eq("id", id);
  if (error) return { ok: false, motivo: "db_error", detalle: error.message };
  return { ok: true };
}

export async function ejecutarAhora(id: string) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  const internal = process.env.TAROT_INTERNAL_KEY ?? "";
  if (!url || !key || !internal) return { ok: false, motivo: "config_error" };
  const res = await fetch(`${url}/functions/v1/ef_tarot_campanas_runner`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "x-internal-key": internal },
    body: JSON.stringify({ campana_id: id }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  return res.ok ? { ok: true, resultado: data } : { ok: false, motivo: "runner_error", detalle: data };
}
