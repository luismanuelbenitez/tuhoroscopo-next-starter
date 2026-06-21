// ============================================================================
// EDGE FUNCTION: ef_openia_genera_contenido_premium_domingo
// ============================================================================
//
// MÓDULO:
//   Generación de Contenido Premium
//
// OBJETIVO:
//   Generar el contenido especial de domingo para Tu Horóscopo Cósmico,
//   devolviendo SIEMPRE un JSON válido con el nuevo contrato reducido.
//
// CONTRATO NUEVO DOMINGO:
//   {
//     "balance_semanal": "...",
//     "intencion_semana": "...",
//     "ritual_simple": "...",
//     "cierre_inspirador": "..."
//   }
//
// PLANTILLA WHATSAPP OBJETIVO:
//   🌙 Tu pausa de domingo
//
//   Hola {{1}}.
//
//   Balance
//   {{2}}
//
//   Intención para la semana que empieza
//   {{3}}
//
//   Ritual simple para hoy
//   {{4}}
//
//   Para cerrar
//   {{5}}
//
//   Estamos con vos.
//
// QUÉ HACE:
//   - Recibe un prompt armado por ef_genera_guarda_contenido_premium_domingo.
//   - Llama a OpenAI.
//   - Exige JSON válido.
//   - Valida las 4 claves obligatorias.
//   - Normaliza y recorta textos.
//   - Devuelve solo el JSON final limpio.
//
// QUÉ NO HACE:
//   - No guarda contenido.
//   - No consulta suscriptores.
//   - No encola mensajes.
//   - No envía WhatsApp.
//   - No toca Mercado Pago.
//
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
// ============================================================================
// CONFIGURACIÓN DE ENTORNO
// ============================================================================
const FUNCION = "ef_openia_genera_contenido_premium_domingo";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
const OPENAI_TEMPERATURE = Number(Deno.env.get("OPENAI_TEMPERATURE") ?? 0.82);
const OPENAI_MAX_TOKENS = Number(Deno.env.get("OPENAI_MAX_TOKENS") ?? 550);
const MODO_TEST = (Deno.env.get("MODO_TEST") || "false").toLowerCase() === "true";
const RETURN_FALLBACK_ON_ERROR = (Deno.env.get("RETURN_FALLBACK_ON_ERROR") || "false").toLowerCase() === "true";
// Cliente Supabase solo para logs.
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
// ============================================================================
// CONTRATO NUEVO DE CAMPOS DOMINGO
// ============================================================================
const REQUIRED_KEYS = [
  "balance_semanal",
  "intencion_semana",
  "ritual_simple",
  "cierre_inspirador"
];
// ============================================================================
// LÍMITES DE CARACTERES POR CAMPO
// ----------------------------------------------------------------------------
// Buscamos que el mensaje final completo quede cómodo dentro de WhatsApp,
// alrededor de 850–1050 caracteres totales, sin saturar.
//
// Estos límites son defensivos. El prompt también debe pedir brevedad.
// ============================================================================
const FIELD_LIMITS = {
  balance_semanal: 320,
  intencion_semana: 260,
  ritual_simple: 260,
  cierre_inspirador: 200
};
// ============================================================================
// HELPERS GENERALES
// ============================================================================
function nowUTCISO() {
  return new Date().toISOString();
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
function stripCodeFences(s = "") {
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function tryParseJson(raw) {
  if (!raw) return null;
  const text = stripCodeFences(raw);
  try {
    return JSON.parse(text);
  } catch  {
  // seguimos abajo
  }
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i !== -1 && j !== -1 && j > i) {
    try {
      return JSON.parse(text.slice(i, j + 1));
    } catch  {
    // seguimos
    }
  }
  return null;
}
function toStr(v) {
  return v == null ? "" : String(v).trim();
}
function clampText(v, max) {
  const s = toStr(v).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max).trim() : s;
}
// ============================================================================
// LOGGER
// ----------------------------------------------------------------------------
// Intenta primero con tu esquema actual:
//
//   fecha_ejecucion
//   exito
//
// Si falla, intenta con el esquema legacy:
//
//   fecha_registro
//   exitoso
//
// ============================================================================
async function registrarLog(resultado, detalle = {}, exito = true) {
  try {
    const rowActual = {
      nombre_funcion: FUNCION,
      fecha_ejecucion: nowUTCISO(),
      resultado,
      detalle,
      exito,
      creado_por: "system"
    };
    const { error } = await supabase.from("log_funciones").insert([
      rowActual
    ]);
    if (!error) return;
    const rowLegacy = {
      nombre_funcion: FUNCION,
      fecha_registro: nowUTCISO(),
      resultado,
      detalle,
      exitoso: exito,
      creado_por: "system"
    };
    await supabase.from("log_funciones").insert([
      rowLegacy
    ]);
  } catch  {
  // Nunca rompemos generación por error de logging.
  }
}
// ============================================================================
// FALLBACK DOMINGO
// ----------------------------------------------------------------------------
// Se usa solo si RETURN_FALLBACK_ON_ERROR = true.
// Devuelve el contrato nuevo de 4 campos.
// ============================================================================
function fallbackContenido() {
  return {
    balance_semanal: "Esta semana tuvo momentos de movimiento y también de cansancio. Hoy podés mirar lo vivido sin exigirte respuestas perfectas: algo aprendiste, algo soltaste y algo dentro tuyo siguió avanzando.",
    intencion_semana: "Entrar en la nueva semana con más calma, eligiendo una prioridad real antes de querer resolverlo todo.",
    ritual_simple: "Tomate cinco minutos sin pantalla. Respirá profundo, apoyá los pies en el piso y escribí una sola frase: “Esta semana necesito cuidar más…”.",
    cierre_inspirador: "No tenés que empezar la semana corriendo. A veces, ordenar tu energía también es una forma de avanzar."
  };
}
// ============================================================================
// VALIDAR Y NORMALIZAR JSON
// ----------------------------------------------------------------------------
// Reglas:
//   - El payload debe ser objeto.
//   - Debe tener las 4 claves nuevas.
//   - Cada clave debe tener texto.
//   - Se recorta cada campo al límite definido.
//   - Se ignoran claves extra.
// ============================================================================
function validarYNormalizar(raw) {
  const missing = [];
  const invalidas = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      missing: [
        ...REQUIRED_KEYS
      ],
      invalidas: [
        "payload_no_es_objeto"
      ]
    };
  }
  const obj = raw;
  const out = {};
  for (const key of REQUIRED_KEYS){
    if (!(key in obj)) {
      missing.push(key);
      continue;
    }
    const value = clampText(obj[key], FIELD_LIMITS[key]);
    if (!value) {
      invalidas.push(key);
      continue;
    }
    out[key] = value;
  }
  if (missing.length || invalidas.length) {
    return {
      ok: false,
      missing,
      invalidas
    };
  }
  return {
    ok: true,
    data: out
  };
}
// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
serve(async (req)=>{
  const tsInicio = nowUTCISO();
  // ==========================================================================
  // 1) Método
  // ==========================================================================
  if (req.method !== "POST") {
    return jsonResponse({
      error: "Método no permitido. Usar POST."
    }, 405);
  }
  // ==========================================================================
  // 2) Validar OPENAI_API_KEY
  // ==========================================================================
  if (!OPENAI_API_KEY) {
    await registrarLog("OPENAI_API_KEY faltante", {
      ts_inicio: tsInicio
    }, false);
    return jsonResponse({
      error: "OPENAI_API_KEY no configurada"
    }, 500);
  }
  // ==========================================================================
  // 3) Leer body
  // ==========================================================================
  let body = {};
  try {
    body = await req.json();
  } catch (error) {
    await registrarLog("JSON inválido", {
      error: String(error)
    }, false);
    return jsonResponse({
      error: "JSON inválido"
    }, 400);
  }
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};
  if (!prompt) {
    await registrarLog("Falta el campo prompt", {
      body_keys: Object.keys(body ?? {}),
      meta
    }, false);
    return jsonResponse({
      error: "Falta el campo prompt"
    }, 400);
  }
  // ==========================================================================
  // 4) MODO TEST
  // ==========================================================================
  if (MODO_TEST) {
    const mock = fallbackContenido();
    await registrarLog("MODO_TEST contenido domingo", {
      prompt_preview: prompt.slice(0, 300),
      meta,
      keys: Object.keys(mock)
    }, true);
    return jsonResponse(mock, 200);
  }
  // ==========================================================================
  // 5) Llamado a OpenAI
  // ==========================================================================
  try {
    const systemPrompt = [
      "Respondé exclusivamente en JSON válido UTF-8.",
      "No uses backticks.",
      "No agregues comentarios.",
      "No agregues texto fuera del JSON.",
      "Usá exactamente estas claves obligatorias:",
      "balance_semanal, intencion_semana, ritual_simple, cierre_inspirador.",
      "",
      "Reglas de estilo:",
      "- Español rioplatense neutro, cálido y natural.",
      "- Tono de bienestar cotidiano, no místico exagerado.",
      "- Domingo debe sentirse como pausa, cierre y preparación emocional.",
      "- No uses astrología clásica pesada.",
      "- No uses promesas absolutas.",
      "- No uses lenguaje médico.",
      "- No uses frases grandilocuentes.",
      "- Máximo 1 emoji en total si aparece, preferentemente ninguno.",
      "- Textos breves, humanos y accionables.",
      "",
      "Límites orientativos:",
      "- balance_semanal: 220 a 300 caracteres.",
      "- intencion_semana: 160 a 240 caracteres.",
      "- ritual_simple: 160 a 240 caracteres.",
      "- cierre_inspirador: 100 a 180 caracteres."
    ].join("\n");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: OPENAI_TEMPERATURE,
        max_tokens: OPENAI_MAX_TOKENS,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });
    // =========================================================================
    // 5.A) Error HTTP OpenAI
    // =========================================================================
    if (!res.ok) {
      const errorText = await res.text();
      await registrarLog("Error HTTP de OpenAI", {
        status: res.status,
        error_text: errorText.slice(0, 1000),
        model: OPENAI_MODEL,
        meta
      }, false);
      const payload = {
        error: "OpenAI no OK",
        status: res.status,
        detalle: errorText
      };
      if (RETURN_FALLBACK_ON_ERROR) {
        return jsonResponse({
          ...fallbackContenido(),
          error: true,
          fallback: true,
          detalle: payload
        }, 200);
      }
      return jsonResponse(payload, res.status || 502);
    }
    // =========================================================================
    // 5.B) Parsear respuesta OpenAI
    // =========================================================================
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";
    const parsed = tryParseJson(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      await registrarLog("Respuesta OpenAI no JSON", {
        raw: raw.slice(0, 800),
        model: OPENAI_MODEL,
        meta
      }, false);
      const payload = {
        error: "Respuesta no es JSON válido",
        raw: raw.slice(0, 800)
      };
      if (RETURN_FALLBACK_ON_ERROR) {
        return jsonResponse({
          ...fallbackContenido(),
          error: true,
          fallback: true,
          detalle: payload
        }, 200);
      }
      return jsonResponse(payload, 422);
    }
    // =========================================================================
    // 5.C) Validar contrato nuevo
    // =========================================================================
    const val = validarYNormalizar(parsed);
    if (!val.ok) {
      await registrarLog("JSON domingo incompleto o inválido", {
        missing: val.missing,
        invalidas: val.invalidas,
        parsed,
        model: OPENAI_MODEL,
        meta
      }, false);
      const payload = {
        error: "JSON domingo incompleto o inválido",
        missing: val.missing,
        invalidas: val.invalidas
      };
      if (RETURN_FALLBACK_ON_ERROR) {
        return jsonResponse({
          ...fallbackContenido(),
          error: true,
          fallback: true,
          detalle: payload
        }, 200);
      }
      return jsonResponse(payload, 422);
    }
    // =========================================================================
    // 5.D) Éxito
    // =========================================================================
    const requestId = res.headers.get("x-request-id") || null;
    const openiaMeta = {
      provider: "openai",
      funcion: FUNCION,
      model: OPENAI_MODEL,
      temperature: OPENAI_TEMPERATURE,
      max_tokens: OPENAI_MAX_TOKENS,
      request_id: requestId,
      usage: data?.usage ?? null,
      generated_at: nowUTCISO(),
    };
    await registrarLog("Contenido domingo generado correctamente", {
      keys: Object.keys(val.data),
      model: OPENAI_MODEL,
      usage: data?.usage ?? null,
      meta
    }, true);
    return new Response(JSON.stringify(val.data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "x-openia-meta": JSON.stringify(openiaMeta),
      },
    });
  } catch (error) {
    // =========================================================================
    // 6) Excepción general
    // =========================================================================
    const detalle = String(error?.message || error);
    await registrarLog("Excepción en generación domingo", {
      error: detalle,
      model: OPENAI_MODEL,
      meta
    }, false);
    const payload = {
      error: "Excepción en generación domingo",
      detalle
    };
    if (RETURN_FALLBACK_ON_ERROR) {
      return jsonResponse({
        ...fallbackContenido(),
        error: true,
        fallback: true,
        detalle: payload
      }, 200);
    }
    return jsonResponse(payload, 502);
  }
});
