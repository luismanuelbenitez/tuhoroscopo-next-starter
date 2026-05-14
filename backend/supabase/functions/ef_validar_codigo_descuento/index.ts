// ============================================================================
// 🎟️ EDGE FUNCTION: ef_validar_codigo_descuento
// ============================================================================
//
// OBJETIVO:
//   Validar un código promocional ANTES de crear una suscripción/pago.
//
// USO ESPERADO:
//   - Formulario premium
//   - ef_crear_suscripcion
//   - ef_crea_preapproval
//
// RESPONSABILIDAD:
//   Esta función responde si un código puede usarse y qué beneficio representa.
//
// IMPORTANTE:
//   Esta función NO aplica el código.
//   Esta función NO incrementa usos.
//   Esta función NO inserta uso aplicado.
//   Esta función NO toca Mercado Pago.
//
// FLUJO IDEAL:
//   1) Usuario escribe código en formulario.
//   2) Frontend o backend llama a ef_validar_codigo_descuento.
//   3) Si ok=true, se muestra precio/beneficio.
//   4) Se crea la suscripción/pago con la info correspondiente.
//   5) Cuando MP confirma, ef_webhook_mp llama a ef_aplicar_codigo_descuento.
//
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// 🔐 ENV
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const FUNCION = "ef_validar_codigo_descuento";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// 🧰 HELPERS
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
function normalizarCodigo(input) {
  if (typeof input !== "string") return "";
  return input.trim().toUpperCase();
}
function normalizarTextoOpcional(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value : null;
}
function normalizarEmail(input) {
  const value = normalizarTextoOpcional(input);
  return value ? value.toLowerCase() : null;
}
function normalizarNumero(input) {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const n = Number(input);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
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
// 🔁 VALIDAR SI YA FUE USADO
// ============================================================================
async function existeUsoAplicadoPrevio(params) {
  const { codigo_id, id_suscriptor, whatsapp, email } = params;
  // --------------------------------------------------------------------------
  // 1) Validar por id_suscriptor
  // --------------------------------------------------------------------------
  if (id_suscriptor !== null) {
    const { data, error } = await supabase.from("codigos_descuento_usos").select("id").eq("codigo_id", codigo_id).eq("id_suscriptor", id_suscriptor).eq("estado_uso", "aplicado").limit(1);
    if (error) return {
      ok: false,
      error: error.message
    };
    if (Array.isArray(data) && data.length > 0) {
      return {
        ok: true,
        existe: true,
        criterio: "id_suscriptor"
      };
    }
  }
  // --------------------------------------------------------------------------
  // 2) Validar por WhatsApp
  // --------------------------------------------------------------------------
  if (whatsapp) {
    const { data, error } = await supabase.from("codigos_descuento_usos").select("id").eq("codigo_id", codigo_id).eq("whatsapp", whatsapp).eq("estado_uso", "aplicado").limit(1);
    if (error) return {
      ok: false,
      error: error.message
    };
    if (Array.isArray(data) && data.length > 0) {
      return {
        ok: true,
        existe: true,
        criterio: "whatsapp"
      };
    }
  }
  // --------------------------------------------------------------------------
  // 3) Validar por email
  // --------------------------------------------------------------------------
  if (email) {
    const { data, error } = await supabase.from("codigos_descuento_usos").select("id").eq("codigo_id", codigo_id).eq("email", email).eq("estado_uso", "aplicado").limit(1);
    if (error) return {
      ok: false,
      error: error.message
    };
    if (Array.isArray(data) && data.length > 0) {
      return {
        ok: true,
        existe: true,
        criterio: "email"
      };
    }
  }
  return {
    ok: true,
    existe: false
  };
}
// ============================================================================
// ✅ VALIDAR REGLAS DEL CÓDIGO
// ============================================================================
function validarReglasCodigo(params) {
  const { codigo, producto, plan } = params;
  const now = new Date();
  // --------------------------------------------------------------------------
  // Activo
  // --------------------------------------------------------------------------
  if (codigo.activo !== true) {
    return {
      ok: false,
      motivo: "codigo_inactivo"
    };
  }
  // --------------------------------------------------------------------------
  // Fecha inicio
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
  // Fecha fin
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
  // Usos totales
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
  // Producto
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
  // Plan
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
// 🧮 CALCULAR BENEFICIO
// ----------------------------------------------------------------------------
// Esta función NO aplica nada.
// Solo devuelve el beneficio calculado.
// ============================================================================
function calcularBeneficio(params) {
  const { codigo, precio_base_input } = params;
  const moneda = codigo.moneda ?? "UYU";
  const tipo = codigo.tipo_descuento;
  const precio_recurrente_normal = codigo.precio_recurrente_normal !== null ? Number(codigo.precio_recurrente_normal) : precio_base_input;
  let precio_original = precio_base_input ?? precio_recurrente_normal;
  let precio_aplicado = null;
  let valor_descuento_aplicado = null;
  let precio_primera_cuota = null;
  let dias_gratis = null;
  let meses_gratis = null;
  let mensaje_usuario = "Código aplicado correctamente.";
  // --------------------------------------------------------------------------
  // Primera cuota
  // --------------------------------------------------------------------------
  if (tipo === "primera_cuota") {
    precio_primera_cuota = codigo.precio_primera_cuota !== null ? Number(codigo.precio_primera_cuota) : null;
    precio_aplicado = precio_primera_cuota;
    if (precio_original !== null && precio_aplicado !== null) {
      valor_descuento_aplicado = Math.max(precio_original - precio_aplicado, 0);
    }
    mensaje_usuario = precio_primera_cuota !== null && precio_recurrente_normal !== null ? `Código aplicado: primera cuota a ${precio_primera_cuota} ${moneda}, luego ${precio_recurrente_normal} ${moneda}.` : "Código aplicado: beneficio en la primera cuota.";
  }
  // --------------------------------------------------------------------------
  // Porcentaje
  // --------------------------------------------------------------------------
  if (tipo === "porcentaje") {
    const porcentaje = codigo.valor_descuento !== null ? Number(codigo.valor_descuento) : null;
    if (precio_original !== null && porcentaje !== null) {
      precio_aplicado = Number((precio_original * (1 - porcentaje / 100)).toFixed(2));
      valor_descuento_aplicado = Math.max(precio_original - precio_aplicado, 0);
    }
    mensaje_usuario = porcentaje !== null ? `Código aplicado: ${porcentaje}% de descuento.` : "Código aplicado: descuento porcentual.";
  }
  // --------------------------------------------------------------------------
  // Monto fijo
  // --------------------------------------------------------------------------
  if (tipo === "monto_fijo") {
    const monto = codigo.valor_descuento !== null ? Number(codigo.valor_descuento) : null;
    if (precio_original !== null && monto !== null) {
      precio_aplicado = Math.max(Number((precio_original - monto).toFixed(2)), 0);
      valor_descuento_aplicado = Math.max(precio_original - precio_aplicado, 0);
    }
    mensaje_usuario = monto !== null ? `Código aplicado: ${monto} ${moneda} de descuento.` : "Código aplicado: descuento de monto fijo.";
  }
  // --------------------------------------------------------------------------
  // Días gratis
  // --------------------------------------------------------------------------
  if (tipo === "dias_gratis") {
    dias_gratis = codigo.valor_descuento !== null ? Number(codigo.valor_descuento) : null;
    mensaje_usuario = dias_gratis !== null ? `Código aplicado: ${dias_gratis} días extra.` : "Código aplicado: días extra.";
  }
  // --------------------------------------------------------------------------
  // Meses gratis
  // --------------------------------------------------------------------------
  if (tipo === "meses_gratis") {
    meses_gratis = codigo.valor_descuento !== null ? Number(codigo.valor_descuento) : null;
    mensaje_usuario = meses_gratis !== null ? `Código aplicado: ${meses_gratis} mes(es) extra.` : "Código aplicado: meses extra.";
  }
  return {
    moneda,
    tipo_descuento: tipo,
    valor_descuento: codigo.valor_descuento !== null ? Number(codigo.valor_descuento) : null,
    precio_original,
    precio_aplicado,
    valor_descuento_aplicado,
    precio_primera_cuota,
    precio_recurrente_normal,
    cantidad_ciclos_descuento: codigo.cantidad_ciclos_descuento,
    dias_gratis,
    meses_gratis,
    mensaje_usuario
  };
}
// ============================================================================
// 🚀 HANDLER
// ============================================================================
serve(async (req)=>{
  // ==========================================================================
  // 0) Método
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
  // Para MVP lo dejo protegido con x-internal-key.
  // Si después querés que lo use el frontend directamente, conviene hacer una
  // función pública separada o controlar CORS + anon JWT + rate limit.
  // ==========================================================================
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== WHATSAPP_INTERNAL_KEY) {
    await registrarLog("unauthorized", {
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
  // 3) Normalización
  // ==========================================================================
  const codigoNormalizado = normalizarCodigo(body.codigo);
  const id_suscriptor = typeof body.id_suscriptor === "number" && Number.isInteger(body.id_suscriptor) ? body.id_suscriptor : null;
  const whatsapp = normalizarTextoOpcional(body.whatsapp);
  const email = normalizarEmail(body.email);
  const producto = normalizarTextoOpcional(body.producto);
  const plan = normalizarTextoOpcional(body.plan);
  const precio_base = normalizarNumero(body.precio_base);
  // ==========================================================================
  // 4) Validación mínima de input
  // ==========================================================================
  if (!codigoNormalizado) {
    return jsonResponse({
      ok: false,
      motivo: "codigo_requerido",
      mensaje_usuario: "Ingresá un código para validarlo."
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
      mensaje_usuario: "No pudimos validar el código en este momento."
    }, 500);
  }
  if (!codigoRes.data) {
    return jsonResponse({
      ok: false,
      motivo: "codigo_no_encontrado",
      mensaje_usuario: "El código ingresado no existe."
    }, 200);
  }
  const codigo = codigoRes.data;
  // ==========================================================================
  // 6) Validar reglas generales
  // ==========================================================================
  const reglas = validarReglasCodigo({
    codigo,
    producto,
    plan
  });
  if (!reglas.ok) {
    return jsonResponse({
      ok: false,
      motivo: reglas.motivo,
      detalle: reglas.detalle ?? null,
      mensaje_usuario: "Este código no está disponible para esta suscripción."
    }, 200);
  }
  // ==========================================================================
  // 7) Validar uso previo
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
      error: usoPrevio.error
    }, false);
    return jsonResponse({
      ok: false,
      motivo: "error_validar_uso_previo",
      mensaje_usuario: "No pudimos validar el uso previo del código."
    }, 500);
  }
  if (usoPrevio.existe) {
    return jsonResponse({
      ok: false,
      motivo: "codigo_ya_usado_por_usuario",
      criterio: usoPrevio.criterio,
      mensaje_usuario: "Este código ya fue utilizado."
    }, 200);
  }
  // ==========================================================================
  // 8) Calcular beneficio
  // ==========================================================================
  const beneficio = calcularBeneficio({
    codigo,
    precio_base_input: precio_base
  });
  // ==========================================================================
  // 9) Log OK
  // ==========================================================================
  await registrarLog("codigo_validado_ok", {
    codigo: codigo.codigo,
    codigo_id: codigo.id,
    tipo_descuento: codigo.tipo_descuento,
    id_suscriptor,
    whatsapp,
    email,
    producto,
    plan,
    beneficio
  }, true);
  // ==========================================================================
  // 10) Respuesta final
  // ==========================================================================
  return jsonResponse({
    ok: true,
    accion: "codigo_validado",
    codigo: codigo.codigo,
    codigo_id: codigo.id,
    descripcion: codigo.descripcion,
    tipo_descuento: codigo.tipo_descuento,
    moneda: beneficio.moneda,
    valor_descuento: beneficio.valor_descuento,
    precio_original: beneficio.precio_original,
    precio_aplicado: beneficio.precio_aplicado,
    valor_descuento_aplicado: beneficio.valor_descuento_aplicado,
    precio_primera_cuota: beneficio.precio_primera_cuota,
    precio_recurrente_normal: beneficio.precio_recurrente_normal,
    cantidad_ciclos_descuento: beneficio.cantidad_ciclos_descuento,
    dias_gratis: beneficio.dias_gratis,
    meses_gratis: beneficio.meses_gratis,
    mensaje_usuario: beneficio.mensaje_usuario
  }, 200);
});
