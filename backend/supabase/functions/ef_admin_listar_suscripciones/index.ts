// ============================================================================
// 💳 EDGE FUNCTION: ef_admin_listar_suscripciones
// ============================================================================
//
// MÓDULO:
//   Administración Operativa y Observabilidad
//
// NOMBRE TÉCNICO:
//   ef_admin_listar_suscripciones
//
// OBJETIVO:
//   Listar suscripciones con filtros administrativos útiles.
//
// USO ESPERADO:
//   - Postman.
//   - Futuro panel administrativo.
//   - Soporte interno.
//   - Revisión de suscripciones Mercado Pago.
//   - Control de suscripciones activas, pendientes, canceladas o fallidas.
//   - Revisión de descuentos asociados a una suscripción.
//   - Diagnóstico de preapproval_id y estado local.
//
// QUÉ PERMITE VER:
//   - suscripciones activas
//   - suscripciones pendientes
//   - suscripciones canceladas
//   - suscripciones provisionales
//   - suscripciones con auto renovación activa/inactiva
//   - suscripciones por preapproval_id
//   - suscripciones por suscriptor_id
//   - suscripciones por estado local
//   - suscripciones por preapproval_status_mp
//   - suscripciones por descuento_estado
//   - suscripciones creadas/activadas en rango de fechas
//
// QUÉ NO HACE:
//   - NO modifica suscripciones.
//   - NO consulta Mercado Pago en vivo.
//   - NO cancela suscripciones.
//   - NO reactiva suscripciones.
//   - NO actualiza montos.
//   - NO toca suscriptores.
//   - NO envía WhatsApp.
//   - NO aplica códigos de descuento.
//   - NO procesa pagos.
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
//     "suscriptor_id": 1,
//     "estado": "activa",
//     "preapproval_status_mp": "authorized",
//     "provider": "mercadopago",
//     "preapproval_id": "abc123",
//     "provisional": false,
//     "auto_renovacion_activa": true,
//     "descuento_estado": "aplicado",
//     "solo_con_descuento": false,
//     "fecha_desde": "2026-04-01",
//     "fecha_hasta": "2026-05-01",
//     "limit": 50,
//     "offset": 0,
//     "log": false
//   }
//
// NOTA:
//   Esta función trabaja sobre la tabla local `suscripciones`.
//   No reemplaza sincronización con Mercado Pago.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// 🔐 ENV
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const FUNCION = "ef_admin_listar_suscripciones";
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
function normalizarBooleanOpcional(input) {
  if (typeof input === "boolean") return input;
  return null;
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
// 🧠 DIAGNÓSTICO RÁPIDO DE SUSCRIPCIÓN
// ----------------------------------------------------------------------------
// Agrega señales administrativas por cada suscripción.
// No modifica nada.
// ============================================================================
function diagnosticarSuscripcion(s) {
  const warnings = [];
  const estado = String(s.estado ?? "");
  const preapprovalStatus = String(s.preapproval_status_mp ?? "");
  const autoRenovacion = s.auto_renovacion_activa === true;
  const provisional = s.provisional === true;
  // --------------------------------------------------------------------------
  // Estado local.
  // --------------------------------------------------------------------------
  if (!estado) {
    warnings.push("sin_estado_local");
  }
  if (estado !== "activa" && estado !== "activa_provisional" && estado !== "pendiente_autorizacion") {
    warnings.push("estado_local_no_activo");
  }
  // --------------------------------------------------------------------------
  // Estado de Mercado Pago.
  // --------------------------------------------------------------------------
  if (!preapprovalStatus) {
    warnings.push("sin_preapproval_status_mp");
  }
  if (preapprovalStatus && preapprovalStatus !== "authorized" && preapprovalStatus !== "pending") {
    warnings.push("preapproval_status_mp_no_operativo");
  }
  // --------------------------------------------------------------------------
  // Preapproval.
  // --------------------------------------------------------------------------
  if (!s.preapproval_id) {
    warnings.push("sin_preapproval_id");
  }
  // --------------------------------------------------------------------------
  // Auto renovación.
  // --------------------------------------------------------------------------
  if (!autoRenovacion) {
    warnings.push("auto_renovacion_inactiva");
  }
  // --------------------------------------------------------------------------
  // Provisional.
  // --------------------------------------------------------------------------
  if (provisional) {
    warnings.push("suscripcion_provisional");
  }
  // --------------------------------------------------------------------------
  // Fechas.
  // --------------------------------------------------------------------------
  if (!s.fecha_vencimiento_actual && estado === "activa") {
    warnings.push("activa_sin_fecha_vencimiento_actual");
  }
  if (s.fecha_vencimiento_actual) {
    const vencimiento = new Date(s.fecha_vencimiento_actual);
    const now = new Date();
    if (!Number.isNaN(vencimiento.getTime()) && vencimiento < now) {
      warnings.push("suscripcion_vencida");
    }
  }
  // --------------------------------------------------------------------------
  // Descuentos.
  // --------------------------------------------------------------------------
  if (s.codigo_descuento && !s.descuento_estado) {
    warnings.push("codigo_descuento_sin_estado");
  }
  if (s.descuento_estado === "fallido") {
    warnings.push("descuento_fallido");
  }
  // --------------------------------------------------------------------------
  // Estado resumen.
  // --------------------------------------------------------------------------
  let estado_resumen = "ok";
  let accion_sugerida = "sin_accion";
  if (warnings.includes("descuento_fallido")) {
    estado_resumen = "descuento_fallido";
    accion_sugerida = "revisar_descuento_asociado";
  } else if (warnings.includes("suscripcion_vencida")) {
    estado_resumen = "vencida";
    accion_sugerida = "revisar_renovacion_o_webhook_mp";
  } else if (warnings.includes("preapproval_status_mp_no_operativo")) {
    estado_resumen = "mp_no_operativo";
    accion_sugerida = "revisar_estado_mp";
  } else if (warnings.includes("suscripcion_provisional")) {
    estado_resumen = "provisional";
    accion_sugerida = "revisar_confirmacion_pago";
  } else if (warnings.includes("estado_local_no_activo")) {
    estado_resumen = "local_no_activa";
    accion_sugerida = "revisar_estado_local";
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
    `💳 Suscripciones`,
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
  const suscriptor_id = normalizarId(body.suscriptor_id);
  const estado = normalizarTexto(body.estado);
  const provider = normalizarTexto(body.provider);
  const preapproval_id = normalizarTexto(body.preapproval_id);
  const preapproval_status_mp = normalizarTexto(body.preapproval_status_mp);
  const external_reference = normalizarTexto(body.external_reference);
  const descuento_estado = normalizarTexto(body.descuento_estado);
  const codigo_descuento = normalizarTexto(body.codigo_descuento);
  const provisional = normalizarBooleanOpcional(body.provisional);
  const auto_renovacion_activa = normalizarBooleanOpcional(body.auto_renovacion_activa);
  const solo_con_descuento = normalizarBoolean(body.solo_con_descuento, false);
  const solo_vencidas = normalizarBoolean(body.solo_vencidas, false);
  const fecha_desde = normalizarFecha(body.fecha_desde);
  const fecha_hasta = normalizarFecha(body.fecha_hasta);
  const shouldLog = normalizarBoolean(body.log, false);
  const limit = normalizarLimit(body.limit);
  const offset = normalizarOffset(body.offset);
  // ==========================================================================
  // 4) Validaciones de rango
  // ==========================================================================
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
  let query = supabase.from("suscripciones").select(`
      id,
      suscriptor_id,
      provider,
      preapproval_id,
      external_reference,
      estado,
      provisional,
      auto_renovacion_activa,
      preapproval_status_mp,
      fecha_creacion,
      fecha_activacion_provisional,
      fecha_activacion_definitiva,
      fecha_vencimiento_actual,
      fecha_cancelacion,
      reason,
      currency_id,
      amount,
      frequency,
      frequency_type,
      payer_email,
      payer_id,
      init_point,
      sandbox_init_point,
      back_url,
      codigo_descuento,
      codigo_descuento_id,
      descuento_estado,
      descuento_metadata,
      created_at,
      updated_at
    `, {
    count: "exact"
  });
  // --------------------------------------------------------------------------
  // Filtro por suscriptor.
  // --------------------------------------------------------------------------
  if (suscriptor_id !== null) {
    query = query.eq("suscriptor_id", suscriptor_id);
  }
  // --------------------------------------------------------------------------
  // Filtro por provider.
  // --------------------------------------------------------------------------
  if (provider) {
    query = query.eq("provider", provider);
  }
  // --------------------------------------------------------------------------
  // Filtro por estado local.
  // Ejemplo:
  //   pendiente_autorizacion
  //   activa
  //   activa_provisional
  //   cancelada
  //   finalizada
  // --------------------------------------------------------------------------
  if (estado) {
    query = query.eq("estado", estado);
  }
  // --------------------------------------------------------------------------
  // Filtro por preapproval_id.
  // --------------------------------------------------------------------------
  if (preapproval_id) {
    query = query.eq("preapproval_id", preapproval_id);
  }
  // --------------------------------------------------------------------------
  // Filtro por external_reference.
  // --------------------------------------------------------------------------
  if (external_reference) {
    query = query.eq("external_reference", external_reference);
  }
  // --------------------------------------------------------------------------
  // Filtro por estado Mercado Pago.
  // Ejemplo:
  //   authorized
  //   pending
  //   paused
  //   cancelled
  //   expired
  // --------------------------------------------------------------------------
  if (preapproval_status_mp) {
    query = query.eq("preapproval_status_mp", preapproval_status_mp);
  }
  // --------------------------------------------------------------------------
  // Filtro provisional.
  // --------------------------------------------------------------------------
  if (provisional !== null) {
    query = query.eq("provisional", provisional);
  }
  // --------------------------------------------------------------------------
  // Filtro auto renovación.
  // --------------------------------------------------------------------------
  if (auto_renovacion_activa !== null) {
    query = query.eq("auto_renovacion_activa", auto_renovacion_activa);
  }
  // --------------------------------------------------------------------------
  // Filtro por descuento_estado.
  // --------------------------------------------------------------------------
  if (descuento_estado) {
    query = query.eq("descuento_estado", descuento_estado);
  }
  // --------------------------------------------------------------------------
  // Filtro por codigo_descuento.
  // --------------------------------------------------------------------------
  if (codigo_descuento) {
    query = query.eq("codigo_descuento", codigo_descuento);
  }
  // --------------------------------------------------------------------------
  // Solo con descuento.
  // --------------------------------------------------------------------------
  if (solo_con_descuento) {
    query = query.not("codigo_descuento", "is", null);
  }
  // --------------------------------------------------------------------------
  // Solo vencidas.
  // --------------------------------------------------------------------------
  if (solo_vencidas) {
    query = query.lt("fecha_vencimiento_actual", nowUTCISO());
  }
  // --------------------------------------------------------------------------
  // Rango de fechas sobre created_at.
  // Sirve para listar suscripciones creadas dentro de un período.
  // --------------------------------------------------------------------------
  if (fecha_desde) {
    query = query.gte("created_at", fecha_desde);
  }
  if (fecha_hasta) {
    query = query.lt("created_at", fecha_hasta);
  }
  // --------------------------------------------------------------------------
  // Orden y paginación.
  // --------------------------------------------------------------------------
  query = query.order("created_at", {
    ascending: false,
    nullsFirst: false
  }).range(offset, offset + limit - 1);
  // ==========================================================================
  // 6) Ejecutar query
  // ==========================================================================
  const { data, error, count } = await query;
  if (error) {
    await registrarLog("listar_suscripciones_error", {
      error: error.message,
      filtros: {
        suscriptor_id,
        provider,
        estado,
        preapproval_id,
        external_reference,
        preapproval_status_mp,
        provisional,
        auto_renovacion_activa,
        descuento_estado,
        codigo_descuento,
        solo_con_descuento,
        solo_vencidas,
        fecha_desde,
        fecha_hasta,
        limit,
        offset
      }
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "listar_suscripciones_error",
      error: error.message
    }, 500);
  }
  const suscripcionesRaw = Array.isArray(data) ? data : [];
  // ==========================================================================
  // 7) Enriquecer con diagnóstico administrativo
  // ==========================================================================
  const suscripciones = suscripcionesRaw.map((s)=>({
      ...s,
      diagnostico_admin: diagnosticarSuscripcion(s)
    }));
  // ==========================================================================
  // 8) Conteos dentro de la página
  // ==========================================================================
  const conteo_estado_pagina = suscripciones.reduce((acc, s)=>{
    const key = String(s.estado ?? "sin_estado");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const conteo_preapproval_pagina = suscripciones.reduce((acc, s)=>{
    const key = String(s.preapproval_status_mp ?? "sin_preapproval_status_mp");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const conteo_diagnostico_pagina = suscripciones.reduce((acc, s)=>{
    const key = String(s.diagnostico_admin?.estado_resumen ?? "sin_diagnostico");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const conteo_descuento_pagina = suscripciones.reduce((acc, s)=>{
    const key = String(s.descuento_estado ?? "sin_descuento");
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
  if (suscripciones.some((s)=>s.diagnostico_admin?.warnings?.length > 0)) {
    warnings.push("hay_suscripciones_con_alertas");
  }
  if (suscripciones.some((s)=>s.provisional === true)) {
    warnings.push("hay_suscripciones_provisionales");
  }
  if (suscripciones.some((s)=>s.preapproval_status_mp === "cancelled")) {
    warnings.push("hay_suscripciones_canceladas_en_mp");
  }
  if (suscripciones.some((s)=>s.descuento_estado === "fallido")) {
    warnings.push("hay_descuentos_fallidos");
  }
  // ==========================================================================
  // 10) Resumen textual
  // ==========================================================================
  const filtros = {
    suscriptor_id,
    provider,
    estado,
    preapproval_id,
    external_reference,
    preapproval_status_mp,
    provisional,
    auto_renovacion_activa,
    descuento_estado,
    codigo_descuento,
    solo_con_descuento,
    solo_vencidas,
    fecha_desde,
    fecha_hasta
  };
  const resumenTexto = construirResumenTexto({
    total: count ?? suscripciones.length,
    limit,
    offset,
    filtros
  });
  // ==========================================================================
  // 11) Respuesta
  // ==========================================================================
  const response = {
    ok: true,
    healthy: suscripciones.every((s)=>s.diagnostico_admin?.healthy === true),
    funcion: FUNCION,
    timestamp_utc: tsNow,
    resumen_texto: resumenTexto,
    filtros: {
      ...filtros,
      limit,
      offset
    },
    paginacion: {
      total: count ?? suscripciones.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null
    },
    conteos_pagina: {
      estado: conteo_estado_pagina,
      preapproval_status_mp: conteo_preapproval_pagina,
      diagnostico: conteo_diagnostico_pagina,
      descuento_estado: conteo_descuento_pagina
    },
    suscripciones,
    warnings
  };
  // ==========================================================================
  // 12) Log opcional
  // ==========================================================================
  if (shouldLog) {
    await registrarLog(suscripciones.length === 0 ? "listar_suscripciones_sin_resultados" : "listar_suscripciones_con_resultados", {
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
