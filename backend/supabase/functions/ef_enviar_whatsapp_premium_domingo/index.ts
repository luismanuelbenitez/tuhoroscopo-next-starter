// ============================================================================
// EDGE FUNCTION: ef_enviar_whatsapp_premium_domingo (UTC/GMT 0)
// ============================================================================
// Propósito:
//   • Enviar el "Domingo Cósmico" a los suscriptores premium activos,
//     usando los registros de la tabla `contenido_premium` con:
//         - tipo = 'domingo'
//         - estado_envio = 'pendiente' (y opcionalmente 'reintentar')
//         - fecha_envio_programada = fechaObjetivoT00:00:00.000Z
//
//   • Usa:
//       - Tabla contenido_premium  (mensaje ya generado, tipo 'domingo')
//       - Tabla suscriptores       (whatsapp, nombre, signo)
//       - WhatsApp Cloud API       (o modo test sin envío real)
//       - Tabla log_funciones      (log de alto nivel)
//
//   • Inputs (body JSON opcional):
//       {
//         "fecha": "YYYY-MM-DD",   // opcional, en UTC (si no, todayUTC())
//         "incluir_reintentos": true | false  // opcional, default: true
//       }
//
//   • Env vars esperadas:
//       - SUPABASE_URL
//       - SUPABASE_SERVICE_ROLE_KEY
//       - SUPABASE_ANON_KEY  (o ANON_KEY_SUPABASE)
//       - WHATSAPP_PHONE_NUMBER_ID
//       - WHATSAPP_TOKEN
//       - MODO_TEST (opcional: si = true, NO envía WhatsApp real)
//
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const FUNCION = "ef_enviar_whatsapp_premium_domingo";
// ============================================================================
// CONFIGURACIÓN DESDE ENV
// ============================================================================
// Supabase
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = Deno.env.get("ANON_KEY_SUPABASE") || Deno.env.get("SUPABASE_ANON_KEY") || "";
// WhatsApp Cloud API
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") || "";
// Modo test (no se envían mensajes reales)
const MODO_TEST = true;
// (Deno.env.get("MODO_TEST") || "false").toLowerCase() === "true";
// ============================================================================
// HELPERS DE FECHA/HORA (UTC)
// ============================================================================
/** Timestamp actual en UTC (ISO 8601) */ function nowUTCISO() {
  return new Date().toISOString();
}
/** Fecha actual en UTC (YYYY-MM-DD) */ function todayUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
// ============================================================================
// HELPERS GENERALES
// ============================================================================
/**
 * Formatea el texto del WhatsApp para domingo usando las 7 claves del contenido.
 * Espera un objeto contenido con:
 *   - saludo_inicial
 *   - balance_semana
 *   - intencion_semana
 *   - desafio_cosmico
 *   - color_semana
 *   - numero_semana
 *   - pie_de_pagina
 */ function armarMensajeDomingo(contenido, nombreSuscriptor, signo) {
  const saludo = String(contenido.saludo_inicial || "").trim();
  const balance = String(contenido.balance_semana || "").trim();
  const intencion = String(contenido.intencion_semana || "").trim();
  const desafio = String(contenido.desafio_cosmico || "").trim();
  const color = String(contenido.color_semana || "").trim();
  const numero = String(contenido.numero_semana || "").trim();
  const pie = String(contenido.pie_de_pagina || "").trim();
  const nombre = nombreSuscriptor?.trim() || "";
  const signoTexto = signo ? ` (${signo})` : "";
  const encabezadoNombre = nombre ? `, ${nombre}${signoTexto}` : signoTexto ? `${signoTexto}` : "";
  // Podés afinar el estilo más adelante, pero la idea es que quede limpio y legible.
  return [
    // Línea 1: saludo inicial + nombre/signo si aplica
    `${saludo}${encabezadoNombre}`.trim(),
    "",
    // Balance de la semana
    `✨ Balance de la semana:`,
    balance,
    "",
    // Intención
    `🎯 Intención para la nueva semana:`,
    intencion,
    "",
    // Desafío cósmico
    `🪐 Desafío cósmico:`,
    desafio,
    "",
    // Color
    `🎨 Color de la semana:`,
    color,
    "",
    // Número
    `🔢 Número de la semana:`,
    numero,
    "",
    // Cierre
    pie
  ].filter((line)=>line !== undefined && line !== null).join("\n");
}
/**
 * Envía un mensaje de texto simple por WhatsApp Cloud API.
 * Devuelve:
 *   - { ok: true, messageId } en éxito
 *   - { ok: false, error, status, raw } en error
 */ async function enviarWhatsAppTextoSimple(to, body) {
  // Validaciones mínimas de entorno
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
    return {
      ok: false,
      error: "Faltan WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN en env"
    };
  }
  const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body,
      preview_url: false
    }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const rawText = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: `HTTP ${res.status}`,
      status: res.status,
      raw: rawText
    };
  }
  try {
    const json = JSON.parse(rawText);
    const messageId = json?.messages?.[0]?.id || "";
    if (!messageId) {
      return {
        ok: false,
        error: "Respuesta WhatsApp sin message_id",
        status: res.status,
        raw: rawText
      };
    }
    return {
      ok: true,
      messageId
    };
  } catch (e) {
    return {
      ok: false,
      error: `Error parseando respuesta WhatsApp: ${e?.message || e}`,
      status: res.status,
      raw: rawText
    };
  }
}
// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
serve(async (req)=>{
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // ------------------------------------------------------------
  // Logging de alto nivel en log_funciones
  // ------------------------------------------------------------
  async function registrarLog(resultado, detalle = {}, exito = true) {
    try {
      const row = {
        nombre_funcion: FUNCION,
        resultado,
        detalle,
        exitoso: exito,
        creado_por: "system",
        fecha_registro: nowUTCISO()
      };
      let { error } = await supabase.from("log_funciones").insert([
        row
      ]);
      if (error) {
        delete row.exitoso; // compat esquemas viejos
        await supabase.from("log_funciones").insert([
          row
        ]);
      }
    } catch  {
    // noop
    }
  }
  // ------------------------------------------------------------
  // Validar que tengamos ANON_KEY (para coherencia general)
  // (Acá no se usa como JWT, pero lo validamos igual por consistencia de proyecto)
  // ------------------------------------------------------------
  if (!ANON_KEY) {
    await registrarLog("ANON_KEY_SUPABASE faltante", {
      msg: "No se encontró ANON_KEY_SUPABASE ni SUPABASE_ANON_KEY"
    }, false);
    return new Response(JSON.stringify({
      resultado: "error",
      mensaje: "ANON_KEY_SUPABASE no configurada"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // ------------------------------------------------------------
  // Parsear body (fecha opcional e incluir_reintentos opcional)
  // ------------------------------------------------------------
  let body = {};
  try {
    body = await req.json();
  } catch  {
    // Si no hay body o es inválido, usamos defaults
    body = {};
  }
  const fechaObjetivo = typeof body?.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : todayUTC();
  const incluirReintentos = typeof body?.incluir_reintentos === "boolean" ? body.incluir_reintentos : true;
  const fechaEnvioProgramada = `${fechaObjetivo}T00:00:00.000Z`;
  const fechaEnvioReal = nowUTCISO();
  // ------------------------------------------------------------
  // Buscar contenido_premium tipo 'domingo' pendiente para esa fecha
  // ------------------------------------------------------------
  const estadosBase = [
    "pendiente"
  ];
  if (incluirReintentos) estadosBase.push("reintentar");
  const { data: contenidos, error: errCont } = await supabase.from("contenido_premium").select("id, id_suscriptor, contenido, fecha_envio_programada, estado_envio, intentos, ultimo_error, signo, emocion_dominante").eq("tipo", "domingo").in("estado_envio", estadosBase).eq("fecha_envio_programada", fechaEnvioProgramada);
  if (errCont) {
    await registrarLog("Error al obtener contenidos de domingo", {
      error: errCont.message
    }, false);
    return new Response(JSON.stringify({
      resultado: "error",
      mensaje: "No se pudieron obtener contenidos de domingo"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  if (!contenidos?.length) {
    await registrarLog("Sin contenidos domingo pendientes", {
      fechaObjetivo,
      fechaEnvioProgramada
    }, true);
    return new Response(JSON.stringify({
      resultado: "sin_cambios",
      mensaje: "No hay contenidos de domingo pendientes para enviar",
      fecha_objetivo: fechaObjetivo,
      fecha_envio_programada: fechaEnvioProgramada
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // ------------------------------------------------------------
  // Obtener datos de suscriptores en un solo query
  // ------------------------------------------------------------
  const idsSuscriptores = Array.from(new Set(contenidos.map((c)=>c.id_suscriptor)));
  const { data: suscriptores, error: errSusc } = await supabase.from("suscriptores").select("id, nombre, whatsapp, signo").in("id", idsSuscriptores);
  if (errSusc) {
    await registrarLog("Error al obtener suscriptores para domingo", {
      error: errSusc.message
    }, false);
    return new Response(JSON.stringify({
      resultado: "error",
      mensaje: "No se pudieron obtener suscriptores vinculados"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  const suscriptoresMap = new Map();
  for (const s of suscriptores ?? []){
    suscriptoresMap.set(s.id, s);
  }
  // ------------------------------------------------------------
  // Procesar cada contenido pendiente
  // ------------------------------------------------------------
  const detalles = [];
  let enviados = 0;
  let conError = 0;
  for (const row of contenidos){
    const idContenido = row.id;
    const idSuscriptor = row.id_suscriptor;
    const suscriptor = suscriptoresMap.get(idSuscriptor);
    // Si no encontramos el suscriptor o no tiene whatsapp, marcamos como error
    if (!suscriptor || !suscriptor.whatsapp) {
      conError++;
      detalles.push({
        id_contenido: idContenido,
        id_suscriptor: idSuscriptor,
        motivo_error: "Suscriptor sin whatsapp o inexistente"
      });
      await supabase.from("contenido_premium").update({
        estado_envio: "error",
        ultimo_error: "Suscriptor sin whatsapp o inexistente",
        intentos: (row.intentos ?? 0) + 1,
        reintentar_despues: null
      }).eq("id", idContenido);
      continue;
    }
    // Armar el cuerpo del mensaje usando el contenido y los datos del suscriptor
    const mensaje = armarMensajeDomingo(row.contenido, suscriptor.nombre, suscriptor.signo || row.signo);
    // --------------------------------------------------------
    // MODO TEST: no enviamos a WhatsApp, simulamos éxito
    // --------------------------------------------------------
    if (MODO_TEST) {
      enviados++;
      detalles.push({
        id_contenido: idContenido,
        id_suscriptor: idSuscriptor,
        whatsapp: suscriptor.whatsapp,
        modo_test: true,
        estado: "simulado_enviado"
      });
      await supabase.from("contenido_premium").update({
        estado_envio: "enviado",
        fecha_envio_real: fechaEnvioReal,
        mensaje_id_whatsapp: "TEST-MESSAGE-ID",
        intentos: (row.intentos ?? 0) + 1,
        ultimo_error: null,
        reintentar_despues: null,
        enviado_por: "whatsapp_cloud_domingo_test"
      }).eq("id", idContenido);
      continue;
    }
    // --------------------------------------------------------
    // Envío REAL por WhatsApp Cloud API
    // --------------------------------------------------------
    try {
      const resWA = await enviarWhatsAppTextoSimple(suscriptor.whatsapp, mensaje);
      if (resWA.ok) {
        enviados++;
        detalles.push({
          id_contenido: idContenido,
          id_suscriptor: idSuscriptor,
          whatsapp: suscriptor.whatsapp,
          estado: "enviado",
          message_id: resWA.messageId
        });
        await supabase.from("contenido_premium").update({
          estado_envio: "enviado",
          fecha_envio_real: fechaEnvioReal,
          mensaje_id_whatsapp: resWA.messageId,
          intentos: (row.intentos ?? 0) + 1,
          ultimo_error: null,
          reintentar_despues: null,
          enviado_por: "whatsapp_cloud_domingo"
        }).eq("id", idContenido);
      } else {
        conError++;
        const errMsg = `${resWA.error}${resWA.status ? ` (status ${resWA.status})` : ""}`;
        detalles.push({
          id_contenido: idContenido,
          id_suscriptor: idSuscriptor,
          whatsapp: suscriptor.whatsapp,
          estado: "error_envio",
          error: errMsg
        });
        await supabase.from("contenido_premium").update({
          estado_envio: "error",
          fecha_envio_real: null,
          mensaje_id_whatsapp: null,
          intentos: (row.intentos ?? 0) + 1,
          ultimo_error: errMsg.slice(0, 400),
          // Podés definir una política de reintento diferido si querés:
          reintentar_despues: null
        }).eq("id", idContenido);
      }
    } catch (e) {
      conError++;
      const excMsg = `Excepción envío WhatsApp: ${e?.message || e}`;
      detalles.push({
        id_contenido: idContenido,
        id_suscriptor: idSuscriptor,
        whatsapp: suscriptor.whatsapp,
        estado: "error_excepcion",
        error: excMsg
      });
      await supabase.from("contenido_premium").update({
        estado_envio: "error",
        fecha_envio_real: null,
        mensaje_id_whatsapp: null,
        intentos: (row.intentos ?? 0) + 1,
        ultimo_error: excMsg.slice(0, 400),
        reintentar_despues: null
      }).eq("id", idContenido);
    }
  }
  const totalProcesados = contenidos.length;
  // ------------------------------------------------------------
  // LOG FINAL DE RESUMEN
  // ------------------------------------------------------------
  await registrarLog(enviados > 0 ? "Domingo enviado por WhatsApp" : "No se envió contenido domingo", {
    fecha_objetivo: fechaObjetivo,
    fecha_envio_programada: fechaEnvioProgramada,
    total_registros_procesados: totalProcesados,
    enviados,
    con_error: conError,
    modo_test: MODO_TEST
  }, enviados > 0 && conError === 0);
  // ------------------------------------------------------------
  // RESPUESTA HTTP
  // ------------------------------------------------------------
  return new Response(JSON.stringify({
    resultado: enviados > 0 ? "ok" : conError > 0 ? "parcial" : "sin_cambios",
    mensaje: enviados > 0 ? "Mensajes de domingo enviados (total o parcialmente)" : conError > 0 ? "Se intentó enviar, pero todos fallaron" : "No había contenidos domingo pendientes para enviar",
    fecha_objetivo: fechaObjetivo,
    fecha_envio_programada: fechaEnvioProgramada,
    total_registros_procesados: totalProcesados,
    enviados,
    errores: conError,
    detalles
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
});
