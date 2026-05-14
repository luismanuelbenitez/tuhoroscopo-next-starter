// ============================================================================
// EDGE FUNCTION: ef_orquesta_envio_contenido_premium
// VERSION: v2.0.0
// ----------------------------------------------------------------------------
// RESPONSABILIDAD ÚNICA REAL (ARQUITECTURA ACTUAL):
//   - Orquestar el flujo diario premium hasta dejar mensajes listos en OUTBOX
//
// HACE:
//   1) Ejecuta ef_genera_guarda_contenido_premium
//   2) Ejecuta ef_run_encolador_premium
//   3) Registra trazabilidad completa en log_funciones
//   4) Devuelve resumen único y claro
//
// NO HACE:
//   - NO envía WhatsApp
//   - NO llama ef_whatsapp_sender
//   - NO procesa mensajes_enviados uno por uno
//   - NO renderiza templates
//
// FILOSOFÍA:
//   Esta función deja preparado el OUTBOX.
//   El envío real lo hará otra función separada (ej: ef_run_sender_premium).
//
// VENTAJAS:
//   - Respeta outbox pattern
//   - Mantiene responsabilidades limpias
//   - Facilita reintentos y observabilidad
//   - Alineada con la arquitectura real del sistema
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// CONFIGURACIÓN GLOBAL
// ============================================================================
// URL base de Supabase project
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
// Service role para escribir logs y, si hace falta, leer tablas internas
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// ANON KEY para invocar Edge Functions protegidas por JWT normal
const SUPABASE_ANON_KEY = Deno.env.get("ANON_KEY_SUPABASE") ?? "";
// Base URL de Edge Functions
// Ejemplo:
// https://xxxxx.supabase.co/functions/v1
const EDGE_BASE_URL = Deno.env.get("EDGE_BASE_URL") ?? "";
// Nombre canónico de esta función
const FUNCION = "ef_orquesta_envio_contenido_premium";
// Cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// HELPERS GENERALES
// ============================================================================
function nowUTCISO() {
  return new Date().toISOString();
}
/**
 * Genera un run_id único para agrupar todo lo ocurrido dentro de esta ejecución.
 * Esto ayuda muchísimo para trazabilidad.
 */ function generarRunId() {
  return `${FUNCION}_${Date.now()}_${crypto.randomUUID()}`;
}
/**
 * Logging robusto.
 * Nunca rompe la función si falla el insert en log_funciones.
 */ async function registrarLog(resultado, detalle = {}, exito = true) {
  try {
    await supabase.from("log_funciones").insert([
      {
        nombre_funcion: FUNCION,
        fecha_ejecucion: nowUTCISO(),
        resultado,
        detalle,
        exito,
        creado_por: "cron"
      }
    ]);
  } catch (e) {
    console.error(`[${FUNCION}] Error al registrar log`, e);
  }
}
/**
 * Helper para invocar otra Edge Function interna.
 *
 * Usa:
 * - Authorization Bearer con ANON_KEY
 * - apikey con ANON_KEY
 *
 * Esto suele ser suficiente si la función destino está protegida con JWT normal.
 */ async function invocarFuncionInterna(params) {
  const url = `${EDGE_BASE_URL}/${params.nombreFuncion}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY
    },
    body: JSON.stringify(params.payload)
  });
  const rawText = await resp.text();
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch  {
    parsed = {
      raw: rawText
    };
  }
  return {
    ok: resp.ok,
    status: resp.status,
    body: parsed
  };
}
// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
serve(async (req)=>{
  // --------------------------------------------------------------------------
  // 0) Validar método
  // --------------------------------------------------------------------------
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      ok: false,
      error: "Método no permitido"
    }), {
      status: 405,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  const inicio = nowUTCISO();
  const run_id = generarRunId();
  // --------------------------------------------------------------------------
  // 1) Parse body
  // --------------------------------------------------------------------------
  // Esta función puede correr:
  // - desde cron con body vacío {}
  // - manualmente con { fecha: "YYYY-MM-DD" }
  //
  // También permitimos:
  // - dry_run_encolador: para probar encolador sin escribir
  //
  let body = {};
  try {
    body = await req.json().catch(()=>({}));
  } catch  {
    body = {};
  }
  const fecha = typeof body?.fecha === "string" ? body.fecha.trim() : null;
  const dry_run_encolador = body?.dry_run_encolador === true;
  // --------------------------------------------------------------------------
  // 2) Log de inicio
  // --------------------------------------------------------------------------
  await registrarLog("START", {
    run_id,
    inicio,
    fecha,
    dry_run_encolador,
    objetivo: "generar_y_encolar_contenido_premium"
  }, true);
  try {
    // ========================================================================
    // PASO 1: GENERAR Y GUARDAR CONTENIDO PREMIUM
    // ========================================================================
    //
    // Llamamos a:
    //   ef_genera_guarda_contenido_premium
    //
    // Esta función:
    // - genera contenido premium del día
    // - lo guarda en contenido_premium
    //
    // En esta orquestadora NO analizamos la lógica interna;
    // solo registramos el resultado.
    // ========================================================================
    const payloadGeneracion = {
      run_id
    };
    if (fecha) payloadGeneracion.fecha = fecha;
    await registrarLog("STEP_GENERACION_START", {
      run_id,
      payload: payloadGeneracion
    }, true);
    const respGeneracion = await invocarFuncionInterna({
      nombreFuncion: "ef_genera_guarda_contenido_premium",
      payload: payloadGeneracion
    });
    await registrarLog(respGeneracion.ok ? "STEP_GENERACION_OK" : "STEP_GENERACION_ERROR", {
      run_id,
      http_status: respGeneracion.status,
      response: respGeneracion.body
    }, respGeneracion.ok);
    // Si falla generación, cortamos acá.
    // No tiene sentido encolar si no pudimos generar.
    if (!respGeneracion.ok) {
      const resumenError = {
        ok: false,
        run_id,
        fase: "generacion",
        mensaje: "Falló ef_genera_guarda_contenido_premium",
        generacion: {
          ok: respGeneracion.ok,
          status: respGeneracion.status,
          body: respGeneracion.body
        },
        encolado: null
      };
      await registrarLog("END_ERR_GENERACION", resumenError, false);
      return new Response(JSON.stringify(resumenError), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // ========================================================================
    // PASO 2: ENCOLAR CONTENIDO PREMIUM
    // ========================================================================
    //
    // Llamamos a:
    //   ef_run_encolador_premium
    //
    // Esta función:
    // - busca contenido_premium pendiente
    // - crea filas en mensajes_enviados
    // - deja listo el OUTBOX para el sender
    //
    // Importante:
    // - silent = false para que el encolador también deje sus logs
    // - run_id = el mismo de esta corrida, así toda la trazabilidad queda unida
    // ========================================================================
    const payloadEncolador = {
      run_id,
      silent: false,
      dry_run: dry_run_encolador
    };
    await registrarLog("STEP_ENCOLADOR_START", {
      run_id,
      payload: payloadEncolador
    }, true);
    const respEncolador = await invocarFuncionInterna({
      nombreFuncion: "ef_run_encolador_premium",
      payload: payloadEncolador
    });
    await registrarLog(respEncolador.ok ? "STEP_ENCOLADOR_OK" : "STEP_ENCOLADOR_ERROR", {
      run_id,
      http_status: respEncolador.status,
      response: respEncolador.body
    }, respEncolador.ok);
    // Si falla encolado, devolvemos error.
    // La generación pudo haber quedado bien, pero el pipeline no quedó listo.
    if (!respEncolador.ok) {
      const resumenError = {
        ok: false,
        run_id,
        fase: "encolado",
        mensaje: "Falló ef_run_encolador_premium",
        generacion: {
          ok: respGeneracion.ok,
          status: respGeneracion.status,
          body: respGeneracion.body
        },
        encolado: {
          ok: respEncolador.ok,
          status: respEncolador.status,
          body: respEncolador.body
        }
      };
      await registrarLog("END_ERR_ENCOLADO", resumenError, false);
      return new Response(JSON.stringify(resumenError), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // ========================================================================
    // PASO 3: RESUMEN FINAL
    // ========================================================================
    const fin = nowUTCISO();
    const resumen = {
      ok: true,
      run_id,
      inicio,
      fin,
      mensaje: "Orquestación premium completada: generación + encolado",
      generacion: {
        ok: respGeneracion.ok,
        status: respGeneracion.status,
        body: respGeneracion.body
      },
      encolado: {
        ok: respEncolador.ok,
        status: respEncolador.status,
        body: respEncolador.body
      }
    };
    await registrarLog("END_OK", resumen, true);
    return new Response(JSON.stringify(resumen), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    // ------------------------------------------------------------------------
    // ERROR GLOBAL
    // ------------------------------------------------------------------------
    const err = {
      ok: false,
      run_id,
      error: String(e?.message || e)
    };
    await registrarLog("FATAL_EXCEPTION", err, false);
    return new Response(JSON.stringify(err), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
