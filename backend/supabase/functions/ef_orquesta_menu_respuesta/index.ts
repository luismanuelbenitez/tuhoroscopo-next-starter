// ============================================================================
// EDGE FUNCTION: ef_orquesta_menu_respuesta
// MVP completo del Menú WhatsApp — THC
// ============================================================================
//
// RESPONSABILIDAD:
//   Orquestar la interacción del usuario dentro del menú interactivo WhatsApp.
//   Llamada por ef_webhook_whatsapp_inbound cuando detecta un trigger de menú
//   (MENU / CONFIG / AJUSTES / PREFERENCIAS) para usuarios con
//   whatsapp_confirmado=true.
//
// ÁRBOL DE MENÚ:
//   MENU (trigger) → menu_principal
//     1) Cambiar enfoque      → menu_enfoque → actualiza contenido_preferido
//     2) Estado de suscripción → responde inline, queda en menu_principal
//     3) Pausar / reactivar   → menu_pausa   → actualiza estado_mensaje
//     4) Ayuda                → responde inline, queda en menu_principal
//     0) Salir                → limpia menu_state, despedida
//
// COMPORTAMIENTO DE "0" (volver/salir):
//   - Desde menu_principal → sale completamente (menu_state=null)
//   - Desde menu_enfoque  → vuelve a menu_principal
//   - Desde menu_pausa    → vuelve a menu_principal
//
// TIMEOUT: 10 minutos de inactividad → resetea menu_state, avisa al usuario
//
// SEGURIDAD:
//   - No toca Mercado Pago
//   - No toca premium_activo
//   - No toca estado_suscripcion
//   - No toca pagos ni suscripciones
//   - BAJA sigue siendo responsabilidad de ef_webhook_whatsapp_inbound
//
// SCHEMA REQUERIDO (migración 20260517120000):
//   suscriptores.menu_state text DEFAULT NULL
//   suscriptores.menu_state_updated_at timestamptz DEFAULT NULL
//
// PLANTILLAS REQUERIDAS en tabla `plantillas` + aprobadas en Meta:
//   menu_principal, menu_salir, menu_timeout, menu_principal_invalido
//   menu_enfoque, menu_confirmacion_enfoque, menu_enfoque_invalido
//   menu_estado_suscripcion
//   menu_pausa, menu_pausa_confirmada, menu_reactivacion_confirmada, menu_pausa_invalido
//   ayuda_usuario (ya existente — reutilizada para opción 4)
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

// ============================================================================
// Plantillas — menú principal
// ============================================================================
const PLANTILLA_MENU_PRINCIPAL         = "menu_principal";
const PLANTILLA_MENU_SALIR             = "menu_salir";
const PLANTILLA_MENU_TIMEOUT           = "menu_timeout";
const PLANTILLA_MENU_INVALIDO          = "menu_principal_invalido";

// ============================================================================
// Plantillas — opción 1: Cambiar enfoque
// ============================================================================
const PLANTILLA_MENU_ENFOQUE           = "menu_enfoque";
const PLANTILLA_MENU_CONF_ENFOQUE      = "menu_confirmacion_enfoque";
const PLANTILLA_MENU_ENFOQUE_INV       = "menu_enfoque_invalido";

// ============================================================================
// Plantillas — opción 2: Estado de suscripción
// ============================================================================
const PLANTILLA_MENU_ESTADO            = "menu_estado_suscripcion";

// ============================================================================
// Plantillas — opción 3: Pausar / reactivar mensajes
// ============================================================================
const PLANTILLA_MENU_PAUSA             = "menu_pausa";
const PLANTILLA_MENU_PAUSA_CONF        = "menu_pausa_confirmada";
const PLANTILLA_MENU_REACTIV_CONF      = "menu_reactivacion_confirmada";
const PLANTILLA_MENU_PAUSA_INV         = "menu_pausa_invalido";

// ============================================================================
// Plantillas — opción 4: Ayuda
// Reutiliza ayuda_usuario (ya aprobada en Meta; variables: { nombre })
// ============================================================================
const PLANTILLA_AYUDA_USUARIO          = "ayuda_usuario";

// Triggers que abren el menú (normalizados: sin acentos, uppercase)
const TRIGGERS_MENU = ["MENU", "CONFIG", "AJUSTES", "PREFERENCIAS"];

// Mapa de valores de contenido_preferido
const MAPA_ENFOQUE: Record<string, string> = {
  "1": "bienestar",
  "2": "trabajo_dinero",
  "3": "amor_relaciones",
  "4": "salud_energia",
};

// Labels legibles para confirmación de enfoque
const LABELS_ENFOQUE: Record<string, string> = {
  "bienestar":        "Bienestar",
  "trabajo_dinero":   "Trabajo y dinero",
  "amor_relaciones":  "Amor y relaciones",
  "salud_energia":    "Salud y energía",
};

// Labels legibles para estado_suscripcion
const LABELS_ESTADO_SUSCRIPCION: Record<string, string> = {
  "activa":                    "activa",
  "suspendida":                "suspendida",
  "cancelada_no_renueva":      "cancelada (activa hasta vencimiento)",
  "finalizada":                "finalizada",
  "pendiente_autorizacion":    "pendiente de autorización",
};

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// ============================================================================
// Helpers
// ============================================================================

function nowISO(): string {
  return new Date().toISOString();
}

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

async function registrarLog(
  resultado: string,
  detalle: Record<string, unknown>,
  exito = true,
): Promise<void> {
  try {
    await supabase.from("log_funciones").insert({
      nombre_funcion: FN,
      fecha_ejecucion: nowISO(),
      resultado,
      detalle,
      exito,
      creado_por: "system",
    });
  } catch (_) {
    // No romper el flujo por logging
  }
}

async function acquireLock(id_suscriptor: number): Promise<boolean> {
  const { error } = await supabase.rpc("pg_advisory_lock", { key: id_suscriptor });
  return !error;
}

async function releaseLock(id_suscriptor: number): Promise<void> {
  await supabase.rpc("pg_advisory_unlock", { key: id_suscriptor });
}

// Encola mensaje en outbox.
// El sender usa nombre_plantilla directamente como nombre del template Meta.
// Los nombres lógicos deben coincidir con los nombres aprobados en Meta.
async function enqueuePlantilla(params: {
  id_suscriptor: number;
  whatsapp: string;
  nombre_plantilla: string;
  variables?: Record<string, string>;
}): Promise<{ ok: boolean; id_mensaje?: number; error?: string }> {
  const { data, error } = await supabase
    .from("mensajes_enviados")
    .insert({
      id_suscriptor:   params.id_suscriptor,
      whatsapp_destino: params.whatsapp,
      tipo_mensaje:    "operativo",
      nombre_plantilla: params.nombre_plantilla,
      estado:          "pendiente",
      canal_envio:     "whatsapp",
      fecha_creado:    nowISO(),
      fecha_hora:      nowISO(),
      metadata: {
        variables: params.variables ?? {},
        contexto: "menu_mvp",
      },
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "no_id_mensaje" };
  return { ok: true, id_mensaje: data.id };
}

async function dispararSender(
  id_mensaje: number,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${SUPABASE_URL}/functions/v1/${SENDER_FN}`;
  const headers: Record<string, string> = {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${ANON_KEY}`,
    "apikey":        ANON_KEY,
  };
  if (WHATSAPP_INTERNAL_KEY) headers["x-internal-key"] = WHATSAPP_INTERNAL_KEY;

  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ id_mensaje }),
  });
  const txt = await r.text();
  let body: unknown = null;
  try { body = JSON.parse(txt); } catch { body = { raw: txt }; }
  return { ok: r.ok, status: r.status, body };
}

function isTimedOut(menuUpdatedAt: string | null): boolean {
  if (!menuUpdatedAt) return true;
  const d = new Date(menuUpdatedAt);
  if (isNaN(d.getTime())) return true;
  return (Date.now() - d.getTime()) > TIMEOUT_MINUTES * 60 * 1000;
}

// Devuelve el menú padre del estado actual, o null para salir completamente
function parentMenu(state: string | null): string | null {
  switch (state) {
    case "menu_enfoque":
    case "menu_pausa":
      return "menu_principal";
    default:
      // menu_principal y estados desconocidos → salir completamente
      return null;
  }
}

// Formatea fecha de vencimiento (date col → DD/MM/AAAA)
function formatearFecha(fechaStr: string | null): string {
  if (!fechaStr) return "no registrada";
  try {
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return fechaStr;
    const dd   = String(d.getUTCDate()).padStart(2, "0");
    const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");
    const aaaa = d.getUTCFullYear();
    return `${dd}/${mm}/${aaaa}`;
  } catch {
    return fechaStr;
  }
}

// Envia y dispara la plantilla del menú padre (o despedida si no hay padre)
async function volverAlPadre(
  suscriptor: {
    id: number;
    nombre: string | null;
    menu_state: string | null;
  },
  whatsapp: string,
): Promise<Response> {
  const parent = parentMenu(suscriptor.menu_state);
  const nombre = suscriptor.nombre ?? "";

  if (parent) {
    // Subir al menú padre
    await supabase.from("suscriptores").update({
      menu_state:             parent,
      menu_state_updated_at:  nowISO(),
      actualizado_en:         nowISO(),
    }).eq("id", suscriptor.id);

    const enq = await enqueuePlantilla({
      id_suscriptor:    suscriptor.id,
      whatsapp,
      nombre_plantilla: parent, // "menu_principal" → reutiliza esa plantilla
      variables:        { nombre },
    });
    if (enq.ok) await dispararSender(enq.id_mensaje!);

    await registrarLog("menu_volver", {
      id_suscriptor: suscriptor.id,
      from: suscriptor.menu_state,
      to:   parent,
    }, true);
    return jsonResp({ resultado: "ok", accion: "volver", to: parent });
  }

  // Sin padre → salir completamente
  await supabase.from("suscriptores").update({
    menu_state:             null,
    menu_state_updated_at:  nowISO(),
    actualizado_en:         nowISO(),
  }).eq("id", suscriptor.id);

  const enq = await enqueuePlantilla({
    id_suscriptor:    suscriptor.id,
    whatsapp,
    nombre_plantilla: PLANTILLA_MENU_SALIR,
    variables:        { nombre },
  });
  if (enq.ok) await dispararSender(enq.id_mensaje!);

  await registrarLog("menu_salir", {
    id_suscriptor: suscriptor.id,
    desde_state:   suscriptor.menu_state,
  }, true);
  return jsonResp({ resultado: "ok", accion: "salir" });
}

// ============================================================================
// Handler principal
// ============================================================================
serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResp({ error: "Método no permitido" }, 405);
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ error: "JSON inválido" }, 400);
  }

  // Campos esperados desde ef_webhook_whatsapp_inbound:
  //   { whatsapp: "+598...", text: "MENU" }
  const whatsapp = typeof (body as Record<string, unknown>)?.whatsapp === "string"
    ? ((body as Record<string, unknown>).whatsapp as string).trim()
    : null;
  const textRaw  = (body as Record<string, unknown>)?.text
    ?? (body as Record<string, unknown>)?.mensaje
    ?? null;
  const input = normalizeText(textRaw);

  if (!whatsapp) return jsonResp({ error: "Falta whatsapp" }, 400);

  // --------------------------------------------------------------------------
  // Buscar suscriptor.
  // Se incluye fecha_vencimiento_premium para la opción 2 (Estado).
  // Se incluyen menu_state / menu_state_updated_at (migración 20260517120000).
  // --------------------------------------------------------------------------
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
      fecha_vencimiento_premium,
      menu_state,
      menu_state_updated_at
    `)
    .eq("whatsapp", whatsapp)
    .maybeSingle();

  if (errS) {
    await registrarLog("error_buscar_suscriptor", { whatsapp, error: errS.message }, false);
    return jsonResp({ resultado: "error", mensaje: "Error buscando suscriptor" }, 500);
  }
  if (!suscriptor) {
    await registrarLog("whatsapp_no_registrado", { whatsapp, input }, true);
    return jsonResp({ resultado: "sin_accion", motivo: "no_registrado" });
  }

  // Gate: solo usuarios premium (defensa en profundidad; el inbound ya filtró)
  if (suscriptor.tipo_suscripcion !== "premium") {
    await registrarLog("menu_bloqueado_no_premium", {
      id_suscriptor:   suscriptor.id,
      tipo_suscripcion: suscriptor.tipo_suscripcion,
    }, true);
    return jsonResp({ resultado: "sin_accion", motivo: "no_premium" });
  }

  // Advisory lock: evita duplicados si llegan dos mensajes simultáneos
  const locked = await acquireLock(suscriptor.id);
  if (!locked) {
    await registrarLog("lock_no_adquirido", { id_suscriptor: suscriptor.id }, false);
    return jsonResp({ resultado: "sin_accion", motivo: "lock" });
  }

  // Alias corto para variables frecuentes
  const nombre   = suscriptor.nombre ?? "";
  const menuState = suscriptor.menu_state as string | null;

  try {
    // ========================================================================
    // TIMEOUT: menu_state activo pero inactivo hace más de TIMEOUT_MINUTES min
    // ========================================================================
    if (menuState && isTimedOut(suscriptor.menu_state_updated_at ?? null)) {
      await supabase.from("suscriptores").update({
        menu_state:             null,
        menu_state_updated_at:  nowISO(),
        actualizado_en:         nowISO(),
      }).eq("id", suscriptor.id);

      const enq = await enqueuePlantilla({
        id_suscriptor:    suscriptor.id,
        whatsapp,
        nombre_plantilla: PLANTILLA_MENU_TIMEOUT,
        variables:        { nombre },
      });
      if (enq.ok) await dispararSender(enq.id_mensaje!);

      await registrarLog("menu_timeout_reset", {
        id_suscriptor:      suscriptor.id,
        menu_state_anterior: menuState,
      }, true);
      return jsonResp({ resultado: "ok", accion: "timeout_reset" });
    }

    // ========================================================================
    // TRIGGER GLOBAL: MENU / CONFIG / AJUSTES / PREFERENCIAS
    // Siempre muestra el menú principal, independientemente del estado actual.
    // ========================================================================
    if (TRIGGERS_MENU.includes(input)) {
      await supabase.from("suscriptores").update({
        menu_state:             "menu_principal",
        menu_state_updated_at:  nowISO(),
        actualizado_en:         nowISO(),
      }).eq("id", suscriptor.id);

      const enq = await enqueuePlantilla({
        id_suscriptor:    suscriptor.id,
        whatsapp,
        nombre_plantilla: PLANTILLA_MENU_PRINCIPAL,
        variables:        { nombre },
      });
      if (enq.ok) await dispararSender(enq.id_mensaje!);

      await registrarLog("menu_principal_mostrado", {
        id_suscriptor: suscriptor.id,
        input,
        desde_state:   menuState ?? "null",
      }, true);
      return jsonResp({ resultado: "ok", accion: "menu_principal" });
    }

    // ========================================================================
    // SIN menu_state: situación inesperada (inbound no debería llamar aquí)
    // ========================================================================
    if (!menuState) {
      await registrarLog("sin_menu_state", { id_suscriptor: suscriptor.id, input }, true);
      return jsonResp({ resultado: "sin_accion", motivo: "no_menu_state" });
    }

    // ========================================================================
    // OPCIÓN "0" — VOLVER AL PADRE O SALIR
    //   menu_principal → salir (menu_state=null, plantilla menu_salir)
    //   menu_enfoque   → volver a menu_principal
    //   menu_pausa     → volver a menu_principal
    // ========================================================================
    if (input === "0") {
      return await volverAlPadre(
        { id: suscriptor.id, nombre: suscriptor.nombre, menu_state: menuState },
        whatsapp,
      );
    }

    // ========================================================================
    // MENÚ PRINCIPAL — opciones 1-4
    // ========================================================================
    if (menuState === "menu_principal") {

      // ---- 1) Cambiar enfoque ------------------------------------------
      if (input === "1") {
        await supabase.from("suscriptores").update({
          menu_state:             "menu_enfoque",
          menu_state_updated_at:  nowISO(),
          actualizado_en:         nowISO(),
        }).eq("id", suscriptor.id);

        const enq = await enqueuePlantilla({
          id_suscriptor:    suscriptor.id,
          whatsapp,
          nombre_plantilla: PLANTILLA_MENU_ENFOQUE,
          variables: {
            nombre,
            enfoque_actual: suscriptor.contenido_preferido
              ? (LABELS_ENFOQUE[suscriptor.contenido_preferido] ?? suscriptor.contenido_preferido)
              : "no definido",
          },
        });
        if (enq.ok) await dispararSender(enq.id_mensaje!);
        await registrarLog("menu_enfoque_mostrado", { id_suscriptor: suscriptor.id }, true);
        return jsonResp({ resultado: "ok", accion: "menu_enfoque" });
      }

      // ---- 2) Estado de mi suscripción ------------------------------------
      if (input === "2") {
        const premiumLegible      = suscriptor.premium_activo === true ? "activa" : "no activa";
        const suscripcionLegible  = LABELS_ESTADO_SUSCRIPCION[suscriptor.estado_suscripcion ?? ""]
          ?? suscriptor.estado_suscripcion
          ?? "sin estado";
        const mensajesLegible     = suscriptor.estado_mensaje === "pausado_usuario"
          ? "pausados"
          : "activos";
        const vencimientoLegible  = formatearFecha(suscriptor.fecha_vencimiento_premium);

        // El usuario queda en menu_principal: puede usar 0 para salir
        // o escribir otro número para probar otra opción.
        await supabase.from("suscriptores").update({
          menu_state_updated_at: nowISO(),
          actualizado_en:        nowISO(),
        }).eq("id", suscriptor.id);

        const enq = await enqueuePlantilla({
          id_suscriptor:    suscriptor.id,
          whatsapp,
          nombre_plantilla: PLANTILLA_MENU_ESTADO,
          variables: {
            nombre,
            premium:     premiumLegible,
            suscripcion: suscripcionLegible,
            mensajes:    mensajesLegible,
            vencimiento: vencimientoLegible,
          },
        });
        if (enq.ok) await dispararSender(enq.id_mensaje!);
        await registrarLog("menu_estado_suscripcion_mostrado", {
          id_suscriptor:     suscriptor.id,
          premium_activo:    suscriptor.premium_activo,
          estado_suscripcion: suscriptor.estado_suscripcion,
          estado_mensaje:    suscriptor.estado_mensaje,
        }, true);
        return jsonResp({ resultado: "ok", accion: "estado_suscripcion" });
      }

      // ---- 3) Pausar / reactivar mensajes ---------------------------------
      if (input === "3") {
        await supabase.from("suscriptores").update({
          menu_state:             "menu_pausa",
          menu_state_updated_at:  nowISO(),
          actualizado_en:         nowISO(),
        }).eq("id", suscriptor.id);

        const enq = await enqueuePlantilla({
          id_suscriptor:    suscriptor.id,
          whatsapp,
          nombre_plantilla: PLANTILLA_MENU_PAUSA,
          variables: {
            nombre,
            estado_mensajes: suscriptor.estado_mensaje === "pausado_usuario"
              ? "pausados"
              : "activos",
          },
        });
        if (enq.ok) await dispararSender(enq.id_mensaje!);
        await registrarLog("menu_pausa_mostrado", {
          id_suscriptor:  suscriptor.id,
          estado_mensaje: suscriptor.estado_mensaje,
        }, true);
        return jsonResp({ resultado: "ok", accion: "menu_pausa" });
      }

      // ---- 4) Ayuda -------------------------------------------------------
      // Reutiliza la plantilla ayuda_usuario ya aprobada en Meta.
      // Variables: { nombre }
      if (input === "4") {
        // El usuario queda en menu_principal (puede continuar navegando)
        await supabase.from("suscriptores").update({
          menu_state_updated_at: nowISO(),
          actualizado_en:        nowISO(),
        }).eq("id", suscriptor.id);

        const enq = await enqueuePlantilla({
          id_suscriptor:    suscriptor.id,
          whatsapp,
          nombre_plantilla: PLANTILLA_AYUDA_USUARIO,
          variables:        { nombre },
        });
        if (enq.ok) await dispararSender(enq.id_mensaje!);
        await registrarLog("menu_ayuda_mostrada", { id_suscriptor: suscriptor.id }, true);
        return jsonResp({ resultado: "ok", accion: "ayuda" });
      }

      // ---- Input inválido (no es 0-4 ni trigger) -------------------------
      await supabase.from("suscriptores").update({
        menu_state_updated_at: nowISO(),
        actualizado_en:        nowISO(),
      }).eq("id", suscriptor.id);

      const enqInv = await enqueuePlantilla({
        id_suscriptor:    suscriptor.id,
        whatsapp,
        nombre_plantilla: PLANTILLA_MENU_INVALIDO,
        variables:        { nombre },
      });
      if (enqInv.ok) await dispararSender(enqInv.id_mensaje!);
      await registrarLog("menu_principal_invalido", { id_suscriptor: suscriptor.id, input }, true);
      return jsonResp({ resultado: "ok", accion: "invalido" });
    }

    // ========================================================================
    // SUB-MENÚ ENFOQUE (opción 1 del menú principal)
    // ========================================================================
    if (menuState === "menu_enfoque") {
      if (MAPA_ENFOQUE[input]) {
        const nuevoEnfoque = MAPA_ENFOQUE[input];

        // Actualizar contenido_preferido y salir del menú
        await supabase.from("suscriptores").update({
          contenido_preferido:    nuevoEnfoque,
          menu_state:             null,
          menu_state_updated_at:  nowISO(),
          actualizado_en:         nowISO(),
        }).eq("id", suscriptor.id);

        const enq = await enqueuePlantilla({
          id_suscriptor:    suscriptor.id,
          whatsapp,
          nombre_plantilla: PLANTILLA_MENU_CONF_ENFOQUE,
          variables: {
            nombre,
            enfoque: LABELS_ENFOQUE[nuevoEnfoque] ?? nuevoEnfoque,
          },
        });
        if (enq.ok) await dispararSender(enq.id_mensaje!);

        await registrarLog("menu_enfoque_actualizado", {
          id_suscriptor:    suscriptor.id,
          enfoque_anterior: suscriptor.contenido_preferido ?? "no_definido",
          enfoque_nuevo:    nuevoEnfoque,
        }, true);
        return jsonResp({ resultado: "ok", accion: "enfoque_actualizado", enfoque: nuevoEnfoque });
      }

      // Input inválido en menu_enfoque (no es 0-4)
      await supabase.from("suscriptores").update({
        menu_state_updated_at: nowISO(),
        actualizado_en:        nowISO(),
      }).eq("id", suscriptor.id);

      const enq = await enqueuePlantilla({
        id_suscriptor:    suscriptor.id,
        whatsapp,
        nombre_plantilla: PLANTILLA_MENU_ENFOQUE_INV,
        variables:        { nombre },
      });
      if (enq.ok) await dispararSender(enq.id_mensaje!);
      await registrarLog("menu_enfoque_invalido", { id_suscriptor: suscriptor.id, input }, true);
      return jsonResp({ resultado: "ok", accion: "enfoque_invalido" });
    }

    // ========================================================================
    // SUB-MENÚ PAUSA / REACTIVAR (opción 3 del menú principal)
    // ========================================================================
    if (menuState === "menu_pausa") {

      // ---- 1) Pausar mensajes --------------------------------------------
      // Solo pausa el envío de mensajes. NO cancela Mercado Pago.
      // NO modifica premium_activo. NO modifica estado_suscripcion.
      if (input === "1") {
        await supabase.from("suscriptores").update({
          estado_mensaje:         "pausado_usuario",
          menu_state:             null,
          menu_state_updated_at:  nowISO(),
          actualizado_en:         nowISO(),
        }).eq("id", suscriptor.id);

        const enq = await enqueuePlantilla({
          id_suscriptor:    suscriptor.id,
          whatsapp,
          nombre_plantilla: PLANTILLA_MENU_PAUSA_CONF,
          variables:        { nombre },
        });
        if (enq.ok) await dispararSender(enq.id_mensaje!);

        await registrarLog("menu_mensajes_pausados", {
          id_suscriptor:          suscriptor.id,
          estado_mensaje_anterior: suscriptor.estado_mensaje,
          nota: "NO_cancela_MP_solo_pausa_mensajes",
        }, true);
        return jsonResp({ resultado: "ok", accion: "mensajes_pausados" });
      }

      // ---- 2) Reactivar mensajes -----------------------------------------
      if (input === "2") {
        await supabase.from("suscriptores").update({
          estado_mensaje:         "activo",
          menu_state:             null,
          menu_state_updated_at:  nowISO(),
          actualizado_en:         nowISO(),
        }).eq("id", suscriptor.id);

        const enq = await enqueuePlantilla({
          id_suscriptor:    suscriptor.id,
          whatsapp,
          nombre_plantilla: PLANTILLA_MENU_REACTIV_CONF,
          variables:        { nombre },
        });
        if (enq.ok) await dispararSender(enq.id_mensaje!);

        await registrarLog("menu_mensajes_reactivados", {
          id_suscriptor:          suscriptor.id,
          estado_mensaje_anterior: suscriptor.estado_mensaje,
        }, true);
        return jsonResp({ resultado: "ok", accion: "mensajes_reactivados" });
      }

      // Input inválido en menu_pausa (no es 0-2)
      await supabase.from("suscriptores").update({
        menu_state_updated_at: nowISO(),
        actualizado_en:        nowISO(),
      }).eq("id", suscriptor.id);

      const enq = await enqueuePlantilla({
        id_suscriptor:    suscriptor.id,
        whatsapp,
        nombre_plantilla: PLANTILLA_MENU_PAUSA_INV,
        variables:        { nombre },
      });
      if (enq.ok) await dispararSender(enq.id_mensaje!);
      await registrarLog("menu_pausa_invalido", { id_suscriptor: suscriptor.id, input }, true);
      return jsonResp({ resultado: "ok", accion: "pausa_invalido" });
    }

    // ========================================================================
    // ESTADO DESCONOCIDO — RESET DEFENSIVO
    // Si menu_state tiene un valor no reconocido (datos corruptos, sprint
    // futuro parcialmente deployado, etc.) → resetear sin mensaje al usuario.
    // ========================================================================
    await supabase.from("suscriptores").update({
      menu_state:             null,
      menu_state_updated_at:  nowISO(),
      actualizado_en:         nowISO(),
    }).eq("id", suscriptor.id);

    await registrarLog("menu_state_desconocido_reset", {
      id_suscriptor: suscriptor.id,
      menu_state:    menuState,
      input,
    }, true);
    return jsonResp({ resultado: "ok", accion: "reset" });

  } catch (e) {
    await registrarLog("fatal_exception", {
      error:    String(e),
      whatsapp,
      input,
    }, false);
    return jsonResp({ resultado: "error", mensaje: "fatal_exception" });
  } finally {
    await releaseLock(suscriptor.id);
  }
});
