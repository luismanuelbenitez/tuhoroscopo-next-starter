// ============================================================================
// 👤 EDGE FUNCTION: ef_admin_ver_estado_suscriptor
// ============================================================================
//
// MÓDULO:
//   Administración Operativa y Observabilidad
//
// NOMBRE TÉCNICO:
//   ef_admin_ver_estado_suscriptor
//
// OBJETIVO:
//   Consultar en una sola llamada el estado operativo completo de un suscriptor.
//
// USO ESPERADO:
//   - Diagnóstico manual desde Postman.
//   - Futuro panel administrativo.
//   - Soporte interno.
//   - Revisión rápida de casos puntuales.
//
// QUÉ PERMITE RESPONDER:
//   - ¿El suscriptor existe?
//   - ¿Está premium activo?
//   - ¿Tiene WhatsApp confirmado?
//   - ¿Tiene mensajes activos o pausados?
//   - ¿Cuál es su estado de suscripción?
//   - ¿Qué preapproval_id tiene?
//   - ¿Cuál es su suscripción actual?
//   - ¿Tiene mensajes pendientes?
//   - ¿Tiene mensajes fallidos?
//   - ¿Cuál fue su último mensaje enviado?
//   - ¿Cuál fue su último contenido premium?
//   - ¿Tiene contenido pendiente de envío?
//   - ¿Qué pagos recientes tiene?
//
// QUÉ NO HACE:
//   - NO modifica suscriptores.
//   - NO modifica suscripciones.
//   - NO reintenta mensajes.
//   - NO envía WhatsApp.
//   - NO genera contenido.
//   - NO toca Mercado Pago.
//   - NO corrige datos automáticamente.
//
// TIPO:
//   Read-only / diagnóstico individual.
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//   - Usa SUPABASE_SERVICE_ROLE_KEY.
//   - Función interna.
//
// FORMAS DE BÚSQUEDA:
//   POST body:
//     {
//       "id_suscriptor": 1
//     }
//
//     {
//       "whatsapp": "+59899863263"
//     }
//
//     {
//       "email": "usuario@email.com"
//     }
//
//     {
//       "preapproval_id": "2c938084..."
//     }
//
// PRIORIDAD DE BÚSQUEDA:
//   1) id_suscriptor
//   2) whatsapp
//   3) email
//   4) preapproval_id
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
const FUNCION = "ef_admin_ver_estado_suscriptor";
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
function normalizarEmail(input) {
  const value = normalizarTexto(input);
  return value ? value.toLowerCase() : null;
}
function normalizarId(input) {
  if (typeof input === "number" && Number.isInteger(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const n = Number(input);
    if (Number.isInteger(n)) return n;
  }
  return null;
}
// ============================================================================
// 📝 LOGGER OPCIONAL
// ----------------------------------------------------------------------------
// Por defecto esta función NO escribe log.
// Si se llama con log=true, registra la consulta.
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
// 🔎 BUSCAR SUSCRIPTOR
// ----------------------------------------------------------------------------
// Busca el suscriptor según prioridad:
//   1) id_suscriptor
//   2) whatsapp
//   3) email
//   4) preapproval_id
//
// Devuelve:
//   - criterio usado
//   - suscriptor encontrado
//   - error si hubo problema técnico
// ============================================================================
async function buscarSuscriptor(params) {
  const { id_suscriptor, whatsapp, email, preapproval_id } = params;
  const selectFields = `
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
  `;
  // --------------------------------------------------------------------------
  // 1) Buscar por id_suscriptor
  // --------------------------------------------------------------------------
  if (id_suscriptor !== null) {
    const { data, error } = await supabase.from("suscriptores").select(selectFields).eq("id", id_suscriptor).maybeSingle();
    if (error) {
      return {
        ok: false,
        criterio: "id_suscriptor",
        error: error.message
      };
    }
    return {
      ok: true,
      criterio: "id_suscriptor",
      data
    };
  }
  // --------------------------------------------------------------------------
  // 2) Buscar por WhatsApp
  // --------------------------------------------------------------------------
  if (whatsapp) {
    const { data, error } = await supabase.from("suscriptores").select(selectFields).eq("whatsapp", whatsapp).maybeSingle();
    if (error) {
      return {
        ok: false,
        criterio: "whatsapp",
        error: error.message
      };
    }
    return {
      ok: true,
      criterio: "whatsapp",
      data
    };
  }
  // --------------------------------------------------------------------------
  // 3) Buscar por email
  // --------------------------------------------------------------------------
  if (email) {
    const { data, error } = await supabase.from("suscriptores").select(selectFields).eq("email", email).maybeSingle();
    if (error) {
      return {
        ok: false,
        criterio: "email",
        error: error.message
      };
    }
    return {
      ok: true,
      criterio: "email",
      data
    };
  }
  // --------------------------------------------------------------------------
  // 4) Buscar por preapproval_id
  // --------------------------------------------------------------------------
  if (preapproval_id) {
    const { data, error } = await supabase.from("suscriptores").select(selectFields).eq("preapproval_id", preapproval_id).maybeSingle();
    if (error) {
      return {
        ok: false,
        criterio: "preapproval_id",
        error: error.message
      };
    }
    return {
      ok: true,
      criterio: "preapproval_id",
      data
    };
  }
  return {
    ok: true,
    criterio: null,
    data: null
  };
}
// ============================================================================
// 🧾 CONSTRUIR RESUMEN HUMANO
// ----------------------------------------------------------------------------
// Produce una lectura rápida para soporte.
// ============================================================================
function construirResumenTexto(params) {
  const { suscriptor, mensajesPendientes, mensajesFallidos, contenidoPendiente, ultimaSuscripcionEstado } = params;
  const nombre = suscriptor?.nombre ?? `ID ${suscriptor?.id}`;
  const premium = suscriptor?.premium_activo ? "premium activo" : "premium inactivo";
  const estadoSuscripcion = suscriptor?.estado_suscripcion ?? "sin estado";
  const waConfirmado = suscriptor?.whatsapp_confirmado ? "WhatsApp confirmado" : "WhatsApp no confirmado";
  const estadoMensaje = suscriptor?.estado_mensaje === "pausado_usuario" ? "mensajes pausados por usuario" : "mensajes activos";
  const alertas = [];
  if (!suscriptor?.premium_activo) {
    alertas.push("premium no activo");
  }
  if (!suscriptor?.whatsapp_confirmado) {
    alertas.push("WhatsApp no confirmado");
  }
  if (mensajesFallidos > 0) {
    alertas.push(`${mensajesFallidos} mensaje(s) fallido(s)`);
  }
  if (contenidoPendiente > 0) {
    alertas.push(`${contenidoPendiente} contenido(s) pendiente(s)`);
  }
  const alertasTexto = alertas.length > 0 ? `Alertas: ${alertas.join(", ")}.` : "Sin alertas relevantes.";
  return [
    `👤 Estado suscriptor — ${nombre}`,
    ``,
    `Suscripción: ${premium} (${estadoSuscripcion}).`,
    `WhatsApp: ${waConfirmado}.`,
    `Mensajes: ${estadoMensaje}.`,
    `Suscripción MP/local: ${ultimaSuscripcionEstado ?? "sin registro reciente"}.`,
    ``,
    `Outbox: ${mensajesPendientes} pendiente(s), ${mensajesFallidos} fallido(s).`,
    `Contenido pendiente: ${contenidoPendiente}.`,
    ``,
    alertasTexto
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
  // 3) Body / parámetros
  // ==========================================================================
  const body = await readBodySafe(req);
  const id_suscriptor = normalizarId(body.id_suscriptor);
  const whatsapp = normalizarTexto(body.whatsapp);
  const email = normalizarEmail(body.email);
  const preapproval_id = normalizarTexto(body.preapproval_id);
  const shouldLog = body.log === true;
  if (!id_suscriptor && !whatsapp && !email && !preapproval_id) {
    return jsonResponse({
      ok: false,
      motivo: "criterio_busqueda_requerido",
      mensaje: "Enviar id_suscriptor, whatsapp, email o preapproval_id."
    }, 400);
  }
  // ==========================================================================
  // 4) Buscar suscriptor
  // ==========================================================================
  const busqueda = await buscarSuscriptor({
    id_suscriptor,
    whatsapp,
    email,
    preapproval_id
  });
  if (!busqueda.ok) {
    await registrarLog("buscar_suscriptor_error", {
      criterio: busqueda.criterio,
      error: busqueda.error,
      input: {
        id_suscriptor,
        whatsapp,
        email,
        preapproval_id
      }
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "buscar_suscriptor_error",
      criterio: busqueda.criterio,
      error: busqueda.error
    }, 500);
  }
  if (!busqueda.data) {
    if (shouldLog) {
      await registrarLog("suscriptor_no_encontrado", {
        criterio: busqueda.criterio,
        input: {
          id_suscriptor,
          whatsapp,
          email,
          preapproval_id
        }
      }, true);
    }
    return jsonResponse({
      ok: true,
      encontrado: false,
      criterio: busqueda.criterio,
      mensaje: "No se encontró suscriptor con el criterio enviado."
    }, 200);
  }
  const suscriptor = busqueda.data;
  const id = Number(suscriptor.id);
  // ==========================================================================
  // 5) Consultar suscripción más reciente
  // ==========================================================================
  const { data: suscripcionActual, error: suscripcionErr } = await supabase.from("suscripciones").select(`
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
    `).eq("suscriptor_id", id).order("created_at", {
    ascending: false
  }).limit(1).maybeSingle();
  // ==========================================================================
  // 6) Mensajes del suscriptor
  // ==========================================================================
  const { data: ultimosMensajes, error: ultimosMensajesErr } = await supabase.from("mensajes_enviados").select(`
      id,
      fecha_hora,
      whatsapp_destino,
      tipo_mensaje,
      estado,
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
    `).eq("id_suscriptor", id).order("fecha_creado", {
    ascending: false
  }).limit(10);
  const { data: mensajesFallidos, error: mensajesFallidosErr } = await supabase.from("mensajes_enviados").select(`
      id,
      tipo_mensaje,
      estado,
      nombre_plantilla,
      intentos,
      ultimo_error,
      fecha_creado,
      fecha_ultimo_intento
    `).eq("id_suscriptor", id).in("estado", [
    "fallido",
    "fallo_definitivo"
  ]).order("fecha_ultimo_intento", {
    ascending: false,
    nullsFirst: false
  }).limit(10);
  const { count: mensajesPendientesCount, error: mensajesPendientesErr } = await supabase.from("mensajes_enviados").select("*", {
    count: "exact",
    head: true
  }).eq("id_suscriptor", id).eq("estado", "pendiente");
  const { count: mensajesFallidosCount, error: mensajesFallidosCountErr } = await supabase.from("mensajes_enviados").select("*", {
    count: "exact",
    head: true
  }).eq("id_suscriptor", id).in("estado", [
    "fallido",
    "fallo_definitivo"
  ]);
  // ==========================================================================
  // 7) Contenido premium del suscriptor
  // ==========================================================================
  const { data: contenidoReciente, error: contenidoRecienteErr } = await supabase.from("contenido_premium").select(`
      id,
      id_suscriptor,
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
      color,
      contenido_preferido,
      numero,
      origen_generacion,
      meta_generacion
    `).eq("id_suscriptor", id).order("fecha_envio_programada", {
    ascending: false,
    nullsFirst: false
  }).limit(10);
  const { count: contenidoPendienteCount, error: contenidoPendienteErr } = await supabase.from("contenido_premium").select("*", {
    count: "exact",
    head: true
  }).eq("id_suscriptor", id).is("fecha_envio_real", null).in("estado_envio", [
    "pendiente",
    "generado"
  ]);
  // ==========================================================================
  // 8) Pagos recientes
  // ==========================================================================
  const { data: pagosRecientes, error: pagosErr } = await supabase.from("pagos").select(`
      id_pago,
      fecha_pago,
      status,
      amount,
      medio_pago,
      suscriptor_id,
      tipo_pago,
      mp_payment_id,
      provider_event_id,
      currency,
      preapproval_id,
      provider_payment_id,
      procesado,
      created_at
    `).eq("suscriptor_id", id).order("created_at", {
    ascending: false,
    nullsFirst: false
  }).limit(10);
  // ==========================================================================
  // 9) Usos de códigos de descuento del suscriptor
  // ==========================================================================
  const { data: descuentosUsados, error: descuentosErr } = await supabase.from("codigos_descuento_usos").select(`
      id,
      codigo,
      estado_uso,
      preapproval_id,
      payment_id,
      moneda,
      precio_original,
      precio_aplicado,
      valor_descuento_aplicado,
      precio_primera_cuota,
      precio_recurrente_normal,
      dias_gratis_aplicados,
      meses_gratis_aplicados,
      fecha_aplicacion,
      creado_en,
      creado_por
    `).eq("id_suscriptor", id).order("creado_en", {
    ascending: false
  }).limit(10);
  // ==========================================================================
  // 10) Construir warnings
  // ==========================================================================
  const warnings = [];
  if (suscripcionErr) warnings.push("error_consultar_suscripcion");
  if (ultimosMensajesErr) warnings.push("error_consultar_ultimos_mensajes");
  if (mensajesFallidosErr) warnings.push("error_consultar_mensajes_fallidos");
  if (mensajesPendientesErr) warnings.push("error_count_mensajes_pendientes");
  if (mensajesFallidosCountErr) warnings.push("error_count_mensajes_fallidos");
  if (contenidoRecienteErr) warnings.push("error_consultar_contenido_reciente");
  if (contenidoPendienteErr) warnings.push("error_count_contenido_pendiente");
  if (pagosErr) warnings.push("error_consultar_pagos");
  if (descuentosErr) warnings.push("error_consultar_descuentos");
  if (!suscriptor.premium_activo) warnings.push("suscriptor_no_premium_activo");
  if (suscriptor.estado_suscripcion !== "activa") warnings.push("estado_suscripcion_no_activa");
  if (!suscriptor.whatsapp_confirmado) warnings.push("whatsapp_no_confirmado");
  if (suscriptor.estado_mensaje === "pausado_usuario") warnings.push("mensajes_pausados_por_usuario");
  const pendientes = mensajesPendientesCount ?? 0;
  const fallidos = mensajesFallidosCount ?? 0;
  const contenidoPendiente = contenidoPendienteCount ?? 0;
  if (pendientes > 0) warnings.push("suscriptor_con_mensajes_pendientes");
  if (fallidos > 0) warnings.push("suscriptor_con_mensajes_fallidos");
  if (contenidoPendiente > 0) warnings.push("suscriptor_con_contenido_pendiente");
  // ==========================================================================
  // 11) Resumen textual
  // ==========================================================================
  const resumenTexto = construirResumenTexto({
    suscriptor,
    mensajesPendientes: pendientes,
    mensajesFallidos: fallidos,
    contenidoPendiente,
    ultimaSuscripcionEstado: suscripcionActual?.estado ?? null
  });
  // ==========================================================================
  // 12) Estado general de esta consulta
  // ==========================================================================
  const okTecnico = !suscripcionErr && !ultimosMensajesErr && !mensajesFallidosErr && !mensajesPendientesErr && !mensajesFallidosCountErr && !contenidoRecienteErr && !contenidoPendienteErr && !pagosErr && !descuentosErr;
  const healthy = okTecnico && suscriptor.premium_activo === true && suscriptor.estado_suscripcion === "activa" && suscriptor.whatsapp_confirmado === true && suscriptor.estado_mensaje !== "pausado_usuario" && fallidos === 0;
  // ==========================================================================
  // 13) Respuesta
  // ==========================================================================
  const response = {
    ok: okTecnico,
    healthy,
    encontrado: true,
    funcion: FUNCION,
    timestamp_utc: tsNow,
    criterio_busqueda: busqueda.criterio,
    resumen_texto: resumenTexto,
    suscriptor,
    suscripcion_actual: suscripcionActual ?? null,
    diagnostico: {
      premium_activo: suscriptor.premium_activo === true,
      estado_suscripcion: suscriptor.estado_suscripcion,
      whatsapp_confirmado: suscriptor.whatsapp_confirmado === true,
      estado_mensaje: suscriptor.estado_mensaje ?? null,
      mensajes_pendientes: pendientes,
      mensajes_fallidos: fallidos,
      contenido_pendiente: contenidoPendiente
    },
    ultimos_mensajes: ultimosMensajes ?? [],
    mensajes_fallidos: mensajesFallidos ?? [],
    contenido_premium_reciente: contenidoReciente ?? [],
    pagos_recientes: pagosRecientes ?? [],
    descuentos_usados: descuentosUsados ?? [],
    warnings,
    errores_consultas: {
      suscripcion: suscripcionErr?.message ?? null,
      ultimosMensajes: ultimosMensajesErr?.message ?? null,
      mensajesFallidos: mensajesFallidosErr?.message ?? null,
      mensajesPendientesCount: mensajesPendientesErr?.message ?? null,
      mensajesFallidosCount: mensajesFallidosCountErr?.message ?? null,
      contenidoReciente: contenidoRecienteErr?.message ?? null,
      contenidoPendienteCount: contenidoPendienteErr?.message ?? null,
      pagos: pagosErr?.message ?? null,
      descuentos: descuentosErr?.message ?? null
    }
  };
  // ==========================================================================
  // 14) Log opcional
  // ==========================================================================
  if (shouldLog) {
    await registrarLog(healthy ? "estado_suscriptor_ok" : "estado_suscriptor_warning", {
      id_suscriptor: id,
      criterio: busqueda.criterio,
      healthy,
      warnings,
      diagnostico: response.diagnostico
    }, healthy);
  }
  // ==========================================================================
  // 15) Respuesta final
  // ==========================================================================
  return jsonResponse(response, 200);
});
