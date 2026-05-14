// ============================================================================
// 👥 EDGE FUNCTION: ef_admin_listar_suscriptores
// ============================================================================
//
// MÓDULO:
//   Administración Operativa y Observabilidad
//
// NOMBRE TÉCNICO:
//   ef_admin_listar_suscriptores
//
// OBJETIVO:
//   Listar suscriptores con filtros administrativos útiles.
//
// USO ESPERADO:
//   - Postman.
//   - Futuro panel administrativo.
//   - Soporte interno.
//   - Control operativo diario.
//   - Revisión de usuarios activos, pausados, vencidos o pendientes.
//
// QUÉ PERMITE VER:
//   - suscriptores premium activos
//   - suscriptores no activos
//   - suscriptores con WhatsApp confirmado/no confirmado
//   - suscriptores pausados por usuario
//   - suscriptores por estado_suscripcion
//   - suscriptores por preapproval_status
//   - suscriptores próximos a vencer
//   - suscriptores vencidos
//   - suscriptores por email / WhatsApp / nombre
//
// QUÉ NO HACE:
//   - NO modifica suscriptores.
//   - NO activa premium.
//   - NO pausa usuarios.
//   - NO reactiva mensajes.
//   - NO toca Mercado Pago.
//   - NO envía WhatsApp.
//   - NO genera contenido.
//   - NO reintenta mensajes.
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
//     "premium_activo": true,
//     "whatsapp_confirmado": true,
//     "estado_suscripcion": "activa",
//     "estado_mensaje": "pausado_usuario",
//     "preapproval_status": "authorized",
//     "buscar": "Luis",
//     "vencen_en_dias": 7,
//     "solo_vencidos": false,
//     "limit": 50,
//     "offset": 0,
//     "log": false
//   }
//
// NOTA:
//   Todos los filtros son opcionales.
//   Si no se manda ningún filtro, devuelve los últimos suscriptores creados.
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
const FUNCION = "ef_admin_listar_suscriptores";
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
function normalizarIntegerOpcional(input) {
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
// 📅 HELPERS DE FECHA
// ============================================================================
function hoyUTCDateOnly() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function sumarDiasUTCDateOnly(dias) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  base.setUTCDate(base.getUTCDate() + dias);
  const yyyy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
// 🧾 RESUMEN HUMANO
// ============================================================================
function construirResumenTexto(params) {
  const { total, limit, offset, filtros } = params;
  const filtrosActivos = Object.entries(filtros).filter(([, value])=>value !== null && value !== undefined && value !== "" && value !== false).map(([key, value])=>`${key}: ${String(value)}`);
  return [
    `👥 Suscriptores`,
    ``,
    `Total encontrado: ${total}`,
    `Mostrando: ${limit}`,
    `Offset: ${offset}`,
    ``,
    `Filtros: ${filtrosActivos.length > 0 ? filtrosActivos.join(" | ") : "sin filtros específicos"}`
  ].join("\n");
}
// ============================================================================
// 🧠 DIAGNÓSTICO RÁPIDO POR SUSCRIPTOR
// ----------------------------------------------------------------------------
// Agrega señales útiles por cada fila.
// No cambia nada.
// ============================================================================
function diagnosticarSuscriptor(s) {
  const warnings = [];
  if (s.premium_activo !== true) {
    warnings.push("premium_no_activo");
  }
  if (s.estado_suscripcion !== "activa") {
    warnings.push("estado_suscripcion_no_activa");
  }
  if (s.whatsapp_confirmado !== true) {
    warnings.push("whatsapp_no_confirmado");
  }
  if (s.estado_mensaje === "pausado_usuario") {
    warnings.push("mensajes_pausados_por_usuario");
  }
  if (s.preapproval_status && s.preapproval_status !== "authorized") {
    warnings.push("preapproval_no_authorized");
  }
  if (s.fecha_vencimiento_premium) {
    const hoy = hoyUTCDateOnly();
    if (String(s.fecha_vencimiento_premium) < hoy) {
      warnings.push("premium_vencido");
    }
  }
  const healthy = warnings.length === 0;
  let estado_resumen = "ok";
  if (warnings.includes("premium_vencido")) {
    estado_resumen = "premium_vencido";
  } else if (warnings.includes("mensajes_pausados_por_usuario")) {
    estado_resumen = "mensajes_pausados";
  } else if (warnings.includes("whatsapp_no_confirmado")) {
    estado_resumen = "whatsapp_no_confirmado";
  } else if (warnings.includes("premium_no_activo")) {
    estado_resumen = "premium_no_activo";
  } else if (!healthy) {
    estado_resumen = "requiere_revision";
  }
  return {
    healthy,
    warnings,
    estado_resumen
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
  const premium_activo = normalizarBooleanOpcional(body.premium_activo);
  const whatsapp_confirmado = normalizarBooleanOpcional(body.whatsapp_confirmado);
  const estado_suscripcion = normalizarTexto(body.estado_suscripcion);
  const estado_mensaje = normalizarTexto(body.estado_mensaje);
  const preapproval_status = normalizarTexto(body.preapproval_status);
  const contenido_preferido = normalizarTexto(body.contenido_preferido);
  const signo = normalizarTexto(body.signo);
  const buscar = normalizarTexto(body.buscar);
  const vencen_en_dias = normalizarIntegerOpcional(body.vencen_en_dias);
  const solo_vencidos = normalizarBoolean(body.solo_vencidos, false);
  const shouldLog = normalizarBoolean(body.log, false);
  const limit = normalizarLimit(body.limit);
  const offset = normalizarOffset(body.offset);
  // ==========================================================================
  // 4) Validaciones de filtros
  // ==========================================================================
  if (vencen_en_dias !== null && vencen_en_dias < 0) {
    return jsonResponse({
      ok: false,
      motivo: "vencen_en_dias_invalido",
      mensaje: "vencen_en_dias debe ser mayor o igual a 0."
    }, 400);
  }
  if (solo_vencidos && vencen_en_dias !== null) {
    return jsonResponse({
      ok: false,
      motivo: "filtros_incompatibles",
      mensaje: "No usar solo_vencidos y vencen_en_dias al mismo tiempo."
    }, 400);
  }
  // ==========================================================================
  // 5) Query base
  // ==========================================================================
  let query = supabase.from("suscriptores").select(`
      id,
      nombre,
      email,
      whatsapp,
      telefono,
      signo,
      tipo_suscripcion,
      estado_suscripcion,
      contenido_preferido,
      fecha_alta,
      fecha_inicio_premium,
      fecha_vencimiento_premium,
      fecha_baja,
      motivo_baja,
      origen,
      preapproval_id,
      preapproval_status,
      preapproval_actualizado_en,
      preapproval_init_point,
      mp_payer_email,
      mp_payer_id,
      auto_renovacion_activa,
      premium_activo,
      whatsapp_confirmado,
      fecha_confirmacion_whatsapp,
      primer_envio_premium_enviado,
      fecha_primer_envio_premium,
      bienvenida_enviada,
      estado_mensaje,
      creado_en,
      actualizado_en,
      creado_por
    `, {
    count: "exact"
  });
  // --------------------------------------------------------------------------
  // Filtro premium_activo.
  // --------------------------------------------------------------------------
  if (premium_activo !== null) {
    query = query.eq("premium_activo", premium_activo);
  }
  // --------------------------------------------------------------------------
  // Filtro WhatsApp confirmado.
  // --------------------------------------------------------------------------
  if (whatsapp_confirmado !== null) {
    query = query.eq("whatsapp_confirmado", whatsapp_confirmado);
  }
  // --------------------------------------------------------------------------
  // Filtro estado_suscripcion.
  // Ejemplo:
  //   activa
  //   suspendida
  //   cancelada_no_renueva
  //   finalizada
  // --------------------------------------------------------------------------
  if (estado_suscripcion) {
    query = query.eq("estado_suscripcion", estado_suscripcion);
  }
  // --------------------------------------------------------------------------
  // Filtro estado_mensaje.
  // Ejemplo:
  //   pausado_usuario
  // --------------------------------------------------------------------------
  if (estado_mensaje) {
    query = query.eq("estado_mensaje", estado_mensaje);
  }
  // --------------------------------------------------------------------------
  // Filtro preapproval_status.
  // Ejemplo:
  //   authorized
  //   paused
  //   cancelled
  //   pending
  // --------------------------------------------------------------------------
  if (preapproval_status) {
    query = query.eq("preapproval_status", preapproval_status);
  }
  // --------------------------------------------------------------------------
  // Filtro contenido_preferido.
  // --------------------------------------------------------------------------
  if (contenido_preferido) {
    query = query.eq("contenido_preferido", contenido_preferido);
  }
  // --------------------------------------------------------------------------
  // Filtro signo.
  // --------------------------------------------------------------------------
  if (signo) {
    query = query.eq("signo", signo);
  }
  // --------------------------------------------------------------------------
  // Filtro vencidos.
  // La columna fecha_vencimiento_premium es date.
  // --------------------------------------------------------------------------
  if (solo_vencidos) {
    query = query.lt("fecha_vencimiento_premium", hoyUTCDateOnly());
  }
  // --------------------------------------------------------------------------
  // Filtro próximos a vencer.
  // Incluye desde hoy hasta hoy + N días.
  // --------------------------------------------------------------------------
  if (vencen_en_dias !== null) {
    const hoy = hoyUTCDateOnly();
    const hasta = sumarDiasUTCDateOnly(vencen_en_dias);
    query = query.gte("fecha_vencimiento_premium", hoy).lte("fecha_vencimiento_premium", hasta);
  }
  // --------------------------------------------------------------------------
  // Buscar por texto.
  //
  // Nota:
  // Supabase permite OR simple entre columnas.
  // Usamos ilike para nombre/email/whatsapp/telefono.
  // --------------------------------------------------------------------------
  if (buscar) {
    const term = `%${buscar}%`;
    query = query.or([
      `nombre.ilike.${term}`,
      `email.ilike.${term}`,
      `whatsapp.ilike.${term}`,
      `telefono.ilike.${term}`,
      `preapproval_id.ilike.${term}`
    ].join(","));
  }
  // --------------------------------------------------------------------------
  // Orden y paginación.
  // --------------------------------------------------------------------------
  query = query.order("creado_en", {
    ascending: false,
    nullsFirst: false
  }).range(offset, offset + limit - 1);
  // ==========================================================================
  // 6) Ejecutar query
  // ==========================================================================
  const { data, error, count } = await query;
  if (error) {
    await registrarLog("listar_suscriptores_error", {
      error: error.message,
      filtros: {
        premium_activo,
        whatsapp_confirmado,
        estado_suscripcion,
        estado_mensaje,
        preapproval_status,
        contenido_preferido,
        signo,
        buscar,
        vencen_en_dias,
        solo_vencidos,
        limit,
        offset
      }
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "listar_suscriptores_error",
      error: error.message
    }, 500);
  }
  const suscriptoresRaw = Array.isArray(data) ? data : [];
  // ==========================================================================
  // 7) Enriquecer con diagnóstico rápido
  // ==========================================================================
  const suscriptores = suscriptoresRaw.map((s)=>({
      ...s,
      diagnostico_admin: diagnosticarSuscriptor(s)
    }));
  // ==========================================================================
  // 8) Conteos dentro de la página devuelta
  // ==========================================================================
  const conteo_pagina = suscriptores.reduce((acc, s)=>{
    const key = String(s.diagnostico_admin?.estado_resumen ?? "sin_estado");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const conteo_estado_suscripcion_pagina = suscriptores.reduce((acc, s)=>{
    const key = String(s.estado_suscripcion ?? "sin_estado");
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
  if (suscriptores.some((s)=>s.diagnostico_admin?.warnings?.length > 0)) {
    warnings.push("hay_suscriptores_con_alertas");
  }
  if (suscriptores.some((s)=>s.estado_mensaje === "pausado_usuario")) {
    warnings.push("hay_suscriptores_pausados");
  }
  if (suscriptores.some((s)=>s.whatsapp_confirmado !== true)) {
    warnings.push("hay_suscriptores_sin_whatsapp_confirmado");
  }
  // ==========================================================================
  // 10) Resumen textual
  // ==========================================================================
  const filtros = {
    premium_activo,
    whatsapp_confirmado,
    estado_suscripcion,
    estado_mensaje,
    preapproval_status,
    contenido_preferido,
    signo,
    buscar,
    vencen_en_dias,
    solo_vencidos
  };
  const resumenTexto = construirResumenTexto({
    total: count ?? suscriptores.length,
    limit,
    offset,
    filtros
  });
  // ==========================================================================
  // 11) Respuesta
  // ==========================================================================
  const response = {
    ok: true,
    healthy: suscriptores.every((s)=>s.diagnostico_admin?.healthy === true),
    funcion: FUNCION,
    timestamp_utc: tsNow,
    resumen_texto: resumenTexto,
    filtros: {
      ...filtros,
      limit,
      offset
    },
    paginacion: {
      total: count ?? suscriptores.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null
    },
    conteos_pagina: {
      diagnostico: conteo_pagina,
      estado_suscripcion: conteo_estado_suscripcion_pagina
    },
    suscriptores,
    warnings
  };
  // ==========================================================================
  // 12) Log opcional
  // ==========================================================================
  if (shouldLog) {
    await registrarLog(suscriptores.length === 0 ? "listar_suscriptores_sin_resultados" : "listar_suscriptores_con_resultados", {
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
