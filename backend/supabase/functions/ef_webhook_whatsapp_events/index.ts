// ============================================================================
// EDGE FUNCTION: ef_webhook_whatsapp_events
// ============================================================================
// CAPA 1 (captura técnica) - Webhook OFICIAL configurado en Meta
//
// OBJETIVO MVP:
// ---------------------------------------------------------------------------
// Esta función cumple 3 responsabilidades simples:
//
// 1) Responder el GET challenge de Meta para validar el webhook.
// 2) Recibir POSTs de WhatsApp Cloud API y guardar SIEMPRE el evento
//    en la tabla public.whatsapp_webhook_events con el mayor detalle útil.
// 3) Si el evento trae messages[], llamar a CAPA 2:
//      ef_webhook_whatsapp_inbound
//    pasando x-internal-key = WHATSAPP_INTERNAL_KEY.
//
// REGLAS IMPORTANTES:
// ---------------------------------------------------------------------------
// - NO rompe el flujo si falla DB o falla CAPA 2.
// - SIEMPRE responde 200 OK a Meta en POST.
// - NO implementa deduplicación.
// - NO implementa validación de firma.
// - NO implementa correlation_id.
// - NO implementa fingerprint.
// - Es una versión conservadora para MVP.
//
// REQUISITOS DE ENTORNO:
// ---------------------------------------------------------------------------
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - WHATSAPP_VERIFY_TOKEN
// - WHATSAPP_INTERNAL_KEY
//
// OPCIONALES:
// - WHATSAPP_INBOUND_FUNCTION_URL
// - SUPABASE_FUNCTIONS_URL
// - ANON_KEY_SUPABASE        (si CAPA 2 exige verify_jwt=true)
// - SUPABASE_ANON_KEY        (fallback si usás este nombre)
//
// TABLAS USADAS:
// ---------------------------------------------------------------------------
// - public.whatsapp_webhook_events
// - public.log_funciones
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const FUNCION = "ef_webhook_whatsapp_events";
// ============================================================================
// ENV
// ============================================================================
// Token de verificación que Meta envía en el GET challenge.
// Debe coincidir exactamente con el configurado en Meta Developers.
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
// Credenciales de Supabase para insertar y actualizar registros.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Base URL para funciones Edge.
// Si no viene explícita, la derivamos desde SUPABASE_URL.
const FUNCTIONS_BASE_URL = Deno.env.get("SUPABASE_FUNCTIONS_URL") || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : "");
// URL directa a la CAPA 2 (inbound).
// Si no la definís explícitamente, se deriva automáticamente.
const WHATSAPP_INBOUND_FUNCTION_URL = Deno.env.get("WHATSAPP_INBOUND_FUNCTION_URL") || (FUNCTIONS_BASE_URL ? `${FUNCTIONS_BASE_URL}/ef_webhook_whatsapp_inbound` : "");
// Clave interna que CAPA 1 envía a CAPA 2.
// Esto te permite validar que la llamada viene de tu backend.
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
// JWT opcional para llamar a CAPA 2 si esa función tiene verify_jwt=true.
// Mantengo ANON_KEY_SUPABASE por compatibilidad con tu implementación actual.
// Agrego fallback a SUPABASE_ANON_KEY por si ese es el nombre real en tu proyecto.
const INTERNAL_JWT = Deno.env.get("ANON_KEY_SUPABASE") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// ============================================================================
// HELPERS
// ============================================================================
// Devuelve fecha/hora actual en ISO UTC.
function nowUTCISO() {
  return new Date().toISOString();
}
// Convierte epoch (segundos o milisegundos) a ISO UTC.
// Si el valor no existe o es inválido, devuelve null.
function epochToUTCISO(ts) {
  if (ts == null) return null;
  const n = Number(ts);
  if (!isFinite(n)) return null;
  // Si parece venir en segundos, lo convertimos a ms.
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
// Convierte los headers del request a un objeto plano para guardarlo en jsonb.
function headersToObject(req) {
  try {
    return Object.fromEntries(req.headers.entries());
  } catch  {
    return {};
  }
}
// ============================================================================
// LOGGER A log_funciones
// ============================================================================
// Este logger NO debe romper jamás la ejecución principal.
// Si falla, lo informamos por consola y seguimos.
// ============================================================================
async function registrarLog(supabase, resultado, detalle = {}, exito = true) {
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
    console.error(`[${FUNCION}] Error al registrar log`, e);
  }
}
// ============================================================================
// EXTRACTOR DE DATOS DEL EVENTO WHATSAPP
// ============================================================================
// Esta función intenta leer el payload típico de Meta y extraer:
// - si es evento de mensaje
// - si es evento de status
// - ids útiles
// - timestamps útiles
// - metadata del número
// - tipo de mensaje
//
// Es tolerante a payloads incompletos.
// Si algo no existe, devuelve null o false según corresponda.
// ============================================================================
function resumirEventoWhatsApp(body) {
  let object_type = null;
  let change_field = null;
  let tipo_evento = null;
  let whatsapp_message_id = null;
  let wamid = null;
  let status = null;
  let message_type = null;
  let from_number = null;
  let profile_name = null;
  let phone_number_id = null;
  let display_phone_number = null;
  let entry_time_utc = null;
  let meta_timestamp_utc = null;
  let esEventoDeMensaje = false;
  let esEventoDeStatus = false;
  try {
    const entry = Array.isArray(body?.entry) ? body.entry[0] : null;
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = Array.isArray(value?.messages) ? value.messages[0] : null;
    const st = Array.isArray(value?.statuses) ? value.statuses[0] : null;
    object_type = typeof body?.object === "string" ? body.object : null;
    change_field = typeof change?.field === "string" ? change.field : null;
    tipo_evento = change_field;
    entry_time_utc = epochToUTCISO(entry?.time);
    phone_number_id = typeof value?.metadata?.phone_number_id === "string" ? value.metadata.phone_number_id : null;
    display_phone_number = typeof value?.metadata?.display_phone_number === "string" ? value.metadata.display_phone_number : null;
    profile_name = typeof value?.contacts?.[0]?.profile?.name === "string" ? value.contacts[0].profile.name : null;
    // ------------------------------------------------------------------------
    // Evento statuses[]
    // ------------------------------------------------------------------------
    if (st) {
      esEventoDeStatus = true;
      whatsapp_message_id = typeof st?.id === "string" ? st.id : whatsapp_message_id;
      wamid = typeof st?.id === "string" ? st.id : wamid;
      status = typeof st?.status === "string" ? st.status : status;
      meta_timestamp_utc = epochToUTCISO(st?.timestamp) ?? meta_timestamp_utc;
      if (!tipo_evento) tipo_evento = "statuses";
    }
    // ------------------------------------------------------------------------
    // Evento messages[]
    // ------------------------------------------------------------------------
    if (msg) {
      esEventoDeMensaje = true;
      whatsapp_message_id = typeof msg?.id === "string" ? msg.id : whatsapp_message_id;
      wamid = typeof msg?.id === "string" ? msg.id : wamid;
      message_type = typeof msg?.type === "string" ? msg.type : null;
      from_number = typeof msg?.from === "string" ? msg.from : null;
      // Si es mensaje entrante y todavía no teníamos status, dejamos uno simple
      // para el MVP.
      status = status ?? "message_received";
      meta_timestamp_utc = epochToUTCISO(msg?.timestamp) ?? meta_timestamp_utc;
      if (!tipo_evento) tipo_evento = "messages";
    }
  } catch  {
  // No rompemos CAPA 1 si el payload viene raro.
  }
  return {
    object_type,
    change_field,
    tipo_evento,
    whatsapp_message_id,
    wamid,
    status,
    message_type,
    from_number,
    profile_name,
    phone_number_id,
    display_phone_number,
    entry_time_utc,
    meta_timestamp_utc,
    received_at_utc: nowUTCISO(),
    esEventoDeMensaje,
    esEventoDeStatus
  };
}
// ============================================================================
// LLAMADA A CAPA 2
// ============================================================================
// Esta función encapsula el POST a ef_webhook_whatsapp_inbound.
//
// Mantengo tu enfoque actual:
// - x-internal-key para autenticación propia
// - Authorization/apikey si CAPA 2 tiene verify_jwt=true
//
// Si no tenés JWT interno configurado, igualmente enviamos sólo x-internal-key.
// ============================================================================
async function llamarInbound(params) {
  const headers = {
    "Content-Type": "application/json",
    "x-internal-key": params.internalKey
  };
  // Sólo agregamos Authorization/apikey si existe un JWT interno configurado.
  if (INTERNAL_JWT) {
    headers["Authorization"] = `Bearer ${INTERNAL_JWT}`;
    headers["apikey"] = INTERNAL_JWT;
  }
  const r = await fetch(params.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      payload: params.payload,
      id_evento: params.id_evento
    })
  });
  const txt = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(txt);
  } catch  {
    parsed = {
      raw: txt
    };
  }
  return {
    ok: r.ok,
    http_status: r.status,
    body: parsed
  };
}
// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
serve(async (req)=>{
  // --------------------------------------------------------------------------
  // (A) GET CHALLENGE DE META
  // --------------------------------------------------------------------------
  // Meta llama este endpoint con:
  // - hub.mode
  // - hub.verify_token
  // - hub.challenge
  //
  // Si el token coincide, debemos devolver EXACTAMENTE el challenge.
  // --------------------------------------------------------------------------
  if (req.method === "GET") {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");
    if (mode === "subscribe" && challenge && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge, {
        status: 200,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
  // --------------------------------------------------------------------------
  // (B) POST EVENTOS WHATSAPP
  // --------------------------------------------------------------------------
  // Regla de oro:
  // Meta debe recibir 200 OK aunque algo falle internamente.
  // --------------------------------------------------------------------------
  let body = null;
  try {
    body = await req.json();
  } catch  {
    body = null;
  }
  // Si falta configuración crítica de Supabase, no podemos persistir.
  // Aun así, respondemos OK para no romper el webhook.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[${FUNCION}] Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY`);
    return new Response("OK", {
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // Extraemos resumen del evento con tolerancia a payloads parciales.
  const resumen = resumirEventoWhatsApp(body);
  // ID del registro insertado en whatsapp_webhook_events.
  let idEvento = null;
  // --------------------------------------------------------------------------
  // 1) GUARDAR SIEMPRE EL EVENTO EN whatsapp_webhook_events
  // --------------------------------------------------------------------------
  // Esta es la persistencia principal del webhook.
  // Guardamos payload + resumen útil + datos técnicos del request.
  // --------------------------------------------------------------------------
  try {
    const { data: inserted, error: evErr } = await supabase.from("whatsapp_webhook_events").insert([
      {
        http_method: req.method,
        query_string: new URL(req.url).search,
        headers: headersToObject(req),
        payload: body,
        object_type: resumen.object_type,
        entry_time_utc: resumen.entry_time_utc,
        change_field: resumen.change_field,
        tipo_evento: resumen.tipo_evento,
        es_evento_mensaje: resumen.esEventoDeMensaje,
        es_evento_status: resumen.esEventoDeStatus,
        // IMPORTANTE:
        // En tu tabla nueva el nombre correcto es whatsapp_message_id.
        whatsapp_message_id: resumen.whatsapp_message_id,
        wamid: resumen.wamid,
        status: resumen.status,
        message_type: resumen.message_type,
        from_number: resumen.from_number,
        profile_name: resumen.profile_name,
        phone_number_id: resumen.phone_number_id,
        display_phone_number: resumen.display_phone_number,
        meta_timestamp_utc: resumen.meta_timestamp_utc,
        received_at_utc: resumen.received_at_utc,
        // Campos del MVP: no agregamos lógica nueva.
        processing_status: "received",
        inbound_called: false
      }
    ]).select("id").maybeSingle();
    if (evErr) {
      await registrarLog(supabase, "error_guardar_evento", {
        error: evErr.message,
        resumen
      }, false);
    } else {
      idEvento = inserted?.id ?? null;
      await registrarLog(supabase, "evento_guardado", {
        idEvento,
        resumen
      }, true);
    }
  } catch (e) {
    await registrarLog(supabase, "excepcion_guardar_evento", {
      error: String(e?.message || e),
      resumen
    }, false);
  }
  // --------------------------------------------------------------------------
  // 2) SI ES messages[] -> LLAMAR CAPA 2
  // --------------------------------------------------------------------------
  // statuses[] NO disparan inbound.
  // --------------------------------------------------------------------------
  if (resumen.esEventoDeMensaje) {
    if (!WHATSAPP_INBOUND_FUNCTION_URL) {
      await registrarLog(supabase, "inbound_no_llamado", {
        idEvento,
        motivo: "no_inbound_url",
        resumen
      }, true);
    } else if (!WHATSAPP_INTERNAL_KEY) {
      await registrarLog(supabase, "inbound_no_llamado", {
        idEvento,
        motivo: "missing_WHATSAPP_INTERNAL_KEY",
        resumen
      }, false);
    } else {
      try {
        const resInbound = await llamarInbound({
          url: WHATSAPP_INBOUND_FUNCTION_URL,
          internalKey: WHATSAPP_INTERNAL_KEY,
          payload: body,
          id_evento: idEvento
        });
        // --------------------------------------------------------------
        // Actualizamos el registro principal con el resultado de inbound
        // --------------------------------------------------------------
        if (idEvento) {
          await supabase.from("whatsapp_webhook_events").update({
            inbound_called: true,
            inbound_url: WHATSAPP_INBOUND_FUNCTION_URL,
            inbound_http_status: resInbound.http_status,
            inbound_response: resInbound.body,
            processing_status: resInbound.ok ? "inbound_ok" : "inbound_error",
            processing_error: resInbound.ok ? null : JSON.stringify(resInbound.body)
          }).eq("id", idEvento);
        }
        await registrarLog(supabase, resInbound.ok ? "inbound_llamado_ok" : "inbound_llamado_error", {
          idEvento,
          resumen,
          http_status: resInbound.http_status,
          respuesta_inbound: resInbound.body
        }, resInbound.ok);
      } catch (e) {
        // Si CAPA 2 explota, dejamos evidencia tanto en la tabla principal
        // como en log_funciones, pero igual respondemos 200 a Meta.
        if (idEvento) {
          await supabase.from("whatsapp_webhook_events").update({
            inbound_called: true,
            inbound_url: WHATSAPP_INBOUND_FUNCTION_URL,
            inbound_http_status: 500,
            inbound_response: {
              error: String(e?.message || e)
            },
            processing_status: "inbound_error",
            processing_error: String(e?.message || e)
          }).eq("id", idEvento);
        }
        await registrarLog(supabase, "error_llamando_inbound", {
          idEvento,
          resumen,
          error: String(e?.message || e)
        }, false);
      }
    }
  } else {
    // ------------------------------------------------------------------------
    // 3) SI NO ES messages[] -> NO LLAMAR INBOUND
    // ------------------------------------------------------------------------
    // Esto cubre principalmente:
    // - statuses[]
    // - otros payloads sin messages[]
    // ------------------------------------------------------------------------
    await registrarLog(supabase, "inbound_no_llamado", {
      idEvento,
      resumen,
      motivo: resumen.esEventoDeStatus ? "evento_statuses" : "sin_messages"
    }, true);
  }
  // --------------------------------------------------------------------------
  // 4) RESPUESTA FINAL A META
  // --------------------------------------------------------------------------
  // Pase lo que pase internamente, devolvemos 200 OK.
  // --------------------------------------------------------------------------
  return new Response("OK", {
    status: 200,
    headers: {
      "Content-Type": "text/plain"
    }
  });
});
