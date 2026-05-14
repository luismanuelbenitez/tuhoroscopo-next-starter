// ============================================================================
// EDGE FUNCTION: ef_whatsapp_reintentos
// ============================================================================
//
// ✅ RESPONSABILIDAD ÚNICA (y nada más):
// ---------------------------------------------------------------------------
// Reprocesar mensajes WhatsApp que cumplan TODAS estas condiciones:
//
//   1) Fallaron previamente
//      - mensajes_enviados.estado = "fallido"
//
//   2) Son reintentables
//      - mensajes_enviados.intentos < MAX_RETRY
//
//   3) Ya cumplieron el backoff / ventana de espera
//      - mensajes_enviados.reintentar_despues <= nowUTC()
//        O
//      - mensajes_enviados.reintentar_despues IS NULL   (equivale a “listo ya”)
//
// ❌ NO envía WhatsApp
// ❌ NO renderiza plantillas
// ❌ NO decide negocio (qué contenido va hoy, qué plantilla, etc.)
//
// ✅ SOLO vuelve a disparar ef_whatsapp_sender (fire & forget)
//
// NOTA CRÍTICA (arquitectura):
// - Esta función se ejecuta por CRON (ej: cada 5 min).
// - Esta función NUNCA debe romper el cron (si algo falla, retorna "OK").
// - "Fire & forget" REAL: NO hacemos await del fetch al sender.
//   (El sender se ejecuta en su propio contexto y mantiene su idempotencia.)
//
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// CONFIGURACIÓN / ENV
// ============================================================================
//
// IMPORTANTE:
// - Esta función necesita Service Role porque:
//   - Lee mensajes_enviados con estados internos
//   - Llama a otra Edge Function (sender) con Authorization
//
// ----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL"); // URL del proyecto (ej: https://xxx.supabase.co)
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); // Service Role (interno)
// Clave interna compartida con sender.
// - ef_whatsapp_sender valida que req.headers["x-internal-key"] coincida.
// - Evita que cualquiera dispare el sender sin conocer esta clave.
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY");
// Nombre de la función sender (Edge Function) a la que vamos a llamar.
// - NO usamos rutas hardcodeadas externas: usamos SUPABASE_URL + /functions/v1/...
const SENDER_FUNCTION_NAME = "ef_whatsapp_sender";
// Nombre de esta función (para log_funciones)
const FN = "ef_whatsapp_reintentos";
// Máximo de reintentos permitidos.
// - Si no está seteada la ENV MAX_RETRY, cae a 3.
// - Regla: solo reintenta si intentos < MAX_RETRY
const MAX_RETRY = Number(Deno.env.get("MAX_RETRY") ?? 3);
// Cliente Supabase (Service Role)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// HELPERS
// ============================================================================
//
// Todo se maneja en UTC para consistencia (tu sistema ya trabaja así).
// ----------------------------------------------------------------------------
function nowUTC() {
  return new Date().toISOString();
}
// ============================================================================
// LOGGING CENTRALIZADO (alineado a tu tabla log_funciones)
// ============================================================================
//
// Tu “verdad” actual:
// - log_funciones tiene columna fecha_ejecucion (y vos la usás en sender)
// - Este reintentos debe loguear con el mismo patrón.
//
// Reglas:
// - Logging NO debe romper la función (try/catch).
// - Si falla el insert, lo único permitido es console.error y seguir.
//
// ----------------------------------------------------------------------------
async function registrarLog(resultado, detalle, exito = true) {
  try {
    await supabase.from("log_funciones").insert({
      nombre_funcion: FN,
      // ✅ CRÍTICO:
      // Tu schema usa fecha_ejecucion; si no lo guardás, quedás inconsistente
      // con el resto del pipeline (sender/encolador/orquestador).
      fecha_ejecucion: nowUTC(),
      // Categoría / etiqueta del log (ej: query_error, reintento_disparado, etc.)
      resultado,
      // Payload estructurado (jsonb) con datos relevantes para debug/tracing
      detalle,
      // true/false según si el evento representa éxito o error
      exito,
      // estándar en tu sistema
      creado_por: "system"
    });
  } catch (err) {
    // ⚠️ Nunca romper cron / pipeline por fallas de logging
    console.error(`[${FN}] Error al loguear`, err);
  }
}
// ============================================================================
// DISPARO DEL SENDER (FIRE & FORGET REAL)
// ============================================================================
//
// Objetivo:
// - Disparar ef_whatsapp_sender para un id_mensaje puntual.
// - NO esperar respuesta (fire & forget).
//
// Por qué “NO await” es importante:
// - Si el sender tarda, o si Meta está lento, no queremos bloquear el cron.
// - La idempotencia la maneja el sender (estado pendiente vs ya procesado).
//
// Seguridad:
// - "x-internal-key" debe matchear lo que el sender espera.
// - "Authorization: Bearer <service role>" es necesario para invocar edge
//   (modelo de invocación interno controlado).
//
// ----------------------------------------------------------------------------
function dispararSender(id_mensaje) {
  const url = `${SUPABASE_URL}/functions/v1/${SENDER_FUNCTION_NAME}`;
  // ✅ Fire & forget:
  // - no usamos await
  // - si falla el fetch por red, lo mandamos a consola
  // - NO logueamos en DB desde acá porque:
  //    - sería duplicar logs por cada fetch fail
  //    - y no es imprescindible para el funcionamiento
  // (si más adelante querés persistir esos fallos, se hace, pero NO ahora)
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // ✅ Clave interna:
      // El sender valida esto y rechaza si no coincide.
      "x-internal-key": WHATSAPP_INTERNAL_KEY,
      // ✅ Autorización:
      // Permite invocar Edge Function usando Service Role (llamado interno)
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({
      id_mensaje
    })
  }).catch((e)=>console.error(`[${FN}] sender fetch error`, e));
}
// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
//
// Este serve NO recibe body.
// Se asume que lo ejecuta CRON y solo corre la lógica.
//
// Regla de oro:
// - SIEMPRE responder "OK" aunque haya fallos internos
//   (tu cron no debe romperse ni quedar “rojo”).
//
// ----------------------------------------------------------------------------
serve(async ()=>{
  try {
    // -----------------------------------------------------------------------
    // 1) Buscar mensajes fallidos reintentables listos para retry
    // -----------------------------------------------------------------------
    //
    // ✅ Condiciones EXACTAS (tu verdad):
    // - estado = "fallido"
    // - intentos < MAX_RETRY
    // - reintentar_despues <= nowUTC()  OR  reintentar_despues IS NULL
    //
    // Notas importantes:
    // - guardamos `now` una sola vez para que el query sea consistente
    // - seleccionamos SOLO lo mínimo: id, reintentar_despues, intentos
    // -----------------------------------------------------------------------
    const now = nowUTC();
    const { data: mensajes, error } = await supabase.from("mensajes_enviados").select("id, reintentar_despues, intentos")// ✅ Estado canónico de tu sender cuando algo falla
    .eq("estado", "fallido")// ✅ Reintentable si todavía no alcanzó el límite
    .lt("intentos", MAX_RETRY)// ✅ Timing:
    // - si reintentar_despues es NULL => listo para reintentar ya
    // - si tiene timestamp y es <= now => listo
    //
    // OJO:
    // - Esto es un OR de PostgREST/Supabase:
    //   `campo.is.null, campo.lte.valor`
    .or(`reintentar_despues.is.null,reintentar_despues.lte.${now}`);
    // Si el query falla, log y salimos “OK” (no romper cron)
    if (error) {
      await registrarLog("query_error", {
        error: error.message
      }, false);
      return new Response("OK");
    }
    // Si no hay nada para reintentar, log mínimo y listo
    if (!mensajes || mensajes.length === 0) {
      await registrarLog("sin_mensajes_para_reintentar", {
        MAX_RETRY
      });
      return new Response("OK");
    }
    // -----------------------------------------------------------------------
    // 2) Disparar sender para cada mensaje (fire & forget)
    // -----------------------------------------------------------------------
    //
    // Reglas:
    // - Logueamos el “disparo” (esto sirve para auditoría / trazabilidad).
    // - Luego llamamos dispararSender(id) sin await.
    //
    // Importante:
    // - El incremento de intentos NO ocurre aquí.
    //   Ocurre en ef_whatsapp_sender (ya lo arreglaste).
    //   Eso mantiene la verdad en un solo lugar:
    //   “cada intento real lo cuenta el sender”.
    // -----------------------------------------------------------------------
    for (const msg of mensajes){
      await registrarLog("reintento_disparado", {
        id_mensaje: msg.id,
        intentos: msg.intentos,
        reintentar_despues: msg.reintentar_despues
      });
      // ✅ Fire & forget real
      dispararSender(msg.id);
    }
    // Fin normal
    return new Response("OK");
  } catch (err) {
    // Cualquier excepción inesperada: log y devolver OK
    await registrarLog("fatal_exception", {
      error: String(err)
    }, false);
    return new Response("OK");
  }
});
