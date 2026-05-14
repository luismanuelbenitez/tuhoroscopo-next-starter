// ============================================================================
// === Edge Function: ef_openia_genera_contenido_premium (VERSIÓN PRO 4.0) ====
// ============================================================================
//
// Cambios clave respecto a versiones previas:
// - Se valida JSON estricto con 7 claves: 
//   saludo_inicial, horoscopo, frase_inspiradora, numero,
//   color, pausa, pie_de_pagina
//
// - Se agregan límites específicos por clave, ajustables.
// - Se preservan saltos de línea para "pausa".
// - Logging robusto con timestamp UTC.
// - MODO_TEST versión PRO devuelve JSON completo.
// - Fallback PRO COMPLETO para emergencias.
// - Sanitización PRO con respeto por el formato y longitudes establecidas.
//
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
// ============================================================================
// === CONFIGURACIÓN PRINCIPAL ===============================================
// ============================================================================
// OpenAI API KEY
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
// Modelo OpenAI a usar (puede ser gpt-4o, gpt-4.1, gpt-3.5, etc.)
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
// Parámetros finos del modelo
const OPENAI_TEMPERATURE = Number(Deno.env.get("OPENAI_TEMPERATURE") ?? 0.90);
const OPENAI_MAX_TOKENS = Number(Deno.env.get("OPENAI_MAX_TOKENS") ?? 1000);
// Modo test: cuando está en TRUE se evita llamar a OpenAI y se devuelve MOCK.
const MODO_TEST = (Deno.env.get("MODO_TEST") || "false").toLowerCase() === "true";
// Si este flag está en TRUE, ante error grave se devuelve contenido fallback.
// ✅ Versión interna de esta Edge Function (solo para trazabilidad)
const VERSION_FUN = "PRO 4.0";
const RETURN_FALLBACK_ON_ERROR = (Deno.env.get("RETURN_FALLBACK_ON_ERROR") || "false").toLowerCase() === "true";
// Cliente Supabase (service role)
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const FUNCION = "ef_openia_genera_contenido_premium";
// ============================================================================
// === HELPERS ================================================================
// ============================================================================
// Fecha UTC para logs
function nowUTCISO() {
  return new Date().toISOString();
}
// ---------------------------------------------------------------------------
// Registrar log en la tabla log_funciones
// Maneja compatibilidad con esquemas previos.
// ---------------------------------------------------------------------------
async function registrarLog(resultado, detalle = {}, exitoso = true) {
  try {
    const row = {
      nombre_funcion: FUNCION,
      resultado,
      detalle,
      exitoso,
      creado_por: "system",
      fecha_registro: nowUTCISO()
    };
    const { error } = await supabase.from("log_funciones").insert([
      row
    ]);
    // Si falla, intenta un modo compatible previo (sin "exitoso")
    if (error) {
      delete row.exitoso;
      await supabase.from("log_funciones").insert([
        row
      ]);
    }
  } catch  {
  // No se loguea para evitar loop
  }
}
// ---------------------------------------------------------------------------
// Quita fences ``` y trata de parsear JSON real
// ---------------------------------------------------------------------------
function stripCodeFences(s = "") {
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function tryParseJson(raw) {
  if (!raw) return null;
  const t = stripCodeFences(raw);
  // Intento directo
  try {
    return JSON.parse(t);
  } catch  {}
  // Intento entre llaves
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i !== -1 && j !== -1 && j > i) {
    try {
      return JSON.parse(t.slice(i, j + 1));
    } catch  {}
  }
  return null;
}
// ---------------------------------------------------------------------------
// Sanitizador PRO: respeta saltos de línea para pausa_cosmica.
// Otros campos normalizan espacios.
// max → longitud máxima permitida
// ---------------------------------------------------------------------------
function sanitizeField(value, max, allowMultiline = false) {
  if (!value) return "";
  let text = String(value);
  if (allowMultiline) {
    // Permite saltos de línea, compacta espacios pero no elimina "\n"
    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } else {
    // Normaliza todo en 1 línea
    text = text.replace(/\s+/g, " ").trim();
  }
  return text.length > max ? text.slice(0, max) : text;
}
// ---------------------------------------------------------------------------
// Validación y sanitización ESTRICTA del JSON generado por GPT
// ---------------------------------------------------------------------------
function sanitizeOutStrict(raw) {
  // Campos esperados y sus límites
  const spec = {
    saludo_inicial: {
      max: 85,
      multiline: false
    },
    horoscopo: {
      max: 390,
      multiline: false
    },
    contenido_preferido: {
      max: 180,
      multiline: false
    },
    numero: {
      max: 180,
      multiline: false
    },
    color: {
      max: 180,
      multiline: false
    },
    pausa: {
      max: 230,
      multiline: true
    },
    pie_de_pagina: {
      max: 120,
      multiline: false
    } // 110 + margen
  };
  const out = {};
  const missing = [];
  for(const key in spec){
    const rawValue = raw?.[key];
    if (!rawValue || String(rawValue).trim() === "") {
      missing.push(key);
      continue;
    }
    const { max, multiline } = spec[key];
    out[key] = sanitizeField(rawValue, max, multiline);
  }
  if (missing.length) {
    return {
      ok: false,
      missing,
      out
    };
  }
  return {
    ok: true,
    out
  };
}
// ---------------------------------------------------------------------------
// Contenido fallback PRO 4.0 (7 campos)
// Se usa cuando OpenAI falla y RETURN_FALLBACK_ON_ERROR es TRUE
// ---------------------------------------------------------------------------
function fallbackContenido() {
  return {
    saludo_inicial: "Buen día, {{nombre}} 🙂",
    horoscopo: "Hoy puede que arranques con varias cosas en la cabeza y cueste ordenar prioridades...",
    contenido_preferido: "En el área que hoy te importa, enfocarte en una sola decisión chica puede darte alivio.",
    numero: "7 — Te invita a frenar un momento y elegir una sola cosa para hacer con atención.",
    color: "Lavanda — Ayuda a bajar el ruido mental; usalo en algo que tengas cerca.",
    pausa: "Inhalá por la nariz 4 segundos.\nExhalá lento 6.\nRepetí tres veces.",
    pie_de_pagina: "Estoy acá acompañándote en el día 🤍"
  };
}
// ============================================================================
// === HANDLER PRINCIPAL ======================================================
// ============================================================================
serve(async (req)=>{
  // -------------------------------------------------------------------------
  // Verificación esencial: API Key
  // -------------------------------------------------------------------------
  if (!OPENAI_API_KEY) {
    await registrarLog("OPENAI_API_KEY faltante", {}, false);
    return new Response(JSON.stringify({
      error: "OPENAI_API_KEY no configurada"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // -------------------------------------------------------------------------
  // Lectura del JSON recibido
  // -------------------------------------------------------------------------
  let body = {};
  try {
    body = await req.json();
  } catch (error) {
    await registrarLog("JSON inválido", {
      error: String(error)
    }, false);
    return new Response(JSON.stringify({
      error: "JSON inválido"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    await registrarLog("Falta prompt", body, false);
    return new Response(JSON.stringify({
      error: "Falta el campo prompt"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // -------------------------------------------------------------------------
  // MODO TEST (sin llamar a OpenAI)
  // -------------------------------------------------------------------------
  if (MODO_TEST) {
    await registrarLog("MODO TEST activo", {
      preview: prompt.slice(0, 200)
    });
    const mock = fallbackContenido(); // versión completa PRO
    return new Response(JSON.stringify(mock), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // -------------------------------------------------------------------------
  // LLAMADO REAL A OPENAI
  // -------------------------------------------------------------------------
  try {
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
            content: "Respondé exclusivamente en JSON válido."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });
    // -----------------------------------------------------------------------
    // Error HTTP de OpenAI
    // -----------------------------------------------------------------------
    if (!res.ok) {
      const text = await res.text();
      await registrarLog("HTTP OpenAI error", {
        status: res.status,
        text
      }, false);
      const payload = {
        error: "OpenAI error",
        status: res.status,
        detalle: text
      };
      return new Response(JSON.stringify(RETURN_FALLBACK_ON_ERROR ? {
        ...fallbackContenido(),
        error: true,
        detalle: payload
      } : payload), {
        status: RETURN_FALLBACK_ON_ERROR ? 200 : res.status,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // -----------------------------------------------------------------------
    // Parseo respuesta OpenAI
    // -----------------------------------------------------------------------
    const data = await res.json();
    // ✅ META: capturamos parámetros y “usage” (tokens) si OpenAI lo devuelve
    // - Esto NO cambia el JSON de salida, solo sirve para log/auditoría
    const requestId = res.headers.get("x-request-id") || null;
    const meta = {
      provider: "openai",
      funcion: FUNCION,
      version: VERSION_FUN,
      // Parámetros reales de tu ejecución (ya los tenés en ENV / const)
      model: OPENAI_MODEL,
      temperature: OPENAI_TEMPERATURE,
      max_tokens: OPENAI_MAX_TOKENS,
      // Identificador útil para trazabilidad (si OpenAI lo entrega)
      request_id: requestId,
      // Tokens consumidos (si viene en la respuesta)
      usage: data?.usage ?? null,
      // Timestamp local de esta función
      generated_at: nowUTCISO()
    };
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";
    const parsed = tryParseJson(raw);
    if (!parsed) {
      await registrarLog("Respuesta no JSON", {
        raw: raw.slice(0, 500)
      }, false);
      const payload = {
        error: "No JSON válido",
        raw: raw.slice(0, 500)
      };
      return new Response(JSON.stringify(RETURN_FALLBACK_ON_ERROR ? {
        ...fallbackContenido(),
        error: true,
        detalle: payload
      } : payload), {
        status: RETURN_FALLBACK_ON_ERROR ? 200 : 422,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // -----------------------------------------------------------------------
    // Sanitización estricta
    // -----------------------------------------------------------------------
    const norm = sanitizeOutStrict(parsed);
    if (!norm.ok) {
      await registrarLog("JSON incompleto/Inválido", {
        missing: norm.missing,
        parsed
      }, false);
      const payload = {
        error: "JSON incompleto",
        missing: norm.missing
      };
      return new Response(JSON.stringify(RETURN_FALLBACK_ON_ERROR ? {
        ...fallbackContenido(),
        error: true,
        detalle: payload
      } : payload), {
        status: RETURN_FALLBACK_ON_ERROR ? 200 : 422,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // -----------------------------------------------------------------------
    // OK → contenido generado
    // -----------------------------------------------------------------------
    // ✅ Log enriquecido (NO rompe nada)
    await registrarLog("Contenido generado", {
      keys: Object.keys(norm.out),
      meta
    });
    // ✅ Header opcional con meta (NO cambia el body)
    return new Response(JSON.stringify(norm.out), {
      headers: {
        "Content-Type": "application/json",
        "x-openia-meta": JSON.stringify(meta)
      }
    });
  } catch (error) {
    // -----------------------------------------------------------------------
    // Excepción general en el proceso
    // -----------------------------------------------------------------------
    await registrarLog("Excepción general", {
      error: String(error)
    }, false);
    const payload = {
      error: "Excepción general",
      detalle: String(error)
    };
    return new Response(JSON.stringify(RETURN_FALLBACK_ON_ERROR ? {
      ...fallbackContenido(),
      error: true,
      detalle: payload
    } : payload), {
      status: RETURN_FALLBACK_ON_ERROR ? 200 : 502,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
