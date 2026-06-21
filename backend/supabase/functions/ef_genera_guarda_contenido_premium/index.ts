// ============================================================================
// EDGE FUNCTION: ef_genera_guarda_contenido_premium
// VERSION: v1.x (GENERACIÓN + PERSISTENCIA DE CONTENIDO PREMIUM DIARIO)
// ----------------------------------------------------------------------------
// DESCRIPCIÓN GENERAL:
// Función backend encargada de generar contenido premium diario personalizado
// para suscriptores activos y guardarlo en la base de datos (tabla contenido_premium).
//
// Esta función forma parte del pipeline principal de generación de contenido del SaaS
// “Tu Horóscopo Cósmico”, integrándose con:
//   - ef_openia_genera_contenido_premium (IA - generación de contenido)
//   - ef_alta_contenido_premium (persistencia en BD)
//   - CRON jobs (ejecución automática diaria)
//   - Flujos on-demand (primer envío post-confirmación WhatsApp)
//
// ----------------------------------------------------------------------------
// RESPONSABILIDADES PRINCIPALES:
//   1) Obtener suscriptores premium activos desde la tabla `suscriptores`.
//   2) (Modo CRON) Filtrar únicamente aquellos con `whatsapp_confirmado = true`.
//   3) (Modo ON-DEMAND) Permitir generar contenido para un único suscriptor.
//   4) Seleccionar emoción dominante aleatoria y su grupo asociado.
//   5) Determinar:
//        - color_base (desde paleta_colores por grupo)
//        - numero_base (desde rango_numeros por grupo)
//   6) Construir el prompt dinámico utilizando plantilla almacenada en BD.
//   7) Invocar ef_openia_genera_contenido_premium para generar contenido IA.
//   8) Validar estructura del contenido generado.
//   9) Guardar el contenido mediante ef_alta_contenido_premium.
//  10) Garantizar idempotencia:
//        - No duplicar contenido para mismo suscriptor + fecha (modo CRON)
//        - No duplicar primer envío (modo ON-DEMAND)
//  11) Registrar logs detallados en `log_funciones`.
//  12) Devolver un resumen consolidado de la ejecución.
//
// ----------------------------------------------------------------------------
// MODOS DE EJECUCIÓN:
//   🔹 MODO CRON (automático)
//      - No recibe id_suscriptor
//      - Genera contenido para TODOS los suscriptores elegibles
//      - Requiere whatsapp_confirmado = true
//      - Deduplica por fecha_envio_programada
//
//   🔹 MODO ON-DEMAND (manual / primer envío)
//      - Recibe id_suscriptor en el body
//      - Genera contenido SOLO para ese usuario
//      - No exige whatsapp_confirmado (se usa en confirmación)
//      - No deduplica por fecha (solo por tipo)
//
// ----------------------------------------------------------------------------
// PARÁMETROS DE ENTRADA (JSON body):
//   {
//     id_suscriptor?: number   // opcional → activa modo ON-DEMAND
//     fecha?: string           // opcional (YYYY-MM-DD), default: hoy UTC
//   }
//
// ----------------------------------------------------------------------------
// VARIABLES DE ENTORNO UTILIZADAS:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - ANON_KEY_SUPABASE
//
// ----------------------------------------------------------------------------
// OUTPUT (RESPONSE JSON):
//   {
//     resultado: "ok" | "sin_cambios",
//     mensaje: string,
//     fecha_objetivo: string,
//     total_suscriptores: number,
//     exitosos: number,
//     errores: number,
//     detalles: [
//       {
//         id_suscriptor: number,
//         signo: string,
//         motivo_error?: string
//       }
//     ]
//   }
//
// ----------------------------------------------------------------------------
// TABLAS INVOLUCRADAS:
//   - suscriptores
//   - contenido_premium
//   - emocion_dominante
//   - paleta_colores
//   - rango_numeros
//   - plantillas
//   - log_funciones
//
// ----------------------------------------------------------------------------
// GARANTÍAS:
//   ✔ Idempotencia (no duplicación de contenido)
//   ✔ Separación CRON vs ON-DEMAND
//   ✔ Logging completo y trazabilidad (run_id, meta_generacion)
//   ✔ Uso de OpenAI desacoplado vía Edge Function
//
// ----------------------------------------------------------------------------
// NO RESPONSABILIDADES (SEPARACIÓN DE CAPAS):
//   ❌ No envía mensajes de WhatsApp
//   ❌ No gestiona estados de envío
//   ❌ No procesa pagos ni suscripciones
//   ❌ No maneja reintentos de envío
//
// ----------------------------------------------------------------------------
// NOTA DE ARQUITECTURA:
//   Esta función representa la CAPA DE GENERACIÓN del sistema.
//   El envío real se realiza posteriormente a través del pipeline OUTBOX
//   (mensajes_enviados + ef_whatsapp_sender).
// ============================================================================
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// ============================================================================
// META GENERACIÓN (v1) - Helpers mínimos
// ============================================================================
/**
 * Retorna un run_id único por ejecución.
 * - Sirve para auditar y agrupar todos los inserts de una misma corrida.
 */ function generarRunId(nombreFuncion) {
  // crypto.randomUUID() existe en Deno
  return `${nowUTCISO()}_${nombreFuncion}_${crypto.randomUUID()}`;
}
/**
 * Determina el origen/disparador (cron vs manual/on-demand)
 * Reglas mínimas:
 *  - si viene id_suscriptor => on-demand (manual)
 *  - si no viene => cron
 */ function resolverOrigenGeneracion(idSuscriptorTarget) {
  return idSuscriptorTarget ? "manual" : "cron"; // (podés usar "on_demand" si preferís)
}
/**
 * Construye meta_generacion base (jsonb) para guardar en contenido_premium.
 * Esto NO depende de OpenAI (por ahora). Es metadata del pipeline.
 */ function construirMetaGeneracionBase(params) {
  return {
    version_meta: "v1",
    run_id: params.run_id,
    trigger: params.origen,
    fecha_objetivo: params.fecha_objetivo,
    prompt: {
      nombre: params.prompt_nombre
    },
    pipeline: {
      funcion_origen: params.nombre_funcion,
      chain: [
        "ef_genera_guarda_contenido_premium",
        "ef_openia_genera_contenido_premium",
        "ef_alta_contenido_premium"
      ]
    }
  };
}
// ============================================================================
// HELPERS DE FECHA/HORA EN UTC
// ============================================================================
/**
 * Retorna la fecha-hora actual en formato ISO 8601 UTC
 * Ejemplo: "2025-11-25T14:30:45.123Z"
 */ function nowUTCISO() {
  return new Date().toISOString();
}
/**
 * Retorna la fecha actual en formato YYYY-MM-DD en UTC
 * Ejemplo: "2025-11-25"
 */ function todayUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
/**
 * Calcula el número de semana ISO a partir de una fecha (YYYY-MM-DD) en UTC
 * Según la norma ISO 8601
 * Ejemplo: "2025-11-25" retorna número de semana
 */ function getISOWeekNumber(fecha) {
  // Anclar la fecha al inicio del día en UTC
  const date = new Date(fecha + 'T00:00:00.000Z');
  const tempDate = new Date(date.valueOf());
  // Obtener el día de la semana (0=lunes en ISO)
  const dayNum = (date.getUTCDay() + 6) % 7;
  // Mover a jueves de la semana
  tempDate.setUTCDate(tempDate.getUTCDate() - dayNum + 3);
  // Obtener el jueves del año 1
  const firstThursday = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 4));
  // Calcular semana
  const diff = tempDate.valueOf() - firstThursday.valueOf();
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}
/**
 * Retorna un elemento aleatorio de un array
 */ function pickRandom(arr) {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}
// ============================================================================
// SERVIDOR PRINCIPAL
// ============================================================================
serve(async (req)=>{
  // Nombre de esta función (para logs)
  const nombreFuncion = 'ef_genera_guarda_contenido_premium';
  // ========================================================================
  // INICIALIZAR CLIENTE SUPABASE CON SERVICE_ROLE_KEY
  // ========================================================================
  const supabaseURL = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('ANON_KEY_SUPABASE');
  const supabase = createClient(supabaseURL, serviceRoleKey);
  // ========================================================================
  // LOGGING UNIFICADO
  //   - Usa columnas nuevas: exito, fecha_ejecucion
  //   - Si falla, intenta modo compat: exitoso, fecha_registro
  //   - detalle se guarda como JSON (jsonb o text, según tu schema)
  // ========================================================================
  async function registrarLog(resultado, detalle = {}, exito = true) {
    try {
      // Intento principal: esquema nuevo
      const rowNuevo = {
        nombre_funcion: nombreFuncion,
        resultado,
        detalle,
        exito,
        fecha_ejecucion: nowUTCISO(),
        creado_por: 'SUPABASE-OPENAI'
      };
      const { error } = await supabase.from('log_funciones').insert(rowNuevo);
      if (error) {
        // Fallback silencioso a esquema viejo (por si sigue existiendo)
        const rowViejo = {
          nombre_funcion: nombreFuncion,
          resultado,
          detalle,
          exitoso: exito,
          fecha_registro: nowUTCISO(),
          creado_por: 'system'
        };
        await supabase.from('log_funciones').insert(rowViejo);
      }
    } catch (logErr) {
      console.error('[ef_genera_guarda_contenido_premium] Error registrando log:', logErr);
    }
  }
  // ========================================================================
  // PARSEAR BODY DEL REQUEST
  // ========================================================================
  let body;
  try {
    body = await req.json();
  } catch (_) {
    // Si el JSON es inválido, retornar error 400
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
  // ------------------------------------------------------------------------
  // MODO ON-DEMAND (primer envío premium)
  // Si viene id_suscriptor → procesar SOLO ese usuario
  // ------------------------------------------------------------------------
  const idSuscriptorTarget = typeof body?.id_suscriptor === 'number' ? body.id_suscriptor : null;
  // ========================================================================
  // CALCULAR FECHA OBJETIVO Y PARÁMETROS UTC
  // ========================================================================
  // Fecha de creación en UTC
  const fechaCreacion = nowUTCISO();
  // Obtener fecha del body si existe en formato YYYY-MM-DD
  const bodyFecha = typeof body?.fecha === 'string' ? body.fecha.trim() : '';
  // Usar fecha del body si es válida, sino usar hoy en UTC
  const fechaObjetivo = /^\d{4}-\d{2}-\d{2}$/.test(bodyFecha) ? bodyFecha : todayUTC();
  // Calcular número de semana ISO
  const cicloSemana = getISOWeekNumber(fechaObjetivo).toString();
  // ========================================================================
  // HORA PROGRAMADA DE ENVÍO — leída desde tabla config
  // ----------------------------------------------------------------------------
  // Clave: contenido_premium_hora_programada
  // Formato esperado: "HH:MM" en UTC
  // Fallback: "11:30" (= 08:30 Uruguay, UTC-3 sin DST)
  //
  // Uruguay no tiene DST desde 2015 → siempre UTC-3 → sin casos borde.
  // ========================================================================
  async function leerHoraProgramadaConfig() {
    try {
      const { data, error } = await supabase
        .from("config")
        .select("valor")
        .eq("nombre", "contenido_premium_hora_programada")
        .maybeSingle();
      if (error || !data?.valor) return "11:30";
      const v = data.valor.trim();
      // Validar formato HH:MM
      if (/^\d{2}:\d{2}$/.test(v)) return v;
      return "11:30";
    } catch (_) {
      return "11:30";
    }
  }
  // ========================================================================
  // FECHA DE ENVÍO PROGRAMADA
  // ----------------------------------------------------------------------------
  // REGLA CANÓNICA:
  //
  // 1) MODO CRON
  //    - Se usa para la generación diaria habitual.
  //    - El contenido queda programado para la hora configurada en UTC.
  //    - Hora leída de config[contenido_premium_hora_programada].
  //    - Fallback: 11:30 UTC (= 08:30 Uruguay).
  //
  // 2) MODO ON-DEMAND
  //    - Se usa para el primer contenido premium luego de la confirmación del
  //      número de WhatsApp.
  //    - NO debe enviarse inmediato.
  //    - Debe quedar programado para ahora + 2 minutos.
  //
  // BENEFICIO:
  // - El inbound solo dispara la generación.
  // - El encolador solo encola cuando fecha_envio_programada <= now().
  // - El sender no envía antes de fecha_envio_programada.
  // ========================================================================
  const horaProgramada = idSuscriptorTarget ? null : await leerHoraProgramadaConfig();
  const fechaEnvioProgramada = idSuscriptorTarget
    ? new Date(Date.now() + 2 * 60 * 1000).toISOString()
    : `${fechaObjetivo}T${horaProgramada}:00.000Z`;
  // ========================================================================
  // META GENERACIÓN (v1)
  // ========================================================================
  // 1) run_id único por corrida
  const runId = generarRunId(nombreFuncion);
  // 2) origen/disparador (cron vs manual)
  const origenGeneracion = resolverOrigenGeneracion(idSuscriptorTarget);
  // 3) meta_generacion base
  const metaGeneracionBase = construirMetaGeneracionBase({
    run_id: runId,
    origen: origenGeneracion,
    fecha_objetivo: fechaObjetivo,
    prompt_nombre: "prompt_contenido_premium",
    nombre_funcion: nombreFuncion
  });
  // ========================================================================
  // OBTENER SUSCRIPTORES PREMIUM ACTIVOS
  // ----------------------------------------------------------------------------
  // REGLA DE NEGOCIO:
  //
  // 1) MODO CRON
  //    - Procesa TODOS los suscriptores premium activos
  //    - Pero SOLO si ya tienen whatsapp_confirmado = true
  //
  // 2) MODO ON-DEMAND
  //    - Procesa SOLO el id_suscriptor recibido
  //    - Se usa justo después de la confirmación del número
  //    - Por diseño, NO queremos depender del filtro global del CRON
  //
  // BENEFICIO:
  // - El flujo diario se mantiene limpio
  // - El primer contenido premium se puede generar inmediatamente después
  //   de la confirmación, sin mezclar reglas del cron
  // ========================================================================
  let query = supabase.from('suscriptores').select('id, nombre, signo, contenido_preferido').eq('tipo_suscripcion', 'premium').eq('estado_suscripcion', 'activa');
  if (idSuscriptorTarget) {
    // ----------------------------------------------------------------------
    // MODO ON-DEMAND
    // ----------------------------------------------------------------------
    // Procesamos exclusivamente el suscriptor solicitado.
    query = query.eq('id', idSuscriptorTarget);
  } else {
    // ----------------------------------------------------------------------
    // MODO CRON
    // ----------------------------------------------------------------------
    // Solo generar contenido diario para usuarios que ya confirmaron WhatsApp.
    query = query.eq('whatsapp_confirmado', true);
  }
  const { data: suscriptores, error: errSusc } = await query;
  if (errSusc) {
    // Si hay error al obtener suscriptores, registrar y retornar error 500
    await registrarLog('Error al obtener suscriptores', {
      error: errSusc.message
    }, false);
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'No se pudieron obtener suscriptores'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // Validar que haya suscriptores
  if (!suscriptores || suscriptores.length === 0) {
    await registrarLog('No hay suscriptores premium activos', {});
    return new Response(JSON.stringify({
      resultado: 'ok',
      mensaje: 'Sin suscriptores premium activos'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  console.log(`[${nombreFuncion}] Encontrados ${suscriptores.length} suscriptores`);
  // ========================================================================
  // OBTENER EMOCIONES DISPONIBLES
  // ========================================================================
  const { data: emocionesRows, error: errEmo } = await supabase.from('emocion_dominante').select('nombre, grupo');
  if (errEmo) {
    // Log del error pero continuar (usaremos emoción por defecto)
    await registrarLog('Error al obtener emociones', {
      error: errEmo.message
    }, false);
  }
  // Extraer nombres de emociones, filtrar valores vacíos
  const emociones = (emocionesRows ?? []).map((e)=>e.nombre).filter(Boolean);
  console.log(`[${nombreFuncion}] Emociones disponibles: ${emociones.length}`);
  // ========================================================================
  // OBTENER PLANTILLA DE PROMPT
  // ========================================================================
  const { data: plantilla, error: errPlantilla } = await supabase.from('plantillas').select('contenido').eq('nombre', 'prompt_contenido_premium').maybeSingle();
  if (errPlantilla || !plantilla?.contenido) {
    // Sin plantilla no podemos continuar
    await registrarLog('Plantilla no encontrada', {
      error: errPlantilla?.message
    }, false);
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'No se encontró la plantilla prompt_contenido_premium'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // ========================================================================
  // PROCESAR CADA SUSCRIPTOR
  // ========================================================================
  const detalles = [];
  let generados = 0;
  const cacheColores = new Map();
  const cacheRangos = new Map();
  const usadosColor = new Set();
  const usadosNumero = new Set();
  // ============================================================================
  // HELPERS: color_base y numero_base por GRUPO (usando tablas + cache)
  // ----------------------------------------------------------------------------
  // Objetivo:
  // - Evitar que GPT repita siempre Verde/Amarillo
  // - Alinear color/numero con "grupo" de emoción (Calmantes, Emocionales, etc.)
  // - Cachear resultados para no pegarle a la BD por cada usuario
  // ============================================================================
  /**
 * Obtiene lista de colores permitidos para un grupo (desde BD) con cache.
 * Tabla esperada: paleta_colores(grupo, color)
 */ async function getColoresByGrupo(grupo) {
    // 1) Cache hit
    if (cacheColores.has(grupo)) return cacheColores.get(grupo);
    // 2) Cache miss -> consultar BD
    const { data, error } = await supabase.from('paleta_colores').select('color').eq('grupo', grupo);
    if (error) {
      // Si falla, devolvemos fallback mínimo para no romper generación
      await registrarLog('Error al obtener paleta_colores', {
        grupo,
        error: error.message
      }, false);
      const fallback = [
        'Verde',
        'Azul',
        'Violeta'
      ]; // fallback conservador
      cacheColores.set(grupo, fallback);
      return fallback;
    }
    const colores = (data ?? []).map((r)=>String(r.color ?? '').trim()).filter(Boolean);
    // Si viene vacío, fallback (no romper)
    const finalColores = colores.length ? colores : [
      'Verde',
      'Azul',
      'Violeta'
    ];
    cacheColores.set(grupo, finalColores);
    return finalColores;
  }
  /**  
 * Obtiene rango numérico permitido para un grupo (desde BD) con cache.
 * Tabla esperada: rango_numeros(grupo, min, max)
 */ async function getRangoByGrupo(grupo) {
    // 1) Cache hit
    if (cacheRangos.has(grupo)) return cacheRangos.get(grupo);
    // 2) Cache miss -> consultar BD
    const { data, error } = await supabase.from('rango_numeros').select('min, max').eq('grupo', grupo).maybeSingle();
    if (error || !data) {
      await registrarLog('Error al obtener rango_numeros', {
        grupo,
        error: error?.message
      }, false);
      const fallback = {
        min: 1,
        max: 99
      };
      cacheRangos.set(grupo, fallback);
      return fallback;
    }
    const min = Number(data.min);
    const max = Number(data.max);
    // Fallback si vienen mal
    const safe = Number.isFinite(min) && Number.isFinite(max) && min >= 1 && max <= 99 && min <= max ? {
      min,
      max
    } : {
      min: 1,
      max: 99
    };
    cacheRangos.set(grupo, safe);
    return safe;
  }
  /**
 * Elige un color random del grupo, evitando repetir en la corrida.
 * Si se agotan, reinicia (para no quedar sin colores).
 */ function pickColorNoRepetido(colores) {
    // Filtrar los no usados
    const disponibles = colores.filter((c)=>!usadosColor.has(c));
    // Si se agotaron -> reset (solo del set, no del cache)
    if (!disponibles.length) {
      usadosColor.clear();
      return colores[Math.floor(Math.random() * colores.length)];
    }
    const elegido = disponibles[Math.floor(Math.random() * disponibles.length)];
    usadosColor.add(elegido);
    return elegido;
  }
  /**
 * Genera número random dentro del rango, evitando repetir.
 * Hace varios intentos; si se agotan, reinicia.
 */ function pickNumeroNoRepetido(min, max) {
    const maxIntentos = 30;
    for(let i = 0; i < maxIntentos; i++){
      const n = Math.floor(Math.random() * (max - min + 1)) + min;
      if (!usadosNumero.has(n)) {
        usadosNumero.add(n);
        return n;
      }
    }
    // Si se vuelve difícil encontrar sin repetir -> reset
    usadosNumero.clear();
    const n = Math.floor(Math.random() * (max - min + 1)) + min;
    usadosNumero.add(n);
    return n;
  }
  for (const suscriptor of suscriptores){
    try {
      // ====================================================================
      // VERIFICAR SI YA EXISTE CONTENIDO
      // ----------------------------------------------------------------------------
      // REGLA:
      //
      // 1) MODO CRON
      //    - deduplicar por:
      //        id_suscriptor
      //        tipo = diario
      //        fecha_envio_programada del día
      //
      // 2) MODO ON-DEMAND
      //    - NO deduplicar por fecha
      //    - solo por:
      //        id_suscriptor
      //        tipo = diario
      //
      // MOTIVO:
      // - El primer contenido premium post-confirmación no depende de la fecha
      //   diaria estándar.
      // - El cron sí debe evitar generar duplicados para el mismo día.
      // ====================================================================
      let existsQuery = supabase.from('contenido_premium').select('id').eq('id_suscriptor', suscriptor.id).eq('tipo', 'diario');
      if (!idSuscriptorTarget) {
        // ------------------------------------------------------------------
        // MODO CRON
        // ------------------------------------------------------------------
        // En generación diaria normal, deduplicamos por fecha programada.
        existsQuery = existsQuery.eq('fecha_envio_programada', fechaEnvioProgramada);
      }
      const { data: yaExiste } = await existsQuery.maybeSingle();
      if (yaExiste) {
        console.log(`[${nombreFuncion}] Contenido ya existe para ${suscriptor.id}`);
        detalles.push({
          id_suscriptor: suscriptor.id,
          signo: suscriptor.signo,
          motivo_error: 'Contenido ya existe (deduplicación)'
        });
        continue;
      }
      // ====================================================================
      // PREPARAR VARIABLES PARA EL PROMPT
      // ====================================================================
      // Seleccionar emoción aleatoria
      const emocionRow = pickRandom(emocionesRows ?? []) || {
        nombre: "Serena",
        grupo: "Calmantes"
      };
      const emocion = emocionRow.nombre;
      const grupo = emocionRow.grupo || "Calmantes";
      // ====================================================================
      // ELEGIR BASES (color_base y numero_base) SEGÚN GRUPO
      // --------------------------------------------------------------------
      // - Se usan para:
      //   1) Forzar diversidad (no siempre verde/amarillo)
      //   2) Mantener coherencia emoción->grupo->paleta/rango
      //   3) Guardar columnas limpias en contenido_premium
      // ====================================================================
      // 1) Obtener paleta de colores para este grupo (con cache)
      const coloresGrupo = await getColoresByGrupo(grupo);
      // 2) Elegir un color no repetido (o reset si se agota)
      const colorBase = pickColorNoRepetido(coloresGrupo); // Ej: "Verde"
      // 3) Obtener rango numérico del grupo (con cache)
      const { min: minNum, max: maxNum } = await getRangoByGrupo(grupo);
      // 4) Elegir un número no repetido dentro del rango
      const numeroBase = pickNumeroNoRepetido(minNum, maxNum); // Ej: 27     
      // Contenido preferido del suscriptor
      const contenidoPreferido = suscriptor.contenido_preferido || 'general';
      // Reemplazar placeholders en la plantilla
      const prompt = plantilla.contenido.replaceAll('{{signo}}', suscriptor.signo).replaceAll('{{fecha}}', fechaObjetivo).replaceAll('{{emocion_dominante}}', emocion).replaceAll('{{contenido_preferido}}', contenidoPreferido).replaceAll('{{nombre}}', suscriptor.nombre || '').replaceAll('{{color}}', colorBase).replaceAll('{{numero}}', String(numeroBase));
      ;
      // ====================================================================
      // LLAMAR A ef_openia_genera_contenido_premium
      // IMPORTANTE: Usar ANON_KEY, no SERVICE_ROLE_KEY (JWT válido)
      // ====================================================================
      const responseOpenIA = await fetch(`${supabaseURL}/functions/v1/ef_openia_genera_contenido_premium`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}` // USAR ANON_KEY
        },
        body: JSON.stringify({
          prompt
        })
      });
      // ====================================================================
      // VALIDAR RESPUESTA DE OPENÍA
      // ====================================================================
      if (!responseOpenIA.ok) {
        // Error en la llamada a OpenIA
        const detalleError = await responseOpenIA.text();
        console.error(`[${nombreFuncion}] Error OpenIA: ${responseOpenIA.status} - ${detalleError}`);
        await registrarLog('Error al generar contenido con OpenIA', {
          id_suscriptor: suscriptor.id,
          signo: suscriptor.signo,
          status: responseOpenIA.status,
          statusText: responseOpenIA.statusText,
          detalleError
        }, false);
        detalles.push({
          id_suscriptor: suscriptor.id,
          signo: suscriptor.signo,
          motivo_error: `Fallo ef_openia (${responseOpenIA.status}): ${detalleError} ${prompt}`
        });
        continue;
      }
      // ====================================================================
      // EXTRAER META DE OPENAI (desde headers de ef_openia_genera_contenido_premium)
      // ====================================================================
      const rawOpeniaMeta = responseOpenIA.headers.get("x-openia-meta");
      let openiaMeta = null;
      try {
        openiaMeta = rawOpeniaMeta ? JSON.parse(rawOpeniaMeta) : null;
      } catch (_) {
        openiaMeta = rawOpeniaMeta ? { raw: rawOpeniaMeta } : null;
      }
      // ====================================================================
      // CALCULAR COSTO ESTIMADO DE IA
      // --------------------------------------------------------------------
      // Precios por millón de tokens (USD). gpt-4o-mini es el default.
      // ====================================================================
      const MODEL_PRICES = {
        "gpt-4o-mini":   { input: 0.15,  output: 0.60  },
        "gpt-4o":        { input: 2.50,  output: 10.00 },
        "gpt-4.1-mini":  { input: 0.40,  output: 1.60  },
        "gpt-4.1":       { input: 2.00,  output: 8.00  },
        "gpt-3.5-turbo": { input: 0.50,  output: 1.50  },
      };
      const modeloIA = openiaMeta?.model ?? "gpt-4o-mini";
      const tokensInput = openiaMeta?.usage?.prompt_tokens ?? 0;
      const tokensOutput = openiaMeta?.usage?.completion_tokens ?? 0;
      const prices = MODEL_PRICES[modeloIA] ?? { input: 0.15, output: 0.60 };
      const costoEstimado = Number(
        ((tokensInput / 1_000_000) * prices.input +
         (tokensOutput / 1_000_000) * prices.output).toFixed(8)
      );
      // Construir meta final por-suscriptor (base + openai)
      const metaGeneracionFinal = {
        ...metaGeneracionBase,
        openai: openiaMeta
      };
      // ====================================================================
      // PARSEAR RESPUESTA JSON DE OPENÍA
      // ====================================================================
      let contenido;
      try {
        contenido = await responseOpenIA.json();
      } catch (parseErr) {
        // Error al parsear JSON
        console.error(`[${nombreFuncion}] Error parseando JSON OpenIA:`, parseErr.message);
        await registrarLog('Error parseando respuesta OpenIA', {
          id_suscriptor: suscriptor.id,
          error: parseErr.message
        }, false);
        detalles.push({
          id_suscriptor: suscriptor.id,
          signo: suscriptor.signo,
          motivo_error: `Parse error: ${parseErr.message}`
        });
        continue;
      }
      // ====================================================================
      // VALIDAR ESTRUCTURA DEL CONTENIDO
      // (chequeo mínimo: que exista "horoscopo")
      // ====================================================================
      if (!contenido || typeof contenido !== 'object' || !contenido.horoscopo) {
        console.error(`[${nombreFuncion}] Contenido inválido:`, contenido);
        await registrarLog('Contenido inválido recibido', {
          id_suscriptor: suscriptor.id,
          contenido
        }, false);
        detalles.push({
          id_suscriptor: suscriptor.id,
          signo: suscriptor.signo,
          motivo_error: 'Contenido inválido o incompleto (falta horoscopo)'
        });
        continue;
      }
      // ====================================================================
      // LLAMAR A ef_alta_contenido_premium PARA GUARDAR
      //  -> IMPORTANTE: silent: true para que SOLO loguee esta función
      // ====================================================================
      const responseInsert = await fetch(`${supabaseURL}/functions/v1/ef_alta_contenido_premium`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}` // USAR ANON_KEY
        },
        body: JSON.stringify({
          id_suscriptor: suscriptor.id,
          contenido,
          fecha_creacion: fechaCreacion,
          emocion_dominante: emocion,
          ciclo_semana: cicloSemana,
          signo: suscriptor.signo,
          // ---------------------------------------------------------------
          // FECHA DE ENVÍO PROGRAMADA
          // ---------------------------------------------------------------
          // - CRON      -> medianoche UTC del día objetivo
          // - ON-DEMAND -> ahora + 2 minutos
          // ---------------------------------------------------------------
          fecha_envio_programada: fechaEnvioProgramada,
          tipo: 'diario',
          silent: true,
          color_base: colorBase,
          numero_base: numeroBase,
          contenido_preferido_key: contenidoPreferido,
          origen_generacion: origenGeneracion,
          meta_generacion: metaGeneracionFinal,
          tokens_input: tokensInput,
          tokens_output: tokensOutput,
          costo_estimado: costoEstimado,
          modelo_ia: modeloIA
        })
      });
      // ====================================================================
      // VALIDAR RESPUESTA DE INSERCIÓN
      // ====================================================================
      if (!responseInsert.ok) {
        // Error en la inserción
        const detalleInsertError = await responseInsert.text();
        console.error(`[${nombreFuncion}] Error inserción: ${responseInsert.status} - ${detalleInsertError}`);
        await registrarLog('Error al insertar contenido premium', {
          id_suscriptor: suscriptor.id,
          status: responseInsert.status,
          statusText: responseInsert.statusText,
          detalleError: detalleInsertError
        }, false);
        detalles.push({
          id_suscriptor: suscriptor.id,
          signo: suscriptor.signo,
          motivo_error: `Error inserción (${responseInsert.status}): ${detalleInsertError}`
        });
        continue;
      }
      // ====================================================================
      // PARSEAR RESPUESTA DE INSERCIÓN
      // ====================================================================
      let insertJson;
      try {
        insertJson = await responseInsert.json();
      } catch (parseErr) {
        console.error(`[${nombreFuncion}] Error parseando respuesta inserción:`, parseErr.message);
        await registrarLog('Error parseando respuesta inserción', {
          id_suscriptor: suscriptor.id,
          error: parseErr.message
        }, false);
        detalles.push({
          id_suscriptor: suscriptor.id,
          signo: suscriptor.signo,
          motivo_error: `Parse error inserción: ${parseErr.message}`
        });
        continue;
      }
      // ====================================================================
      // PROCESAR RESULTADO DE INSERCIÓN
      // ====================================================================
      if (insertJson?.resultado === 'ok') {
        // ¡ÉXITO! Contenido guardado correctamente
        generados++;
        console.log(`[${nombreFuncion}] ✓ Contenido guardado para ${suscriptor.signo}`);
      } else if (insertJson?.resultado === 'ya_existe') {
        // Ya existe (duplicado)
        console.log(`[${nombreFuncion}] Contenido ya existe para ${suscriptor.id}`);
        detalles.push({
          id_suscriptor: suscriptor.id,
          signo: suscriptor.signo,
          motivo_error: 'Ya existe contenido para este suscriptor y fecha (por inserción)'
        });
      } else if (insertJson?.error) {
        // Error en la respuesta
        console.error(`[${nombreFuncion}] Error de la función:`, insertJson.error);
        detalles.push({
          id_suscriptor: suscriptor.id,
          signo: suscriptor.signo,
          motivo_error: insertJson.error
        });
      } else {
        // Error desconocido
        console.error(`[${nombreFuncion}] Error desconocido:`, insertJson);
        detalles.push({
          id_suscriptor: suscriptor.id,
          signo: suscriptor.signo,
          motivo_error: insertJson?.mensaje || 'Error desconocido en inserción'
        });
      }
    } catch (errSuscriptor) {
      // Excepción no prevista en procesamiento del suscriptor
      console.error(`[${nombreFuncion}] Excepción en suscriptor ${suscriptor.id}:`, errSuscriptor);
      await registrarLog('Excepción en procesamiento de suscriptor', {
        id_suscriptor: suscriptor.id,
        error: errSuscriptor.message,
        stack: errSuscriptor.stack
      }, false);
      detalles.push({
        id_suscriptor: suscriptor.id,
        signo: suscriptor.signo,
        motivo_error: 'Excepción: ' + errSuscriptor.message
      });
    }
  }
  // ========================================================================
  // ARMAR RESUMEN FINAL (EL MISMO QUE VES EN POSTMAN)
  // ========================================================================
  const totalSuscriptores = suscriptores.length;
  const totalErrores = detalles.length;
  // Objeto de respuesta/resumen ÚNICO
  const resumen = {
    resultado: generados > 0 ? 'ok' : 'sin_cambios',
    mensaje: generados > 0 ? 'Contenido premium generado y guardado' : 'No se generó nuevo contenido',
    fecha_objetivo: fechaObjetivo,
    total_suscriptores: totalSuscriptores,
    exitosos: generados,
    errores: totalErrores,
    detalles
  };
  // ========================================================================
  // REGISTRAR LOG FINAL DE ALTO NIVEL
  //   -> detalle guarda el RESUMEN completo (igual al body de respuesta)
  // ========================================================================
  await registrarLog(resumen.resultado === 'ok' ? 'Contenido premium generado' : 'Sin cambios en generación premium', resumen, generados > 0);
  console.log(`[${nombreFuncion}] Finalizado: ${generados} generados, ${totalErrores} errores`);
  // ========================================================================
  // RETORNAR RESPUESTA FINAL (COINCIDE CON LO LOGUEADO)
  // ========================================================================
  return new Response(JSON.stringify(resumen), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
