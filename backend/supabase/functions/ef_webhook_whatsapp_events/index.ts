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
// - NO implementa deduplicación acá (la dedup real vive en CAPA 2, por
//   whatsapp_message_id — ver tarot_whatsapp_mensajes.whatsapp_message_id
//   UNIQUE, sprint 2026-09-05).
// - NO implementa correlation_id.
// - NO implementa fingerprint.
// - Es una versión conservadora para MVP.
//
// VALIDACIÓN DE FIRMA (2026-09-05, sprint bandeja WhatsApp inbound):
// ---------------------------------------------------------------------------
// Si WHATSAPP_APP_SECRET está configurada, se valida el header
// `x-hub-signature-256` (HMAC-SHA256 del body crudo, formato Meta oficial:
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validate-payloads).
// Firma inválida o ausente con el secret configurado → 401, no se persiste
// ni se llama a CAPA 2. Sin WHATSAPP_APP_SECRET configurada (todavía no
// aprovisionada), NO se verifica nada — comportamiento idéntico al de antes
// de este sprint, para no romper el webhook real en producción mientras el
// secret no esté cargado en Supabase.
//
// MÚLTIPLES MENSAJES POR WEBHOOK (2026-09-05): Meta puede entregar más de
// un mensaje en `value.messages[]` en un solo POST. Antes, esta función solo
// resumía/reenviaba el primero. Ahora reenvía a CAPA 2 UNA VEZ POR MENSAJE
// (con `message_index`), sin cambiar el contrato de CAPA 2 (sigue
// procesando un mensaje a la vez — más simple y no toca su lógica interna).
// El resumen guardado en whatsapp_webhook_events sigue describiendo solo el
// primer mensaje (tabla de auditoría técnica, no la fuente de verdad de
// Tarot) — el payload crudo completo, con todos los mensajes, se guarda
// igual en la columna payload.
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
// - WHATSAPP_APP_SECRET      (validación de firma — ver arriba)
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
// JWT para llamar a CAPA 2 si esa función tiene verify_jwt=true.
// SUPABASE_ANON_KEY: auto-inyectada por Supabase (siempre válida, publishable key vigente)
// ANON_KEY_SUPABASE: secret manual legacy (fallback)
const INTERNAL_JWT = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY_SUPABASE") ?? "";
// Validación de firma Meta (opcional — ver header del archivo).
const WHATSAPP_APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
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
// VALIDACIÓN DE FIRMA META (x-hub-signature-256)
// ============================================================================
// HMAC-SHA256 del body crudo (bytes exactos recibidos, antes de cualquier
// parseo) con WHATSAPP_APP_SECRET como clave. Formato del header:
// "sha256=<hex>". Comparación en tiempo constante (evita timing attacks).
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function compararEnTiempoConstante(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function firmaEsValida(rawBody, headerFirma, secret) {
  if (!headerFirma || !headerFirma.startsWith("sha256=")) return false;
  const firmaRecibida = headerFirma.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firmaCalculadaBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const firmaCalculada = bytesToHex(new Uint8Array(firmaCalculadaBuf));
  return compararEnTiempoConstante(firmaCalculada, firmaRecibida);
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
      id_evento: params.id_evento,
      message_index: params.message_index ?? 0
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
  // Body crudo primero (necesario para validar la firma byte-a-byte antes
  // de parsear) — ver firmaEsValida() más arriba.
  const rawBody = await req.text().catch(() => "");

  if (WHATSAPP_APP_SECRET) {
    const firmaHeader = req.headers.get("x-hub-signature-256");
    const valida = await firmaEsValida(rawBody, firmaHeader, WHATSAPP_APP_SECRET).catch(() => false);
    if (!valida) {
      // Log best-effort — si SUPABASE_URL falta, se pierde el log pero igual rechazamos.
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabaseLog = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await registrarLog(supabaseLog, "firma_invalida_rechazado", {
          tiene_header: !!firmaHeader,
        }, false);
      }
      return new Response("Forbidden", { status: 401, headers: { "Content-Type": "text/plain" } });
    }
  }

  let body = null;
  try {
    body = JSON.parse(rawBody);
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
      // Meta puede entregar más de un mensaje en value.messages[] en un
      // solo POST — se llama a CAPA 2 una vez POR MENSAJE (message_index),
      // sin cambiar su contrato de "un mensaje a la vez". whatsapp_webhook_events
      // sigue guardando un único resumen (el del primer mensaje) más abajo,
      // como ya hacía antes de este cambio.
      const cantidadMensajes = (() => {
        try {
          const entry = Array.isArray(body?.entry) ? body.entry[0] : null;
          const value = entry?.changes?.[0]?.value;
          return Array.isArray(value?.messages) ? value.messages.length : 1;
        } catch {
          return 1;
        }
      })();

      let ultimoResultado = null;
      for (let i = 0; i < cantidadMensajes; i++) {
        try {
          const resInbound = await llamarInbound({
            url: WHATSAPP_INBOUND_FUNCTION_URL,
            internalKey: WHATSAPP_INTERNAL_KEY,
            payload: body,
            id_evento: idEvento,
            message_index: i
          });
          ultimoResultado = resInbound;
          await registrarLog(supabase, resInbound.ok ? "inbound_llamado_ok" : "inbound_llamado_error", {
            idEvento,
            resumen,
            message_index: i,
            cantidadMensajes,
            http_status: resInbound.http_status,
            respuesta_inbound: resInbound.body
          }, resInbound.ok);
        } catch (e) {
          ultimoResultado = { ok: false, http_status: 500, body: { error: String(e?.message || e) } };
          await registrarLog(supabase, "error_llamando_inbound", {
            idEvento,
            resumen,
            message_index: i,
            cantidadMensajes,
            error: String(e?.message || e)
          }, false);
        }
      }

      // Resumen final en la tabla principal — refleja el último mensaje
      // procesado del batch (auditoría técnica, no la fuente de verdad de
      // Tarot, que ya quedó persistida mensaje a mensaje en CAPA 2).
      if (idEvento && ultimoResultado) {
        await supabase.from("whatsapp_webhook_events").update({
          inbound_called: true,
          inbound_url: WHATSAPP_INBOUND_FUNCTION_URL,
          inbound_http_status: ultimoResultado.http_status,
          inbound_response: ultimoResultado.body,
          processing_status: ultimoResultado.ok ? "inbound_ok" : "inbound_error",
          processing_error: ultimoResultado.ok ? null : JSON.stringify(ultimoResultado.body)
        }).eq("id", idEvento);
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
