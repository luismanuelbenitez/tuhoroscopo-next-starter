// ============================================================================
// ✨ EDGE FUNCTION: ef_admin_listar_contenido_premium
// ============================================================================
//
// MÓDULO:
//   Administración Operativa y Observabilidad
//
// NOMBRE TÉCNICO:
//   ef_admin_listar_contenido_premium
//
// OBJETIVO:
//   Listar registros de contenido_premium con filtros administrativos útiles.
//
// USO ESPERADO:
//   - Postman.
//   - Futuro panel administrativo.
//   - Soporte interno.
//   - Revisión de contenido generado.
//   - Diagnóstico de contenido pendiente, enviado o fallido.
//   - Control de contenido por fecha, suscriptor, tipo o estado.
//
// QUÉ PERMITE VER:
//   - contenido premium generado para una fecha
//   - contenido pendiente de envío
//   - contenido ya enviado
//   - contenido fallido
//   - contenido por suscriptor
//   - contenido por tipo: diario / domingo
//   - contenido por estado_envio
//   - contenido con fecha_envio_programada en rango
//   - contenido con fecha_envio_real en rango
//
// QUÉ NO HACE:
//   - NO genera contenido.
//   - NO encola mensajes.
//   - NO reintenta envíos.
//   - NO modifica contenido_premium.
//   - NO modifica mensajes_enviados.
//   - NO modifica suscriptores.
//   - NO envía WhatsApp.
//   - NO toca Mercado Pago.
//
// TIPO:
//   Read-only / listado administrativo.
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
//     "id_suscriptor": 1,
//     "estado_envio": "pendiente",
//     "tipo": "diario",
//     "fecha_desde": "2026-04-27",
//     "fecha_hasta": "2026-04-28",
//     "solo_pendientes": true,
//     "solo_enviados": false,
//     "solo_con_error": false,
//     "limit": 50,
//     "offset": 0,
//     "log": false
//   }
//
// ESTADOS ESPERADOS EN estado_envio:
//   - pendiente
//   - generado
//   - encolado
//   - enviado
//   - fallido
//   - fallo_definitivo
//
// NOTA:
//   No imponemos check rígido de estados en la función porque tu sistema puede
//   tener estados legacy o valores intermedios.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// 🔐 ENV
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const FUNCION = "ef_admin_listar_contenido_premium";
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
function normalizarBoolean(input, defaultValue = false) {
  if (typeof input === "boolean") return input;
  return defaultValue;
}
function normalizarId(input) {
  if (typeof input === "number" && Number.isInteger(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const n = Number(input);
    if (Number.isInteger(n)) return n;
  }
  return null;
}
function normalizarLimit(input) {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isInteger(n)) return 50;
  if (n < 1) return 50;
  if (n > 200) return 200;
  return n;
}
function normalizarOffset(input) {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isInteger(n)) return 0;
  if (n < 0) return 0;
  return n;
}
// ============================================================================
// 📅 NORMALIZAR FECHA
// ----------------------------------------------------------------------------
// Acepta:
//   "2026-04-27"
//   "2026-04-27T14:00:00.000Z"
//
// Si recibe YYYY-MM-DD:
//   devuelve inicio del día UTC.
// ============================================================================
function normalizarFecha(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    return date.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
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
// 🧠 DIAGNÓSTICO RÁPIDO DE CONTENIDO
// ----------------------------------------------------------------------------
// Agrega una lectura administrativa por cada registro.
//
// No modifica nada.
// ============================================================================
function diagnosticarContenido(c) {
  const warnings = [];
  const estado = String(c.estado_envio ?? "");
  const tieneFechaReal = Boolean(c.fecha_envio_real);
  const tieneMensajeWamid = Boolean(c.mensaje_id_whatsapp);
  const tieneError = Boolean(c.ultimo_error);
  if (!c.id_suscriptor) {
    warnings.push("sin_id_suscriptor");
  }
  if (!c.fecha_envio_programada) {
    warnings.push("sin_fecha_envio_programada");
  }
  if (estado === "fallido") {
    warnings.push("contenido_fallido");
  }
  if (estado === "fallo_definitivo") {
    warnings.push("contenido_fallo_definitivo");
  }
  if (estado === "enviado" && !tieneFechaReal) {
    warnings.push("estado_enviado_sin_fecha_real");
  }
  if (estado === "enviado" && !tieneMensajeWamid) {
    warnings.push("estado_enviado_sin_mensaje_id_whatsapp");
  }
  if (estado !== "enviado" && tieneFechaReal) {
    warnings.push("fecha_real_con_estado_no_enviado");
  }
  if (tieneError) {
    warnings.push("contenido_con_ultimo_error");
  }
  if (estado === "pendiente" || estado === "generado" || estado === "encolado") {
    warnings.push("contenido_pendiente_de_cierre");
  }
  let estado_resumen = "ok";
  let accion_sugerida = "sin_accion";
  if (estado === "fallido" || estado === "fallo_definitivo") {
    estado_resumen = "requiere_revision";
    accion_sugerida = "revisar_mensaje_asociado_o_reencolar";
  } else if (estado === "pendiente" || estado === "generado" || estado === "encolado") {
    estado_resumen = "pendiente";
    accion_sugerida = "verificar_si_existe_mensaje_en_outbox";
  } else if (estado === "enviado") {
    estado_resumen = "enviado";
    accion_sugerida = "sin_accion";
  } else if (!estado) {
    estado_resumen = "sin_estado";
    accion_sugerida = "revisar_estado_envio";
  }
  return {
    healthy: warnings.length === 0,
    warnings,
    estado_resumen,
    accion_sugerida
  };
}
// ============================================================================
// 🧾 RESUMEN HUMANO
// ============================================================================
function construirResumenTexto(params) {
  const { total, limit, offset, filtros } = params;
  const filtrosActivos = Object.entries(filtros).filter(([, value])=>value !== null && value !== undefined && value !== "" && value !== false).map(([key, value])=>`${key}: ${String(value)}`);
  return [
    `✨ Contenido premium`,
    ``,
    `Total encontrado: ${total}`,
    `Mostrando: ${limit}`,
    `Offset: ${offset}`,
    ``,
    `Filtros: ${filtrosActivos.length > 0 ? filtrosActivos.join(" | ") : "sin filtros específicos"}`
  ].join("\n");
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
  const id_suscriptor = normalizarId(body.id_suscriptor);
  const estado_envio = normalizarTexto(body.estado_envio);
  const tipo = normalizarTexto(body.tipo);
  const canal = normalizarTexto(body.canal);
  const origen_generacion = normalizarTexto(body.origen_generacion);
  const solo_pendientes = normalizarBoolean(body.solo_pendientes, false);
  const solo_enviados = normalizarBoolean(body.solo_enviados, false);
  const solo_con_error = normalizarBoolean(body.solo_con_error, false);
  const solo_sin_fecha_real = normalizarBoolean(body.solo_sin_fecha_real, false);
  const fecha_desde = normalizarFecha(body.fecha_desde);
  const fecha_hasta = normalizarFecha(body.fecha_hasta);
  const shouldLog = normalizarBoolean(body.log, false);
  const limit = normalizarLimit(body.limit);
  const offset = normalizarOffset(body.offset);
  // ==========================================================================
  // 4) Validaciones de filtros incompatibles
  // ==========================================================================
  if (solo_pendientes && solo_enviados) {
    return jsonResponse({
      ok: false,
      motivo: "filtros_incompatibles",
      mensaje: "No usar solo_pendientes y solo_enviados al mismo tiempo."
    }, 400);
  }
  if (fecha_desde && fecha_hasta) {
    const d1 = new Date(fecha_desde);
    const d2 = new Date(fecha_hasta);
    if (d2 <= d1) {
      return jsonResponse({
        ok: false,
        motivo: "rango_fechas_invalido",
        mensaje: "fecha_hasta debe ser mayor que fecha_desde.",
        fecha_desde,
        fecha_hasta
      }, 400);
    }
  }
  // ==========================================================================
  // 5) Query base
  // ==========================================================================
  let query = supabase.from("contenido_premium").select(`
      id,
      id_suscriptor,
      contenido,
      fecha_creacion,
      generado,
      generado_por,
      resultado,
      ciclo_semana,
      emocion_dominante,
      fecha_envio_programada,
      fecha_envio_real,
      tipo,
      estado_envio,
      mensaje_id_whatsapp,
      ultimo_error,
      canal,
      reintentar_despues,
      enviado_por,
      color,
      contenido_preferido,
      numero,
      origen_generacion,
      meta_generacion,
      tokens_input,
      tokens_output,
      costo_estimado,
      modelo_ia
    `, {
    count: "exact"
  });
  // --------------------------------------------------------------------------
  // Filtro por suscriptor.
  // --------------------------------------------------------------------------
  if (id_suscriptor !== null) {
    query = query.eq("id_suscriptor", id_suscriptor);
  }
  // --------------------------------------------------------------------------
  // Filtro por estado_envio exacto.
  // --------------------------------------------------------------------------
  if (estado_envio) {
    query = query.eq("estado_envio", estado_envio);
  }
  // --------------------------------------------------------------------------
  // Filtro por tipo.
  // Ejemplo:
  //   diario
  //   domingo
  // --------------------------------------------------------------------------
  if (tipo) {
    query = query.eq("tipo", tipo);
  }
  // --------------------------------------------------------------------------
  // Filtro por canal.
  // Ejemplo:
  //   whatsapp
  // --------------------------------------------------------------------------
  if (canal) {
    query = query.eq("canal", canal);
  }
  // --------------------------------------------------------------------------
  // Filtro por origen_generacion.
  // Ejemplo:
  //   cron
  //   manual
  //   post_confirmacion
  // --------------------------------------------------------------------------
  if (origen_generacion) {
    query = query.eq("origen_generacion", origen_generacion);
  }
  // --------------------------------------------------------------------------
  // Filtro por pendientes.
  // Consideramos pendiente todo lo que no tenga fecha_envio_real y esté en
  // estados operativos previos al envío.
  // --------------------------------------------------------------------------
  if (solo_pendientes) {
    query = query.is("fecha_envio_real", null).in("estado_envio", [
      "pendiente",
      "generado",
      "encolado"
    ]);
  }
  // --------------------------------------------------------------------------
  // Filtro solo enviados.
  // --------------------------------------------------------------------------
  if (solo_enviados) {
    query = query.not("fecha_envio_real", "is", null).eq("estado_envio", "enviado");
  }
  // --------------------------------------------------------------------------
  // Filtro solo con error.
  // --------------------------------------------------------------------------
  if (solo_con_error) {
    query = query.not("ultimo_error", "is", null);
  }
  // --------------------------------------------------------------------------
  // Filtro sin fecha real.
  // Útil para ver contenido aún no cerrado.
  // --------------------------------------------------------------------------
  if (solo_sin_fecha_real) {
    query = query.is("fecha_envio_real", null);
  }
  // --------------------------------------------------------------------------
  // Rango de fecha sobre fecha_envio_programada.
  // Para esta función el rango se interpreta como:
  //   contenido programado entre fecha_desde y fecha_hasta.
  // --------------------------------------------------------------------------
  if (fecha_desde) {
    query = query.gte("fecha_envio_programada", fecha_desde);
  }
  if (fecha_hasta) {
    query = query.lt("fecha_envio_programada", fecha_hasta);
  }
  // --------------------------------------------------------------------------
  // Orden y paginación.
  // --------------------------------------------------------------------------
  query = query.order("fecha_envio_programada", {
    ascending: false,
    nullsFirst: false
  }).order("fecha_creacion", {
    ascending: false,
    nullsFirst: false
  }).range(offset, offset + limit - 1);
  // ==========================================================================
  // 6) Ejecutar query
  // ==========================================================================
  const { data, error, count } = await query;
  if (error) {
    await registrarLog("listar_contenido_premium_error", {
      error: error.message,
      filtros: {
        id_suscriptor,
        estado_envio,
        tipo,
        canal,
        origen_generacion,
        solo_pendientes,
        solo_enviados,
        solo_con_error,
        solo_sin_fecha_real,
        fecha_desde,
        fecha_hasta,
        limit,
        offset
      }
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "listar_contenido_premium_error",
      error: error.message
    }, 500);
  }
  const contenidoRaw = Array.isArray(data) ? data : [];
  // ==========================================================================
  // 7) Enriquecer con diagnóstico administrativo
  // ==========================================================================
  const contenido = contenidoRaw.map((c)=>({
      ...c,
      diagnostico_admin: diagnosticarContenido(c)
    }));
  // ==========================================================================
  // 8) Conteos dentro de la página
  // ==========================================================================
  const conteo_estado_envio_pagina = contenido.reduce((acc, c)=>{
    const key = String(c.estado_envio ?? "sin_estado");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const conteo_tipo_pagina = contenido.reduce((acc, c)=>{
    const key = String(c.tipo ?? "sin_tipo");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const conteo_diagnostico_pagina = contenido.reduce((acc, c)=>{
    const key = String(c.diagnostico_admin?.estado_resumen ?? "sin_diagnostico");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  // ==========================================================================
  // 9) Warnings
  // ==========================================================================
  const warnings = [];
  if ((count ?? 0) > limit) {
    warnings.push("hay_mas_resultados_que_el_limit");
  }
  if (contenido.some((c)=>c.diagnostico_admin?.warnings?.length > 0)) {
    warnings.push("hay_contenido_con_alertas");
  }
  if (contenido.some((c)=>c.estado_envio === "fallido")) {
    warnings.push("hay_contenido_fallido");
  }
  if (contenido.some((c)=>c.estado_envio === "fallo_definitivo")) {
    warnings.push("hay_contenido_en_fallo_definitivo");
  }
  if (contenido.some((c)=>c.estado_envio === "pendiente" || c.estado_envio === "generado")) {
    warnings.push("hay_contenido_pendiente");
  }
  // ==========================================================================
  // 10) Resumen textual
  // ==========================================================================
  const filtros = {
    id_suscriptor,
    estado_envio,
    tipo,
    canal,
    origen_generacion,
    solo_pendientes,
    solo_enviados,
    solo_con_error,
    solo_sin_fecha_real,
    fecha_desde,
    fecha_hasta
  };
  const resumenTexto = construirResumenTexto({
    total: count ?? contenido.length,
    limit,
    offset,
    filtros
  });
  // ==========================================================================
  // 11) Respuesta
  // ==========================================================================
  const response = {
    ok: true,
    healthy: contenido.every((c)=>c.diagnostico_admin?.healthy === true),
    funcion: FUNCION,
    timestamp_utc: tsNow,
    resumen_texto: resumenTexto,
    filtros: {
      ...filtros,
      limit,
      offset
    },
    paginacion: {
      total: count ?? contenido.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null
    },
    conteos_pagina: {
      estado_envio: conteo_estado_envio_pagina,
      tipo: conteo_tipo_pagina,
      diagnostico: conteo_diagnostico_pagina
    },
    contenido,
    warnings
  };
  // ==========================================================================
  // 12) Log opcional
  // ==========================================================================
  if (shouldLog) {
    await registrarLog(contenido.length === 0 ? "listar_contenido_premium_sin_resultados" : "listar_contenido_premium_con_resultados", {
      filtros: response.filtros,
      paginacion: response.paginacion,
      conteos_pagina: response.conteos_pagina,
      warnings
    }, true);
  }
  // ==========================================================================
  // 13) Respuesta final
  // ==========================================================================
  return jsonResponse(response, 200);
});
