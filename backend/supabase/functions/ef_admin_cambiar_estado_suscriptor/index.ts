// ============================================================================
// 🛠️ EDGE FUNCTION: ef_admin_cambiar_estado_suscriptor
// ============================================================================
//
// MÓDULO:
//   Administración Operativa y Observabilidad
//
// NOMBRE TÉCNICO:
//   ef_admin_cambiar_estado_suscriptor
//
// OBJETIVO:
//   Permitir cambios administrativos controlados sobre un suscriptor.
//
// TIPO:
//   Acción administrativa sensible.
//
// IMPORTANTE:
//   Esta función SÍ modifica datos.
//   Por eso:
//     - requiere x-internal-key
//     - exige motivo
//     - exige solicitado_por
//     - usa acciones cerradas
//     - registra auditoría en log_funciones
//     - no permite updates libres
//
// QUÉ PUEDE HACER:
//   - pausar mensajes de un suscriptor
//   - reactivar mensajes de un suscriptor
//   - marcar WhatsApp confirmado
//   - marcar WhatsApp no confirmado
//   - activar premium manualmente
//   - desactivar premium manualmente
//   - actualizar estado_suscripcion
//   - actualizar fecha_vencimiento_premium
//
// QUÉ NO HACE:
//   - NO cancela Mercado Pago.
//   - NO llama a Mercado Pago.
//   - NO crea pagos.
//   - NO modifica suscripciones.
//   - NO envía WhatsApp.
//   - NO genera contenido.
//   - NO encola mensajes.
//   - NO reintenta mensajes.
//
// USO ESPERADO:
//   - Postman.
//   - Futuro panel administrativo.
//   - Soporte interno.
//   - Correcciones manuales excepcionales.
//
// ACCIONES SOPORTADAS:
//   pausar_mensajes
//   reactivar_mensajes
//   confirmar_whatsapp
//   desconfirmar_whatsapp
//   activar_premium_manual
//   desactivar_premium_manual
//   cambiar_estado_suscripcion
//   cambiar_fecha_vencimiento
//
// BODY EJEMPLO:
//   {
//     "id_suscriptor": 1,
//     "accion": "pausar_mensajes",
//     "motivo": "Solicitud manual del usuario por WhatsApp",
//     "solicitado_por": "manuel"
//   }
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
const FUNCION = "ef_admin_cambiar_estado_suscriptor";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// ⚙️ ACCIONES PERMITIDAS
// ============================================================================
const ACCIONES_PERMITIDAS = [
  "pausar_mensajes",
  "reactivar_mensajes",
  "confirmar_whatsapp",
  "desconfirmar_whatsapp",
  "activar_premium_manual",
  "desactivar_premium_manual",
  "cambiar_estado_suscripcion",
  "cambiar_fecha_vencimiento"
];
// ============================================================================
// ⚙️ ESTADOS DE SUSCRIPCIÓN PERMITIDOS
// ----------------------------------------------------------------------------
// Alineado con tu check constraint actual de suscriptores:
//   pendiente_autorizacion
//   activa
//   suspendida
//   cancelada_no_renueva
//   finalizada
// ============================================================================
const ESTADOS_SUSCRIPCION_PERMITIDOS = [
  "pendiente_autorizacion",
  "activa",
  "suspendida",
  "cancelada_no_renueva",
  "finalizada"
];
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
// ============================================================================
// 📅 NORMALIZAR DATE SIMPLE
// ----------------------------------------------------------------------------
// Para fecha_vencimiento_premium, tu columna es DATE.
// Aceptamos "YYYY-MM-DD" únicamente.
// ============================================================================
function normalizarFechaDateOnly(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return value;
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
// 📝 LOGGER
// ----------------------------------------------------------------------------
// Esta función siempre loguea:
//   - intentos inválidos
//   - acciones ejecutadas
//   - errores
//
// Porque modifica datos.
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
// 🔎 OBTENER SUSCRIPTOR
// ============================================================================
async function obtenerSuscriptor(id_suscriptor) {
  const { data, error } = await supabase.from("suscriptores").select(`
      id,
      nombre,
      email,
      whatsapp,
      telefono,
      signo,
      estado_suscripcion,
      estado_mensaje,
      premium_activo,
      whatsapp_confirmado,
      fecha_confirmacion_whatsapp,
      fecha_inicio_premium,
      fecha_vencimiento_premium,
      fecha_baja,
      motivo_baja,
      preapproval_id,
      preapproval_status,
      auto_renovacion_activa,
      primer_envio_premium_enviado,
      fecha_primer_envio_premium,
      bienvenida_enviada,
      notas_internas,
      actualizado_en
    `).eq("id", id_suscriptor).maybeSingle();
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
// 🧾 ARMAR NOTA DE AUDITORÍA
// ----------------------------------------------------------------------------
// Guardamos un rastro en notas_internas sin pisar lo anterior.
// Esto complementa log_funciones.
// ============================================================================
function construirNotasInternas(params) {
  const { notasActuales, accion, motivo, solicitado_por, estadoAnterior } = params;
  const bloque = [
    "",
    "------------------------------------------------------------",
    `[${nowUTCISO()}] Cambio administrativo`,
    `funcion: ${FUNCION}`,
    `accion: ${accion}`,
    `solicitado_por: ${solicitado_por}`,
    `motivo: ${motivo}`,
    `estado_anterior: ${JSON.stringify(estadoAnterior)}`
  ].join("\n");
  return `${notasActuales ?? ""}${bloque}`;
}
// ============================================================================
// 🧠 CONSTRUIR UPDATE SEGÚN ACCIÓN
// ----------------------------------------------------------------------------
// Esta es la parte más sensible.
// No permitimos update libre.
// Cada acción tiene campos exactos permitidos.
//
// ============================================================================
function construirUpdate(params) {
  const { accion, body, suscriptorActual, motivo, solicitado_por } = params;
  const now = nowUTCISO();
  const estadoAnterior = {
    estado_suscripcion: suscriptorActual.estado_suscripcion,
    estado_mensaje: suscriptorActual.estado_mensaje,
    premium_activo: suscriptorActual.premium_activo,
    whatsapp_confirmado: suscriptorActual.whatsapp_confirmado,
    fecha_confirmacion_whatsapp: suscriptorActual.fecha_confirmacion_whatsapp,
    fecha_inicio_premium: suscriptorActual.fecha_inicio_premium,
    fecha_vencimiento_premium: suscriptorActual.fecha_vencimiento_premium,
    fecha_baja: suscriptorActual.fecha_baja,
    motivo_baja: suscriptorActual.motivo_baja
  };
  const notas_internas = construirNotasInternas({
    notasActuales: suscriptorActual.notas_internas,
    accion,
    motivo,
    solicitado_por,
    estadoAnterior
  });
  // ==========================================================================
  // Acción: pausar mensajes
  // --------------------------------------------------------------------------
  // Uso:
  //   cuando el usuario pidió BAJA operativa de mensajes, pero no necesariamente
  //   canceló la suscripción de Mercado Pago.
  //
  // No toca premium_activo.
  // No toca estado_suscripcion.
  // ==========================================================================
  if (accion === "pausar_mensajes") {
    return {
      ok: true,
      update: {
        estado_mensaje: "pausado_usuario",
        fecha_baja: now,
        motivo_baja: motivo,
        actualizado_en: now,
        notas_internas
      }
    };
  }
  // ==========================================================================
  // Acción: reactivar mensajes
  // --------------------------------------------------------------------------
  // Uso:
  //   cuando el usuario envía ALTA/ACTIVAR/VOLVER o soporte reactiva.
  //
  // No activa premium si está vencido o inactivo.
  // Solo reactiva el estado de mensajes.
  // ==========================================================================
  if (accion === "reactivar_mensajes") {
    return {
      ok: true,
      update: {
        estado_mensaje: "activo",
        fecha_baja: null,
        motivo_baja: null,
        actualizado_en: now,
        notas_internas
      }
    };
  }
  // ==========================================================================
  // Acción: confirmar WhatsApp
  // --------------------------------------------------------------------------
  // Uso:
  //   confirmar manualmente que el número corresponde al usuario.
  // ==========================================================================
  if (accion === "confirmar_whatsapp") {
    return {
      ok: true,
      update: {
        whatsapp_confirmado: true,
        fecha_confirmacion_whatsapp: now,
        actualizado_en: now,
        notas_internas
      }
    };
  }
  // ==========================================================================
  // Acción: desconfirmar WhatsApp
  // --------------------------------------------------------------------------
  // Uso:
  //   revertir confirmación por error o cambio de número.
  // ==========================================================================
  if (accion === "desconfirmar_whatsapp") {
    return {
      ok: true,
      update: {
        whatsapp_confirmado: false,
        fecha_confirmacion_whatsapp: null,
        actualizado_en: now,
        notas_internas
      }
    };
  }
  // ==========================================================================
  // Acción: activar premium manual
  // --------------------------------------------------------------------------
  // Uso excepcional:
  //   corrección manual, cortesía, prueba, ajuste de soporte.
  //
  // No crea suscripción en Mercado Pago.
  // No genera pago.
  // No envía bienvenida.
  //
  // Puede recibir:
  //   fecha_vencimiento_premium: "YYYY-MM-DD"
  // ==========================================================================
  if (accion === "activar_premium_manual") {
    const fechaVencimiento = normalizarFechaDateOnly(body.fecha_vencimiento_premium);
    if (!fechaVencimiento) {
      return {
        ok: false,
        motivo: "fecha_vencimiento_premium_requerida",
        mensaje: "Para activar premium manualmente enviar fecha_vencimiento_premium en formato YYYY-MM-DD."
      };
    }
    const hoy = new Date();
    const yyyy = hoy.getUTCFullYear();
    const mm = String(hoy.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(hoy.getUTCDate()).padStart(2, "0");
    const fechaInicio = `${yyyy}-${mm}-${dd}`;
    return {
      ok: true,
      update: {
        premium_activo: true,
        estado_suscripcion: "activa",
        fecha_inicio_premium: suscriptorActual.fecha_inicio_premium ?? fechaInicio,
        fecha_vencimiento_premium: fechaVencimiento,
        actualizado_en: now,
        notas_internas
      }
    };
  }
  // ==========================================================================
  // Acción: desactivar premium manual
  // --------------------------------------------------------------------------
  // Uso excepcional:
  //   baja administrativa, reversa, fin de cortesía.
  //
  // No cancela Mercado Pago.
  // Si hay preapproval activa real, debe resolverse por flujo MP aparte.
  // ==========================================================================
  if (accion === "desactivar_premium_manual") {
    return {
      ok: true,
      update: {
        premium_activo: false,
        estado_suscripcion: "suspendida",
        actualizado_en: now,
        notas_internas
      }
    };
  }
  // ==========================================================================
  // Acción: cambiar estado_suscripcion
  // --------------------------------------------------------------------------
  // Uso:
  //   corrección local controlada.
  //
  // Requiere:
  //   nuevo_estado_suscripcion
  // ==========================================================================
  if (accion === "cambiar_estado_suscripcion") {
    const nuevoEstado = normalizarTexto(body.nuevo_estado_suscripcion);
    if (!nuevoEstado || !ESTADOS_SUSCRIPCION_PERMITIDOS.includes(nuevoEstado)) {
      return {
        ok: false,
        motivo: "nuevo_estado_suscripcion_invalido",
        mensaje: `nuevo_estado_suscripcion debe ser uno de: ${ESTADOS_SUSCRIPCION_PERMITIDOS.join(", ")}`
      };
    }
    return {
      ok: true,
      update: {
        estado_suscripcion: nuevoEstado,
        actualizado_en: now,
        notas_internas
      }
    };
  }
  // ==========================================================================
  // Acción: cambiar fecha_vencimiento
  // --------------------------------------------------------------------------
  // Uso:
  //   ajustar vencimiento local.
  //
  // Requiere:
  //   fecha_vencimiento_premium: "YYYY-MM-DD"
  // ==========================================================================
  if (accion === "cambiar_fecha_vencimiento") {
    const fechaVencimiento = normalizarFechaDateOnly(body.fecha_vencimiento_premium);
    if (!fechaVencimiento) {
      return {
        ok: false,
        motivo: "fecha_vencimiento_premium_invalida",
        mensaje: "Enviar fecha_vencimiento_premium en formato YYYY-MM-DD."
      };
    }
    return {
      ok: true,
      update: {
        fecha_vencimiento_premium: fechaVencimiento,
        actualizado_en: now,
        notas_internas
      }
    };
  }
  return {
    ok: false,
    motivo: "accion_no_soportada",
    mensaje: "La acción enviada no está soportada."
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
  // 3) Body
  // ==========================================================================
  const body = await readBodySafe(req);
  const id_suscriptor = normalizarId(body.id_suscriptor);
  const accion = normalizarTexto(body.accion);
  const motivo = normalizarTexto(body.motivo);
  const solicitado_por = normalizarTexto(body.solicitado_por);
  // --------------------------------------------------------------------------
  // dry_run:
  //   si true, calcula lo que haría pero NO actualiza.
  //
  // Muy útil para pruebas.
  // --------------------------------------------------------------------------
  const dry_run = normalizarBoolean(body.dry_run, false);
  // ==========================================================================
  // 4) Validaciones mínimas
  // ==========================================================================
  if (!id_suscriptor) {
    return jsonResponse({
      ok: false,
      motivo: "id_suscriptor_requerido",
      mensaje: "Enviar id_suscriptor numérico."
    }, 400);
  }
  if (!accion) {
    return jsonResponse({
      ok: false,
      motivo: "accion_requerida",
      mensaje: `Enviar accion. Acciones permitidas: ${ACCIONES_PERMITIDAS.join(", ")}`
    }, 400);
  }
  if (!ACCIONES_PERMITIDAS.includes(accion)) {
    return jsonResponse({
      ok: false,
      motivo: "accion_invalida",
      accion,
      acciones_permitidas: ACCIONES_PERMITIDAS
    }, 400);
  }
  if (!motivo) {
    return jsonResponse({
      ok: false,
      motivo: "motivo_requerido",
      mensaje: "Enviar motivo. Esta función modifica datos y requiere justificación."
    }, 400);
  }
  if (!solicitado_por) {
    return jsonResponse({
      ok: false,
      motivo: "solicitado_por_requerido",
      mensaje: "Enviar solicitado_por para auditoría."
    }, 400);
  }
  // ==========================================================================
  // 5) Obtener suscriptor actual
  // ==========================================================================
  const suscriptorRes = await obtenerSuscriptor(id_suscriptor);
  if (!suscriptorRes.ok) {
    await registrarLog("obtener_suscriptor_error", {
      id_suscriptor,
      accion,
      error: suscriptorRes.error
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "obtener_suscriptor_error",
      error: suscriptorRes.error
    }, 500);
  }
  if (!suscriptorRes.data) {
    await registrarLog("suscriptor_no_encontrado", {
      id_suscriptor,
      accion,
      solicitado_por
    }, true);
    return jsonResponse({
      ok: false,
      motivo: "suscriptor_no_encontrado",
      id_suscriptor
    }, 404);
  }
  const suscriptorActual = suscriptorRes.data;
  // ==========================================================================
  // 6) Construir update controlado
  // ==========================================================================
  const updateRes = construirUpdate({
    accion,
    body,
    suscriptorActual,
    motivo,
    solicitado_por
  });
  if (!updateRes.ok) {
    await registrarLog("update_no_construido", {
      id_suscriptor,
      accion,
      motivo: updateRes.motivo,
      mensaje: updateRes.mensaje,
      solicitado_por
    }, false);
    return jsonResponse({
      ok: false,
      motivo: updateRes.motivo,
      mensaje: updateRes.mensaje
    }, 400);
  }
  const updatePayload = updateRes.update;
  // ==========================================================================
  // 7) Dry run
  // ==========================================================================
  if (dry_run) {
    await registrarLog("dry_run_cambio_estado_suscriptor", {
      id_suscriptor,
      accion,
      solicitado_por,
      motivo,
      updatePayload,
      estado_actual: suscriptorActual
    }, true);
    return jsonResponse({
      ok: true,
      dry_run: true,
      accion,
      id_suscriptor,
      mensaje: "Dry run ejecutado. No se modificó la base.",
      estado_actual: suscriptorActual,
      update_preview: updatePayload
    }, 200);
  }
  // ==========================================================================
  // 8) Ejecutar update
  // ==========================================================================
  const { data: suscriptorActualizado, error: updateErr } = await supabase.from("suscriptores").update(updatePayload).eq("id", id_suscriptor).select(`
      id,
      nombre,
      email,
      whatsapp,
      estado_suscripcion,
      estado_mensaje,
      premium_activo,
      whatsapp_confirmado,
      fecha_confirmacion_whatsapp,
      fecha_inicio_premium,
      fecha_vencimiento_premium,
      fecha_baja,
      motivo_baja,
      preapproval_id,
      preapproval_status,
      auto_renovacion_activa,
      notas_internas,
      actualizado_en
    `).maybeSingle();
  if (updateErr) {
    await registrarLog("cambio_estado_suscriptor_error", {
      id_suscriptor,
      accion,
      solicitado_por,
      motivo,
      error: updateErr.message,
      updatePayload
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "cambio_estado_suscriptor_error",
      error: updateErr.message
    }, 500);
  }
  // ==========================================================================
  // 9) Log final OK
  // ==========================================================================
  await registrarLog("cambio_estado_suscriptor_ok", {
    id_suscriptor,
    accion,
    solicitado_por,
    motivo,
    estado_anterior: {
      estado_suscripcion: suscriptorActual.estado_suscripcion,
      estado_mensaje: suscriptorActual.estado_mensaje,
      premium_activo: suscriptorActual.premium_activo,
      whatsapp_confirmado: suscriptorActual.whatsapp_confirmado,
      fecha_confirmacion_whatsapp: suscriptorActual.fecha_confirmacion_whatsapp,
      fecha_inicio_premium: suscriptorActual.fecha_inicio_premium,
      fecha_vencimiento_premium: suscriptorActual.fecha_vencimiento_premium,
      fecha_baja: suscriptorActual.fecha_baja,
      motivo_baja: suscriptorActual.motivo_baja
    },
    estado_nuevo: {
      estado_suscripcion: suscriptorActualizado?.estado_suscripcion,
      estado_mensaje: suscriptorActualizado?.estado_mensaje,
      premium_activo: suscriptorActualizado?.premium_activo,
      whatsapp_confirmado: suscriptorActualizado?.whatsapp_confirmado,
      fecha_confirmacion_whatsapp: suscriptorActualizado?.fecha_confirmacion_whatsapp,
      fecha_inicio_premium: suscriptorActualizado?.fecha_inicio_premium,
      fecha_vencimiento_premium: suscriptorActualizado?.fecha_vencimiento_premium,
      fecha_baja: suscriptorActualizado?.fecha_baja,
      motivo_baja: suscriptorActualizado?.motivo_baja
    }
  }, true);
  // ==========================================================================
  // 10) Respuesta final
  // ==========================================================================
  return jsonResponse({
    ok: true,
    accion,
    id_suscriptor,
    mensaje: "Cambio administrativo aplicado correctamente.",
    suscriptor_anterior: suscriptorActual,
    suscriptor_actualizado: suscriptorActualizado
  }, 200);
});
