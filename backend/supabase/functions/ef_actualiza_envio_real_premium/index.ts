// ============================================================================
// 🧠 DESCRIPCIÓN TÉCNICA — ef_actualiza_envio_real_premium
// VERSION: v1.1.1
// FECHA: 2026-05-07
// ----------------------------------------------------------------------------
// RESPONSABILIDAD:
//   Registrar en la capa de negocio que un contenido Premium fue confirmado
//   como enviado por el sender de WhatsApp.
//
//   Esta función NO envía WhatsApp.
//   Esta función NO genera contenido.
//   Esta función NO decide qué usuario debe recibir contenido.
//   Esta función SOLO registra el hecho operativo de envío real.
//
// ----------------------------------------------------------------------------
// QUIÉN LA INVOCA:
//   Principalmente:
//
//     ef_whatsapp_sender
//
//   Luego de que WhatsApp Cloud API respondió correctamente y el sender obtuvo
//   un mensaje_id_whatsapp / wamid.
//
// ----------------------------------------------------------------------------
// SEGURIDAD:
//   Esta función está pensada para uso interno.
//
//   Requiere el header:
//
//     x-internal-key: <WHATSAPP_INTERNAL_KEY>
//
//   No usa WHATSAPP_TOKEN.
//   No llama a Meta.
//   No debe exponerse como endpoint público libre.
//
//   Si se usa solamente x-internal-key como protección, la Edge Function debe
//   desplegarse con:
//
//     supabase functions deploy ef_actualiza_envio_real_premium --no-verify-jwt
//
// ----------------------------------------------------------------------------
// INPUT ESPERADO:
//   Body JSON:
//
//   {
//     "id": 32,
//     "fecha_envio_real": "2026-05-07T06:50:41.167Z",
//     "mensaje_id_whatsapp": "wamid.HBg...",
//     "enviado_por": "ef_whatsapp_sender"
//   }
//
// CAMPOS:
//
//   id:
//     Obligatorio.
//     Integer positivo.
//     Corresponde a contenido_premium.id.
//     Antes esta función esperaba UUID, pero el modelo actual usa integer.
//
//   fecha_envio_real:
//     Opcional.
//     Puede venir como ISO string, epoch en segundos o epoch en milisegundos.
//     Si no viene, se usa la fecha/hora actual UTC.
//
//   mensaje_id_whatsapp:
//     Opcional pero recomendado.
//     Corresponde al wamid devuelto por WhatsApp Cloud API.
//     Se guarda en contenido_premium.mensaje_id_whatsapp.
//
//   enviado_por:
//     Opcional.
//     Identifica qué proceso confirmó el envío.
//     Valor recomendado: "ef_whatsapp_sender".
//     Si no viene, la función usa "ef_whatsapp_sender" por defecto.
//
// ----------------------------------------------------------------------------
// QUÉ ACTUALIZA EN contenido_premium:
//   Si el registro existe y todavía no tiene fecha_envio_real:
//
//     fecha_envio_real      = fecha recibida o now UTC
//     estado_envio          = "enviado"
//     mensaje_id_whatsapp   = wamid recibido, si vino
//     enviado_por           = valor recibido o "ef_whatsapp_sender"
//
//   El update es atómico e idempotente:
//
//     WHERE id = <id>
//       AND fecha_envio_real IS NULL
//
//   Esto evita que dos procesos marquen dos veces el mismo contenido.
//
// ----------------------------------------------------------------------------
// QUÉ ACTUALIZA EN suscriptores:
//   Si contenido_premium fue actualizado correctamente y tiene id_suscriptor:
//
//     primer_envio_premium_enviado = true
//     fecha_primer_envio_premium   = fecha_envio_real
//
//   Esta actualización solo debe aplicarse al primer envío Premium real del
//   suscriptor y se mantiene idempotente.
//
// ----------------------------------------------------------------------------
// RESPUESTAS ESPERADAS:
//
//   200 OK:
//     El contenido fue actualizado correctamente.
//
//   400 BAD REQUEST:
//     JSON inválido, id faltante/no integer o fecha inválida.
//
//   401 UNAUTHORIZED:
//     x-internal-key ausente, incorrecto o WHATSAPP_INTERNAL_KEY no configurada.
//
//   404 NOT FOUND:
//     No existe contenido_premium con ese id.
//
//   409 CONFLICT:
//     El contenido ya tenía fecha_envio_real.
//     Esto no necesariamente es un error grave: indica que la idempotencia
//     funcionó y el contenido ya había sido confirmado.
//
//   500 INTERNAL ERROR:
//     Error técnico al actualizar la base.
//
// ----------------------------------------------------------------------------
// LOGS EN log_funciones:
//   Registra eventos operativos como:
//
//     unauthorized
//     json_invalido
//     id_faltante_o_invalido
//     fecha_invalida
//     error_update
//     registro_no_encontrado
//     contenido_ya_enviado
//     primer_envio_marcado
//     error_update_suscriptor
//     enviado_ok
//
// ----------------------------------------------------------------------------
// PRINCIPIO DE DISEÑO:
//   El sender conoce el hecho del envío.
//   Esta función registra ese hecho.
//   No deduce datos que el sender ya tiene.
//   No mezcla lógica de transporte con lógica de negocio.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function nowUTCISO() {
  return new Date().toISOString();
}
function parseToUTCISO(input) {
  if (input == null || input === "") return nowUTCISO();
  // number o string numérica (epoch)
  const asNum = Number(input);
  if (Number.isFinite(asNum)) {
    const ms = asNum < 1e12 ? asNum * 1000 : asNum; // s -> ms
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // ISO
  const d = new Date(String(input));
  if (!isNaN(d.getTime())) return d.toISOString();
  throw new Error("fecha_envio_real inválida");
}
/*function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
*/ // ============================================================================
// 🧠 NORMALIZAR ID DE contenido_premium
// ----------------------------------------------------------------------------
// En el modelo actual de THC, contenido_premium.id es INTEGER.
// Esta función acepta:
// - number
// - string numérica
//
// Devuelve:
// - integer válido > 0
// - lanza error si no sirve
// ============================================================================
function parseContenidoPremiumId(input) {
  const n = Number(input);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("id debe ser integer positivo");
  }
  return n;
}
async function registrarLog(supabase, nombreFuncion, resultado, detalle = {}, exito = true, creadoPor = "system") {
  const { error } = await supabase.from("log_funciones").insert([
    {
      nombre_funcion: nombreFuncion,
      resultado,
      detalle,
      exito,
      creado_por: creadoPor,
      fecha_ejecucion: nowUTCISO()
    }
  ]);
  if (error) console.error("Error al guardar el log:", error);
}
serve(async (req)=>{
  const funcion = "ef_actualiza_envio_real_premium";
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  // ============================================================================
  // 🔐 SEGURIDAD INTERNA
  // ----------------------------------------------------------------------------
  // Esta función debe ser llamada por procesos internos, principalmente:
  // - ef_whatsapp_sender
  //
  // No usamos WHATSAPP_TOKEN acá.
  // No usamos token de Meta.
  // Solo validamos x-internal-key contra WHATSAPP_INTERNAL_KEY.
  //
  // IMPORTANTE:
  // Si Supabase Edge Function tiene verify_jwt activo, esta función puede cortar
  // antes de llegar acá. Para este esquema interno simple, desplegar con:
  //
  // supabase functions deploy ef_actualiza_envio_real_premium --no-verify-jwt
  // ============================================================================
  const internalKey = req.headers.get("x-internal-key");
  const expectedInternalKey = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
  if (!expectedInternalKey || internalKey !== expectedInternalKey) {
    await registrarLog(supabase, funcion, "unauthorized", {
      motivo: "x-internal-key inválido o no configurado"
    }, false);
    return new Response(JSON.stringify({
      resultado: "error",
      mensaje: "Unauthorized"
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  let body;
  try {
    body = await req.json();
  } catch  {
    await registrarLog(supabase, funcion, "json_invalido", {}, false);
    return new Response(JSON.stringify({
      resultado: "error",
      mensaje: "JSON inválido"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // ============================================================================
  // 2) VALIDAR ID DE contenido_premium
  // ----------------------------------------------------------------------------
  // Antes esta función esperaba UUID.
  // Ahora se alinea al modelo real:
  //
  //   contenido_premium.id = integer
  //
  // ============================================================================
  let id;
  try {
    id = parseContenidoPremiumId(body?.id);
  } catch (e) {
    await registrarLog(supabase, funcion, "id_faltante_o_invalido", {
      id_recibido: body?.id ?? null,
      error: e?.message ?? String(e)
    }, false);
    return new Response(JSON.stringify({
      resultado: "error",
      mensaje: "Falta id o no es integer válido"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  let fecha_ingresada_utc;
  try {
    fecha_ingresada_utc = parseToUTCISO(body?.fecha_envio_real);
  } catch (e) {
    await registrarLog(supabase, funcion, "fecha_invalida", {
      error: e?.message
    }, false);
    return new Response(JSON.stringify({
      resultado: "error",
      mensaje: "fecha_envio_real inválida"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // ============================================================================
  // 3) DATOS OPCIONALES RECOMENDADOS DESDE EL SENDER
  // ----------------------------------------------------------------------------
  // El sender ya conoce estos datos al momento de confirmar:
  //
  // - mensaje_id_whatsapp / wamid
  // - enviado_por
  //
  // Es mejor recibirlos acá que volver a buscarlos en otra tabla.
  // ============================================================================
  const mensajeIdWhatsapp = typeof body?.mensaje_id_whatsapp === "string" && body.mensaje_id_whatsapp.trim() ? body.mensaje_id_whatsapp.trim() : null;
  const enviadoPor = typeof body?.enviado_por === "string" && body.enviado_por.trim() ? body.enviado_por.trim() : "ef_whatsapp_sender";
  // ============================================================================
  // 4) UPDATE ATÓMICO DE contenido_premium
  // ----------------------------------------------------------------------------
  // Solo actualizamos si fecha_envio_real IS NULL.
  // Además de la fecha, dejamos registrado el hecho completo:
  // - estado_envio
  // - mensaje_id_whatsapp
  // - enviado_por
  // ============================================================================
  const updatePayload = {
    fecha_envio_real: fecha_ingresada_utc,
    estado_envio: "enviado",
    enviado_por: enviadoPor
  };
  if (mensajeIdWhatsapp) {
    updatePayload.mensaje_id_whatsapp = mensajeIdWhatsapp;
  }
  const { data: updated, error: updateError } = await supabase.from("contenido_premium").update(updatePayload).eq("id", id).is("fecha_envio_real", null).select(`
    id,
    fecha_envio_real,
    estado_envio,
    mensaje_id_whatsapp,
    enviado_por,
    id_suscriptor
  `).maybeSingle();
  if (updateError) {
    await registrarLog(supabase, funcion, "error_update", {
      id,
      updateError
    }, false);
    return new Response(JSON.stringify({
      id,
      resultado: "error",
      mensaje: "No se pudo actualizar la fecha de envío real"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  if (!updated) {
    // No se actualizó: o no existe, o ya tenía fecha.
    // Verificamos qué pasó para dar un 404 o 409 correcto.
    const { data: existente } = await supabase.from("contenido_premium").select(`id, fecha_envio_real, estado_envio, mensaje_id_whatsapp, enviado_por`).eq("id", id).maybeSingle();
    if (!existente) {
      await registrarLog(supabase, funcion, "registro_no_encontrado", {
        id
      }, false);
      return new Response(JSON.stringify({
        id,
        resultado: "error",
        mensaje: "No existe el registro"
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    return new Response(JSON.stringify({
      id,
      resultado: "conflicto",
      mensaje: "El contenido ya había sido enviado",
      fecha_envio_real_db_utc: existente.fecha_envio_real,
      estado_envio_db: existente.estado_envio,
      mensaje_id_whatsapp_db: existente.mensaje_id_whatsapp,
      enviado_por_db: existente.enviado_por,
      fecha_ingresada_utc,
      mensaje_id_whatsapp_recibido: mensajeIdWhatsapp,
      enviado_por_recibido: enviadoPor
    }), {
      status: 409,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // ============================================================================
  // ACTUALIZAR SUSCRIPTOR → PRIMER ENVÍO PREMIUM
  // ----------------------------------------------------------------------------
  // OBJETIVO:
  // - Marcar que el usuario ya recibió su primer contenido premium
  //
  // REGLA:
  // - Solo se marca si todavía NO estaba marcado (idempotente)
  // - Se ejecuta únicamente cuando el contenido realmente fue enviado
  //
  // IMPORTANTE:
  // - Este paso es crítico para:
  //     - evitar duplicar onboarding
  //     - controlar lógica futura
  // ============================================================================
  // ============================================================================
  // ACTUALIZAR SUSCRIPTOR → PRIMER ENVÍO PREMIUM
  // ----------------------------------------------------------------------------
  // OBJETIVO:
  // - Marcar que el usuario ya recibió su primer contenido premium.
  //
  // REGLA:
  // - Solo se ejecuta cuando el contenido realmente quedó enviado por primera vez.
  // - Aprovechamos el mismo UPDATE exitoso de contenido_premium para obtener
  //   id_suscriptor, evitando una segunda query innecesaria.
  //
  // IMPORTANTE:
  // - Solo marcamos al suscriptor si todavía no estaba marcado.
  // - Esto mantiene idempotencia y evita duplicar onboarding.
  // ============================================================================
  const idSuscriptor = updated.id_suscriptor;
  if (!idSuscriptor) {
    await registrarLog(supabase, funcion, "id_suscriptor_no_disponible_en_updated", {
      id,
      updated
    }, false);
  } else {
    const { error: errUpdateSuscriptor } = await supabase.from("suscriptores").update({
      primer_envio_premium_enviado: true,
      fecha_primer_envio_premium: fecha_ingresada_utc
    }).eq("id", idSuscriptor).is("primer_envio_premium_enviado", false);
    if (errUpdateSuscriptor) {
      await registrarLog(supabase, funcion, "error_update_suscriptor", {
        id_suscriptor: idSuscriptor,
        error: errUpdateSuscriptor.message
      }, false);
    } else {
      await registrarLog(supabase, funcion, "primer_envio_marcado", {
        id_suscriptor: idSuscriptor,
        fecha_primer_envio_premium: fecha_ingresada_utc
      }, true);
      console.log(`[${funcion}] ✓ Primer envío marcado para suscriptor ${idSuscriptor}`);
    }
  }
  await registrarLog(supabase, funcion, "enviado_ok", {
    id,
    fecha_envio_real_utc: updated.fecha_envio_real,
    estado_envio: updated.estado_envio,
    mensaje_id_whatsapp: updated.mensaje_id_whatsapp,
    enviado_por: updated.enviado_por,
    id_suscriptor: updated.id_suscriptor
  }, true);
  return new Response(JSON.stringify({
    ok: true,
    id,
    resultado: "ok",
    mensaje: "Contenido enviado",
    fecha_envio_real_utc: updated.fecha_envio_real,
    estado_envio: updated.estado_envio,
    mensaje_id_whatsapp: updated.mensaje_id_whatsapp,
    enviado_por: updated.enviado_por
  }), {
    headers: {
      "Content-Type": "application/json"
    }
  });
});
