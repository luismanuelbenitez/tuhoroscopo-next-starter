// ============================================================================
// 🩺 EDGE FUNCTION: ef_healthcheck_thc
// ============================================================================
//
// NOMBRE:
//   ef_healthcheck_thc
//
// OBJETIVO:
//   Entregar un resumen operativo rápido del estado actual del sistema
//   Tu Horóscopo Cósmico.
//
// TIPO:
//   Healthcheck interno / diagnóstico operativo.
//
// QUÉ HACE:
//   - Cuenta suscriptores premium activos.
//   - Cuenta suscriptores con WhatsApp confirmado.
//   - Cuenta suscriptores pausados por BAJA.
//   - Cuenta mensajes pendientes.
//   - Cuenta mensajes fallidos.
//   - Cuenta mensajes en fallo definitivo.
//   - Cuenta contenido premium generado para hoy.
//   - Cuenta contenido premium pendiente de envío.
//   - Obtiene último envío premium.
//   - Obtiene últimos errores relevantes.
//   - Devuelve un objeto JSON claro.
//
// QUÉ NO HACE:
//   - No envía WhatsApp.
//   - No genera contenido.
//   - No encola mensajes.
//   - No modifica suscriptores.
//   - No modifica mensajes.
//   - No toca Mercado Pago.
//   - No corrige nada automáticamente.
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//   - Usa SUPABASE_SERVICE_ROLE_KEY.
//   - Pensada para uso interno desde Postman, cron manual, dashboard admin
//     o futura pantalla operativa.
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
const FUNCION = "ef_healthcheck_thc";
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
// ============================================================================
// 📝 LOGGER
// ----------------------------------------------------------------------------
// Logueamos solo errores o ejecuciones explícitas si se pide con log=true.
// No queremos llenar log_funciones cada vez que se consulte el healthcheck.
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
// 🔢 HELPER: contar filas
// ----------------------------------------------------------------------------
// Hace SELECT count exact sin traer datos.
// ============================================================================
async function countRows(params) {
  const { table, build } = params;
  try {
    let query = supabase.from(table).select("*", {
      count: "exact",
      head: true
    });
    if (build) {
      query = build(query);
    }
    const { count, error } = await query;
    if (error) {
      return {
        ok: false,
        count: 0,
        error: error.message
      };
    }
    return {
      ok: true,
      count: count ?? 0,
      error: null
    };
  } catch (e) {
    return {
      ok: false,
      count: 0,
      error: String(e)
    };
  }
}
// ============================================================================
// 📅 HELPER: rango de hoy en UTC
// ----------------------------------------------------------------------------
// Para el MVP usamos día UTC.
// Si después querés día Uruguay, lo ajustamos a America/Montevideo.
// ============================================================================
function getTodayUtcRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}
// ============================================================================
// 🚀 HANDLER
// ============================================================================
serve(async (req)=>{
  const tsNow = nowUTCISO();
  // ==========================================================================
  // 1) Seguridad
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
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({
      ok: false,
      motivo: "metodo_no_permitido",
      mensaje: "Usar GET o POST."
    }, 405);
  }
  // ==========================================================================
  // 3) Parámetros opcionales
  // ==========================================================================
  // GET:
  //   ?log=true
  //
  // POST:
  //   { "log": true }
  //
  // Por defecto NO loguea cada healthcheck para no ensuciar log_funciones.
  // ==========================================================================
  let shouldLog = false;
  if (req.method === "GET") {
    const url = new URL(req.url);
    shouldLog = url.searchParams.get("log") === "true";
  }
  if (req.method === "POST") {
    try {
      const body = await req.json();
      shouldLog = body?.log === true;
    } catch  {
      shouldLog = false;
    }
  }
  const today = getTodayUtcRange();
  // ==========================================================================
  // 4) Ejecutar consultas principales
  // ==========================================================================
  // Todas estas consultas son independientes.
  // Si una falla, no rompemos todo el healthcheck:
  // devolvemos warning y detalle de error.
  // ==========================================================================
  const [suscriptoresPremiumActivos, suscriptoresWhatsappConfirmado, suscriptoresPausados, mensajesPendientes, mensajesProcesando, mensajesFallidos, mensajesFalloDefinitivo, mensajesEnviadosHoy, contenidoPremiumHoy, contenidoPremiumPendienteEnvio, contenidoPremiumEnviadoHoy] = await Promise.all([
    // ------------------------------------------------------------------------
    // Suscriptores premium activos
    // ------------------------------------------------------------------------
    countRows({
      table: "suscriptores",
      build: (q)=>q.eq("premium_activo", true).eq("estado_suscripcion", "activa")
    }),
    // ------------------------------------------------------------------------
    // Suscriptores con WhatsApp confirmado
    // ------------------------------------------------------------------------
    countRows({
      table: "suscriptores",
      build: (q)=>q.eq("premium_activo", true).eq("estado_suscripcion", "activa").eq("whatsapp_confirmado", true)
    }),
    // ------------------------------------------------------------------------
    // Suscriptores que pausaron mensajes por BAJA
    // ------------------------------------------------------------------------
    countRows({
      table: "suscriptores",
      build: (q)=>q.eq("premium_activo", true).eq("estado_suscripcion", "activa").eq("estado_mensaje", "pausado_usuario")
    }),
    // ------------------------------------------------------------------------
    // Mensajes pendientes en outbox
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "pendiente")
    }),
    // ------------------------------------------------------------------------
    // Mensajes procesando
    // Si esto crece o queda viejo, puede indicar procesos colgados.
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "procesando")
    }),
    // ------------------------------------------------------------------------
    // Mensajes fallidos recuperables
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "fallido")
    }),
    // ------------------------------------------------------------------------
    // Mensajes en fallo definitivo
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "fallo_definitivo")
    }),
    // ------------------------------------------------------------------------
    // Mensajes enviados hoy
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "enviado").gte("fecha_enviado", today.start).lt("fecha_enviado", today.end)
    }),
    // ------------------------------------------------------------------------
    // Contenido premium generado para hoy
    // ------------------------------------------------------------------------
    countRows({
      table: "contenido_premium",
      build: (q)=>q.gte("fecha_envio_programada", today.start).lt("fecha_envio_programada", today.end)
    }),
    // ------------------------------------------------------------------------
    // Contenido premium pendiente de envío
    // ------------------------------------------------------------------------
    countRows({
      table: "contenido_premium",
      build: (q)=>q.is("fecha_envio_real", null).in("estado_envio", [
          "pendiente",
          "generado"
        ])
    }),
    // ------------------------------------------------------------------------
    // Contenido premium enviado hoy
    // ------------------------------------------------------------------------
    countRows({
      table: "contenido_premium",
      build: (q)=>q.not("fecha_envio_real", "is", null).gte("fecha_envio_real", today.start).lt("fecha_envio_real", today.end)
    })
  ]);
  // ==========================================================================
  // 5) Último envío premium
  // ==========================================================================
  const { data: ultimoEnvioPremium, error: ultimoEnvioErr } = await supabase.from("mensajes_enviados").select(`
      id,
      id_suscriptor,
      id_contenido,
      whatsapp_destino,
      tipo_mensaje,
      estado,
      nombre_plantilla,
      fecha_enviado,
      mensaje_id_whatsapp
    `).eq("tipo_mensaje", "premium").eq("estado", "enviado").order("fecha_enviado", {
    ascending: false
  }).limit(1).maybeSingle();
  // ==========================================================================
  // 6) Últimos errores del sistema
  // ==========================================================================
  const { data: ultimosErrores, error: ultimosErroresErr } = await supabase.from("log_funciones").select(`
      id,
      nombre_funcion,
      fecha_ejecucion,
      resultado,
      detalle,
      exito
    `).eq("exito", false).order("fecha_ejecucion", {
    ascending: false
  }).limit(10);
  // ==========================================================================
  // 7) Últimos mensajes fallidos
  // ==========================================================================
  const { data: ultimosMensajesFallidos, error: mensajesFallidosErr } = await supabase.from("mensajes_enviados").select(`
      id,
      id_suscriptor,
      whatsapp_destino,
      tipo_mensaje,
      estado,
      nombre_plantilla,
      intentos,
      ultimo_error,
      fecha_ultimo_intento,
      fecha_creado
    `).in("estado", [
    "fallido",
    "fallo_definitivo"
  ]).order("fecha_ultimo_intento", {
    ascending: false,
    nullsFirst: false
  }).limit(10);
  // ==========================================================================
  // 8) Construir warnings
  // ==========================================================================
  // No todo warning significa caída.
  // Sirve para que vos veas dónde mirar.
  // ==========================================================================
  const warnings = [];
  if (!suscriptoresPremiumActivos.ok) warnings.push("error_count_suscriptores_premium_activos");
  if (!mensajesPendientes.ok) warnings.push("error_count_mensajes_pendientes");
  if (!mensajesFallidos.ok) warnings.push("error_count_mensajes_fallidos");
  if (!contenidoPremiumHoy.ok) warnings.push("error_count_contenido_premium_hoy");
  if (ultimoEnvioErr) warnings.push("error_ultimo_envio_premium");
  if (ultimosErroresErr) warnings.push("error_ultimos_errores");
  if (mensajesFallidosErr) warnings.push("error_ultimos_mensajes_fallidos");
  if (mensajesFallidos.count > 0) warnings.push("hay_mensajes_fallidos");
  if (mensajesFalloDefinitivo.count > 0) warnings.push("hay_mensajes_en_fallo_definitivo");
  if (mensajesProcesando.count > 0) warnings.push("hay_mensajes_en_procesando");
  // ==========================================================================
  // 9) Determinar estado general
  // ==========================================================================
  // ok = true:
  //   no hubo errores técnicos en las consultas.
  //
  // healthy = true:
  //   no hay señales operativas relevantes.
  //
  // Puede pasar:
  //   ok=true, healthy=false
  // si las consultas funcionaron pero hay fallidos.
  // ==========================================================================
  const okTecnico = suscriptoresPremiumActivos.ok && suscriptoresWhatsappConfirmado.ok && suscriptoresPausados.ok && mensajesPendientes.ok && mensajesProcesando.ok && mensajesFallidos.ok && mensajesFalloDefinitivo.ok && mensajesEnviadosHoy.ok && contenidoPremiumHoy.ok && contenidoPremiumPendienteEnvio.ok && contenidoPremiumEnviadoHoy.ok && !ultimoEnvioErr && !ultimosErroresErr && !mensajesFallidosErr;
  const healthy = okTecnico && mensajesFallidos.count === 0 && mensajesFalloDefinitivo.count === 0;
  // ==========================================================================
  // 10) Armar respuesta
  // ==========================================================================
  const response = {
    ok: okTecnico,
    healthy,
    funcion: FUNCION,
    timestamp_utc: tsNow,
    rango_hoy_utc: today,
    resumen: {
      suscriptores: {
        premium_activos: suscriptoresPremiumActivos.count,
        whatsapp_confirmado: suscriptoresWhatsappConfirmado.count,
        mensajes_pausados_por_usuario: suscriptoresPausados.count
      },
      outbox: {
        pendientes: mensajesPendientes.count,
        procesando: mensajesProcesando.count,
        fallidos: mensajesFallidos.count,
        fallo_definitivo: mensajesFalloDefinitivo.count,
        enviados_hoy: mensajesEnviadosHoy.count
      },
      contenido_premium: {
        generado_hoy: contenidoPremiumHoy.count,
        pendiente_envio: contenidoPremiumPendienteEnvio.count,
        enviado_hoy: contenidoPremiumEnviadoHoy.count
      }
    },
    ultimo_envio_premium: ultimoEnvioPremium ?? null,
    ultimos_mensajes_fallidos: ultimosMensajesFallidos ?? [],
    ultimos_errores_log_funciones: ultimosErrores ?? [],
    warnings,
    errores_consultas: {
      suscriptoresPremiumActivos: suscriptoresPremiumActivos.error,
      suscriptoresWhatsappConfirmado: suscriptoresWhatsappConfirmado.error,
      suscriptoresPausados: suscriptoresPausados.error,
      mensajesPendientes: mensajesPendientes.error,
      mensajesProcesando: mensajesProcesando.error,
      mensajesFallidos: mensajesFallidos.error,
      mensajesFalloDefinitivo: mensajesFalloDefinitivo.error,
      mensajesEnviadosHoy: mensajesEnviadosHoy.error,
      contenidoPremiumHoy: contenidoPremiumHoy.error,
      contenidoPremiumPendienteEnvio: contenidoPremiumPendienteEnvio.error,
      contenidoPremiumEnviadoHoy: contenidoPremiumEnviadoHoy.error,
      ultimoEnvioPremium: ultimoEnvioErr?.message ?? null,
      ultimosErrores: ultimosErroresErr?.message ?? null,
      ultimosMensajesFallidos: mensajesFallidosErr?.message ?? null
    }
  };
  // ==========================================================================
  // 11) Log opcional
  // ==========================================================================
  if (shouldLog) {
    await registrarLog(healthy ? "healthcheck_ok" : "healthcheck_warning", {
      healthy,
      warnings,
      resumen: response.resumen
    }, healthy);
  }
  // ==========================================================================
  // 12) Respuesta final
  // ==========================================================================
  return jsonResponse(response, 200);
});
