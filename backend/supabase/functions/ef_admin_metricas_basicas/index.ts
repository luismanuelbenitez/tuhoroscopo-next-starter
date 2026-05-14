// ============================================================================
// 📈 EDGE FUNCTION: ef_admin_metricas_basicas
// ============================================================================
//
// MÓDULO:
//   Administración Operativa y Observabilidad
//
// NOMBRE TÉCNICO:
//   ef_admin_metricas_basicas
//
// OBJETIVO:
//   Entregar métricas resumidas de negocio y operación de Tu Horóscopo Cósmico
//   para un período determinado.
//
// USO ESPERADO:
//   - Postman.
//   - Futuro panel administrativo.
//   - Vista ejecutiva rápida.
//   - Control diario/semanal/mensual.
//   - Seguimiento de operación y crecimiento.
//   - Diagnóstico general sin mirar muchas tablas.
//
// QUÉ PERMITE VER:
//   - premium activos actuales
//   - WhatsApp confirmados actuales
//   - usuarios pausados actuales
//   - altas del período
//   - suscripciones activadas en el período
//   - pagos registrados en el período
//   - monto total de pagos del período
//   - mensajes enviados en el período
//   - mensajes fallidos actuales
//   - contenido generado en el período
//   - contenido enviado en el período
//   - códigos de descuento aplicados en el período
//   - errores de log_funciones en el período
//
// QUÉ NO HACE:
//   - NO modifica datos.
//   - NO envía WhatsApp.
//   - NO genera contenido.
//   - NO reintenta mensajes.
//   - NO procesa pagos.
//   - NO toca Mercado Pago.
//   - NO cambia suscriptores.
//   - NO cambia suscripciones.
//
// TIPO:
//   Read-only / métricas ejecutivas.
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
//     "fecha_desde": "2026-04-01",
//     "fecha_hasta": "2026-05-01",
//     "log": false
//   }
//
// SI NO SE ENVÍAN FECHAS:
//   Usa el día actual UTC.
//
// NOTA:
//   - fecha_desde es inclusiva.
//   - fecha_hasta es exclusiva.
//   - Para consultar un día:
//       fecha_desde = "2026-04-27"
//       fecha_hasta = "2026-04-28"
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
const FUNCION = "ef_admin_metricas_basicas";
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
function normalizarBoolean(input, defaultValue = false) {
  if (typeof input === "boolean") return input;
  return defaultValue;
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
// 📅 RANGO POR DEFECTO: HOY UTC
// ============================================================================
function rangoHoyUTC() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const yyyy = start.getUTCFullYear();
  const mm = String(start.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(start.getUTCDate()).padStart(2, "0");
  return {
    desde: start.toISOString(),
    hasta: end.toISOString(),
    fecha: `${yyyy}-${mm}-${dd}`
  };
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
// Esta función solo loguea si se manda log=true.
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
// 🔢 COUNT HELPER
// ----------------------------------------------------------------------------
// Ejecuta un count exact sin traer filas.
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
// 💰 SUM HELPER PARA PAGOS
// ----------------------------------------------------------------------------
// Para evitar RPC por ahora, traemos solo amount de pagos del período y sumamos.
// Para MVP está perfecto.
// Si el volumen crece mucho, conviene RPC SQL agregada.
// ============================================================================
async function sumarPagosPeriodo(params) {
  const { desde, hasta } = params;
  try {
    const { data, error } = await supabase.from("pagos").select("amount").gte("created_at", desde).lt("created_at", hasta);
    if (error) {
      return {
        ok: false,
        total: 0,
        cantidad: 0,
        error: error.message
      };
    }
    const rows = Array.isArray(data) ? data : [];
    const total = rows.reduce((acc, row)=>{
      const n = Number(row.amount ?? 0);
      return Number.isFinite(n) ? acc + n : acc;
    }, 0);
    return {
      ok: true,
      total: Number(total.toFixed(2)),
      cantidad: rows.length,
      error: null
    };
  } catch (e) {
    return {
      ok: false,
      total: 0,
      cantidad: 0,
      error: String(e)
    };
  }
}
// ============================================================================
// 🧾 RESUMEN TEXTO
// ============================================================================
function construirResumenTexto(params) {
  const { desde, hasta, premiumActivos, whatsappConfirmados, pausados, altasPeriodo, suscripcionesActivadas, pagosCantidad, pagosMonto, mensajesEnviados, mensajesFallidos, contenidoGenerado, contenidoEnviado, codigosAplicados, erroresLog } = params;
  const estado = mensajesFallidos === 0 && erroresLog === 0 ? "sin alertas críticas" : "con alertas para revisar";
  return [
    `📈 Métricas básicas THC`,
    ``,
    `Período UTC: ${desde} → ${hasta}`,
    `Estado general: ${estado}.`,
    ``,
    `👥 Premium activos actuales: ${premiumActivos}`,
    `✅ WhatsApp confirmados actuales: ${whatsappConfirmados}`,
    `⏸️ Pausados actuales: ${pausados}`,
    ``,
    `🆕 Altas del período: ${altasPeriodo}`,
    `💳 Suscripciones activadas: ${suscripcionesActivadas}`,
    `💰 Pagos registrados: ${pagosCantidad}`,
    `💵 Monto total pagos: ${pagosMonto}`,
    ``,
    `💬 Mensajes enviados: ${mensajesEnviados}`,
    `⚠️ Mensajes fallidos actuales: ${mensajesFallidos}`,
    `✨ Contenido generado: ${contenidoGenerado}`,
    `📤 Contenido enviado: ${contenidoEnviado}`,
    `🎟️ Códigos aplicados: ${codigosAplicados}`,
    `🪵 Errores en logs: ${erroresLog}`
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
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({
      ok: false,
      motivo: "metodo_no_permitido",
      mensaje: "Usar GET o POST."
    }, 405);
  }
  // ==========================================================================
  // 3) Leer parámetros
  // ==========================================================================
  const body = await readBodySafe(req);
  const url = new URL(req.url);
  const fechaDesdeRaw = typeof body.fecha_desde === "string" ? body.fecha_desde : url.searchParams.get("fecha_desde");
  const fechaHastaRaw = typeof body.fecha_hasta === "string" ? body.fecha_hasta : url.searchParams.get("fecha_hasta");
  const shouldLog = body.log === true || url.searchParams.get("log") === "true";
  const rangoDefault = rangoHoyUTC();
  const fecha_desde = normalizarFecha(fechaDesdeRaw) ?? rangoDefault.desde;
  const fecha_hasta = normalizarFecha(fechaHastaRaw) ?? rangoDefault.hasta;
  // ==========================================================================
  // 4) Validar rango
  // ==========================================================================
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
  // ==========================================================================
  // 5) Ejecutar métricas
  // ==========================================================================
  const [premiumActivos, whatsappConfirmados, pausados, altasPeriodo, suscripcionesActivadas, suscripcionesCreadas, mensajesEnviadosPeriodo, mensajesPendientesActuales, mensajesProcesandoActuales, mensajesFallidosActuales, mensajesFalloDefinitivoActuales, contenidoGeneradoPeriodo, contenidoEnviadoPeriodo, contenidoPendienteActual, pagosPeriodoCount, pagosSuma, codigosAplicadosPeriodo, erroresLogPeriodo] = await Promise.all([
    // ------------------------------------------------------------------------
    // Premium activos actuales
    // ------------------------------------------------------------------------
    countRows({
      table: "suscriptores",
      build: (q)=>q.eq("premium_activo", true).eq("estado_suscripcion", "activa")
    }),
    // ------------------------------------------------------------------------
    // WhatsApp confirmados actuales
    // ------------------------------------------------------------------------
    countRows({
      table: "suscriptores",
      build: (q)=>q.eq("premium_activo", true).eq("estado_suscripcion", "activa").eq("whatsapp_confirmado", true)
    }),
    // ------------------------------------------------------------------------
    // Pausados actuales
    // ------------------------------------------------------------------------
    countRows({
      table: "suscriptores",
      build: (q)=>q.eq("premium_activo", true).eq("estado_suscripcion", "activa").eq("estado_mensaje", "pausado_usuario")
    }),
    // ------------------------------------------------------------------------
    // Altas de suscriptores en período
    // ------------------------------------------------------------------------
    countRows({
      table: "suscriptores",
      build: (q)=>q.gte("creado_en", fecha_desde).lt("creado_en", fecha_hasta)
    }),
    // ------------------------------------------------------------------------
    // Suscripciones activadas definitivamente en período
    // ------------------------------------------------------------------------
    countRows({
      table: "suscripciones",
      build: (q)=>q.gte("fecha_activacion_definitiva", fecha_desde).lt("fecha_activacion_definitiva", fecha_hasta)
    }),
    // ------------------------------------------------------------------------
    // Suscripciones creadas en período
    // ------------------------------------------------------------------------
    countRows({
      table: "suscripciones",
      build: (q)=>q.gte("created_at", fecha_desde).lt("created_at", fecha_hasta)
    }),
    // ------------------------------------------------------------------------
    // Mensajes enviados en período
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "enviado").gte("fecha_enviado", fecha_desde).lt("fecha_enviado", fecha_hasta)
    }),
    // ------------------------------------------------------------------------
    // Mensajes pendientes actuales
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "pendiente")
    }),
    // ------------------------------------------------------------------------
    // Mensajes procesando actuales
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "procesando")
    }),
    // ------------------------------------------------------------------------
    // Mensajes fallidos actuales
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "fallido")
    }),
    // ------------------------------------------------------------------------
    // Mensajes fallo definitivo actuales
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "fallo_definitivo")
    }),
    // ------------------------------------------------------------------------
    // Contenido generado/programado en período
    // ------------------------------------------------------------------------
    countRows({
      table: "contenido_premium",
      build: (q)=>q.gte("fecha_envio_programada", fecha_desde).lt("fecha_envio_programada", fecha_hasta)
    }),
    // ------------------------------------------------------------------------
    // Contenido enviado en período
    // ------------------------------------------------------------------------
    countRows({
      table: "contenido_premium",
      build: (q)=>q.not("fecha_envio_real", "is", null).gte("fecha_envio_real", fecha_desde).lt("fecha_envio_real", fecha_hasta)
    }),
    // ------------------------------------------------------------------------
    // Contenido pendiente actual
    // ------------------------------------------------------------------------
    countRows({
      table: "contenido_premium",
      build: (q)=>q.is("fecha_envio_real", null).in("estado_envio", [
          "pendiente",
          "generado",
          "encolado"
        ])
    }),
    // ------------------------------------------------------------------------
    // Cantidad de pagos en período
    // ------------------------------------------------------------------------
    countRows({
      table: "pagos",
      build: (q)=>q.gte("created_at", fecha_desde).lt("created_at", fecha_hasta)
    }),
    // ------------------------------------------------------------------------
    // Suma de pagos en período
    // ------------------------------------------------------------------------
    sumarPagosPeriodo({
      desde: fecha_desde,
      hasta: fecha_hasta
    }),
    // ------------------------------------------------------------------------
    // Códigos aplicados en período
    // ------------------------------------------------------------------------
    countRows({
      table: "codigos_descuento_usos",
      build: (q)=>q.eq("estado_uso", "aplicado").gte("fecha_aplicacion", fecha_desde).lt("fecha_aplicacion", fecha_hasta)
    }),
    // ------------------------------------------------------------------------
    // Errores en log_funciones en período
    // ------------------------------------------------------------------------
    countRows({
      table: "log_funciones",
      build: (q)=>q.eq("exito", false).gte("fecha_ejecucion", fecha_desde).lt("fecha_ejecucion", fecha_hasta)
    })
  ]);
  // ==========================================================================
  // 6) Calcular tasas simples
  // ==========================================================================
  const tasaConfirmacionWhatsapp = premiumActivos.count > 0 ? Number((whatsappConfirmados.count / premiumActivos.count * 100).toFixed(2)) : null;
  const tasaEnvioContenido = contenidoGeneradoPeriodo.count > 0 ? Number((contenidoEnviadoPeriodo.count / contenidoGeneradoPeriodo.count * 100).toFixed(2)) : null;
  const tasaMensajesFallidosSobreEnviados = mensajesEnviadosPeriodo.count > 0 ? Number((mensajesFallidosActuales.count / mensajesEnviadosPeriodo.count * 100).toFixed(2)) : null;
  // ==========================================================================
  // 7) Warnings
  // ==========================================================================
  const warnings = [];
  const counters = [
    [
      "premiumActivos",
      premiumActivos
    ],
    [
      "whatsappConfirmados",
      whatsappConfirmados
    ],
    [
      "pausados",
      pausados
    ],
    [
      "altasPeriodo",
      altasPeriodo
    ],
    [
      "suscripcionesActivadas",
      suscripcionesActivadas
    ],
    [
      "suscripcionesCreadas",
      suscripcionesCreadas
    ],
    [
      "mensajesEnviadosPeriodo",
      mensajesEnviadosPeriodo
    ],
    [
      "mensajesPendientesActuales",
      mensajesPendientesActuales
    ],
    [
      "mensajesProcesandoActuales",
      mensajesProcesandoActuales
    ],
    [
      "mensajesFallidosActuales",
      mensajesFallidosActuales
    ],
    [
      "mensajesFalloDefinitivoActuales",
      mensajesFalloDefinitivoActuales
    ],
    [
      "contenidoGeneradoPeriodo",
      contenidoGeneradoPeriodo
    ],
    [
      "contenidoEnviadoPeriodo",
      contenidoEnviadoPeriodo
    ],
    [
      "contenidoPendienteActual",
      contenidoPendienteActual
    ],
    [
      "pagosPeriodoCount",
      pagosPeriodoCount
    ],
    [
      "codigosAplicadosPeriodo",
      codigosAplicadosPeriodo
    ],
    [
      "erroresLogPeriodo",
      erroresLogPeriodo
    ]
  ];
  for (const [name, result] of counters){
    if (!result.ok) {
      warnings.push(`error_metric_${name}`);
    }
  }
  if (!pagosSuma.ok) {
    warnings.push("error_sumar_pagos_periodo");
  }
  if (mensajesFallidosActuales.count > 0) {
    warnings.push("hay_mensajes_fallidos_actuales");
  }
  if (mensajesFalloDefinitivoActuales.count > 0) {
    warnings.push("hay_mensajes_en_fallo_definitivo");
  }
  if (mensajesProcesandoActuales.count > 0) {
    warnings.push("hay_mensajes_procesando_actualmente");
  }
  if (contenidoPendienteActual.count > 0) {
    warnings.push("hay_contenido_pendiente_actual");
  }
  if (erroresLogPeriodo.count > 0) {
    warnings.push("hay_errores_log_funciones_en_periodo");
  }
  // ==========================================================================
  // 8) Estado técnico / operativo
  // ==========================================================================
  const okTecnico = counters.every(([, result])=>result.ok) && pagosSuma.ok;
  const healthy = okTecnico && mensajesFallidosActuales.count === 0 && mensajesFalloDefinitivoActuales.count === 0 && erroresLogPeriodo.count === 0;
  // ==========================================================================
  // 9) Resumen textual
  // ==========================================================================
  const resumenTexto = construirResumenTexto({
    desde: fecha_desde,
    hasta: fecha_hasta,
    premiumActivos: premiumActivos.count,
    whatsappConfirmados: whatsappConfirmados.count,
    pausados: pausados.count,
    altasPeriodo: altasPeriodo.count,
    suscripcionesActivadas: suscripcionesActivadas.count,
    pagosCantidad: pagosPeriodoCount.count,
    pagosMonto: pagosSuma.total,
    mensajesEnviados: mensajesEnviadosPeriodo.count,
    mensajesFallidos: mensajesFallidosActuales.count,
    contenidoGenerado: contenidoGeneradoPeriodo.count,
    contenidoEnviado: contenidoEnviadoPeriodo.count,
    codigosAplicados: codigosAplicadosPeriodo.count,
    erroresLog: erroresLogPeriodo.count
  });
  // ==========================================================================
  // 10) Respuesta
  // ==========================================================================
  const response = {
    ok: okTecnico,
    healthy,
    funcion: FUNCION,
    timestamp_utc: tsNow,
    periodo: {
      desde_utc: fecha_desde,
      hasta_utc: fecha_hasta
    },
    resumen_texto: resumenTexto,
    metricas: {
      suscriptores: {
        premium_activos_actuales: premiumActivos.count,
        whatsapp_confirmados_actuales: whatsappConfirmados.count,
        pausados_actuales: pausados.count,
        altas_periodo: altasPeriodo.count,
        tasa_confirmacion_whatsapp_pct: tasaConfirmacionWhatsapp
      },
      suscripciones: {
        creadas_periodo: suscripcionesCreadas.count,
        activadas_definitivamente_periodo: suscripcionesActivadas.count
      },
      pagos: {
        registrados_periodo: pagosPeriodoCount.count,
        monto_total_periodo: pagosSuma.total
      },
      mensajes: {
        enviados_periodo: mensajesEnviadosPeriodo.count,
        pendientes_actuales: mensajesPendientesActuales.count,
        procesando_actuales: mensajesProcesandoActuales.count,
        fallidos_actuales: mensajesFallidosActuales.count,
        fallo_definitivo_actuales: mensajesFalloDefinitivoActuales.count,
        tasa_fallidos_sobre_enviados_pct: tasaMensajesFallidosSobreEnviados
      },
      contenido_premium: {
        generado_periodo: contenidoGeneradoPeriodo.count,
        enviado_periodo: contenidoEnviadoPeriodo.count,
        pendiente_actual: contenidoPendienteActual.count,
        tasa_envio_contenido_pct: tasaEnvioContenido
      },
      descuentos: {
        codigos_aplicados_periodo: codigosAplicadosPeriodo.count
      },
      errores: {
        errores_log_funciones_periodo: erroresLogPeriodo.count
      }
    },
    warnings,
    errores_consultas: {
      premiumActivos: premiumActivos.error,
      whatsappConfirmados: whatsappConfirmados.error,
      pausados: pausados.error,
      altasPeriodo: altasPeriodo.error,
      suscripcionesActivadas: suscripcionesActivadas.error,
      suscripcionesCreadas: suscripcionesCreadas.error,
      mensajesEnviadosPeriodo: mensajesEnviadosPeriodo.error,
      mensajesPendientesActuales: mensajesPendientesActuales.error,
      mensajesProcesandoActuales: mensajesProcesandoActuales.error,
      mensajesFallidosActuales: mensajesFallidosActuales.error,
      mensajesFalloDefinitivoActuales: mensajesFalloDefinitivoActuales.error,
      contenidoGeneradoPeriodo: contenidoGeneradoPeriodo.error,
      contenidoEnviadoPeriodo: contenidoEnviadoPeriodo.error,
      contenidoPendienteActual: contenidoPendienteActual.error,
      pagosPeriodoCount: pagosPeriodoCount.error,
      pagosSuma: pagosSuma.error,
      codigosAplicadosPeriodo: codigosAplicadosPeriodo.error,
      erroresLogPeriodo: erroresLogPeriodo.error
    }
  };
  // ==========================================================================
  // 11) Log opcional
  // ==========================================================================
  if (shouldLog) {
    await registrarLog(healthy ? "metricas_basicas_ok" : "metricas_basicas_warning", {
      periodo: response.periodo,
      healthy,
      metricas: response.metricas,
      warnings
    }, healthy);
  }
  // ==========================================================================
  // 12) Respuesta final
  // ==========================================================================
  return jsonResponse(response, 200);
});
