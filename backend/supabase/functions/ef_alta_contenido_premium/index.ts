// ============================================================
// EF: ef_alta_contenido_premium
// ------------------------------------------------------------
// • Limpia duplicación de registrarLog
// • Add: modo silent → si silent = true NO guarda log
// • Logs coherentes (json, exito, timestamp, creado_por)
// • Idempotencia por (id_suscriptor, fecha_envio_programada, tipo)
// • Normalización UTC unificada
// ============================================================
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
function nowUTCISO() {
  return new Date().toISOString();
}
// ============================================================
// LOGGING ÚNICO Y CORRECTO (solo si silent = false)
// ============================================================
async function registrarLog(sb, funcion, resultado, detalle = null, exito = true, silent = false) {
  if (silent) return; // ← NO REGISTRA LOG
  try {
    await sb.from("log_funciones").insert({
      nombre_funcion: funcion,
      resultado,
      detalle: detalle ? JSON.stringify(detalle) : null,
      exito,
      fecha_ejecucion: nowUTCISO(),
      creado_por: "SUPABASE-OPENAI"
    });
  } catch (e) {
    console.error("FATAL: Falló registrarLog():", e);
  }
}
// ------------------------------------------------------------
// Helpers UTC
// ------------------------------------------------------------
function toUTCFromMVDDateOrISO(input) {
  if (!input) return null;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input);
  if (isDateOnly) {
    const d = new Date(`${input}T00:00:00-03:00`);
    return d.toISOString();
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) throw new Error("Fecha inválida");
  return d.toISOString();
}
function getNumeroSemanaUTC(fechaISO) {
  const [fecha] = fechaISO.split("T");
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const fechaObj = new Date(Date.UTC(anio, mes - 1, dia));
  const firstJan = new Date(Date.UTC(fechaObj.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((fechaObj.getTime() - firstJan.getTime()) / 86400000) + 1;
  return Math.ceil(diffDays / 7);
}
function normalizarTipo(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "diario") return "diario";
  if (v === "domingo") return "domingo";
  return null;
}
function extraerNumeroNN(valor) {
  if (typeof valor !== "string") return null;
  // Espera formato: "NN — ..."
  const m = valor.trim().match(/^(\d{1,2})\s*—/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 99) return null;
  return n;
}
function extraerColorBase(valor) {
  if (typeof valor !== "string") return null;
  // Espera algo como: "Verde — ...", "Amarillo — ...", etc.
  // Nos quedamos solo con lo que está ANTES del separador "—"
  const base = valor.split("—")[0]?.trim();
  // Validación mínima: no vacío y razonable
  if (!base) return null;
  // Opcional: evitar bases demasiado largas (por si vino cualquier cosa)
  if (base.length > 30) return null;
  return base;
}
// ============================================================
// SERVE HANDLER
// ============================================================
serve(async (req)=>{
  const funcion = "ef_alta_contenido_premium";
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({
      error: "JSON inválido"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // -------------------------------------------
  // Extraer payload
  // -------------------------------------------
  let { id_suscriptor, contenido, fecha_creacion, emocion_dominante, ciclo_semana, signo, fecha_envio_programada, fecha_envio_real = null, tipo, silent = false,
  color_base = null, numero_base = null, contenido_preferido_key = null,
  origen_generacion = null, meta_generacion = null,
  tokens_input = null, tokens_output = null, costo_estimado = null, modelo_ia = null } = body;
  const tipoFinal = normalizarTipo(tipo);
  if (!tipoFinal) {
    await registrarLog(supabase, funcion, "Tipo inválido", {
      tipo
    }, false, silent);
    return new Response(JSON.stringify({
      error: "Campo 'tipo' inválido. Use 'diario' o 'domingo'."
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // -------------------------------------------
  // Normalizar fechas a UTC
  // -------------------------------------------
  const fecha_creacion_utc = toUTCFromMVDDateOrISO(fecha_creacion) ?? nowUTCISO();
  const fecha_envio_programada_utc = toUTCFromMVDDateOrISO(fecha_envio_programada);
  const fecha_envio_real_utc = toUTCFromMVDDateOrISO(fecha_envio_real);
  // -------------------------------------------
  // Normalizar contenido (puede venir como string JSON)
  // -------------------------------------------
  let contenidoObj = contenido;
  if (typeof contenido === "string") {
    try {
      contenidoObj = JSON.parse(contenido);
    } catch  {
      await registrarLog(supabase, funcion, "Contenido inválido (JSON string no parsea)", {
        contenido
      }, false, silent);
      return new Response(JSON.stringify({
        error: "Campo 'contenido' inválido (no es JSON válido)"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
  }
  if (!contenidoObj || typeof contenidoObj !== "object") {
    await registrarLog(supabase, funcion, "Contenido inválido (no es objeto)", {
      contenido
    }, false, silent);
    return new Response(JSON.stringify({
      error: "Campo 'contenido' inválido (debe ser objeto JSON)"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // ============================================================
  // EXTRAER CAMPOS AISLADOS PARA COLUMNAS (SIN ROMPER jsonb)
  //  - color: texto completo (ej: "Verde — ...")
  //  - numero: SOLO el NN (1..99) para smallint
  //  - contenido_preferido: texto corto específico
  // ============================================================
  // ============================================================
  // EXTRAER / PRIORIZAR CAMPOS AISLADOS PARA COLUMNAS
  // ------------------------------------------------------------
  // Reglas de negocio (TU pedido):
  // - color (columna) = SOLO color base (ej: "Verde")
  // - numero (columna) = SOLO NN (ej: 27) => smallint
  // - contenido_preferido (columna) = SOLO la KEY del usuario (ej: "trabajo")
  // - El JSON completo sigue en "contenido" (jsonb) para WhatsApp
  // ============================================================
  // --------------------------------------------------------------------
  // 1) COLOR BASE (text)
  //   - PRIORIDAD: body.color_base (lo define tu backend)
  //   - FALLBACK: extraer del contenido generado ("Verde — ...")
  // --------------------------------------------------------------------
  const color = typeof color_base === "string" && color_base.trim() ? color_base.trim() : extraerColorBase(contenidoObj.color);
  // --------------------------------------------------------------------
  // 2) NUMERO BASE (smallint)
  //   - PRIORIDAD: body.numero_base (lo define tu backend)
  //   - FALLBACK: extraer del contenido generado ("27 — ...")
  // --------------------------------------------------------------------
  let numero = null;
  // Caso ideal: viene como number (27)
  if (typeof numero_base === "number" && Number.isFinite(numero_base)) {
    if (numero_base >= 1 && numero_base <= 99) numero = Math.trunc(numero_base);
  }
  // Caso aceptable: viene como string "27"
  if (numero === null && typeof numero_base === "string") {
    const n = parseInt(numero_base.trim(), 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 99) numero = n;
  }
  // Fallback: parsear "NN — ..." desde el JSON de GPT
  if (numero === null) {
    numero = extraerNumeroNN(contenidoObj.numero);
  }
  // --------------------------------------------------------------------
  // 3) CONTENIDO PREFERIDO KEY (text)
  //   - PRIORIDAD: body.contenido_preferido_key (lo define tu backend)
  //   - FALLBACK: NULL (porque NO querés guardar el texto generado)
  // --------------------------------------------------------------------
  const contenido_preferido_key_final = typeof contenido_preferido_key === "string" && contenido_preferido_key.trim() ? contenido_preferido_key.trim() : null;
  // A partir de acá, trabajamos con contenidoObj
  contenido = contenidoObj;
  // --------------------------------------------------------------------
  // META GENERACIÓN (mínimo)
  // --------------------------------------------------------------------
  const origen_generacion_final = typeof origen_generacion === "string" && origen_generacion.trim() ? origen_generacion.trim() : null;
  let meta_generacion_final = null;
  // Caso ideal: objeto JSON
  if (meta_generacion && typeof meta_generacion === "object") {
    meta_generacion_final = meta_generacion;
  }
  // Caso aceptable: string JSON
  if (!meta_generacion_final && typeof meta_generacion === "string") {
    try {
      const parsed = JSON.parse(meta_generacion);
      if (parsed && typeof parsed === "object") meta_generacion_final = parsed;
    } catch  {
      meta_generacion_final = null; // no rompemos
    }
  }
  // -------------------------------------------
  // Validación de requeridos
  // -------------------------------------------
  const missing = [];
  if (!id_suscriptor) missing.push("id_suscriptor");
  if (!contenido) missing.push("contenido");
  if (!signo) missing.push("signo");
  if (!fecha_envio_programada_utc) missing.push("fecha_envio_programada");
  if (missing.length) {
    await registrarLog(supabase, funcion, "Faltan campos obligatorios", {
      missing,
      body
    }, false, silent);
    return new Response(JSON.stringify({
      error: "Faltan campos obligatorios",
      missing
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // -------------------------------------------
  // Verificar que el suscriptor sea premium activo
  // -------------------------------------------
  const { data: suscriptor, error: errSusc } = await supabase.from("suscriptores").select("tipo_suscripcion, estado_suscripcion").eq("id", id_suscriptor).maybeSingle();
  if (errSusc) {
    await registrarLog(supabase, funcion, "Error verificando suscriptor", {
      error: errSusc.message
    }, false, silent);
    return new Response(JSON.stringify({
      error: "Error verificando suscriptor"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  if (!suscriptor || suscriptor.tipo_suscripcion !== "premium" || suscriptor.estado_suscripcion !== "activa") {
    await registrarLog(supabase, funcion, "Suscriptor no premium", {
      id_suscriptor,
      suscriptor
    }, false, silent);
    return new Response(JSON.stringify({
      error: "Suscriptor no premium activo"
    }), {
      status: 403,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // -------------------------------------------
  // ciclo_semana (si no vino)
  // -------------------------------------------
  if (!ciclo_semana) {
    try {
      ciclo_semana = getNumeroSemanaUTC(fecha_envio_programada_utc);
    } catch  {}
  }
  // -------------------------------------------
  // Idempotencia
  // -------------------------------------------
  const { data: existente, error: errExist } = await supabase.from("contenido_premium").select("id").eq("id_suscriptor", id_suscriptor).eq("fecha_envio_programada", fecha_envio_programada_utc).eq("tipo", tipoFinal).maybeSingle();
  if (errExist) {
    await registrarLog(supabase, funcion, "Error verificando duplicado", {
      error: errExist.message
    }, false, silent);
    return new Response(JSON.stringify({
      error: "Error verificando duplicado"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // -------------------------------------------
  // Ya existía → devolver ok pero sin registrar duplicado
  // -------------------------------------------
  if (existente) {
    const payload = {
      resultado: "ya_existe",
      id_suscriptor,
      fecha_envio_programada: fecha_envio_programada_utc,
      tipo: tipoFinal
    };
    await registrarLog(supabase, funcion, "Contenido ya existente", payload, true, silent);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // -------------------------------------------
  // Insertar contenido
  // -------------------------------------------
  const insertRow = {
    id_suscriptor,
    contenido: contenidoObj,
    color,
    numero,
    contenido_preferido: contenido_preferido_key_final,
    origen_generacion: origen_generacion_final,
    meta_generacion: meta_generacion_final,
    fecha_creacion: fecha_creacion_utc,
    generado: true,
    generado_por: "GPT",
    resultado: "ok",
    ciclo_semana,
    emocion_dominante,
    fecha_envio_programada: fecha_envio_programada_utc,
    fecha_envio_real: fecha_envio_real_utc,
    tipo: tipoFinal,
    tokens_input: typeof tokens_input === "number" ? tokens_input : null,
    tokens_output: typeof tokens_output === "number" ? tokens_output : null,
    costo_estimado: typeof costo_estimado === "number" ? costo_estimado : null,
    modelo_ia: typeof modelo_ia === "string" && modelo_ia.trim() ? modelo_ia.trim() : null,
  };
  const { data: inserted, error: errInsert } = await supabase.from("contenido_premium").insert([
    insertRow
  ]).select("id").single();
  if (errInsert) {
    await registrarLog(supabase, funcion, "Error al insertar contenido", {
      error: errInsert.message
    }, false, silent);
    return new Response(JSON.stringify({
      error: "No se pudo guardar el contenido"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // -------------------------------------------
  // RESPUESTA FINAL
  // -------------------------------------------
  const detalle = {
    resultado: "ok",
    id_contenido: inserted.id,
    id_suscriptor,
    fecha_envio_programada: fecha_envio_programada_utc,
    fecha_creacion: fecha_creacion_utc,
    signo,
    emocion_dominante,
    ciclo_semana,
    tipo: tipoFinal
  };
  await registrarLog(supabase, funcion, "Contenido premium guardado", detalle, true, silent);
  return new Response(JSON.stringify({
    mensaje: "Contenido premium guardado",
    ...detalle
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
});
