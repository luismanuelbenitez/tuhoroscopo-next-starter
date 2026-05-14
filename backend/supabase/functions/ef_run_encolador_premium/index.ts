// ============================================================================
// EDGE FUNCTION: ef_run_encolador_premium
// VERSION: v1.0.1 (REFINADA - SOLO CAMBIOS PEDIDOS)
// ----------------------------------------------------------------------------
// OBJETIVO (RESPONSABILIDAD ÚNICA):
//   - Recorrer contenido_premium (según reglas de negocio)
//   - Crear filas en mensajes_enviados (OUTBOX) listas para que el pipeline de envío las procese
//
// ✅ Crea outbox (mensajes_enviados)
// ✅ Aplica reglas de negocio de "qué se encola"
// ✅ Idempotencia (no duplica encolado para el mismo contenido)
// ✅ Modo dry_run para testear sin escribir
// ✅ Logging controlado por "silent" (para evitar logs duplicados)
//
// ❌ NO envía WhatsApp
// ❌ NO hace reintentos
// ❌ NO espera statuses
// ✅ Considera fechas
// ✅ Considera plantillas de WhatsApp (eso vive en el sender)
//
// ----------------------------------------------------------------------------
// DECISIÓN ACTUAL (canónica):
// - La cola OUTBOX es mensajes_enviados.
// - contenido_premium mantiene estado de negocio (pendiente/encolado/enviado/...)
// - El encolador crea mensajes_enviados y marca contenido_premium.estado_envio='encolado'.
//
// IMPORTANTE:
// - No tenés columna idempotency_key UNIQUE en mensajes_enviados.
//   Entonces implementamos idempotencia por lookup: (tipo_mensaje='premium' AND id_contenido=X)
//   => si ya existe, no reinsertamos.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// 🔐 ENV / CLIENTE
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[ef_run_encolador_premium] Missing SUPABASE env vars");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// ⚙️ CONSTANTES CANÓNICAS
// ============================================================================
const FUNCION = "ef_run_encolador_premium";
// Outbox
const OUTBOX_TABLA = "mensajes_enviados";
// Estados en outbox (mensajes_enviados.estado)
const OUTBOX_ESTADO_PENDIENTE = "pendiente";
// Estados en contenido_premium.estado_envio (texto libre)
const CP_ESTADO_PENDIENTE = "pendiente";
const CP_ESTADO_ENCOLADO = "encolado";
const CP_ESTADO_ENVIADO = "enviado";
// Tipo de mensaje outbox (mensajes_enviados.tipo_mensaje)
const OUTBOX_TIPO_PREMIUM = "premium";
// Canal (mensajes_enviados.canal_envio)
const CANAL_WHATSAPP = "whatsapp";
// Lock
const LOCK_KEY = "ef_run_encolador_premium_lock";
// ============================================================================
// 📝 MENSAJE OPERATIVO
// ============================================================================
const MSG_FILTRO_FECHA = "Modo productivo: solo se evaluó contenido con fecha válida para envío (<= hoy).";
// ============================================================================
// 🧰 HELPERS BÁSICOS
// ============================================================================
function nowUTCISO() {
  return new Date().toISOString();
}
function parseContenido(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch  {
    return {};
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
// 🧹 LIMPIAR CONTENIDO PARA OUTBOX
// ============================================================================
function limpiarContenidoPremium(raw) {
  const c = parseContenido(raw);
  return {
    saludo_inicial: c.saludo_inicial ?? "",
    horoscopo: c.horoscopo ?? "",
    contenido_preferido: c.contenido_preferido ?? "",
    numero: c.numero ?? "",
    color: c.color ?? "",
    pausa: c.pausa ?? "",
    pie_de_pagina: c.pie_de_pagina ?? ""
  };
}
// ============================================================================
// 🧹 LIMPIAR CONTENIDO PREMIUM DOMINGO PARA OUTBOX
// ----------------------------------------------------------------------------
// OBJETIVO:
//   Normalizar el JSON de contenido premium especial de domingo antes de
//   colocarlo en mensajes_enviados.metadata.variables.
//
// CONTEXTO:
//   El contenido premium diario usa una estructura distinta:
//
//     saludo_inicial
//     horoscopo
//     contenido_preferido
//     numero
//     color
//     pausa
//     pie_de_pagina
//
//   Pero el contenido premium DOMINGO ahora usa un contrato nuevo y reducido:
//
//     balance_semanal
//     intencion_semana
//     ritual_simple
//     cierre_inspirador
//
// POR QUÉ EXISTE ESTA FUNCIÓN:
//   Para no romper el flujo diario existente.
//   En lugar de modificar limpiarContenidoPremium(), agregamos una función
//   separada solo para domingo.
//
// BENEFICIO:
//   - Diario sigue funcionando igual.
//   - Domingo tiene sus propias variables.
//   - El sender podrá resolver correctamente los placeholders del template
//     contenido_premium_domingo.
//
// IMPORTANTE:
//   Esta función NO valida si los textos son buenos.
//   Esa validación ya se hizo antes en:
//     ef_openia_genera_contenido_premium_domingo
//     ef_genera_guarda_contenido_premium_domingo
//
//   Acá solo normalizamos defensivamente para que nunca explote por null,
//   undefined o JSON mal parseado.
//
// ENTRADA:
//   raw:
//     Puede venir como JSONB object desde Supabase,
//     o como string JSON en algún caso legacy.
//
// SALIDA:
//   Objeto plano con las 4 claves que necesita el template domingo.
// ============================================================================
function limpiarContenidoPremiumDomingo(raw) {
  const c = parseContenido(raw);
  return {
    // ------------------------------------------------------------------------
    // {{2}} en la plantilla Meta de domingo
    // ------------------------------------------------------------------------
    // Refleja una lectura breve y emocional de la semana que termina.
    balance_semanal: c.balance_semanal ?? "",
    // ------------------------------------------------------------------------
    // {{3}} en la plantilla Meta de domingo
    // ------------------------------------------------------------------------
    // Propone una intención simple para la semana que empieza.
    intencion_semana: c.intencion_semana ?? "",
    // ------------------------------------------------------------------------
    // {{4}} en la plantilla Meta de domingo
    // ------------------------------------------------------------------------
    // Acción práctica, breve y realizable hoy domingo.
    ritual_simple: c.ritual_simple ?? "",
    // ------------------------------------------------------------------------
    // {{5}} en la plantilla Meta de domingo
    // ------------------------------------------------------------------------
    // Frase final breve, cálida e inspiradora.
    cierre_inspirador: c.cierre_inspirador ?? ""
  };
}
/**
 * Logging controlado por silent.
 * - silent=true  => no escribe log_funciones
 * - silent=false => escribe log_funciones
 */ async function registrarLog(opts) {
  const { silent, tsNow, resultado, detalle = {}, exito = true } = opts;
  if (silent) return;
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
    console.error(`[${FUNCION}] Error al registrar log`, e);
  }
}
// ============================================================================
// 🔒 ADQUIRIR LOCK CON TTL
// ----------------------------------------------------------------------------
// OBJETIVO:
//   Evitar que dos batchs del encolador corran al mismo tiempo.
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
// ============================================================================
async function adquirirLockConTTL(params) {
  const { lockKey, owner, ttlSeconds = 120 } = params;
  const tsNow = nowUTCISO();
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
  const { data: existing, error: readErr } = await supabase.from("process_locks").select("lock_key, locked_at, owner").eq("lock_key", lockKey).maybeSingle();
  if (readErr || !existing?.locked_at) {
    return {
      ok: false,
      error: insertErr
    };
  }
  const lockedAtMs = new Date(existing.locked_at).getTime();
  const nowMs = new Date(tsNow).getTime();
  const ageSeconds = (nowMs - lockedAtMs) / 1000;
  if (ageSeconds <= ttlSeconds) {
    return {
      ok: false,
      error: insertErr,
      ageSeconds
    };
  }
  const { error: deleteErr } = await supabase.from("process_locks").delete().eq("lock_key", lockKey);
  if (deleteErr) {
    return {
      ok: false,
      error: deleteErr,
      ageSeconds
    };
  }
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
// ============================================================================
async function liberarLock(lockKey) {
  const { error } = await supabase.from("process_locks").delete().eq("lock_key", lockKey);
  return {
    ok: !error,
    error
  };
}
// ============================================================================
// ✅ REGLAS DE NEGOCIO: FILTRADO DE SUSCRIPTOR
// ----------------------------------------------------------------------------
// OBJETIVO:
//   Determinar si un suscriptor puede recibir contenido premium automático.
//
// IMPORTANTE:
//   Esta función NO encola.
//   Esta función NO modifica base de datos.
//   Esta función NO envía WhatsApp.
//   Solo devuelve una decisión de elegibilidad.
//
// REGLAS:
//   - Debe existir suscriptor.
//   - Debe tener WhatsApp.
//   - Debe tener premium_activo = true.
//   - Debe tener whatsapp_confirmado = true.
//   - No debe tener mensajes pausados por BAJA.
//
// CAMPO DE PAUSA:
//   suscriptores.estado_mensaje = 'pausado_usuario'
//
// EFECTO:
//   Si está pausado, el encolador marca el contenido como skipped
//   y NO crea fila en mensajes_enviados.
// ============================================================================
function suscriptorEsEncolable(sus) {
  if (!sus) return {
    ok: false,
    reason: "suscriptor_no_encontrado"
  };
  if (!sus.whatsapp) return {
    ok: false,
    reason: "sin_whatsapp"
  };
  if (sus.premium_activo !== true) return {
    ok: false,
    reason: "premium_inactivo"
  };
  if (sus.whatsapp_confirmado !== true) return {
    ok: false,
    reason: "whatsapp_no_confirmado"
  };
  if (sus.estado_mensaje === "pausado_usuario") {
    return {
      ok: false,
      reason: "mensajes_pausados_por_usuario"
    };
  }
  return {
    ok: true
  };
}
// ============================================================================
// 🔁 IDEMPOTENCIA
// ============================================================================
async function yaExisteOutboxParaContenido(id_contenido) {
  const { data, error } = await supabase.from(OUTBOX_TABLA).select("id").eq("tipo_mensaje", OUTBOX_TIPO_PREMIUM).eq("id_contenido", id_contenido).limit(1);
  if (error) {
    console.error(`[${FUNCION}] Error en idempotency check`, error);
    return true;
  }
  return Array.isArray(data) && data.length > 0;
}
// ============================================================================
// 🧠 SELECCIÓN DE CONTENIDO
// ============================================================================
async function fetchContenidoParaEncolar(params) {
  const { limit, offset, forceSend } = params;
  let query = supabase.from("contenido_premium").select("id,id_suscriptor,contenido,tipo,estado_envio,fecha_envio_programada").or(`estado_envio.eq.${CP_ESTADO_PENDIENTE},estado_envio.is.null`).order("id", {
    ascending: true
  });
  if (!forceSend) {
    query = query.lte("fecha_envio_programada", nowUTCISO());
  }
  const { data, error } = await query.range(offset, offset + limit - 1);
  if (error) throw error;
  return data ?? [];
}
// ============================================================================
// 🧱 INSERCIÓN OUTBOX + UPDATE contenido_premium.estado_envio
// ============================================================================
async function encolarUno(params) {
  const { tsNow, row, dryRun, runId } = params;
  const id_contenido = Number(row.id);
  const id_suscriptor = Number(row.id_suscriptor);
  // ============================================================================
  // 👤 OBTENER SUSCRIPTOR DESTINATARIO
  // ----------------------------------------------------------------------------
  // OBJETIVO:
  //   Leer los datos mínimos del suscriptor necesarios para decidir si el
  //   contenido se puede encolar y para armar las variables del template.
  //
  // ANTES:
  //   Solo leíamos:
  //     id
  //     whatsapp
  //     premium_activo
  //     whatsapp_confirmado
  //     estado_mensaje
  //
  // CAMBIO NECESARIO PARA DOMINGO:
  //   Agregamos:
  //     nombre
  //
  // POR QUÉ:
  //   El template de domingo aprobado en Meta empieza con:
  //
  //     Hola {{1}}.
  //
  //   Y {{1}} debe ser el nombre del usuario.
  //
  // IMPORTANTE:
  //   Esto NO rompe el flujo diario.
  //   Simplemente trae una columna más.
  // ============================================================================
  const { data: sus, error: susErr } = await supabase.from("suscriptores").select(`
      id,
      nombre,
      whatsapp,
      premium_activo,
      whatsapp_confirmado,
      estado_mensaje
    `).eq("id", id_suscriptor).maybeSingle();
  if (susErr) {
    return {
      ok: false,
      kind: "error",
      reason: "error_get_suscriptor",
      detail: susErr.message
    };
  }
  const elig = suscriptorEsEncolable(sus);
  if (!elig.ok) {
    return {
      ok: true,
      kind: "skipped",
      reason: elig.reason,
      id_contenido,
      id_suscriptor
    };
  }
  if (row.estado_envio === CP_ESTADO_ENCOLADO || row.estado_envio === CP_ESTADO_ENVIADO) {
    return {
      ok: true,
      kind: "skipped",
      reason: "contenido_ya_encolado_o_enviado",
      id_contenido,
      id_suscriptor
    };
  }
  const existe = await yaExisteOutboxParaContenido(id_contenido);
  if (existe) {
    if (!dryRun && row.estado_envio !== CP_ESTADO_ENCOLADO) {
      await supabase.from("contenido_premium").update({
        estado_envio: CP_ESTADO_ENCOLADO
      }).eq("id", id_contenido);
    }
    return {
      ok: true,
      kind: "duplicado",
      reason: "outbox_ya_existe",
      id_contenido,
      id_suscriptor
    };
  }
  const tipoContenido = String(row.tipo ?? "").trim().toLowerCase();
  const clavePlantilla = tipoContenido === "domingo" ? "contenido_premium_domingo" : "contenido_premium_diario";
  const { data: plantillaRow, error: plantillaErr } = await supabase.from("plantillas").select("contenido").eq("nombre", clavePlantilla).maybeSingle();
  if (plantillaErr || !plantillaRow?.contenido) {
    return {
      ok: false,
      kind: "error",
      reason: "plantilla_no_encontrada_en_db",
      detail: plantillaErr?.message || "sin contenido en plantillas",
      clavePlantilla
    };
  }
  // ============================================================================
  // 🧩 RESOLVER NOMBRE REAL DE PLANTILLA
  // ----------------------------------------------------------------------------
  // plantillaRow.contenido contiene el nombre real aprobado en Meta.
  //
  // Ejemplos:
  //   clavePlantilla = contenido_premium_diario
  //   plantillaRow.contenido = contenido_premium_diario_v3
  //
  //   clavePlantilla = contenido_premium_domingo
  //   plantillaRow.contenido = contenido_premium_domingo
  //
  // IMPORTANTE:
  //   El sender usa nombre_plantilla como template real final.
  // ============================================================================
  const nombrePlantilla = plantillaRow.contenido;
  // ============================================================================
  // 🧠 ARMAR VARIABLES SEGÚN TIPO DE CONTENIDO
  // ----------------------------------------------------------------------------
  // OBJETIVO:
  //   Construir metadata.variables con las claves correctas según el tipo.
  //
  // POR QUÉ ES NECESARIO:
  //   El contenido diario y el contenido domingo NO usan la misma estructura.
  //
  // DIARIO espera variables como:
  //
  //   saludo_inicial
  //   horoscopo
  //   contenido_preferido
  //   numero
  //   color
  //   pausa
  //   pie_de_pagina
  //
  // DOMINGO espera variables como:
  //
  //   nombre
  //   balance_semanal
  //   intencion_semana
  //   ritual_simple
  //   cierre_inspirador
  //
  // SI NO HACEMOS ESTA SEPARACIÓN:
  //   El domingo se encola con variables diarias vacías,
  //   y el sender fallará luego con:
  //     template_variables_obligatorias_faltantes
  //
  // DECISIÓN:
  //   - Si row.tipo === "domingo":
  //       usamos limpiarContenidoPremiumDomingo()
  //       y armamos variables para la plantilla domingo.
  //   - En cualquier otro caso:
  //       mantenemos el comportamiento diario existente.
  // ============================================================================
  const contenido = tipoContenido === "domingo" ? limpiarContenidoPremiumDomingo(row.contenido) : limpiarContenidoPremium(row.contenido);
  // ============================================================================
  // 🧾 VARIABLES PARA WHATSAPP
  // ----------------------------------------------------------------------------
  // Estas variables quedan guardadas en:
  //
  //   mensajes_enviados.metadata.variables
  //
  // Luego ef_whatsapp_sender las toma con resolveTemplateVariable().
  //
  // DOMINGO:
  //   Template final:
  //
  //     🌙 Tu pausa de domingo
  //
  //     Hola {{1}}.
  //
  //     Balance
  //     {{2}}
  //
  //     Intención para la semana que empieza
  //     {{3}}
  //
  //     Ritual simple para hoy
  //     {{4}}
  //
  //     Para cerrar
  //     {{5}}
  //
  //     Estamos con vos.
  //
  //   Mapeo:
  //     {{1}} = nombre
  //     {{2}} = balance_semanal
  //     {{3}} = intencion_semana
  //     {{4}} = ritual_simple
  //     {{5}} = cierre_inspirador
  //
  // DIARIO:
  //   Se mantiene el mapeo actual.
  // ============================================================================
  const variables = tipoContenido === "domingo" ? {
    // --------------------------------------------------------------------
    // {{1}} - Nombre del usuario.
    // --------------------------------------------------------------------
    // Si por algún motivo el nombre viene vacío, usamos un fallback suave.
    // Esto evita que el template falle por variable obligatoria vacía.
    //
    // Ejemplo final:
    //   Hola Manuel.
    //
    // Fallback:
    //   Hola te.
    //
    // Más adelante, si querés, podemos mejorar el fallback a "ahí" o
    // "alma cósmica", pero por ahora mantenemos algo neutro.
    nombre: sus?.nombre || "te",
    // --------------------------------------------------------------------
    // {{2}} - Balance semanal.
    // --------------------------------------------------------------------
    balance_semanal: contenido.balance_semanal,
    // --------------------------------------------------------------------
    // {{3}} - Intención para la semana que empieza.
    // --------------------------------------------------------------------
    intencion_semana: contenido.intencion_semana,
    // --------------------------------------------------------------------
    // {{4}} - Ritual simple para hoy.
    // --------------------------------------------------------------------
    ritual_simple: contenido.ritual_simple,
    // --------------------------------------------------------------------
    // {{5}} - Cierre inspirador.
    // --------------------------------------------------------------------
    cierre_inspirador: contenido.cierre_inspirador
  } : {
    // --------------------------------------------------------------------
    // Flujo diario existente.
    // --------------------------------------------------------------------
    // No se modifica para evitar romper contenido premium diario.
    saludo_inicial: contenido.saludo_inicial,
    horoscopo: contenido.horoscopo,
    contenido_preferido: contenido.contenido_preferido,
    numero: contenido.numero,
    color: contenido.color,
    pausa: contenido.pausa,
    pie_de_pagina: contenido.pie_de_pagina
  };
  const outboxRow = {
    fecha_hora: tsNow,
    whatsapp_destino: sus.whatsapp,
    tipo_mensaje: OUTBOX_TIPO_PREMIUM,
    estado: OUTBOX_ESTADO_PENDIENTE,
    id_suscriptor,
    id_contenido,
    canal_envio: CANAL_WHATSAPP,
    resultado_envio: null,
    mensaje_id_whatsapp: null,
    intentos: 0,
    ultimo_error: null,
    reintentar_despues: null,
    fecha_creado: tsNow,
    fecha_enviado: null,
    fecha_delivered: null,
    fecha_read: null,
    metadata: {
      // --------------------------------------------------------------------------
      // Origen operativo del mensaje.
      // --------------------------------------------------------------------------
      // Esto permite saber que la fila fue creada por el encolador premium y no por
      // un webhook, soporte manual u otra función.
      origen: "encolador",
      // --------------------------------------------------------------------------
      // ID de corrida.
      // --------------------------------------------------------------------------
      // Sirve para agrupar en logs y depurar ejecuciones puntuales.
      run_id: runId,
      // --------------------------------------------------------------------------
      // Tipo de contenido.
      // --------------------------------------------------------------------------
      // Valores esperados:
      //   diario
      //   domingo
      //
      // El sender también puede usar este dato como fallback para resolver plantilla.
      tipo_contenido: row.tipo ?? null,
      // --------------------------------------------------------------------------
      // Fecha programada original del contenido.
      // --------------------------------------------------------------------------
      // El sender la usa para validar ventana temporal.
      // Si es futura y no viene force_send=true, no envía todavía.
      fecha_envio_programada: row.fecha_envio_programada ?? null,
      // --------------------------------------------------------------------------
      // Variables finales para WhatsApp.
      // --------------------------------------------------------------------------
      // Este es el cambio importante.
      //
      // Antes siempre guardábamos variables de diario.
      // Ahora guardamos:
      //   - variables de domingo si tipo_contenido = domingo
      //   - variables de diario si no
      //
      // Así evitamos romper el template domingo.
      variables,
      // --------------------------------------------------------------------------
      // Plantilla lógica usada por el encolador.
      // --------------------------------------------------------------------------
      // Ejemplos:
      //   contenido_premium_diario
      //   contenido_premium_domingo
      plantilla_clave: clavePlantilla,
      // --------------------------------------------------------------------------
      // Plantilla real resuelta desde tabla plantillas.
      // --------------------------------------------------------------------------
      // Esto es lo que normalmente coincide con el template aprobado en Meta.
      plantilla_resuelta: nombrePlantilla
    },
    nombre_plantilla: nombrePlantilla
  };
  if (dryRun) {
    return {
      ok: true,
      kind: "dry_run",
      id_contenido,
      id_suscriptor,
      insert: outboxRow
    };
  }
  const { data: ins, error: insErr } = await supabase.from(OUTBOX_TABLA).insert([
    outboxRow
  ]).select("id").maybeSingle();
  if (insErr || !ins?.id) {
    return {
      ok: false,
      kind: "error",
      reason: "insert_outbox_failed",
      id_contenido,
      id_suscriptor,
      detail: insErr?.message
    };
  }
  const id_mensaje = Number(ins.id);
  const { error: updErr } = await supabase.from("contenido_premium").update({
    estado_envio: CP_ESTADO_ENCOLADO
  }).eq("id", id_contenido);
  if (updErr) {
    return {
      ok: true,
      kind: "encolado_con_warning",
      id_mensaje,
      id_contenido,
      id_suscriptor,
      warning: "outbox_ok_but_update_contenido_failed",
      warning_detail: updErr.message
    };
  }
  return {
    ok: true,
    kind: "encolado",
    id_mensaje,
    id_contenido,
    id_suscriptor
  };
}
// ============================================================================
// 🚀 HANDLER PRINCIPAL
// ============================================================================
serve(async (req)=>{
  const tsNow = nowUTCISO();
  const owner = `${FUNCION}_${tsNow}`;
  // 0) Parse JSON
  let body = {};
  try {
    body = await req.json();
  } catch  {
    return new Response(JSON.stringify({
      ok: false,
      error: "JSON inválido"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // 1) Entrada (contrato)
  const dryRun = body?.dry_run === true;
  const forceSend = body?.force_send === true;
  const rawLimit = Number(body?.limit ?? 200);
  const limit = Math.max(1, Math.min(rawLimit, 200));
  const offset = Number(body?.offset ?? 0);
  // 2) run_id
  const runId = body?.run_id && String(body.run_id).trim() ? String(body.run_id).trim() : `run_${Date.now()}`;
  // 3) Silent automático según APP_DEBUG_MODE
  // --------------------------------------------------------------------------
  // REGLA:
  // - si el body trae `silent`, respetamos eso
  // - si NO trae `silent`, usamos APP_DEBUG_MODE
  //
  // APP_DEBUG_MODE = TRUE  => debug activo  => silent = false
  // APP_DEBUG_MODE = FALSE => debug apagado => silent = true
  const debugMode = await getAppDebugMode();
  const silent = typeof body?.silent === "boolean" ? body.silent : !debugMode;
  // 4) Lock global con TTL
  const lock = await adquirirLockConTTL({
    lockKey: LOCK_KEY,
    owner,
    ttlSeconds: 120
  });
  if (!lock.ok) {
    await registrarLog({
      silent,
      tsNow,
      resultado: "skip_por_lock",
      detalle: {
        lock_key: LOCK_KEY,
        owner,
        dry_run: dryRun,
        force_send: forceSend,
        limit,
        offset,
        run_id: runId,
        age_seconds: lock.ageSeconds ?? null
      },
      exito: true
    });
    return new Response(JSON.stringify({
      ok: true,
      accion: "skip_por_lock",
      lock_key: LOCK_KEY,
      run_id: runId,
      age_seconds: lock.ageSeconds ?? null
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // 5) Log START
  await registrarLog({
    silent,
    tsNow,
    resultado: "START",
    detalle: {
      dry_run: dryRun,
      silent,
      debug_mode: debugMode,
      force_send: forceSend,
      limit,
      offset,
      run_id: runId,
      lock_key: LOCK_KEY,
      owner,
      lock_recovered: lock.recovered ?? false,
      lock_age_seconds: lock.ageSeconds ?? null
    },
    exito: true
  });
  try {
    // 6) Traer lote de contenido_premium (pendiente / null)
    const rows = await fetchContenidoParaEncolar({
      limit,
      offset,
      forceSend
    });
    // 7) Procesar filas 1 por 1
    const idsMensajes = [];
    let evaluados = 0;
    let encolados = 0;
    let duplicados = 0;
    let skipped = 0;
    let warnings = 0;
    let errores = 0;
    const details = [];
    for (const row of rows){
      evaluados++;
      const r = await encolarUno({
        tsNow,
        row,
        dryRun,
        runId
      });
      if (!r.ok) {
        errores++;
        details.push(r);
        continue;
      }
      if (r.kind === "encolado") {
        encolados++;
        idsMensajes.push(r.id_mensaje);
      } else if (r.kind === "encolado_con_warning") {
        encolados++;
        warnings++;
        idsMensajes.push(r.id_mensaje);
        details.push(r);
      } else if (r.kind === "duplicado") {
        duplicados++;
      } else if (r.kind === "skipped") {
        skipped++;
        details.push(r);
      } else if (r.kind === "dry_run") {
        encolados++;
        details.push(r);
      } else {
        skipped++;
        details.push(r);
      }
    }
    const resumen = {
      ok: true,
      run_id: runId,
      dry_run: dryRun,
      silent,
      force_send: forceSend,
      batch: {
        limit,
        offset,
        rows: rows.length
      },
      counters: {
        evaluados,
        encolados,
        duplicados,
        skipped,
        warnings,
        errores
      },
      ids_mensajes: idsMensajes,
      details
    };
    // 8) Log END_OK
    await registrarLog({
      silent,
      tsNow,
      resultado: "END_OK",
      detalle: {
        run_id: runId,
        dry_run: dryRun,
        silent,
        debug_mode: debugMode,
        force_send: forceSend,
        counters: resumen.counters,
        ids_mensajes_count: idsMensajes.length,
        nota_operativa: forceSend ? "Modo forzado activo: se evaluaron todos los contenidos sin filtro de fecha." : MSG_FILTRO_FECHA
      },
      exito: true
    });
    return new Response(JSON.stringify(resumen), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    const err = {
      ok: false,
      run_id: runId,
      dry_run: dryRun,
      silent,
      force_send: forceSend,
      error: String(e?.message || e)
    };
    await registrarLog({
      silent,
      tsNow,
      resultado: "END_ERR",
      detalle: err,
      exito: false
    });
    return new Response(JSON.stringify(err), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } finally{
    await liberarLock(LOCK_KEY);
  }
});
