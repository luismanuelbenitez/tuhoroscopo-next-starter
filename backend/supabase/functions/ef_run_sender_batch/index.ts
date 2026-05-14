// ============================================================================
// 🚀 EDGE FUNCTION: ef_run_sender_batch
// VERSION: v1.0.0
// ----------------------------------------------------------------------------
// OBJETIVO:
//   - Buscar mensajes pendientes en `mensajes_enviados`
//   - Disparar `ef_whatsapp_sender` por cada id_mensaje
//   - Evitar solapamiento de esta función mediante lock global
//
// RESPONSABILIDAD ÚNICA:
//   - Orquestar un lote de envíos
//
// NO HACE:
//   - no envía WhatsApp directamente
//   - no resuelve plantillas
//   - no modifica contenido_premium
//   - no decide negocio
//
// SEGURIDAD CONTRA DUPLICADOS:
//   1) lock global del batch
//   2) sender unitario con claim por fila
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// 🔐 ENV
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const TJW = Deno.env.get("ANON_KEY_SUPABASE") ?? "";
const FUNCION = "ef_run_sender_batch";
const LOCK_KEY = "ef_run_sender_batch_lock";
// Ajustable
const DEFAULT_LIMIT = 20;
// ============================================================================
// 🔌 CLIENTE
// ============================================================================
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// 🧰 HELPERS
// ============================================================================
function nowUTCISO() {
  return new Date().toISOString();
}
async function registrarLog(tsNow, resultado, detalle = {}, exito = true) {
  try {
    await supabase.from("log_funciones").insert([
      {
        nombre_funcion: FUNCION,
        fecha_ejecucion: tsNow,
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
// 🧠 LEER APP_DEBUG_MODE DESDE TABLA configuracion
// ----------------------------------------------------------------------------
// OBJETIVO:
//   Definir automáticamente si esta función debe loguear mucho o poco.
//
// REGLA:
//   - APP_DEBUG_MODE = TRUE  => modo debug activo  => silent = false
//   - APP_DEBUG_MODE = FALSE => modo debug inactivo => silent = true
//
// IMPORTANTE:
//   - Esto NO pisa un `silent` que venga explícito en el body.
//   - Solo actúa como valor por defecto si el body no lo define.
//
// TABLA ESPERADA:
//   configuracion
//
// CAMPOS USADOS:
//   - nombre
//   - valor
//
// REGISTRO ESPERADO:
//   nombre = 'APP_DEBUG_MODE'
//   valor  = 'TRUE' o 'FALSE'
//
// TOLERANCIA:
//   - Si no existe el registro
//   - Si hay error leyendo
//   - Si el valor viene vacío
//   => devolvemos false (modo no debug)
// ============================================================================
async function getAppDebugMode() {
  const { data, error } = await supabase.from("config").select("valor").eq("nombre", "APP_DEBUG_MODE").maybeSingle();
  if (error) {
    console.error(`[${FUNCION}] Error leyendo APP_DEBUG_MODE`, error);
    return false;
  }
  if (!data?.valor) {
    return false;
  }
  return String(data.valor).trim().toUpperCase() === "TRUE";
}
// ============================================================================
// 🔒 ADQUIRIR LOCK CON TTL
// ----------------------------------------------------------------------------
// OBJETIVO:
//   Evitar que dos batchs corran al mismo tiempo.
//
// PROBLEMA QUE RESUELVE:
//   Si una ejecución anterior muere antes de liberar el lock,
//   el registro en process_locks puede quedar "colgado".
//
// SOLUCIÓN:
//   - intentamos insertar el lock
//   - si falla, revisamos si el lock existente está vencido
//   - si está vencido, lo rompemos y reintentamos
//   - si no está vencido, devolvemos skip por lock activo
//
// TTL USADO:
//   120 segundos por defecto
//
// DEVUELVE:
//   - ok = true  => lock adquirido
//   - ok = false => lock activo o error real
//
// CAMPOS EXTRA:
//   - recovered  => true si hubo recuperación de lock viejo
//   - ageSeconds => antigüedad del lock encontrado
// ============================================================================
async function adquirirLockConTTL(params) {
  const { lockKey, owner, ttlSeconds = 120 } = params;
  const tsNow = nowUTCISO();
  // --------------------------------------------------------------------------
  // PASO 1) Intento normal de tomar lock
  // --------------------------------------------------------------------------
  const { error: insertErr } = await supabase.from("process_locks").insert([
    {
      lock_key: lockKey,
      locked_at: tsNow,
      owner
    }
  ]);
  if (!insertErr) {
    return {
      ok: true,
      recovered: false
    };
  }
  // --------------------------------------------------------------------------
  // PASO 2) Si no pudimos insertar, inspeccionamos el lock actual
  // --------------------------------------------------------------------------
  const { data: existing, error: readErr } = await supabase.from("process_locks").select("lock_key, locked_at, owner").eq("lock_key", lockKey).maybeSingle();
  if (readErr || !existing?.locked_at) {
    return {
      ok: false,
      error: insertErr
    };
  }
  // --------------------------------------------------------------------------
  // PASO 3) Calcular antigüedad del lock existente
  // --------------------------------------------------------------------------
  const lockedAtMs = new Date(existing.locked_at).getTime();
  const nowMs = new Date(tsNow).getTime();
  const ageSeconds = (nowMs - lockedAtMs) / 1000;
  // --------------------------------------------------------------------------
  // PASO 4) Si el lock todavía está vigente, NO rompemos nada
  // --------------------------------------------------------------------------
  if (ageSeconds <= ttlSeconds) {
    return {
      ok: false,
      error: insertErr,
      ageSeconds
    };
  }
  // --------------------------------------------------------------------------
  // PASO 5) El lock está vencido => lo rompemos
  // --------------------------------------------------------------------------
  const { error: deleteErr } = await supabase.from("process_locks").delete().eq("lock_key", lockKey);
  if (deleteErr) {
    return {
      ok: false,
      error: deleteErr,
      ageSeconds
    };
  }
  // --------------------------------------------------------------------------
  // PASO 6) Reintentamos tomar el lock
  // --------------------------------------------------------------------------
  const { error: retryErr } = await supabase.from("process_locks").insert([
    {
      lock_key: lockKey,
      locked_at: tsNow,
      owner
    }
  ]);
  if (retryErr) {
    return {
      ok: false,
      error: retryErr,
      ageSeconds
    };
  }
  return {
    ok: true,
    recovered: true,
    ageSeconds
  };
}
// ============================================================================
// 🔓 LIBERAR LOCK
// ----------------------------------------------------------------------------
// Elimina el lock global de esta función.
// Se invoca siempre desde finally.
// ============================================================================
async function liberarLock(lockKey) {
  const { error } = await supabase.from("process_locks").delete().eq("lock_key", lockKey);
  return {
    ok: !error,
    error
  };
}
// ============================================================================
// 📤 LLAMADA INTERNA AL SENDER UNITARIO
// ============================================================================
async function dispararSender(params) {
  const { id_mensaje, force_send = false, forzar_reintento = false } = params;
  const url = `${SUPABASE_URL}/functions/v1/ef_whatsapp_sender`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": WHATSAPP_INTERNAL_KEY,
      "Authorization": `Bearer ${TJW}`
    },
    body: JSON.stringify({
      id_mensaje,
      force_send,
      forzar_reintento
    })
  });
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch  {
    parsed = {
      raw: text
    };
  }
  return {
    ok: r.ok,
    status: r.status,
    body: parsed
  };
}
// ============================================================================
// 🔎 FETCH LOTE PENDIENTE
// ----------------------------------------------------------------------------
// Traemos SOLO pendientes.
// Opcionalmente podrías agregar:
//   .lte("fecha_envio_programada", nowUTCISO())
// pero hoy el control temporal ya lo hace el sender.
// ============================================================================
async function fetchPendientes(limit) {
  const { data, error } = await supabase.from("mensajes_enviados").select("id").eq("estado", "pendiente").order("id", {
    ascending: true
  }).limit(limit);
  if (error) throw error;
  return data ?? [];
}
// ============================================================================
// 🚀 HANDLER
// ============================================================================
serve(async (req)=>{
  const tsNow = nowUTCISO();
  // --------------------------------------------------------------------------
  // Seguridad interna
  // --------------------------------------------------------------------------
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== WHATSAPP_INTERNAL_KEY) {
    return new Response("Unauthorized", {
      status: 401
    });
  }
  // --------------------------------------------------------------------------
  // Parse body
  // --------------------------------------------------------------------------
  let body = {};
  try {
    body = await req.json();
  } catch  {
    body = {};
  }
  // --------------------------------------------------------------------------
  // Parámetros de entrada
  // --------------------------------------------------------------------------
  const limit = Number(body?.limit ?? DEFAULT_LIMIT);
  const forceSend = body?.force_send === true;
  const forzarReintento = body?.forzar_reintento === true;
  const owner = `${FUNCION}_${tsNow}`;
  // --------------------------------------------------------------------------
  // Silent automático según APP_DEBUG_MODE
  // --------------------------------------------------------------------------
  // REGLA:
  // - si el body trae `silent`, respetamos eso
  // - si NO trae `silent`, usamos APP_DEBUG_MODE
  //
  // APP_DEBUG_MODE = TRUE  => debug activo  => silent = false
  // APP_DEBUG_MODE = FALSE => debug apagado => silent = true
  const debugMode = await getAppDebugMode();
  const silent = typeof body?.silent === "boolean" ? body.silent : !debugMode;
  // --------------------------------------------------------------------------
  // Lock global con TTL: evita 2 batch simultáneos
  // --------------------------------------------------------------------------
  const lock = await adquirirLockConTTL({
    lockKey: LOCK_KEY,
    owner,
    ttlSeconds: 120
  });
  if (!lock.ok) {
    if (!silent) {
      await registrarLog(tsNow, "skip_por_lock", {
        lock_key: LOCK_KEY,
        reason: "ya_hay_otra_ejecucion_activa",
        age_seconds: lock.ageSeconds ?? null,
        owner,
        limit,
        force_send: forceSend,
        forzar_reintento: forzarReintento
      }, true);
    }
    return new Response(JSON.stringify({
      ok: true,
      accion: "skip_por_lock",
      lock_key: LOCK_KEY,
      age_seconds: lock.ageSeconds ?? null
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  try {
    // ------------------------------------------------------------------------
    // Buscar pendientes
    // ------------------------------------------------------------------------
    const rows = await fetchPendientes(limit);
    if (rows.length === 0) {
      if (!silent) {
        await registrarLog(tsNow, "sin_mensajes_pendientes", {
          limit
        }, true);
      }
      return new Response(JSON.stringify({
        ok: true,
        procesados: 0,
        ids_ok: [],
        ids_error: []
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    const ids_ok = [];
    const ids_error = [];
    // ------------------------------------------------------------------------
    // Disparo secuencial (más seguro que paralelo)
    // ------------------------------------------------------------------------
    for (const row of rows){
      const id_mensaje = Number(row.id);
      try {
        const r = await dispararSender({
          id_mensaje,
          force_send: forceSend,
          forzar_reintento: forzarReintento
        });
        // OJO:
        // Que el sender devuelva 200/OK no significa que mandó WhatsApp.
        // Significa que procesó la solicitud sin error HTTP.
        // El estado real se audita en DB / log_funciones.
        if (r.ok) {
          ids_ok.push(id_mensaje);
          if (!silent) {
            await registrarLog(tsNow, "mensaje_enviado_a_sender", {
              id_mensaje,
              status: r.status
            }, true);
          }
        } else {
          ids_error.push(id_mensaje);
          if (!silent) {
            await registrarLog(tsNow, "mensaje_error_llamada_sender", {
              id_mensaje,
              status: r.status,
              response: r.body
            }, false);
          }
        }
      } catch (e) {
        ids_error.push(id_mensaje);
        if (!silent) {
          await registrarLog(tsNow, "mensaje_error_excepcion_sender", {
            id_mensaje,
            error: String(e?.message || e)
          }, false);
        }
      }
    }
    if (!silent) {
      await registrarLog(tsNow, "ejecucion_ok", {
        limit,
        procesados: rows.length,
        ids_ok,
        ids_error,
        errores: ids_error.length,
        debug_mode: debugMode
      }, true);
    }
    return new Response(JSON.stringify({
      ok: true,
      procesados: rows.length,
      ids_ok,
      ids_error,
      errores: ids_error.length
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    if (!silent) {
      await registrarLog(tsNow, "ejecucion_error", {
        error: String(e?.message || e)
      }, false);
    }
    return new Response(JSON.stringify({
      ok: false,
      error: String(e?.message || e)
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } finally{
    await liberarLock(LOCK_KEY);
  }
});
