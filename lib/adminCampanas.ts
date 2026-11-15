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

async function elegibles(supabase: Db, campanaId: string, tipo: string, seleccion?: string) {
  if (seleccion === "manual") {
    // Manuales: total = personas elegidas (en cualquier estado, sin la prueba).
    const { count } = await supabase.from("tarot_campana_envios").select("id", { count: "exact", head: true })
      .eq("campana_id", campanaId).eq("es_prueba", false);
    return { total: count ?? 0, vencidos: 0 };
  }
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
    const e = await elegibles(supabase, c.id, c.tipo, c.seleccion);
    return { ...c, metricas: m, elegibles: { ...e, encolados: m.encolados }, costos: costosDe(c, m) };
  }));
}

export async function detalleCampana(supabase: Db, id: string) {
  const { data: c, error } = await supabase.from("tarot_campanas").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) return null;
  const [{ data: met }, el, { data: envios }, { data: respuestas }] = await Promise.all([
    supabase.from("tarot_campanas_metricas").select("*").eq("campana_id", id).maybeSingle(),
    elegibles(supabase, id, c.tipo, c.seleccion),
    supabase.from("tarot_campana_envios")
      .select("id, orden_id, estado, motivo_disparo, programado_para, intentos, ultimo_intento_at, ultimo_error, simulado, enviado_at, primera_visita_at, visitas, respondido_at, costo_estimado, tarot_whatsapp_mensajes(estado), tarot_ordenes(external_reference, nombre_snapshot, telefono_snapshot)")
      .eq("campana_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("tarot_feedback_respuestas")
      .select("id, orden_id, rating, comentario, identidad_publica, consentimiento_sitio, consentimiento_sitio_at, consentimiento_sitio_version, consentimiento_difusion, consentimiento_difusion_at, consentimiento_difusion_version, testimonio_id, created_at, tarot_ordenes(external_reference, nombre_snapshot, telefono_snapshot), tarot_testimonios!tarot_feedback_respuestas_testimonio_id_fkey(publicado)")
      .eq("campana_id", id).order("created_at", { ascending: false }).limit(500),
  ]);
  const m = normalizarMetricas(met ?? undefined);
  const manual = c.seleccion === "manual"
    ? {
        seguimiento: await seguimientoManual(supabase, c),
        cupon: c.codigo_descuento_id
          ? (await supabase.from("tarot_codigos_descuento").select("id, codigo, tipo_descuento, valor_descuento, fecha_fin, activo, max_usos_por_cliente").eq("id", c.codigo_descuento_id).maybeSingle()).data
          : null,
      }
    : null;
  return {
    manual,
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
  // Las campañas manuales se activan solo con "Disparar" (que arma la cola);
  // "Activar" queda para reanudar una que ya se disparó y se pausó.
  if (c.seleccion === "manual" && t.hacia === "activa" && !c.disparada_at) {
    return { ok: false, motivo: "usar_disparar", detalle: "Esta campaña se envía con el botón Disparar." };
  }
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

export async function ejecutarAhora(id: string, extra: Record<string, unknown> = {}) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  const internal = process.env.TAROT_INTERNAL_KEY ?? "";
  if (!url || !key || !internal) return { ok: false, motivo: "config_error" };
  const res = await fetch(`${url}/functions/v1/ef_tarot_campanas_runner`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "x-internal-key": internal },
    body: JSON.stringify({ campana_id: id, ...extra }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  return res.ok ? { ok: true, resultado: data } : { ok: false, motivo: "runner_error", detalle: data };
}

// Acciones del motor que no envían a clientes: estado de la plantilla en Meta,
// mandarla a aprobación, o la prueba (solo al número de prueba).
export async function accionMotor(id: string, accion: "plantilla" | "plantilla_crear" | "prueba"): Promise<Record<string, unknown> & { ok?: boolean }> {
  const r = await ejecutarAhora(id, { accion });
  if (!r.ok) return r as Record<string, unknown> & { ok?: boolean };
  return (r.resultado ?? { ok: false, motivo: "sin_respuesta" }) as Record<string, unknown> & { ok?: boolean };
}

// ============================================================================
// Campañas MANUALES (2026-11-14): Manuel elige a quién y dispara.
// ============================================================================
export const TIPOS_MANUALES = ["feedback_experiencia", "cupon_descuento"] as const;
const PLANTILLA_POR_TIPO: Record<string, string> = {
  feedback_experiencia: "tu_oraculo_feedback_v1",
  cupon_descuento: "tu_oraculo_cupon_v1",
};

const digitos = (t: string) => t.replace(/\D/g, "");

function slugDe(nombre: string): string {
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "campana";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function codigosDisponibles(supabase: Db) {
  const { data } = await supabase.from("tarot_codigos_descuento")
    .select("id, codigo, tipo_descuento, valor_descuento, fecha_fin, max_usos_por_cliente, activo, habilita_orden_gratuita")
    .eq("activo", true).not("fecha_fin", "is", null).gt("fecha_fin", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}

export async function crearCampana(supabase: Db, body: Record<string, unknown>, operador: string) {
  const tipo = String(body.tipo ?? "");
  if (!(TIPOS_MANUALES as readonly string[]).includes(tipo)) return { ok: false, motivo: "tipo_invalido" };
  const nombre = String(body.nombre ?? "").trim().slice(0, 80);
  if (nombre.length < 3) return { ok: false, motivo: "nombre_requerido", detalle: "Poné un nombre a la campaña." };
  const slug = slugDe(nombre);

  let codigoId: string | null = null;
  if (tipo === "cupon_descuento") {
    const nuevo = body.cupon_nuevo as Record<string, unknown> | undefined;
    if (nuevo) {
      const codigo = String(nuevo.codigo ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      const pct = Number(nuevo.porcentaje);
      const vence = String(nuevo.vence ?? "");
      if (codigo.length < 4 || codigo.length > 20) return { ok: false, motivo: "codigo_invalido", detalle: "El código va de 4 a 20 letras o números." };
      if (!Number.isInteger(pct) || pct < 5 || pct > 100) return { ok: false, motivo: "porcentaje_invalido", detalle: "El descuento va de 5 % a 100 %." };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(vence) || new Date(`${vence}T23:59:59-03:00`) <= new Date()) {
        return { ok: false, motivo: "vence_invalido", detalle: "La fecha de vencimiento tiene que ser futura." };
      }
      const { data: existe } = await supabase.from("tarot_codigos_descuento").select("id").ilike("codigo", codigo).maybeSingle();
      if (existe) return { ok: false, motivo: "codigo_existente", detalle: `Ya existe un código ${codigo}. Elegilo de la lista o usá otro nombre.` };
      const { data: cod, error } = await supabase.from("tarot_codigos_descuento").insert({
        codigo, descripcion: `Campaña "${nombre}": ${pct} % en la próxima lectura`,
        tipo_descuento: "porcentaje", valor_descuento: pct, monedas_aplicables: ["UYU"],
        fecha_inicio: new Date().toISOString(), fecha_fin: `${vence}T23:59:59-03:00`,
        max_usos_total: null, max_usos_por_cliente: 1, solo_nuevos_clientes: false,
        campania: slug, canal: "whatsapp", activo: true, habilita_orden_gratuita: pct === 100,
        metadata: { origen: "campana_manual" }, creado_por: operador,
      }).select("id").single();
      if (error || !cod) return { ok: false, motivo: "db_error", detalle: error?.message };
      codigoId = cod.id;
    } else {
      const id = String(body.codigo_descuento_id ?? "");
      const disponibles = await codigosDisponibles(supabase);
      if (!disponibles.some((c) => c.id === id)) return { ok: false, motivo: "cupon_requerido", detalle: "Elegí un cupón activo con fecha de vencimiento, o creá uno nuevo." };
      codigoId = id;
    }
  }

  const costo = body.costo_estimado_por_envio === undefined || body.costo_estimado_por_envio === "" ? null : Number(body.costo_estimado_por_envio);
  if (costo !== null && (!Number.isFinite(costo) || costo < 0)) return { ok: false, motivo: "costo_invalido" };

  const { data: c, error } = await supabase.from("tarot_campanas").insert({
    slug, nombre, tipo, seleccion: "manual", estado: "borrador", modo_envio: "real", canal: "whatsapp",
    descripcion: tipo === "cupon_descuento" ? "Regalo de un cupón para la próxima lectura. Destinatarios elegidos a mano." : "Pedido de opinión. Destinatarios elegidos a mano.",
    audiencia: {}, disparador: { dias_validez_link: 30 },
    mensaje: { template_nombre: PLANTILLA_POR_TIPO[tipo], template_idioma: "es" },
    codigo_descuento_id: codigoId, costo_estimado_por_envio: costo, costo_moneda: "USD",
    creado_por: operador, actualizado_por: operador,
  }).select("id").single();
  if (error || !c) return { ok: false, motivo: "db_error", detalle: error?.message };
  await supabase.from("tarot_logs").insert({
    evento: "campana_creada", nivel: "info", funcion_origen: "admin_campanas",
    mensaje: `Campaña manual creada: ${nombre} (${tipo})`, payload: { campana_id: c.id, tipo, codigo_descuento_id: codigoId },
  });
  return { ok: true, id: c.id as string };
}

export interface PersonaAudiencia {
  telefono: string; nombre: string | null; cliente_id: string | null; orden_id: string;
  ultima_entrega_at: string; tema: string | null; tipo_orden: string;
  ventas: number; cortesias: number; es_prueba: boolean; es_qa: boolean; con_reclamo: boolean;
  estado_en_campana: string | null; ultima_campana_at: string | null;
}

export async function audienciaManual(supabase: Db, id: string): Promise<PersonaAudiencia[]> {
  const { data, error } = await supabase.rpc("tarot_campana_audiencia_manual", { p_campana_id: id });
  if (error) throw new Error(error.message);
  return (data ?? []) as PersonaAudiencia[];
}

// Guarda la selección (solo mientras la campaña no se disparó). Agrega los
// teléfonos nuevos como 'seleccionado' y saca los que se destildaron.
export async function guardarSeleccion(supabase: Db, id: string, telefonos: unknown, operador: string) {
  const { data: c } = await supabase.from("tarot_campanas").select("id, slug, seleccion, estado, disparada_at").eq("id", id).maybeSingle();
  if (!c) return { ok: false, motivo: "no_encontrada" };
  if (c.seleccion !== "manual") return { ok: false, motivo: "no_manual" };
  if (c.estado !== "borrador" || c.disparada_at) return { ok: false, motivo: "ya_disparada", detalle: "La campaña ya se disparó: la lista no se puede cambiar." };
  const pedidos = Array.isArray(telefonos) ? [...new Set(telefonos.map((t) => digitos(String(t))).filter(Boolean))] : [];
  if (pedidos.length > 500) return { ok: false, motivo: "demasiados" };

  const audiencia = await audienciaManual(supabase, id);
  const porTel = new Map(audiencia.map((p) => [digitos(p.telefono), p]));
  const validos = pedidos.filter((t) => porTel.has(t));
  const noEncontrados = pedidos.filter((t) => !porTel.has(t));

  const { data: actuales } = await supabase.from("tarot_campana_envios").select("id, telefono, estado")
    .eq("campana_id", id).eq("es_prueba", false);
  const yaEstan = new Set((actuales ?? []).map((e) => digitos(e.telefono ?? "")));
  const sacar = (actuales ?? []).filter((e) => e.estado === "seleccionado" && !validos.includes(digitos(e.telefono ?? ""))).map((e) => e.id);
  if (sacar.length > 0) await supabase.from("tarot_campana_envios").delete().in("id", sacar).eq("estado", "seleccionado");

  const nuevos = validos.filter((t) => !yaEstan.has(t)).map((t) => {
    const p = porTel.get(t)!;
    return {
      campana_id: id, orden_id: p.orden_id, cliente_id: p.cliente_id, telefono: p.telefono, nombre: p.nombre,
      estado: "seleccionado", motivo_disparo: "manual", es_prueba: false, entregada_at: p.ultima_entrega_at,
    };
  });
  if (nuevos.length > 0) {
    const { error } = await supabase.from("tarot_campana_envios").upsert(nuevos, { onConflict: "campana_id,orden_id,es_prueba", ignoreDuplicates: true });
    if (error) return { ok: false, motivo: "db_error", detalle: error.message };
  }
  await supabase.from("tarot_campanas").update({ actualizado_por: operador }).eq("id", id);
  return { ok: true, seleccionados: validos.length, agregados: nuevos.length, quitados: sacar.length, no_encontrados: noEncontrados.map((t) => `+${t}`) };
}

// Disparo: pasa los seleccionados a la cola y activa la campaña. El motor
// los manda de a uno, en horario y con el tope diario. `confirmacion` tiene
// que coincidir con la cantidad de seleccionados (evita disparar otra lista).
export async function disparar(supabase: Db, id: string, confirmacion: unknown, operador: string) {
  const { data: c } = await supabase.from("tarot_campanas").select("*").eq("id", id).maybeSingle();
  if (!c) return { ok: false, motivo: "no_encontrada" };
  if (c.seleccion !== "manual") return { ok: false, motivo: "no_manual" };
  if (c.estado !== "borrador" || c.disparada_at) return { ok: false, motivo: "ya_disparada", detalle: "Esta campaña ya se disparó." };
  if (c.costo_estimado_por_envio === null || c.costo_estimado_por_envio === undefined) {
    return { ok: false, motivo: "costo_requerido", detalle: "Cargá el costo por mensaje antes de disparar." };
  }
  const { count } = await supabase.from("tarot_campana_envios").select("id", { count: "exact", head: true })
    .eq("campana_id", id).eq("es_prueba", false).eq("estado", "seleccionado");
  const n = count ?? 0;
  if (n === 0) return { ok: false, motivo: "sin_destinatarios", detalle: "No hay nadie seleccionado." };
  if (Number(confirmacion) !== n) return { ok: false, motivo: "confirmacion_distinta", detalle: `La lista cambió: ahora hay ${n} personas. Revisá y volvé a confirmar.` };

  if (c.modo_envio === "real") {
    const pl = await accionMotor(id, "plantilla");
    if (pl.estado !== "APPROVED") {
      return { ok: false, motivo: "plantilla_no_aprobada", detalle: `La plantilla de WhatsApp todavía no está aprobada por Meta (estado: ${String(pl.estado ?? pl.motivo ?? "desconocido")}).` };
    }
  }
  if (c.tipo === "cupon_descuento") {
    const vigentes = await codigosDisponibles(supabase);
    if (!vigentes.some((x) => x.id === c.codigo_descuento_id)) return { ok: false, motivo: "cupon_inactivo", detalle: "El cupón de la campaña está inactivo o vencido." };
  }

  const ahora = new Date().toISOString();
  const { error: errEnv } = await supabase.from("tarot_campana_envios")
    .update({ estado: "pendiente", programado_para: ahora })
    .eq("campana_id", id).eq("es_prueba", false).eq("estado", "seleccionado");
  if (errEnv) return { ok: false, motivo: "db_error", detalle: errEnv.message };
  const { error } = await supabase.from("tarot_campanas").update({
    estado: "activa", activada_at: ahora, disparada_at: ahora, disparada_por: operador, actualizado_por: operador,
  }).eq("id", id).eq("estado", "borrador");
  if (error) return { ok: false, motivo: "db_error", detalle: error.message };
  await supabase.from("tarot_logs").insert({
    evento: "campana_disparada", nivel: "info", funcion_origen: "admin_campanas",
    mensaje: `Campaña ${c.slug} disparada a ${n} personas (${c.modo_envio})`, payload: { campana_id: id, personas: n, modo: c.modo_envio },
  });
  const corrida = await ejecutarAhora(id);
  return { ok: true, personas: n, corrida: corrida.ok ? (corrida.resultado as { campanas?: unknown[] })?.campanas?.[0] ?? null : null };
}

// Seguimiento por persona: estado del WhatsApp, clic, opinión, cupón y compra.
export async function seguimientoManual(supabase: Db, c: { id: string; codigo_descuento_id: string | null }) {
  const { data: envios } = await supabase.from("tarot_campana_envios")
    .select("id, orden_id, telefono, nombre, estado, es_prueba, intentos, ultimo_error, simulado, enviado_at, primera_visita_at, visitas, respondido_at, costo_estimado, tarot_whatsapp_mensajes(estado)")
    .eq("campana_id", c.id).order("created_at", { ascending: true });
  const filas = envios ?? [];
  const ids = filas.map((e) => e.id);
  const tels = [...new Set(filas.map((e) => e.telefono).filter(Boolean))] as string[];
  const desde = filas.map((e) => e.enviado_at).filter(Boolean).sort()[0] as string | undefined;

  const [{ data: resp }, { data: usos }, { data: compras }] = await Promise.all([
    ids.length ? supabase.from("tarot_feedback_respuestas").select("envio_id, rating, comentario").in("envio_id", ids) : Promise.resolve({ data: [] as { envio_id: string; rating: number; comentario: string | null }[] }),
    c.codigo_descuento_id && tels.length
      ? supabase.from("tarot_codigos_descuento_usos").select("telefono, estado_uso, created_at").eq("codigo_id", c.codigo_descuento_id)
      : Promise.resolve({ data: [] as { telefono: string | null; estado_uso: string; created_at: string }[] }),
    desde && tels.length
      ? supabase.from("tarot_ordenes").select("telefono_snapshot, created_at, precio_cobrado").in("telefono_snapshot", tels).eq("estado", "entregado").eq("tipo_orden", "venta").gte("created_at", desde)
      : Promise.resolve({ data: [] as { telefono_snapshot: string; created_at: string; precio_cobrado: number }[] }),
  ]);
  const respPor = new Map((resp ?? []).map((r) => [r.envio_id, r]));

  return filas.map((e) => {
    const tel = digitos(e.telefono ?? "");
    const misUsos = (usos ?? []).filter((u) => digitos(u.telefono ?? "") === tel && (!e.enviado_at || u.created_at >= e.enviado_at));
    const misCompras = (compras ?? []).filter((o) => digitos(o.telefono_snapshot) === tel && e.enviado_at && o.created_at >= e.enviado_at);
    const r = respPor.get(e.id);
    const wa = (e.tarot_whatsapp_mensajes as { estado?: string } | null)?.estado ?? null;
    return {
      id: e.id, telefono: e.telefono, nombre: e.nombre, estado: e.estado, es_prueba: e.es_prueba, simulado: e.simulado,
      intentos: e.intentos, ultimo_error: e.ultimo_error, enviado_at: e.enviado_at,
      whatsapp: wa, entregado: wa === "entregado" || wa === "leido", leido: wa === "leido",
      abrio_link_at: e.primera_visita_at, visitas: e.visitas,
      opinion: r ? { rating: r.rating, comentario: r.comentario } : null,
      cupon: misUsos.some((u) => u.estado_uso === "aplicado") ? "usado" : misUsos.length > 0 ? "en_checkout" : null,
      compro: misCompras.length > 0, compras: misCompras.length,
      costo_estimado: e.costo_estimado,
    };
  });
}
