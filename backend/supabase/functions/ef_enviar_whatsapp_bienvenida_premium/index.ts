// ============================================================================
// EDGE FUNCTION: ef_enviar_whatsapp_bienvenida_premium
// ============================================================================
// Propósito:
//   Enviar el MENSAJE DE BIENVENIDA + CONFIRMACIÓN al suscriptor PREMIUM
//   recién activado (según Mercado Pago), usando contenido PERSONALIZADO
//   generado por OpenAI vía otra Edge Function:
//
//     -> ef_openia_genera_mensaje_bienvenida
//
//   Esta EF:
//     - NO marca whatsapp_confirmado.
//     - NO da de baja la suscripción.
//   Solo envía el mensaje inicial. La confirmación real se manejará en el
//   webhook entrante de WhatsApp cuando el usuario responda.
//
// Flujo:
//   1) Recibe { id_suscriptor, motivo? } por POST.
//   2) Valida que el suscriptor exista y sea premium activo.
//   3) Obtiene la plantilla "prompt_bienvenida_premium" desde `plantillas`.
//   4) Arma el prompt final con nombre, signo, contenido_preferido.
//   5) Llama a ef_openia_genera_mensaje_bienvenida (ANON KEY) para generar
//      el JSON con:
//        - saludo_inicial
//        - cuerpo_bienvenida
//        - instruccion_confirmacion
//        - info_cancelacion
//        - pie_cercania
//   6) Construye el texto final para WhatsApp concatenando esos campos.
//   7) Envía un mensaje de texto por WhatsApp Cloud API.
//   8) Registra el resultado en `mensajes_enviados` y `log_funciones`.
//
// Env vars esperadas:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - SUPABASE_ANON_KEY
//   - WHATSAPP_TOKEN
//   - WHATSAPP_PHONE_NUMBER_ID
//   - WHATSAPP_API_BASE (opcional, default v20.0)
//   - NOMBRE_PLANTILLA_BIENVENIDA   (ej: "prompt_bienvenida_premium")
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
// --------------------------------------------------------------------------
// Constantes de función
// --------------------------------------------------------------------------
const FUNCION = "ef_enviar_whatsapp_bienvenida_premium";
// Supabase
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
// WhatsApp Cloud API
const WHATSAPP_API_BASE = Deno.env.get("WHATSAPP_API_BASE") || "https://graph.facebook.com/v20.0";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") || "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
// Nombre del registro en la tabla `plantillas` para el prompt de bienvenida
const NOMBRE_PLANTILLA_BIENVENIDA = Deno.env.get("NOMBRE_PLANTILLA_BIENVENIDA") || "prompt_bienvenida_premium";
// Nombre de la EF de OpenAI que genera el JSON de bienvenida
const FN_OPENIA_BIENVENIDA = "ef_openia_genera_mensaje_bienvenida";
// Cliente Supabase (service role) para lecturas/escrituras y logs
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// Helpers genéricos
// ============================================================================
// Fecha/hora en UTC (ISO) para logs y timestamptz
function nowUTCISO() {
  return new Date().toISOString();
}
// --------------------------------------------------------------------------
// Logging unificado en log_funciones
// --------------------------------------------------------------------------
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
    // Compatibilidad con esquemas viejos (sin 'exitoso')
    if (error) {
      delete row.exitoso;
      await supabase.from("log_funciones").insert([
        row
      ]);
    }
  } catch (e) {
    console.error(`[${FUNCION}] Error interno al registrar log`, e);
  }
}
// --------------------------------------------------------------------------
// Llamada a EF de OpenAI para generar el JSON de bienvenida
// --------------------------------------------------------------------------
async function generarMensajeBienvenidaOpenAI(params) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Config Supabase incompleta (URL o ANON_KEY faltante).");
  }
  // 1) Leer plantilla desde tabla `plantillas`
  const { data: plantilla, error: errPlantilla } = await supabase.from("plantillas").select("contenido").eq("nombre", NOMBRE_PLANTILLA_BIENVENIDA).maybeSingle();
  if (errPlantilla || !plantilla?.contenido) {
    throw new Error(`Plantilla de bienvenida no encontrada o con error: ${errPlantilla?.message ?? "sin contenido"}`);
  }
  const contenidoPlantilla = String(plantilla.contenido);
  // 2) Reemplazar placeholders
  const prompt = contenidoPlantilla.replaceAll("{{nombre}}", params.nombre).replaceAll("{{signo}}", params.signo).replaceAll("{{contenido_preferido}}", params.contenido_preferido);
  // 3) Llamar a la EF de OpenAI (token ANON)
  const url = `${SUPABASE_URL}/functions/v1/${FN_OPENIA_BIENVENIDA}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      prompt
    })
  });
  const text = await res.text();
  if (!res.ok) {
    // Logueo arriba en el caller; acá lanzo error con detalle
    throw new Error(`Error HTTP al llamar ${FN_OPENIA_BIENVENIDA}: ${res.status} - ${text}`);
  }
  let json = {};
  try {
    json = JSON.parse(text);
  } catch  {
    throw new Error(`Respuesta no JSON desde ${FN_OPENIA_BIENVENIDA}: ${text.slice(0, 300)}`);
  }
  // Validación mínima: deben existir las 5 claves
  const requiredKeys = [
    "saludo_inicial",
    "cuerpo_bienvenida",
    "instruccion_confirmacion",
    "info_cancelacion",
    "pie_cercania"
  ];
  const faltantes = requiredKeys.filter((k)=>!json?.[k] || String(json[k]).trim() === "");
  if (faltantes.length > 0) {
    throw new Error(`JSON de bienvenida incompleto, faltan: ${faltantes.join(", ")}`);
  }
  return json;
}
// --------------------------------------------------------------------------
// Llamada a WhatsApp Cloud API para enviar mensaje de TEXTO
// --------------------------------------------------------------------------
async function enviarWhatsAppTexto(params) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("Config de WhatsApp incompleta (TOKEN o PHONE_NUMBER_ID).");
  }
  const { to, bodyText } = params;
  const url = `${WHATSAPP_API_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      preview_url: false,
      body: bodyText
    }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`WhatsApp HTTP ${res.status} - ${res.statusText} - ${text}`);
  }
  let json = {};
  try {
    json = JSON.parse(text);
  } catch  {
    json = {
      raw: text
    };
  }
  const messageId = json?.messages?.[0]?.id || null;
  return {
    messageId,
    raw: json,
    payloadEnviado: body
  };
}
// --------------------------------------------------------------------------
// Arma el texto final de bienvenida a partir del JSON de GPT
// --------------------------------------------------------------------------
function construirTextoWhatsApp(contenido) {
  // Estructura simple, legible y con cortes claros
  const partes = [
    contenido.saludo_inicial,
    contenido.cuerpo_bienvenida,
    contenido.instruccion_confirmacion,
    contenido.info_cancelacion,
    contenido.pie_cercania
  ].map((p)=>String(p ?? "").trim()).filter((p)=>p.length > 0);
  return partes.join("\n\n");
}
// ============================================================================
// Handler principal de la Edge Function
// ============================================================================
serve(async (req)=>{
  // ------------------------------------------------------------
  // Validar método
  // ------------------------------------------------------------
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Método no permitido, use POST"
    }), {
      status: 405,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // ------------------------------------------------------------
  // Parsear body
  // ------------------------------------------------------------
  let body = {};
  try {
    body = await req.json();
  } catch (e) {
    await registrarLog("JSON inválido", {
      error: String(e)
    }, false);
    return new Response(JSON.stringify({
      error: "JSON inválido"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  const id_suscriptor = body?.id_suscriptor;
  const motivo = typeof body?.motivo === "string" ? body.motivo : "alta_premium";
  if (!id_suscriptor) {
    await registrarLog("Falta id_suscriptor en body", {
      body
    }, false);
    return new Response(JSON.stringify({
      error: "Falta id_suscriptor"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  try {
    // ----------------------------------------------------------
    // 1) Obtener suscriptor desde la BD
    // ----------------------------------------------------------
    const { data: suscriptor, error: errSusc } = await supabase.from("suscriptores").select("id, nombre, whatsapp, tipo_suscripcion, estado_suscripcion, whatsapp_confirmado, signo, contenido_preferido").eq("id", id_suscriptor).maybeSingle();
    if (errSusc) {
      await registrarLog("Error obteniendo suscriptor", {
        id_suscriptor,
        error: errSusc.message
      }, false);
      return new Response(JSON.stringify({
        error: "Error obteniendo suscriptor"
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    if (!suscriptor) {
      await registrarLog("Suscriptor no encontrado", {
        id_suscriptor
      }, false);
      return new Response(JSON.stringify({
        error: "Suscriptor no encontrado"
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // ----------------------------------------------------------
    // 2) Validar que sea premium activo
    // ----------------------------------------------------------
    if (suscriptor.tipo_suscripcion !== "premium" || suscriptor.estado_suscripcion !== "activa") {
      await registrarLog("Suscriptor no es premium activo", {
        id_suscriptor,
        suscriptor
      }, false);
      return new Response(JSON.stringify({
        error: "Suscriptor no es premium activo"
      }), {
        status: 409,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // ----------------------------------------------------------
    // 3) Validar que tenga WhatsApp cargado
    // ----------------------------------------------------------
    const telefono = suscriptor.whatsapp;
    if (!telefono || telefono.trim().length === 0) {
      await registrarLog("Suscriptor sin WhatsApp", {
        id_suscriptor,
        suscriptor
      }, false);
      return new Response(JSON.stringify({
        error: "El suscriptor no tiene WhatsApp cargado"
      }), {
        status: 409,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // ----------------------------------------------------------
    // 4) Evitar reenviar bienvenida si ya confirmó WhatsApp
    //     (la lógica de marcado se hará en el webhook entrante)
    // ----------------------------------------------------------
    if (suscriptor.whatsapp_confirmado === true) {
      await registrarLog("Bienvenida no enviada (ya confirmado)", {
        id_suscriptor
      }, true);
      return new Response(JSON.stringify({
        resultado: "ya_confirmado",
        mensaje: "El suscriptor ya confirmó WhatsApp, no se reenvía bienvenida."
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // ----------------------------------------------------------
    // 5) Generar contenido de bienvenida con OpenAI (vía EF)
    // ----------------------------------------------------------
    const nombreFinal = suscriptor.nombre?.trim() || "amiga";
    const signoFinal = suscriptor.signo?.trim() || "tu signo";
    const contenidoPreferido = suscriptor.contenido_preferido?.trim() || "General";
    let jsonBienvenida;
    try {
      jsonBienvenida = await generarMensajeBienvenidaOpenAI({
        nombre: nombreFinal,
        signo: signoFinal,
        contenido_preferido: contenidoPreferido
      });
    } catch (e) {
      await registrarLog("Error generando mensaje de bienvenida (OpenAI)", {
        id_suscriptor,
        error: String(e?.message || e)
      }, false);
      return new Response(JSON.stringify({
        resultado: "error",
        mensaje: "No se pudo generar el mensaje de bienvenida",
        detalle: String(e?.message || e)
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    const textoWhatsApp = construirTextoWhatsApp(jsonBienvenida);
    // ----------------------------------------------------------
    // 6) Enviar mensaje de texto por WhatsApp
    // ----------------------------------------------------------
    const envio = await enviarWhatsAppTexto({
      to: telefono,
      bodyText: textoWhatsApp
    });
    // ----------------------------------------------------------
    // 7) Registrar en mensajes_enviados
    //     (adaptá nombres de columnas a tu modelo real)
    // ----------------------------------------------------------
    const mensajeRow = {
      id_suscriptor: suscriptor.id,
      telefono,
      canal: "whatsapp",
      tipo_mensaje: "bienvenida_premium",
      template_nombre: null,
      payload_enviado: {
        json_bienvenida: jsonBienvenida,
        mensaje_texto: textoWhatsApp,
        request_whatsapp: envio.payloadEnviado
      },
      respuesta_raw: envio.raw,
      mensaje_id_whatsapp: envio.messageId,
      estado: "enviado",
      fecha_envio: nowUTCISO(),
      creado_por: "system"
    };
    try {
      await supabase.from("mensajes_enviados").insert([
        mensajeRow
      ]);
    } catch (e) {
      console.error(`[${FUNCION}] Error insertando en mensajes_enviados`, e);
    // No hacemos throw para no romper la EF
    }
    // ----------------------------------------------------------
    // 8) Log final OK
    // ----------------------------------------------------------
    await registrarLog("Bienvenida premium enviada (GPT + WhatsApp)", {
      id_suscriptor,
      telefono,
      motivo,
      mensaje_id_whatsapp: envio.messageId
    }, true);
    return new Response(JSON.stringify({
      resultado: "ok",
      mensaje: "Mensaje de bienvenida enviado",
      id_suscriptor,
      telefono,
      motivo,
      mensaje_id_whatsapp: envio.messageId
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    // ----------------------------------------------------------
    // Manejo de excepción general
    // ----------------------------------------------------------
    await registrarLog("Excepción en ef_enviar_whatsapp_bienvenida_premium", {
      id_suscriptor,
      error: String(e?.message || e)
    }, false);
    return new Response(JSON.stringify({
      resultado: "error",
      mensaje: "Excepción al enviar bienvenida",
      detalle: String(e?.message || e)
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
