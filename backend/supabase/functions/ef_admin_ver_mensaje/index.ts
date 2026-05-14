// ============================================================================
// 🔎 EDGE FUNCTION: ef_admin_ver_mensaje
// ============================================================================
//
// MÓDULO:
//   Administración Operativa y Observabilidad
//
// NOMBRE TÉCNICO:
//   ef_admin_ver_mensaje
//
// OBJETIVO:
//   Consultar el detalle operativo completo de un mensaje específico de la tabla
//   mensajes_enviados.
//
// USO ESPERADO:
//   - Diagnóstico manual desde Postman.
//   - Futuro panel administrativo.
//   - Soporte interno.
//   - Inspección previa antes de llamar a ef_admin_reintentar_mensaje.
//   - Revisión de errores de WhatsApp.
//   - Revisión de variables/template usada.
//   - Revisión de relación mensaje ↔ contenido ↔ suscriptor.
//
// QUÉ PERMITE RESPONDER:
//   - ¿Existe el mensaje?
//   - ¿A qué suscriptor pertenece?
//   - ¿Qué plantilla usó?
//   - ¿A qué WhatsApp iba dirigido?
//   - ¿Qué estado tiene?
//   - ¿Cuántos intentos tiene?
//   - ¿Cuál fue el último error?
//   - ¿Qué metadata tiene?
//   - ¿Tiene contenido premium asociado?
//   - ¿Tiene suscriptor asociado?
//   - ¿El suscriptor está activo o pausado?
//   - ¿El contenido asociado fue enviado?
//   - ¿Es reintentable?
//
// QUÉ NO HACE:
//   - NO modifica mensajes.
//   - NO reintenta mensajes.
//   - NO llama al sender.
//   - NO envía WhatsApp.
//   - NO modifica contenido_premium.
//   - NO modifica suscriptores.
//   - NO toca Mercado Pago.
//
// TIPO:
//   Read-only / diagnóstico puntual.
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//   - Usa SUPABASE_SERVICE_ROLE_KEY.
//   - Función interna.
//
// INPUT:
//   POST body:
//     {
//       "id_mensaje": 22
//     }
//
//   Opcional:
//     {
//       "id_mensaje": 22,
//       "log": true
//     }
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
const FUNCION = "ef_admin_ver_mensaje";
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
// Por defecto esta función NO loguea cada consulta.
// Si se manda log=true, registra la inspección.
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
// 🔁 VALIDAR SI EL MENSAJE ES REINTENTABLE
// ----------------------------------------------------------------------------
// Esta validación NO cambia nada.
// Solo informa al admin si el mensaje es candidato a reintento.
// ============================================================================
function evaluarReintentabilidad(mensaje) {
  const estado = String(mensaje?.estado ?? "");
  if (estado === "fallido") {
    return {
      reintentable: true,
      requiere_forzar: true,
      motivo: "mensaje_fallido",
      recomendacion: "Puede reintentarse con ef_admin_reintentar_mensaje. Revisar primero la causa de ultimo_error."
    };
  }
  if (estado === "fallo_definitivo") {
    return {
      reintentable: true,
      requiere_forzar: true,
      motivo: "mensaje_en_fallo_definitivo",
      recomendacion: "Puede reintentarse solo como acción manual. Revisar causa raíz antes de disparar sender."
    };
  }
  if (estado === "pendiente") {
    return {
      reintentable: true,
      requiere_forzar: false,
      motivo: "mensaje_pendiente",
      recomendacion: "Ya está pendiente. El batch/sender debería procesarlo si corresponde."
    };
  }
  if (estado === "procesando") {
    return {
      reintentable: false,
      requiere_forzar: false,
      motivo: "mensaje_en_procesando",
      recomendacion: "No reintentar mientras está procesando. Puede haber un sender trabajando."
    };
  }
  if (estado === "enviado") {
    return {
      reintentable: false,
      requiere_forzar: false,
      motivo: "mensaje_ya_enviado",
      recomendacion: "No reintentar para evitar duplicados al usuario. Solo reenviar con una herramienta específica y confirmación manual."
    };
  }
  return {
    reintentable: false,
    requiere_forzar: false,
    motivo: "estado_no_reconocido_o_no_reintentable",
    recomendacion: "Revisar estado del mensaje antes de cualquier acción."
  };
}
// ============================================================================
// 🧾 CONSTRUIR RESUMEN HUMANO
// ============================================================================
function construirResumenTexto(params) {
  const { mensaje, suscriptor, contenido, reintento } = params;
  const nombre = suscriptor?.nombre ? `${suscriptor.nombre} (ID ${suscriptor.id})` : mensaje?.id_suscriptor ? `suscriptor ID ${mensaje.id_suscriptor}` : "sin suscriptor asociado";
  const estado = mensaje?.estado ?? "sin estado";
  const tipo = mensaje?.tipo_mensaje ?? "sin tipo";
  const plantilla = mensaje?.nombre_plantilla ?? "sin plantilla";
  const intentos = mensaje?.intentos ?? 0;
  const tieneError = Boolean(mensaje?.ultimo_error);
  const errorTexto = tieneError ? "Tiene último error registrado." : "No tiene último error registrado.";
  const contenidoTexto = contenido ? `Contenido asociado ID ${contenido.id}, estado_envio=${contenido.estado_envio ?? "sin estado"}.` : "No tiene contenido premium asociado.";
  return [
    `🔎 Mensaje ${mensaje.id}`,
    ``,
    `Estado: ${estado}.`,
    `Tipo: ${tipo}.`,
    `Plantilla: ${plantilla}.`,
    `Destino: ${mensaje.whatsapp_destino ?? "sin destino"}.`,
    `Intentos: ${intentos}.`,
    ``,
    `Suscriptor: ${nombre}.`,
    `${contenidoTexto}`,
    `${errorTexto}`,
    ``,
    `Reintento: ${reintento.reintentable ? "posible" : "no recomendado"}.`,
    `Motivo: ${reintento.motivo}.`,
    `Recomendación: ${reintento.recomendacion}`
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
  // 3) Leer body
  // ==========================================================================
  const body = await readBodySafe(req);
  const id_mensaje = normalizarId(body.id_mensaje);
  const shouldLog = body.log === true;
  if (!id_mensaje) {
    return jsonResponse({
      ok: false,
      motivo: "id_mensaje_requerido",
      mensaje: "Enviar id_mensaje numérico."
    }, 400);
  }
  // ==========================================================================
  // 4) Buscar mensaje
  // ==========================================================================
  const { data: mensaje, error: mensajeErr } = await supabase.from("mensajes_enviados").select(`
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
      metadata,
      nombre_plantilla,
      fecha_envio_programada,
      fecha_ultimo_intento
    `).eq("id", id_mensaje).maybeSingle();
  if (mensajeErr) {
    await registrarLog("buscar_mensaje_error", {
      id_mensaje,
      error: mensajeErr.message
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "buscar_mensaje_error",
      error: mensajeErr.message
    }, 500);
  }
  if (!mensaje) {
    if (shouldLog) {
      await registrarLog("mensaje_no_encontrado", {
        id_mensaje
      }, true);
    }
    return jsonResponse({
      ok: true,
      encontrado: false,
      id_mensaje,
      mensaje: "No se encontró mensaje con ese id."
    }, 200);
  }
  // ==========================================================================
  // 5) Consultar suscriptor asociado
  // ==========================================================================
  let suscriptor = null;
  let suscriptorErrMsg = null;
  if (mensaje.id_suscriptor) {
    const { data, error } = await supabase.from("suscriptores").select(`
        id,
        nombre,
        email,
        whatsapp,
        telefono,
        signo,
        estado_suscripcion,
        premium_activo,
        whatsapp_confirmado,
        estado_mensaje,
        fecha_inicio_premium,
        fecha_vencimiento_premium,
        preapproval_id,
        preapproval_status,
        auto_renovacion_activa,
        primer_envio_premium_enviado,
        fecha_primer_envio_premium,
        bienvenida_enviada,
        creado_en,
        actualizado_en
      `).eq("id", mensaje.id_suscriptor).maybeSingle();
    suscriptor = data ?? null;
    suscriptorErrMsg = error?.message ?? null;
  }
  // ==========================================================================
  // 6) Consultar contenido premium asociado
  // ==========================================================================
  let contenido = null;
  let contenidoErrMsg = null;
  if (mensaje.id_contenido) {
    const { data, error } = await supabase.from("contenido_premium").select(`
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
        meta_generacion
      `).eq("id", mensaje.id_contenido).maybeSingle();
    contenido = data ?? null;
    contenidoErrMsg = error?.message ?? null;
  }
  // ==========================================================================
  // 7) Consultar logs relacionados
  // ----------------------------------------------------------------------------
  // Buscamos en log_funciones registros que mencionen id_mensaje.
  //
  // Nota:
  //   En jsonb no siempre es trivial buscar profundo de forma universal.
  //   Para MVP hacemos dos filtros:
  //     - detalle->>id_mensaje
  //     - detalle::text ilike
  //
  // Supabase JS no permite fácilmente cast detalle::text con ilike en todos los
  // casos desde query builder, por eso hacemos una búsqueda simple por función y
  // luego filtramos en memoria sobre últimos registros.
  // ==========================================================================
  const { data: logsRecientesRaw, error: logsErr } = await supabase.from("log_funciones").select(`
      id,
      nombre_funcion,
      fecha_ejecucion,
      resultado,
      detalle,
      exito
    `).in("nombre_funcion", [
    "ef_whatsapp_sender",
    "ef_run_sender_batch",
    "ef_admin_reintentar_mensaje",
    "ef_webhook_whatsapp_events",
    "ef_webhook_whatsapp_status"
  ]).order("fecha_ejecucion", {
    ascending: false
  }).limit(100);
  const logsRelacionados = Array.isArray(logsRecientesRaw) ? logsRecientesRaw.filter((log)=>{
    const detalle = log?.detalle;
    if (!detalle) return false;
    try {
      const text = JSON.stringify(detalle);
      return text.includes(`"id_mensaje":${id_mensaje}`) || text.includes(`"id_mensaje": ${id_mensaje}`) || text.includes(`id_mensaje`) && text.includes(String(id_mensaje));
    } catch  {
      return false;
    }
  }).slice(0, 10) : [];
  // ==========================================================================
  // 8) Evaluar reintentabilidad
  // ==========================================================================
  const reintento = evaluarReintentabilidad(mensaje);
  // ==========================================================================
  // 9) Warnings
  // ==========================================================================
  const warnings = [];
  if (suscriptorErrMsg) warnings.push("error_consultar_suscriptor");
  if (contenidoErrMsg) warnings.push("error_consultar_contenido");
  if (logsErr) warnings.push("error_consultar_logs");
  if (!suscriptor && mensaje.id_suscriptor) {
    warnings.push("mensaje_con_suscriptor_inexistente");
  }
  if (!contenido && mensaje.id_contenido) {
    warnings.push("mensaje_con_contenido_inexistente");
  }
  if (mensaje.estado === "fallido") {
    warnings.push("mensaje_fallido");
  }
  if (mensaje.estado === "fallo_definitivo") {
    warnings.push("mensaje_en_fallo_definitivo");
  }
  if (mensaje.estado === "procesando") {
    warnings.push("mensaje_en_procesando");
  }
  if (mensaje.ultimo_error) {
    warnings.push("mensaje_con_ultimo_error");
  }
  if (suscriptor && suscriptor.premium_activo !== true) {
    warnings.push("suscriptor_no_premium_activo");
  }
  if (suscriptor && suscriptor.estado_mensaje === "pausado_usuario") {
    warnings.push("suscriptor_pausado_por_usuario");
  }
  if (contenido && contenido.estado_envio === "fallido") {
    warnings.push("contenido_asociado_fallido");
  }
  // ==========================================================================
  // 10) Resumen textual
  // ==========================================================================
  const resumenTexto = construirResumenTexto({
    mensaje,
    suscriptor,
    contenido,
    reintento
  });
  // ==========================================================================
  // 11) Estado técnico
  // ==========================================================================
  const okTecnico = !suscriptorErrMsg && !contenidoErrMsg && !logsErr;
  const healthy = okTecnico && mensaje.estado === "enviado" && !mensaje.ultimo_error;
  // ==========================================================================
  // 12) Respuesta
  // ==========================================================================
  const response = {
    ok: okTecnico,
    healthy,
    encontrado: true,
    funcion: FUNCION,
    timestamp_utc: tsNow,
    id_mensaje,
    resumen_texto: resumenTexto,
    mensaje,
    suscriptor,
    contenido_premium: contenido,
    reintento,
    logs_relacionados: logsRelacionados,
    warnings,
    errores_consultas: {
      suscriptor: suscriptorErrMsg,
      contenido: contenidoErrMsg,
      logs: logsErr?.message ?? null
    }
  };
  // ==========================================================================
  // 13) Log opcional
  // ==========================================================================
  if (shouldLog) {
    await registrarLog(healthy ? "ver_mensaje_ok" : "ver_mensaje_warning", {
      id_mensaje,
      estado: mensaje.estado,
      healthy,
      warnings
    }, healthy);
  }
  // ==========================================================================
  // 14) Respuesta final
  // ==========================================================================
  return jsonResponse(response, 200);
});
