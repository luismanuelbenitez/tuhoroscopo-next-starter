// ============================================================================
// 🪵 EDGE FUNCTION: ef_admin_listar_logs
// ============================================================================
//
// MÓDULO:
//   Administración Operativa y Observabilidad
//
// NOMBRE TÉCNICO:
//   ef_admin_listar_logs
//
// OBJETIVO:
//   Listar registros de log_funciones con filtros útiles para administración.
//
// USO ESPERADO:
//   - Postman.
//   - Futuro panel administrativo.
//   - Revisión diaria de errores.
//   - Diagnóstico de una función concreta.
//   - Auditoría operativa de procesos internos.
//
// QUÉ PERMITE VER:
//   - últimos logs del sistema
//   - logs de una función específica
//   - solo errores
//   - solo éxitos
//   - logs por resultado
//   - logs por rango de fechas
//   - logs relacionados a una palabra clave
//
// QUÉ NO HACE:
//   - NO modifica logs.
//   - NO borra logs.
//   - NO reintenta procesos.
//   - NO llama otras funciones.
//   - NO corrige datos.
//   - NO toca mensajes.
//   - NO toca suscriptores.
//   - NO toca Mercado Pago.
//
// TIPO:
//   Read-only / observabilidad.
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
//     "nombre_funcion": "ef_whatsapp_sender",
//     "solo_errores": true,
//     "resultado": "mensaje_envio_error",
//     "fecha_desde": "2026-04-27",
//     "fecha_hasta": "2026-04-28",
//     "buscar": "id_mensaje",
//     "limit": 50,
//     "offset": 0,
//     "log": false
//   }
//
// NOTA SOBRE FECHAS:
//   - fecha_desde y fecha_hasta aceptan:
//       "YYYY-MM-DD"
//       o ISO completo.
//   - Si no se envían fechas, lista últimos logs sin filtrar por período.
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
const FUNCION = "ef_admin_listar_logs";
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
//   para fecha_desde -> 00:00:00 UTC
//   para fecha_hasta -> 00:00:00 UTC de ese día exacto
//
// Nota:
//   Si querés filtrar un día entero, llamar:
//     fecha_desde = "2026-04-27"
//     fecha_hasta = "2026-04-28"
// ============================================================================
function normalizarFecha(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  // --------------------------------------------------------------------------
  // Caso YYYY-MM-DD
  // --------------------------------------------------------------------------
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    return date.toISOString();
  }
  // --------------------------------------------------------------------------
  // Caso ISO o fecha parseable
  // --------------------------------------------------------------------------
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
// Esta función puede registrar que se consultaron logs, pero solo si log=true.
// No queremos llenar log_funciones por cada consulta administrativa.
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
// 🧾 RESUMEN TEXTO
// ============================================================================
function construirResumenTexto(params) {
  const { total, limit, offset, nombre_funcion, solo_errores, solo_exitos, resultado, fecha_desde, fecha_hasta, buscar } = params;
  const filtros = [];
  if (nombre_funcion) filtros.push(`función: ${nombre_funcion}`);
  if (solo_errores) filtros.push("solo errores");
  if (solo_exitos) filtros.push("solo éxitos");
  if (resultado) filtros.push(`resultado: ${resultado}`);
  if (fecha_desde) filtros.push(`desde: ${fecha_desde}`);
  if (fecha_hasta) filtros.push(`hasta: ${fecha_hasta}`);
  if (buscar) filtros.push(`buscar: ${buscar}`);
  return [
    `🪵 Logs administrativos`,
    ``,
    `Total encontrado: ${total}`,
    `Mostrando: ${limit}`,
    `Offset: ${offset}`,
    ``,
    `Filtros: ${filtros.length > 0 ? filtros.join(" | ") : "sin filtros específicos"}`
  ].join("\n");
}
// ============================================================================
// 🧠 FILTRAR POR TEXTO EN MEMORIA
// ----------------------------------------------------------------------------
// Supabase puede buscar texto simple en columnas text, pero buscar dentro de
// detalle jsonb de forma flexible desde query builder no siempre es cómodo.
//
// Para MVP:
//   - traemos la página filtrada por SQL.
//   - si viene buscar, filtramos en memoria por:
//       nombre_funcion
//       resultado
//       detalle serializado
//
// Nota:
//   Esto sirve para soporte manual.
//   Si más adelante querés búsquedas profundas masivas, conviene una RPC SQL.
// ============================================================================
function filtrarPorTexto(logs, buscar) {
  if (!buscar) return logs;
  const needle = buscar.toLowerCase();
  return logs.filter((log)=>{
    try {
      const text = JSON.stringify(log).toLowerCase();
      return text.includes(needle);
    } catch  {
      return false;
    }
  });
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
  // 2) Método permitido
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
  const nombre_funcion = normalizarTexto(body.nombre_funcion);
  const resultado = normalizarTexto(body.resultado);
  const buscar = normalizarTexto(body.buscar);
  const solo_errores = normalizarBoolean(body.solo_errores, false);
  const solo_exitos = normalizarBoolean(body.solo_exitos, false);
  const shouldLog = normalizarBoolean(body.log, false);
  const fecha_desde = normalizarFecha(body.fecha_desde);
  const fecha_hasta = normalizarFecha(body.fecha_hasta);
  const limit = normalizarLimit(body.limit);
  const offset = normalizarOffset(body.offset);
  // ==========================================================================
  // 4) Validaciones de consistencia
  // ==========================================================================
  if (solo_errores && solo_exitos) {
    return jsonResponse({
      ok: false,
      motivo: "filtros_incompatibles",
      mensaje: "No se puede usar solo_errores y solo_exitos al mismo tiempo."
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
  // 5) Armar query SQL base
  // ==========================================================================
  let query = supabase.from("log_funciones").select(`
      id,
      nombre_funcion,
      fecha_ejecucion,
      resultado,
      detalle,
      exito,
      creado_por
    `, {
    count: "exact"
  });
  // --------------------------------------------------------------------------
  // Filtro por función.
  // --------------------------------------------------------------------------
  if (nombre_funcion) {
    query = query.eq("nombre_funcion", nombre_funcion);
  }
  // --------------------------------------------------------------------------
  // Filtro por resultado exacto.
  // --------------------------------------------------------------------------
  if (resultado) {
    query = query.eq("resultado", resultado);
  }
  // --------------------------------------------------------------------------
  // Errores / éxitos.
  // --------------------------------------------------------------------------
  if (solo_errores) {
    query = query.eq("exito", false);
  }
  if (solo_exitos) {
    query = query.eq("exito", true);
  }
  // --------------------------------------------------------------------------
  // Fechas.
  // log_funciones.fecha_ejecucion es timestamp.
  // --------------------------------------------------------------------------
  if (fecha_desde) {
    query = query.gte("fecha_ejecucion", fecha_desde);
  }
  if (fecha_hasta) {
    query = query.lt("fecha_ejecucion", fecha_hasta);
  }
  // --------------------------------------------------------------------------
  // Orden y paginación.
  // --------------------------------------------------------------------------
  query = query.order("fecha_ejecucion", {
    ascending: false,
    nullsFirst: false
  }).range(offset, offset + limit - 1);
  // ==========================================================================
  // 6) Ejecutar query
  // ==========================================================================
  const { data, error, count } = await query;
  if (error) {
    await registrarLog("listar_logs_error", {
      error: error.message,
      filtros: {
        nombre_funcion,
        resultado,
        solo_errores,
        solo_exitos,
        fecha_desde,
        fecha_hasta,
        buscar,
        limit,
        offset
      }
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "listar_logs_error",
      error: error.message
    }, 500);
  }
  const logsRaw = Array.isArray(data) ? data : [];
  // ==========================================================================
  // 7) Filtro opcional por texto
  // ==========================================================================
  const logs = filtrarPorTexto(logsRaw, buscar);
  // ==========================================================================
  // 8) Conteo por función y resultado dentro de la página
  // ==========================================================================
  const conteo_por_funcion = logs.reduce((acc, log)=>{
    const key = String(log.nombre_funcion ?? "sin_funcion");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const conteo_por_resultado = logs.reduce((acc, log)=>{
    const key = String(log.resultado ?? "sin_resultado");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const conteo_por_exito = logs.reduce((acc, log)=>{
    const key = log.exito === true ? "exito_true" : log.exito === false ? "exito_false" : "exito_null";
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
  if (buscar && logs.length < logsRaw.length) {
    warnings.push("buscar_filtrado_en_memoria_sobre_pagina_actual");
  }
  if (logs.some((log)=>log.exito === false)) {
    warnings.push("resultado_incluye_logs_con_error");
  }
  // ==========================================================================
  // 10) Resumen textual
  // ==========================================================================
  const resumenTexto = construirResumenTexto({
    total: count ?? logsRaw.length,
    limit,
    offset,
    nombre_funcion,
    solo_errores,
    solo_exitos,
    resultado,
    fecha_desde,
    fecha_hasta,
    buscar
  });
  // ==========================================================================
  // 11) Respuesta
  // ==========================================================================
  const response = {
    ok: true,
    healthy: logs.every((log)=>log.exito !== false),
    funcion: FUNCION,
    timestamp_utc: tsNow,
    resumen_texto: resumenTexto,
    filtros: {
      nombre_funcion,
      resultado,
      solo_errores,
      solo_exitos,
      fecha_desde,
      fecha_hasta,
      buscar,
      limit,
      offset
    },
    paginacion: {
      total_sql: count ?? logsRaw.length,
      total_devuelto: logs.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null
    },
    conteos_pagina: {
      por_funcion: conteo_por_funcion,
      por_resultado: conteo_por_resultado,
      por_exito: conteo_por_exito
    },
    logs,
    warnings
  };
  // ==========================================================================
  // 12) Log opcional
  // ==========================================================================
  if (shouldLog) {
    await registrarLog(logs.length === 0 ? "listar_logs_sin_resultados" : "listar_logs_con_resultados", {
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
