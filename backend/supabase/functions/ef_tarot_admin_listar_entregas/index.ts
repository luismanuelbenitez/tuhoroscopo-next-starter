// ============================================================================
// 📬 EDGE FUNCTION: ef_tarot_admin_listar_entregas
// ============================================================================
//
// MÓDULO:
//   Tarot TTC — Administración / Gobernanza de entregas
//
// OBJETIVO:
//   Fuente única de datos para /admin/tarot/entregas y el widget "Entregas
//   recientes" del dashboard. Combina tarot_envios_whatsapp + tarot_envios_email
//   (merge en memoria — no hay UNION nativo vía supabase-js).
//
//   Dos formas de leer los mismos datos (mismas tablas, sin duplicar fuente
//   de verdad), controladas por `vista`:
//
//   - vista="ordenes" (default): UNA fila por orden. Resume el estado de
//     WhatsApp y Email, cuenta intentos, calcula "última actividad" y un
//     "estado_general" derivado (entregado/parcial/error/pendiente/enviando).
//     Es lo que necesita un administrador para entender de un vistazo qué
//     pasó con cada orden, sin que 6 intentos técnicos parezcan 6 entregas.
//
//   - vista="eventos": lista plana de intentos individuales (comportamiento
//     original de esta EF). La usa el widget "Entregas recientes" del
//     dashboard, que quiere un feed cronológico de eventos, no órdenes.
//
// QUÉ NO HACE:
//   - NO envía nada. NO modifica estados. NO crea/autoriza solicitudes.
//   - NO reimplementa verificarPermisoEnvio() ni ninguna lógica de gobernanza.
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//
// INPUT (POST body, todos opcionales):
//   {
//     "vista": "ordenes" | "eventos",           // default "ordenes"
//     "orden_id": "uuid",
//     "canal": "whatsapp" | "email",             // vista=eventos: filtra por canal
//     "estado": "enviado",                       // vista=eventos: filtra por estado del intento
//     "estado_general": "entregado"|"parcial"|"error"|"pendiente"|"enviando", // vista=ordenes
//     "solo_reenvios": false,
//     "fecha_desde": "2026-05-01",
//     "fecha_hasta": "2026-06-01",
//     "limit": 50,
//     "offset": 0
//   }
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FUNCION = "ef_tarot_admin_listar_entregas";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "Content-Type": "application/json" } });
}
function normalizarTexto(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  return v ? v : null;
}
function normalizarBoolean(input: unknown, defaultValue = false): boolean {
  if (typeof input === "boolean") return input;
  return defaultValue;
}
function normalizarUUID(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return v;
  return null;
}
function normalizarLimit(input: unknown): number {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isInteger(n)) return 50;
  if (n < 1) return 50;
  if (n > 200) return 200;
  return n;
}
function normalizarOffset(input: unknown): number {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isInteger(n)) return 0;
  if (n < 0) return 0;
  return n;
}
function normalizarFecha(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString();
  }
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
async function readBodySafe(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch { return {}; }
}

const ESTADOS_EXITOSOS_WA = new Set(["enviado", "entregado", "leido"]);
const ESTADOS_EXITOSOS_EMAIL = new Set(["enviado"]);
const ESTADOS_ERROR = new Set(["error", "agotado_reintentos"]);

interface EntregaFila {
  id: string;
  canal: "whatsapp" | "email";
  orden_id: string;
  orden_ref: string | null;
  cliente_nombre: string | null;
  destino: string;
  estado: string;
  numero_intento: number;
  es_reenvio: boolean;
  solicitud_reenvio_id: string | null;
  pdf_id: string | null;
  proveedor: string | null;
  proveedor_message_id: string | null;
  error_codigo: string | null;
  error_mensaje: string | null;
  respuesta_raw: unknown;
  enviado_at: string | null;
  created_at: string;
}

// deno-lint-ignore no-explicit-any
function mapWa(r: any): EntregaFila {
  return {
    id: r.id, canal: "whatsapp", orden_id: r.orden_id,
    orden_ref: r.tarot_ordenes?.external_reference ?? null,
    cliente_nombre: r.tarot_ordenes?.tarot_clientes?.nombre_completo ?? null,
    destino: r.telefono_destino, estado: r.estado, numero_intento: r.numero_intento,
    es_reenvio: r.es_reenvio ?? false, solicitud_reenvio_id: r.solicitud_reenvio_id ?? null,
    pdf_id: r.pdf_id ?? null, proveedor: r.proveedor_wa ?? null,
    proveedor_message_id: r.wa_message_id ?? null,
    error_codigo: r.wa_error_code ?? null, error_mensaje: r.wa_error_mensaje ?? null,
    respuesta_raw: r.respuesta_raw ?? null, enviado_at: r.enviado_at ?? null, created_at: r.created_at,
  };
}
// deno-lint-ignore no-explicit-any
function mapEmail(r: any): EntregaFila {
  return {
    id: r.id, canal: "email", orden_id: r.orden_id,
    orden_ref: r.tarot_ordenes?.external_reference ?? null,
    cliente_nombre: r.tarot_ordenes?.tarot_clientes?.nombre_completo ?? null,
    destino: r.email_destino, estado: r.estado, numero_intento: r.numero_intento,
    es_reenvio: r.es_reenvio ?? false, solicitud_reenvio_id: r.solicitud_reenvio_id ?? null,
    pdf_id: r.pdf_id ?? null, proveedor: r.proveedor_email ?? null,
    proveedor_message_id: r.proveedor_message_id ?? null,
    error_codigo: r.error_codigo ?? null, error_mensaje: r.error_mensaje ?? null,
    respuesta_raw: r.respuesta_raw ?? null, enviado_at: r.enviado_at ?? null, created_at: r.created_at,
  };
}

async function fetchTodosLosEnvios(filtros: {
  orden_id: string | null; fecha_desde: string | null; fecha_hasta: string | null;
}) {
  const SELECT_JOIN = `*, tarot_ordenes ( external_reference, tarot_clientes ( nombre_completo, telefono, email ) )`;
  async function fetchTabla(tabla: "tarot_envios_whatsapp" | "tarot_envios_email") {
    let q = supabase.from(tabla).select(SELECT_JOIN);
    if (filtros.orden_id) q = q.eq("orden_id", filtros.orden_id);
    if (filtros.fecha_desde) q = q.gte("created_at", filtros.fecha_desde);
    if (filtros.fecha_hasta) q = q.lt("created_at", filtros.fecha_hasta);
    // Tope defensivo: a la escala actual del producto (decenas/cientos de envíos)
    // esto cubre el dataset completo. Si crece varios órdenes de magnitud,
    // migrar el agrupado a una vista SQL en vez de hacerlo en memoria.
    q = q.order("created_at", { ascending: false }).limit(500);
    return q;
  }
  const [waRes, emailRes] = await Promise.all([
    fetchTabla("tarot_envios_whatsapp"),
    fetchTabla("tarot_envios_email"),
  ]);
  if (waRes.error) throw new Error(waRes.error.message);
  if (emailRes.error) throw new Error(emailRes.error.message);
  return {
    wa: (waRes.data ?? []).map(mapWa),
    email: (emailRes.data ?? []).map(mapEmail),
  };
}

// ── Vista "eventos": lista plana, comportamiento original ────────────────────
async function responderVistaEventos(body: Record<string, unknown>) {
  const orden_id = normalizarUUID(body.orden_id);
  const canalFiltro = normalizarTexto(body.canal);
  const estado = normalizarTexto(body.estado);
  const solo_reenvios = normalizarBoolean(body.solo_reenvios, false);
  const fecha_desde = normalizarFecha(body.fecha_desde);
  const fecha_hasta = normalizarFecha(body.fecha_hasta);
  const limit = normalizarLimit(body.limit);
  const offset = normalizarOffset(body.offset);

  const { wa, email } = await fetchTodosLosEnvios({ orden_id, fecha_desde, fecha_hasta });

  let filas: EntregaFila[] = [
    ...(!canalFiltro || canalFiltro === "whatsapp" ? wa : []),
    ...(!canalFiltro || canalFiltro === "email" ? email : []),
  ];
  if (estado) filas = filas.filter(f => f.estado === estado);
  if (solo_reenvios) filas = filas.filter(f => f.es_reenvio);
  filas = filas.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = filas.length;
  const pagina = filas.slice(offset, offset + limit);

  return jsonResponse({
    ok: true,
    funcion: FUNCION,
    vista: "eventos",
    filtros: { orden_id, canal: canalFiltro, estado, solo_reenvios, fecha_desde, fecha_hasta, limit, offset },
    paginacion: { total, limit, offset, next_offset: total > offset + limit ? offset + limit : null },
    entregas: pagina,
  });
}

// ── Vista "ordenes" (default): una fila por orden, WA+Email resumidos ────────

interface CanalResumen {
  destino: string | null;
  estado: string | null;        // estado del último intento, o null si nunca se intentó
  intentos: number;
  ultimo_envio_at: string | null;
  es_reenvio_ultimo: boolean;
  tiene_reenvio_historico: boolean; // es_reenvio=false pero no es el primer envío exitoso (bug pre-gobernanza)
  clasificacion: string;         // ver EstadoCanalWA / EstadoCanalEmail — fuente única de verdad de la etiqueta a mostrar
}

function construirResumen(intentos: EntregaFila[], destinoCliente: string | null): Omit<CanalResumen, "clasificacion"> {
  if (intentos.length === 0) {
    return { destino: destinoCliente, estado: null, intentos: 0, ultimo_envio_at: null, es_reenvio_ultimo: false, tiene_reenvio_historico: false };
  }
  // intentos viene ordenado desc por created_at desde el fetch original
  const ordenAsc = [...intentos].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  let vistoExitoso = false;
  let tieneReenvioHistorico = false;
  for (const it of ordenAsc) {
    if (ESTADOS_EXITOSOS_WA.has(it.estado) || ESTADOS_EXITOSOS_EMAIL.has(it.estado)) {
      if (vistoExitoso && !it.es_reenvio) tieneReenvioHistorico = true;
      vistoExitoso = true;
    }
  }
  const ultimo = intentos[0]; // desc
  return {
    destino: ultimo.destino ?? destinoCliente,
    estado: ultimo.estado,
    intentos: intentos.length,
    ultimo_envio_at: ultimo.enviado_at ?? ultimo.created_at,
    es_reenvio_ultimo: ultimo.es_reenvio,
    tiene_reenvio_historico: tieneReenvioHistorico,
  };
}

// WhatsApp es el canal principal/obligatorio — siempre "aplica"; el único
// matiz es distinguir un envío real de uno simulado en sandbox (nunca cuenta
// como entrega real — ver ESTADOS_EXITOSOS_WA, que deliberadamente NO incluye
// "simulado").
type EstadoCanalWA = "ok" | "error" | "en_curso" | "sin_intento" | "simulado";

function clasificarWA(c: Omit<CanalResumen, "clasificacion">): EstadoCanalWA {
  if (c.estado == null) return "sin_intento";
  if (ESTADOS_EXITOSOS_WA.has(c.estado)) return "ok";
  if (c.estado === "simulado") return "simulado";
  if (c.estado === "enviando" || c.estado === "pendiente") return "en_curso";
  return "error"; // incluye 'agotado_reintentos'
}

// Email es un canal opcional cuya disponibilidad depende de lo que pidió el
// comprador para ESA orden (tarot_ordenes.email_solicitado), no solo de si el
// cliente tiene un email cargado. "no_solicitado" = el comprador explícitamente
// no pidió este canal (orden nueva, email_solicitado=false) — nunca cuenta
// como fallo. "legacy_sin_datos" = orden anterior a este campo (NULL) y sin
// email conocido — no podemos saber si se solicitó o no, se etiqueta honesto
// en vez de reutilizar "no_solicitado" (que afirmaría algo que no sabemos).
type EstadoCanalEmail = "ok" | "error" | "en_curso" | "sin_intento" | "no_solicitado" | "legacy_sin_datos";

function clasificarEmail(
  c: Omit<CanalResumen, "clasificacion">,
  emailSolicitadoOrden: boolean | null,
  clienteTieneEmail: boolean,
): EstadoCanalEmail {
  if (c.intentos === 0) {
    if (emailSolicitadoOrden === false) return "no_solicitado";
    if (emailSolicitadoOrden === null && !clienteTieneEmail) return "legacy_sin_datos";
    return "sin_intento"; // solicitado=true, o legacy con email conocido (comportamiento previo)
  }
  if (c.estado == null) return "sin_intento";
  if (ESTADOS_EXITOSOS_EMAIL.has(c.estado)) return "ok";
  if (c.estado === "enviando" || c.estado === "pendiente") return "en_curso";
  return "error";
}

// "sin_intento"/"no_solicitado"/"legacy_sin_datos" en un canal NUNCA cuentan
// como fallo del otro: si WA entregó exitosamente y Email no se intentó (o no
// fue solicitado), el resultado sigue siendo "entregado" — el producto llegó.
// Una simulación de sandbox, si es la ÚNICA señal positiva, NUNCA es
// "entregado" — se refleja como "simulado" (ver auditoría "Juan Felipe
// González", 2026-08-28: antes una simulación sí marcaba "entregado").
function calcularEstadoGeneral(waS: EstadoCanalWA, emailS: EstadoCanalEmail): string {
  const algunoOk = waS === "ok" || emailS === "ok";
  const algunoError = waS === "error" || emailS === "error";
  const algunoEnCurso = waS === "en_curso" || emailS === "en_curso";
  const algunoSimulado = waS === "simulado";

  if (algunoOk && algunoError) return "parcial";
  if (algunoOk) return "entregado";
  if (algunoError) return "error";
  if (algunoEnCurso) return "enviando";
  if (algunoSimulado) return "simulado";
  return "pendiente";
}

async function responderVistaOrdenes(body: Record<string, unknown>) {
  const orden_id = normalizarUUID(body.orden_id);
  const canalFiltro = normalizarTexto(body.canal); // "whatsapp" | "email" -> orden tiene actividad en ese canal
  const estadoGeneralFiltro = normalizarTexto(body.estado_general);
  const solo_reenvios = normalizarBoolean(body.solo_reenvios, false);
  const fecha_desde = normalizarFecha(body.fecha_desde);
  const fecha_hasta = normalizarFecha(body.fecha_hasta);
  const limit = normalizarLimit(body.limit);
  const offset = normalizarOffset(body.offset);

  const { wa, email } = await fetchTodosLosEnvios({ orden_id, fecha_desde, fecha_hasta });

  // Agrupar por orden_id
  const ordenIds = new Set<string>([...wa.map(f => f.orden_id), ...email.map(f => f.orden_id)]);
  // deno-lint-ignore no-explicit-any
  const porOrden = new Map<string, { wa: EntregaFila[]; email: EntregaFila[]; ref: string | null; cliente: string | null }>();
  for (const id of ordenIds) porOrden.set(id, { wa: [], email: [], ref: null, cliente: null });
  for (const f of wa) {
    const g = porOrden.get(f.orden_id)!;
    g.wa.push(f); g.ref = g.ref ?? f.orden_ref; g.cliente = g.cliente ?? f.cliente_nombre;
  }
  for (const f of email) {
    const g = porOrden.get(f.orden_id)!;
    g.email.push(f); g.ref = g.ref ?? f.orden_ref; g.cliente = g.cliente ?? f.cliente_nombre;
  }

  // Solicitudes de reenvío activas (pendiente_autorizacion | autorizada) para estas órdenes
  const idsArr = [...ordenIds];
  let solicitudesActivas = new Map<string, number>();
  if (idsArr.length > 0) {
    const { data: sol } = await supabase
      .from("tarot_solicitudes_reenvio")
      .select("orden_id, estado")
      .in("orden_id", idsArr)
      .in("estado", ["pendiente_autorizacion", "autorizada"]);
    for (const s of sol ?? []) {
      solicitudesActivas.set(s.orden_id, (solicitudesActivas.get(s.orden_id) ?? 0) + 1);
    }
  }

  // Necesitamos email_solicitado (canal pedido para ESA orden) y el email del
  // cliente (destino a mostrar / fallback legacy) para clasificar el canal
  // Email correctamente incluso cuando nunca hubo ningún intento.
  const datosOrdenPorId = new Map<string, { emailSolicitado: boolean | null; clienteEmail: string | null }>();
  if (idsArr.length > 0) {
    const { data: ords } = await supabase
      .from("tarot_ordenes")
      .select("id, email_solicitado, tarot_clientes(email)")
      // deno-lint-ignore no-explicit-any
      .in("id", idsArr) as { data: any[] | null };
    for (const o of ords ?? []) {
      datosOrdenPorId.set(o.id, {
        emailSolicitado: o.email_solicitado ?? null,
        clienteEmail: o.tarot_clientes?.email ?? null,
      });
    }
  }

  let resumenes = idsArr.map((id) => {
    const g = porOrden.get(id)!;
    const datosOrden = datosOrdenPorId.get(id) ?? { emailSolicitado: null, clienteEmail: null };

    const waBase = construirResumen(g.wa, null);
    const waClasif = clasificarWA(waBase);
    const waResumen: CanalResumen = { ...waBase, clasificacion: waClasif };

    const destinoEmailDefault = g.email.length ? null : datosOrden.clienteEmail;
    const emailBase = construirResumen(g.email, destinoEmailDefault);
    const emailClasif = clasificarEmail(emailBase, datosOrden.emailSolicitado, datosOrden.clienteEmail != null);
    const emailResumen: CanalResumen = { ...emailBase, clasificacion: emailClasif };

    const ultimaActividad = [waResumen.ultimo_envio_at, emailResumen.ultimo_envio_at]
      .filter((x): x is string => !!x)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
    return {
      orden_id: id,
      orden_ref: g.ref,
      cliente_nombre: g.cliente,
      whatsapp: waResumen,
      email: emailResumen,
      ultima_actividad_at: ultimaActividad,
      estado_general: calcularEstadoGeneral(waClasif, emailClasif),
      reenvio_pendiente: (solicitudesActivas.get(id) ?? 0) > 0,
      tiene_reenvio_historico: waResumen.tiene_reenvio_historico || emailResumen.tiene_reenvio_historico,
    };
  });

  if (canalFiltro === "whatsapp") resumenes = resumenes.filter(r => r.whatsapp.intentos > 0);
  if (canalFiltro === "email") resumenes = resumenes.filter(r => r.email.intentos > 0);
  if (estadoGeneralFiltro) resumenes = resumenes.filter(r => r.estado_general === estadoGeneralFiltro);
  if (solo_reenvios) resumenes = resumenes.filter(r => r.whatsapp.es_reenvio_ultimo || r.email.es_reenvio_ultimo || r.reenvio_pendiente);

  resumenes = resumenes.sort((a, b) => {
    const ta = a.ultima_actividad_at ? new Date(a.ultima_actividad_at).getTime() : 0;
    const tb = b.ultima_actividad_at ? new Date(b.ultima_actividad_at).getTime() : 0;
    return tb - ta;
  });

  const total = resumenes.length;
  const pagina = resumenes.slice(offset, offset + limit);

  return jsonResponse({
    ok: true,
    funcion: FUNCION,
    vista: "ordenes",
    filtros: { orden_id, canal: canalFiltro, estado_general: estadoGeneralFiltro, solo_reenvios, fecha_desde, fecha_hasta, limit, offset },
    paginacion: { total, limit, offset, next_offset: total > offset + limit ? offset + limit : null },
    ordenes: pagina,
  });
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== TAROT_INTERNAL_KEY) return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  const body = await readBodySafe(req);
  const vista = normalizarTexto(body.vista) === "eventos" ? "eventos" : "ordenes";

  try {
    if (vista === "eventos") return await responderVistaEventos(body);
    return await responderVistaOrdenes(body);
  } catch (err) {
    return jsonResponse({ ok: false, motivo: "listar_entregas_error", error: String(err) }, 500);
  }
});
