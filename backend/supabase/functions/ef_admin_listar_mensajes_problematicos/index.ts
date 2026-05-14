// ============================================================================
// 🚨 EDGE FUNCTION: ef_admin_listar_mensajes_problematicos
// ============================================================================
//
// MÓDULO:
//   Administración Operativa y Observabilidad
//
// NOMBRE TÉCNICO:
//   ef_admin_listar_mensajes_problematicos
//
// OBJETIVO:
//   Listar mensajes que requieren atención operativa.
//
// USO ESPERADO:
//   - Postman.
//   - Futuro panel administrativo.
//   - Revisión diaria de soporte.
//   - Diagnóstico previo antes de usar:
//       ef_admin_ver_mensaje
//       ef_admin_reintentar_mensaje
//
// QUÉ PERMITE VER:
//   - mensajes fallidos
//   - mensajes en fallo definitivo
//   - mensajes procesando
//   - mensajes pendientes
//   - mensajes con muchos intentos
//   - mensajes antiguos sin resolver
//
// QUÉ NO HACE:
//   - NO modifica mensajes.
//   - NO reintenta mensajes.
//   - NO llama al sender.
//   - NO envía WhatsApp.
//   - NO corrige estados.
//   - NO modifica contenido_premium.
//   - NO modifica suscriptores.
//   - NO toca Mercado Pago.
//
// TIPO:
//   Read-only / listado operativo.
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//   - Usa SUPABASE_SERVICE_ROLE_KEY.
//   - Función interna.
//
// INPUT:
//   POST body opcional:
//
//   {
//     "estado": "fallido",
//     "tipo_mensaje": "premium",
//     "id_suscriptor": 1,
//     "limit": 20,
//     "offset": 0,
//     "incluir_enviados": false,
//     "log": false
//   }
//
// ESTADOS SOPORTADOS EN FILTRO:
//   - pendiente
//   - procesando
//   - fallido
//   - fallo_definitivo
//   - enviado
//
// SI NO SE ENVÍA ESTADO:
//   Lista por defecto:
//     fallido
//     fallo_definitivo
//     procesando
//
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// 🔐 ENV
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const FUNCION = "ef_admin_listar_mensajes_problematicos";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// 🧰 HELPERS GENERALES
// ============================================================================
function nowUTCISO() {
  return new Date().toISOString();
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
function normalizarTexto(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value : null;
}
function normalizarId(input) {
  if (typeof input === "number" && Number.isInteger(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const n = Number(input);
    if (Number.isInteger(n)) return n;
  }
  return null;
}
function normalizarBoolean(input, defaultValue = false) {
  if (typeof input === "boolean") return input;
  return defaultValue;
}
function normalizarLimit(input) {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isInteger(n)) return 20;
  if (n < 1) return 20;
  if (n > 100) return 100;
  return n;
}
function normalizarOffset(input) {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isInteger(n)) return 0;
  if (n < 0) return 0;
  return n;
}
// ============================================================================
// 🧠 LEER BODY SEGURO
// ============================================================================
async function readBodySafe(req) {
  try {
    const body = await req.json();
    if (body && typeof body === "object") {
      return body;
    }
    return {};
  } catch  {
    return {};
  }
}
// ============================================================================
// 📝 LOGGER OPCIONAL
// ----------------------------------------------------------------------------
// Por defecto esta función NO loguea cada listado.
// Si se manda log=true, registra la consulta.
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
    console.error(`[${FUNCION}] Error registrando log`, e);
  }
}
// ============================================================================
// ✅ VALIDAR ESTADO
// ============================================================================
const ESTADOS_VALIDOS = [
  "pendiente",
  "procesando",
  "fallido",
  "fallo_definitivo",
  "enviado"
];
function normalizarEstado(input) {
  const estado = normalizarTexto(input);
  if (!estado) return null;
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return null;
  }
  return estado;
}
// ============================================================================
// 🧾 RESUMEN HUMANO DEL RESULTADO
// ============================================================================
function construirResumenTexto(params) {
  const { total, limit, offset, estados, tipo_mensaje, id_suscriptor } = params;
  const filtros = [];
  filtros.push(`estados: ${estados.join(", ")}`);
  if (tipo_mensaje) {
    filtros.push(`tipo_mensaje: ${tipo_mensaje}`);
  }
  if (id_suscriptor !== null) {
    filtros.push(`id_suscriptor: ${id_suscriptor}`);
  }
  return [
    `🚨 Mensajes problemáticos`,
    ``,
    `Total encontrado: ${total}`,
    `Mostrando: ${limit}`,
    `Offset: ${offset}`,
    ``,
    `Filtros: ${filtros.join(" | ")}`
  ].join("\n");
}
// ============================================================================
// 🧠 EVALUAR REINTENTABILIDAD SIMPLE
// ----------------------------------------------------------------------------
// Esto no reemplaza ef_admin_ver_mensaje.
// Solo da una ayuda rápida en el listado.
// ============================================================================
function evaluarAccionSugerida(mensaje) {
  const estado = String(mensaje?.estado ?? "");
  if (estado === "fallido") {
    return {
      reintentable: true,
      accion_sugerida: "ver_y_reintentar",
      comentario: "Revisar ultimo_error y luego usar ef_admin_reintentar_mensaje."
    };
  }
  if (estado === "fallo_definitivo") {
    return {
      reintentable: true,
      accion_sugerida: "revision_manual",
      comentario: "Requiere revisión manual antes de reintentar."
    };
  }
  if (estado === "procesando") {
    return {
      reintentable: false,
      accion_sugerida: "revisar_si_quedo_colgado",
      comentario: "Si lleva mucho tiempo procesando, puede requerir acción de soporte."
    };
  }
  if (estado === "pendiente") {
    return {
      reintentable: false,
      accion_sugerida: "esperar_batch_o_revisar_cron",
      comentario: "El mensaje está pendiente. Debería tomarlo el batch/sender."
    };
  }
  if (estado === "enviado") {
    return {
      reintentable: false,
      accion_sugerida: "sin_accion",
      comentario: "Mensaje enviado. No reenviar para evitar duplicados."
    };
  }
  return {
    reintentable: false,
    accion_sugerida: "revisar_estado",
    comentario: "Estado no reconocido para acción automática."
  };
}
// ============================================================================
// 🚀 HANDLER
// ============================================================================
serve(async (req)=>{
  const tsNow = nowUTCISO();
  // ==========================================================================
  // 1) Seguridad interna
  // ==========================================================================
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== WHATSAPP_INTERNAL_KEY) {
    return jsonResponse({
      ok: false,
      motivo: "unauthorized"
    }, 401);
  }
  // ==========================================================================
  // 2) Método
  // ==========================================================================
  if (req.method !== "POST") {
    return jsonResponse({
      ok: false,
      motivo: "metodo_no_permitido",
      mensaje: "Usar POST."
    }, 405);
  }
  // ==========================================================================
  // 3) Leer parámetros
  // ==========================================================================
  const body = await readBodySafe(req);
  const estado = normalizarEstado(body.estado);
  const tipo_mensaje = normalizarTexto(body.tipo_mensaje);
  const id_suscriptor = normalizarId(body.id_suscriptor);
  const incluir_enviados = normalizarBoolean(body.incluir_enviados, false);
  const shouldLog = normalizarBoolean(body.log, false);
  const limit = normalizarLimit(body.limit);
  const offset = normalizarOffset(body.offset);
  // --------------------------------------------------------------------------
  // Estados por defecto:
  // - Si el admin no pide un estado específico, listamos los que requieren
  //   atención operativa.
  // --------------------------------------------------------------------------
  let estadosFiltro;
  if (estado) {
    estadosFiltro = [
      estado
    ];
  } else {
    estadosFiltro = [
      "fallido",
      "fallo_definitivo",
      "procesando"
    ];
    if (incluir_enviados) {
      estadosFiltro.push("enviado");
    }
  }
  // ==========================================================================
  // 4) Armar query base
  // ==========================================================================
  let query = supabase.from("mensajes_enviados").select(`
      id,
      fecha_hora,
      whatsapp_destino,
      tipo_mensaje,
      estado,
      id_suscriptor,
      id_contenido,
      canal_envio,
      resultado_envio,
      mensaje_id_whatsapp,
      intentos,
      ultimo_error,
      reintentar_despues,
      fecha_creado,
      fecha_enviado,
      fecha_delivered,
      fecha_read,
      nombre_plantilla,
      fecha_envio_programada,
      fecha_ultimo_intento
    `, {
    count: "exact"
  }).in("estado", estadosFiltro);
  // --------------------------------------------------------------------------
  // Filtro por tipo de mensaje.
  // Ejemplo:
  //   premium
  //   operativo
  // --------------------------------------------------------------------------
  if (tipo_mensaje) {
    query = query.eq("tipo_mensaje", tipo_mensaje);
  }
  // --------------------------------------------------------------------------
  // Filtro por suscriptor.
  // --------------------------------------------------------------------------
  if (id_suscriptor !== null) {
    query = query.eq("id_suscriptor", id_suscriptor);
  }
  // --------------------------------------------------------------------------
  // Orden:
  // - Los más recientes por último intento primero.
  // - Si fecha_ultimo_intento está null, igual quedan al final.
  // --------------------------------------------------------------------------
  query = query.order("fecha_ultimo_intento", {
    ascending: false,
    nullsFirst: false
  }).order("fecha_creado", {
    ascending: false,
    nullsFirst: false
  }).range(offset, offset + limit - 1);
  // ==========================================================================
  // 5) Ejecutar query
  // ==========================================================================
  const { data, error, count } = await query;
  if (error) {
    await registrarLog("listar_mensajes_error", {
      error: error.message,
      filtros: {
        estado,
        estadosFiltro,
        tipo_mensaje,
        id_suscriptor,
        limit,
        offset
      }
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "listar_mensajes_error",
      error: error.message
    }, 500);
  }
  const mensajesRaw = Array.isArray(data) ? data : [];
  // ==========================================================================
  // 6) Enriquecer resultado con acción sugerida
  // ==========================================================================
  const mensajes = mensajesRaw.map((m)=>({
      ...m,
      diagnostico_admin: evaluarAccionSugerida(m)
    }));
  // ==========================================================================
  // 7) Resumen de conteos por estado en el resultado actual
  // ==========================================================================
  const conteo_resultado = mensajes.reduce((acc, m)=>{
    const key = String(m.estado ?? "sin_estado");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  // ==========================================================================
  // 8) Warnings
  // ==========================================================================
  const warnings = [];
  if ((count ?? 0) > limit) {
    warnings.push("hay_mas_resultados_que_el_limit");
  }
  if (mensajes.some((m)=>m.estado === "fallo_definitivo")) {
    warnings.push("hay_mensajes_en_fallo_definitivo");
  }
  if (mensajes.some((m)=>m.estado === "procesando")) {
    warnings.push("hay_mensajes_en_procesando");
  }
  if (mensajes.some((m)=>Number(m.intentos ?? 0) >= 5)) {
    warnings.push("hay_mensajes_con_muchos_intentos");
  }
  // ==========================================================================
  // 9) Resumen textual
  // ==========================================================================
  const resumenTexto = construirResumenTexto({
    total: count ?? mensajes.length,
    limit,
    offset,
    estados: estadosFiltro,
    tipo_mensaje,
    id_suscriptor
  });
  // ==========================================================================
  // 10) Respuesta
  // ==========================================================================
  const response = {
    ok: true,
    healthy: mensajes.length === 0,
    funcion: FUNCION,
    timestamp_utc: tsNow,
    resumen_texto: resumenTexto,
    filtros: {
      estado_solicitado: estado,
      estados_aplicados: estadosFiltro,
      tipo_mensaje,
      id_suscriptor,
      incluir_enviados,
      limit,
      offset
    },
    paginacion: {
      total: count ?? mensajes.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null
    },
    conteo_resultado,
    mensajes,
    warnings
  };
  // ==========================================================================
  // 11) Log opcional
  // ==========================================================================
  if (shouldLog) {
    await registrarLog(mensajes.length === 0 ? "listar_mensajes_sin_resultados" : "listar_mensajes_con_resultados", {
      filtros: response.filtros,
      paginacion: response.paginacion,
      conteo_resultado,
      warnings
    }, true);
  }
  // ==========================================================================
  // 12) Respuesta final
  // ==========================================================================
  return jsonResponse(response, 200);
});
