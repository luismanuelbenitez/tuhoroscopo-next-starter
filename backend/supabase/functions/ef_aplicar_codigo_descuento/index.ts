// ============================================================================
// 🎟️ EDGE FUNCTION: ef_aplicar_codigo_descuento
// ============================================================================
//
// NOMBRE TÉCNICO:
//   ef_aplicar_codigo_descuento
//
// CAPA:
//   Negocio / promociones / descuentos
//
// PROPÓSITO:
//   Aplicar definitivamente un código de descuento/promoción a un suscriptor.
//
// CUÁNDO SE DEBE LLAMAR:
//   Normalmente desde `ef_webhook_mp`, cuando Mercado Pago ya confirmó:
//     - que la suscripción fue autorizada
//     - o que el primer pago fue aprobado
//     - o que el evento económico que habilita el beneficio ya ocurrió
//
// IDEA CLAVE:
//   Validar un código NO es lo mismo que aplicarlo.
//   Esta función representa el momento en que el beneficio queda consumido.
//
// QUÉ HACE:
//   1) Recibe un código + datos del suscriptor/pago/suscripción.
//   2) Normaliza el código.
//   3) Busca el código en `codigos_descuento`.
//   4) Verifica que esté activo y vigente.
//   5) Verifica límites de uso.
//   6) Verifica que el usuario no lo haya usado ya.
//   7) Inserta un registro en `codigos_descuento_usos` como `aplicado`.
//   8) Incrementa `codigos_descuento.usos_actuales`.
//   9) Devuelve un resultado claro para que el caller pueda loguear o decidir.
//
// QUÉ NO HACE:
//   - NO crea suscripciones en Mercado Pago.
//   - NO modifica precios en Mercado Pago.
//   - NO llama a OpenAI.
//   - NO envía WhatsApp.
//   - NO encola mensajes.
//   - NO decide si el usuario debe recibir contenido premium.
//   - NO reemplaza a `ef_validar_codigo_descuento`.
//
// RELACIÓN CON MERCADO PAGO:
//   Esta función solo registra el beneficio aplicado.
//   Si en el futuro necesitás normalizar monto, cambiar monto recurrente,
//   o aplicar primera cuota diferente, esa lógica debe estar en:
//     - ef_crear_suscripcion
//     - ef_webhook_mp
//     - o una función específica de Mercado Pago
//
// SEGURIDAD:
//   Esta función debe ser interna.
//   Requiere `x-internal-key`.
//
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// 🔐 VARIABLES DE ENTORNO
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const FUNCION = "ef_aplicar_codigo_descuento";
// ============================================================================
// 🧱 CLIENTE SUPABASE
// ----------------------------------------------------------------------------
// Usamos service role porque esta función:
// - lee tablas internas
// - inserta auditoría de uso
// - actualiza contador de usos
// - puede ser llamada desde otra Edge Function interna
// ============================================================================
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// 🧰 HELPERS GENERALES
// ============================================================================
function nowUTCISO() {
  return new Date().toISOString();
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
// ============================================================================
// 🧼 NORMALIZAR CÓDIGO
// ----------------------------------------------------------------------------
// Objetivo:
//   Convertir cualquier input del usuario a una forma estable.
//
// Ejemplo:
//   " lanzamiento199 "  -> "LANZAMIENTO199"
//   "Lanzamiento199"    -> "LANZAMIENTO199"
//
// IMPORTANTE:
//   La tabla debería guardar los códigos en mayúsculas.
// ============================================================================
function normalizarCodigo(input) {
  if (typeof input !== "string") return "";
  return input.trim().toUpperCase();
}
// ============================================================================
// 🧼 NORMALIZAR TEXTO OPCIONAL
// ----------------------------------------------------------------------------
// Para email / whatsapp / producto / plan.
// Devuelve null si viene vacío.
// ============================================================================
function normalizarTextoOpcional(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value : null;
}
// ============================================================================
// 🧮 NORMALIZAR NÚMERO OPCIONAL
// ----------------------------------------------------------------------------
// Evita guardar NaN.
// Devuelve null si no es número válido.
// ============================================================================
function normalizarNumeroOpcional(input) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === "string" && input.trim()) {
    const n = Number(input);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
// ============================================================================
// 📝 LOGGER
// ----------------------------------------------------------------------------
// No rompemos la función si falla el log.
// ============================================================================
async function registrarLog(resultado, detalle = {}, exito = true) {
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
// 🔎 BUSCAR CÓDIGO
// ----------------------------------------------------------------------------
// Busca el código exacto en `codigos_descuento`.
// ============================================================================
async function buscarCodigo(codigo) {
  const { data, error } = await supabase.from("codigos_descuento").select("*").eq("codigo", codigo).maybeSingle();
  if (error) {
    return {
      ok: false,
      error: error.message
    };
  }
  return {
    ok: true,
    data: data
  };
}
// ============================================================================
// ✅ VALIDAR VIGENCIA BÁSICA DEL CÓDIGO
// ----------------------------------------------------------------------------
// Esta validación es defensiva.
// Aunque exista `ef_validar_codigo_descuento`, volvemos a validar acá.
// ¿Por qué?
//   Porque entre validar y aplicar pueden pasar segundos/minutos.
//   El código pudo vencer, desactivarse o agotar usos.
// ============================================================================
function validarCodigoAplicable(params) {
  const { codigo, producto, plan } = params;
  const now = new Date();
  // --------------------------------------------------------------------------
  // 1) Debe estar activo
  // --------------------------------------------------------------------------
  if (codigo.activo !== true) {
    return {
      ok: false,
      motivo: "codigo_inactivo"
    };
  }
  // --------------------------------------------------------------------------
  // 2) Fecha de inicio
  // --------------------------------------------------------------------------
  if (codigo.fecha_inicio) {
    const inicio = new Date(codigo.fecha_inicio);
    if (!Number.isNaN(inicio.getTime()) && now < inicio) {
      return {
        ok: false,
        motivo: "codigo_aun_no_vigente",
        detalle: {
          fecha_inicio: codigo.fecha_inicio
        }
      };
    }
  }
  // --------------------------------------------------------------------------
  // 3) Fecha de fin
  // --------------------------------------------------------------------------
  if (codigo.fecha_fin) {
    const fin = new Date(codigo.fecha_fin);
    if (!Number.isNaN(fin.getTime()) && now > fin) {
      return {
        ok: false,
        motivo: "codigo_expirado",
        detalle: {
          fecha_fin: codigo.fecha_fin
        }
      };
    }
  }
  // --------------------------------------------------------------------------
  // 4) Límite total de usos
  // --------------------------------------------------------------------------
  if (codigo.max_usos_total !== null && Number(codigo.usos_actuales ?? 0) >= Number(codigo.max_usos_total)) {
    return {
      ok: false,
      motivo: "codigo_sin_usos_disponibles",
      detalle: {
        usos_actuales: codigo.usos_actuales,
        max_usos_total: codigo.max_usos_total
      }
    };
  }
  // --------------------------------------------------------------------------
  // 5) Producto
  // --------------------------------------------------------------------------
  if (codigo.aplica_a_producto && producto) {
    if (codigo.aplica_a_producto !== producto) {
      return {
        ok: false,
        motivo: "codigo_no_aplica_producto",
        detalle: {
          esperado: codigo.aplica_a_producto,
          recibido: producto
        }
      };
    }
  }
  // --------------------------------------------------------------------------
  // 6) Plan
  // --------------------------------------------------------------------------
  if (codigo.aplica_a_plan && plan) {
    if (codigo.aplica_a_plan !== plan) {
      return {
        ok: false,
        motivo: "codigo_no_aplica_plan",
        detalle: {
          esperado: codigo.aplica_a_plan,
          recibido: plan
        }
      };
    }
  }
  return {
    ok: true
  };
}
// ============================================================================
// 🔁 VERIFICAR USO PREVIO APLICADO
// ----------------------------------------------------------------------------
// Objetivo:
//   Evitar aplicar dos veces el mismo código al mismo usuario.
//
// Estrategia:
//   1) Si tenemos id_suscriptor, verificamos por id_suscriptor.
//   2) Si tenemos whatsapp, verificamos por whatsapp.
//   3) Si tenemos email, verificamos por email.
//
// Nota:
//   También existen índices únicos parciales en BBDD, pero validar antes
//   permite devolver un error prolijo en vez de depender solo del constraint.
// ============================================================================
async function existeUsoAplicadoPrevio(params) {
  const { codigo_id, id_suscriptor, whatsapp, email } = params;
  // --------------------------------------------------------------------------
  // 1) Buscar por suscriptor
  // --------------------------------------------------------------------------
  if (id_suscriptor !== null) {
    const { data, error } = await supabase.from("codigos_descuento_usos").select("id, estado_uso, creado_en, preapproval_id, payment_id").eq("codigo_id", codigo_id).eq("id_suscriptor", id_suscriptor).eq("estado_uso", "aplicado").limit(1);
    if (error) {
      return {
        ok: false,
        error: error.message
      };
    }
    if (Array.isArray(data) && data.length > 0) {
      return {
        ok: true,
        existe: true,
        criterio: "id_suscriptor",
        uso: data[0]
      };
    }
  }
  // --------------------------------------------------------------------------
  // 2) Buscar por WhatsApp
  // --------------------------------------------------------------------------
  if (whatsapp) {
    const { data, error } = await supabase.from("codigos_descuento_usos").select("id, estado_uso, creado_en, preapproval_id, payment_id").eq("codigo_id", codigo_id).eq("whatsapp", whatsapp).eq("estado_uso", "aplicado").limit(1);
    if (error) {
      return {
        ok: false,
        error: error.message
      };
    }
    if (Array.isArray(data) && data.length > 0) {
      return {
        ok: true,
        existe: true,
        criterio: "whatsapp",
        uso: data[0]
      };
    }
  }
  // --------------------------------------------------------------------------
  // 3) Buscar por email
  // --------------------------------------------------------------------------
  if (email) {
    const { data, error } = await supabase.from("codigos_descuento_usos").select("id, estado_uso, creado_en, preapproval_id, payment_id").eq("codigo_id", codigo_id).eq("email", email).eq("estado_uso", "aplicado").limit(1);
    if (error) {
      return {
        ok: false,
        error: error.message
      };
    }
    if (Array.isArray(data) && data.length > 0) {
      return {
        ok: true,
        existe: true,
        criterio: "email",
        uso: data[0]
      };
    }
  }
  return {
    ok: true,
    existe: false
  };
}
// ============================================================================
// 🧮 CALCULAR SNAPSHOT ECONÓMICO A GUARDAR
// ----------------------------------------------------------------------------
// Objetivo:
//   Armar los valores económicos que se van a guardar en
//   `codigos_descuento_usos`.
//
// Importante:
//   Guardamos snapshot del momento para auditoría.
//   Si mañana cambia el precio normal, el uso histórico queda preservado.
// ============================================================================
function calcularSnapshotEconomico(params) {
  const { codigo, precio_original_input, precio_aplicado_input } = params;
  const moneda = codigo.moneda ?? "UYU";
  const precio_recurrente_normal = codigo.precio_recurrente_normal !== null ? Number(codigo.precio_recurrente_normal) : precio_original_input;
  let precio_original = precio_original_input ?? precio_recurrente_normal;
  let precio_aplicado = precio_aplicado_input;
  let valor_descuento_aplicado = null;
  let precio_primera_cuota = null;
  let dias_gratis_aplicados = null;
  let meses_gratis_aplicados = null;
  // --------------------------------------------------------------------------
  // primera_cuota
  // --------------------------------------------------------------------------
  // Ejemplo:
  //   precio normal = 390
  //   primera cuota = 199
  //   descuento aplicado = 191
  // --------------------------------------------------------------------------
  if (codigo.tipo_descuento === "primera_cuota") {
    precio_primera_cuota = codigo.precio_primera_cuota !== null ? Number(codigo.precio_primera_cuota) : null;
    if (precio_aplicado === null && precio_primera_cuota !== null) {
      precio_aplicado = precio_primera_cuota;
    }
    if (precio_original !== null && precio_aplicado !== null) {
      valor_descuento_aplicado = Math.max(precio_original - precio_aplicado, 0);
    }
  }
  // --------------------------------------------------------------------------
  // porcentaje
  // --------------------------------------------------------------------------
  // Ejemplo:
  //   valor_descuento = 30
  //   precio original = 390
  //   precio aplicado = 273
  // --------------------------------------------------------------------------
  if (codigo.tipo_descuento === "porcentaje") {
    const porcentaje = codigo.valor_descuento !== null ? Number(codigo.valor_descuento) : null;
    if (precio_original !== null && porcentaje !== null && precio_aplicado === null) {
      precio_aplicado = Number((precio_original * (1 - porcentaje / 100)).toFixed(2));
    }
    if (precio_original !== null && precio_aplicado !== null) {
      valor_descuento_aplicado = Math.max(precio_original - precio_aplicado, 0);
    }
  }
  // --------------------------------------------------------------------------
  // monto_fijo
  // --------------------------------------------------------------------------
  // Ejemplo:
  //   valor_descuento = 100
  //   precio original = 390
  //   precio aplicado = 290
  // --------------------------------------------------------------------------
  if (codigo.tipo_descuento === "monto_fijo") {
    const monto = codigo.valor_descuento !== null ? Number(codigo.valor_descuento) : null;
    if (precio_original !== null && monto !== null && precio_aplicado === null) {
      precio_aplicado = Math.max(Number((precio_original - monto).toFixed(2)), 0);
    }
    if (precio_original !== null && precio_aplicado !== null) {
      valor_descuento_aplicado = Math.max(precio_original - precio_aplicado, 0);
    }
  }
  // --------------------------------------------------------------------------
  // dias_gratis
  // --------------------------------------------------------------------------
  if (codigo.tipo_descuento === "dias_gratis") {
    dias_gratis_aplicados = codigo.valor_descuento !== null ? Number(codigo.valor_descuento) : null;
  }
  // --------------------------------------------------------------------------
  // meses_gratis
  // --------------------------------------------------------------------------
  if (codigo.tipo_descuento === "meses_gratis") {
    meses_gratis_aplicados = codigo.valor_descuento !== null ? Number(codigo.valor_descuento) : null;
  }
  return {
    moneda,
    precio_original,
    precio_aplicado,
    valor_descuento_aplicado,
    precio_primera_cuota,
    precio_recurrente_normal,
    cantidad_ciclos_descuento: codigo.cantidad_ciclos_descuento,
    dias_gratis_aplicados,
    meses_gratis_aplicados
  };
}
// ============================================================================
// 🧾 INSERTAR USO APLICADO
// ----------------------------------------------------------------------------
// Inserta en `codigos_descuento_usos`.
//
// IMPORTANTE:
//   Este insert puede fallar por unique index si hay carrera.
//   Eso está bien.
//   Si dos procesos intentan aplicar el mismo código al mismo usuario,
//   uno debe ganar y el otro debe fallar.
// ============================================================================
async function insertarUsoAplicado(params) {
  const { codigo, input, snapshot } = params;
  const now = nowUTCISO();
  const row = {
    codigo_id: codigo.id,
    codigo: codigo.codigo,
    id_suscriptor: input.id_suscriptor,
    email: input.email,
    whatsapp: input.whatsapp,
    preapproval_id: input.preapproval_id,
    payment_id: input.payment_id,
    external_reference: input.external_reference,
    estado_uso: "aplicado",
    moneda: snapshot.moneda,
    precio_original: snapshot.precio_original,
    precio_aplicado: snapshot.precio_aplicado,
    valor_descuento_aplicado: snapshot.valor_descuento_aplicado,
    precio_primera_cuota: snapshot.precio_primera_cuota,
    precio_recurrente_normal: snapshot.precio_recurrente_normal,
    cantidad_ciclos_descuento: snapshot.cantidad_ciclos_descuento,
    dias_gratis_aplicados: snapshot.dias_gratis_aplicados,
    meses_gratis_aplicados: snapshot.meses_gratis_aplicados,
    fecha_reserva: null,
    fecha_aplicacion: now,
    fecha_cancelacion: null,
    fecha_expiracion: null,
    ultimo_error: null,
    metadata: input.metadata ?? {},
    creado_en: now,
    actualizado_en: now,
    creado_por: input.aplicado_por,
    actualizado_por: input.aplicado_por
  };
  const { data, error } = await supabase.from("codigos_descuento_usos").insert([
    row
  ]).select("id").maybeSingle();
  if (error) {
    return {
      ok: false,
      error: error.message
    };
  }
  if (!data?.id) {
    return {
      ok: false,
      error: "uso_insertado_sin_id"
    };
  }
  return {
    ok: true,
    id_uso: String(data.id)
  };
}
// ============================================================================
// 🔢 INCREMENTAR CONTADOR DE USOS
// ----------------------------------------------------------------------------
// Objetivo:
//   Incrementar `codigos_descuento.usos_actuales`.
//
// IMPORTANTE SOBRE CONCURRENCIA:
//   Esta versión hace update directo sumando 1 desde el valor leído.
//   Para MVP está bien.
//
//   Para máxima seguridad futura, conviene crear una RPC SQL que haga:
//     update ... set usos_actuales = usos_actuales + 1
//     where id = ...
//       and (max_usos_total is null or usos_actuales < max_usos_total)
//
//   Eso evita carreras perfectas en alta concurrencia.
//
// Para THC MVP, la combinación de:
//   - validación previa
//   - unique index por suscriptor/whatsapp
//   - bajo volumen inicial
// es suficiente.
// ============================================================================
async function incrementarUsoCodigo(params) {
  const { codigo, actualizado_por } = params;
  const nextUsos = Number(codigo.usos_actuales ?? 0) + 1;
  const { error } = await supabase.from("codigos_descuento").update({
    usos_actuales: nextUsos,
    actualizado_por
  }).eq("id", codigo.id);
  if (error) {
    return {
      ok: false,
      error: error.message
    };
  }
  return {
    ok: true
  };
}
// ============================================================================
// 🚀 HANDLER PRINCIPAL
// ============================================================================
serve(async (req)=>{
  const tsNow = nowUTCISO();
  // ==========================================================================
  // 0) Método permitido
  // ==========================================================================
  if (req.method !== "POST") {
    return jsonResponse({
      ok: false,
      motivo: "metodo_no_permitido",
      mensaje: "Usar POST."
    }, 405);
  }
  // ==========================================================================
  // 1) Seguridad interna
  // ==========================================================================
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== WHATSAPP_INTERNAL_KEY) {
    await registrarLog("unauthorized", {
      tsNow,
      reason: "x-internal-key inválido"
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "unauthorized"
    }, 401);
  }
  // ==========================================================================
  // 2) Parse body
  // ==========================================================================
  let body;
  try {
    body = await req.json();
  } catch (e) {
    await registrarLog("json_invalido", {
      error: String(e)
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "json_invalido",
      mensaje: "Body JSON inválido."
    }, 400);
  }
  // ==========================================================================
  // 3) Normalizar input
  // ==========================================================================
  const codigoNormalizado = normalizarCodigo(body.codigo);
  const id_suscriptor = typeof body.id_suscriptor === "number" && Number.isInteger(body.id_suscriptor) ? body.id_suscriptor : null;
  const whatsapp = normalizarTextoOpcional(body.whatsapp);
  const email = normalizarTextoOpcional(body.email)?.toLowerCase() ?? null;
  const preapproval_id = normalizarTextoOpcional(body.preapproval_id);
  const payment_id = normalizarTextoOpcional(body.payment_id);
  const external_reference = normalizarTextoOpcional(body.external_reference);
  const producto = normalizarTextoOpcional(body.producto);
  const plan = normalizarTextoOpcional(body.plan);
  const precio_original_input = normalizarNumeroOpcional(body.precio_original);
  const precio_aplicado_input = normalizarNumeroOpcional(body.precio_aplicado);
  const aplicado_por = normalizarTextoOpcional(body.aplicado_por) ?? FUNCION;
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  // ==========================================================================
  // 4) Validaciones mínimas de entrada
  // ==========================================================================
  if (!codigoNormalizado) {
    return jsonResponse({
      ok: false,
      motivo: "codigo_requerido",
      mensaje: "Debe enviarse un código de descuento."
    }, 400);
  }
  if (!id_suscriptor && !whatsapp && !email) {
    return jsonResponse({
      ok: false,
      motivo: "identificador_usuario_requerido",
      mensaje: "Debe enviarse id_suscriptor, whatsapp o email."
    }, 400);
  }
  // ==========================================================================
  // 5) Buscar código
  // ==========================================================================
  const codigoRes = await buscarCodigo(codigoNormalizado);
  if (!codigoRes.ok) {
    await registrarLog("buscar_codigo_error", {
      codigo: codigoNormalizado,
      error: codigoRes.error
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "error_buscar_codigo",
      error: codigoRes.error
    }, 500);
  }
  if (!codigoRes.data) {
    await registrarLog("codigo_no_encontrado", {
      codigo: codigoNormalizado,
      id_suscriptor,
      whatsapp,
      email
    }, true);
    return jsonResponse({
      ok: false,
      motivo: "codigo_no_encontrado",
      mensaje: "El código ingresado no existe."
    }, 404);
  }
  const codigo = codigoRes.data;
  // ==========================================================================
  // 6) Validar estado/vigencia/límites generales
  // ==========================================================================
  const validacion = validarCodigoAplicable({
    codigo,
    producto,
    plan
  });
  if (!validacion.ok) {
    await registrarLog("codigo_no_aplicable", {
      codigo: codigo.codigo,
      codigo_id: codigo.id,
      motivo: validacion.motivo,
      detalle: validacion.detalle ?? null,
      id_suscriptor,
      whatsapp,
      email
    }, true);
    return jsonResponse({
      ok: false,
      motivo: validacion.motivo,
      detalle: validacion.detalle ?? null
    }, 200);
  }
  // ==========================================================================
  // 7) Validar uso previo aplicado por usuario
  // ==========================================================================
  const usoPrevio = await existeUsoAplicadoPrevio({
    codigo_id: codigo.id,
    id_suscriptor,
    whatsapp,
    email
  });
  if (!usoPrevio.ok) {
    await registrarLog("uso_previo_query_error", {
      codigo: codigo.codigo,
      codigo_id: codigo.id,
      error: usoPrevio.error,
      id_suscriptor,
      whatsapp,
      email
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "error_validar_uso_previo",
      error: usoPrevio.error
    }, 500);
  }
  if (usoPrevio.existe) {
    await registrarLog("codigo_ya_usado_por_usuario", {
      codigo: codigo.codigo,
      codigo_id: codigo.id,
      id_suscriptor,
      whatsapp,
      email,
      criterio: usoPrevio.criterio,
      uso: usoPrevio.uso
    }, true);
    return jsonResponse({
      ok: false,
      motivo: "codigo_ya_usado_por_usuario",
      criterio: usoPrevio.criterio
    }, 200);
  }
  // ==========================================================================
  // 8) Calcular snapshot económico
  // ==========================================================================
  const snapshot = calcularSnapshotEconomico({
    codigo,
    precio_original_input,
    precio_aplicado_input
  });
  // ==========================================================================
  // 9) Insertar uso aplicado
  // ==========================================================================
  const usoInsert = await insertarUsoAplicado({
    codigo,
    input: {
      id_suscriptor,
      email,
      whatsapp,
      preapproval_id,
      payment_id,
      external_reference,
      metadata: {
        ...metadata,
        aplicado_en: tsNow,
        producto,
        plan,
        origen_funcion: FUNCION
      },
      aplicado_por
    },
    snapshot
  });
  if (!usoInsert.ok) {
    await registrarLog("insertar_uso_aplicado_error", {
      codigo: codigo.codigo,
      codigo_id: codigo.id,
      error: usoInsert.error,
      id_suscriptor,
      whatsapp,
      email,
      preapproval_id,
      payment_id,
      external_reference
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "error_insertar_uso_aplicado",
      error: usoInsert.error
    }, 500);
  }
  // ==========================================================================
  // 10) Incrementar contador de usos del código
  // ==========================================================================
  const inc = await incrementarUsoCodigo({
    codigo,
    actualizado_por: aplicado_por
  });
  if (!inc.ok) {
    // ------------------------------------------------------------------------
    // IMPORTANTE:
    // El uso ya fue insertado como aplicado.
    // Si falla el contador, no revertimos automáticamente.
    //
    // Para MVP:
    // - devolvemos warning
    // - dejamos log
    //
    // En una versión futura, esto podría manejarse con RPC transaccional.
    // ------------------------------------------------------------------------
    await registrarLog("incrementar_usos_codigo_error", {
      codigo: codigo.codigo,
      codigo_id: codigo.id,
      id_uso: usoInsert.id_uso,
      error: inc.error
    }, false);
    return jsonResponse({
      ok: true,
      warning: true,
      motivo_warning: "uso_aplicado_pero_no_incremento_contador",
      codigo: codigo.codigo,
      codigo_id: codigo.id,
      id_uso: usoInsert.id_uso,
      snapshot
    }, 200);
  }
  // ==========================================================================
  // 11) Log final OK
  // ==========================================================================
  await registrarLog("codigo_descuento_aplicado_ok", {
    codigo: codigo.codigo,
    codigo_id: codigo.id,
    id_uso: usoInsert.id_uso,
    id_suscriptor,
    whatsapp,
    email,
    preapproval_id,
    payment_id,
    external_reference,
    tipo_descuento: codigo.tipo_descuento,
    snapshot
  }, true);
  // ==========================================================================
  // 12) Respuesta final
  // ==========================================================================
  return jsonResponse({
    ok: true,
    accion: "codigo_descuento_aplicado",
    codigo: codigo.codigo,
    codigo_id: codigo.id,
    id_uso: usoInsert.id_uso,
    tipo_descuento: codigo.tipo_descuento,
    moneda: snapshot.moneda,
    precio_original: snapshot.precio_original,
    precio_aplicado: snapshot.precio_aplicado,
    valor_descuento_aplicado: snapshot.valor_descuento_aplicado,
    precio_primera_cuota: snapshot.precio_primera_cuota,
    precio_recurrente_normal: snapshot.precio_recurrente_normal,
    cantidad_ciclos_descuento: snapshot.cantidad_ciclos_descuento,
    dias_gratis_aplicados: snapshot.dias_gratis_aplicados,
    meses_gratis_aplicados: snapshot.meses_gratis_aplicados
  }, 200);
});
