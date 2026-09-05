// ============================================================================
// ef_tarot_admin_whatsapp — Bandeja de WhatsApp para el Admin (Tarot)
// ============================================================================
//
// Fuente única de datos para /admin/tarot/whatsapp. Lee/escribe
// tarot_whatsapp_conversaciones / tarot_whatsapp_mensajes (inbound poblado
// por ef_webhook_whatsapp_inbound; outbound poblado acá mismo — ver
// docs/modules/whatsapp-inbox.md).
//
// Acciones (POST body: { accion, ... }):
//   - listar:              filtros + búsqueda + paginación
//   - contador_no_leidos:  total global de no_leidos (badge del nav)
//   - detalle:             conversación + ventana 24h + mensajes + envíos outbound reales
//   - marcar_leido:        no_leidos = 0
//   - marcar_no_leido:     no_leidos = max(no_leidos, 1)
//   - responder:           { conversacion_id, texto } — texto libre, solo si hay ventana 24h activa
//   - reintentar:          { mensaje_id } — reintenta un outbound en estado 'error'
//
// VENTANA 24H (sprint 2026-09-06): WhatsApp Cloud API solo permite texto
// libre dentro de las 24h desde el ÚLTIMO mensaje inbound real del cliente
// (ventana de servicio al cliente). Se calcula siempre server-side —el
// frontend puede mostrarla, pero nunca es la fuente de verdad— y se
// revalida en cada intento de envío/reintento, no solo al abrir la
// conversación.
//
// MODO SANDBOX (reutiliza tarot_configuracion.whatsapp_modo, la MISMA
// governance que ya usa ef_tarot_enviar_whatsapp para el pipeline de
// entrega): si no está en "production", el envío se SIMULA — nunca se
// llama a la Cloud API real, el mensaje queda en estado 'simulado' (nunca
// 'enviado' — esa distinción ya es una regla innegociable en este proyecto,
// ver tarot_envios_whatsapp). Así el sprint cierra sin depender de que Meta
// haya aprobado Production.
//
// SEGURIDAD: x-internal-key. Nunca expone tokens/secrets de Meta. No
// acepta teléfono arbitrario desde el frontend — siempre se resuelve
// server-side desde la conversación. Logs sin texto completo del mensaje.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const FN = "ef_tarot_admin_whatsapp";
const TEXTO_MAX_LEN = 4096; // límite de WhatsApp Cloud API para mensajes de texto

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function texto(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().substring(0, max);
  return t ? t : null;
}

async function log(evento: string, nivel: "info" | "warning" | "error", mensaje: string, payload: Record<string, unknown> = {}) {
  try {
    await supabase.from("tarot_logs").insert({ evento, nivel, mensaje, payload, funcion_origen: FN });
  } catch { /* non-blocking */ }
}

// "+598912345678" → "+598 91 *** 678" — enmascarado para la lista cuando no
// hay nombre conocido. Nunca se enmascara en el detalle (ahí el admin ya
// abrió la conversación deliberadamente).
function enmascararTelefono(tel: string): string {
  const soloDigitos = tel.replace(/\D/g, "");
  if (soloDigitos.length < 6) return tel;
  const inicio = tel.slice(0, tel.length - soloDigitos.length + 4); // prefijo + 2 dígitos
  const fin = soloDigitos.slice(-3);
  return `${inicio}***${fin}`;
}

interface ConversacionRow {
  id: string;
  telefono_normalizado: string;
  cliente_id: string | null;
  orden_id: string | null;
  wa_contact_name: string | null;
  estado: string;
  no_leidos: number;
  ultimo_mensaje_at: string | null;
  ultimo_mensaje_preview: string | null;
  ultimo_mensaje_direccion: string | null;
  created_at: string;
  updated_at: string;
}

interface Ventana24h {
  activa: boolean;
  ultimo_inbound_at: string | null;
  expira_at: string | null;
  segundos_restantes: number | null;
}

// Referencia = último mensaje INBOUND real de la conversación (no el
// último mensaje en general — un outbound nuestro no reabre ni extiende
// la ventana, solo un mensaje nuevo del cliente lo hace).
async function calcularVentana24h(conversacionId: string): Promise<Ventana24h> {
  const { data } = await supabase
    .from("tarot_whatsapp_mensajes")
    .select("timestamp_whatsapp")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "inbound")
    .order("timestamp_whatsapp", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ultimoInboundAt = data?.timestamp_whatsapp as string | undefined;
  if (!ultimoInboundAt) {
    return { activa: false, ultimo_inbound_at: null, expira_at: null, segundos_restantes: null };
  }
  const expiraAtMs = new Date(ultimoInboundAt).getTime() + 24 * 3600 * 1000;
  const segundosRestantes = Math.floor((expiraAtMs - Date.now()) / 1000);
  return {
    activa: segundosRestantes > 0,
    ultimo_inbound_at: ultimoInboundAt,
    expira_at: new Date(expiraAtMs).toISOString(),
    segundos_restantes: Math.max(0, segundosRestantes),
  };
}

// true = sandbox (o config ausente — por seguridad, nunca se asume
// production por defecto). Misma fuente de verdad que ef_tarot_enviar_whatsapp.
async function esModoSandbox(): Promise<boolean> {
  const { data } = await supabase
    .from("tarot_configuracion")
    .select("clave, valor")
    .in("clave", ["whatsapp_modo", "mp_modo"]);
  const cfg = Object.fromEntries((data ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  return (cfg.whatsapp_modo ?? cfg.mp_modo) !== "production";
}

interface ResultadoEnvioWA {
  ok: boolean;
  simulado: boolean;
  waMessageId: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  errorDetalle: string | null;
}

async function enviarWhatsappTexto(telefono: string, mensajeTexto: string): Promise<ResultadoEnvioWA> {
  if (await esModoSandbox()) {
    return { ok: true, simulado: true, waMessageId: `sandbox_${crypto.randomUUID()}`, httpStatus: null, errorCode: null, errorDetalle: null };
  }
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, simulado: false, waMessageId: null, httpStatus: null, errorCode: "config_error", errorDetalle: "WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados" };
  }
  const telefonoDest = telefono.replace(/^\+/, "");
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to: telefonoDest, type: "text", text: { body: mensajeTexto } }),
    });
    const data = await res.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { code?: number; message?: string } };
    if (res.ok && data?.messages?.[0]?.id) {
      return { ok: true, simulado: false, waMessageId: data.messages[0].id, httpStatus: res.status, errorCode: null, errorDetalle: null };
    }
    return {
      ok: false, simulado: false, waMessageId: null, httpStatus: res.status,
      errorCode: String(data?.error?.code ?? res.status),
      errorDetalle: (data?.error?.message ?? "Error desconocido de WhatsApp").substring(0, 300),
    };
  } catch (e) {
    return { ok: false, simulado: false, waMessageId: null, httpStatus: null, errorCode: "exception", errorDetalle: String(e).substring(0, 300) };
  }
}

// Único punto de escritura para un intento de outbound — usado por
// "responder" (mensaje nuevo) y "reintentar" (mismo texto, intento nuevo,
// NUNCA reutiliza whatsapp_message_id ni la fila anterior — ver docs).
async function ejecutarEnvioOutbound(conversacionId: string, telefonoDestino: string, mensajeTexto: string) {
  const { data: fila, error: insErr } = await supabase
    .from("tarot_whatsapp_mensajes")
    .insert({ conversacion_id: conversacionId, direccion: "outbound", tipo: "text", texto: mensajeTexto, estado: "preparando" })
    .select("id")
    .single();
  if (insErr || !fila) {
    return { ok: false, motivo: "error_registro_intento", detalle: insErr?.message };
  }

  await log("wa_outbound_preparando", "info", "Preparando envío outbound", { conversacion_id: conversacionId, mensaje_id: fila.id, longitud_texto: mensajeTexto.length });

  const envio = await enviarWhatsappTexto(telefonoDestino, mensajeTexto);
  const estadoFinal = envio.ok ? (envio.simulado ? "simulado" : "enviado") : "error";
  const ahora = new Date().toISOString();

  await supabase.from("tarot_whatsapp_mensajes").update({
    whatsapp_message_id: envio.waMessageId,
    estado: estadoFinal,
    enviado_at: envio.ok ? ahora : null,
    error_code: envio.errorCode,
    error_detalle: envio.errorDetalle,
  }).eq("id", fila.id);

  if (envio.ok) {
    const preview = mensajeTexto.length > 200 ? mensajeTexto.slice(0, 200) : mensajeTexto;
    await supabase.rpc("tarot_wa_registrar_mensaje_outbound", {
      p_conversacion_id: conversacionId,
      p_timestamp: ahora,
      p_preview: preview,
    });
    await log("wa_outbound_enviado", "info",
      envio.simulado ? "Envío simulado (sandbox) — no es un envío real" : "Envío outbound aceptado por Meta",
      { conversacion_id: conversacionId, mensaje_id: fila.id, simulado: envio.simulado, wa_message_id: envio.waMessageId });
  } else {
    await log("wa_outbound_error", "error", "Error al enviar outbound",
      { conversacion_id: conversacionId, mensaje_id: fila.id, http_status: envio.httpStatus, error_code: envio.errorCode });
  }

  return {
    ok: envio.ok,
    motivo: envio.ok ? undefined : "envio_fallido",
    mensaje_id: fila.id,
    estado: estadoFinal,
    wa_message_id: envio.waMessageId,
    simulado: envio.simulado,
    error_code: envio.errorCode,
    error_detalle: envio.errorDetalle,
  };
}

const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 200;

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, motivo: "json_invalido" }, 400); }

  const accion = texto(body.accion, 50);

  // ── contador_no_leidos ──────────────────────────────────────────────────
  if (accion === "contador_no_leidos") {
    const { count, error } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id", { count: "exact", head: true })
      .gt("no_leidos", 0);
    if (error) return jsonResponse({ ok: false, motivo: "error_query", detalle: error.message }, 500);
    return jsonResponse({ ok: true, conversaciones_no_leidas: count ?? 0 });
  }

  // ── listar ───────────────────────────────────────────────────────────────
  if (accion === "listar") {
    const filtro = texto(body.filtro, 20) ?? "todos"; // todos | no_leidos | con_orden | sin_orden
    const busqueda = texto(body.busqueda, 100);
    const limitRaw = Number(body.limit ?? LIMIT_DEFAULT);
    const limit = Number.isFinite(limitRaw) ? Math.min(LIMIT_MAX, Math.max(1, limitRaw)) : LIMIT_DEFAULT;
    const offsetRaw = Number(body.offset ?? 0);
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    let query = supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id, telefono_normalizado, cliente_id, orden_id, wa_contact_name, estado, no_leidos, ultimo_mensaje_at, ultimo_mensaje_preview, ultimo_mensaje_direccion, created_at, updated_at", { count: "exact" });

    if (filtro === "no_leidos") query = query.gt("no_leidos", 0);
    else if (filtro === "con_orden") query = query.not("orden_id", "is", null);
    else if (filtro === "sin_orden") query = query.is("orden_id", null);

    if (busqueda) {
      // Búsqueda por nombre de cliente u orden (external_reference): se
      // resuelven ids por separado — supabase-js no permite OR entre
      // columnas de tablas distintas en una sola query.
      const [clientesMatch, ordenesMatch] = await Promise.all([
        supabase.from("tarot_clientes").select("id").ilike("nombre_completo", `%${busqueda}%`).limit(50),
        supabase.from("tarot_ordenes").select("id").ilike("external_reference", `%${busqueda}%`).limit(50),
      ]);
      const clienteIds = (clientesMatch.data ?? []).map((c: { id: string }) => c.id);
      const ordenIds = (ordenesMatch.data ?? []).map((o: { id: string }) => o.id);

      const condiciones: string[] = [
        `telefono_normalizado.ilike.%${busqueda}%`,
        `wa_contact_name.ilike.%${busqueda}%`,
      ];
      if (clienteIds.length) condiciones.push(`cliente_id.in.(${clienteIds.join(",")})`);
      if (ordenIds.length) condiciones.push(`orden_id.in.(${ordenIds.join(",")})`);
      query = query.or(condiciones.join(","));
    }

    query = query.order("ultimo_mensaje_at", { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return jsonResponse({ ok: false, motivo: "error_query", detalle: error.message }, 500);

    const filas = (data ?? []) as ConversacionRow[];

    // Enriquecer con nombre de cliente canónico (si hay) y ref de orden —
    // dos queries batch, no N+1.
    const clienteIds = [...new Set(filas.map((f) => f.cliente_id).filter(Boolean))] as string[];
    const ordenIds = [...new Set(filas.map((f) => f.orden_id).filter(Boolean))] as string[];
    const [clientesRes, ordenesRes] = await Promise.all([
      clienteIds.length ? supabase.from("tarot_clientes").select("id, nombre_completo").in("id", clienteIds) : Promise.resolve({ data: [] }),
      ordenIds.length ? supabase.from("tarot_ordenes").select("id, external_reference, estado").in("id", ordenIds) : Promise.resolve({ data: [] }),
    ]);
    const nombrePorCliente = new Map((clientesRes.data ?? []).map((c: { id: string; nombre_completo: string }) => [c.id, c.nombre_completo]));
    const ordenPorId = new Map((ordenesRes.data ?? []).map((o: { id: string; external_reference: string | null; estado: string }) => [o.id, o]));

    // Total global de no leídos (para el badge) — independiente de filtros/paginación de esta llamada.
    const { count: noLeidosTotal } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id", { count: "exact", head: true })
      .gt("no_leidos", 0);

    const conversaciones = filas.map((f) => {
      const nombreCliente = f.cliente_id ? nombrePorCliente.get(f.cliente_id) ?? null : null;
      const nombreMostrado = nombreCliente ?? f.wa_contact_name ?? null;
      const orden = f.orden_id ? ordenPorId.get(f.orden_id) ?? null : null;
      return {
        id: f.id,
        telefono: nombreMostrado ? f.telefono_normalizado : enmascararTelefono(f.telefono_normalizado),
        nombre: nombreMostrado,
        cliente_id: f.cliente_id,
        orden_id: f.orden_id,
        orden_ref: orden?.external_reference ?? null,
        orden_estado: orden?.estado ?? null,
        ultimo_mensaje_at: f.ultimo_mensaje_at,
        ultimo_mensaje_preview: f.ultimo_mensaje_preview,
        ultimo_mensaje_direccion: f.ultimo_mensaje_direccion,
        no_leidos: f.no_leidos,
      };
    });

    return jsonResponse({
      ok: true,
      conversaciones,
      paginacion: {
        total: count ?? 0,
        limit, offset,
        next_offset: (count ?? 0) > offset + limit ? offset + limit : null,
      },
      no_leidos_total: noLeidosTotal ?? 0,
    });
  }

  // ── detalle ──────────────────────────────────────────────────────────────
  if (accion === "detalle") {
    const conversacionId = texto(body.conversacion_id, 100);
    if (!conversacionId) return jsonResponse({ ok: false, motivo: "conversacion_id_requerido" }, 400);

    const { data: conv, error: convErr } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id, telefono_normalizado, cliente_id, orden_id, wa_contact_name, estado, no_leidos, ultimo_mensaje_at, created_at")
      .eq("id", conversacionId)
      .maybeSingle();
    if (convErr) return jsonResponse({ ok: false, motivo: "error_query", detalle: convErr.message }, 500);
    if (!conv) return jsonResponse({ ok: false, motivo: "conversacion_no_encontrada" }, 404);

    const [mensajesRes, clienteRes, ordenRes, ventana, sandbox] = await Promise.all([
      supabase
        .from("tarot_whatsapp_mensajes")
        .select("id, whatsapp_message_id, direccion, tipo, texto, media_id, mime_type, filename, payload_meta, timestamp_whatsapp, estado, enviado_at, error_code, error_detalle, created_at")
        .eq("conversacion_id", conversacionId)
        .order("timestamp_whatsapp", { ascending: true }),
      conv.cliente_id
        ? supabase.from("tarot_clientes").select("id, nombre_completo, telefono, email").eq("id", conv.cliente_id).maybeSingle()
        : Promise.resolve({ data: null }),
      conv.orden_id
        ? supabase.from("tarot_ordenes").select("id, external_reference, estado, tema, created_at").eq("id", conv.orden_id).maybeSingle()
        : Promise.resolve({ data: null }),
      calcularVentana24h(conversacionId),
      esModoSandbox(),
    ]);

    // Envíos outbound reales de la orden asociada (si hay) — se muestran como
    // eventos de sistema en el historial, NUNCA se escriben en
    // tarot_whatsapp_mensajes (no se fabrica historial, ver docs/modules/whatsapp-inbox.md).
    const enviosOutbound = conv.orden_id
      ? await supabase
          .from("tarot_envios_whatsapp")
          .select("id, estado, numero_intento, wa_message_id, enviado_at, entregado_at, leido_at, created_at")
          .eq("orden_id", conv.orden_id)
          .order("created_at", { ascending: true })
      : { data: [] };

    return jsonResponse({
      ok: true,
      conversacion: {
        id: conv.id,
        telefono: conv.telefono_normalizado,
        cliente_id: conv.cliente_id,
        orden_id: conv.orden_id,
        wa_contact_name: conv.wa_contact_name,
        no_leidos: conv.no_leidos,
      },
      ventana_24h: ventana,
      modo_sandbox: sandbox,
      cliente: clienteRes.data ?? null,
      orden: ordenRes.data ?? null,
      mensajes: mensajesRes.data ?? [],
      envios_whatsapp_orden: enviosOutbound.data ?? [],
    });
  }

  // ── marcar_leido / marcar_no_leido ──────────────────────────────────────
  if (accion === "marcar_leido" || accion === "marcar_no_leido") {
    const conversacionId = texto(body.conversacion_id, 100);
    if (!conversacionId) return jsonResponse({ ok: false, motivo: "conversacion_id_requerido" }, 400);

    const nuevoValor = accion === "marcar_leido" ? 0 : 1;
    const { error } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .update({ no_leidos: nuevoValor, updated_at: new Date().toISOString() })
      .eq("id", conversacionId);
    if (error) return jsonResponse({ ok: false, motivo: "error_update", detalle: error.message }, 500);

    return jsonResponse({ ok: true, no_leidos: nuevoValor });
  }

  // ── responder ────────────────────────────────────────────────────────────
  if (accion === "responder") {
    const conversacionId = texto(body.conversacion_id, 100);
    if (!conversacionId) return jsonResponse({ ok: false, motivo: "conversacion_id_requerido" }, 400);

    const mensajeTexto = typeof body.texto === "string" ? body.texto.trim() : "";
    if (!mensajeTexto) return jsonResponse({ ok: false, motivo: "texto_requerido" }, 400);
    if (mensajeTexto.length > TEXTO_MAX_LEN) {
      return jsonResponse({ ok: false, motivo: "texto_demasiado_largo", limite: TEXTO_MAX_LEN }, 400);
    }

    // El teléfono SIEMPRE se resuelve server-side desde la conversación —
    // nunca se acepta uno arbitrario del frontend.
    const { data: conv, error: convErr } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id, telefono_normalizado")
      .eq("id", conversacionId)
      .maybeSingle();
    if (convErr) return jsonResponse({ ok: false, motivo: "error_query", detalle: convErr.message }, 500);
    if (!conv) return jsonResponse({ ok: false, motivo: "conversacion_no_encontrada" }, 404);

    // Revalidación server-side de la ventana 24h — el frontend puede
    // deshabilitar el composer, pero esto es lo que realmente decide.
    const ventana = await calcularVentana24h(conversacionId);
    if (!ventana.activa) {
      return jsonResponse({ ok: false, motivo: "ventana_24h_vencida", ventana_24h: ventana }, 409);
    }

    const resultado = await ejecutarEnvioOutbound(conversacionId, conv.telefono_normalizado, mensajeTexto);
    return jsonResponse(resultado, resultado.ok ? 200 : 502);
  }

  // ── reintentar ───────────────────────────────────────────────────────────
  if (accion === "reintentar") {
    const mensajeId = texto(body.mensaje_id, 100);
    if (!mensajeId) return jsonResponse({ ok: false, motivo: "mensaje_id_requerido" }, 400);

    const { data: original, error: origErr } = await supabase
      .from("tarot_whatsapp_mensajes")
      .select("id, conversacion_id, texto, estado, direccion")
      .eq("id", mensajeId)
      .maybeSingle();
    if (origErr) return jsonResponse({ ok: false, motivo: "error_query", detalle: origErr.message }, 500);
    if (!original) return jsonResponse({ ok: false, motivo: "mensaje_no_encontrado" }, 404);
    if (original.direccion !== "outbound") return jsonResponse({ ok: false, motivo: "solo_se_reintenta_outbound" }, 400);
    if (original.estado !== "error") return jsonResponse({ ok: false, motivo: "solo_se_reintenta_estado_error" }, 400);
    if (!original.texto) return jsonResponse({ ok: false, motivo: "mensaje_sin_texto" }, 400);

    const { data: conv, error: convErr } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id, telefono_normalizado")
      .eq("id", original.conversacion_id)
      .maybeSingle();
    if (convErr) return jsonResponse({ ok: false, motivo: "error_query", detalle: convErr.message }, 500);
    if (!conv) return jsonResponse({ ok: false, motivo: "conversacion_no_encontrada" }, 404);

    const ventana = await calcularVentana24h(original.conversacion_id);
    if (!ventana.activa) {
      return jsonResponse({ ok: false, motivo: "ventana_24h_vencida", ventana_24h: ventana }, 409);
    }

    // Intento NUEVO (nueva fila, nunca reutiliza whatsapp_message_id ni
    // pisa la fila original con error) — la fila original queda como
    // evidencia auditable del intento fallido.
    const resultado = await ejecutarEnvioOutbound(original.conversacion_id, conv.telefono_normalizado, original.texto);
    await log("wa_outbound_reintentado", "info", "Reintento de envío outbound",
      { conversacion_id: original.conversacion_id, mensaje_original_id: mensajeId, mensaje_nuevo_id: resultado.mensaje_id });

    return jsonResponse(resultado, resultado.ok ? 200 : 502);
  }

  return jsonResponse({ ok: false, motivo: "accion_invalida" }, 400);
});
