// ============================================================================
// EDGE FUNCTION: ef_webhook_whatsapp_inbound
// ============================================================================
// CAPA 2 (NEGOCIO) - WhatsApp inbound
//
// Objetivo:
//   - Procesar eventos entrantes "messages[]" de WhatsApp (desde CAPA 1).
//   - Aplicar reglas de negocio:
//
//     1) Confirmación de número (whatsapp_confirmado)
//        - "Cualquier cosa menos BAJA" confirma.
//        - Se acepta: type="text" y type="reaction".
//        - Solo confirma si el suscriptor es PREMIUM ACTIVO.
//        - Encola mensaje operativo "confirmacion_numero_ok" y dispara ef_whatsapp_sender.
//        - Si confirmacion_numero_ok queda correctamente encaminado,
//          dispara la generación ON-DEMAND del primer contenido premium.
//
//     2) BAJA
//        - BAJA NO cancela Mercado Pago.
//        - Si MP está activa/autorizada -> plantilla: "baja_info_mp"
//        - Si MP está cancelada/pausada/finalizada -> plantilla: "baja_thc"
//        - Rate-limit: responder BAJA como máximo 1 vez cada 24h.
//          Si llega BAJA antes de 24h -> NO encolar, log exito=false.
//
//     3) Outbox + envío inmediato
//        - No enviamos directo por WhatsApp desde inbound.
//        - Insertamos en mensajes_enviados (encolado) y llamamos ef_whatsapp_sender.
//
// Restricciones que respetamos:
//   - NO tocar premium_pendiente_confirmacion (es de Mercado Pago).
//   - Robustez + logs claros.
//   - UTC en todo (ISO Z).
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ---------------------------------------------------------------------------
// Constantes / ENV
// ---------------------------------------------------------------------------
const FUNCION = "ef_webhook_whatsapp_inbound";
// ---------------------------------------------------------------------------
// Variables de entorno base
// ----------------------------------------------------------------------------
// SUPABASE_URL:
//   URL base del proyecto.
//
// SUPABASE_SERVICE_ROLE_KEY:
//   clave con permisos backend para leer/escribir en BD.
//
// ANON_KEY_SUPABASE:
//   JWT válido para invocar otras Edge Functions que tengan verify_jwt activo.
//
// IMPORTANTE:
// - Usamos UN solo nombre para el JWT interno.
// - Evitamos mezclar SUPABASE_ANON_KEY con ANON_KEY_SUPABASE.
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY_SUPABASE = Deno.env.get("ANON_KEY_SUPABASE") ?? "";
// Seguridad entre funciones internas (recomendado)
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
// Worker/outbox (CAPA 4)
const SENDER_FUNCTION_NAME = "ef_whatsapp_sender";
// Menú interactivo WhatsApp
const MENU_FUNCTION_NAME = "ef_orquesta_menu_respuesta";
// Palabras que activan el menú (ya normalizadas: sin acentos, uppercase)
// "MENÚ" normaliza a "MENU" → no necesita entrada separada
const COMANDOS_MENU = ["MENU", "CONFIG", "AJUSTES", "PREFERENCIAS"];
// Plantillas
// ---------------------------------------------------------------------------
// Clave lógica de plantilla de confirmación de número
// ----------------------------------------------------------------------------
// IMPORTANTE:
// - Este valor NO es el nombre real de la template en Meta.
// - Este valor corresponde al campo `nombre` en tu tabla `plantillas`.
// - Luego resolveremos el campo `contenido`, que será el nombre REAL a usar.
// ---------------------------------------------------------------------------
const PLANTILLA_CONFIRM_OK = "confirmacion_numero_ok";
// ---------------------------------------------------------------------------
// Clave lógica de la plantilla de bienvenida / validación
// ----------------------------------------------------------------------------
// Esta es la plantilla que debe haberse encolado/enviado antes de aceptar la
// confirmación del número por parte del usuario.
// ---------------------------------------------------------------------------
const PLANTILLA_BIENVENIDA_VALIDACION = "bienvenida_validacion_numero";
const PLANTILLA_BAJA_INFO_MP = "baja_info_mp";
const PLANTILLA_BAJA_THC = "baja_thc";
// ============================================================================
// 🔁 COMANDOS DE REACTIVACIÓN DE MENSAJES
// ----------------------------------------------------------------------------
// OBJETIVO:
// - Permitir que un usuario que antes escribió "BAJA" pueda volver a recibir
//   mensajes premium automáticos sin tocar Mercado Pago.
//
// COMANDOS SOPORTADOS:
// - ALTA
// - ACTIVAR
// - REACTIVAR
// - VOLVER
//
// IMPORTANTE:
// - Estos comandos NO activan Mercado Pago.
// - NO cambian premium_activo.
// - NO cambian estado_suscripcion.
// - NO cambian preapproval_status.
// - Solo cambian suscriptores.estado_mensaje a "activo".
//
// RELACIÓN CON EL ENCOLADOR:
// - El encolador ya bloquea si estado_mensaje = "pausado_usuario".
// - Al volver a "activo", el encolador vuelve a considerar al usuario elegible.
// ============================================================================
const COMANDOS_REACTIVACION = [
  "ALTA",
  "ACTIVAR",
  "REACTIVAR",
  "VOLVER"
];
// ============================================================================
// ℹ️ COMANDOS INFORMATIVOS DEL USUARIO
// ----------------------------------------------------------------------------
// OBJETIVO:
// - Permitir que el usuario consulte ayuda básica del servicio.
// - Permitir que el usuario consulte el estado de su suscripción/mensajes.
//
// COMANDOS:
// - AYUDA:
//     devuelve una guía simple de comandos disponibles.
// - ESTADO:
//     informa si la suscripción está activa y si los mensajes están activos
//     o pausados.
//
// IMPORTANTE:
// - Estos comandos NO modifican la suscripción.
// - NO modifican Mercado Pago.
// - NO modifican premium_activo.
// - NO modifican estado_mensaje.
// - Solo generan una respuesta operativa por WhatsApp.
//
// NOTA MVP:
// - Para responder por WhatsApp necesitamos plantillas aprobadas.
// - Usaremos claves lógicas en tabla plantillas:
//     ayuda_usuario
//     estado_usuario
// ============================================================================
const COMANDO_AYUDA = "AYUDA";
const COMANDO_ESTADO = "ESTADO";
const PLANTILLA_AYUDA_USUARIO = "ayuda_usuario";
const PLANTILLA_ESTADO_USUARIO = "estado_usuario";
// Rate-limit BAJA
const BAJA_RATE_LIMIT_HOURS = 24;
// Estados de mensajes (sin constraint en DB, son convenciones)
const ESTADO_PENDIENTE = "pendiente";
const ESTADO_ENVIADO = "enviado";
const ESTADO_DELIVERED = "delivered";
const ESTADO_READ = "read";
const ESTADO_FALLIDO = "fallido";
const ESTADO_FALLO_DEFINITIVO = "fallo_definitivo";
// ---------------------------------------------------------------------------
// Cliente Supabase (Service Role)
// ---------------------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// Helpers generales (UTC / normalización)
// ============================================================================
function nowUTCISO() {
  return new Date().toISOString();
}
function epochToUTCISO(ts) {
  if (ts == null) return null;
  const n = Number(ts);
  if (!isFinite(n)) return null;
  const ms = n < 1e12 ? n * 1000 : n; // seconds -> ms
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
/**
 * Normaliza texto para comparar comandos tipo "BAJA"
 * - sin tildes
 * - uppercase
 * - trim
 */ function normalizeText(input) {
  if (typeof input !== "string") return "";
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}
/**
 * WhatsApp manda el wa_id sin "+": "598..."
 * Guardamos en DB con "+": "+598..."
 */ function normalizarNumeroWhatsApp(waId) {
  if (!waId) return null;
  const limpio = waId.trim();
  if (!limpio) return null;
  return limpio.startsWith("+") ? limpio : `+${limpio}`;
}
/** Diferencia horaria absoluta (horas) entre dos Date */ function diffHours(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60);
}
/** Respuesta JSON consistente */ function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
// ============================================================================
// HELPER: obtenerContenidoPlantilla
// ----------------------------------------------------------------------------
// OBJETIVO:
//   Resolver el nombre REAL de una template de WhatsApp a partir de la tabla
//   `plantillas`, usando una clave lógica estable.
//
// CASO DE USO:
//   - En código usamos una clave lógica, por ejemplo:
//       "confirmacion_numero_ok"
//   - En la tabla `plantillas`, esa fila tiene:
//       nombre    = "confirmacion_numero_ok"
//       contenido = "nombre_real_template_meta"
//
// VENTAJA:
//   - Si mañana cambiás la template aprobada en Meta,
//     NO tenés que tocar código.
//   - Solo actualizás `plantillas.contenido`.
//
// RETORNO:
//   - string => nombre real de la template en Meta
//   - null   => si no existe o si hay error
// ============================================================================
async function obtenerContenidoPlantilla(nombreLogico) {
  // --------------------------------------------------------------------------
  // Buscar en tabla `plantillas` por clave lógica (`nombre`)
  // --------------------------------------------------------------------------
  const { data, error } = await supabase.from("plantillas").select("contenido").eq("nombre", nombreLogico).maybeSingle();
  // --------------------------------------------------------------------------
  // Si hubo error o no vino contenido, devolvemos null
  // --------------------------------------------------------------------------
  if (error || !data?.contenido) {
    return null;
  }
  // --------------------------------------------------------------------------
  // Normalizamos a string limpio
  // --------------------------------------------------------------------------
  const contenido = String(data.contenido).trim();
  // Si por alguna razón quedó vacío, devolvemos null
  if (!contenido) return null;
  return contenido;
}
// ============================================================================
// Disparo de generación ON-DEMAND del primer contenido premium
// ----------------------------------------------------------------------------
// OBJETIVO:
// - Invocar ef_genera_guarda_contenido_premium en modo on-demand.
// - Le pasamos solo id_suscriptor.
// - La función generadora se encargará de:
//     1) procesar solo ese usuario
//     2) generar el contenido premium
//     3) guardarlo en contenido_premium
//     4) programar su envío para el momento correspondiente
//
// IMPORTANTE:
// - Esta función NO envía WhatsApp.
// - Solo dispara la generación.
// ============================================================================
async function dispararGeneracionOnDemand(id_suscriptor) {
  // --------------------------------------------------------------------------
  // URL de la Edge Function generadora
  // --------------------------------------------------------------------------
  const url = `${SUPABASE_URL}/functions/v1/ef_genera_guarda_contenido_premium`;
  // --------------------------------------------------------------------------
  // Headers internos estandarizados
  // --------------------------------------------------------------------------
  const headers = {
    "Content-Type": "application/json",
    // Seguridad interna entre funciones
    "x-internal-key": WHATSAPP_INTERNAL_KEY,
    // JWT válido para verify_jwt
    "Authorization": `Bearer ${ANON_KEY_SUPABASE}`,
    "apikey": ANON_KEY_SUPABASE
  };
  // --------------------------------------------------------------------------
  // Llamada HTTP a la función generadora
  // --------------------------------------------------------------------------
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id_suscriptor
    })
  });
  // --------------------------------------------------------------------------
  // Parseo de respuesta para logging
  // --------------------------------------------------------------------------
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch  {
    parsed = {
      raw: text
    };
  }
  return {
    ok: r.ok,
    http_status: r.status,
    body: parsed
  };
}
//// ======================================================== F I N - H E L P E R S =============================================== ////
// ============================================================================
// Gate: NO aceptar confirmación inbound hasta que la bienvenida esté enviada
// ============================================================================
//
// REGLA:
// - Buscar el último mensaje de bienvenida/validación del suscriptor.
// - Pero NO hardcodeamos el nombre real de la template.
// - Resolvemos desde tabla `plantillas` usando la clave lógica:
//     PLANTILLA_BIENVENIDA_VALIDACION
//
// MODOS:
// - "enviado":
//     permite confirmar si la bienvenida ya fue enviada
// - "delivered":
//     más estricto, exige delivered/read
// ============================================================================
async function bienvenidaYaFueEnviada(params) {
  // --------------------------------------------------------------------------
  // 1) Resolver el nombre REAL de la plantilla desde tabla `plantillas`
  // --------------------------------------------------------------------------
  const plantillaReal = await obtenerContenidoPlantilla(PLANTILLA_BIENVENIDA_VALIDACION);
  if (!plantillaReal) {
    return {
      ok: false,
      permitido: false,
      motivo: "no_se_pudo_resolver_plantilla_bienvenida"
    };
  }
  // --------------------------------------------------------------------------
  // 2) Buscar el último mensaje de bienvenida para este suscriptor
  // --------------------------------------------------------------------------
  const { data, error } = await supabase.from("mensajes_enviados").select("id, estado, fecha_enviado, fecha_delivered, fecha_read, nombre_plantilla").eq("id_suscriptor", params.id_suscriptor).eq("nombre_plantilla", plantillaReal).order("fecha_creado", {
    ascending: false
  }).limit(1);
  if (error) {
    return {
      ok: false,
      permitido: false,
      motivo: `error_query_bienvenida: ${error.message}`
    };
  }
  // --------------------------------------------------------------------------
  // 3) Si no existe mensaje de bienvenida, bloquear confirmación
  // --------------------------------------------------------------------------
  if (!data || data.length === 0) {
    return {
      ok: true,
      permitido: false,
      motivo: "no_existe_bienvenida_validacion"
    };
  }
  const last = data[0];
  // --------------------------------------------------------------------------
  // 4) Modo "enviado"
  // --------------------------------------------------------------------------
  // Se considera suficiente si:
  // - tiene fecha_enviado
  // - o estado = enviado / delivered / read
  // --------------------------------------------------------------------------
  if (params.modo === "enviado") {
    const permitido = !!last.fecha_enviado || [
      "enviado",
      "delivered",
      "read"
    ].includes(String(last.estado ?? "").toLowerCase());
    return {
      ok: true,
      permitido,
      motivo: permitido ? "bienvenida_ya_enviada" : "bienvenida_aun_no_enviada",
      last
    };
  }
  // --------------------------------------------------------------------------
  // 5) Modo "delivered"
  // --------------------------------------------------------------------------
  // Más estricto:
  // - debe tener fecha_delivered o fecha_read
  // - o estado = delivered / read
  // --------------------------------------------------------------------------
  const permitido = !!last.fecha_delivered || !!last.fecha_read || [
    "delivered",
    "read"
  ].includes(String(last.estado ?? "").toLowerCase());
  return {
    ok: true,
    permitido,
    motivo: permitido ? "bienvenida_ya_delivered_o_read" : "bienvenida_aun_no_delivered",
    last
  };
}
// ============================================================================
// Logger: log_funciones
//   - Tu columna fecha_ejecucion es "timestamp without time zone"
//   - Igual guardamos ISO UTC (string) para consistencia.
// ============================================================================
async function registrarLog(resultado, detalle = {}, exito = true) {
  try {
    await supabase.from("log_funciones").insert([
      {
        nombre_funcion: FUNCION,
        fecha_ejecucion: nowUTCISO(),
        resultado,
        detalle,
        exito,
        creado_por: "system"
      }
    ]);
  } catch (e) {
    // No rompemos la función por logging
    console.error(`[${FUNCION}] Error al registrar log`, e);
  }
}
function extraerMensajeEntrante(rawBody) {
  const payload = rawBody?.payload ?? rawBody;
  const entry = Array.isArray(payload?.entry) ? payload.entry[0] : null;
  const change = entry?.changes?.[0];
  const value = change?.value;
  const messages = Array.isArray(value?.messages) ? value.messages : null;
  if (!messages || messages.length === 0) {
    return {
      esMensajeProcesable: false,
      motivo: "no_messages"
    };
  }
  const msg = messages[0];
  const type = typeof msg?.type === "string" ? msg.type : null;
  const from = msg?.from ?? value?.contacts?.[0]?.wa_id ?? null;
  const msgId = msg?.id ?? null;
  const tsRaw = (typeof msg?.timestamp !== "undefined" ? msg.timestamp : undefined) ?? entry?.time ?? null;
  const base = {
    from: typeof from === "string" ? from : null,
    msgId,
    timestampEpoch: tsRaw,
    timestampUTC: epochToUTCISO(tsRaw)
  };
  // ---- TEXT
  if (type === "text") {
    const textBody = typeof msg?.text?.body === "string" ? msg.text.body : null;
    return {
      esMensajeProcesable: true,
      tipo: "text",
      ...base,
      textBody,
      reactionEmoji: null,
      reactionToMessageId: null
    };
  }
  // ---- REACTION
  if (type === "reaction") {
    const emoji = typeof msg?.reaction?.emoji === "string" ? msg.reaction.emoji : null;
    const messageId = typeof msg?.reaction?.message_id === "string" ? msg.reaction.message_id : null;
    return {
      esMensajeProcesable: true,
      tipo: "reaction",
      ...base,
      textBody: null,
      reactionEmoji: emoji,
      reactionToMessageId: messageId
    };
  }
  // ---- Unsupported
  return {
    esMensajeProcesable: false,
    motivo: "unsupported_type",
    rawType: type
  };
}
// ============================================================================
// Reglas MP para BAJA (alto nivel)
//   Preferimos: suscriptores.preapproval_status
//   - Activa si: authorized | pending
//   - No activa si: paused | cancelled
//   Fallback si falta: estado_suscripcion
// ============================================================================
function mpEstaActiva(preapproval_status, estado_suscripcion) {
  const st = (preapproval_status ?? "").toLowerCase();
  if (st === "authorized" || st === "pending") return true;
  if (st === "paused" || st === "cancelled") return false;
  const es = (estado_suscripcion ?? "").toLowerCase();
  // Fallback: si tu estado_suscripcion sigue la lógica de MP por ahora
  if (es === "activa" || es === "pendiente_autorizacion") return true;
  return false;
}
/**
 * Inserta mensaje en mensajes_enviados (outbox).
 *
 * Importante:
 * - Insertamos campos mínimos y seguros (compatibles).
 * - Los campos nuevos NO son obligatorios -> si existen, los llenamos; si no,
 *   la query fallará. Como vos ya aplicaste el SQL, asumimos que existen.
 */ async function enqueueMensaje(params) {
  const now = nowUTCISO();
  const row = {
    // Campos core de tu tabla
    id_suscriptor: params.id_suscriptor,
    whatsapp_destino: params.whatsapp_destino,
    tipo_mensaje: params.tipo_mensaje,
    estado: params.estado,
    canal_envio: "whatsapp",
    id_contenido: null,
    // Compatibilidad: tu tabla vieja tenía fecha_hora, la dejamos consistente
    fecha_hora: now,
    // Campos “nuevos” del outbox (según tu screenshot)
    nombre_plantilla: params.nombre_plantilla,
    intentos: 0,
    ultimo_error: null,
    reintentar_despues: null,
    fecha_creado: now,
    // Metadata libre (jsonb)
    metadata: params.metadata ?? {}
  };
  const { data, error } = await supabase.from("mensajes_enviados").insert([
    row
  ]).select("id").maybeSingle();
  if (error) return {
    ok: false,
    error: error.message
  };
  if (!data?.id) return {
    ok: false,
    error: "No se obtuvo id del mensaje encolado"
  };
  return {
    ok: true,
    id_mensaje: data.id
  };
}
/**
 * Dedupe simple:
 * - Evita spamear confirm_ok si ya hay uno “vivo” para el suscriptor.
 * - Estados “vivos”: pendiente/enviado/delivered/read
 */ async function existeMensajeVivo(params) {
  const estadosVivos = [
    ESTADO_PENDIENTE,
    ESTADO_ENVIADO,
    ESTADO_DELIVERED,
    ESTADO_READ
  ];
  const { data, error } = await supabase.from("mensajes_enviados").select("id, estado, fecha_creado").eq("id_suscriptor", params.id_suscriptor).eq("nombre_plantilla", params.nombre_plantilla).in("estado", estadosVivos).order("fecha_creado", {
    ascending: false
  }).limit(1);
  if (error) {
    await registrarLog("dedupe_query_error", {
      error: error.message,
      ...params
    }, false);
    // Si no podemos dedupe por error, preferimos NO bloquear el flujo
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}
/**
 * Rate-limit BAJA:
 * - Revisa último mensaje BAJA (baja_info_mp o baja_thc) por suscriptor.
 * - Si fue hace <24h -> bloquear.
 *
 * Importante: el usuario pidió:
 * - Si se bloquea por rate-limit -> NO encolar y log exito=false.
 */ async function bajaEstaRateLimited(params) {
  const plantillas = [
    PLANTILLA_BAJA_INFO_MP,
    PLANTILLA_BAJA_THC
  ];
  const { data, error } = await supabase.from("mensajes_enviados").select("id, fecha_creado, fecha_enviado, nombre_plantilla, estado").eq("id_suscriptor", params.id_suscriptor).in("nombre_plantilla", plantillas).order("fecha_creado", {
    ascending: false
  }).limit(1);
  if (error) {
    await registrarLog("baja_rate_limit_query_error", {
      error: error.message,
      ...params
    }, false);
    // Si no podemos chequear, preferimos NO bloquear BAJA
    return {
      limited: false,
      horasDesdeUltimo: null,
      lastId: null
    };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return {
      limited: false,
      horasDesdeUltimo: null,
      lastId: null
    };
  }
  const last = data[0];
  // Usamos “fecha_enviado” si existe; si no, “fecha_creado”
  const whenStr = last.fecha_enviado ?? last.fecha_creado;
  if (!whenStr) return {
    limited: false,
    horasDesdeUltimo: null,
    lastId: last.id ?? null
  };
  const when = new Date(whenStr);
  if (isNaN(when.getTime())) return {
    limited: false,
    horasDesdeUltimo: null,
    lastId: last.id ?? null
  };
  const hours = diffHours(new Date(nowUTCISO()), when);
  return {
    limited: hours < BAJA_RATE_LIMIT_HOURS,
    horasDesdeUltimo: hours,
    lastId: last.id ?? null
  };
}
// ============================================================================
// Disparo de sender (envío inmediato de mensajes ya encolados)
// ----------------------------------------------------------------------------
// OBJETIVO:
// - Invocar ef_whatsapp_sender pasándole solo el id_mensaje.
// - El sender se encarga de reclamar, validar y enviar.
//
// SEGURIDAD:
// - x-internal-key: barrera interna entre funciones
// - Authorization/apikey: JWT válido para verify_jwt
// ============================================================================
async function dispararSender(id_mensaje) {
  // --------------------------------------------------------------------------
  // URL de la Edge Function sender
  // --------------------------------------------------------------------------
  const url = `${SUPABASE_URL}/functions/v1/${SENDER_FUNCTION_NAME}`;
  // --------------------------------------------------------------------------
  // Headers internos estandarizados
  // --------------------------------------------------------------------------
  const headers = {
    "Content-Type": "application/json",
    // Seguridad interna entre funciones
    "x-internal-key": WHATSAPP_INTERNAL_KEY,
    // JWT válido para verify_jwt
    "Authorization": `Bearer ${ANON_KEY_SUPABASE}`,
    "apikey": ANON_KEY_SUPABASE
  };
  // --------------------------------------------------------------------------
  // Llamada HTTP al sender
  // --------------------------------------------------------------------------
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id_mensaje
    })
  });
  // --------------------------------------------------------------------------
  // Intentamos parsear respuesta para dejar mejor trazabilidad
  // --------------------------------------------------------------------------
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch  {
    parsed = {
      raw: text
    };
  }
  return {
    ok: r.ok,
    http_status: r.status,
    body: parsed
  };
}
// ============================================================================
// Helper: llamar al orquestador de menú interactivo
// ============================================================================
// OBJETIVO:
//   Delegar al orquestador de menú cuando el inbound detecta un trigger
//   de menú (MENU / CONFIG / AJUSTES / PREFERENCIAS) para un usuario
//   con whatsapp_confirmado=true.
//
// SEGURIDAD:
//   Mismos headers internos que dispararSender.
//
// IMPORTANTE:
//   El inbound siempre responde 200. Si el orquestador falla, se loguea
//   el error pero el inbound no rompe el webhook.
// ============================================================================
async function llamarOrquestadorMenu(params) {
  const url = `${SUPABASE_URL}/functions/v1/${MENU_FUNCTION_NAME}`;
  const headers = {
    "Content-Type": "application/json",
    "x-internal-key": WHATSAPP_INTERNAL_KEY,
    "Authorization": `Bearer ${ANON_KEY_SUPABASE}`,
    "apikey": ANON_KEY_SUPABASE
  };
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      whatsapp: params.numeroE164,
      text: params.texto
    })
  });
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { ok: r.ok, http_status: r.status, body: parsed };
}
// ============================================================================
// Handler principal
// ============================================================================
serve(async (req)=>{
  // -------------------------------------------------------------------------
  // 0) Solo POST
  // -------------------------------------------------------------------------
  if (req.method !== "POST") {
    return jsonResponse({
      error: "Método no permitido. Usar POST."
    }, 405);
  }
  // -------------------------------------------------------------------------
  // 1) Parse body
  // -------------------------------------------------------------------------
  let body = null;
  try {
    body = await req.json();
  } catch (e) {
    await registrarLog("json_invalido", {
      error: String(e)
    }, false);
    return jsonResponse({
      error: "JSON inválido"
    }, 400);
  }
  // Si viene desde CAPA 1, puede venir envuelto:
  // { payload: <evento_whatsapp>, id_evento: <id whatsapp_webhook_events> }
  const id_evento = body?.id_evento ?? null;
  // -------------------------------------------------------------------------
  // 2) Extraer mensaje (text/reaction)
  // -------------------------------------------------------------------------
  const parsed = extraerMensajeEntrante(body);
  if (!parsed.esMensajeProcesable) {
    await registrarLog("evento_sin_mensaje_procesable", {
      motivo: parsed.motivo,
      rawType: parsed?.rawType ?? null,
      id_evento
    }, true);
    // Inbound responde 200 sin acción (no debe “romper” el webhook)
    return jsonResponse({
      resultado: "sin_accion",
      motivo: parsed.motivo
    }, 200);
  }
  // -------------------------------------------------------------------------
  // 3) Normalizar número
  // -------------------------------------------------------------------------
  const numeroE164 = normalizarNumeroWhatsApp(parsed.from);
  if (!numeroE164) {
    await registrarLog("mensaje_sin_numero_valido", {
      from: parsed.from,
      msgId: parsed.msgId,
      id_evento
    }, false);
    return jsonResponse({
      resultado: "error",
      mensaje: "No se pudo determinar el número de WhatsApp"
    }, 200);
  }
  // -------------------------------------------------------------------------
  // 4) Determinar comandos de usuario
  // -------------------------------------------------------------------------
  // BAJA:
  // - pausa mensajes premium automáticos.
  //
  // ALTA / ACTIVAR / REACTIVAR / VOLVER:
  // - reactiva mensajes premium automáticos si la suscripción sigue activa.
  //
  // IMPORTANTE:
  // - Solo procesamos comandos si el mensaje entrante es type="text".
  // - Reactions siguen sirviendo para confirmar número, pero no para comandos.
  // -------------------------------------------------------------------------
  const texto = parsed.tipo === "text" ? parsed.textBody ?? "" : "";
  const textoNormalizado = normalizeText(texto);
  const esBaja = parsed.tipo === "text" && textoNormalizado === "BAJA";
  const esReactivacion = parsed.tipo === "text" && COMANDOS_REACTIVACION.includes(textoNormalizado);
  // -------------------------------------------------------------------------
  // Comandos informativos
  // -------------------------------------------------------------------------
  // AYUDA:
  // - muestra comandos disponibles.
  //
  // ESTADO:
  // - muestra situación actual del usuario.
  //
  // Solo aplican a mensajes type="text".
  // -------------------------------------------------------------------------
  const esAyuda = parsed.tipo === "text" && textoNormalizado === COMANDO_AYUDA;
  const esEstado = parsed.tipo === "text" && textoNormalizado === COMANDO_ESTADO;
  const esMenu = parsed.tipo === "text" && COMANDOS_MENU.includes(textoNormalizado);
  // -------------------------------------------------------------------------
  // 5) Buscar suscriptor
  //   - Traemos lo mínimo para reglas de negocio
  // -------------------------------------------------------------------------
  const { data: suscriptor, error: errSusc } = await supabase.from("suscriptores").select("id, nombre, whatsapp, tipo_suscripcion, estado_suscripcion, whatsapp_confirmado, preapproval_status, estado_mensaje, menu_state").eq("whatsapp", numeroE164).maybeSingle();
  if (errSusc) {
    await registrarLog("error_buscar_suscriptor", {
      numeroE164,
      error: errSusc.message,
      id_evento
    }, false);
    return jsonResponse({
      resultado: "error",
      mensaje: "Error buscando suscriptor"
    }, 500);
  }
  if (!suscriptor) {
    await registrarLog("numero_no_registrado", {
      numeroE164,
      msgId: parsed.msgId,
      tipo: parsed.tipo,
      textBody: texto,
      reactionEmoji: parsed.reactionEmoji,
      id_evento
    }, true);
    return jsonResponse({
      resultado: "sin_accion",
      motivo: "numero_no_registrado"
    }, 200);
  }
  // =========================================================================
  // 5.4) AYUDA / ESTADO — COMANDOS INFORMATIVOS
  // =========================================================================
  //
  // OBJETIVO:
  // - Procesar comandos que NO cambian el estado del usuario.
  // - Responder información útil por WhatsApp.
  // - Mantener el flujo principal limpio.
  //
  // COMANDOS SOPORTADOS:
  // - AYUDA
  // - ESTADO
  //
  // POR QUÉ VA ACÁ:
  // - Ya tenemos suscriptor identificado.
  // - Todavía no entramos a BAJA, ALTA ni confirmación.
  // - Si el usuario ya está confirmado, el bloque "ya_confirmado" cortaría
  //   antes de responder AYUDA / ESTADO.
  // - Por eso estos comandos deben resolverse antes del flujo normal.
  //
  // IMPORTANTE MVP:
  // - Para enviar respuesta usamos outbox + sender.
  // - No enviamos directo.
  // - Reutilizamos enqueueMensaje() y dispararSender().
  // =========================================================================
  if (esAyuda || esEstado) {
    // -----------------------------------------------------------------------
    // 5.4.1) Resolver plantilla lógica según comando
    // -----------------------------------------------------------------------
    // Usamos claves lógicas:
    // - ayuda_usuario
    // - estado_usuario
    //
    // La función obtenerContenidoPlantilla() busca en tabla plantillas:
    //   nombre    = clave lógica
    //   contenido = nombre real aprobado en Meta
    // -----------------------------------------------------------------------
    const clavePlantilla = esAyuda ? PLANTILLA_AYUDA_USUARIO : PLANTILLA_ESTADO_USUARIO;
    const plantillaReal = await obtenerContenidoPlantilla(clavePlantilla);
    if (!plantillaReal) {
      await registrarLog("comando_info_plantilla_no_encontrada", {
        id_suscriptor: suscriptor.id,
        numeroE164,
        msgId: parsed.msgId,
        id_evento,
        comando: textoNormalizado,
        clavePlantilla
      }, false);
      return jsonResponse({
        resultado: "error",
        mensaje: "No se encontró plantilla para comando informativo",
        comando: textoNormalizado,
        clavePlantilla
      }, 500);
    }
    // -----------------------------------------------------------------------
    // 5.4.2) Preparar variables según comando
    // -----------------------------------------------------------------------
    // AYUDA:
    // - variable nombre
    //
    // ESTADO:
    // - variable nombre
    // - estado de suscripción legible
    // - estado de mensajes legible
    //
    // IMPORTANTE:
    // - El sender debe poder mapear estas variables según TEMPLATE_VARIABLE_ORDER.
    // - Si tus templates usan solo {{1}}, podés mandar todo armado en "cuerpo".
    // -----------------------------------------------------------------------
    const nombre = String(suscriptor?.nombre ?? "").trim() || "ahí";
    const estadoSuscripcionRaw = String(suscriptor?.estado_suscripcion ?? "").trim();
    const estadoMensajeRaw = String(suscriptor?.estado_mensaje ?? "").trim();
    const suscripcionLegible = estadoSuscripcionRaw === "activa" ? "activa" : estadoSuscripcionRaw || "sin estado definido";
    const mensajesLegible = estadoMensajeRaw === "pausado_usuario" ? "pausados" : "activos";
    // -----------------------------------------------------------------------
    // 5.4.2.B) Variables finales para la plantilla
    // -----------------------------------------------------------------------
    // AYUDA:
    // - La plantilla ayuda_usuario usa una sola variable:
    //     {{1}} = nombre
    //
    // ESTADO:
    // - La plantilla estado_usuario usa tres variables:
    //     {{1}} = nombre
    //     {{2}} = estado_suscripcion
    //     {{3}} = estado_mensaje
    //
    // IMPORTANTE:
    // - Esto debe coincidir con TEMPLATE_VARIABLE_ORDER en ef_whatsapp_sender.
    // - No mandamos "cuerpo" para AYUDA porque la plantilla ya tiene el texto fijo
    //   aprobado en Meta.
    // - No mandamos "cuerpo" para ESTADO porque esa plantilla también quedó
    //   estructurada con variables separadas.
    // -----------------------------------------------------------------------
    const variables = esAyuda ? {
      nombre
    } : {
      nombre,
      estado_suscripcion: suscripcionLegible,
      estado_mensaje: mensajesLegible
    };
    // -----------------------------------------------------------------------
    // 5.4.3) Encolar respuesta operativa
    // -----------------------------------------------------------------------
    // No respondemos directo por WhatsApp.
    // Respetamos arquitectura:
    //   inbound -> mensajes_enviados -> sender
    // -----------------------------------------------------------------------
    const enq = await enqueueMensaje({
      id_suscriptor: suscriptor.id,
      whatsapp_destino: numeroE164,
      tipo_mensaje: "operativo",
      nombre_plantilla: plantillaReal,
      estado: ESTADO_PENDIENTE,
      metadata: {
        variables,
        id_evento,
        inbound: {
          tipo: parsed.tipo,
          msgId: parsed.msgId,
          timestampUTC: parsed.timestampUTC,
          textBody: texto,
          comando: textoNormalizado
        }
      }
    });
    if (!enq.ok) {
      await registrarLog("comando_info_enqueue_error", {
        id_suscriptor: suscriptor.id,
        numeroE164,
        msgId: parsed.msgId,
        id_evento,
        comando: textoNormalizado,
        clavePlantilla,
        plantillaReal,
        error: enq.error
      }, false);
      return jsonResponse({
        resultado: "error",
        mensaje: "No se pudo encolar respuesta informativa",
        comando: textoNormalizado
      }, 500);
    }
    // -----------------------------------------------------------------------
    // 5.4.4) Disparar sender
    // -----------------------------------------------------------------------
    // Igual que BAJA / confirm_ok:
    // - dejamos mensaje en outbox
    // - disparamos sender inmediato
    // -----------------------------------------------------------------------
    const sender = await dispararSender(enq.id_mensaje);
    await registrarLog(sender.ok ? "comando_info_sender_disparado_ok" : "comando_info_sender_disparado_error", {
      id_suscriptor: suscriptor.id,
      id_mensaje: enq.id_mensaje,
      numeroE164,
      msgId: parsed.msgId,
      id_evento,
      comando: textoNormalizado,
      clavePlantilla,
      plantillaReal,
      variables,
      http_status: sender.http_status,
      respuesta: sender.body
    }, sender.ok);
    // -----------------------------------------------------------------------
    // 5.4.5) Respuesta final del inbound
    // -----------------------------------------------------------------------
    return jsonResponse({
      resultado: "ok",
      accion: esAyuda ? "ayuda_encolada" : "estado_encolado",
      comando: textoNormalizado,
      id_suscriptor: suscriptor.id,
      id_mensaje: enq.id_mensaje,
      plantilla: plantillaReal,
      sender_http_status: sender.http_status
    }, 200);
  }
  // =========================================================================
  // 5.5) REACTIVACIÓN DE MENSAJES — ALTA / ACTIVAR / REACTIVAR / VOLVER
  // =========================================================================
  //
  // OBJETIVO:
  // - Permitir que un usuario que había pausado mensajes con BAJA vuelva a
  //   recibir contenido premium automático.
  //
  // QUÉ HACE:
  // - Cambia suscriptores.estado_mensaje a "activo".
  //
  // QUÉ NO HACE:
  // - NO activa Mercado Pago.
  // - NO cambia premium_activo.
  // - NO cambia estado_suscripcion.
  // - NO cambia preapproval_status.
  // - NO genera contenido.
  // - NO encola contenido premium.
  // - NO envía mensaje directo.
  //
  // POR QUÉ VA ANTES DE BAJA / CONFIRMACIÓN:
  // - Porque ALTA / ACTIVAR / REACTIVAR / VOLVER son comandos explícitos.
  // - Si el usuario ya estaba confirmado, el bloque "ya_confirmado" cortaría
  //   el flujo antes de permitir reactivar.
  // - Por eso se procesa acá, antes del flujo de confirmación normal.
  //
  // REGLA DE NEGOCIO:
  // - Solo reactivamos mensajes si el usuario sigue siendo premium activo.
  // - Si Mercado Pago / suscripción no está activa, no reactivamos por WhatsApp.
  // =========================================================================
  if (esReactivacion) {
    // -----------------------------------------------------------------------
    // 5.5.1) Validar que la suscripción siga activa
    // -----------------------------------------------------------------------
    // Para no confundir "reactivar mensajes" con "reactivar suscripción",
    // exigimos que el usuario siga teniendo:
    //
    // - tipo_suscripcion = premium
    // - estado_suscripcion = activa
    //
    // Esto mantiene la separación:
    // - Mercado Pago decide si la suscripción existe / está activa.
    // - WhatsApp solo pausa o reactiva mensajes.
    // -----------------------------------------------------------------------
    const esPremiumActivoParaMensajes = suscriptor?.tipo_suscripcion === "premium" && suscriptor?.estado_suscripcion === "activa";
    if (!esPremiumActivoParaMensajes) {
      await registrarLog("reactivacion_ignorada_no_premium_activo", {
        id_suscriptor: suscriptor.id,
        numeroE164,
        msgId: parsed.msgId,
        id_evento,
        comando: textoNormalizado,
        tipo_suscripcion: suscriptor?.tipo_suscripcion ?? null,
        estado_suscripcion: suscriptor?.estado_suscripcion ?? null,
        preapproval_status: suscriptor?.preapproval_status ?? null
      }, true);
      return jsonResponse({
        resultado: "sin_accion",
        motivo: "no_premium_activo_para_reactivar_mensajes"
      }, 200);
    }
    // -----------------------------------------------------------------------
    // 5.5.2) Actualizar estado_mensaje a "activo"
    // -----------------------------------------------------------------------
    // Idempotencia:
    // - Si ya estaba activo, dejarlo activo no rompe nada.
    // - No necesitamos fallar por repetir el comando.
    //
    // Importante:
    // - No tocamos fechas de pago.
    // - No tocamos estado de suscripción.
    // - No tocamos premium_activo.
    // -----------------------------------------------------------------------
    const { error: reactivarErr } = await supabase.from("suscriptores").update({
      estado_mensaje: "activo",
      actualizado_en: nowUTCISO()
    }).eq("id", suscriptor.id);
    if (reactivarErr) {
      await registrarLog("reactivacion_mensajes_error", {
        id_suscriptor: suscriptor.id,
        numeroE164,
        msgId: parsed.msgId,
        id_evento,
        comando: textoNormalizado,
        error: reactivarErr.message
      }, false);
      return jsonResponse({
        resultado: "error",
        mensaje: "No se pudo reactivar el envío de mensajes"
      }, 500);
    }
    // -----------------------------------------------------------------------
    // 5.5.3) Log de éxito
    // -----------------------------------------------------------------------
    // Dejamos trazabilidad clara para testing:
    // - comando recibido
    // - usuario
    // - nuevo estado
    // -----------------------------------------------------------------------
    await registrarLog("reactivacion_mensajes_ok", {
      id_suscriptor: suscriptor.id,
      numeroE164,
      msgId: parsed.msgId,
      id_evento,
      comando: textoNormalizado,
      estado_mensaje_anterior: suscriptor?.estado_mensaje ?? null,
      estado_mensaje_nuevo: "activo",
      fechaEventoUTC: parsed.timestampUTC
    }, true);
    // -----------------------------------------------------------------------
    // 5.5.4) Respuesta final
    // -----------------------------------------------------------------------
    // No encolamos respuesta porque todavía no definimos plantilla específica
    // para "reactivación confirmada".
    //
    // Si más adelante creás una plantilla tipo:
    // - reactivacion_mensajes_ok
    //
    // ahí se puede encolar igual que BAJA.
    // -----------------------------------------------------------------------
    return jsonResponse({
      resultado: "ok",
      accion: "mensajes_reactivados",
      id_suscriptor: suscriptor.id,
      estado_mensaje: "activo"
    }, 200);
  }
  // =========================================================================
  // 5.6) MENÚ INTERACTIVO — Solo usuarios con whatsapp_confirmado=true
  // =========================================================================
  //
  // OBJETIVO:
  //   Delegar al orquestador de menú cuando el usuario escribe uno de los
  //   triggers: MENU / MENÚ / CONFIG / AJUSTES / PREFERENCIAS.
  //
  // REGLAS:
  //   - Solo se activa si whatsapp_confirmado=true.
  //   - Si whatsapp_confirmado=false: se ignora este bloque y el texto cae
  //     al flujo normal (puede confirmar el número si es premium activo).
  //   - BAJA sigue siendo un comando independiente (sección 6).
  //     La razón: BAJA se procesa incluso para no-premium; el menú no.
  //   - La llamada al orquestador va envuelta en try/catch.
  //   - Si el orquestador falla, se loguea el error pero el inbound
  //     sigue respondiendo 200 a Meta (regla de oro del webhook).
  // =========================================================================
  // estaEnMenu: usuario confirmado dentro de un estado de menú activo escribió
  // algo que no es un trigger ni BAJA. Sus inputs de navegación (1, 2, 0, etc.)
  // deben llegar al orquestador igual que el trigger inicial.
  const estaEnMenu = (suscriptor.menu_state ?? null) !== null
    && suscriptor.whatsapp_confirmado === true
    && !esBaja; // BAJA sigue su propio flujo (sección 6)
  if (esMenu || estaEnMenu) {
    if (suscriptor.whatsapp_confirmado !== true) {
      // No activar menú para usuarios no confirmados.
      // El texto cae al flujo normal (sección 6 en adelante).
      await registrarLog("menu_ignorado_no_confirmado", {
        id_suscriptor: suscriptor.id,
        numeroE164,
        msgId: parsed.msgId,
        textoNormalizado,
        id_evento
      }, true);
      // No hay return: continúa al bloque BAJA y luego al flujo de confirmación.
    } else {
      // Usuario confirmado → delegar al orquestador de menú
      await registrarLog("menu_detectado", {
        id_suscriptor: suscriptor.id,
        numeroE164,
        textoNormalizado,
        msgId: parsed.msgId,
        id_evento
      }, true);
      try {
        const resOrq = await llamarOrquestadorMenu({
          numeroE164,
          texto
        });
        await registrarLog(
          resOrq.ok ? "menu_orquestador_ok" : "menu_orquestador_error",
          {
            id_suscriptor: suscriptor.id,
            numeroE164,
            http_status: resOrq.http_status,
            respuesta: resOrq.body
          },
          resOrq.ok
        );
      } catch (e) {
        await registrarLog("menu_orquestador_excepcion", {
          id_suscriptor: suscriptor.id,
          numeroE164,
          error: String(e)
        }, false);
      }
      return jsonResponse({
        resultado: "ok",
        accion: "menu_delegado_a_orquestador",
        id_suscriptor: suscriptor.id
      }, 200);
    }
  }
  // =========================================================================
  // 6) BAJA (se procesa aunque NO sea premium activo)
  // =========================================================================
  if (esBaja) {
    // 6.1 rate-limit 24h
    const rl = await bajaEstaRateLimited({
      id_suscriptor: suscriptor.id
    });
    if (rl.limited) {
      // Pedido explícito: log exito=false cuando se ignora por rate-limit
      await registrarLog("baja_rate_limited_24h", {
        id_suscriptor: suscriptor.id,
        numeroE164,
        msgId: parsed.msgId,
        id_evento,
        horasDesdeUltimo: rl.horasDesdeUltimo,
        lastId: rl.lastId
      }, false);
      return jsonResponse({
        resultado: "sin_accion",
        motivo: "baja_rate_limited_24h"
      }, 200);
    }
    // 6.2 elegir plantilla según estado MP
    const mpActiva = mpEstaActiva(suscriptor?.preapproval_status ?? null, suscriptor?.estado_suscripcion ?? null);
    const nombre_plantilla = mpActiva ? PLANTILLA_BAJA_INFO_MP : PLANTILLA_BAJA_THC;
    await registrarLog("baja_recibida", {
      id_suscriptor: suscriptor.id,
      numeroE164,
      msgId: parsed.msgId,
      id_evento,
      mpActiva,
      nombre_plantilla,
      fechaEventoUTC: parsed.timestampUTC
    }, true);
    // ============================================================================
    // 🛑 PAUSAR ENVÍOS PREMIUM POR SOLICITUD DEL USUARIO
    // ----------------------------------------------------------------------------
    // CONTEXTO:
    // - El usuario escribió BAJA por WhatsApp.
    // - BAJA NO cancela Mercado Pago.
    // - BAJA NO desactiva la suscripción premium.
    // - BAJA solo pausa el envío de mensajes automáticos por WhatsApp.
    //
    // CAMPO USADO:
    // - suscriptores.estado_mensaje
    //
    // VALORES:
    // - 'pausado_usuario' => el usuario pidió no recibir mensajes
    // - 'activo'          => puede recibir mensajes nuevamente
    //
    // IMPORTANTE:
    // - No tocamos premium_activo.
    // - No tocamos estado_suscripcion.
    // - No tocamos preapproval_status.
    // - No tocamos auto_renovacion_activa.
    // ============================================================================
    const { error: pausaErr } = await supabase.from("suscriptores").update({
      estado_mensaje: "pausado_usuario",
      // Limpiar sesión de menú si estaba activa
      menu_state: null,
      menu_state_updated_at: null,
      actualizado_en: nowUTCISO()
    }).eq("id", suscriptor.id);
    if (pausaErr) {
      await registrarLog("baja_pausa_mensajes_error", {
        id_suscriptor: suscriptor.id,
        numeroE164,
        id_evento,
        error: pausaErr.message
      }, false);
      return jsonResponse({
        resultado: "error",
        mensaje: "No se pudo pausar el envío de mensajes"
      }, 500);
    }
    await registrarLog("baja_pausa_mensajes_ok", {
      id_suscriptor: suscriptor.id,
      numeroE164,
      id_evento,
      estado_mensaje: "pausado_usuario"
    }, true);
    // 6.3 encolar
    const enq = await enqueueMensaje({
      id_suscriptor: suscriptor.id,
      whatsapp_destino: numeroE164,
      tipo_mensaje: "operativo",
      nombre_plantilla,
      estado: ESTADO_PENDIENTE,
      metadata: {
        variables: {
          nombre: suscriptor?.nombre ?? ""
        },
        id_evento,
        inbound: {
          tipo: parsed.tipo,
          msgId: parsed.msgId,
          timestampUTC: parsed.timestampUTC,
          textBody: texto
        }
      }
    });
    if (!enq.ok) {
      await registrarLog("baja_enqueue_error", {
        id_suscriptor: suscriptor.id,
        numeroE164,
        id_evento,
        error: enq.error
      }, false);
      return jsonResponse({
        resultado: "error",
        mensaje: "No se pudo encolar el mensaje BAJA"
      }, 500);
    }
    // 6.4 disparar sender
    const sender = await dispararSender(enq.id_mensaje);
    await registrarLog(sender.ok ? "baja_sender_disparado_ok" : "baja_sender_disparado_error", {
      id_suscriptor: suscriptor.id,
      id_mensaje: enq.id_mensaje,
      nombre_plantilla,
      http_status: sender.http_status,
      respuesta: sender.body
    }, sender.ok);
    return jsonResponse({
      resultado: "ok",
      accion: "baja_encolada_y_sender_disparado",
      id_mensaje: enq.id_mensaje,
      nombre_plantilla,
      sender_http_status: sender.http_status
    }, 200);
  }
  // =========================================================================
  // 7) Confirmación (solo PREMIUM ACTIVO)
  // =========================================================================
  const esPremiumActivo = suscriptor?.tipo_suscripcion === "premium" && suscriptor?.estado_suscripcion === "activa";
  if (!esPremiumActivo) {
    await registrarLog("no_premium_activo_sin_accion", {
      id_suscriptor: suscriptor.id,
      numeroE164,
      tipo: parsed.tipo,
      msgId: parsed.msgId,
      id_evento
    }, true);
    return jsonResponse({
      resultado: "sin_accion",
      motivo: "no_premium_activo"
    }, 200);
  }
  // 7.1 si ya confirmado -> no hacemos nada (y no encolamos confirm_ok)
  if (suscriptor?.whatsapp_confirmado === true) {
    await registrarLog("ya_confirmado", {
      id_suscriptor: suscriptor.id,
      numeroE164,
      tipo: parsed.tipo,
      msgId: parsed.msgId,
      id_evento,
      fechaEventoUTC: parsed.timestampUTC
    }, true);
    return jsonResponse({
      resultado: "ya_confirmado",
      mensaje: "El número ya estaba confirmado"
    }, 200);
  }
  // =========================================================================
  // 7.2) GATE: No confirmar si la bienvenida aún no fue enviada/delivered
  // =========================================================================
  const gate = await bienvenidaYaFueEnviada({
    id_suscriptor: suscriptor.id,
    modo: "enviado"
  });
  if (!gate.ok) {
    await registrarLog("gate_bienvenida_query_error", {
      id_suscriptor: suscriptor.id,
      numeroE164,
      msgId: parsed.msgId,
      motivo: gate.motivo
    }, false);
    // por robustez: si no puedo chequear, prefiero NO confirmar
    return jsonResponse({
      resultado: "sin_accion",
      motivo: "gate_bienvenida_query_error"
    }, 200);
  }
  if (!gate.permitido) {
    await registrarLog("confirmacion_ignorada_por_bienvenida_pendiente", {
      id_suscriptor: suscriptor.id,
      numeroE164,
      msgId: parsed.msgId,
      motivo: gate.motivo,
      bienvenida: gate.last ?? null
    }, true);
    return jsonResponse({
      resultado: "sin_accion",
      motivo: "bienvenida_no_enviada_aun"
    }, 200);
  }
  // =========================================================================
  // 8) Confirmación por “cualquier cosa menos BAJA”
  // =========================================================================
  //
  // Confirmamos WhatsApp SI:
  // - es premium activo
  // - mensaje ≠ BAJA
  // - whatsapp_confirmado = false
  //
  // NO usamos premium_pendiente_confirmacion (no existe en el modelo).
  // =========================================================================
  const fechaConfirmacion = parsed.timestampUTC || nowUTCISO();
  // Actualizamos solo si todavía no estaba confirmado (idempotente)
  const { data: updatedRows, error: updErr } = await supabase.from("suscriptores").update({
    whatsapp_confirmado: true,
    fecha_confirmacion_whatsapp: fechaConfirmacion,
    actualizado_en: nowUTCISO()
  }).eq("id", suscriptor.id).eq("whatsapp_confirmado", false).select("id");
  if (updErr) {
    await registrarLog("error_confirmar_whatsapp", {
      id_suscriptor: suscriptor.id,
      numeroE164,
      msgId: parsed.msgId,
      error: updErr.message
    }, false);
    return jsonResponse({
      resultado: "error",
      mensaje: "No se pudo confirmar el número"
    }, 500);
  }
  // Si no se actualizó ninguna fila → ya estaba confirmado (race condition safe)
  if (!updatedRows || updatedRows.length === 0) {
    await registrarLog("ya_confirmado_race_safe", {
      id_suscriptor: suscriptor.id,
      numeroE164,
      msgId: parsed.msgId
    }, true);
    return jsonResponse({
      resultado: "ok",
      accion: "ya_confirmado"
    }, 200);
  }
  // =========================================================================
  // FLAG DE CONTROL DEL FLUJO POST-CONFIRMACIÓN
  // ----------------------------------------------------------------------------
  // OBJETIVO:
  // - Solo disparar la generación del primer contenido premium si el mensaje
  //   confirmacion_numero_ok quedó correctamente encaminado.
  //
  // REGLA:
  // - true  => podemos pasar al siguiente paso del onboarding
  // - false => NO disparamos generación on-demand todavía
  //
  // Esto alinea el flujo con el criterio:
  //   1) confirmar número
  //   2) enviar confirmacion_numero_ok
  //   3) recién después preparar primer contenido premium
  // =========================================================================
  let puedeDispararPrimerContenido = false;
  // =========================================================================
  // 9) Encolar confirmacion_numero_ok usando plantilla REAL desde tabla
  // =========================================================================
  //
  // OBJETIVO:
  // - NO hardcodear el nombre real de la template Meta.
  // - Usar la clave lógica:
  //     PLANTILLA_CONFIRM_OK = "confirmacion_numero_ok"
  // - Resolver desde tabla `plantillas` el campo `contenido`.
  // - Usar ese valor REAL para:
  //     1) dedupe
  //     2) enqueue
  //     3) sender
  //
  // REGLA DE NEGOCIO IMPORTANTE:
  // - Solo si confirmacion_numero_ok quedó correctamente encaminado,
  //   habilitamos el siguiente paso: generar el primer contenido premium.
  // =========================================================================
  // -------------------------------------------------------------------------
  // 9.0) Resolver nombre REAL de template desde tabla `plantillas`
  // -------------------------------------------------------------------------
  const plantillaConfirmOkReal = await obtenerContenidoPlantilla(PLANTILLA_CONFIRM_OK);
  // Si no se encontró la plantilla real, cortar con log claro
  if (!plantillaConfirmOkReal) {
    await registrarLog("confirm_ok_plantilla_no_encontrada", {
      id_suscriptor: suscriptor.id,
      nombre_logico: PLANTILLA_CONFIRM_OK
    }, false);
    return jsonResponse({
      resultado: "error",
      mensaje: "No se encontró la plantilla lógica confirmacion_numero_ok"
    }, 500);
  }
  // -------------------------------------------------------------------------
  // 9.1) DEDUPE usando nombre REAL de template
  // -------------------------------------------------------------------------
  // IMPORTANTE:
  // - Ya NO deduplicamos por la clave lógica.
  // - Ahora deduplicamos por el nombre REAL guardado en mensajes_enviados.
  // -------------------------------------------------------------------------
  const yaExisteConfirm = await existeMensajeVivo({
    id_suscriptor: suscriptor.id,
    nombre_plantilla: plantillaConfirmOkReal
  });
  // -------------------------------------------------------------------------
  // 9.2) Si no existe una confirmación viva, encolamos y disparamos sender
  // -------------------------------------------------------------------------
  if (!yaExisteConfirm) {
    const enq = await enqueueMensaje({
      id_suscriptor: suscriptor.id,
      whatsapp_destino: numeroE164,
      tipo_mensaje: "operativo",
      // Guardamos en outbox el nombre REAL de la template Meta
      nombre_plantilla: plantillaConfirmOkReal,
      estado: ESTADO_PENDIENTE,
      metadata: {
        variables: {
          nombre: suscriptor?.nombre ?? ""
        },
        id_evento
      }
    });
    // -----------------------------------------------------------------------
    // 9.3) Si encoló bien -> log + disparar sender
    // -----------------------------------------------------------------------
    if (enq.ok) {
      await registrarLog("confirm_ok_encolado", {
        id_suscriptor: suscriptor.id,
        id_mensaje: enq.id_mensaje,
        nombre_logico: PLANTILLA_CONFIRM_OK,
        nombre_plantilla_real: plantillaConfirmOkReal
      }, true);
      const sender = await dispararSender(enq.id_mensaje);
      await registrarLog(sender.ok ? "confirm_ok_sender_disparado_ok" : "confirm_ok_sender_disparado_error", {
        id_suscriptor: suscriptor.id,
        id_mensaje: enq.id_mensaje,
        nombre_plantilla_real: plantillaConfirmOkReal,
        http_status: sender.http_status,
        respuesta: sender.body
      }, sender.ok);
      // ---------------------------------------------------------------------
      // 9.4) SOLO si el sender respondió OK, habilitamos el paso siguiente
      // ---------------------------------------------------------------------
      if (sender.ok) {
        puedeDispararPrimerContenido = true;
      }
    } else {
      // ---------------------------------------------------------------------
      // 9.5) Si falla el encolado -> log exito=false
      // ---------------------------------------------------------------------
      await registrarLog("confirm_ok_enqueue_error", {
        id_suscriptor: suscriptor.id,
        nombre_plantilla_real: plantillaConfirmOkReal,
        error: enq.error
      }, false);
    }
  } else {
    // -----------------------------------------------------------------------
    // 9.6) Si ya existía un confirm_ok vivo, dejamos trazabilidad
    // -----------------------------------------------------------------------
    // IMPORTANTE:
    // - En este escenario NO habilitamos automáticamente la generación premium.
    // - Mantenemos una política estricta:
    //     primero debe quedar correctamente encaminado el confirm_ok de esta
    //     confirmación actual.
    // - Esto evita disparar contenido premium si el mensaje de confirmación
    //   todavía no salió realmente.
    // -----------------------------------------------------------------------
    await registrarLog("confirm_ok_ya_existia_vivo", {
      id_suscriptor: suscriptor.id,
      nombre_plantilla_real: plantillaConfirmOkReal
    }, true);
  }
  // =========================================================================
  // 10) Disparar generación ON-DEMAND del primer contenido premium
  // ----------------------------------------------------------------------------
  // OBJETIVO:
  // - Solo generar el primer contenido premium si confirmacion_numero_ok
  //   quedó correctamente encaminado.
  //
  // REGLA:
  // - Si puedeDispararPrimerContenido = true -> disparar generación
  // - Si puedeDispararPrimerContenido = false -> NO disparar todavía
  // =========================================================================
  if (puedeDispararPrimerContenido) {
    const genOnDemand = await dispararGeneracionOnDemand(suscriptor.id);
    await registrarLog(genOnDemand.ok ? "primer_contenido_ondemand_disparado_ok" : "primer_contenido_ondemand_disparado_error", {
      id_suscriptor: suscriptor.id,
      http_status: genOnDemand.http_status,
      respuesta: genOnDemand.body
    }, genOnDemand.ok);
  } else {
    // -----------------------------------------------------------------------
    // 10.1) Trazabilidad de por qué NO se disparó la generación on-demand
    // -----------------------------------------------------------------------
    await registrarLog("primer_contenido_ondemand_no_disparado", {
      id_suscriptor: suscriptor.id,
      motivo: "confirm_ok_no_quedo_correctamente_encaminado"
    }, false);
  }
  // =========================================================================
  // 11) Respuesta final inbound
  // ----------------------------------------------------------------------------
  // Llegados a este punto:
  // - el número quedó confirmado
  // - confirmacion_numero_ok fue intentado
  // - la generación on-demand solo se dispara si el flujo previo quedó OK
  // =========================================================================
  await registrarLog("whatsapp_confirmado_ok", {
    id_suscriptor: suscriptor.id,
    numeroE164,
    fechaConfirmacion,
    puedeDispararPrimerContenido
  }, true);
  return jsonResponse({
    resultado: "ok",
    accion: "confirmado",
    id_suscriptor: suscriptor.id,
    primer_contenido_habilitado: puedeDispararPrimerContenido
  }, 200);
});
