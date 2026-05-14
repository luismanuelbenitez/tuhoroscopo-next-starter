// ============================================================================
// EDGE FUNCTION: ef_envio_premium_post_confirmacion (v2.0 FINAL)
// ============================================================================
//
// MODO DUAL:
//   A) CRON (body vacío)  -> busca elegibles (>= 5 min) y procesa lote
//   B) ON-DEMAND          -> body { id_suscriptor: number } procesa 1 y envía INMEDIATO
//
// QUÉ HACE (PIPELINE COMPLETO INMEDIATO):
//   1) Encola "primer_mensaje_premium" y dispara ef_whatsapp_sender (no depende de CRON)
//   2) Genera contenido premium (diario o domingo) para el suscriptor
//   3) Encola mensaje premium (nombre_plantilla=NULL) con metadata.tipo_contenido + variables.cuerpo
//   4) Dispara ef_whatsapp_sender para ese id_mensaje
//   5) Marca suscriptor.primer_envio_premium_enviado=true SOLO si el envío premium fue OK
//
// IMPORTANTE:
//   - No depende del encolador premium (porque tu sender requiere metadata.variables.cuerpo)
//   - Usa Advisory Lock por suscriptor
//   - No rompe cron: siempre responde OK
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
// ----------------------------------------------------------------------------
// ENV
// ----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY_SUPABASE") ?? ""; // tolerante
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const APP_ENV = (Deno.env.get("APP_ENV") ?? "sandbox").toLowerCase();
const SANDBOX = APP_ENV !== "production";
const FN = "ef_envio_premium_post_confirmacion";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ----------------------------------------------------------------------------
// Helpers fecha / logging
// ----------------------------------------------------------------------------
const nowISO = ()=>new Date().toISOString();
function todayUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isSundayUTC() {
  return new Date().getUTCDay() === 0;
}
async function registrarLog(resultado, detalle = {}, exito = true) {
  try {
    await supabase.from("log_funciones").insert({
      nombre_funcion: FN,
      fecha_ejecucion: nowISO(),
      resultado,
      detalle,
      exito,
      creado_por: "system"
    });
  } catch (e) {
    console.error(`[${FN}] logging_error`, e);
  }
}
// ----------------------------------------------------------------------------
// Advisory locks
// ----------------------------------------------------------------------------
async function acquireLock(key) {
  const { error } = await supabase.rpc("pg_advisory_lock", {
    key
  });
  return !error;
}
async function releaseLock(key) {
  await supabase.rpc("pg_advisory_unlock", {
    key
  });
}
// ----------------------------------------------------------------------------
// Disparo de sender
// ----------------------------------------------------------------------------
async function dispararSender(id_mensaje) {
  const url = `${SUPABASE_URL}/functions/v1/ef_whatsapp_sender`;
  const headers = {
    "Content-Type": "application/json",
    "x-internal-key": WHATSAPP_INTERNAL_KEY
  };
  // Si tu sender tiene verify_jwt=true, mandamos JWT también (no molesta si no lo requiere)
  if (SUPABASE_ANON_KEY) {
    headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
    headers["apikey"] = SUPABASE_ANON_KEY;
  }
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id_mensaje
    })
  });
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch  {
    parsed = {
      raw: text
    };
  }
  return {
    ok: r.ok,
    status: r.status,
    body: parsed
  };
}
// ----------------------------------------------------------------------------
// Render del cuerpo premium (para tu template {{cuerpo}})
// ----------------------------------------------------------------------------
function renderCuerpoPremium(contenido) {
  // Soporta jsonb u objeto parseado
  const c = contenido && typeof contenido === "object" ? contenido : {};
  const horoscopo = String(c.horoscopo ?? "").trim();
  const frase = String(c.frase ?? c.frase_motivadora ?? "").trim();
  const numero = String(c.numero ?? c.numero_suerte ?? "").trim();
  const color = String(c.color ?? c.color_suerte ?? "").trim();
  const pausa = String(c.pausa ?? c.ritual ?? c.ejercicio ?? "").trim();
  const lines = [];
  if (horoscopo) lines.push(horoscopo);
  // Bloque bienestar (compacto)
  if (frase) lines.push("", `💬 ${frase}`);
  if (numero) lines.push("", `🔢 ${numero}`);
  if (color) lines.push("", `🎨 ${color}`);
  if (pausa) lines.push("", `🧘 ${pausa}`);
  // Fallback mínimo para no mandar vacío
  const out = lines.join("\n").trim();
  return out || "✨ Tu mensaje premium está listo. (Contenido no disponible para renderizar.)";
}
// ----------------------------------------------------------------------------
// Generación de contenido (diario vs domingo)
// ----------------------------------------------------------------------------
async function generarContenidoPremiumParaSuscriptor(params) {
  const fnName = isSundayUTC() ? "ef_genera_guarda_contenido_premium_domingo" : "ef_genera_guarda_contenido_premium";
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const headers = {
    "Content-Type": "application/json"
  };
  // estas funciones suelen tener verify_jwt=true → mandamos ANON
  if (SUPABASE_ANON_KEY) {
    headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
    headers["apikey"] = SUPABASE_ANON_KEY;
  }
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id_suscriptor: params.id_suscriptor
    })
  });
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch  {
    parsed = {
      raw: text
    };
  }
  return {
    ok: r.ok,
    status: r.status,
    body: parsed,
    fnName
  };
}
// ----------------------------------------------------------------------------
// Buscar contenido recién generado
// ----------------------------------------------------------------------------
async function obtenerContenidoPremiumHoy(params) {
  const tipo = isSundayUTC() ? "domingo" : "diario";
  const fechaEnvioUTC = `${todayUTC()}T00:00:00.000Z`;
  // Intentamos por fecha_envio_programada primero (consistente con tu generador)
  const q1 = await supabase.from("contenido_premium").select("id, contenido, tipo, fecha_envio_programada").eq("id_suscriptor", params.id_suscriptor).eq("tipo", tipo).eq("fecha_envio_programada", fechaEnvioUTC).order("id", {
    ascending: false
  }).limit(1);
  if (q1.error) return {
    ok: false,
    error: q1.error.message,
    data: null
  };
  if (q1.data && q1.data.length > 0) return {
    ok: true,
    data: q1.data[0]
  };
  // Fallback: por tipo, el más reciente
  const q2 = await supabase.from("contenido_premium").select("id, contenido, tipo, fecha_envio_programada").eq("id_suscriptor", params.id_suscriptor).eq("tipo", tipo).order("id", {
    ascending: false
  }).limit(1);
  if (q2.error) return {
    ok: false,
    error: q2.error.message,
    data: null
  };
  if (!q2.data || q2.data.length === 0) return {
    ok: false,
    error: "no_hay_contenido",
    data: null
  };
  return {
    ok: true,
    data: q2.data[0]
  };
}
// ----------------------------------------------------------------------------
// Encolar + enviar un template simple (primer_mensaje_premium)
// ----------------------------------------------------------------------------
async function encolarYEnviarPrimerMensaje(params) {
  const ts = nowISO();
  const { data: msg, error } = await supabase.from("mensajes_enviados").insert({
    id_suscriptor: params.id_suscriptor,
    whatsapp_destino: params.whatsapp,
    tipo_mensaje: "operativo",
    nombre_plantilla: "primer_mensaje_premium",
    estado: "pendiente",
    canal_envio: "whatsapp",
    fecha_creado: ts,
    intentos: 0,
    metadata: {
      variables: {
        nombre: params.nombre ?? ""
      },
      contexto: "post_confirmacion"
    }
  }).select("id").maybeSingle();
  if (error || !msg?.id) {
    return {
      ok: false,
      error: error?.message ?? "no_id_mensaje",
      id_mensaje: null
    };
  }
  const sender = await dispararSender(Number(msg.id));
  return {
    ok: true,
    id_mensaje: Number(msg.id),
    sender
  };
}
// ----------------------------------------------------------------------------
// Encolar + enviar premium (nombre_plantilla = null -> sender resuelve premium_diario/domingo)
// ----------------------------------------------------------------------------
async function encolarYEnviarPremium(params) {
  const ts = nowISO();
  // Dedupe simple: si ya hay un premium vivo para ese id_contenido, no duplicar
  const estadosVivos = [
    "pendiente",
    "enviado",
    "delivered",
    "read"
  ];
  const ded = await supabase.from("mensajes_enviados").select("id, estado").eq("tipo_mensaje", "premium").eq("id_contenido", params.id_contenido).in("estado", estadosVivos).limit(1);
  if (ded.error) {
    // no bloqueamos por error de dedupe
    await registrarLog("dedupe_premium_error", {
      id_contenido: params.id_contenido,
      error: ded.error.message
    }, false);
  } else if (ded.data && ded.data.length > 0) {
    return {
      ok: true,
      deduped: true,
      id_mensaje: Number(ded.data[0].id),
      sender: null
    };
  }
  const { data: msg, error } = await supabase.from("mensajes_enviados").insert({
    id_suscriptor: params.id_suscriptor,
    whatsapp_destino: params.whatsapp,
    tipo_mensaje: "premium",
    nombre_plantilla: null,
    estado: "pendiente",
    canal_envio: "whatsapp",
    id_contenido: params.id_contenido,
    fecha_creado: ts,
    intentos: 0,
    metadata: {
      origen: "post_confirmacion",
      tipo_contenido: params.tipo_contenido,
      variables: {
        cuerpo: params.cuerpo
      }
    }
  }).select("id").maybeSingle();
  if (error || !msg?.id) {
    return {
      ok: false,
      error: error?.message ?? "no_id_mensaje",
      id_mensaje: null
    };
  }
  const sender = await dispararSender(Number(msg.id));
  return {
    ok: true,
    deduped: false,
    id_mensaje: Number(msg.id),
    sender
  };
}
// ----------------------------------------------------------------------------
// Proceso 1 suscriptor (core)
// ----------------------------------------------------------------------------
async function procesarSuscriptor(id_suscriptor, opts) {
  const locked = await acquireLock(id_suscriptor);
  if (!locked) {
    await registrarLog("lock_no_adquirido", {
      id_suscriptor
    }, false);
    return {
      ok: false,
      id_suscriptor,
      error: "lock_no_adquirido"
    };
  }
  try {
    // 1) Cargar suscriptor y validar elegibilidad
    const { data: s, error: eS } = await supabase.from("suscriptores").select("id, nombre, whatsapp, premium_activo, whatsapp_confirmado, primer_envio_premium_enviado, fecha_confirmacion_whatsapp").eq("id", id_suscriptor).maybeSingle();
    if (eS || !s) {
      await registrarLog("suscriptor_no_encontrado", {
        id_suscriptor,
        error: eS?.message
      }, false);
      return {
        ok: false,
        id_suscriptor,
        error: "suscriptor_no_encontrado"
      };
    }
    if (s.premium_activo !== true || s.whatsapp_confirmado !== true || !s.whatsapp) {
      return {
        ok: true,
        id_suscriptor,
        skipped: true,
        reason: "no_elegible",
        detail: {
          premium_activo: s.premium_activo,
          whatsapp_confirmado: s.whatsapp_confirmado,
          whatsapp: !!s.whatsapp
        }
      };
    }
    if (s.primer_envio_premium_enviado === true && !opts.force) {
      return {
        ok: true,
        id_suscriptor,
        skipped: true,
        reason: "ya_marcado_primer_envio"
      };
    }
    // 2) Encolar+enviar "primer_mensaje_premium" (no bloquea el resto si falla)
    const primer = await encolarYEnviarPrimerMensaje({
      id_suscriptor,
      whatsapp: s.whatsapp,
      nombre: s.nombre ?? ""
    });
    await registrarLog("primer_mensaje_premium_result", {
      id_suscriptor,
      ok: primer.ok,
      id_mensaje: primer.ok ? primer.id_mensaje : null,
      error: primer.ok ? null : primer.error,
      sender: primer.ok ? {
        ok: primer.sender.ok,
        status: primer.sender.status
      } : null
    }, primer.ok);
    // 3) Generar contenido premium (diario/domingo)
    const gen = await generarContenidoPremiumParaSuscriptor({
      id_suscriptor
    });
    await registrarLog("generacion_contenido_result", {
      id_suscriptor,
      fn: gen.fnName,
      ok: gen.ok,
      status: gen.status,
      body: gen.body
    }, gen.ok);
    // 4) Obtener contenido de hoy
    const cp = await obtenerContenidoPremiumHoy({
      id_suscriptor
    });
    if (!cp.ok || !cp.data) {
      await registrarLog("no_pude_obtener_contenido_hoy", {
        id_suscriptor,
        error: cp.error
      }, false);
      return {
        ok: false,
        id_suscriptor,
        error: "no_pude_obtener_contenido_hoy"
      };
    }
    const tipo_contenido = String(cp.data.tipo ?? "").toLowerCase() === "domingo" ? "domingo" : "diario";
    const cuerpo = renderCuerpoPremium(cp.data.contenido);
    // 5) Encolar+enviar premium
    const prem = await encolarYEnviarPremium({
      id_suscriptor,
      whatsapp: s.whatsapp,
      id_contenido: Number(cp.data.id),
      tipo_contenido,
      cuerpo
    });
    await registrarLog("envio_premium_result", {
      id_suscriptor,
      id_contenido: cp.data.id,
      tipo_contenido,
      ok: prem.ok,
      deduped: prem.deduped ?? false,
      id_mensaje: prem.id_mensaje ?? null,
      sender: prem.sender ? {
        ok: prem.sender.ok,
        status: prem.sender.status
      } : null,
      error: prem.error ?? null
    }, prem.ok);
    // 6) Marcar primer envío SOLO si sender premium fue OK (si deduped, no lo forzamos)
    const senderOk = !!prem?.sender?.ok;
    if (prem.ok && senderOk) {
      await supabase.from("suscriptores").update({
        primer_envio_premium_enviado: true,
        fecha_primer_envio_premium: nowISO(),
        actualizado_en: nowISO()
      }).eq("id", id_suscriptor);
      await registrarLog("suscriptor_marcado_primer_envio_ok", {
        id_suscriptor
      }, true);
    } else {
      await registrarLog("suscriptor_no_marcado_primer_envio", {
        id_suscriptor,
        motivo: prem.ok ? "sender_premium_no_ok" : "encolado_premium_fallo"
      }, false);
    }
    return {
      ok: true,
      id_suscriptor,
      primer_mensaje: primer.ok ? {
        id_mensaje: primer.id_mensaje,
        sender_ok: primer.sender.ok
      } : {
        error: primer.error
      },
      premium: prem.ok ? {
        id_mensaje: prem.id_mensaje,
        sender_ok: prem.sender?.ok ?? null
      } : {
        error: prem.error
      }
    };
  } finally{
    await releaseLock(id_suscriptor);
  }
}
// ----------------------------------------------------------------------------
// Handler principal
// ----------------------------------------------------------------------------
serve(async (req)=>{
  // Solo POST (cron llama POST vacío)
  if (req.method !== "POST") {
    return new Response("OK", {
      status: 200
    });
  }
  const inicio = nowISO();
  let body = {};
  try {
    body = await req.json();
  } catch  {
    body = {}; // cron puede venir vacío/no json
  }
  const id_suscriptor = typeof body?.id_suscriptor === "number" ? body.id_suscriptor : null;
  const force = body?.force === true;
  await registrarLog("inicio", {
    inicio,
    sandbox: SANDBOX,
    modo: id_suscriptor ? "on_demand" : "cron",
    id_suscriptor,
    force
  });
  try {
    // ----------------------------------------------------------------------
    // MODO ON-DEMAND: procesa 1 y envía inmediato
    // ----------------------------------------------------------------------
    if (id_suscriptor) {
      const r = await procesarSuscriptor(id_suscriptor, {
        force
      });
      await registrarLog("fin_on_demand", {
        id_suscriptor,
        result: r
      }, r.ok);
      return new Response("OK", {
        status: 200
      });
    }
    // ----------------------------------------------------------------------
    // MODO CRON: elegibles >= 5 minutos desde confirmación
    // ----------------------------------------------------------------------
    const cincoMinAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: elegibles, error } = await supabase.from("suscriptores").select("id, fecha_confirmacion_whatsapp").eq("premium_activo", true).eq("whatsapp_confirmado", true).eq("primer_envio_premium_enviado", false).lte("fecha_confirmacion_whatsapp", cincoMinAtras);
    if (error) {
      await registrarLog("error_query_elegibles", {
        error: error.message
      }, false);
      return new Response("OK", {
        status: 200
      });
    }
    if (!elegibles || elegibles.length === 0) {
      await registrarLog("sin_elegibles", {
        criterio: ">=5min y no primer_envio"
      }, true);
      return new Response("OK", {
        status: 200
      });
    }
    const results = [];
    let okCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    for (const s of elegibles){
      const r = await procesarSuscriptor(Number(s.id), {
        force: false
      });
      results.push(r);
      if (r?.skipped) skippedCount++;
      else if (r?.ok) okCount++;
      else failCount++;
    }
    await registrarLog("fin_cron", {
      total: elegibles.length,
      ok: okCount,
      fail: failCount,
      skipped: skippedCount,
      ids: elegibles.map((x)=>x.id)
    }, true);
    return new Response("OK", {
      status: 200
    });
  } catch (e) {
    await registrarLog("fatal_exception", {
      error: String(e)
    }, false);
    return new Response("OK", {
      status: 200
    });
  }
});
