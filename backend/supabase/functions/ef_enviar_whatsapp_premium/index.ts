// Edge Function: ef_enviar_whatsapp_premium (UTC/GMT 0) — idempotente + reintentos + actualización de estado
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// ========= CONFIGURACIÓN GLOBAL =========
const MODO_PRUEBA = false; // Cambia a true en dev
const NOMBRE_FUNCION = "ef_enviar_whatsapp_premium";
const IDIOMA = "es";
const MAX_RETRY = Number(Deno.env.get("MAX_RETRY") || 3);
// Fallbacks seguros para llamadas internas
const EDGE_BASE_URL = Deno.env.get("EDGE_BASE_URL") ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1`; // ej: https://xxx.supabase.co/functions/v1
const INTERNAL_TOKEN = Deno.env.get("INTERNAL_TOKEN") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// ========= UTC & LOGGING =========
function nowUTCISO() {
  return new Date().toISOString();
}
async function registrarLog(supabase, resultado, detalle = {}, exito = true, creadoPor = 'system') {
  try {
    const { error } = await supabase.from('log_funciones').insert([
      {
        nombre_funcion: NOMBRE_FUNCION,
        resultado,
        detalle,
        exito,
        creado_por: creadoPor,
        fecha_registro: nowUTCISO()
      }
    ]);
    if (error) {
      console.error('Error al guardar el log:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Excepción al intentar guardar log:', err);
    return false;
  }
}
// ========= HELPERS APP =========
function sleep(ms) {
  return new Promise((r)=>setTimeout(r, ms));
}
// Arma parámetros por defecto desde contenido_premium.contenido
function defaultParamsFromContenido(contenido) {
  const orden = [
    "horoscopo",
    "frase_inspiradora",
    "numero_de_la_suerte",
    "color_de_la_suerte",
    "pausa_cosmica"
  ];
  const params = {};
  for (const k of orden)params[k] = (contenido?.[k] ?? "").toString();
  return {
    orden_parametros: orden,
    parametros: params
  };
}
// Clasifica error del provider
function classifyProvider(waResOk, waStatus, waJson) {
  if (waResOk) return {
    code: "OK",
    reason: ""
  };
  // 429/5xx -> transitorio
  if (waStatus === 429 || waStatus >= 500 && waStatus <= 599) return {
    code: "TRANSIENT",
    reason: waJson?.error?.message || "rate/5xx"
  };
  // 4xx -> duro
  return {
    code: "HARD",
    reason: waJson?.error?.message || `HTTP_${waStatus}`
  };
}
// ========= MAIN =========
serve(async (req)=>{
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  // -------- Parse body --------
  let body;
  try {
    body = await req.json();
  } catch  {
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'JSON inválido'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // Soportamos 2 estilos de input:
  // A) Mínimo (plan): { id_suscriptor, id_contenido, canal:'whatsapp', mensaje_idempotencia }
  // B) Completo (tu versión): + whatsapp, nombre_plantilla, incluir_encabezado, img_url, parametros, orden_parametros
  const { id_suscriptor, id_contenido, canal = 'whatsapp', mensaje_idempotencia, whatsapp: whatsappIn, nombre_plantilla = 'envio_contenido_premium_Es', incluir_encabezado = false, img_url = "", parametros: parametrosIn = {}, orden_parametros: ordenIn = [] } = body || {};
  if (!id_suscriptor || !id_contenido || canal !== 'whatsapp') {
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'Faltan campos: id_suscriptor, id_contenido y canal=whatsapp'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // ===== Idempotencia de envío (reutiliza si ya está enviado con ese mensaje_idempotencia)
  if (mensaje_idempotencia) {
    const { data: ya, error: e0 } = await supabase.from('contenido_premium').select('estado_envio, mensaje_id_whatsapp').eq('mensaje_idempotencia', mensaje_idempotencia).maybeSingle();
    if (e0) {
      await registrarLog(supabase, 'error_idempotencia_check', {
        e0
      }, false);
    } else if (ya && ya.estado_envio === 'enviado') {
      await registrarLog(supabase, 'reuse_enviado', {
        mensaje_idempotencia
      }, true);
      return new Response(JSON.stringify({
        resultado: 'ok',
        reused: true,
        intento: 0,
        wa_message_id: ya.mensaje_id_whatsapp
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
  }
  // Guarda la idempotencia en la fila si vino
  if (mensaje_idempotencia) {
    await supabase.from('contenido_premium').update({
      mensaje_idempotencia
    }).eq('id', id_contenido);
  }
  // ===== 1) MODO PRUEBA =====
  if (MODO_PRUEBA) {
    await supabase.from('mensajes_enviados').insert([
      {
        whatsapp_destino: whatsappIn || null,
        tipo_mensaje: 'contenido_premium',
        estado: 'prueba',
        id_suscriptor,
        id_contenido,
        canal_envio: 'whatsapp',
        resultado_envio: '[PRUEBA] Mensaje simulado como enviado',
        sent_at_utc: nowUTCISO(),
        plantilla: nombre_plantilla
      }
    ]);
    await registrarLog(supabase, 'ok_prueba', {
      id_suscriptor,
      id_contenido,
      whatsapp: whatsappIn
    }, true);
    return new Response(JSON.stringify({
      resultado: 'ok',
      mensaje: '[PRUEBA] Mensaje simulado como enviado',
      id_suscriptor,
      id_contenido
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // ===== 2) Cargar contexto: contenido + número whatsapp si no vino
  const { data: cont, error: e1 } = await supabase.from('contenido_premium').select('id, contenido, tipo').eq('id', id_contenido).maybeSingle();
  if (e1 || !cont) {
    await registrarLog(supabase, 'error_contenido_no_encontrado', {
      e1,
      id_contenido
    }, false);
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'Contenido no encontrado'
    }), {
      status: 404
    });
  }
  let whatsapp = whatsappIn;
  if (!whatsapp) {
    const { data: sus, error: e2 } = await supabase.from('suscriptores').select('whatsapp').eq('id', id_suscriptor).maybeSingle();
    if (e2 || !sus?.whatsapp) {
      await registrarLog(supabase, 'error_whatsapp_inexistente', {
        id_suscriptor,
        e2
      }, false);
      return new Response(JSON.stringify({
        resultado: 'error',
        mensaje: 'No hay número de WhatsApp para el suscriptor'
      }), {
        status: 400
      });
    }
    whatsapp = sus.whatsapp;
  }
  // ===== 3) CONFIG WHATSAPP =====
  const { data: config, error: configErr } = await supabase.from('configuracion').select('whatsapp_token_app, whatsapp_phone_number_id').maybeSingle();
  if (configErr || !config?.whatsapp_token_app || !config?.whatsapp_phone_number_id) {
    await registrarLog(supabase, 'error_config_whatsapp', {
      configErr
    }, false);
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'No hay configuración válida de WhatsApp'
    }), {
      status: 500
    });
  }
  const WA_TOKEN = config.whatsapp_token_app;
  const WA_PHONE_ID = config.whatsapp_phone_number_id;
  // ===== 4) Parámetros/plantilla
  let orden_parametros = Array.isArray(ordenIn) ? [
    ...ordenIn
  ] : [];
  let parametros = parametrosIn && typeof parametrosIn === 'object' ? {
    ...parametrosIn
  } : {};
  if (!orden_parametros.length) {
    const def = defaultParamsFromContenido(cont.contenido || {});
    orden_parametros = def.orden_parametros;
    parametros = def.parametros;
  }
  const components = [];
  // header opcional con imagen
  if (img_url && body.incluir_encabezado === true) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            link: img_url
          }
        }
      ]
    });
  }
  components.push({
    type: "body",
    parameters: orden_parametros.map((param_name)=>({
        type: "text",
        parameter_name: param_name,
        text: parametros[param_name] ?? ""
      }))
  });
  const payload = {
    messaging_product: "whatsapp",
    to: whatsapp,
    type: "template",
    template: {
      name: nombre_plantilla,
      language: {
        code: IDIOMA
      },
      components
    }
  };
  // ===== 5) ENVÍO + REINTENTOS =====
  let intento = 0;
  let lastErrMsg = "";
  let lastWaJson = null;
  while(intento < MAX_RETRY){
    intento++;
    let waRes, waJson;
    try {
      waRes = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WA_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      waJson = await waRes.json();
    } catch (err) {
      // Timeout / network -> transitorio
      lastErrMsg = String(err?.message || err);
      lastWaJson = {
        error: {
          message: lastErrMsg
        }
      };
      if (intento >= MAX_RETRY) break;
      await registrarLog(supabase, 'envio_transient_fetch', {
        intento,
        lastErrMsg
      }, false);
      await sleep(500 * intento);
      continue;
    }
    const cls = classifyProvider(waRes.ok, waRes.status, waJson);
    if (cls.code === "OK") {
      const wa_message_id = waJson?.messages?.[0]?.id ?? null;
      // Registro en mensajes_enviados
      await supabase.from('mensajes_enviados').insert([
        {
          whatsapp_destino: whatsapp,
          tipo_mensaje: 'contenido_premium',
          estado: 'enviado',
          id_suscriptor,
          id_contenido,
          canal_envio: 'whatsapp',
          resultado_envio: JSON.stringify(waJson),
          sent_at_utc: nowUTCISO(),
          plantilla: nombre_plantilla,
          wa_message_id
        }
      ]);
      // Actualizar estado real (idempotente)
      await fetch(`${EDGE_BASE_URL}/ef_actualiza_envio_real_premium`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${INTERNAL_TOKEN}`
        },
        body: JSON.stringify({
          id_contenido,
          estado: "enviado",
          mensaje_id_whatsapp: wa_message_id,
          intentos: intento
        })
      });
      await registrarLog(supabase, 'enviado_ok', {
        id_suscriptor,
        id_contenido,
        wa_message_id,
        intento
      }, true);
      return new Response(JSON.stringify({
        resultado: 'ok',
        mensaje: 'Mensaje enviado correctamente por WhatsApp',
        id_suscriptor,
        id_contenido,
        intento,
        wa_message_id
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // No OK
    lastErrMsg = cls.reason;
    lastWaJson = waJson;
    // HARD -> cortar
    if (cls.code === "HARD") {
      await supabase.from('mensajes_enviados').insert([
        {
          whatsapp_destino: whatsapp,
          tipo_mensaje: 'contenido_premium',
          estado: 'error',
          id_suscriptor,
          id_contenido,
          canal_envio: 'whatsapp',
          resultado_envio: waJson?.error?.message || 'Error',
          sent_at_utc: nowUTCISO(),
          plantilla: nombre_plantilla,
          wa_message_id: null
        }
      ]);
      await fetch(`${EDGE_BASE_URL}/ef_actualiza_envio_real_premium`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${INTERNAL_TOKEN}`
        },
        body: JSON.stringify({
          id_contenido,
          estado: "error",
          error_text: lastErrMsg,
          intentos: intento
        })
      });
      await registrarLog(supabase, 'error_hard', {
        id_suscriptor,
        id_contenido,
        intento,
        http_status: waRes.status,
        lastErrMsg
      }, false);
      return new Response(JSON.stringify({
        resultado: 'error',
        tipo: 'HARD',
        detalle: lastWaJson
      }), {
        status: 422,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // TRANSIENT -> backoff y reintentar
    await registrarLog(supabase, 'envio_transient', {
      intento,
      http_status: waRes.status,
      lastErrMsg
    }, false);
    await sleep(500 * intento);
  }
  // Agotó reintentos -> registramos como transitorio agotado, dejamos pendiente
  await supabase.from('mensajes_enviados').insert([
    {
      whatsapp_destino: body.whatsapp || null,
      tipo_mensaje: 'contenido_premium',
      estado: 'error',
      id_suscriptor,
      id_contenido,
      canal_envio: 'whatsapp',
      resultado_envio: lastErrMsg || 'retry_exceeded',
      sent_at_utc: nowUTCISO(),
      plantilla: nombre_plantilla,
      wa_message_id: null
    }
  ]);
  await fetch(`${EDGE_BASE_URL}/ef_actualiza_envio_real_premium`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${INTERNAL_TOKEN}`
    },
    body: JSON.stringify({
      id_contenido,
      estado: "pendiente",
      error_text: lastErrMsg || 'retry_exceeded',
      intentos: MAX_RETRY
    })
  });
  await registrarLog(supabase, 'error_transient_agotado', {
    id_suscriptor,
    id_contenido,
    lastErrMsg
  }, false);
  return new Response(JSON.stringify({
    resultado: 'error',
    tipo: 'TRANSIENT',
    detalle: lastWaJson || {
      message: 'retry_exceeded'
    }
  }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
