// ============================================================
// === Edge Function: ef_webhook_mp (VERSIÓN 18)        =======
// ============================================================
// ------------------------------------------------------------
// IMPORTS
// ------------------------------------------------------------
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
// ------------------------------------------------------------
// CONFIGURACIÓN PRINCIPAL
// ------------------------------------------------------------
// Tu URL de Supabase
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
// Service Role para permisos totales
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Access Token privado de Mercado Pago
const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
// Si un pago aprobado activa la suscripción automáticamente
const CONFIRM_WITH_AUTHORIZED_PAYMENT = (Deno.env.get("CONFIRM_WITH_AUTHORIZED_PAYMENT") ?? "true").toLowerCase() === "true";
const internalKey = Deno.env.get("WHATSAPP_INTERNAL_KEY");
// Cliente Supabase con permisos completos
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// Constante para logs
const FN = "ef_webhook_mp";
// Entorno de MP (sandbox o producción)
const MP_ENV = (Deno.env.get("MP_ENV") ?? "sandbox").toLowerCase();
const IS_SANDBOX = MP_ENV !== "production";
// ACTIVAR MODO SANDBOX - PRUEBAS SIMULA RESPUESTA DE MP EVITANDO LA LÓGICA DE PRODUCCIÓN
const SANDBOX = IS_SANDBOX;
const SANDBOX_AUTOMATIC = false;
// ------------------------------------------------------------
// UTILIDADES COMUNES
// ------------------------------------------------------------
// Fecha ISO UTC
const nowIso = ()=>new Date().toISOString();
// Convierte fecha a YYYY-MM-DD (seguro)
function toDateOnlyISO(input) {
  if (!input) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
// Sleep para race condition controlada
const sleep = (ms)=>new Promise((resolve)=>setTimeout(resolve, ms));
// ============================================================================
// FUNCIÓN: obtenerContenidoPlantilla
// ----------------------------------------------------------------------------
// RESPONSABILIDAD:
//   - Buscar en tabla `plantillas` por `nombre`
//   - Retornar el campo `contenido` (NO el nombre)
//
// IMPORTANTE:
//   - En TU arquitectura:
//       nombre   = clave lógica interna
//       contenido = nombre REAL de plantilla en Meta
//
//   👉 ESTE ES EL VALOR QUE DEBE IR EN nombre_plantilla
// ============================================================================
async function obtenerContenidoPlantilla(supabase, nombre) {
  const { data, error } = await supabase.from("plantillas").select("contenido").eq("nombre", nombre).maybeSingle();
  if (error || !data?.contenido) {
    console.error("Error obteniendo plantilla:", error);
    return null;
  }
  return data.contenido; // 👈 CLAVE TOTAL
}
// ------------------------------------------------------------
// LOGGING SEGURO
// ------------------------------------------------------------
async function registrarLog(sb, funcion, resultado, detalle, exito = true) {
  try {
    await sb.from("log_funciones").insert({
      nombre_funcion: funcion,
      resultado,
      detalle: detalle ? JSON.stringify(detalle) : null,
      exito,
      creado_por: "webhook"
    });
  } catch (e) {
    console.error("FATAL: Falló el logging:", e);
  }
}
// ------------------------------------------------------------
// POSTGRES ADVISORY LOCKS
//   Garantizan que solo un proceso modifique un suscriptor a la vez
// ------------------------------------------------------------
async function acquireLock(sb, key) {
  const { error } = await sb.rpc("pg_advisory_lock", {
    key
  });
  if (error) return false;
  return true;
}
async function releaseLock(sb, key) {
  await sb.rpc("pg_advisory_unlock", {
    key
  });
}
// ============================================================================
// === INICIO HANDLER 1 — PREAPPROVAL (AJUSTADO MÍNIMO A TU TABLA DE VERDAD) ===
// ============================================================================
//
// OBJETIVO (NEGOCIO):
// - Este handler SOLO sincroniza el CONTRATO (preapproval) de Mercado Pago.
// - REGLA FINAL TUYA:
//     ✅ preapproval.status === "authorized"  ==> premium_activo = true (ACTIVA PREMIUM)
// - Para estados "paused" y "cancelled":
//     ✅ Si aún hay vigencia paga (fecha_vencimiento_premium), el acceso sigue (premium_activo=true)
//     ✅ Si NO hay vigencia, premium_activo=false
//   (El worker/cron luego puede “apagar” cuando venza; acá dejamos el flag coherente con la vigencia conocida)
//
// CAMBIOS MÍNIMOS VS TU CÓDIGO ORIGINAL:
// 1) Se ELIMINA toda referencia a `premium_pendiente_confirmacion` (ya la borraste).
// 2) Se LEE el suscriptor actual para NO pisar vencimiento si MP no trae next_payment_date.
// 3) Se calcula premium_activo en paused/cancelled usando “vigencia” (fecha_vencimiento_premium).
//
// NO SE AGREGA:
// - No onboarding/outbox.
// - No cambios en Handler 2/3.
// - No cambios en router.
// ============================================================================
async function handlePreapproval(preapprovalId) {
  const ahora = nowIso();
  // --------------------------------------------------------------------------
  // Helper de negocio: determinar si “todavía hay acceso” por vigencia paga
  // - fechaVencYYYYMMDD debe ser YYYY-MM-DD
  // - Consideramos vigente hasta fin de ese día (UTC)
  // --------------------------------------------------------------------------
  function dentroDeVigencia(fechaVencYYYYMMDD) {
    if (!fechaVencYYYYMMDD) return false;
    const finDia = new Date(`${fechaVencYYYYMMDD}T23:59:59.999Z`).getTime();
    return Date.now() <= finDia;
  }
  try {
    // ------------------------------------------------------------------------
    // 0) LEER SUSCRIPTOR ACTUAL (para no pisar datos si MP no trae fechas)
    // ------------------------------------------------------------------------
    // Necesitamos:
    // - id / fecha_vencimiento_premium actual (para mantener vigencia)
    // - fecha_inicio_premium actual (para no resetearla)
    const { data: subActual, error: errSubActual } = await supabase.from("suscriptores").select("id, fecha_vencimiento_premium, fecha_inicio_premium, premium_activo").eq("preapproval_id", preapprovalId).maybeSingle();
    if (errSubActual || !subActual) {
      await registrarLog(supabase, FN, "PREAPPROVAL_SUSCRIPTOR_NOT_FOUND", {
        preapprovalId,
        error: errSubActual?.message ?? null
      }, false);
      return;
    }
    // ------------------------------------------------------------------------
    // 1) OBTENER CONTRATO REAL DESDE MERCADO PAGO
    //    (Nunca confiamos en el webhook “como viene”)
    // ------------------------------------------------------------------------
    const r = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`
      }
    });
    const pre = await r.json().catch(()=>null);
    if (!r.ok || !pre) {
      await registrarLog(supabase, FN, "MP_PREAPPROVAL_API_ERROR", {
        preapprovalId,
        status: r.status,
        response: pre
      }, false);
      return;
    }
    // ------------------------------------------------------------------------
    // 2) NORMALIZAR DATOS CLAVE DEL CONTRATO
    // ------------------------------------------------------------------------
    const status = pre.status; // pending | authorized | paused | cancelled
    const nextPaymentDateRaw = pre.next_payment_date ?? null; // puede venir ISO o null
    const payerId = pre.payer_id?.toString() ?? pre.payer?.id?.toString() ?? null;
    const payerEmail = pre.payer_email ?? pre.payer?.email ?? null;
    // Para tu BBDD: fecha_vencimiento_premium la manejás como YYYY-MM-DD
    const nextPaymentDateYYYYMMDD = toDateOnlyISO(nextPaymentDateRaw);
    // “Vencimiento final” a usar para vigencia:
    // - Si MP trae next_payment_date, usamos eso.
    // - Si NO trae, mantenemos el que ya estaba en DB.
    const vencimientoFinalYYYYMMDD = nextPaymentDateYYYYMMDD ?? subActual.fecha_vencimiento_premium ?? null;
    // ------------------------------------------------------------------------
    // 3) MAPEO DE ESTADOS MP → NEGOCIO (TU TABLA DE VERDAD)
    // ------------------------------------------------------------------------
    let estadoSuscripcion = "pendiente_autorizacion";
    let premiumActivo = false;
    let autoRenovacionActiva = false;
    // Campos opcionales de auditoría
    // (mantengo tu estilo: seteo si corresponde)
    let fechaInicioPremium;
    let fechaActivacionDefinitiva;
    let fechaCancelacion;
    switch(status){
      case "authorized":
        // ✅ Regla final: authorized ACTIVA premium
        estadoSuscripcion = "activa";
        premiumActivo = true;
        autoRenovacionActiva = true;
        if (!subActual.fecha_inicio_premium) {
          fechaInicioPremium = ahora;
        }
        fechaActivacionDefinitiva = ahora;
        break;
      case "paused":
        estadoSuscripcion = "suspendida";
        autoRenovacionActiva = false;
        // ✅ SOLO recalcular premium si hay vencimiento conocido
        premiumActivo = dentroDeVigencia(vencimientoFinalYYYYMMDD);
        break;
      case "cancelled":
        estadoSuscripcion = "cancelada_no_renueva";
        autoRenovacionActiva = false;
        premiumActivo = dentroDeVigencia(vencimientoFinalYYYYMMDD);
        fechaCancelacion = ahora;
        break;
      case "pending":
      default:
        estadoSuscripcion = "pendiente_autorizacion";
        premiumActivo = subActual.premium_activo ?? false;
        autoRenovacionActiva = false;
        break;
    }
    // ------------------------------------------------------------------------
    // 4) ACTUALIZAR TABLA `suscripciones` (SIEMPRE)
    // ------------------------------------------------------------------------
    // Mantenemos tu lógica: update por preapproval_id.
    // Guardamos:
    // - estado interno del contrato
    // - auto_renovacion_activa (solo authorized)
    // - fecha_vencimiento_actual (la mejor señal que tengamos)
    const updateSuscripcion = {
      preapproval_status_mp: status,
      estado: status === "authorized" ? "activa" : status === "paused" ? "suspendida" : status === "cancelled" ? "cancelada_no_renueva" : "pendiente_autorizacion",
      auto_renovacion_activa: autoRenovacionActiva,
      // Preferimos YYYY-MM-DD si existe, para que tu sistema sea consistente
      // (si tu tabla `suscripciones` espera ISO completo, cambiás solo esta línea)
      fecha_vencimiento_actual: vencimientoFinalYYYYMMDD,
      raw: pre,
      updated_at: ahora
    };
    if (fechaActivacionDefinitiva) {
      updateSuscripcion.fecha_activacion_definitiva = fechaActivacionDefinitiva;
    }
    if (fechaCancelacion) {
      updateSuscripcion.fecha_cancelacion = fechaCancelacion;
    }
    if (payerId) updateSuscripcion.payer_id = payerId;
    if (payerEmail) updateSuscripcion.payer_email = payerEmail;
    const { error: errSubs } = await supabase.from("suscripciones").update(updateSuscripcion).eq("preapproval_id", preapprovalId);
    if (errSubs) {
      await registrarLog(supabase, FN, "PREAPPROVAL_DB_ERROR_SUSCRIPCIONES", {
        preapprovalId,
        status,
        error: errSubs.message ?? errSubs
      }, false);
      return;
    }
    // ------------------------------------------------------------------------
    // 4.5) APLICAR CÓDIGO DE DESCUENTO (solo cuando el preapproval se autoriza)
    // ------------------------------------------------------------------------
    if (status === "authorized" && internalKey) {
      const { data: suscripcionRow } = await supabase
        .from("suscripciones")
        .select("id, codigo_descuento, codigo_descuento_id, descuento_estado, amount")
        .eq("preapproval_id", preapprovalId)
        .maybeSingle();

      if (suscripcionRow?.descuento_estado === "validado" && suscripcionRow?.codigo_descuento) {
        try {
          const aplicarRes = await fetch(`${SUPABASE_URL}/functions/v1/ef_aplicar_codigo_descuento`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "x-internal-key": internalKey,
            },
            body: JSON.stringify({
              codigo: suscripcionRow.codigo_descuento,
              id_suscriptor: subActual.id,
              preapproval_id: preapprovalId,
              precio_original: 390,
              precio_aplicado: suscripcionRow.amount,
              aplicado_por: "ef_webhook_mp_preapproval",
            }),
          });

          if (aplicarRes.ok) {
            await supabase.from("suscripciones").update({
              descuento_estado: "aplicado",
              updated_at: ahora,
            }).eq("preapproval_id", preapprovalId);

            await registrarLog(supabase, FN, "DESCUENTO_APLICADO_OK", {
              preapproval_id: preapprovalId,
              codigo: suscripcionRow.codigo_descuento,
              id_suscriptor: subActual.id,
              precio_aplicado: suscripcionRow.amount,
            });
          } else {
            const errText = await aplicarRes.text().catch(() => "");
            await supabase.from("suscripciones").update({
              descuento_estado: "fallido",
              updated_at: ahora,
            }).eq("preapproval_id", preapprovalId);
            await registrarLog(supabase, FN, "DESCUENTO_APLICAR_EF_ERROR", {
              preapproval_id: preapprovalId,
              codigo: suscripcionRow.codigo_descuento,
              status: aplicarRes.status,
              response: errText,
            }, false);
          }
        } catch (couponErr) {
          await registrarLog(supabase, FN, "DESCUENTO_APLICAR_EXCEPTION", {
            preapproval_id: preapprovalId,
            codigo: suscripcionRow.codigo_descuento,
            error: String(couponErr),
          }, false);
        }
      }
    }
    // ------------------------------------------------------------------------
    // 5) ACTUALIZAR TABLA `suscriptores`
    //    ⚠️ SOLO cuando el contrato YA no es pending (como tu diseño original)
    //    ✅ CAMBIO MÍNIMO: NO existe más premium_pendiente_confirmacion
    // ------------------------------------------------------------------------
    if (status !== "pending") {
      const updateSuscriptor = {
        estado_suscripcion: estadoSuscripcion,
        preapproval_status: status,
        premium_activo: premiumActivo,
        auto_renovacion_activa: autoRenovacionActiva,
        actualizado_en: ahora,
        preapproval_actualizado_en: ahora
      };
      // Solo seteamos fecha_inicio_premium si antes estaba null
      if (fechaInicioPremium) {
        updateSuscriptor.fecha_inicio_premium = fechaInicioPremium;
      }
      // Si tenemos señal de vencimiento, la persistimos (YYYY-MM-DD)
      if (vencimientoFinalYYYYMMDD) {
        updateSuscriptor.fecha_vencimiento_premium = vencimientoFinalYYYYMMDD;
      }
      if (payerId) updateSuscriptor.mp_payer_id = payerId;
      if (payerEmail) updateSuscriptor.mp_payer_email = payerEmail;
      const { error: errSus } = await supabase.from("suscriptores").update(updateSuscriptor).eq("preapproval_id", preapprovalId);
      if (errSus) {
        await registrarLog(supabase, FN, "PREAPPROVAL_DB_ERROR_SUSCRIPTORES", {
          preapprovalId,
          status,
          error: errSus.message ?? errSus
        }, false);
        return;
      }
    }
    // ------------------------------------------------------------------------
    // 6) LOG FINAL DE ÉXITO (sin premium_pendiente_confirmacion)
    // ------------------------------------------------------------------------
    await registrarLog(supabase, FN, "PREAPPROVAL_SYNC_OK", {
      preapproval_id: preapprovalId,
      status,
      estado_suscripcion: estadoSuscripcion,
      premium_activo: premiumActivo,
      auto_renovacion_activa: autoRenovacionActiva,
      vencimiento_usado: vencimientoFinalYYYYMMDD,
      next_payment_date_raw: nextPaymentDateRaw
    });
  } catch (err) {
    await registrarLog(supabase, FN, "PREAPPROVAL_FATAL_EXCEPTION", {
      preapprovalId,
      error: String(err)
    }, false);
  }
}
// ============================================================================
// === FIN HANDLER 1 — PREAPPROVAL (AJUSTADO MÍNIMO A TU TABLA DE VERDAD) =====
// ============================================================================
// ============================================================================
// HANDLER 2 — PAYMENT
// ----------------------------------------------------------------------------
// allowSandboxMock:
//   - true  => en sandbox se permite generar mock inline
//   - false => en sandbox NO se simula nada automáticamente
//
// Esto nos permite tener 2 modos:
//
//   1) SANDBOX_AUTOMATIC = true
//      -> simula solo
//
//   2) SANDBOX_AUTOMATIC = false
//      -> solo simula si el router lo habilita explícitamente
//         (ej: Postman con header x-manual-test=true o type=payment_trigger)
//
// Objetivo:
//   sacar el “comportamiento fantasma” sin tocar la lógica de negocio.
// ============================================================================
async function handlePayment(paymentId, { allowSandboxMock = false } = {}) {
  try {
    // ----------------------------------------------------------
    // 1) ANTI-RACE-CONDITION — ESPERA CONTROLADA
    // ----------------------------------------------------------
    const wait_ms = 5000;
    await registrarLog(supabase, FN, "ANTI_RACE_CONDITION_START", {
      topic: "payment",
      id: paymentId,
      wait_ms
    });
    await sleep(wait_ms);
    await registrarLog(supabase, FN, "ANTI_RACE_CONDITION_END", {
      id: paymentId
    });
    // ==========================================================
    // 2) OBTENCIÓN DEL JSON DEL PAGO (MP REAL vs MOCK INLINE)
    // ==========================================================
    let pay = null;
    let finalEndpoint = null;
    let responseStatus = 0;
    // ----------------------------------------------------------
    // 🚀 MODO PRODUCCIÓN — CONSULTA REAL A MP
    // ----------------------------------------------------------
    if (!SANDBOX) {
      finalEndpoint = "v1/payments";
      const r1 = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`
        }
      });
      responseStatus = r1.status;
      if (r1.ok) {
        pay = await r1.json().catch(()=>null);
      } else {
        await registrarLog(supabase, FN, "MP_V1_PAYMENT_404_FALLBACK", {
          info: "Intento 1 (/v1/payments) falló, reintentando...",
          status: r1.status,
          payment_id: paymentId
        });
        finalEndpoint = "authorized_payments";
        const r2 = await fetch(`https://api.mercadopago.com/authorized_payments/${paymentId}`, {
          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN}`
          }
        });
        responseStatus = r2.status;
        if (r2.ok) {
          pay = await r2.json().catch(()=>null);
        }
      }
    } else {
      // ======================================================================
      // 🎭 SANDBOX CONTROLADO — PAYMENT
      // ----------------------------------------------------------------------
      // REGLA NUEVA:
      // - Si SANDBOX_AUTOMATIC = true  -> permitimos mock automático
      // - Si SANDBOX_AUTOMATIC = false -> SOLO permitimos mock si el router
      //   lo habilitó explícitamente con allowSandboxMock=true
      //
      // Esto evita que el sistema “se active solo” en DEV.
      // ======================================================================
      const sandboxPuedeSimular = SANDBOX_AUTOMATIC || allowSandboxMock;
      // ----------------------------------------------------------------------
      // CASO A: sandbox pasivo
      // ----------------------------------------------------------------------
      // No generamos pago mock.
      // No seguimos con activación.
      // Solo dejamos log y salimos.
      // ----------------------------------------------------------------------
      if (!sandboxPuedeSimular) {
        await registrarLog(supabase, FN, "SANDBOX_PASSIVE_PAYMENT_SKIP", {
          payment_id: paymentId,
          reason: "sandbox_mock_no_habilitado",
          sandbox_automatic: SANDBOX_AUTOMATIC,
          allowSandboxMock
        }, true);
        return;
      }
      // ----------------------------------------------------------------------
      // CASO B: sandbox habilitado para mock
      // ----------------------------------------------------------------------
      finalEndpoint = "mock_inline";
      let mockStatus = "approved";
      const endDigit = String(paymentId).slice(-1);
      switch(endDigit){
        case "1":
          mockStatus = "approved";
          break;
        case "2":
          mockStatus = "pending";
          break;
        case "3":
          mockStatus = "in_process";
          break;
        case "4":
          mockStatus = "rejected";
          break;
        case "5":
          mockStatus = "cancelled";
          break;
        default:
          mockStatus = "approved";
      }
      const { data: subSandbox } = await supabase.from("suscriptores").select("id, preapproval_id").order("creado_en", {
        ascending: false
      }).limit(1).maybeSingle();
      if (!subSandbox?.preapproval_id) {
        await registrarLog(supabase, FN, "SANDBOX_NO_PREAPPROVAL_FOUND", {
          payment_id: paymentId,
          mock_status: mockStatus
        }, false);
        return;
      }
      const REAL_PREAPPROVAL_ID = subSandbox.preapproval_id;
      pay = {
        id: String(paymentId),
        status: mockStatus,
        preapproval_id: REAL_PREAPPROVAL_ID,
        transaction_amount: 390,
        currency_id: "UYU",
        date_created: new Date().toISOString(),
        date_approved: mockStatus === "approved" ? new Date().toISOString() : null,
        payment_type_id: "credit_card",
        payment_method_id: "master",
        payer: {
          id: "MOCK-PAYER-ID",
          email: "mockpayer@example.com"
        },
        additional_info: null,
        statement_descriptor: "TUHOROSCOPO",
        installments: 1,
        description: "Suscripción Premium Tu Oráculo",
        mock: true,
        debug_note: "Pago generado internamente en SANDBOX usando preapproval REAL"
      };
      await registrarLog(supabase, FN, "SANDBOX_INLINE_PAYMENT_GENERATED", {
        payment_id: paymentId,
        mock_status: mockStatus,
        preapproval_id: REAL_PREAPPROVAL_ID,
        suscriptor_id: subSandbox.id,
        sandbox_automatic: SANDBOX_AUTOMATIC,
        allowSandboxMock
      });
    }
    // ----------------------------------------------------------
    // 2.1 VALIDACIÓN FINAL DEL JSON PAY
    // ----------------------------------------------------------
    if (!pay) {
      await registrarLog(supabase, FN, "MP_API_PAYMENT_ERROR_FINAL", {
        info: "Sin JSON válido (PRD o MOCK)",
        status: responseStatus,
        endpoint: finalEndpoint,
        payment_id: paymentId
      }, false);
      return;
    }
    await registrarLog(supabase, FN, "MP_API_PAYMENT_OK", {
      info: "Pago obtenido correctamente",
      endpoint_usado: finalEndpoint,
      payment_id: paymentId
    });
    // ==========================================================
    // 3) EXTRACCIÓN DE VARIABLES CLAVE
    // ==========================================================
    const preapproval_id = pay.preapproval_id;
    const status = pay.status;
    const fecha_pago = status === "approved" || status === "processed" ? toDateOnlyISO(pay.date_approved || pay.date_created || nowIso()) : null;
    // Si no pertenece a una suscripción => ignorar
    if (!preapproval_id) {
      await registrarLog(supabase, FN, "PAYMENT_IGNORED_NO_PREAPPROVAL", {
        payment_id: paymentId,
        status
      });
      return;
    }
    // ==========================================================
    // 4) UBICAR AL SUSCRIPTOR PROPIETARIO DEL PREAPPROVAL
    //    ✅ AJUSTE: sin premium_pendiente_confirmacion (ya no existe)
    // ==========================================================
    const { data: sub } = await supabase.from("suscriptores").select("id, nombre, whatsapp, premium_activo, bienvenida_enviada, fecha_vencimiento_premium").eq("preapproval_id", preapproval_id).maybeSingle();
    if (!sub) {
      await registrarLog(supabase, FN, "ORPHAN_PAYMENT", {
        payment_id: paymentId,
        preapproval_id
      }, false);
      return;
    }
    // ==========================================================
    // 5) ADVISORY LOCK — EVITA ACTUALIZACIONES DOBLES
    // ==========================================================
    if (!await acquireLock(supabase, sub.id)) {
      await registrarLog(supabase, FN, "LOCK_FAILED_PAYMENT", {
        id: sub.id
      }, false);
      return;
    }
    try {
      // ========================================================
      // 6) UPSERT DEL PAGO EN LA TABLA `pagos` (IDEMPOTENTE)
      // ========================================================
      const { error: payError } = await supabase.from("pagos").upsert({
        provider_payment_id: String(paymentId),
        mp_payment_id: String(paymentId),
        suscriptor_id: sub.id,
        preapproval_id,
        status,
        amount: pay.transaction_amount,
        currency: pay.currency_id,
        fecha_pago,
        provider: "mercadopago",
        tipo_pago: 1,
        raw: pay
      }, {
        onConflict: "provider_payment_id"
      });
      if (payError) {
        await registrarLog(supabase, FN, "DB_V1_PAYMENT_UPSERT_ERROR", {
          error: payError
        }, false);
        // Consistencia: si no pudimos persistir pago, NO seguimos activando premium
        return;
      }
      // ======================================================================
      // 🔐 BLINDAJE DE EXTENSIÓN — EVITA DUPLICAR MESES
      // ======================================================================
      // 1️⃣ Traer pago recién guardado
      const { data: pagoDB, error: pagoDBError } = await supabase.from("pagos").select("id_pago, procesado").eq("mp_payment_id", String(paymentId)).maybeSingle();
      if (pagoDBError || !pagoDB) {
        await registrarLog(supabase, FN, "PAYMENT_BLIND_NOT_FOUND", {
          payment_id: paymentId
        }, false);
        return; // no seguimos si no existe pago
      }
      // 2️⃣ Si ya fue procesado antes → SALIR
      if (pagoDB.procesado === true) {
        await registrarLog(supabase, FN, "PAYMENT_ALREADY_PROCESSED_SKIP_EXTENSION", {
          payment_id: paymentId
        }, true);
        return; // 🔴 NO extender vencimiento de nuevo
      }
      // ========================================================
      // 7) ACTIVACIÓN / RENOVACIÓN DE SUSCRIPCIÓN PREMIUM
      // ========================================================
      const isApproved = status === "approved" || status === "processed";
      // Gate que ya tenías (la dejo igual)
      if (!isApproved || !CONFIRM_WITH_AUTHORIZED_PAYMENT) {
        await registrarLog(supabase, FN, "PAYMENT_NOT_APPROVED_NO_STATE_CHANGE", {
          suscriptor_id: sub.id,
          payment_id: String(paymentId),
          status,
          confirm_flag: CONFIRM_WITH_AUTHORIZED_PAYMENT
        });
        return;
      }
      // --------------------------------------------------------------------
      // 7.1 Calcular nuevo vencimiento (TABLA DE VERDAD):
      // base = max(hoy, vencimiento_actual) + 1 mes
      //
      // ✅ AJUSTE: “primer pago” ahora es:
      //   - premium_activo !== true  OR  vencimiento_actual vacío
      // --------------------------------------------------------------------
      const hoy = new Date();
      const vencActual = sub.fecha_vencimiento_premium ? new Date(`${sub.fecha_vencimiento_premium}T00:00:00.000Z`) : null;
      // ======================================================================
      // NUEVA DEFINICIÓN CANÓNICA DE "PRIMERA ACTIVACIÓN"
      // ----------------------------------------------------------------------
      // ❗ IMPORTANTE:
      // Ya NO usamos premium_activo como criterio.
      // Porque puede haber sido activado por preapproval authorized.
      //
      // La verdadera primera activación para onboarding es:
      //
      //   👉 Que NUNCA se haya enviado bienvenida.
      //
      // Esto hace el sistema determinístico e idempotente.
      // ======================================================================
      const esPrimeraActivacion = sub.bienvenida_enviada !== true;
      const base = esPrimeraActivacion ? hoy : new Date(Math.max(hoy.getTime(), vencActual?.getTime() ?? hoy.getTime()));
      const basePlus = new Date(base);
      basePlus.setMonth(basePlus.getMonth() + 1);
      const nuevoVencimiento = toDateOnlyISO(basePlus);
      // --------------------------------------------------------------------
      // 7.2 Actualizar suscriptor (premium_activo=true siempre por pago aprobado)
      // --------------------------------------------------------------------
      const { error: updErr } = await supabase.from("suscriptores").update({
        premium_activo: true,
        // 🔥 FIX CRÍTICO
        estado_suscripcion: "activa",
        fecha_vencimiento_premium: nuevoVencimiento,
        actualizado_en: nowIso()
      }).eq("id", sub.id);
      // ============================================================================
      // 🧾 SI FALLA EL UPDATE DEL SUSCRIPTOR, CORTAMOS ACÁ
      // ----------------------------------------------------------------------------
      // ¿Por qué?
      // Porque si no pudo actualizarse el suscriptor principal:
      //
      //   - NO corresponde encolar bienvenida
      //   - NO corresponde marcar bienvenida_enviada = true
      //   - NO corresponde marcar el pago como procesado
      //
      // Si seguimos igual, dejamos el sistema incoherente:
      //   pago entró, pero estado premium del suscriptor quedó mal.
      // ============================================================================
      if (updErr) {
        await registrarLog(supabase, FN, "ERROR_UPDATE_SUSCRIPTOR_POST_PAYMENT", {
          suscriptor_id: sub.id,
          error: updErr
        }, false);
        return;
      }
      // ============================================================================
      // SINCRONIZACIÓN DE TABLA SUSCRIPCIONES
      // ----------------------------------------------------------------------------
      // Esto mantiene alineado el contrato con el estado real del usuario
      // ============================================================================
      // ============================================================================
      // 🔄 SINCRONIZACIÓN DE CONTRATO (TABLA suscripciones)
      // ============================================================================
      // Mantiene coherencia contractual con el pago recibido
      // ============================================================================
      const { error: errSubsUpdate } = await supabase.from("suscripciones").update({
        estado: "activa",
        fecha_activacion_definitiva: new Date().toISOString(),
        fecha_vencimiento_actual: nuevoVencimiento,
        updated_at: new Date().toISOString()
      }).eq("suscriptor_id", sub.id).eq("preapproval_id", preapproval_id);
      if (errSubsUpdate) {
        await registrarLog(supabase, FN, "SUBSCRIPTION_UPDATE_BY_PAYMENT_ERROR", {
          suscriptor_id: sub.id,
          error: errSubsUpdate.message ?? errSubsUpdate
        }, false);
        return;
      }
      // --------------------------------------------------------------------
      // 7.3 Onboarding (solo 1 vez)
      //    - Si antes NO era premium_activo y aún no marcamos bienvenida_enviada
      // --------------------------------------------------------------------
      // ======================================================================
      // ONBOARDING CANÓNICO
      // ----------------------------------------------------------------------
      // Solo depende de bienvenida_enviada.
      // NO depende de premium_activo.
      // NO depende de vencimiento.
      // NO depende de preapproval.
      // ----------------------------------------------------------------------
      // Si bienvenida_enviada != true => encolar.
      // Si ya está true => no encolar.
      // ======================================================================
      const nombrePlantilla = "bienvenida_validacion_numero";
      const contenidoPlantilla = await obtenerContenidoPlantilla(supabase, nombrePlantilla);
      if (!contenidoPlantilla) {
        // ============================================================================
        // ERROR CONTROLADO: no se pudo obtener la plantilla
        // ----------------------------------------------------------------------------
        // NO lanzamos throw:
        // - porque estamos en webhook
        // - porque queremos control total vía logs
        // ============================================================================
        await registrarLog(supabase, FN, "PLANTILLA_NO_ENCONTRADA", {
          nombre_plantilla: nombrePlantilla,
          suscriptor_id: sub.id,
          origen: "payment"
        }, false);
        return;
      }
      if (sub.bienvenida_enviada !== true) {
        // Encolar mensaje en outbox (mensajes_enviados)
        // ✅ Ajustado a tu esquema actual (id_suscriptor / whatsapp_destino / nombre_plantilla / etc.)
        const now = nowIso();
        // ============================================================================
        // 📤 ENCOLAR MENSAJE DE BIENVENIDA EN OUTBOX + OBTENER ID DEL REGISTRO + SENDER
        // ----------------------------------------------------------------------------
        // CAMBIO PUNTUAL:
        // - Antes: insertábamos el mensaje y solo verificábamos error
        // - Ahora: insertamos, recuperamos el `id` del registro creado y luego
        //   disparamos el sender en modo express con ese mismo id.
        //
        // ¿Por qué?
        // - Porque este mensaje de bienvenida / validación de número es CRÍTICO
        // - No queremos depender del cron/sniper para que salga
        // - Queremos que salga INMEDIATAMENTE después del alta por pago aprobado
        //
        // IMPORTANTE:
        // - NO cambiamos la estructura del mensaje
        // - NO cambiamos la plantilla
        // - NO cambiamos metadata
        // - SOLO agregamos:
        //     1) .select("id").single()
        //     2) fetch al sender con ese id
        // ============================================================================
        const { data: msgCreado, error: errInsertMensaje } = await supabase.from("mensajes_enviados").insert({
          id_suscriptor: sub.id,
          whatsapp_destino: sub.whatsapp,
          tipo_mensaje: "operativo",
          canal_envio: "whatsapp",
          estado: "pendiente",
          fecha_hora: now,
          fecha_creado: now,
          intentos: 0,
          ultimo_error: null,
          reintentar_despues: null,
          // En tu arquitectura, `contenidoPlantilla` ya contiene
          // el nombre REAL de la template aprobada en Meta
          nombre_plantilla: contenidoPlantilla,
          metadata: {
            origen: "payment",
            payment_id: String(paymentId),
            preapproval_id: String(preapproval_id),
            // ======================================================================
            // VARIABLES DE TEMPLATE
            // ----------------------------------------------------------------------
            // bienvenida_validacion_numero requiere el nombre
            // fallback a string vacío por seguridad
            // ======================================================================
            variables: {
              nombre: String(sub?.nombre ?? "").trim()
            }
          }
        }).select("id").single();
        if (errInsertMensaje || !msgCreado?.id) {
          await registrarLog(supabase, FN, "BIENVENIDA_ENCOLADA_ERROR", {
            suscriptor_id: sub.id,
            origen: "payment",
            error: errInsertMensaje?.message ?? errInsertMensaje ?? "insert_sin_id"
          }, false);
          return;
        }
        // ============================================================================
        // 🚀 ENVÍO EXPRESS DE BIENVENIDA
        // ----------------------------------------------------------------------------
        // CAMBIO PUNTUAL:
        // - Apenas tenemos el id del mensaje recién creado,
        //   llamamos al sender en forma inmediata.
        //
        // IMPORTANTE:
        // - El sender sigue siendo la única pieza que:
        //     * valida plantilla
        //     * procesa estado
        //     * envía a WhatsApp
        //     * deja trazabilidad técnica del envío
        //
        // ACÁ NO ENVIAMOS WHATSAPP DIRECTAMENTE.
        // ACÁ SOLO DISPARAMOS EL SENDER CON EL ID DEL OUTBOX.
        //
        // NOTA:
        // - Usamos la internal key del propio proyecto
        // - Si el sender responde no-OK, dejamos log y cortamos
        // - Si explota el fetch, también dejamos log y cortamos
        // ============================================================================
        // ============================================================================
        // 🔐 VALIDACIÓN DE INTERNAL KEY (CRÍTICO)
        // ============================================================================
        if (!internalKey) {
          await registrarLog(supabase, FN, "ERROR_NO_INTERNAL_KEY", {
            suscriptor_id: sub.id,
            id_mensaje: msgCreado.id,
            origen: "payment",
            mensaje: "WHATSAPP_INTERNAL_KEY no configurada"
          }, false);
          return;
        }
        try {
          const senderResp = await fetch(`${SUPABASE_URL}/functions/v1/ef_whatsapp_sender`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SENDER_BEARER_TOKEN") ?? ""}`,
              "x-internal-key": internalKey
            },
            body: JSON.stringify({
              id_mensaje: msgCreado.id
            })
          });
          if (!senderResp.ok) {
            const senderText = await senderResp.text().catch(()=>"");
            await registrarLog(supabase, FN, "BIENVENIDA_EXPRESS_SENDER_ERROR", {
              suscriptor_id: sub.id,
              id_mensaje: msgCreado.id,
              origen: "payment",
              status: senderResp.status,
              response: senderText
            }, false);
            return;
          }
          // ==========================================================================
          // LOG DE ÉXITO DEL DISPARO EXPRESS
          // --------------------------------------------------------------------------
          // OJO:
          // - Esto significa que el sender fue invocado correctamente
          // - NO significa necesariamente que WhatsApp ya lo marcó como enviado
          // - El detalle final del envío vive en ef_whatsapp_sender
          // ==========================================================================
          await registrarLog(supabase, FN, "BIENVENIDA_EXPRESS_SENDER_OK", {
            suscriptor_id: sub.id,
            id_mensaje: msgCreado.id,
            origen: "payment"
          }, true);
        } catch (err) {
          await registrarLog(supabase, FN, "BIENVENIDA_EXPRESS_SENDER_EXCEPTION", {
            suscriptor_id: sub.id,
            id_mensaje: msgCreado.id,
            origen: "payment",
            error: String(err)
          }, false);
          return;
        }
        // Marcar flag para no repetir
        // ============================================================================
        // ✅ MARCAR FLAG DE BIENVENIDA ENVIADA
        // ----------------------------------------------------------------------------
        // Esto evita reencolar la bienvenida en futuros eventos.
        // Si este update falla, lo logueamos y cortamos.
        // ============================================================================
        const { error: errFlagBienvenida } = await supabase.from("suscriptores").update({
          bienvenida_enviada: true,
          actualizado_en: nowIso()
        }).eq("id", sub.id);
        if (errFlagBienvenida) {
          await registrarLog(supabase, FN, "BIENVENIDA_FLAG_UPDATE_ERROR", {
            suscriptor_id: sub.id,
            origen: "payment",
            error: errFlagBienvenida.message ?? errFlagBienvenida
          }, false);
          return;
        }
        await registrarLog(supabase, FN, "BIENVENIDA_CONFIRMACION_ENCOLADA_OK", {
          suscriptor_id: sub.id,
          origen: "payment"
        });
      } else {
        await registrarLog(supabase, FN, "BIENVENIDA_CONFIRMACION_NO_APLICA", {
          suscriptor_id: sub.id,
          motivo: "bienvenida_enviada_ya_true",
          origen: "payment"
        });
      }
      // Log final
      await registrarLog(supabase, FN, "SUBSCRIPTION_ACTIVATED_BY_PAYMENT", {
        id: sub.id,
        nuevo_vencimiento: nuevoVencimiento,
        es_primera_activacion: esPrimeraActivacion
      });
      // ======================================================================
      // ✅ MARCAR PAGO COMO PROCESADO (CRÍTICO)
      // ======================================================================
      // ============================================================================
      // ✅ MARCAR PAGO COMO PROCESADO
      // ----------------------------------------------------------------------------
      // Esto evita reprocesar el mismo pago en eventos futuros.
      // Si falla, lo dejamos logueado para no perder trazabilidad.
      // ============================================================================
      const { error: errPagoProcesado } = await supabase.from("pagos").update({
        procesado: true
      }).eq("mp_payment_id", String(paymentId));
      if (errPagoProcesado) {
        // ============================================================================
        // LOG DE ERROR AL MARCAR PAGO COMO PROCESADO
        // ----------------------------------------------------------------------------
        // Este update está corriendo dentro del flujo PAYMENT.
        // Por consistencia operativa, el origen debe ser correcto.
        // ============================================================================
        await registrarLog(supabase, FN, "PAGO_PROCESADO_UPDATE_ERROR", {
          payment_id: String(paymentId),
          origen: "payment",
          error: errPagoProcesado.message ?? errPagoProcesado
        }, false);
        return;
      }
    } finally{
      // ========================================================
      // 8) LIBERAMOS EL ADVISORY LOCK
      // ========================================================
      await releaseLock(supabase, sub.id);
    }
  } catch (err) {
    // ==========================================================
    // 9) TRY/CATCH GENERAL (MANEJO GLOBAL DE ERRORES)
    // ==========================================================
    await registrarLog(supabase, FN, "PAYMENT_FATAL_EXCEPTION", {
      error: String(err),
      paymentId
    }, false);
  }
}
// ============================================================================
// === FIN HANDLER 2 — PAYMENT (AJUSTADO MÍNIMO A TU TABLA DE VERDAD) =========
// ============================================================================
// ============================================================================
// === INICIO HANDLER 3 — AUTHORIZED_PAYMENT (LEGACY) (AJUSTE MÍNIMO) =========
// ============================================================================
//
// OBJETIVO (MISMO QUE HANDLER 2):
// - Registrar pago en `pagos` (idempotente).
// - Si approved/processed => premium_activo=true y renovar vencimiento:
//      vencimiento = max(hoy, vencimiento_actual) + 1 mes
// - Onboarding SOLO 1 vez si es la primera activación premium
//   y bienvenida_enviada != true (encola plantilla bienvenida_confirmacion).
//
// AJUSTES MÍNIMOS (LO NECESARIO) vs tu handler actual:
// 1) Eliminado `premium_pendiente_confirmacion` (ya no existe en tu DB).
// 2) Query a `suscriptores` ajustada a campos reales usados:
//      id, whatsapp, premium_activo, bienvenida_enviada, fecha_vencimiento_premium
// 3) "primer pago" ahora se determina por:
//      (sub.premium_activo !== true) OR (!sub.fecha_vencimiento_premium)
// 4) Update de suscriptor: no escribe premium_pendiente_confirmacion (quitado).
// 5) Onboarding: igual que handler 2 (outbox en mensajes_enviados + flag bienvenida_enviada)
//
// NO TOCO:
// - Fetch PRD a /authorized_payments
// - Logs, locks, idempotencia de pagos
// - CONFIRM_WITH_AUTHORIZED_PAYMENT
//
// ============================================================================
// ============================================================================
// HANDLER 3 — AUTHORIZED_PAYMENT
// ----------------------------------------------------------------------------
// Mismo criterio que handlePayment:
//   - sandbox automático solo si SANDBOX_AUTOMATIC=true
//   - sandbox manual si router pasa allowSandboxMock=true
// ============================================================================
async function handleAuthorizedPayment(paymentId, { allowSandboxMock = false } = {}) {
  try {
    // ----------------------------------------------------------
    // 1) ANTI-RACE-CONDITION — Espera controlada
    // ----------------------------------------------------------
    const wait_ms = 15000;
    await registrarLog(supabase, FN, "ANTI_RACE_CONDITION_START", {
      topic: "authorized_payment",
      id: paymentId,
      wait_ms
    });
    await sleep(wait_ms);
    await registrarLog(supabase, FN, "ANTI_RACE_CONDITION_END", {
      id: paymentId
    });
    // ==========================================================
    // 2) OBTENCIÓN DEL JSON DEL AUTHORIZED PAYMENT
    // ==========================================================
    let ap = null;
    let finalEndpoint = null;
    let responseStatus = 0;
    // ----------------------------------------------------------
    // 🚀 PRODUCCIÓN — CONSULTA REAL A MP
    // ----------------------------------------------------------
    if (!SANDBOX) {
      finalEndpoint = "authorized_payments";
      const r = await fetch(`https://api.mercadopago.com/authorized_payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`
        }
      });
      responseStatus = r.status;
      ap = await r.json().catch(()=>null);
      if (!r.ok || !ap) {
        await registrarLog(supabase, FN, "MP_AUTH_PAYMENT_API_ERROR", {
          status: r.status,
          response: ap,
          payment_id: paymentId
        }, false);
        return;
      }
    } else {
      // ======================================================================
      // 🎭 SANDBOX CONTROLADO — AUTHORIZED_PAYMENT
      // ----------------------------------------------------------------------
      // Misma política que en handlePayment.
      // ======================================================================
      const sandboxPuedeSimular = SANDBOX_AUTOMATIC || allowSandboxMock;
      if (!sandboxPuedeSimular) {
        await registrarLog(supabase, FN, "SANDBOX_PASSIVE_AUTH_PAYMENT_SKIP", {
          payment_id: paymentId,
          reason: "sandbox_mock_no_habilitado",
          sandbox_automatic: SANDBOX_AUTOMATIC,
          allowSandboxMock
        }, true);
        return;
      }
      finalEndpoint = "mock_inline_auth_payment";
      let mockStatus = "approved";
      const endDigit = String(paymentId).slice(-1);
      switch(endDigit){
        case "1":
          mockStatus = "approved";
          break;
        case "2":
          mockStatus = "pending";
          break;
        case "3":
          mockStatus = "in_process";
          break;
        case "4":
          mockStatus = "rejected";
          break;
        case "5":
          mockStatus = "cancelled";
          break;
        default:
          mockStatus = "approved";
      }
      const { data: subSandbox } = await supabase.from("suscriptores").select("id, preapproval_id").order("creado_en", {
        ascending: false
      }).limit(1).maybeSingle();
      if (!subSandbox?.preapproval_id) {
        await registrarLog(supabase, FN, "SANDBOX_NO_PREAPPROVAL_FOUND", {
          payment_id: paymentId,
          mock_status: mockStatus
        }, false);
        return;
      }
      ap = {
        id: String(paymentId),
        status: mockStatus,
        preapproval_id: subSandbox.preapproval_id,
        date_created: new Date().toISOString(),
        date_approved: mockStatus === "approved" ? new Date().toISOString() : null,
        transaction_amount: 390,
        currency_id: "UYU",
        payment_type_id: "credit_card",
        payment_method_id: "master",
        payer: {
          id: "MOCK-PAYER-ID",
          email: "mockpayer@example.com"
        },
        installments: 1,
        description: "Suscripción Premium Tu Oráculo",
        statement_descriptor: "TUHOROSCOPO",
        additional_info: null,
        mock: true,
        debug_note: `Authorized payment MOCK con estado '${mockStatus}'`
      };
      await registrarLog(supabase, FN, "SANDBOX_INLINE_AUTH_PAYMENT_GENERATED", {
        payment_id: paymentId,
        mock_status: mockStatus,
        preapproval_id: subSandbox.preapproval_id,
        suscriptor_id: subSandbox.id,
        sandbox_automatic: SANDBOX_AUTOMATIC,
        allowSandboxMock
      });
    }
    // ----------------------------------------------------------
    // 2.1 VALIDACIÓN FINAL DEL JSON AP
    // ----------------------------------------------------------
    if (!ap) {
      await registrarLog(supabase, FN, "MP_AUTH_PAYMENT_EMPTY_FINAL", {
        info: "No se obtuvo JSON válido de authorized_payment",
        status: responseStatus,
        endpoint: finalEndpoint,
        payment_id: paymentId
      }, false);
      return;
    }
    await registrarLog(supabase, FN, "MP_AUTH_PAYMENT_OK", {
      endpoint: finalEndpoint,
      payment_id: paymentId
    });
    // ==========================================================
    // 3) EXTRACCIÓN DE VARIABLES CLAVE
    // ==========================================================
    const preapproval_id = ap.preapproval_id;
    const status = ap.status;
    const fecha_pago = status === "approved" || status === "processed" ? toDateOnlyISO(ap.date_approved || ap.date_created || nowIso()) : null;
    if (!preapproval_id) {
      await registrarLog(supabase, FN, "AUTH_PAYMENT_IGNORED_NO_PREAPPROVAL", {
        payment_id: paymentId,
        status
      });
      return;
    }
    // ==========================================================
    // 4) UBICAR SUSCRIPTOR PROPIETARIO
    //    ✅ AJUSTE: sin premium_pendiente_confirmacion
    // ==========================================================
    const { data: sub } = await supabase.from("suscriptores").select("id, nombre, whatsapp, premium_activo, bienvenida_enviada, fecha_vencimiento_premium").eq("preapproval_id", preapproval_id).maybeSingle();
    if (!sub) {
      await registrarLog(supabase, FN, "ORPHAN_AUTH_PAYMENT", {
        payment_id: paymentId,
        preapproval_id
      }, false);
      return;
    }
    // ==========================================================
    // 5) ADVISORY LOCK — Evita condiciones de carrera
    // ==========================================================
    if (!await acquireLock(supabase, sub.id)) {
      await registrarLog(supabase, FN, "LOCK_FAILED_AUTH_PAYMENT", {
        id: sub.id
      }, false);
      return;
    }
    try {
      // ========================================================
      // 6) UPSERT DEL AUTH PAYMENT EN TABLA `pagos`
      // ========================================================
      const { error: payErr } = await supabase.from("pagos").upsert({
        provider_payment_id: String(paymentId),
        mp_payment_id: String(paymentId),
        suscriptor_id: sub.id,
        preapproval_id,
        status,
        amount: ap.transaction_amount,
        currency: ap.currency_id,
        fecha_pago,
        provider: "mercadopago",
        tipo_pago: 1,
        raw: ap
      }, {
        onConflict: "provider_payment_id"
      });
      if (payErr) {
        await registrarLog(supabase, FN, "DB_AUTH_PAYMENT_UPSERT_ERROR", {
          error: payErr
        }, false);
        // Si no persistimos pago, no tocamos premium
        return;
      }
      // ======================================================================
      // 🔐 BLINDAJE DE EXTENSIÓN — EVITA DUPLICAR MESES (AUTHORIZED)
      // ======================================================================
      // 1️⃣ Traer pago recién guardado
      const { data: pagoDB, error: pagoDBError } = await supabase.from("pagos").select("id_pago, procesado").eq("mp_payment_id", String(paymentId)).maybeSingle();
      if (pagoDBError || !pagoDB) {
        await registrarLog(supabase, FN, "AUTH_PAYMENT_BLIND_NOT_FOUND", {
          payment_id: paymentId
        }, false);
        return;
      }
      // 2️⃣ Si ya fue procesado antes → SALIR
      if (pagoDB.procesado === true) {
        await registrarLog(supabase, FN, "AUTH_PAYMENT_ALREADY_PROCESSED_SKIP_EXTENSION", {
          payment_id: paymentId
        }, true);
        return;
      }
      // ========================================================
      // 7) ACTIVACIÓN / RENOVACIÓN DE SUSCRIPCIÓN
      // ========================================================
      const isApproved = status === "approved" || status === "processed";
      if (!isApproved || !CONFIRM_WITH_AUTHORIZED_PAYMENT) {
        await registrarLog(supabase, FN, "AUTH_PAYMENT_NOT_APPROVED_NO_STATE_CHANGE", {
          suscriptor_id: sub.id,
          payment_id: String(paymentId),
          status,
          confirm_flag: CONFIRM_WITH_AUTHORIZED_PAYMENT
        });
        return;
      }
      // --------------------------------------------------------------------
      // 7.1 Calcular nuevo vencimiento (TABLA DE VERDAD)
      // base = max(hoy, vencimiento_actual) + 1 mes
      //
      // ✅ AJUSTE: “primer pago” ahora:
      //   premium_activo !== true  OR  vencimiento vacío
      // --------------------------------------------------------------------
      const hoy = new Date();
      const vencActual = sub.fecha_vencimiento_premium ? new Date(`${sub.fecha_vencimiento_premium}T00:00:00.000Z`) : null;
      const esPrimeraActivacion = sub.bienvenida_enviada !== true;
      const base = esPrimeraActivacion ? hoy : new Date(Math.max(hoy.getTime(), vencActual?.getTime() ?? hoy.getTime()));
      const basePlus = new Date(base);
      basePlus.setMonth(basePlus.getMonth() + 1);
      const nuevoVencimiento = toDateOnlyISO(basePlus);
      // --------------------------------------------------------------------
      // 7.2 Update suscriptor (sin premium_pendiente_confirmacion)
      // --------------------------------------------------------------------
      // ============================================================================
      // 🔥 ACTUALIZACIÓN DE SUSCRIPTOR TRAS PAGO APROBADO
      // ============================================================================
      // Este bloque:
      //   1) Activa el premium
      //   2) Sincroniza el estado de negocio REAL (CRÍTICO)
      //   3) Actualiza vencimiento
      //   4) Mantiene consistencia con tabla suscripciones
      //
      // ⚠️ IMPORTANTE:
      // Antes faltaba `estado_suscripcion = "activa"`
      // Esto generaba inconsistencias tipo:
      //   premium_activo = true
      //   estado_suscripcion = "pendiente_autorizacion"
      //
      // Este fix elimina ese bug definitivamente
      // ============================================================================
      const { error: errUpdateSuscriptor } = await supabase.from("suscriptores").update({
        // 🔓 Flag principal de acceso
        premium_activo: true,
        // 🔥 FIX CRÍTICO → estado alineado con el negocio
        estado_suscripcion: "activa",
        // 📅 Nueva fecha de vencimiento calculada
        fecha_vencimiento_premium: nuevoVencimiento,
        // 🕓 Auditoría
        actualizado_en: nowIso()
      }).eq("id", sub.id);
      // ============================================================================
      // 🧾 LOG DE ERROR (NO ROMPE FLUJO)
      // ============================================================================
      // No hacemos throw → no queremos perder el pago procesado
      // pero sí queremos visibilidad total en logs
      // ============================================================================
      if (errUpdateSuscriptor) {
        await registrarLog(supabase, FN, "ERROR_UPDATE_SUSCRIPTOR_POST_PAYMENT", {
          suscriptor_id: sub.id,
          error: errUpdateSuscriptor
        }, false);
      }
      if (errUpdateSuscriptor) {
        return;
      }
      // --------------------------------------------------------------------
      // 7.3 Onboarding (solo 1 vez)
      // --------------------------------------------------------------------
      // ============================================================================
      // VALIDACIÓN DE NOMBRE PARA PLANTILLA DE BIENVENIDA
      // ----------------------------------------------------------------------------
      // Esta plantilla requiere {{1}} = nombre.
      // Si no hay nombre, no debemos encolar nada.
      // ============================================================================
      const nombre = String(sub?.nombre ?? "").trim();
      if (!nombre) {
        await registrarLog(supabase, FN, "BIENVENIDA_SIN_NOMBRE", {
          suscriptor_id: sub.id,
          origen: "authorized_payment"
        }, false);
        return;
      }
      const nombrePlantilla = "bienvenida_validacion_numero";
      const contenidoPlantilla = await obtenerContenidoPlantilla(supabase, nombrePlantilla);
      if (!contenidoPlantilla) {
        await registrarLog(supabase, FN, "PLANTILLA_NO_ENCONTRADA", {
          nombre_plantilla: nombrePlantilla,
          suscriptor_id: sub.id,
          origen: "authorized_payment"
        }, false);
        return;
      }
      if (sub.bienvenida_enviada !== true) {
        const now = nowIso();
        // ============================================================================
        // 📤 ENCOLAR MENSAJE DE BIENVENIDA EN OUTBOX + OBTENER ID DEL REGISTRO
        // ----------------------------------------------------------------------------
        // CAMBIO PUNTUAL:
        // - Antes: insertábamos el mensaje y solo verificábamos error
        // - Ahora: insertamos, recuperamos el `id` del registro creado y luego
        //   disparamos el sender en modo express con ese mismo id.
        //
        // ¿Por qué?
        // - Porque este mensaje de bienvenida / validación de número es CRÍTICO
        // - No queremos depender del cron/sniper para que salga
        // - Queremos que salga INMEDIATAMENTE después del alta por pago aprobado
        //
        // IMPORTANTE:
        // - NO cambiamos la estructura del mensaje
        // - NO cambiamos la plantilla
        // - NO cambiamos metadata
        // - SOLO agregamos:
        //     1) .select("id").single()
        //     2) fetch al sender con ese id
        // ============================================================================
        const { data: msgCreado, error: errInsertMensaje } = await supabase.from("mensajes_enviados").insert({
          id_suscriptor: sub.id,
          whatsapp_destino: sub.whatsapp,
          tipo_mensaje: "operativo",
          canal_envio: "whatsapp",
          estado: "pendiente",
          fecha_hora: now,
          fecha_creado: now,
          intentos: 0,
          ultimo_error: null,
          reintentar_despues: null,
          // En tu arquitectura, `contenidoPlantilla` ya contiene
          // el nombre REAL de la template aprobada en Meta
          nombre_plantilla: contenidoPlantilla,
          metadata: {
            origen: "authorized_payment",
            payment_id: String(paymentId),
            preapproval_id: String(preapproval_id),
            // ======================================================================
            // VARIABLES DE TEMPLATE
            // ----------------------------------------------------------------------
            // bienvenida_validacion_numero requiere el nombre
            // fallback a string vacío por seguridad
            // ======================================================================
            variables: {
              nombre: String(sub?.nombre ?? "").trim()
            }
          }
        }).select("id").single();
        if (errInsertMensaje || !msgCreado?.id) {
          await registrarLog(supabase, FN, "BIENVENIDA_ENCOLADA_ERROR", {
            suscriptor_id: sub.id,
            origen: "authorized_payment",
            error: errInsertMensaje?.message ?? errInsertMensaje ?? "insert_sin_id"
          }, false);
          return;
        }
        // ============================================================================
        // 🚀 ENVÍO EXPRESS DE BIENVENIDA
        // ----------------------------------------------------------------------------
        // CAMBIO PUNTUAL:
        // - Apenas tenemos el id del mensaje recién creado,
        //   llamamos al sender en forma inmediata.
        //
        // IMPORTANTE:
        // - El sender sigue siendo la única pieza que:
        //     * valida plantilla
        //     * procesa estado
        //     * envía a WhatsApp
        //     * deja trazabilidad técnica del envío
        //
        // ACÁ NO ENVIAMOS WHATSAPP DIRECTAMENTE.
        // ACÁ SOLO DISPARAMOS EL SENDER CON EL ID DEL OUTBOX.
        //
        // NOTA:
        // - Usamos la internal key del propio proyecto
        // - Si el sender responde no-OK, dejamos log y cortamos
        // - Si explota el fetch, también dejamos log y cortamos
        // ============================================================================
        if (!internalKey) {
          await registrarLog(supabase, FN, "ERROR_NO_INTERNAL_KEY", {
            suscriptor_id: sub.id,
            id_mensaje: msgCreado.id,
            origen: "authorized_payment"
          }, false);
          return;
        }
        try {
          const senderResp = await fetch(`${SUPABASE_URL}/functions/v1/ef_whatsapp_sender`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SENDER_BEARER_TOKEN") ?? ""}`,
              "x-internal-key": internalKey
            },
            body: JSON.stringify({
              id_mensaje: msgCreado.id
            })
          });
          if (!senderResp.ok) {
            const senderText = await senderResp.text().catch(()=>"");
            await registrarLog(supabase, FN, "BIENVENIDA_EXPRESS_SENDER_ERROR", {
              suscriptor_id: sub.id,
              id_mensaje: msgCreado.id,
              origen: "authorized_payment",
              status: senderResp.status,
              response: senderText
            }, false);
            return;
          }
          // ==========================================================================
          // LOG DE ÉXITO DEL DISPARO EXPRESS
          // --------------------------------------------------------------------------
          // OJO:
          // - Esto significa que el sender fue invocado correctamente
          // - NO significa necesariamente que WhatsApp ya lo marcó como enviado
          // - El detalle final del envío vive en ef_whatsapp_sender
          // ==========================================================================
          await registrarLog(supabase, FN, "BIENVENIDA_EXPRESS_SENDER_OK", {
            suscriptor_id: sub.id,
            id_mensaje: msgCreado.id,
            origen: "authorized_payment"
          }, true);
        } catch (err) {
          await registrarLog(supabase, FN, "BIENVENIDA_EXPRESS_SENDER_EXCEPTION", {
            suscriptor_id: sub.id,
            id_mensaje: msgCreado.id,
            origen: "authorized_payment",
            error: String(err)
          }, false);
          return;
        }
        // ============================================================================
        // ✅ MARCAR FLAG DE BIENVENIDA ENVIADA
        // ----------------------------------------------------------------------------
        // Esto evita reencolar la bienvenida en futuros eventos.
        //
        // MUY IMPORTANTE:
        // - Solo lo hacemos DESPUÉS de que el insert en mensajes_enviados salió bien
        // - Si este update falla, lo logueamos y cortamos
        // - No queremos dejar el sistema en un estado ambiguo
        // ============================================================================
        const { error: errFlagBienvenida } = await supabase.from("suscriptores").update({
          bienvenida_enviada: true,
          actualizado_en: nowIso()
        }).eq("id", sub.id);
        if (errFlagBienvenida) {
          await registrarLog(supabase, FN, "BIENVENIDA_FLAG_UPDATE_ERROR", {
            suscriptor_id: sub.id,
            origen: "authorized_payment",
            error: errFlagBienvenida.message ?? errFlagBienvenida
          }, false);
          return;
        }
        await registrarLog(supabase, FN, "BIENVENIDA_CONFIRMACION_ENCOLADA_OK", {
          suscriptor_id: sub.id,
          origen: "authorized_payment"
        });
      } else {
        await registrarLog(supabase, FN, "BIENVENIDA_CONFIRMACION_NO_APLICA", {
          suscriptor_id: sub.id,
          motivo: esPrimeraActivacion ? "bienvenida_enviada_ya_true" : "no_es_primera_activacion",
          origen: "authorized_payment"
        });
      }
      await registrarLog(supabase, FN, "SUBSCRIPTION_ACTIVATED_BY_AUTH_PAYMENT", {
        id: sub.id,
        nuevo_vencimiento: nuevoVencimiento,
        es_primera_activacion: esPrimeraActivacion
      });
      // ======================================================================
      // ✅ MARCAR PAGO COMO PROCESADO (CRÍTICO) — AUTHORIZED
      // ======================================================================
      // ============================================================================
      // ✅ MARCAR PAGO COMO PROCESADO
      // ----------------------------------------------------------------------------
      // Esto evita reprocesar el mismo pago en eventos futuros.
      // Si falla, lo dejamos logueado para no perder trazabilidad.
      // ============================================================================
      const { error: errPagoProcesado } = await supabase.from("pagos").update({
        procesado: true
      }).eq("mp_payment_id", String(paymentId));
      if (errPagoProcesado) {
        // ============================================================================
        // LOG DE ERROR AL MARCAR PAGO COMO PROCESADO
        // ----------------------------------------------------------------------------
        // Este bloque YA NO está en la etapa de encolar bienvenida.
        // Acá estamos al final del flujo AUTHORIZED_PAYMENT, intentando marcar:
        //
        //   pagos.procesado = true
        //
        // Por eso:
        // - el resultado del log debe reflejar ese problema real
        // - el origen debe seguir siendo "authorized_payment"
        // - no cambiamos nada más del flujo
        // ============================================================================
        await registrarLog(supabase, FN, "PAGO_PROCESADO_UPDATE_ERROR", {
          payment_id: String(paymentId),
          origen: "authorized_payment",
          error: errPagoProcesado.message ?? errPagoProcesado
        }, false);
        return;
      }
    } finally{
      // ========================================================
      // 8) LIBERAR LOCK
      // ========================================================
      await releaseLock(supabase, sub.id);
    }
  } catch (err) {
    // ==========================================================
    // 9) EXCEPCIÓN GLOBAL
    // ==========================================================
    await registrarLog(supabase, FN, "AUTHORIZED_PAYMENT_FATAL_EXCEPTION", {
      error: String(err),
      paymentId
    }, false);
  }
}
// ============================================================================
// === FIN HANDLER 3 — AUTHORIZED_PAYMENT (LEGACY) (AJUSTE MÍNIMO) ============
// ============================================================================
// ===================================================================================================
// === INICIO — ROUTER PRINCIPAL (V18) — ALINEADO A HANDLERS + TABLA DE LA VERDAD + REGLAS NEGOCIO ===
// ===================================================================================================
//
// ✅ MISIÓN DEL ROUTER (OPERACIÓN):
// - Mercado Pago reintenta MUCHÍSIMO si no respondés rápido.
// - Por eso este router cumple 2 reglas de oro:
//
//   (1) RESPONDER "OK" INMEDIATO (siempre).
//   (2) DISPARAR el handler "fire-and-forget" (sin await).
//
// ✅ LO QUE ESTE ROUTER HACE:
// - Decide a qué handler mandar según el evento.
// - Soporta DOS formatos reales:
//
//   MODE 1 (IPN clásico / querystring):
//     /ef_webhook_mp?topic=payment&id=123
//
//   MODE 2 (Webhook JSON / body):
//     { "type": "payment", "data": { "id": "123" } }
//
// ✅ TOPICS/TYPES SOPORTADOS (mapeo directo):
// - "preapproval"         => handlePreapproval(id)         (contrato)
// - "payment"             => handlePayment(id)             (pago normal)
// - "payment_trigger"     => handlePayment(id)             (alias interno tuyo para tests)
// - "authorized_payment"  => handleAuthorizedPayment(id)   (legacy)
//
// ✅ LO QUE ESTE ROUTER NO HACE (por diseño):
// - NO valida negocio.
// - NO toca tablas de suscripción ni flags.
// - NO hace await a handlers.
// - NO bloquea nunca la respuesta a MP.
//
// ✅ ÚNICO CASO donde hace await:
// - En el catch final, para registrar un log fatal (sin afectar respuesta).
//
// NOTA:
// - Normalizamos topic/type a minúsculas para evitar problemas.
// - Si viene algo desconocido o incompleto => respondemos OK y listo.
//
// ===================================================================================================
serve(async (req)=>{
  // ================================================================================================
  // 0) FILTRO DE MÉTODOS
  // ================================================================================================
  // MP llega por GET/POST (según IPN/Webhook).
  // Cualquier otro método: devolvemos OK igual (evita ruido de scanners/healthchecks).
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("OK");
  }
  try {
    // ==============================================================================================
    // 1) MODE 1 — IPN CLÁSICO (topic + id en querystring)
    // ==============================================================================================
    // Ejemplo real:
    //   .../ef_webhook_mp?topic=payment&id=141132629869
    //
    // Este modo es el más “barato” y rápido: no leemos body.
    const url = new URL(req.url);
    const topicRaw = url.searchParams.get("topic");
    const idRaw = url.searchParams.get("id");
    // Si vienen topic e id => ruteamos sin leer body
    if (topicRaw && idRaw) {
      const topic = String(topicRaw).toLowerCase().trim();
      const id = String(idRaw).trim();
      // --------------------------------------------------------------------------------------------
      // DISPATCH “FIRE-AND-FORGET” (SIN await)
      // --------------------------------------------------------------------------------------------
      // ----------------------------------------------------------------------
      // CONTROL MANUAL DE SANDBOX
      // ----------------------------------------------------------------------
      // Permitimos mock manual si:
      //   - viene header x-manual-test=true
      //   - o el topic es payment_trigger
      //
      // Esto te permite:
      //   - navegar el funnel sin auto-activación
      //   - luego disparar el webhook desde Postman cuando vos quieras
      // ----------------------------------------------------------------------
      const isManualTrigger = req.headers.get("x-manual-test") === "true";
      const allowSandboxMock = isManualTrigger || topic === "payment_trigger";
      if (topic === "preapproval") {
        handlePreapproval(id);
      } else if (topic === "authorized_payment") {
        handleAuthorizedPayment(id, {
          allowSandboxMock
        });
      } else if (topic === "payment" || topic === "payment_trigger") {
        handlePayment(id, {
          allowSandboxMock
        });
      } else {
      // Topic desconocido: NO hacemos nada. MP igual recibe OK.
      // (Si querés debug, podés loguearlo, pero por defecto mejor NO inflar logs.)
      }
      // RESPUESTA INMEDIATA (CRÍTICO)
      return new Response("OK");
    }
    // ==============================================================================================
    // 2) MODE 2 — WEBHOOK JSON (type + data.id en body)
    // ==============================================================================================
    // Ejemplo:
    //   { "type": "payment", "data": { "id": "123" } }
    //
    // Nota: a veces puede venir body vacío o content-type raro, por eso:
    // - leemos texto
    // - parse JSON con try/catch
    const raw = await req.text().catch(()=>"");
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch  {
      payload = {};
    }
    // Extraemos type y data.id (formato típico)
    const typeRaw = payload?.type ?? "";
    const dataIdRaw = payload?.data?.id ?? null;
    const type = String(typeRaw).toLowerCase().trim();
    const dataId = dataIdRaw != null ? String(dataIdRaw).trim() : "";
    // Si no hay type o id => no hay nada útil para procesar
    if (!type || !dataId) {
      return new Response("OK");
    }
    // --------------------------------------------------------------------------------------------
    // DISPATCH “FIRE-AND-FORGET” (SIN await)
    // --------------------------------------------------------------------------------------------
    // CONTROL MANUAL DE SANDBOX (BODY MODE)
    //
    // Permitimos mock manual si:
    //   - viene header x-manual-test=true
    //   - o el type es payment_trigger
    //
    // Esto hace que el comportamiento de BODY MODE quede alineado
    // con QUERYSTRING MODE.
    // --------------------------------------------------------------------------------------------
    const isManualTrigger = req.headers.get("x-manual-test") === "true";
    const allowSandboxMock = isManualTrigger || type === "payment_trigger";
    if (type === "preapproval") {
      handlePreapproval(dataId);
    } else if (type === "authorized_payment") {
      handleAuthorizedPayment(dataId, {
        allowSandboxMock
      });
    } else if (type === "payment" || type === "payment_trigger") {
      handlePayment(dataId, {
        allowSandboxMock
      });
    } else {
    // Type desconocido: no procesamos.
    // Mantener OK para que MP no reintente por timeout.
    }
    // RESPUESTA INMEDIATA (CRÍTICO)
    return new Response("OK");
  } catch (err) {
    // ==============================================================================================
    // 3) CATCH FINAL — NO ROMPER JAMÁS LA RESPUESTA A MP
    // ==============================================================================================
    // Si algo explotó en el router, MP igual recibe OK.
    // Logueamos el fatal para trazabilidad.
    await registrarLog(supabase, FN, "FATAL_EXCEPTION_RECEPCION", {
      error: String(err)
    }, false);
    return new Response("OK");
  }
}); // ===================================================================================================
 // === FIN — ROUTER PRINCIPAL (V18) — ALINEADO A HANDLERS + TABLA DE LA VERDAD + REGLAS NEGOCIO =======
 // ===================================================================================================
