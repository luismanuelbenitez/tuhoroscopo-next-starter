// ============================================================
// ef_tarot_generar_audio_resumen — narración en audio (OpenAI TTS)
// del "Resumen" de la lectura. Opcional, nunca bloquea la entrega.
//
// Dos modos:
//   - modo "produccion": { lectura_id } — usa la config guardada en
//     tarot_configuracion, lee resumen_lectura, sube el mp3 a Storage
//     y actualiza tarot_lecturas. Gateado por tts_activo (si está en
//     false, no hace nada). Disparado fire-and-forget desde
//     ef_tarot_generar_lectura, mismo patrón que ef_tarot_generar_pdf.
//   - modo "test": { texto, voz?, instrucciones?, modelo?, velocidad? }
//     — no toca la base de datos, devuelve el audio en base64. Usado
//     por el panel "Probar voz" en /admin/tarot/config.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const OPENAI_API_KEY            = Deno.env.get("OPENAI_API_KEY") ?? "";
const FN            = "ef_tarot_generar_audio_resumen";
const BUCKET_ASSETS = "tarot-assets";

const VOCES_VALIDAS = new Set([
  "alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse",
]);
const VOZ_DEFAULT = "nova";
const MODELO_DEFAULT = "gpt-4o-mini-tts";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function log(
  ordenId: string | null, evento: string,
  nivel: "debug" | "info" | "warning" | "error",
  mensaje: string, payload: unknown = {},
) {
  try {
    await supabase.from("tarot_logs").insert({
      orden_id: ordenId, evento, nivel, mensaje,
      payload: payload ?? {}, funcion_origen: FN,
    });
  } catch (e) { console.error("tarot_logs insert fallo:", e); }
}

function normalizarVoz(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  return VOCES_VALIDAS.has(s) ? s : VOZ_DEFAULT;
}

async function llamarOpenAiTts(params: {
  modelo: string; voz: string; texto: string; instrucciones?: string; velocidad?: number;
}): Promise<Uint8Array> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no está configurado");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.modelo,
      voice: params.voz,
      input: params.texto,
      instructions: params.instrucciones || undefined,
      speed: params.velocidad ?? undefined,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS ${res.status}: ${errText.slice(0, 300)}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}

// ── Modo producción ─────────────────────────────────────────
async function generarAudioProduccion(lecturaId: string) {
  const { data: cfgRows } = await supabase
    .from("tarot_configuracion")
    .select("clave, valor")
    .in("clave", ["tts_activo", "tts_modelo", "tts_voz", "tts_instrucciones", "tts_velocidad"])
    .eq("activo", true);

  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.clave] = r.valor;

  if (cfg.tts_activo !== "true") {
    await log(null, "audio_resumen_saltado", "debug", "tts_activo=false, no se genera audio", { lectura_id: lecturaId });
    return;
  }

  const { data: lectura } = await supabase
    .from("tarot_lecturas")
    .select("id, orden_id, resumen_lectura")
    .eq("id", lecturaId)
    .maybeSingle();

  if (!lectura?.resumen_lectura) {
    await log(lectura?.orden_id ?? null, "audio_resumen_sin_texto", "warning",
      "resumen_lectura vacío o lectura no encontrada", { lectura_id: lecturaId });
    return;
  }

  const ordenId = lectura.orden_id as string;
  const voz     = normalizarVoz(cfg.tts_voz);
  const modelo  = cfg.tts_modelo || MODELO_DEFAULT;
  const velocidad = cfg.tts_velocidad ? Number(cfg.tts_velocidad) : undefined;

  await supabase.from("tarot_lecturas")
    .update({ audio_resumen_estado: "generando" })
    .eq("id", lecturaId);

  try {
    const bytes = await llamarOpenAiTts({
      modelo, voz, texto: lectura.resumen_lectura,
      instrucciones: cfg.tts_instrucciones, velocidad,
    });

    const storagePath = `audio-resumen/${lecturaId}.mp3`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET_ASSETS)
      .upload(storagePath, bytes, { contentType: "audio/mpeg", upsert: true });

    if (uploadErr) throw new Error("Storage upload: " + uploadErr.message);

    await supabase.from("tarot_lecturas").update({
      audio_resumen_storage_path: storagePath,
      audio_resumen_estado:       "listo",
      audio_resumen_voz:          voz,
      audio_resumen_generado_at:  new Date().toISOString(),
      audio_resumen_error:        null,
    }).eq("id", lecturaId);

    await log(ordenId, "audio_resumen_generado", "info", "Audio del resumen generado", { lectura_id: lecturaId, voz, modelo });
  } catch (err) {
    const errMsg = String(err);
    await supabase.from("tarot_lecturas").update({
      audio_resumen_estado: "error",
      audio_resumen_error:  errMsg.substring(0, 500),
    }).eq("id", lecturaId);
    await log(ordenId, "audio_resumen_error", "warning",
      "Fallo al generar el audio del resumen (no bloquea la entrega)", { lectura_id: lecturaId, error: errMsg });
  }
}

// ── Router ────────────────────────────────────────────────────
serve(async (req) => {
  const key = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || key !== TAROT_INTERNAL_KEY) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON_INVALIDO" }, 400); }

  const modo = String(body.modo ?? "produccion");

  if (modo === "test") {
    const texto = String(body.texto ?? "").trim();
    if (!texto) return json({ ok: false, error: "TEXTO_REQUERIDO" }, 400);
    if (texto.length > 2000) return json({ ok: false, error: "TEXTO_DEMASIADO_LARGO" }, 400);

    try {
      const bytes = await llamarOpenAiTts({
        modelo:        body.modelo ? String(body.modelo) : MODELO_DEFAULT,
        voz:           normalizarVoz(body.voz),
        texto,
        instrucciones: body.instrucciones ? String(body.instrucciones) : undefined,
        velocidad:     body.velocidad !== undefined ? Number(body.velocidad) : undefined,
      });
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      const audio_base64 = btoa(binary);
      return json({ ok: true, audio_base64 });
    } catch (err) {
      return json({ ok: false, error: String(err) }, 502);
    }
  }

  if (modo !== "produccion") return json({ ok: false, error: "MODO_INVALIDO" }, 400);

  const lecturaId = String(body.lectura_id ?? "").trim();
  if (!lecturaId) return json({ ok: false, error: "LECTURA_ID_REQUERIDO" }, 400);

  // EdgeRuntime.waitUntil(): mismo patrón que ef_tarot_generar_pdf — se
  // responde rápido y el trabajo real (llamar a OpenAI, subir a Storage,
  // actualizar la fila) sigue corriendo después de la respuesta. Sin esto,
  // el runtime puede cortar la instancia antes de terminar.
  EdgeRuntime.waitUntil(
    generarAudioProduccion(lecturaId).catch((err) =>
      log(null, "audio_resumen_excepcion", "error", "Excepción no manejada", { lectura_id: lecturaId, error: String(err) })),
  );

  return json({ ok: true, aceptado: true });
});
