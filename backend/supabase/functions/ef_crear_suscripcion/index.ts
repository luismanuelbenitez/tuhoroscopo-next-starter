// ============================================================================
// EDGE FUNCTION: ef_crear_suscripcion
// VERSION: V11.0 – ALINEADA A FLUJO REAL (MP → WEBHOOK)
// ============================================================================
// RESPONSABILIDAD ÚNICA:
// - Crear preapproval en Mercado Pago
// - Guardar contrato y rastro inicial
// - NO activar premium
// - NO enviar WhatsApp
// - NO depender del frontend
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
const MP_ENV = (Deno.env.get("MP_ENV") || "sandbox").toLowerCase();
const MP_TEST_EMAIL = Deno.env.get("MP_TEST_PLAYER_EMAIL");
const BASE_URL_GRACIAS = Deno.env.get("BASE_URL_GRACIAS") || "https://tuhoroscopo-next-starter.vercel.app/gracias";
// ============================================================================
// CONSTANTES DE NEGOCIO / MODELO DE ESTADOS
// ----------------------------------------------------------------------------
// Estas constantes centralizan:
//
// - pricing actual
// - frecuencia de cobro
// - política de expiración de suscripciones pendientes
// - nombres canónicos de estados locales
//
// IMPORTANTE:
// "pendiente" = suscripción abierta, todavía reutilizable si está dentro del TTL
// "expirada_ttl" = suscripción pendiente vieja que YA NO reutilizamos
//
// NOTA ARQUITECTÓNICA:
// "expirada_ttl" es un estado LOCAL de tu sistema.
// NO significa necesariamente que Mercado Pago la haya expirado.
// Significa:
//   "para THC, esta suscripción ya no debe volver a usarse"
// ============================================================================
const MP_REASON = "Suscripción Premium Tu Horóscopo Cósmico";
const MP_AMOUNT = 390;
const MP_CURRENCY_ID = "UYU";
const MP_FREQUENCY = 1;
const MP_FREQUENCY_TYPE = "months";
// ---------------------------------------------------------------------------
// Política de reutilización de suscripciones pendientes
// ---------------------------------------------------------------------------
// Si una suscripción "pendiente" fue creada hace menos de este tiempo:
//   => se reutiliza
//
// Si supera este TTL:
//   => se marca como expirada_ttl
//   => se crea una nueva preapproval
//
// Valor recomendado para MVP / producción inicial:
//   24 horas
// ---------------------------------------------------------------------------
const PENDING_TTL_HOURS = 24;
// ---------------------------------------------------------------------------
// Estados locales de tu tabla suscripciones
// ---------------------------------------------------------------------------
const ESTADO_PENDIENTE = "pendiente";
const ESTADO_EXPIRADA_TTL = "expirada_ttl";
const supabase = createClient(SUPABASE_URL, SRK);
// ============================================================================
// HELPERS
// ============================================================================
const json = (payload, status = 200)=>new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
async function logFunc(resultado, detalle, exito = true) {
  try {
    await supabase.from("log_funciones").insert({
      nombre_funcion: "ef_crear_suscripcion",
      resultado,
      detalle,
      exito,
      creado_por: "system"
    });
  } catch  {
  // logging nunca rompe el flujo
  }
}
// ============================================================================
// HANDLER
// ============================================================================
serve(async (req)=>{
  if (req.method !== "POST") {
    return json({
      ok: false,
      error: "Método no permitido"
    }, 405);
  }
  try {
    // ------------------------------------------------------------------------
    // 1) INPUT
    // ------------------------------------------------------------------------
    const body = await req.json().catch(()=>({}));
    const {
      id_suscriptor,
      whatsapp,
      email,
      monto: montoBody,
      codigo_descuento,
      codigo_descuento_id,
      descuento_estado,
      descuento_metadata,
    } = body;
    if (!id_suscriptor || !whatsapp) {
      return json({
        ok: false,
        error: "Datos incompletos"
      }, 400);
    }
    // Monto final: usa el que viene del servidor (ya validado), fallback a MP_AMOUNT.
    const transactionAmount = (typeof montoBody === "number" && montoBody > 0) ? montoBody : MP_AMOUNT;
    const tieneDescuento = !!codigo_descuento;
    // ------------------------------------------------------------------------
    // 2) EMAIL FINAL (OBLIGATORIO PARA MP)
    // ------------------------------------------------------------------------
    let payerEmail = email;
    if (!payerEmail) {
      payerEmail = MP_ENV === "sandbox" && MP_TEST_EMAIL ? MP_TEST_EMAIL : `${String(whatsapp).replace(/\D/g, "")}@tuhoroscopo.com`;
    }
    // ============================================================================
    // 2.5) BUSCAR SUSCRIPCIÓN ABIERTA REUTILIZABLE
    // ----------------------------------------------------------------------------
    // Objetivo:
    // Antes de crear una nueva preapproval en Mercado Pago, verificar si el
    // suscriptor YA tiene una suscripción pendiente en tu sistema.
    //
    // ¿Por qué?
    // Porque si el usuario:
    //   - entra al funnel
    //   - abandona Mercado Pago
    //   - vuelve a entrar al funnel
    //
    // NO queremos crear una nueva suscripción cada vez.
    // Queremos:
    //   - reutilizar la pendiente si sigue vigente
    //   - o expirar la vieja por TTL y recién ahí crear una nueva
    //
    // IMPORTANTE:
    // Solo buscamos estados reutilizables.
    // Hoy: "pendiente"
    // Más adelante podrías sumar otros, si tu modelo lo requiere.
    // ============================================================================
    const { data: suscripcionExistente, error: errorSuscripcion } = await supabase.from("suscripciones").select("id, preapproval_id, init_point, estado, fecha_creacion, created_at").eq("suscriptor_id", Number(id_suscriptor)).in("estado", [
      ESTADO_PENDIENTE
    ]).order("fecha_creacion", {
      ascending: false,
      nullsFirst: false
    }).limit(1).maybeSingle();
    if (errorSuscripcion) {
      await logFunc("error_busqueda_suscripcion", errorSuscripcion, false);
      return json({
        ok: false,
        error: "Error buscando suscripción existente"
      }, 500);
    }
    // ---------------------------------------------------------------------------
    // SI EXISTE → NO CREAR NUEVA
    // ---------------------------------------------------------------------------
    // ---------------------------------------------------------------------------
    // SI EXISTE UNA SUSCRIPCIÓN PENDIENTE, DECIDIMOS:
    //   A) reutilizarla si sigue vigente dentro del TTL
    //   B) expirar_localmente la vieja si ya venció el TTL
    //
    // LÓGICA:
    //
    // 1) Tomamos una fecha base:
    //      - preferimos fecha_creacion
    //      - fallback a created_at
    //
    // 2) Calculamos antigüedad en horas
    //
    // 3) Si la suscripción es reciente:
    //      - NO creamos nueva preapproval
    //      - devolvemos el mismo init_point
    //
    // 4) Si ya venció TTL:
    //      - la marcamos como expirada_ttl
    //      - dejamos constancia en reason + log
    //      - y el flujo continúa para crear una nueva
    //
    // NOTA IMPORTANTE:
    // Si por alguna razón la suscripción no tiene fecha,
    // preferimos NO reutilizarla automáticamente.
    // Eso es una decisión conservadora y segura.
    // ---------------------------------------------------------------------------
    if (suscripcionExistente && !tieneDescuento) {
      // -------------------------------------------------------------------------
      // Fecha base de comparación
      // -------------------------------------------------------------------------
      const fechaBase = suscripcionExistente.fecha_creacion || suscripcionExistente.created_at || null;
      // -------------------------------------------------------------------------
      // Por defecto NO reutilizamos hasta demostrar que está dentro del TTL
      // -------------------------------------------------------------------------
      let reutilizable = false;
      // -------------------------------------------------------------------------
      // Si tenemos fecha válida, calculamos la antigüedad en horas
      // -------------------------------------------------------------------------
      if (fechaBase) {
        const ahoraMs = new Date().getTime();
        const fechaBaseMs = new Date(fechaBase).getTime();
        const diferenciaMs = ahoraMs - fechaBaseMs;
        const diferenciaHoras = diferenciaMs / (1000 * 60 * 60);
        reutilizable = diferenciaHoras < PENDING_TTL_HOURS;
      }
      // -------------------------------------------------------------------------
      // Si no tenemos fecha válida, calculamos la antigüedad en horas
      // -------------------------------------------------------------------------
      if (!fechaBase) {
        await logFunc("suscripcion_sin_fecha_no_reutilizable", {
          suscriptor_id: id_suscriptor,
          suscripcion_id: suscripcionExistente.id
        });
      }
      // -------------------------------------------------------------------------
      // CASO A: SUSCRIPCIÓN TODAVÍA VIGENTE DENTRO DEL TTL
      // -------------------------------------------------------------------------
      // Reutilizamos la misma suscripción pendiente:
      //   - no creamos nuevo preapproval
      //   - no insertamos nueva fila en suscripciones
      //   - no insertamos nuevo pago initiated
      //
      // Esto evita:
      //   - duplicación de contratos
      //   - ruido operativo
      //   - múltiples init_points para un mismo intento
      // -------------------------------------------------------------------------
      if (reutilizable) {
        await logFunc("reutiliza_suscripcion_existente", {
          suscriptor_id: id_suscriptor,
          preapproval_id: suscripcionExistente.preapproval_id,
          ttl_hours: PENDING_TTL_HOURS,
          politica: "reutilizacion_dentro_de_ttl"
        });
        return json({
          ok: true,
          init_point: suscripcionExistente.init_point,
          preapproval_id: suscripcionExistente.preapproval_id,
          reutilizada: true,
          mp_env: MP_ENV
        });
      }
      // -------------------------------------------------------------------------
      // CASO B: EXISTE PERO YA VENCIÓ EL TTL
      // -------------------------------------------------------------------------
      // La marcamos como expirada_ttl para que:
      //   - quede trazabilidad
      //   - NO vuelva a reutilizarse
      //   - podamos crear una nueva de forma limpia
      //
      // IMPORTANTE:
      // Esto expira la suscripción SOLO EN TU SISTEMA.
      // No implica necesariamente una cancelación en Mercado Pago.
      // -------------------------------------------------------------------------
      const { error: errorExpireTtl } = await supabase.from("suscripciones").update({
        estado: ESTADO_EXPIRADA_TTL,
        reason: `Expirada por TTL > ${PENDING_TTL_HOURS}h`,
        updated_at: new Date().toISOString()
      }).eq("id", suscripcionExistente.id);
      if (errorExpireTtl) {
        await logFunc("error_expirando_suscripcion_ttl", {
          suscriptor_id: id_suscriptor,
          suscripcion_id: suscripcionExistente.id,
          preapproval_id: suscripcionExistente.preapproval_id,
          error: errorExpireTtl.message
        }, false);
        return json({
          ok: false,
          error: "Error expirando suscripción por TTL"
        }, 500);
      }
      await logFunc("suscripcion_expirada_ttl", {
        suscriptor_id: id_suscriptor,
        suscripcion_id: suscripcionExistente.id,
        preapproval_id: suscripcionExistente.preapproval_id,
        ttl_hours: PENDING_TTL_HOURS,
        politica: "crear_nueva_despues_de_expirar_ttl"
      });
    // -------------------------------------------------------------------------
    // OJO:
    // NO hacemos return.
    // Dejamos que el flujo siga normalmente hacia:
    //   3) crear preapproval nueva en MP
    // -------------------------------------------------------------------------
    }
    // ------------------------------------------------------------------------
    // 3) CREAR PREAPPROVAL EN MP (FLUJO MODERNO)
    // ------------------------------------------------------------------------
    const external_reference = String(id_suscriptor);
    const back_url = `${BASE_URL_GRACIAS}?id_suscriptor=${id_suscriptor}`;
    const mpPayload = {
      reason: MP_REASON,
      external_reference,
      payer_email: payerEmail,
      auto_recurring: {
        frequency: MP_FREQUENCY,
        frequency_type: MP_FREQUENCY_TYPE,
        transaction_amount: transactionAmount,
        currency_id: MP_CURRENCY_ID
      },
      back_url
    };
    await logFunc("payload_mp_enviado", mpPayload);
    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(mpPayload)
    });
    const mpData = await mpRes.json();
    if (!mpRes.ok || !mpData?.id) {
      await logFunc("mp_error", mpData, false);
      return json({
        ok: false,
        error: "MP rechazó la solicitud"
      }, 502);
    }
    const preapproval_id = mpData.id;
    const init_point = mpData.sandbox_init_point || mpData.init_point;
    // ------------------------------------------------------------------------
    // 4) GUARDAR CONTRATO LOCAL EN TU SISTEMA
    // ------------------------------------------------------------------------
    // Este insert es CRÍTICO.
    // Si falla:
    //   - no debemos seguir
    //   - no debemos sincronizar suscriptor
    //   - no debemos registrar pago
    //   - no debemos devolver OK
    //
    // Por eso capturamos el error explícitamente.
    // ------------------------------------------------------------------------
    const insertSuscripcionPayload: Record<string, unknown> = {
      suscriptor_id: Number(id_suscriptor),
      provider: "mercadopago",
      preapproval_id,
      external_reference,
      estado: ESTADO_PENDIENTE,
      preapproval_status_mp: mpData.status || "pending",
      currency_id: MP_CURRENCY_ID,
      amount: transactionAmount,
      frequency: MP_FREQUENCY,
      frequency_type: MP_FREQUENCY_TYPE,
      payer_email: payerEmail,
      payer_id: mpData.payer_id || null,
      init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      back_url,
      raw: mpData,
    };
    if (tieneDescuento) {
      insertSuscripcionPayload.codigo_descuento = codigo_descuento;
      insertSuscripcionPayload.codigo_descuento_id = codigo_descuento_id || null;
      insertSuscripcionPayload.descuento_estado = descuento_estado || "validado";
      insertSuscripcionPayload.descuento_metadata = descuento_metadata || null;
    }
    const { error: insertSuscripcionError } = await supabase.from("suscripciones").insert(insertSuscripcionPayload);
    if (insertSuscripcionError) {
      await logFunc("error_insert_suscripcion", {
        id_suscriptor,
        preapproval_id,
        error: insertSuscripcionError.message
      }, false);
      return json({
        ok: false,
        error: "Error guardando suscripción"
      }, 500);
    }
    // ------------------------------------------------------------------------
    // 5) SINCRONIZAR SUSCRIPTOR (SOLO DATOS, SIN ACTIVAR)
    // ------------------------------------------------------------------------
    // Este update también es CRÍTICO.
    // Si falla:
    //   - la suscripción quedó creada
    //   - pero el suscriptor queda desalineado
    //
    // Eso genera inconsistencias operativas.
    // Por eso cortamos el flujo si falla.
    // ------------------------------------------------------------------------
    const { error: updateSuscriptorError } = await supabase.from("suscriptores").update({
      mp_payer_email: payerEmail,
      mp_payer_id: mpData.payer_id || null,
      preapproval_id,
      preapproval_status: mpData.status || "pending",
      actualizado_en: new Date().toISOString()
    }).eq("id", Number(id_suscriptor));
    if (updateSuscriptorError) {
      await logFunc("error_update_suscriptor", {
        id_suscriptor,
        preapproval_id,
        error: updateSuscriptorError.message
      }, false);
      return json({
        ok: false,
        error: "Error actualizando suscriptor"
      }, 500);
    }
    // ------------------------------------------------------------------------
    // 6) REGISTRAR INTENTO DE PAGO (OUTBOX FINANCIERO)
    // ------------------------------------------------------------------------
    // Este insert da trazabilidad al funnel.
    //
    // Si falla:
    //   - la suscripción existe
    //   - el suscriptor quedó sincronizado
    //   - pero perdemos observabilidad financiera
    //
    // En este diseño actual, lo tratamos como CRÍTICO,
    // así que si falla devolvemos error.
    // ------------------------------------------------------------------------
    const { error: insertPagoError } = await supabase.from("pagos").insert({
      suscriptor_id: Number(id_suscriptor),
      provider: "mercadopago",
      status: "initiated",
      amount: transactionAmount,
      currency: MP_CURRENCY_ID,
      link_pago: init_point,
      preapproval_id,
      provider_payment_id: `INIT-${preapproval_id}`,
      metadata: {
        env: MP_ENV,
        ...(tieneDescuento && { codigo_descuento }),
      }
    });
    if (insertPagoError) {
      await logFunc("error_insert_pago", {
        id_suscriptor,
        preapproval_id,
        error: insertPagoError.message
      }, false);
      return json({
        ok: false,
        error: "Error registrando pago"
      }, 500);
    }
    // ------------------------------------------------------------------------
    // 7) RESPUESTA AL FRONTEND
    // ------------------------------------------------------------------------
    await logFunc("suscripcion_creada_ok", {
      id_suscriptor,
      preapproval_id,
      init_point,
      ttl_policy: PENDING_TTL_HOURS,
      mp_env: MP_ENV
    });
    return json({
      ok: true,
      init_point,
      preapproval_id,
      mp_env: MP_ENV
    });
  } catch (e) {
    await logFunc("fatal_exception", {
      error: e.message
    }, false);
    return json({
      ok: false,
      error: "Error interno"
    }, 500);
  }
});
