// ============================================================================
// EDGE FUNCTION: ef_orquesta_menu_respuesta
// Sprint 1 — Menú WhatsApp MVP
// ============================================================================
//
// RESPONSABILIDAD:
//   Procesar la interacción del usuario dentro del menú interactivo de WhatsApp.
//   Es llamada por ef_webhook_whatsapp_inbound cuando detecta un trigger de menú
//   (MENU / CONFIG / AJUSTES / PREFERENCIAS) para un usuario con
//   whatsapp_confirmado=true.
//
// ALCANCE SPRINT 1:
//   - Mostrar menú principal (4 opciones)
//   - Manejar "0" para salir
//   - Opciones 1-4: responden "próximamente"
//   - Timeout de 10 minutos de inactividad
//   - Advisory lock por suscriptor (evita carreras si llegan 2 mensajes)
//
// NO IMPLEMENTADO EN SPRINT 1 (pendiente):
//   - Cambiar enfoque (opción 1)
//   - Estado de suscripción (opción 2)
//   - Pausar / reactivar (opción 3)
//   - Ayuda avanzada (opción 4)
//   - Cambiar horario
//
// ARQUITECTURA:
//   Inbound detecta trigger → llama este orquestador → orquestador usa OUTBOX
//   → encola en mensajes_enviados → dispara ef_whatsapp_sender → Meta API
//
// IMPORTANTE:
//   - BAJA sigue siendo manejada por ef_webhook_whatsapp_inbound (sección 6).
//     Si el usuario escribe BAJA, el inbound lo intercepta ANTES de llamar
//     a este orquestador. BAJA nunca llega acá.
//   - No toca Mercado Pago.
//   - No toca estado_suscripcion.
//   - No toca premium_activo.
//   - No toca contenido_preferido (pendiente Sprint 3).
//   - No toca estado_mensaje (pendiente Sprint 4).
//
// CAMPOS REQUERIDOS EN suscriptores (migración 20260517120000):
//   - menu_state text DEFAULT NULL
//   - menu_state_updated_at timestamptz DEFAULT NULL
//
// PLANTILLAS REQUERIDAS EN tabla `plantillas` + aprobadas en Meta:
//   - menu_principal          — muestra las 4 opciones
//   - menu_salir              — confirmación de salida
//   - menu_timeout            — sesión expirada
//   - menu_proximamente       — opción no disponible aún (Sprint 1)
//   - menu_principal_invalido — input fuera de rango (no es 0-4)
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FN = "ef_orquesta_menu_respuesta";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY_SUPABASE") ?? "";
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";

const SENDER_FN = "ef_whatsapp_sender";
const TIMEOUT_MINUTES = 10;

// Plantillas lógicas (deben existir en tabla `plantillas` y estar aprobadas en Meta)
const PLANTILLA_MENU_PRINCIPAL = "menu_principal";
const PLANTILLA_MENU_SALIR = "menu_salir";
const PLANTILLA_MENU_TIMEOUT = "menu_timeout";
const PLANTILLA_MENU_PROXIMAMENTE = "menu_proximamente";
const PLANTILLA_MENU_INVALIDO = "menu_principal_invalido";

// Triggers que abren el menú (normalizados: sin acentos, uppercase)
// "MENÚ" → "MENU" después de normalizeText; no necesita entrada separada
const TRIGGERS_MENU = ["MENU", "CONFIG", "AJUSTES", "PREFERENCIAS"];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// ============================================================================
// Helpers
// ============================================================================

function nowISO() {
  return new Date().toISOString();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function normalizeText(input) {
  if (typeof input !== "string") return "";
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
}

async function registrarLog(resultado, detalle, exito = true) {
  try {
    await supabase.from("log_funciones").insert({
      nombre_funcion: FN,
      fecha_ejecucion: nowISO(),
      resultado,
      detalle,
      exito,
      creado_por: "system"
    });
  } catch (_) {
    // No romper el flujo por logging
  }
}

// Advisory lock por suscriptor: evita que dos mensajes simultáneos dupliquen acciones
async function acquireLock(id_suscriptor) {
  const { error } = await supabase.rpc("pg_advisory_lock", { key: id_suscriptor });
  return !error;
}

async function releaseLock(id_suscriptor) {
  await supabase.rpc("pg_advisory_unlock", { key: id_suscriptor });
}

// Encola mensaje en outbox usando nombre lógico de plantilla.
// El sender usa el nombre_plantilla directamente como nombre de template Meta.
// Los nombres lógicos deben coincidir con los nombres aprobados en Meta.
async function enqueuePlantilla(params) {
  const row = {
    id_suscriptor: params.id_suscriptor,
    whatsapp_destino: params.whatsapp,
    tipo_mensaje: "operativo",
    nombre_plantilla: params.nombre_plantilla,
    estado: "pendiente",
    canal_envio: "whatsapp",
    fecha_creado: nowISO(),
    fecha_hora: nowISO(),
    metadata: {
      variables: params.variables ?? {},
      contexto: "menu_sprint1"
    }
  };
  const { data, error } = await supabase
    .from("mensajes_enviados")
    .insert(row)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "no_id_mensaje" };
  return { ok: true, id_mensaje: data.id };
}

// Dispara sender inmediato para el mensaje recién encolado
async function dispararSender(id_mensaje) {
  const url = `${SUPABASE_URL}/functions/v1/${SENDER_FN}`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ANON_KEY}`,
    "apikey": ANON_KEY
  };
  if (WHATSAPP_INTERNAL_KEY) headers["x-internal-key"] = WHATSAPP_INTERNAL_KEY;
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ id_mensaje })
  });
  const txt = await r.text();
  let body = null;
  try { body = JSON.parse(txt); } catch { body = { raw: txt }; }
  return { ok: r.ok, status: r.status, body };
}

// Timeout: true si han pasado más de TIMEOUT_MINUTES desde la última actualización
function isTimedOut(menuUpdatedAt) {
  if (!menuUpdatedAt) return true;
  const d = new Date(menuUpdatedAt);
  if (isNaN(d.getTime())) return true;
  return (Date.now() - d.getTime()) > TIMEOUT_MINUTES * 60 * 1000;
}

// ============================================================================
// Handler principal
// ============================================================================

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  let body = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  // Campos esperados desde ef_webhook_whatsapp_inbound:
  // { whatsapp: "+598...", text: "MENU" }
  const whatsapp = typeof body?.whatsapp === "string" ? body.whatsapp.trim() : null;
  const textRaw = body?.text ?? body?.mensaje ?? null;
  const input = normalizeText(textRaw);

  if (!whatsapp) return json({ error: "Falta whatsapp" }, 400);

  // -------------------------------------------------------------------------
  // Buscar suscriptor
  // NOTA: se incluye menu_state y menu_state_updated_at (requiere migración
  // 20260517120000_add_menu_state_to_suscriptores.sql aplicada)
  // -------------------------------------------------------------------------
  const { data: suscriptor, error: errS } = await supabase
    .from("suscriptores")
    .select(`
      id,
      nombre,
      whatsapp,
      premium_activo,
      estado_suscripcion,
      tipo_suscripcion,
      estado_mensaje,
      contenido_preferido,
      menu_state,
      menu_state_updated_at
    `)
    .eq("whatsapp", whatsapp)
    .maybeSingle();

  if (errS) {
    await registrarLog("error_buscar_suscriptor", { whatsapp, error: errS.message }, false);
    return json({ resultado: "error", mensaje: "Error buscando suscriptor" }, 500);
  }
  if (!suscriptor) {
    await registrarLog("whatsapp_no_registrado", { whatsapp, input }, true);
    return json({ resultado: "sin_accion", motivo: "no_registrado" }, 200);
  }

  // -------------------------------------------------------------------------
  // Gate: solo usuarios premium
  // El inbound ya verificó whatsapp_confirmado=true antes de llamar acá.
  // Esta verificación es defensa en profundidad.
  // -------------------------------------------------------------------------
  if (suscriptor.tipo_suscripcion !== "premium") {
    await registrarLog("menu_bloqueado_no_premium", {
      id_suscriptor: suscriptor.id,
      whatsapp,
      tipo_suscripcion: suscriptor.tipo_suscripcion
    }, true);
    return json({ resultado: "sin_accion", motivo: "no_premium" }, 200);
  }

  // -------------------------------------------------------------------------
  // Advisory lock por suscriptor
  // Evita duplicados si llegan dos mensajes simultáneos del mismo usuario
  // -------------------------------------------------------------------------
  const locked = await acquireLock(suscriptor.id);
  if (!locked) {
    await registrarLog("lock_no_adquirido", { id_suscriptor: suscriptor.id }, false);
    return json({ resultado: "sin_accion", motivo: "lock" }, 200);
  }

  try {
    // ==========================================================================
    // 1) TIMEOUT: menu_state activo pero expiró
    // ==========================================================================
    // Si el usuario tiene un estado de menú activo pero han pasado más de
    // TIMEOUT_MINUTES minutos sin actividad, se resetea el estado y se avisa.
    // Después del reset, se continúa procesando el mensaje entrante
    // como si fuera desde fuera del menú.
    // ==========================================================================
    if (suscriptor.menu_state && isTimedOut(suscriptor.menu_state_updated_at ?? null)) {
      await supabase.from("suscriptores").update({
        menu_state: null,
        menu_state_updated_at: nowISO(),
        actualizado_en: nowISO()
      }).eq("id", suscriptor.id);

      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: PLANTILLA_MENU_TIMEOUT,
        variables: { nombre: suscriptor.nombre ?? "" }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);

      await registrarLog("menu_timeout_reset", {
        id_suscriptor: suscriptor.id,
        menu_state_anterior: suscriptor.menu_state
      }, true);
      return json({ resultado: "ok", accion: "timeout_reset" }, 200);
    }

    // ==========================================================================
    // 2) TRIGGER GLOBAL: usuario escribe MENU / CONFIG / AJUSTES / PREFERENCIAS
    // ==========================================================================
    // Siempre muestra el menú principal, independientemente del estado actual.
    // Si estaba en un sub-menú, lo lleva de vuelta al principal.
    // ==========================================================================
    if (TRIGGERS_MENU.includes(input)) {
      await supabase.from("suscriptores").update({
        menu_state: "menu_principal",
        menu_state_updated_at: nowISO(),
        actualizado_en: nowISO()
      }).eq("id", suscriptor.id);

      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: PLANTILLA_MENU_PRINCIPAL,
        variables: { nombre: suscriptor.nombre ?? "" }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);

      await registrarLog("menu_principal_mostrado", {
        id_suscriptor: suscriptor.id,
        input,
        desde_state: suscriptor.menu_state ?? "null"
      }, true);
      return json({ resultado: "ok", accion: "menu_principal" }, 200);
    }

    // ==========================================================================
    // 3) SIN menu_state: no es responsabilidad de este orquestador
    // ==========================================================================
    // Si el inbound llamó aquí sin trigger de menú y sin menu_state activo,
    // es una situación inesperada. Devolvemos sin_accion para no interferir.
    // ==========================================================================
    if (!suscriptor.menu_state) {
      await registrarLog("sin_menu_state", {
        id_suscriptor: suscriptor.id,
        input
      }, true);
      return json({ resultado: "sin_accion", motivo: "no_menu_state" }, 200);
    }

    // ==========================================================================
    // 4) OPCIÓN "0" — SALIR DEL MENÚ
    // ==========================================================================
    // Limpia el estado del menú y envía confirmación de salida.
    // Funciona desde cualquier nivel (Sprint 1 solo tiene un nivel).
    // ==========================================================================
    if (input === "0") {
      await supabase.from("suscriptores").update({
        menu_state: null,
        menu_state_updated_at: nowISO(),
        actualizado_en: nowISO()
      }).eq("id", suscriptor.id);

      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: PLANTILLA_MENU_SALIR,
        variables: { nombre: suscriptor.nombre ?? "" }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);

      await registrarLog("menu_salir", {
        id_suscriptor: suscriptor.id,
        desde_state: suscriptor.menu_state
      }, true);
      return json({ resultado: "ok", accion: "salir" }, 200);
    }

    // ==========================================================================
    // 5) OPCIONES DEL MENÚ PRINCIPAL (Sprint 1)
    // ==========================================================================
    if (suscriptor.menu_state === "menu_principal") {
      if (["1", "2", "3", "4"].includes(input)) {
        // Sprint 1: todas las opciones responden "próximamente".
        // El usuario queda en menu_principal para poder usar 0 (salir).
        // El timestamp se actualiza para reiniciar el timeout.
        await supabase.from("suscriptores").update({
          menu_state_updated_at: nowISO(),
          actualizado_en: nowISO()
        }).eq("id", suscriptor.id);

        const enq = await enqueuePlantilla({
          id_suscriptor: suscriptor.id,
          whatsapp,
          nombre_plantilla: PLANTILLA_MENU_PROXIMAMENTE,
          variables: { nombre: suscriptor.nombre ?? "" }
        });
        if (enq.ok) await dispararSender(enq.id_mensaje);

        await registrarLog("menu_opcion_proximamente", {
          id_suscriptor: suscriptor.id,
          input,
          // Documentar qué opción eligió para analytics futuras
          opcion_label: {
            "1": "cambiar_enfoque",
            "2": "estado_suscripcion",
            "3": "pausar_reactivar",
            "4": "ayuda"
          }[input] ?? input
        }, true);
        return json({ resultado: "ok", accion: "proximamente", opcion: input }, 200);
      }

      // Input inválido (no es 0-4 ni trigger de menú)
      await supabase.from("suscriptores").update({
        menu_state_updated_at: nowISO(),
        actualizado_en: nowISO()
      }).eq("id", suscriptor.id);

      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: PLANTILLA_MENU_INVALIDO,
        variables: { nombre: suscriptor.nombre ?? "" }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);

      await registrarLog("menu_opcion_invalida", {
        id_suscriptor: suscriptor.id,
        input
      }, true);
      return json({ resultado: "ok", accion: "opcion_invalida" }, 200);
    }

    // ==========================================================================
    // 6) ESTADO DE MENÚ DESCONOCIDO — RESET DEFENSIVO
    // ==========================================================================
    // Si menu_state tiene un valor que no reconocemos (migración parcial,
    // datos corruptos, sprint futuro sin deploy completo), reseteamos.
    // No enviamos mensaje al usuario para evitar confusión.
    // ==========================================================================
    await supabase.from("suscriptores").update({
      menu_state: null,
      menu_state_updated_at: nowISO(),
      actualizado_en: nowISO()
    }).eq("id", suscriptor.id);

    await registrarLog("menu_state_desconocido_reset", {
      id_suscriptor: suscriptor.id,
      menu_state: suscriptor.menu_state,
      input
    }, true);
    return json({ resultado: "ok", accion: "reset" }, 200);

  } catch (e) {
    await registrarLog("fatal_exception", {
      error: String(e),
      whatsapp,
      input
    }, false);
    return json({ resultado: "error", mensaje: "fatal_exception" }, 200);
  } finally {
    await releaseLock(suscriptor.id);
  }
});
