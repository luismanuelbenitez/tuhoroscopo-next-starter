// ============================================================================
// 🔁 EDGE FUNCTION: ef_admin_reintentar_mensaje
// ============================================================================
//
// MÓDULO:
//   Administración Operativa y Observabilidad
//
// NOMBRE TÉCNICO:
//   ef_admin_reintentar_mensaje
//
// OBJETIVO:
//   Permitir que administración/soporte reprograme manualmente un mensaje
//   fallido o en fallo definitivo para que vuelva a ser enviado.
//
// USO ESPERADO:
//   - Postman.
//   - Futuro panel administrativo.
//   - Soporte interno.
//   - Operación manual luego de corregir una causa raíz.
//     Ejemplo:
//       - token de WhatsApp corregido
//       - plantilla corregida
//       - variable corregida
//       - error temporal resuelto
//
// QUÉ HACE:
//   1) Recibe id_mensaje.
//   2) Busca el mensaje en mensajes_enviados.
//   3) Valida que el estado sea reintentable.
//   4) Limpia ultimo_error.
//   5) Limpia reintentar_despues.
//   6) Deja estado = pendiente.
//   7) Agrega metadata de auditoría del reintento manual.
//   8) Opcionalmente llama a ef_whatsapp_sender con forzar_reintento = true.
//
// QUÉ NO HACE:
//   - NO corrige el contenido.
//   - NO corrige variables.
//   - NO cambia plantilla.
//   - NO cambia WhatsApp destino.
//   - NO modifica suscriptor.
//   - NO modifica contenido_premium directamente.
//   - NO genera contenido.
//   - NO toca Mercado Pago.
//
// IMPORTANTE:
//   Esta función NO debe incrementar intentos.
//   El incremento de intentos debe hacerlo ef_whatsapp_sender cuando realmente
//   intenta enviar.
//
// ESTADOS SOPORTADOS:
//   - fallido
//   - fallo_definitivo
//   - pendiente
//
// ESTADOS NO SOPORTADOS POR DEFECTO:
//   - enviado
//   - procesando
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//   - Usa SUPABASE_SERVICE_ROLE_KEY.
//   - Función interna.
//
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// 🔐 ENV
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const FUNCION = "ef_admin_reintentar_mensaje";
// Nombre técnico de tu sender.
// Si tu función tiene otro nombre, cambiá este valor.
const SENDER_FUNCTION_NAME = "ef_whatsapp_sender";
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
function normalizarBoolean(input, defaultValue = false) {
  if (typeof input === "boolean") return input;
  return defaultValue;
}
function normalizarTexto(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value : null;
}
// ============================================================================
// 📝 LOGGER
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
// 📤 DISPARAR SENDER
// ----------------------------------------------------------------------------
// Llama a ef_whatsapp_sender para procesar inmediatamente el mensaje.
//
// IMPORTANTE:
// - Si tus funciones están con verify_jwt = true, Supabase exige Authorization.
// - Por eso agregamos Authorization Bearer SUPABASE_ANON_KEY si existe.
// - Si tu sender está con verify_jwt = false, igual no molesta si acepta header.
// - El x-internal-key sigue siendo el control interno de negocio.
//
// Body esperado por sender:
//   {
//     "id_mensaje": 123,
//     "forzar_reintento": true
//   }
//
// ============================================================================
async function dispararSender(params) {
  const { id_mensaje, forzar_reintento } = params;
  const url = `${SUPABASE_URL}/functions/v1/${SENDER_FUNCTION_NAME}`;
  const headers = {
    "Content-Type": "application/json",
    "x-internal-key": WHATSAPP_INTERNAL_KEY
  };
  // --------------------------------------------------------------------------
  // Authorization opcional.
  // Si tu proyecto requiere JWT para invocar Edge Functions, esto es necesario.
  // Si no lo requiere, no afecta negativamente.
  // --------------------------------------------------------------------------
  if (SUPABASE_ANON_KEY) {
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id_mensaje,
        forzar_reintento
      })
    });
    let responseBody = null;
    try {
      responseBody = await resp.json();
    } catch  {
      responseBody = await resp.text();
    }
    return {
      ok: resp.ok,
      http_status: resp.status,
      body: responseBody,
      error: resp.ok ? null : `sender_http_${resp.status}`
    };
  } catch (e) {
    return {
      ok: false,
      http_status: null,
      body: null,
      error: String(e)
    };
  }
}
// ============================================================================
// 🔎 OBTENER MENSAJE
// ============================================================================
async function obtenerMensaje(id_mensaje) {
  const { data, error } = await supabase.from("mensajes_enviados").select(`
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
  if (error) {
    return {
      ok: false,
      error: error.message
    };
  }
  return {
    ok: true,
    data
  };
}
// ============================================================================
// ✅ VALIDAR SI EL MENSAJE ES REINTENTABLE
// ============================================================================
function validarReintento(params) {
  const { mensaje, permitir_reenviar_enviado } = params;
  const estado = String(mensaje?.estado ?? "");
  // --------------------------------------------------------------------------
  // No tocar mensajes en proceso.
  // Podría haber un sender trabajando.
  // --------------------------------------------------------------------------
  if (estado === "procesando") {
    return {
      ok: false,
      motivo: "mensaje_en_procesando_no_reintentable"
    };
  }
  // --------------------------------------------------------------------------
  // No reenviar enviados por defecto.
  // Esto evita duplicados reales al usuario.
  // --------------------------------------------------------------------------
  if (estado === "enviado" && !permitir_reenviar_enviado) {
    return {
      ok: false,
      motivo: "mensaje_ya_enviado"
    };
  }
  // --------------------------------------------------------------------------
  // Estados naturalmente reintentables.
  // --------------------------------------------------------------------------
  if (estado === "fallido" || estado === "fallo_definitivo" || estado === "pendiente") {
    return {
      ok: true
    };
  }
  // --------------------------------------------------------------------------
  // Enviado solo si el admin lo permite explícitamente.
  // Aun así es delicado.
  // --------------------------------------------------------------------------
  if (estado === "enviado" && permitir_reenviar_enviado) {
    return {
      ok: true
    };
  }
  return {
    ok: false,
    motivo: "estado_no_reintentable"
  };
}
// ============================================================================
// 🧾 ARMAR METADATA DE REINTENTO
// ----------------------------------------------------------------------------
// Conserva metadata previa y agrega auditoría.
// ============================================================================
function construirMetadataReintento(params) {
  const { metadataActual, motivo, solicitado_por, estado_anterior, intentos_anteriores } = params;
  const base = metadataActual && typeof metadataActual === "object" && !Array.isArray(metadataActual) ? metadataActual : {};
  const historialRaw = base.admin_reintentos;
  const historial = Array.isArray(historialRaw) ? historialRaw : [];
  return {
    ...base,
    admin_reintento_actual: {
      fecha: nowUTCISO(),
      solicitado_por,
      motivo,
      estado_anterior,
      intentos_anteriores,
      funcion: FUNCION
    },
    admin_reintentos: [
      ...historial,
      {
        fecha: nowUTCISO(),
        solicitado_por,
        motivo,
        estado_anterior,
        intentos_anteriores,
        funcion: FUNCION
      }
    ]
  };
}
// ============================================================================
// 🔁 PREPARAR MENSAJE PARA REINTENTO
// ----------------------------------------------------------------------------
// Esta función deja el mensaje listo para que el sender lo tome.
//
// Importante:
// - NO incrementa intentos.
// - NO marca enviado.
// - NO llama a WhatsApp.
// - Solo prepara estado operativo.
//
// ============================================================================
async function prepararMensajeParaReintento(params) {
  const { mensaje, motivo, solicitado_por } = params;
  const metadata = construirMetadataReintento({
    metadataActual: mensaje.metadata,
    motivo,
    solicitado_por,
    estado_anterior: String(mensaje.estado ?? ""),
    intentos_anteriores: typeof mensaje.intentos === "number" ? mensaje.intentos : null
  });
  const { data, error } = await supabase.from("mensajes_enviados").update({
    estado: "pendiente",
    // El resultado previo ya no representa el próximo intento.
    resultado_envio: null,
    // Limpiamos error para que el nuevo intento tenga su propio resultado.
    ultimo_error: null,
    // Limpiamos planificación de reintento.
    reintentar_despues: null,
    // Limpiamos tracking del intento previo.
    fecha_ultimo_intento: null,
    // Conservamos mensaje_id_whatsapp anterior.
    // No lo borro para no perder trazabilidad histórica.
    // Si preferís limpiarlo, se puede hacer, pero yo lo dejaría.
    metadata
  }).eq("id", mensaje.id).select(`
      id,
      estado,
      intentos,
      ultimo_error,
      reintentar_despues,
      fecha_ultimo_intento,
      metadata
    `).maybeSingle();
  if (error) {
    return {
      ok: false,
      error: error.message
    };
  }
  return {
    ok: true,
    data
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
    await registrarLog("unauthorized", {
      tsNow,
      reason: "x-internal-key inválido"
    }, false);
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
  // 3) Leer body
  // ==========================================================================
  const body = await readBodySafe(req);
  const id_mensaje = normalizarId(body.id_mensaje);
  // --------------------------------------------------------------------------
  // Si true, además de dejar el mensaje pendiente llama inmediatamente
  // a ef_whatsapp_sender.
  //
  // Recomendación:
  // - Para primera prueba usar false.
  // - Luego usar true cuando confíes en el flujo.
  // --------------------------------------------------------------------------
  const disparar_sender = normalizarBoolean(body.disparar_sender, false);
  // --------------------------------------------------------------------------
  // Permitir reenviar mensajes ya enviados.
  // Default false para evitar duplicados accidentales.
  // --------------------------------------------------------------------------
  const permitir_reenviar_enviado = normalizarBoolean(body.permitir_reenviar_enviado, false);
  const motivo = normalizarTexto(body.motivo);
  const solicitado_por = normalizarTexto(body.solicitado_por) ?? "admin";
  // ==========================================================================
  // 4) Validar input
  // ==========================================================================
  if (!id_mensaje) {
    return jsonResponse({
      ok: false,
      motivo: "id_mensaje_requerido",
      mensaje: "Enviar id_mensaje numérico."
    }, 400);
  }
  // ==========================================================================
  // 5) Obtener mensaje
  // ==========================================================================
  const msgRes = await obtenerMensaje(id_mensaje);
  if (!msgRes.ok) {
    await registrarLog("obtener_mensaje_error", {
      id_mensaje,
      error: msgRes.error
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "obtener_mensaje_error",
      error: msgRes.error
    }, 500);
  }
  if (!msgRes.data) {
    return jsonResponse({
      ok: false,
      motivo: "mensaje_no_encontrado",
      id_mensaje
    }, 404);
  }
  const mensaje = msgRes.data;
  // ==========================================================================
  // 6) Validar estado reintentable
  // ==========================================================================
  const validacion = validarReintento({
    mensaje,
    permitir_reenviar_enviado
  });
  if (!validacion.ok) {
    await registrarLog("mensaje_no_reintentable", {
      id_mensaje,
      estado: mensaje.estado,
      motivo: validacion.motivo,
      permitir_reenviar_enviado
    }, true);
    return jsonResponse({
      ok: false,
      motivo: validacion.motivo,
      id_mensaje,
      estado_actual: mensaje.estado
    }, 200);
  }
  // ==========================================================================
  // 7) Preparar mensaje para reintento
  // ==========================================================================
  const prep = await prepararMensajeParaReintento({
    mensaje,
    motivo,
    solicitado_por
  });
  if (!prep.ok) {
    await registrarLog("preparar_reintento_error", {
      id_mensaje,
      error: prep.error,
      estado_anterior: mensaje.estado
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "preparar_reintento_error",
      error: prep.error
    }, 500);
  }
  // ==========================================================================
  // 8) Opcional: disparar sender inmediatamente
  // ==========================================================================
  let senderResult = {
    ejecutado: false,
    ok: null,
    http_status: null,
    body: null,
    error: null
  };
  if (disparar_sender) {
    const sender = await dispararSender({
      id_mensaje,
      forzar_reintento: true
    });
    senderResult = {
      ejecutado: true,
      ok: sender.ok,
      http_status: sender.http_status,
      body: sender.body,
      error: sender.error
    };
  }
  // ==========================================================================
  // 9) Log operativo
  // ==========================================================================
  await registrarLog(disparar_sender ? "mensaje_preparado_y_sender_disparado" : "mensaje_preparado_para_reintento", {
    id_mensaje,
    estado_anterior: mensaje.estado,
    estado_nuevo: "pendiente",
    intentos_anteriores: mensaje.intentos,
    disparar_sender,
    sender: senderResult,
    motivo,
    solicitado_por
  }, senderResult.ejecutado ? senderResult.ok === true : true);
  // ==========================================================================
  // 10) Respuesta final
  // ==========================================================================
  return jsonResponse({
    ok: senderResult.ejecutado ? senderResult.ok === true : true,
    accion: disparar_sender ? "mensaje_preparado_y_sender_disparado" : "mensaje_preparado_para_reintento",
    id_mensaje,
    estado_anterior: mensaje.estado,
    estado_nuevo: "pendiente",
    intentos_actuales: mensaje.intentos,
    disparar_sender,
    sender: senderResult,
    mensaje_actualizado: prep.data
  }, 200);
});
