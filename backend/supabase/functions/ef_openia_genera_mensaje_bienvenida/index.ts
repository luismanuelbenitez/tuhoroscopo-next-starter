// ============================================================================
// === Edge Function: ef_openia_genera_mensaje_bienvenida =====================
// ============================================================================
// Rol:
//   - Recibe un { prompt } ya armado (desde la tabla `plantillas`).
//   - Llama a OpenAI para generar el MENSAJE DE BIENVENIDA PREMIUM.
//   - Valida que la respuesta sea JSON con 5 claves:
//       saludo_inicial, cuerpo_bienvenida,
//       instruccion_confirmacion, info_cancelacion, pie_cercania
//   - Sanea longitudes y espacios.
//   - Limita la cantidad total de emojis (máx. 3 en todo el mensaje).
//   - Registra logs en log_funciones (UTC).
//   - MODO_TEST: devuelve un JSON mock fijo, sin llamar a OpenAI.
//   - RETURN_FALLBACK_ON_ERROR: si hay error grave, devuelve contenido
//     fallback + campos extra de error, pero con status 200.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
// ============================================================================
// === CONFIG GENERAL =========================================================
// ============================================================================
// Modelo OpenAI (lo tomás del env; si no, mini)
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
// Temperatura, tokens, etc.
const OPENAI_TEMPERATURE = Number(Deno.env.get("OPENAI_TEMPERATURE") ?? 0.82);
const OPENAI_MAX_TOKENS = Number(Deno.env.get("OPENAI_MAX_TOKENS") ?? 550);
// Flags de modo
const MODO_TEST = (Deno.env.get("MODO_TEST") || "false").toLowerCase() === "true";
const RETURN_FALLBACK_ON_ERROR = (Deno.env.get("RETURN_FALLBACK_ON_ERROR") || "false").toLowerCase() === "true";
// Supabase (service role) para logs
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
// OpenAI API key
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
// Nombre lógico de la función para logs
const FUNCION = "ef_openia_genera_mensaje_bienvenida";
// ============================================================================
// === HELPERS COMUNES ========================================================
// ============================================================================
// Fecha/hora UTC (ISO) → para logs
function nowUTCISO() {
  return new Date().toISOString();
}
// ----------------------------------------------------------------------------
// Logging centralizado en log_funciones
// - Usa "exitoso" pero mantiene compat con esquemas previos.
// ----------------------------------------------------------------------------
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
    // Compatibilidad: si la columna "exitoso" no existe
    if (error) {
      delete row.exitoso;
      await supabase.from("log_funciones").insert([
        row
      ]);
    }
  } catch  {
  // Importante: no hacemos throw para no romper la EF por el log
  }
}
// ----------------------------------------------------------------------------
// Limpia fences ```json ... ``` si los hubiera
// ----------------------------------------------------------------------------
function stripCodeFences(s = "") {
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
// Intenta parsear JSON "medio sucio"
function tryParseJson(raw) {
  if (!raw) return null;
  const t = stripCodeFences(raw);
  // Intento directo
  try {
    return JSON.parse(t);
  } catch  {
  // noop
  }
  // Intento entre primeras/últimas llaves
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i !== -1 && j !== -1 && j > i) {
    try {
      return JSON.parse(t.slice(i, j + 1));
    } catch  {
    // noop
    }
  }
  return null;
}
// ----------------------------------------------------------------------------
// Sanitiza texto:
//   - Normaliza espacios.
//   - Recorta a longitud máxima.
//   - Si allowMultiline = true, conserva saltos de línea.
// ----------------------------------------------------------------------------
function sanitizeField(value, max, allowMultiline = false) {
  if (value == null) return "";
  let text = String(value);
  if (allowMultiline) {
    // Conserva \n, pero limpia espacios y saltos múltiples
    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } else {
    // Todo en una sola línea
    text = text.replace(/\s+/g, " ").trim();
  }
  if (text.length > max) {
    return text.slice(0, max);
  }
  return text;
}
// ----------------------------------------------------------------------------
// Límite global de emojis en todo el payload (para no spamear).
// - "keysOrder" define el orden en que se van procesando los campos.
// ----------------------------------------------------------------------------
function limitEmojisGlobal(payload, keysOrder, maxTotal = 3) {
  const emojiRegex = /\p{Extended_Pictographic}/u;
  let count = 0;
  const out = {
    ...payload
  };
  for (const key of keysOrder){
    const original = out[key];
    if (typeof original !== "string") continue;
    let buf = "";
    for (const ch of original){
      if (emojiRegex.test(ch)) {
        if (count < maxTotal) {
          buf += ch;
          count++;
        } else {
        // Ignoramos emojis extra
        }
      } else {
        buf += ch;
      }
    }
    out[key] = buf;
  }
  return out;
}
// ============================================================================
// === VALIDACIÓN / NORMALIZACIÓN DEL JSON DE BIENVENIDA =====================
// ============================================================================
// Claves requeridas
const REQUIRED_KEYS = [
  "saludo_inicial",
  "cuerpo_bienvenida",
  "instruccion_confirmacion",
  "info_cancelacion",
  "pie_cercania"
];
// Límites por campo (caracteres aprox.)
const FIELD_LIMITS = {
  saludo_inicial: 160,
  cuerpo_bienvenida: 600,
  instruccion_confirmacion: 240,
  info_cancelacion: 240,
  pie_cercania: 220
};
// Definimos cuáles pueden tener multilinea (por ahora ninguno → todos false)
const MULTILINE_FIELDS = {
  saludo_inicial: false,
  cuerpo_bienvenida: false,
  instruccion_confirmacion: false,
  info_cancelacion: false,
  pie_cercania: false
};
// Normaliza y valida el objeto devuelto por GPT
function validarYNormalizar(raw) {
  const out = {};
  const missing = [];
  for (const key of REQUIRED_KEYS){
    const rawVal = raw[key];
    const val = sanitizeField(rawVal, FIELD_LIMITS[key], MULTILINE_FIELDS[key]);
    if (!val) {
      // Si queda vacío después de sanear → faltante
      missing.push(key);
    } else {
      out[key] = val;
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      missing
    };
  }
  // Límite global de emojis: máx. 3 entre todos los campos
  const withLimitedEmojis = limitEmojisGlobal(out, REQUIRED_KEYS, 3);
  return {
    ok: true,
    data: withLimitedEmojis
  };
}
// ============================================================================
// === CONTENIDO FALLBACK =====================================================
// ============================================================================
// Si algo explota (OpenAI, parse, etc.) y RETURN_FALLBACK_ON_ERROR = true,
// devolvemos este contenido "seguro" y neutro.
function fallbackContenido() {
  return {
    saludo_inicial: "¡Hola! ✨ Gracias por sumarte a Tu Oráculo Premium.",
    cuerpo_bienvenida: "Desde hoy vas a recibir mensajes personalizados con tu horóscopo diario, número y color de la suerte y pequeñas pausas de bienestar para acompañarte de lunes a sábado, más un mensaje especial cada domingo para cerrar la semana con claridad y calma.",
    instruccion_confirmacion: "Para confirmar que este es realmente tu número y activar tu suscripción, respondé a este mensaje con cualquier palabra o emoji.",
    info_cancelacion: "Si en algún momento querés dejar de recibir el contenido, podés cancelar la suscripción desde tu cuenta de Mercado Pago.",
    pie_cercania: "Gracias por confiar en este espacio. Estoy para acompañarte día a día 💫"
  };
}
// ============================================================================
// === HANDLER PRINCIPAL ======================================================
// ============================================================================
serve(async (req)=>{
  // -------------------------------------------------------------------------
  // 1) Verificar que exista la API key
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
  // 2) Leer el body ({ prompt })
  // -------------------------------------------------------------------------
  let body = {};
  try {
    body = await req.json();
  } catch (error) {
    await registrarLog("JSON inválido", {
      error: String(error?.message || error)
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
    await registrarLog("Falta el campo prompt", body, false);
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
  // 3) MODO TEST → no llama a OpenAI, devuelve mock estable
  // -------------------------------------------------------------------------
  if (MODO_TEST) {
    const mock = fallbackContenido();
    await registrarLog("MODO TEST activo (bienvenida)", {
      prompt_preview: prompt.slice(0, 200)
    }, true);
    return new Response(JSON.stringify(mock), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  // -------------------------------------------------------------------------
  // 4) Llamado real a OpenAI
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
            content: "Respondé exclusivamente en JSON válido UTF-8, sin backticks, sin texto extra."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });
    // --- Error HTTP de OpenAI ---
    if (!res.ok) {
      const errorText = await res.text();
      await registrarLog("Error HTTP de OpenAI (bienvenida)", {
        status: res.status,
        errorText
      }, false);
      const payload = {
        error: "OpenAI no OK",
        status: res.status,
        detalle: errorText
      };
      return new Response(JSON.stringify(RETURN_FALLBACK_ON_ERROR ? {
        ...fallbackContenido(),
        error: true,
        detalle: payload
      } : payload), {
        status: RETURN_FALLBACK_ON_ERROR ? 200 : res.status || 502,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // -----------------------------------------------------------------------
    // 5) Parsear respuesta de OpenAI
    // -----------------------------------------------------------------------
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";
    const parsed = tryParseJson(raw);
    if (!parsed || typeof parsed !== "object") {
      await registrarLog("Respuesta OpenAI no JSON (bienvenida)", {
        raw: raw.slice(0, 500)
      }, false);
      const payload = {
        error: "Respuesta no es JSON válido",
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
    // 6) Validar y normalizar estructura
    // -----------------------------------------------------------------------
    const val = validarYNormalizar(parsed);
    if (!val.ok) {
      await registrarLog("JSON incompleto o inválido (bienvenida)", {
        missing: val.missing,
        parsed
      }, false);
      const payload = {
        error: "JSON incompleto",
        missing: val.missing
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
    // Ok → contenido generado correctamente
    await registrarLog("Mensaje de bienvenida generado", {
      keys: Object.keys(val.data)
    }, true);
    return new Response(JSON.stringify(val.data), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    // -----------------------------------------------------------------------
    // 7) Excepción general
    // -----------------------------------------------------------------------
    await registrarLog("Excepción en generación (bienvenida)", {
      error: String(error?.message || error)
    }, false);
    const payload = {
      error: "Excepción en generación",
      detalle: String(error?.message || error)
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
