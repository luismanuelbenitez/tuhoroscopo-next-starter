// ============================================================================
// 📊 EDGE FUNCTION: ef_admin_resumen_diario
// ============================================================================
//
// MÓDULO:
//   Administración / Gestión / Observabilidad
//
// NOMBRE TÉCNICO:
//   ef_admin_resumen_diario
//
// OBJETIVO:
//   Generar un resumen operativo diario de Tu Horóscopo Cósmico.
//
// USO ESPERADO:
//   - Consulta manual desde Postman.
//   - Futuro cron diario.
//   - Futuro panel administrativo.
//   - Futuro mensaje interno por WhatsApp al administrador.
//
// QUÉ RESPONDE:
//   - Altas de suscriptores del día.
//   - Suscriptores premium activos.
//   - Suscriptores con WhatsApp confirmado.
//   - Usuarios pausados por BAJA.
//   - Contenido premium generado en el día.
//   - Contenido premium enviado en el día.
//   - Mensajes enviados.
//   - Mensajes pendientes.
//   - Mensajes fallidos.
//   - Fallos definitivos.
//   - Errores recientes de funciones.
//   - Resumen ejecutivo en texto.
//
// QUÉ NO HACE:
//   - NO envía WhatsApp.
//   - NO genera contenido.
//   - NO encola mensajes.
//   - NO reintenta fallidos.
//   - NO modifica suscriptores.
//   - NO modifica suscripciones.
//   - NO toca Mercado Pago.
//   - NO corrige nada automáticamente.
//
// DIFERENCIA CON ef_healthcheck_thc:
//   - ef_healthcheck_thc responde estado actual del sistema.
//   - ef_admin_resumen_diario responde resumen operativo de un día.
//
// SEGURIDAD:
//   - Requiere header x-internal-key.
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
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const FUNCION = "ef_admin_resumen_diario";
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
// Por defecto esta función NO loguea cada ejecución.
// Solo loguea si se le pasa log=true.
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
// 📅 HELPER: obtener rango UTC para una fecha
// ----------------------------------------------------------------------------
// Entrada:
//   fecha = "2026-04-27"
//
// Salida:
//   start = "2026-04-27T00:00:00.000Z"
//   end   = "2026-04-28T00:00:00.000Z"
//
// Si no viene fecha:
//   usa el día actual UTC.
//
// NOTA:
//   Para MVP usamos UTC porque tus tablas principales trabajan con timestamptz.
//   Si luego querés resumen por día Uruguay, podemos ajustar a America/Montevideo.
// ============================================================================
function getUtcDayRange(fecha) {
  let base;
  if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split("-").map(Number);
    base = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  } else {
    const now = new Date();
    base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  }
  const end = new Date(base.getTime() + 24 * 60 * 60 * 1000);
  const yyyy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return {
    fecha: `${yyyy}-${mm}-${dd}`,
    start: base.toISOString(),
    end: end.toISOString()
  };
}
// ============================================================================
// 🔢 HELPER: countRows
// ----------------------------------------------------------------------------
// Hace count exact sin traer filas.
// Si falla, devuelve ok=false pero no rompe toda la función.
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
// 🧠 HELPER: leer JSON body de forma segura
// ----------------------------------------------------------------------------
// GET puede no tener body.
// POST puede traer:
//   {
//     "fecha": "2026-04-27",
//     "log": true
//   }
// ============================================================================
async function readBodySafe(req) {
  if (req.method !== "POST") return {};
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
// 🧾 HELPER: construir resumen ejecutivo textual
// ----------------------------------------------------------------------------
// Esto sirve para lectura humana rápida.
// Más adelante se puede reutilizar para enviar resumen por WhatsApp al admin.
// ============================================================================
function construirResumenTexto(params) {
  const { fecha, premiumActivos, altasHoy, whatsappConfirmado, pausados, contenidoGenerado, contenidoEnviado, mensajesEnviados, mensajesPendientes, mensajesFallidos, falloDefinitivo, erroresLog } = params;
  const estado = mensajesFallidos === 0 && falloDefinitivo === 0 && erroresLog === 0 ? "sin incidentes críticos" : "con alertas para revisar";
  return [
    `📊 Resumen THC — ${fecha}`,
    ``,
    `Estado general: ${estado}.`,
    ``,
    `👥 Premium activos: ${premiumActivos}`,
    `🆕 Altas del día: ${altasHoy}`,
    `✅ WhatsApp confirmado: ${whatsappConfirmado}`,
    `⏸️ Usuarios pausados: ${pausados}`,
    ``,
    `✨ Contenido generado: ${contenidoGenerado}`,
    `📤 Contenido enviado: ${contenidoEnviado}`,
    `💬 Mensajes enviados: ${mensajesEnviados}`,
    `⏳ Mensajes pendientes: ${mensajesPendientes}`,
    `⚠️ Mensajes fallidos: ${mensajesFallidos}`,
    `🛑 Fallos definitivos: ${falloDefinitivo}`,
    `🪵 Errores en logs: ${erroresLog}`
  ].join("\n");
}
// ============================================================================
// 🚀 HANDLER PRINCIPAL
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
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({
      ok: false,
      motivo: "metodo_no_permitido",
      mensaje: "Usar GET o POST."
    }, 405);
  }
  // ==========================================================================
  // 3) Parámetros
  // ----------------------------------------------------------------------------
  // GET:
  //   ?fecha=2026-04-27&log=true
  //
  // POST:
  //   {
  //     "fecha": "2026-04-27",
  //     "log": true
  //   }
  //
  // Si no viene fecha:
  //   usa día actual UTC.
  // ==========================================================================
  const body = await readBodySafe(req);
  const url = new URL(req.url);
  const fechaParam = typeof body.fecha === "string" ? body.fecha : url.searchParams.get("fecha");
  const shouldLog = body.log === true || url.searchParams.get("log") === "true";
  const rango = getUtcDayRange(fechaParam);
  // ==========================================================================
  // 4) Ejecutar métricas principales
  // ==========================================================================
  const [premiumActivos, whatsappConfirmado, pausados, altasHoy, suscripcionesActivadasHoy, mensajesEnviadosHoy, mensajesPendientes, mensajesProcesando, mensajesFallidos, mensajesFalloDefinitivo, contenidoGeneradoHoy, contenidoEnviadoHoy, contenidoPendienteEnvio, pagosHoy, codigosAplicadosHoy, erroresLogHoy] = await Promise.all([
    // ------------------------------------------------------------------------
    // Premium activos actuales
    // ------------------------------------------------------------------------
    countRows({
      table: "suscriptores",
      build: (q)=>q.eq("premium_activo", true).eq("estado_suscripcion", "activa")
    }),
    // ------------------------------------------------------------------------
    // Premium activos con WhatsApp confirmado
    // ------------------------------------------------------------------------
    countRows({
      table: "suscriptores",
      build: (q)=>q.eq("premium_activo", true).eq("estado_suscripcion", "activa").eq("whatsapp_confirmado", true)
    }),
    // ------------------------------------------------------------------------
    // Premium activos pausados por usuario
    // ------------------------------------------------------------------------
    countRows({
      table: "suscriptores",
      build: (q)=>q.eq("premium_activo", true).eq("estado_suscripcion", "activa").eq("estado_mensaje", "pausado_usuario")
    }),
    // ------------------------------------------------------------------------
    // Altas de suscriptores del día
    // Usamos creado_en.
    // ------------------------------------------------------------------------
    countRows({
      table: "suscriptores",
      build: (q)=>q.gte("creado_en", rango.start).lt("creado_en", rango.end)
    }),
    // ------------------------------------------------------------------------
    // Suscripciones activadas definitivamente en el día
    // ------------------------------------------------------------------------
    countRows({
      table: "suscripciones",
      build: (q)=>q.gte("fecha_activacion_definitiva", rango.start).lt("fecha_activacion_definitiva", rango.end)
    }),
    // ------------------------------------------------------------------------
    // Mensajes enviados hoy
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "enviado").gte("fecha_enviado", rango.start).lt("fecha_enviado", rango.end)
    }),
    // ------------------------------------------------------------------------
    // Outbox pendiente actual
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "pendiente")
    }),
    // ------------------------------------------------------------------------
    // Outbox procesando actual
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "procesando")
    }),
    // ------------------------------------------------------------------------
    // Fallidos recuperables actuales
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "fallido")
    }),
    // ------------------------------------------------------------------------
    // Fallos definitivos actuales
    // ------------------------------------------------------------------------
    countRows({
      table: "mensajes_enviados",
      build: (q)=>q.eq("estado", "fallo_definitivo")
    }),
    // ------------------------------------------------------------------------
    // Contenido generado/programado para el día consultado
    // ------------------------------------------------------------------------
    countRows({
      table: "contenido_premium",
      build: (q)=>q.gte("fecha_envio_programada", rango.start).lt("fecha_envio_programada", rango.end)
    }),
    // ------------------------------------------------------------------------
    // Contenido enviado en el día consultado
    // ------------------------------------------------------------------------
    countRows({
      table: "contenido_premium",
      build: (q)=>q.not("fecha_envio_real", "is", null).gte("fecha_envio_real", rango.start).lt("fecha_envio_real", rango.end)
    }),
    // ------------------------------------------------------------------------
    // Contenido pendiente de envío actual
    // ------------------------------------------------------------------------
    countRows({
      table: "contenido_premium",
      build: (q)=>q.is("fecha_envio_real", null).in("estado_envio", [
          "pendiente",
          "generado"
        ])
    }),
    // ------------------------------------------------------------------------
    // Pagos registrados en el día
    // Tabla pagos usa created_at según tu modelo.
    // ------------------------------------------------------------------------
    countRows({
      table: "pagos",
      build: (q)=>q.gte("created_at", rango.start).lt("created_at", rango.end)
    }),
    // ------------------------------------------------------------------------
    // Códigos de descuento aplicados en el día
    // Si la tabla existe, cuenta.
    // Si no existe en algún entorno, devolverá error controlado.
    // ------------------------------------------------------------------------
    countRows({
      table: "codigos_descuento_usos",
      build: (q)=>q.eq("estado_uso", "aplicado").gte("fecha_aplicacion", rango.start).lt("fecha_aplicacion", rango.end)
    }),
    // ------------------------------------------------------------------------
    // Errores en log_funciones del día
    // ------------------------------------------------------------------------
    countRows({
      table: "log_funciones",
      build: (q)=>q.eq("exito", false).gte("fecha_ejecucion", rango.start).lt("fecha_ejecucion", rango.end)
    })
  ]);
  // ==========================================================================
  // 5) Últimos errores del día
  // ==========================================================================
  const { data: ultimosErroresDia, error: ultimosErroresDiaErr } = await supabase.from("log_funciones").select(`
      id,
      nombre_funcion,
      fecha_ejecucion,
      resultado,
      detalle,
      exito
    `).eq("exito", false).gte("fecha_ejecucion", rango.start).lt("fecha_ejecucion", rango.end).order("fecha_ejecucion", {
    ascending: false
  }).limit(10);
  // ==========================================================================
  // 6) Últimos mensajes enviados del día
  // ==========================================================================
  const { data: ultimosMensajesEnviadosDia, error: ultimosMensajesEnviadosDiaErr } = await supabase.from("mensajes_enviados").select(`
      id,
      id_suscriptor,
      whatsapp_destino,
      tipo_mensaje,
      estado,
      nombre_plantilla,
      fecha_enviado,
      mensaje_id_whatsapp
    `).eq("estado", "enviado").gte("fecha_enviado", rango.start).lt("fecha_enviado", rango.end).order("fecha_enviado", {
    ascending: false
  }).limit(10);
  // ==========================================================================
  // 7) Últimos mensajes fallidos actuales
  // ==========================================================================
  const { data: ultimosMensajesFallidos, error: ultimosMensajesFallidosErr } = await supabase.from("mensajes_enviados").select(`
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
  const warnings = [];
  const counters = [
    [
      "premiumActivos",
      premiumActivos
    ],
    [
      "whatsappConfirmado",
      whatsappConfirmado
    ],
    [
      "pausados",
      pausados
    ],
    [
      "altasHoy",
      altasHoy
    ],
    [
      "suscripcionesActivadasHoy",
      suscripcionesActivadasHoy
    ],
    [
      "mensajesEnviadosHoy",
      mensajesEnviadosHoy
    ],
    [
      "mensajesPendientes",
      mensajesPendientes
    ],
    [
      "mensajesProcesando",
      mensajesProcesando
    ],
    [
      "mensajesFallidos",
      mensajesFallidos
    ],
    [
      "mensajesFalloDefinitivo",
      mensajesFalloDefinitivo
    ],
    [
      "contenidoGeneradoHoy",
      contenidoGeneradoHoy
    ],
    [
      "contenidoEnviadoHoy",
      contenidoEnviadoHoy
    ],
    [
      "contenidoPendienteEnvio",
      contenidoPendienteEnvio
    ],
    [
      "pagosHoy",
      pagosHoy
    ],
    [
      "codigosAplicadosHoy",
      codigosAplicadosHoy
    ],
    [
      "erroresLogHoy",
      erroresLogHoy
    ]
  ];
  for (const [name, result] of counters){
    if (!result.ok) {
      warnings.push(`error_count_${name}`);
    }
  }
  if (ultimosErroresDiaErr) warnings.push("error_ultimos_errores_dia");
  if (ultimosMensajesEnviadosDiaErr) warnings.push("error_ultimos_mensajes_enviados_dia");
  if (ultimosMensajesFallidosErr) warnings.push("error_ultimos_mensajes_fallidos");
  if (mensajesFallidos.count > 0) warnings.push("hay_mensajes_fallidos");
  if (mensajesFalloDefinitivo.count > 0) warnings.push("hay_mensajes_fallo_definitivo");
  if (mensajesProcesando.count > 0) warnings.push("hay_mensajes_en_procesando");
  if (erroresLogHoy.count > 0) warnings.push("hay_errores_log_funciones_en_el_dia");
  // ==========================================================================
  // 9) Estado técnico / operativo
  // ==========================================================================
  const okTecnico = counters.every(([, result])=>result.ok) && !ultimosErroresDiaErr && !ultimosMensajesEnviadosDiaErr && !ultimosMensajesFallidosErr;
  const healthy = okTecnico && mensajesFallidos.count === 0 && mensajesFalloDefinitivo.count === 0 && erroresLogHoy.count === 0;
  // ==========================================================================
  // 10) Resumen textual
  // ==========================================================================
  const resumenTexto = construirResumenTexto({
    fecha: rango.fecha,
    premiumActivos: premiumActivos.count,
    altasHoy: altasHoy.count,
    whatsappConfirmado: whatsappConfirmado.count,
    pausados: pausados.count,
    contenidoGenerado: contenidoGeneradoHoy.count,
    contenidoEnviado: contenidoEnviadoHoy.count,
    mensajesEnviados: mensajesEnviadosHoy.count,
    mensajesPendientes: mensajesPendientes.count,
    mensajesFallidos: mensajesFallidos.count,
    falloDefinitivo: mensajesFalloDefinitivo.count,
    erroresLog: erroresLogHoy.count
  });
  // ==========================================================================
  // 11) Respuesta
  // ==========================================================================
  const response = {
    ok: okTecnico,
    healthy,
    funcion: FUNCION,
    timestamp_utc: tsNow,
    periodo: {
      fecha_utc: rango.fecha,
      desde_utc: rango.start,
      hasta_utc: rango.end
    },
    resumen_texto: resumenTexto,
    resumen: {
      suscriptores: {
        premium_activos_actuales: premiumActivos.count,
        whatsapp_confirmado_actuales: whatsappConfirmado.count,
        pausados_por_usuario_actuales: pausados.count,
        altas_del_dia: altasHoy.count
      },
      suscripciones: {
        activadas_definitivamente_del_dia: suscripcionesActivadasHoy.count
      },
      pagos: {
        registrados_del_dia: pagosHoy.count
      },
      mensajes: {
        enviados_del_dia: mensajesEnviadosHoy.count,
        pendientes_actuales: mensajesPendientes.count,
        procesando_actuales: mensajesProcesando.count,
        fallidos_actuales: mensajesFallidos.count,
        fallo_definitivo_actuales: mensajesFalloDefinitivo.count
      },
      contenido_premium: {
        generado_para_el_dia: contenidoGeneradoHoy.count,
        enviado_del_dia: contenidoEnviadoHoy.count,
        pendiente_envio_actual: contenidoPendienteEnvio.count
      },
      descuentos: {
        codigos_aplicados_del_dia: codigosAplicadosHoy.count
      },
      errores: {
        errores_log_funciones_del_dia: erroresLogHoy.count
      }
    },
    ultimos_errores_del_dia: ultimosErroresDia ?? [],
    ultimos_mensajes_enviados_del_dia: ultimosMensajesEnviadosDia ?? [],
    ultimos_mensajes_fallidos_actuales: ultimosMensajesFallidos ?? [],
    warnings,
    errores_consultas: {
      premiumActivos: premiumActivos.error,
      whatsappConfirmado: whatsappConfirmado.error,
      pausados: pausados.error,
      altasHoy: altasHoy.error,
      suscripcionesActivadasHoy: suscripcionesActivadasHoy.error,
      mensajesEnviadosHoy: mensajesEnviadosHoy.error,
      mensajesPendientes: mensajesPendientes.error,
      mensajesProcesando: mensajesProcesando.error,
      mensajesFallidos: mensajesFallidos.error,
      mensajesFalloDefinitivo: mensajesFalloDefinitivo.error,
      contenidoGeneradoHoy: contenidoGeneradoHoy.error,
      contenidoEnviadoHoy: contenidoEnviadoHoy.error,
      contenidoPendienteEnvio: contenidoPendienteEnvio.error,
      pagosHoy: pagosHoy.error,
      codigosAplicadosHoy: codigosAplicadosHoy.error,
      erroresLogHoy: erroresLogHoy.error,
      ultimosErroresDia: ultimosErroresDiaErr?.message ?? null,
      ultimosMensajesEnviadosDia: ultimosMensajesEnviadosDiaErr?.message ?? null,
      ultimosMensajesFallidos: ultimosMensajesFallidosErr?.message ?? null
    }
  };
  // ==========================================================================
  // 12) Log opcional
  // ==========================================================================
  if (shouldLog) {
    await registrarLog(healthy ? "resumen_diario_ok" : "resumen_diario_warning", {
      fecha: rango.fecha,
      healthy,
      warnings,
      resumen: response.resumen
    }, healthy);
  }
  // ==========================================================================
  // 13) Respuesta final
  // ==========================================================================
  return jsonResponse(response, 200);
});
