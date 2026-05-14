// ============================================================================
// EDGE FUNCTION: ef_orquesta_menu_respuesta
// ============================================================================
// Responsabilidad:
// - Procesar respuestas del usuario cuando está dentro de un menú (menu_state != null)
// - Aplicar reglas globales: MENU / 0 / BAJA / ALTA / ESTADO / SOPORTE
// - Timeout 10 min de estado
// - Actualiza preferencia (contenido_preferido) y franja horaria (send_window)
// - Usa OUTBOX + dispara ef_whatsapp_sender inmediatamente
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const FN = "ef_orquesta_menu_respuesta";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY_SUPABASE") ?? "";
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const SENDER_FN = "ef_whatsapp_sender";
// Si tenés orquestadores separados para BAJA/ALTA/ESTADO, ponelos acá:
const ORQ_BAJA = "ef_orquesta_baja"; // <-- si existe
const ORQ_ALTA = "ef_orquesta_alta"; // <-- si existe
const ORQ_ESTADO = "ef_orquesta_estado"; // <-- si existe
const ORQ_SOPORTE = "ef_orquesta_soporte"; // <-- opcional
const TIMEOUT_MINUTES = 10;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
function nowISO() {
  return new Date().toISOString();
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
function normalizeText(input) {
  if (typeof input !== "string") return "";
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
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
  // no romper
  }
}
// Advisory lock por suscriptor (evita carreras si llegan 2 mensajes seguidos)
async function acquireLock(id_suscriptor) {
  const { error } = await supabase.rpc("pg_advisory_lock", {
    key: id_suscriptor
  });
  return !error;
}
async function releaseLock(id_suscriptor) {
  await supabase.rpc("pg_advisory_unlock", {
    key: id_suscriptor
  });
}
// OUTBOX enqueue: usando plantilla + variables
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
      contexto: "menu_mvp",
      ...params.metadata_extra ?? {}
    }
  };
  const { data, error } = await supabase.from("mensajes_enviados").insert(row).select("id").maybeSingle();
  if (error) return {
    ok: false,
    error: error.message
  };
  if (!data?.id) return {
    ok: false,
    error: "no_id_mensaje"
  };
  return {
    ok: true,
    id_mensaje: data.id
  };
}
// Disparo sender (intento inmediato)
async function dispararSender(id_mensaje) {
  const url = `${SUPABASE_URL}/functions/v1/${SENDER_FN}`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ANON_KEY}`,
    "apikey": ANON_KEY
  };
  // seguridad extra interna (si el sender la valida)
  if (WHATSAPP_INTERNAL_KEY) headers["x-internal-key"] = WHATSAPP_INTERNAL_KEY;
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id_mensaje
    })
  });
  const txt = await r.text();
  let body = null;
  try {
    body = JSON.parse(txt);
  } catch  {
    body = {
      raw: txt
    };
  }
  return {
    ok: r.ok,
    status: r.status,
    body
  };
}
// Llamar orquestadores auxiliares (si los tenés)
async function callOrq(fnName, payload) {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ANON_KEY}`,
    "apikey": ANON_KEY
  };
  if (WHATSAPP_INTERNAL_KEY) headers["x-internal-key"] = WHATSAPP_INTERNAL_KEY;
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const txt = await r.text();
  let body = null;
  try {
    body = JSON.parse(txt);
  } catch  {
    body = {
      raw: txt
    };
  }
  return {
    ok: r.ok,
    status: r.status,
    body
  };
}
// Timeout check
function isTimedOut(menuUpdatedAt) {
  if (!menuUpdatedAt) return true;
  const d = new Date(menuUpdatedAt);
  if (isNaN(d.getTime())) return true;
  const diffMs = Date.now() - d.getTime();
  return diffMs > TIMEOUT_MINUTES * 60 * 1000;
}
// Helpers de “volver”
function parentMenu(state) {
  if (!state) return null;
  switch(state){
    case "menu_enfoque":
    case "menu_horario":
    case "menu_pausa":
    case "menu_ayuda":
      return "menu_principal";
    case "menu_principal":
    default:
      return null; // salir
  }
}
// ============================================================================
// MAIN
// ============================================================================
serve(async (req)=>{
  if (req.method !== "POST") return json({
    error: "Método no permitido"
  }, 405);
  let body = null;
  try {
    body = await req.json();
  } catch  {
    return json({
      error: "JSON inválido"
    }, 400);
  }
  // Esperado desde inbound:
  // { whatsapp: "+598...", text: "1", msgId?: "...", timestampUTC?: "..." }
  const whatsapp = typeof body?.whatsapp === "string" ? body.whatsapp.trim() : null;
  const textRaw = body?.text ?? body?.mensaje ?? null;
  const input = normalizeText(textRaw);
  if (!whatsapp) return json({
    error: "Falta whatsapp"
  }, 400);
  // Buscar suscriptor por whatsapp
  const { data: suscriptor, error: errS } = await supabase.from("suscriptores").select(`
      id,
      nombre,
      whatsapp,
      premium_activo,
      estado_suscripcion,
      tipo_suscripcion,
      mensajes_pausados,
      contenido_preferido,
      send_window,
      menu_state,
      menu_state_updated_at
    `).eq("whatsapp", whatsapp).maybeSingle();
  if (errS) {
    await registrarLog("error_buscar_suscriptor", {
      whatsapp,
      error: errS.message
    }, false);
    return json({
      resultado: "error",
      mensaje: "Error buscando suscriptor"
    }, 500);
  }
  if (!suscriptor) {
    await registrarLog("whatsapp_no_registrado", {
      whatsapp,
      input
    }, true);
    return json({
      resultado: "sin_accion",
      motivo: "no_registrado"
    }, 200);
  }
  // Gate “premium activo o pausado”: aceptamos menú si es premium (activo o pausado)
  // Ajustá esto a tu modelo real:
  const esPremium = suscriptor?.tipo_suscripcion === "premium" || suscriptor?.premium_activo === true || suscriptor?.estado_suscripcion === "activa" || suscriptor?.estado_suscripcion === "pausada";
  if (!esPremium) {
    await registrarLog("menu_bloqueado_no_premium", {
      id_suscriptor: suscriptor.id,
      whatsapp
    }, true);
    return json({
      resultado: "sin_accion",
      motivo: "no_premium"
    }, 200);
  }
  // Lock por suscriptor
  const locked = await acquireLock(suscriptor.id);
  if (!locked) {
    await registrarLog("lock_no_adquirido", {
      id_suscriptor: suscriptor.id
    }, false);
    return json({
      resultado: "sin_accion",
      motivo: "lock"
    }, 200);
  }
  try {
    // 1) Timeout
    if (suscriptor?.menu_state && isTimedOut(suscriptor?.menu_state_updated_at ?? null)) {
      // reset estado y avisar expiración
      await supabase.from("suscriptores").update({
        menu_state: null,
        menu_state_updated_at: nowISO(),
        actualizado_en: nowISO()
      }).eq("id", suscriptor.id);
      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: "menu_timeout",
        variables: {
          nombre: suscriptor?.nombre ?? ""
        }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);
      await registrarLog("menu_timeout_reset", {
        id_suscriptor: suscriptor.id
      }, true);
      return json({
        resultado: "ok",
        accion: "timeout_reset"
      }, 200);
    }
    // 2) Reglas globales (siempre primero)
    if (input === "MENU" || input === "MENÚ" || input === "CONFIG" || input === "AJUSTES" || input === "PREFERENCIAS") {
      // Set menu_principal y enviar template menu_principal
      await supabase.from("suscriptores").update({
        menu_state: "menu_principal",
        menu_state_updated_at: nowISO(),
        actualizado_en: nowISO()
      }).eq("id", suscriptor.id);
      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: "menu_principal",
        variables: {
          nombre: suscriptor?.nombre ?? ""
        }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);
      await registrarLog("menu_principal_mostrado", {
        id_suscriptor: suscriptor.id
      }, true);
      return json({
        resultado: "ok",
        accion: "menu_principal"
      }, 200);
    }
    if (input === "BAJA") {
      if (ORQ_BAJA) {
        const r = await callOrq(ORQ_BAJA, {
          whatsapp
        });
        await registrarLog("orq_baja_called", {
          id_suscriptor: suscriptor.id,
          r
        }, r.ok);
        return json({
          resultado: "ok",
          accion: "baja"
        }, 200);
      }
    }
    if (input === "ALTA") {
      if (ORQ_ALTA) {
        const r = await callOrq(ORQ_ALTA, {
          whatsapp
        });
        await registrarLog("orq_alta_called", {
          id_suscriptor: suscriptor.id,
          r
        }, r.ok);
        return json({
          resultado: "ok",
          accion: "alta"
        }, 200);
      }
    }
    if (input === "ESTADO") {
      if (ORQ_ESTADO) {
        const r = await callOrq(ORQ_ESTADO, {
          whatsapp
        });
        await registrarLog("orq_estado_called", {
          id_suscriptor: suscriptor.id,
          r
        }, r.ok);
        return json({
          resultado: "ok",
          accion: "estado"
        }, 200);
      }
    }
    if (input === "SOPORTE") {
      if (ORQ_SOPORTE) {
        const r = await callOrq(ORQ_SOPORTE, {
          whatsapp,
          motivo: "menu_soporte"
        });
        await registrarLog("orq_soporte_called", {
          id_suscriptor: suscriptor.id,
          r
        }, r.ok);
        return json({
          resultado: "ok",
          accion: "soporte"
        }, 200);
      }
      // fallback simple (encola plantilla help)
      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: "soporte_std",
        variables: {
          nombre: suscriptor?.nombre ?? ""
        }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);
      return json({
        resultado: "ok",
        accion: "soporte_fallback"
      }, 200);
    }
    // 3) Si no está en menú, no es responsabilidad de esta función
    const menuState = suscriptor?.menu_state ?? null;
    if (!menuState) {
      await registrarLog("sin_menu_state", {
        id_suscriptor: suscriptor.id,
        input
      }, true);
      return json({
        resultado: "sin_accion",
        motivo: "no_menu_state"
      }, 200);
    }
    // 4) Manejo global de “0 volver/salir”
    if (input === "0") {
      const next = parentMenu(menuState);
      await supabase.from("suscriptores").update({
        menu_state: next,
        menu_state_updated_at: nowISO(),
        actualizado_en: nowISO()
      }).eq("id", suscriptor.id);
      if (!next) {
        // salir
        const enq = await enqueuePlantilla({
          id_suscriptor: suscriptor.id,
          whatsapp,
          nombre_plantilla: "menu_salir",
          variables: {
            nombre: suscriptor?.nombre ?? ""
          }
        });
        if (enq.ok) await dispararSender(enq.id_mensaje);
        await registrarLog("menu_salir", {
          id_suscriptor: suscriptor.id
        }, true);
        return json({
          resultado: "ok",
          accion: "salir"
        }, 200);
      }
      // volver al menú padre -> enviar template del padre
      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: next,
        variables: {
          nombre: suscriptor?.nombre ?? ""
        }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);
      await registrarLog("menu_volver", {
        id_suscriptor: suscriptor.id,
        from: menuState,
        to: next
      }, true);
      return json({
        resultado: "ok",
        accion: "volver",
        to: next
      }, 200);
    }
    // 5) Switch principal por estado
    // NOTA: mantenemos el “router” acá, no en inbound.
    let plantillaAEnviar = null;
    if (menuState === "menu_principal") {
      if (input === "1") plantillaAEnviar = "menu_enfoque";
      else if (input === "2") plantillaAEnviar = "menu_horario";
      else if (input === "3") plantillaAEnviar = "menu_pausa";
      else if (input === "4") plantillaAEnviar = "menu_estado"; // o llamar ORQ_ESTADO
      else if (input === "5") plantillaAEnviar = "menu_ayuda";
      else plantillaAEnviar = "menu_principal_invalido"; // “Respondé con un número válido”
      // actualizar estado si corresponde
      if ([
        "menu_enfoque",
        "menu_horario",
        "menu_pausa",
        "menu_ayuda"
      ].includes(plantillaAEnviar)) {
        await supabase.from("suscriptores").update({
          menu_state: plantillaAEnviar,
          menu_state_updated_at: nowISO(),
          actualizado_en: nowISO()
        }).eq("id", suscriptor.id);
      } else {
        await supabase.from("suscriptores").update({
          menu_state_updated_at: nowISO(),
          actualizado_en: nowISO()
        }).eq("id", suscriptor.id);
      }
      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: plantillaAEnviar,
        variables: {
          nombre: suscriptor?.nombre ?? ""
        }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);
      await registrarLog("menu_principal_resuelto", {
        id_suscriptor: suscriptor.id,
        input,
        plantilla: plantillaAEnviar
      }, true);
      return json({
        resultado: "ok",
        accion: "menu_principal",
        plantilla: plantillaAEnviar
      }, 200);
    }
    // --- MENÚ ENFOQUE
    if (menuState === "menu_enfoque") {
      const map = {
        "1": "bienestar",
        "2": "trabajo_dinero",
        "3": "amor_relaciones",
        "4": "salud_energia"
      };
      if (map[input]) {
        const enfoque = map[input];
        await supabase.from("suscriptores").update({
          contenido_preferido: enfoque,
          menu_state: null,
          menu_state_updated_at: nowISO(),
          actualizado_en: nowISO()
        }).eq("id", suscriptor.id);
        const enq = await enqueuePlantilla({
          id_suscriptor: suscriptor.id,
          whatsapp,
          nombre_plantilla: "menu_confirmacion_enfoque",
          variables: {
            nombre: suscriptor?.nombre ?? "",
            enfoque
          }
        });
        if (enq.ok) await dispararSender(enq.id_mensaje);
        await registrarLog("enfoque_actualizado", {
          id_suscriptor: suscriptor.id,
          enfoque
        }, true);
        return json({
          resultado: "ok",
          accion: "enfoque_actualizado",
          enfoque
        }, 200);
      }
      // input inválido -> re-enviar menú enfoque
      await supabase.from("suscriptores").update({
        menu_state_updated_at: nowISO(),
        actualizado_en: nowISO()
      }).eq("id", suscriptor.id);
      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: "menu_enfoque_invalido",
        variables: {
          nombre: suscriptor?.nombre ?? ""
        }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);
      return json({
        resultado: "ok",
        accion: "enfoque_invalido"
      }, 200);
    }
    // --- MENÚ HORARIO
    if (menuState === "menu_horario") {
      const map = {
        "1": "07_09",
        "2": "09_12",
        "3": "12_15",
        "4": "15_18"
      };
      if (map[input]) {
        const send_window = map[input];
        await supabase.from("suscriptores").update({
          send_window,
          menu_state: null,
          menu_state_updated_at: nowISO(),
          actualizado_en: nowISO()
        }).eq("id", suscriptor.id);
        const enq = await enqueuePlantilla({
          id_suscriptor: suscriptor.id,
          whatsapp,
          nombre_plantilla: "menu_confirmacion_horario",
          variables: {
            nombre: suscriptor?.nombre ?? "",
            horario: send_window
          }
        });
        if (enq.ok) await dispararSender(enq.id_mensaje);
        await registrarLog("horario_actualizado", {
          id_suscriptor: suscriptor.id,
          send_window
        }, true);
        return json({
          resultado: "ok",
          accion: "horario_actualizado",
          send_window
        }, 200);
      }
      await supabase.from("suscriptores").update({
        menu_state_updated_at: nowISO(),
        actualizado_en: nowISO()
      }).eq("id", suscriptor.id);
      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: "menu_horario_invalido",
        variables: {
          nombre: suscriptor?.nombre ?? ""
        }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);
      return json({
        resultado: "ok",
        accion: "horario_invalido"
      }, 200);
    }
    // --- MENÚ PAUSA / REACTIVAR
    if (menuState === "menu_pausa") {
      if (input === "1") {
        // Pausar = BAJA (misma lógica)
        await supabase.from("suscriptores").update({
          menu_state_updated_at: nowISO(),
          actualizado_en: nowISO()
        }).eq("id", suscriptor.id);
        if (ORQ_BAJA) await callOrq(ORQ_BAJA, {
          whatsapp
        });
        // Además salimos del menú (opcional)
        await supabase.from("suscriptores").update({
          menu_state: null,
          menu_state_updated_at: nowISO(),
          actualizado_en: nowISO()
        }).eq("id", suscriptor.id);
        return json({
          resultado: "ok",
          accion: "pausar_baja"
        }, 200);
      }
      if (input === "2") {
        // Reactivar = ALTA (misma lógica)
        await supabase.from("suscriptores").update({
          menu_state_updated_at: nowISO(),
          actualizado_en: nowISO()
        }).eq("id", suscriptor.id);
        if (ORQ_ALTA) await callOrq(ORQ_ALTA, {
          whatsapp
        });
        await supabase.from("suscriptores").update({
          menu_state: null,
          menu_state_updated_at: nowISO(),
          actualizado_en: nowISO()
        }).eq("id", suscriptor.id);
        return json({
          resultado: "ok",
          accion: "reactivar_alta"
        }, 200);
      }
      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: "menu_pausa_invalido",
        variables: {
          nombre: suscriptor?.nombre ?? ""
        }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);
      return json({
        resultado: "ok",
        accion: "pausa_invalido"
      }, 200);
    }
    // --- MENÚ AYUDA
    if (menuState === "menu_ayuda") {
      // si el usuario escribe SOPORTE ya lo manejamos arriba global
      // acá cualquier cosa -> re-enviar ayuda y mantener estado
      await supabase.from("suscriptores").update({
        menu_state_updated_at: nowISO(),
        actualizado_en: nowISO()
      }).eq("id", suscriptor.id);
      const enq = await enqueuePlantilla({
        id_suscriptor: suscriptor.id,
        whatsapp,
        nombre_plantilla: "menu_ayuda",
        variables: {
          nombre: suscriptor?.nombre ?? ""
        }
      });
      if (enq.ok) await dispararSender(enq.id_mensaje);
      return json({
        resultado: "ok",
        accion: "ayuda_reenviada"
      }, 200);
    }
    // Estado desconocido -> reset
    await supabase.from("suscriptores").update({
      menu_state: null,
      menu_state_updated_at: nowISO(),
      actualizado_en: nowISO()
    }).eq("id", suscriptor.id);
    const enq = await enqueuePlantilla({
      id_suscriptor: suscriptor.id,
      whatsapp,
      nombre_plantilla: "menu_reset_desconocido",
      variables: {
        nombre: suscriptor?.nombre ?? ""
      }
    });
    if (enq.ok) await dispararSender(enq.id_mensaje);
    await registrarLog("menu_state_desconocido_reset", {
      id_suscriptor: suscriptor.id,
      menuState
    }, true);
    return json({
      resultado: "ok",
      accion: "reset"
    }, 200);
  } catch (e) {
    await registrarLog("fatal_exception", {
      error: String(e)
    }, false);
    return json({
      resultado: "error",
      mensaje: "fatal_exception"
    }, 200);
  } finally{
    await releaseLock(suscriptor.id);
  }
});
