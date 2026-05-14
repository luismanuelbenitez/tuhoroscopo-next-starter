// ============================================================================
// EDGE FUNCTION: ef_genera_guarda_contenido_premium_domingo
// ============================================================================
//
// MÓDULO:
//   Generación de Contenido Premium
//
// NOMBRE:
//   ef_genera_guarda_contenido_premium_domingo
//
// OBJETIVO:
//   Generar y guardar contenido premium especial de domingo para los
//   suscriptores premium activos de Tu Horóscopo Cósmico.
//
// FLUJO:
//   1) Recibe fecha opcional.
//   2) Determina fecha objetivo.
//   3) Busca suscriptores premium activos.
//   4) Obtiene plantilla de prompt de domingo.
//   5) Elige emoción dominante.
//   6) Construye prompt por suscriptor.
//   7) Llama a ef_openia_genera_contenido_premium_domingo.
//   8) Valida el JSON nuevo de domingo.
//   9) Guarda usando ef_alta_contenido_premium.
//  10) Registra log consolidado.
//
// CONTRATO NUEVO DE CONTENIDO DOMINGO:
//   La función OpenAI domingo debe devolver exactamente estas claves:
//
//   {
//     "balance_semanal": "...",
//     "intencion_semana": "...",
//     "ritual_simple": "...",
//     "cierre_inspirador": "..."
//   }
//
// PLANTILLA WHATSAPP OBJETIVO:
//   🌙 Tu pausa de domingo
//
//   Hola {{1}}.
//
//   Balance
//   {{2}}
//
//   Intención para la semana que empieza
//   {{3}}
//
//   Ritual simple para hoy
//   {{4}}
//
//   Para cerrar
//   {{5}}
//
//   Estamos con vos.
//
// MAPEO ESPERADO FUTURO EN SENDER:
//   {{1}} = nombre
//   {{2}} = contenido.balance_semanal
//   {{3}} = contenido.intencion_semana
//   {{4}} = contenido.ritual_simple
//   {{5}} = contenido.cierre_inspirador
//
// QUÉ HACE:
//   - Genera contenido domingo.
//   - Evita duplicados por suscriptor + fecha + tipo domingo.
//   - Guarda en contenido_premium vía ef_alta_contenido_premium.
//   - Registra logs de alto nivel.
//   - Permite dry_run para probar sin guardar.
//   - Permite limit para pruebas controladas.
//   - Usa ANON_KEY como JWT para llamar otras Edge Functions.
//
// QUÉ NO HACE:
//   - No encola mensajes.
//   - No envía WhatsApp.
//   - No modifica suscriptores.
//   - No toca Mercado Pago.
//   - No actualiza fecha_envio_real.
//   - No llama al sender.
//
// NOTA:
//   Esta función es el primer tramo del flujo domingo.
//   Después debe tomarlo el encolador premium y luego el sender.
//
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// CONSTANTES PRINCIPALES
// ============================================================================
const FUNCION = "ef_genera_guarda_contenido_premium_domingo";
const NOMBRE_PLANTILLA = "prompt_contenido_premium_domingo";
const FN_OPENIA_DOMINGO = "ef_openia_genera_contenido_premium_domingo";
const FN_ALTA_CONTENIDO = "ef_alta_contenido_premium";
// ============================================================================
// CONTRATO NUEVO DE JSON DOMINGO
// ----------------------------------------------------------------------------
// Estas son las únicas claves obligatorias que debe devolver la función OpenAI.
// Eliminamos el contrato viejo:
//   saludo_inicial
//   balance_semana
//   desafio_cosmico
//   color_semana
//   numero_semana
//   pie_de_pagina
//
// Domingo ahora queda más corto, premium y compatible con WhatsApp.
// ============================================================================
const REQUIRED_KEYS = [
  "balance_semanal",
  "intencion_semana",
  "ritual_simple",
  "cierre_inspirador"
];
// ============================================================================
// HELPERS GENERALES
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
function normalizarTexto(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value : null;
}
function normalizarBoolean(input, defaultValue = false) {
  if (typeof input === "boolean") return input;
  return defaultValue;
}
function normalizarInteger(input) {
  if (typeof input === "number" && Number.isInteger(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const n = Number(input);
    if (Number.isInteger(n)) return n;
  }
  return null;
}
function normalizarLimit(input) {
  const n = normalizarInteger(input);
  if (n === null) return null;
  if (n < 1) return null;
  if (n > 500) return 500;
  return n;
}
// ============================================================================
// HELPERS UTC / FECHAS
// ============================================================================
function todayUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function normalizarFechaObjetivo(input) {
  const value = normalizarTexto(input);
  if (value && isDateOnly(value)) {
    return value;
  }
  return todayUTC();
}
function getISOWeekNumber(fecha) {
  const date = new Date(`${fecha}T00:00:00.000Z`);
  const tmp = new Date(date.valueOf());
  const dayNum = (date.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const diff = tmp.valueOf() - firstThursday.valueOf();
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}
function dayOfWeekMontevideo(fechaISO) {
  const d = new Date(`${fechaISO}T12:00:00-03:00`);
  return d.getDay();
}
// ============================================================================
// HELPERS ARRAY / TEXTO
// ============================================================================
function pickRandom(arr) {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}
function clampText(input, max) {
  const text = String(input ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trim();
}
// ============================================================================
// VALIDACIÓN DE CONTENIDO DOMINGO
// ----------------------------------------------------------------------------
// Esta validación es importante porque ef_alta_contenido_premium solo guarda.
// La responsabilidad de asegurar que el JSON domingo sea correcto queda acá.
//
// Reglas:
//   - Deben existir las 4 claves nuevas.
//   - Deben tener texto no vacío.
//   - Se limpian espacios.
//   - Se recortan defensivamente.
// ============================================================================
function validarContenidoDomingo(raw) {
  const faltantes = [];
  const invalidas = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      faltantes: [
        ...REQUIRED_KEYS
      ],
      invalidas: [
        "payload_no_es_objeto"
      ]
    };
  }
  const obj = raw;
  const contenido = {};
  const limits = {
    balance_semanal: 320,
    intencion_semana: 260,
    ritual_simple: 260,
    cierre_inspirador: 200
  };
  for (const key of REQUIRED_KEYS){
    if (!(key in obj)) {
      faltantes.push(key);
      continue;
    }
    const value = clampText(obj[key], limits[key]);
    if (!value) {
      invalidas.push(key);
      continue;
    }
    contenido[key] = value;
  }
  if (faltantes.length || invalidas.length) {
    return {
      ok: false,
      faltantes,
      invalidas
    };
  }
  return {
    ok: true,
    contenido: contenido
  };
}
// ============================================================================
// LECTURA SEGURA DE BODY
// ============================================================================
async function readBodySafe(req) {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body;
    }
    return {};
  } catch  {
    return {};
  }
}
// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
serve(async (req)=>{
  const tsInicio = nowUTCISO();
  // ==========================================================================
  // 1) ENV / CLIENTES
  // ==========================================================================
  const supabaseURL = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("ANON_KEY_SUPABASE") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseURL || !serviceRoleKey) {
    return jsonResponse({
      resultado: "error",
      mensaje: "SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados"
    }, 500);
  }
  const supabase = createClient(supabaseURL, serviceRoleKey);
  // ==========================================================================
  // 2) LOGGER INTERNO
  // ----------------------------------------------------------------------------
  // Intentamos primero con el esquema actual usado en tus tablas:
  //   fecha_ejecucion
  //   exito
  //
  // Si por alguna razón el entorno viejo usa:
  //   fecha_registro
  //   exitoso
  //
  // hacemos fallback.
  // ==========================================================================
  async function registrarLog(resultado, detalle = {}, exito = true) {
    try {
      const rowActual = {
        nombre_funcion: FUNCION,
        fecha_ejecucion: nowUTCISO(),
        resultado,
        detalle,
        exito,
        creado_por: "system"
      };
      const { error } = await supabase.from("log_funciones").insert([
        rowActual
      ]);
      if (!error) return;
      const rowLegacy = {
        nombre_funcion: FUNCION,
        fecha_registro: nowUTCISO(),
        resultado,
        detalle,
        exitoso: exito,
        creado_por: "system"
      };
      await supabase.from("log_funciones").insert([
        rowLegacy
      ]);
    } catch  {
    // No hacemos throw para evitar que un problema de logging rompa generación.
    }
  }
  // ==========================================================================
  // 3) MÉTODO
  // ==========================================================================
  if (req.method !== "POST") {
    return jsonResponse({
      resultado: "error",
      mensaje: "Método no permitido. Usar POST."
    }, 405);
  }
  // ==========================================================================
  // 4) VALIDAR ANON KEY
  // ----------------------------------------------------------------------------
  // Esta función usa SERVICE_ROLE para operar tablas, pero para llamar otras
  // Edge Functions usa ANON_KEY como Bearer.
  //
  // Esto evita el problema clásico:
  //   Invalid JWT
  //
  // porque el service_role no debe usarse como Authorization Bearer entre EFs.
  // ==========================================================================
  if (!anonKey) {
    await registrarLog("ANON_KEY faltante", {
      msg: "No se encontró ANON_KEY_SUPABASE ni SUPABASE_ANON_KEY"
    }, false);
    return jsonResponse({
      resultado: "error",
      mensaje: "ANON_KEY_SUPABASE o SUPABASE_ANON_KEY no configurada"
    }, 500);
  }
  // ==========================================================================
  // 5) BODY / PARÁMETROS
  // ----------------------------------------------------------------------------
  // Parámetros soportados:
  //
  //   fecha:
  //     YYYY-MM-DD. Fecha objetivo del contenido domingo.
  //
  //   fecha_objetivo:
  //     alias de fecha. Se acepta para hacer la función más clara.
  //
  //   dry_run:
  //     si true, genera/valida pero NO guarda contenido.
  //
  //   limit:
  //     limita cantidad de suscriptores para pruebas.
  //
  //   id_suscriptor:
  //     si viene, procesa solo ese suscriptor.
  //
  //   force:
  //     si true, no saltea por duplicado.
  //     OJO: solo usar para pruebas muy controladas.
  //
  //   silent:
  //     si true, reduce logs informativos.
  //
  // ==========================================================================
  const body = await readBodySafe(req);
  const fechaObjetivo = normalizarFechaObjetivo(body.fecha_objetivo ?? body.fecha);
  const fechaEnvioProgramada = `${fechaObjetivo}T00:00:00.000Z`;
  const cicloSemana = String(getISOWeekNumber(fechaObjetivo));
  const fechaCreacion = nowUTCISO();
  const dryRun = normalizarBoolean(body.dry_run, false);
  const force = normalizarBoolean(body.force, false);
  const silent = normalizarBoolean(body.silent, false);
  const limit = normalizarLimit(body.limit);
  const idSuscriptorFiltro = normalizarInteger(body.id_suscriptor);
  const runId = `domingo_${Date.now()}`;
  // ==========================================================================
  // 6) LOG DE START
  // ==========================================================================
  if (!silent) {
    await registrarLog("START", {
      run_id: runId,
      fecha_objetivo: fechaObjetivo,
      fecha_envio_programada: fechaEnvioProgramada,
      ciclo_semana: cicloSemana,
      dry_run: dryRun,
      force,
      limit,
      id_suscriptor: idSuscriptorFiltro,
      contrato_json: REQUIRED_KEYS,
      ts_inicio: tsInicio
    }, true);
  }
  // ==========================================================================
  // 7) AVISO SI FECHA OBJETIVO NO ES DOMINGO EN MONTEVIDEO
  // ----------------------------------------------------------------------------
  // No bloqueamos porque para pruebas manuales podés querer generar domingo
  // con fechas raras.
  // ==========================================================================
  const dowMVD = dayOfWeekMontevideo(fechaObjetivo);
  if (dowMVD !== 0 && !silent) {
    await registrarLog("Ejecución fuera de domingo MVD", {
      run_id: runId,
      fecha_objetivo: fechaObjetivo,
      dow_montevideo: dowMVD,
      nota: "No se bloquea la ejecución; solo aviso operativo."
    }, true);
  }
  // ==========================================================================
  // 8) OBTENER SUSCRIPTORES PREMIUM ACTIVOS
  // ----------------------------------------------------------------------------
  // Mantenemos compatibilidad con tu lógica actual:
  //   tipo_suscripcion = premium
  //   estado_suscripcion = activa
  //
  // Además agregamos columnas útiles sin romper.
  //
  // OJO:
  //   No filtro acá por whatsapp_confirmado ni estado_mensaje para no cambiar
  //   radicalmente tu lógica actual.
  //
  // Más adelante podemos decidir si domingo debe generarse solo a enviables:
  //   premium_activo = true
  //   whatsapp_confirmado = true
  //   estado_mensaje <> pausado_usuario
  // ==========================================================================
  let querySuscriptores = supabase.from("suscriptores").select(`
      id,
      nombre,
      signo,
      contenido_preferido,
      tipo_suscripcion,
      estado_suscripcion,
      premium_activo,
      whatsapp_confirmado,
      estado_mensaje,
      fecha_vencimiento_premium
    `).eq("tipo_suscripcion", "premium").eq("estado_suscripcion", "activa");
  if (idSuscriptorFiltro !== null) {
    querySuscriptores = querySuscriptores.eq("id", idSuscriptorFiltro);
  }
  if (limit !== null) {
    querySuscriptores = querySuscriptores.limit(limit);
  }
  const { data: suscriptores, error: errSusc } = await querySuscriptores;
  if (errSusc) {
    await registrarLog("Error al obtener suscriptores premium activos", {
      run_id: runId,
      error: errSusc.message
    }, false);
    return jsonResponse({
      resultado: "error",
      mensaje: "No se pudieron obtener suscriptores",
      error: errSusc.message
    }, 500);
  }
  if (!suscriptores?.length) {
    await registrarLog("Sin suscriptores premium activos", {
      run_id: runId,
      fecha_objetivo: fechaObjetivo,
      id_suscriptor: idSuscriptorFiltro
    }, true);
    return jsonResponse({
      resultado: "ok",
      mensaje: "Sin suscriptores premium activos",
      fecha_objetivo: fechaObjetivo,
      total_suscriptores: 0,
      exitosos: 0,
      errores: 0,
      duplicados: 0,
      dry_run: dryRun
    }, 200);
  }
  // ==========================================================================
  // 9) OBTENER EMOCIONES DOMINANTES
  // ==========================================================================
  const { data: emocionesRows, error: errEmo } = await supabase.from("emocion_dominante").select("nombre");
  if (errEmo && !silent) {
    await registrarLog("Error al obtener emocion_dominante", {
      run_id: runId,
      error: errEmo.message,
      fallback: "calma interior"
    }, false);
  }
  const emociones = (emocionesRows ?? []).map((e)=>e.nombre).filter(Boolean);
  // ==========================================================================
  // 10) OBTENER PLANTILLA DE PROMPT DOMINGO
  // ==========================================================================
  const { data: plantilla, error: errPlantilla } = await supabase.from("plantillas").select("contenido").eq("nombre", NOMBRE_PLANTILLA).maybeSingle();
  if (errPlantilla || !plantilla?.contenido) {
    await registrarLog("Plantilla de domingo no encontrada", {
      run_id: runId,
      nombre_plantilla: NOMBRE_PLANTILLA,
      error: errPlantilla?.message ?? null
    }, false);
    return jsonResponse({
      resultado: "error",
      mensaje: "No se encontró la plantilla de domingo",
      nombre_plantilla: NOMBRE_PLANTILLA,
      error: errPlantilla?.message ?? null
    }, 500);
  }
  // ==========================================================================
  // 11) PROCESAR SUSCRIPTORES
  // ==========================================================================
  const detalles = [];
  let generados = 0;
  let duplicados = 0;
  let errores = 0;
  let dryRunOk = 0;
  for (const s of suscriptores){
    try {
      // ======================================================================
      // 11.1) DEDUPLICACIÓN
      // ----------------------------------------------------------------------
      // Regla:
      //   No debe existir más de un contenido domingo por:
      //     id_suscriptor + fecha_envio_programada + tipo domingo
      //
      // Si force = true, no saltamos por duplicado.
      // ======================================================================
      if (!force) {
        const { data: yaExiste, error: errExiste } = await supabase.from("contenido_premium").select("id").eq("id_suscriptor", s.id).eq("fecha_envio_programada", fechaEnvioProgramada).eq("tipo", "domingo").maybeSingle();
        if (errExiste) {
          errores++;
          detalles.push({
            id_suscriptor: s.id,
            signo: s.signo,
            resultado: "error",
            motivo_error: "Error al verificar duplicado",
            error: errExiste.message
          });
          continue;
        }
        if (yaExiste) {
          duplicados++;
          detalles.push({
            id_suscriptor: s.id,
            signo: s.signo,
            resultado: "duplicado",
            id_contenido_existente: yaExiste.id,
            motivo: "Ya existe contenido domingo para este suscriptor y fecha"
          });
          continue;
        }
      }
      // ======================================================================
      // 11.2) VARIABLES DEL PROMPT
      // ======================================================================
      const emocion = pickRandom(emociones) || "calma interior";
      const contenidoPreferido = s.contenido_preferido || "general";
      const nombre = s.nombre || "te";
      const signo = s.signo || "tu signo";
      // ----------------------------------------------------------------------
      // Reemplazos soportados.
      //
      // Aunque el prompt nuevo no use todos, mantener reemplazos no rompe.
      // ----------------------------------------------------------------------
      const prompt = String(plantilla.contenido).replaceAll("{{nombre}}", nombre).replaceAll("{{signo}}", signo).replaceAll("{{fecha}}", fechaObjetivo).replaceAll("{{fecha_objetivo}}", fechaObjetivo).replaceAll("{{emocion_dominante}}", emocion).replaceAll("{{contenido_preferido}}", contenidoPreferido);
      // ======================================================================
      // 11.3) LLAMAR A OPENAI DOMINGO
      // ======================================================================
      const genRes = await fetch(`${supabaseURL}/functions/v1/${FN_OPENIA_DOMINGO}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`
        },
        body: JSON.stringify({
          prompt,
          meta: {
            run_id: runId,
            origen: FUNCION,
            id_suscriptor: s.id,
            fecha_objetivo: fechaObjetivo,
            tipo: "domingo"
          }
        })
      });
      if (!genRes.ok) {
        const detalleError = await genRes.text();
        errores++;
        await registrarLog("Error al generar contenido domingo", {
          run_id: runId,
          id_suscriptor: s.id,
          signo,
          status: genRes.status,
          detalle_error: detalleError.slice(0, 1000)
        }, false);
        detalles.push({
          id_suscriptor: s.id,
          signo,
          resultado: "error",
          motivo_error: `Fallo al llamar a ${FN_OPENIA_DOMINGO}`,
          status: genRes.status,
          detalle_error: detalleError.slice(0, 500)
        });
        continue;
      }
      let contenidoRaw;
      try {
        contenidoRaw = await genRes.json();
      } catch (e) {
        errores++;
        detalles.push({
          id_suscriptor: s.id,
          signo,
          resultado: "error",
          motivo_error: "Respuesta de OpenAI domingo no parseable como JSON",
          error: String(e)
        });
        continue;
      }
      // ======================================================================
      // 11.4) VALIDAR CONTRATO NUEVO
      // ======================================================================
      const validacion = validarContenidoDomingo(contenidoRaw);
      if (!validacion.ok) {
        errores++;
        await registrarLog("Contenido domingo incompleto o inválido", {
          run_id: runId,
          id_suscriptor: s.id,
          signo,
          faltantes: validacion.faltantes,
          invalidas: validacion.invalidas,
          contenido_raw: contenidoRaw
        }, false);
        detalles.push({
          id_suscriptor: s.id,
          signo,
          resultado: "error",
          motivo_error: "Contenido domingo incompleto o inválido",
          faltantes: validacion.faltantes,
          invalidas: validacion.invalidas
        });
        continue;
      }
      const contenido = validacion.contenido;
      // ======================================================================
      // 11.5) DRY RUN
      // ----------------------------------------------------------------------
      // En dry_run no guardamos en contenido_premium.
      // Sirve para validar prompt + OpenAI + contrato sin tocar datos.
      // ======================================================================
      if (dryRun) {
        dryRunOk++;
        detalles.push({
          id_suscriptor: s.id,
          signo,
          resultado: "dry_run_ok",
          emocion_dominante: emocion,
          contenido_preferido: contenidoPreferido,
          contenido_preview: contenido
        });
        continue;
      }
      // ======================================================================
      // 11.6) GUARDAR CONTENIDO PREMIUM
      // ----------------------------------------------------------------------
      // Se mantiene tu arquitectura:
      //   esta función orquesta,
      //   ef_alta_contenido_premium guarda.
      //
      // Mandamos tipo = domingo.
      // Mandamos silent = true para que el log de detalle quede centralizado acá.
      // ======================================================================
      const insertRes = await fetch(`${supabaseURL}/functions/v1/${FN_ALTA_CONTENIDO}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`
        },
        body: JSON.stringify({
          id_suscriptor: s.id,
          contenido,
          fecha_creacion: fechaCreacion,
          generado: true,
          generado_por: FUNCION,
          emocion_dominante: emocion,
          ciclo_semana: cicloSemana,
          signo,
          fecha_envio_programada: fechaEnvioProgramada,
          tipo: "domingo",
          canal: "whatsapp",
          origen_generacion: "domingo",
          meta_generacion: {
            run_id: runId,
            funcion_origen: FUNCION,
            contrato_json: REQUIRED_KEYS,
            fecha_objetivo: fechaObjetivo,
            fecha_envio_programada: fechaEnvioProgramada,
            ciclo_semana: cicloSemana,
            emocion_dominante: emocion,
            contenido_preferido: contenidoPreferido,
            dow_montevideo: dowMVD,
            generado_en_utc: nowUTCISO()
          },
          silent: true
        })
      });
      let insertJson = null;
      try {
        insertJson = await insertRes.json();
      } catch  {
        insertJson = {
          error: "Respuesta de alta no parseable como JSON"
        };
      }
      // ======================================================================
      // 11.7) INTERPRETAR RESPUESTA DE ALTA
      // ======================================================================
      if (insertRes.ok && insertJson?.resultado === "ok") {
        generados++;
        detalles.push({
          id_suscriptor: s.id,
          signo,
          resultado: "generado",
          emocion_dominante: emocion,
          contenido_preferido: contenidoPreferido,
          id_contenido: insertJson?.id ?? insertJson?.data?.id ?? null
        });
        continue;
      }
      if (insertJson?.resultado === "ya_existe") {
        duplicados++;
        detalles.push({
          id_suscriptor: s.id,
          signo,
          resultado: "duplicado",
          motivo: "Ya existe contenido según ef_alta_contenido_premium",
          respuesta_alta: insertJson
        });
        continue;
      }
      errores++;
      detalles.push({
        id_suscriptor: s.id,
        signo,
        resultado: "error",
        motivo_error: insertJson?.error || insertJson?.mensaje || "Error desconocido en ef_alta_contenido_premium",
        status: insertRes.status,
        respuesta_alta: insertJson
      });
    } catch (err) {
      // ======================================================================
      // 11.X) EXCEPCIÓN POR SUSCRIPTOR
      // ======================================================================
      errores++;
      await registrarLog("Excepción procesando suscriptor domingo", {
        run_id: runId,
        id_suscriptor: s.id,
        signo: s.signo,
        error: String(err?.message || err)
      }, false);
      detalles.push({
        id_suscriptor: s.id,
        signo: s.signo,
        resultado: "error",
        motivo_error: `Excepción: ${String(err?.message || err)}`
      });
    }
  }
  // ==========================================================================
  // 12) RESUMEN FINAL
  // ==========================================================================
  const totalSuscriptores = suscriptores.length;
  const noProcesados = totalSuscriptores - generados - duplicados - errores - dryRunOk;
  const resultadoFinal = dryRun ? "dry_run_ok" : generados > 0 ? "ok" : duplicados > 0 && errores === 0 ? "sin_cambios" : errores > 0 ? "con_errores" : "sin_cambios";
  const exitoLog = dryRun ? errores === 0 : generados > 0 || duplicados > 0 && errores === 0;
  const resumen = {
    run_id: runId,
    resultado: resultadoFinal,
    fecha_objetivo: fechaObjetivo,
    fecha_envio_programada: fechaEnvioProgramada,
    fecha_creacion: fechaCreacion,
    ciclo_semana: cicloSemana,
    contrato_json: REQUIRED_KEYS,
    dry_run: dryRun,
    force,
    silent,
    total_suscriptores: totalSuscriptores,
    exitosos: generados,
    dry_run_ok: dryRunOk,
    duplicados,
    errores,
    no_procesados: noProcesados,
    dow_montevideo: dowMVD,
    ts_inicio: tsInicio,
    ts_fin: nowUTCISO()
  };
  await registrarLog(dryRun ? "DRY_RUN contenido domingo" : generados > 0 ? "Contenido domingo generado" : resultadoFinal === "con_errores" ? "Contenido domingo con errores" : "No se generó contenido domingo", resumen, exitoLog);
  // ==========================================================================
  // 13) RESPUESTA HTTP
  // ==========================================================================
  return jsonResponse({
    resultado: resultadoFinal,
    mensaje: dryRun ? "Dry run ejecutado. No se guardó contenido." : generados > 0 ? "Contenido domingo generado y guardado" : resultadoFinal === "con_errores" ? "No se pudo completar toda la generación domingo" : "No se generó nuevo contenido",
    ...resumen,
    detalles
  }, 200);
});
