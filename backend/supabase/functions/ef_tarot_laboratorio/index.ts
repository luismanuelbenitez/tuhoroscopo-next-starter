// ============================================================
// ef_tarot_laboratorio — Sprint 4 v1
// Ejecuta generaciones de prueba desde el Laboratorio de la PIA.
// Recibe parámetros de la sesión de lab, llama a Anthropic via
// Supabase Secret, guarda opcionalmente en tarot_lecturas_laboratorio.
//
// REGLAS:
//   1. Solo acepta llamadas con x-internal-key válida.
//   2. No crea órdenes, no escribe en tarot_lecturas, no PDF, no WA.
//   3. ANTHROPIC_API_KEY se lee desde Deno.env (Supabase Secret).
//   4. Toda lógica de generación se importa de _shared/tarot-core.ts.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import {
  shuffle,
  interpolarTemplate,
  buildLecturaTool,
  renderCartasTexto,
  validateLectura,
  type WordLimits,
  type CartaParaPrompt,
  type LecturaIAOutput,
} from "../_shared/tarot-core.ts";

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY        = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const TAROT_INTERNAL_KEY       = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";

const PRECIO_INPUT_POR_MTOKEN  = 3.0;
const PRECIO_OUTPUT_POR_MTOKEN = 15.0;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // ── Auth ─────────────────────────────────────────────────────
  const internalKey = req.headers.get("x-internal-key") ?? "";
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return json({ ok: false, motivo: "unauthorized" }, 401);
  }

  if (!ANTHROPIC_API_KEY) {
    return json({ ok: false, motivo: "ANTHROPIC_API_KEY no configurada en Supabase Secrets" }, 500);
  }

  // ── Parsear body ─────────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return json({ ok: false, motivo: "json_invalido" }, 400);
  }

  const consultante = body.consultante as Record<string, string> | undefined;
  if (!consultante?.nombre || !consultante?.fecha_nacimiento || !consultante?.tema) {
    return json({ ok: false, motivo: "consultante_incompleto" }, 400);
  }
  // pregunta es opcional (lectura abierta vs orientada — docs/product/DECISIONS.md
  // 2026-08-16). El laboratorio necesita poder reproducir ambas modalidades,
  // igual que el pipeline real.

  const promptModo       = (body.prompt_modo as string) ?? "activo";
  const guardar          = body.guardar === true;
  const benchmarkCasoId  = body.benchmark_caso_id as string | undefined;
  const cartasInput      = body.cartas as CartaParaPrompt[] | undefined;

  // ── 1. Resolver prompt ───────────────────────────────────────
  let promptSistema      = "";
  let promptTemplate     = "";
  let promptVersionId: string | null = null;
  let promptVersionLabel = "Manual";
  let wordLimits: WordLimits = { interpretacion: 70, consejo: 25, resumen: 240, mensaje_final: 55, proximo_paso: 30 };
  let iaModelo           = (body.ia_modelo as string) ?? "claude-sonnet-4-6";
  let iaMaxTokens        = Number(body.ia_max_tokens ?? 4000);
  let iaTemperatura      = Number(body.ia_temperatura ?? 0.8);
  let tipoTiradaId: string | undefined;
  let tiradaNombre       = "Tirada de 5 Cartas";

  if (promptModo === "manual") {
    promptSistema  = String(body.prompt_sistema ?? "");
    promptTemplate = String(body.prompt_usuario_template ?? "");
    if (!promptSistema || !promptTemplate) {
      return json({ ok: false, motivo: "prompt_manual_incompleto" }, 400);
    }
  } else {
    // deno-lint-ignore no-explicit-any
    let cfgRow: Record<string, any> | null = null;

    if (promptModo === "historico" && body.prompt_version_id) {
      const { data } = await supabase
        .from("tarot_prompt_versiones")
        .select("id,label,prompt_sistema,prompt_usuario_template,ia_modelo,ia_max_tokens,ia_temperatura,max_words_interpretacion,max_words_consejo,max_words_resumen,max_words_mensaje_final,max_words_proximo_paso")
        .eq("id", String(body.prompt_version_id))
        .limit(1)
        .maybeSingle();
      if (data) {
        cfgRow = data;
        promptVersionId    = cfgRow.id as string;
        promptVersionLabel = cfgRow.label as string;
      }
    }

    if (!cfgRow) {
      const { data } = await supabase
        .from("tarot_producto_config")
        .select("id,current_prompt_version_id,prompt_sistema,prompt_usuario_template,ia_modelo,ia_max_tokens,ia_temperatura,max_words_interpretacion,max_words_consejo,max_words_resumen,max_words_mensaje_final,max_words_proximo_paso,tipo_tirada_id")
        .eq("activa", true)
        .limit(1)
        .maybeSingle();
      cfgRow = data;
      if (cfgRow?.current_prompt_version_id) promptVersionId = cfgRow.current_prompt_version_id as string;
      if (cfgRow?.tipo_tirada_id)            tipoTiradaId    = cfgRow.tipo_tirada_id as string;
      promptVersionLabel = "Versión activa";
    }

    if (!cfgRow) return json({ ok: false, motivo: "config_no_encontrada" }, 500);

    promptSistema  = cfgRow.prompt_sistema as string;
    promptTemplate = cfgRow.prompt_usuario_template as string;
    wordLimits = {
      interpretacion: Number(cfgRow.max_words_interpretacion ?? 70),
      consejo:        Number(cfgRow.max_words_consejo        ?? 25),
      resumen:        Number(cfgRow.max_words_resumen        ?? 240),
      mensaje_final:  Number(cfgRow.max_words_mensaje_final  ?? 100),
      proximo_paso:   Number(cfgRow.max_words_proximo_paso   ?? 30),
    };
    if (!body.ia_modelo     && cfgRow.ia_modelo)             iaModelo     = cfgRow.ia_modelo as string;
    if (!body.ia_max_tokens && cfgRow.ia_max_tokens)         iaMaxTokens  = Number(cfgRow.ia_max_tokens);
    if (!body.ia_temperatura && cfgRow.ia_temperatura != null) iaTemperatura = Number(cfgRow.ia_temperatura);
  }

  // ── 2. Nombre de la tirada ───────────────────────────────────
  if (tipoTiradaId) {
    const { data: tRow } = await supabase
      .from("tarot_tipos_tirada")
      .select("nombre")
      .eq("id", tipoTiradaId)
      .limit(1)
      .maybeSingle();
    if (tRow?.nombre) tiradaNombre = tRow.nombre as string;
  }

  // ── 3. Resolver cartas ───────────────────────────────────────
  let cartas: CartaParaPrompt[];

  if (Array.isArray(cartasInput) && cartasInput.length === 5) {
    cartas = cartasInput;
  } else {
    let posiciones: Array<{ numero: number; nombre: string; descripcion: string }> = [];
    if (tipoTiradaId) {
      const { data: pArr } = await supabase
        .from("tarot_posiciones_tirada")
        .select("numero,nombre,descripcion")
        .eq("tipo_tirada_id", tipoTiradaId)
        .order("numero")
        .limit(5);
      posiciones = (pArr ?? []) as typeof posiciones;
    }
    if (posiciones.length < 5) {
      posiciones = [
        { numero: 1, nombre: "El Pasado",   descripcion: "Lo que ha formado esta situación" },
        { numero: 2, nombre: "El Presente", descripcion: "El centro de la situación actual" },
        { numero: 3, nombre: "El Futuro",   descripcion: "Hacia dónde se dirige esta energía" },
        { numero: 4, nombre: "La Clave",    descripcion: "El factor decisivo que cambia todo" },
        { numero: 5, nombre: "El Consejo",  descripcion: "La guía final del Universo" },
      ];
    }

    const { data: mRow } = await supabase
      .from("tarot_mazos")
      .select("id")
      .eq("activo", true)
      .limit(1)
      .maybeSingle();
    if (!mRow?.id) return json({ ok: false, motivo: "mazo_activo_no_encontrado" }, 500);

    const { data: allCartas } = await supabase
      .from("tarot_cartas")
      .select("id,nombre_es,significado_normal,significado_invertido,keywords")
      .eq("mazo_id", mRow.id)
      .eq("activa", true)
      .limit(200);

    if (!Array.isArray(allCartas) || allCartas.length < 5) {
      return json({ ok: false, motivo: "cartas_insuficientes" }, 500);
    }

    const shuffled = shuffle(allCartas as Record<string, unknown>[]);
    cartas = shuffled.slice(0, 5).map((carta, i) => ({
      id:                   String(carta.id),
      nombre_es:            String(carta.nombre_es),
      significado_normal:   String(carta.significado_normal   ?? ""),
      significado_invertido: String(carta.significado_invertido ?? ""),
      keywords:             Array.isArray(carta.keywords) ? carta.keywords as string[] : [],
      invertida:            Math.random() < 0.25,
      posicion_numero:      posiciones[i].numero,
      posicion_nombre:      posiciones[i].nombre,
      posicion_descripcion: posiciones[i].descripcion,
    }));
  }

  // ── 4. Construir prompts ─────────────────────────────────────
  const preguntaFinal = consultante.pregunta?.trim() || null;
  const cartasTexto  = renderCartasTexto(cartas);
  const promptUsuario = interpolarTemplate(promptTemplate, {
    nombre:            consultante.nombre,
    fecha_nacimiento:  consultante.fecha_nacimiento,
    hora_nacimiento:   consultante.hora_nacimiento  ?? null,
    lugar_nacimiento:  consultante.lugar_nacimiento ?? null,
    tema:              consultante.tema,
    pregunta:          preguntaFinal,
    tipo_tirada:       tiradaNombre,
    cartas_texto:      cartasTexto,
    max_interpretacion: String(wordLimits.interpretacion),
    max_consejo:        String(wordLimits.consejo),
    max_resumen:        String(wordLimits.resumen),
    max_mensaje_final:  String(wordLimits.mensaje_final),
    max_proximo_paso:   String(wordLimits.proximo_paso),
  });
  const lecturaTool = buildLecturaTool(wordLimits);

  // ── 5. Llamar a Anthropic ────────────────────────────────────
  const t0 = Date.now();
  let anthropicData: Record<string, unknown>;
  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:       iaModelo,
        max_tokens:  iaMaxTokens,
        temperature: iaTemperatura,
        system:      promptSistema,
        tools:       [lecturaTool],
        tool_choice: { type: "tool", name: "entregar_lectura_tarot" },
        messages:    [{ role: "user", content: promptUsuario }],
      }),
    });

    if (!anthropicRes.ok) {
      const errData = await anthropicRes.json().catch(() => ({}));
      return json(
        { ok: false, motivo: `Anthropic API error ${anthropicRes.status}`, detalle: JSON.stringify(errData) },
        502,
      );
    }
    anthropicData = await anthropicRes.json();
  } catch (e: unknown) {
    return json(
      { ok: false, motivo: "anthropic_network_error", detalle: e instanceof Error ? e.message : String(e) },
      502,
    );
  }

  const tiempoMs      = Date.now() - t0;
  const usage         = anthropicData.usage as Record<string, number> | undefined;
  const tokensEntrada = usage?.input_tokens  ?? 0;
  const tokensSalida  = usage?.output_tokens ?? 0;
  const costoUsd      = (tokensEntrada / 1_000_000) * PRECIO_INPUT_POR_MTOKEN +
                        (tokensSalida  / 1_000_000) * PRECIO_OUTPUT_POR_MTOKEN;

  const content    = anthropicData.content as Array<{ type: string; input?: unknown }> | undefined;
  const toolBlock  = content?.find((b) => b.type === "tool_use");
  if (!toolBlock?.input) {
    return json({ ok: false, motivo: "respuesta_invalida_sin_tool_block", stop_reason: anthropicData.stop_reason ?? null }, 502);
  }

  // Mismo principio que ef_tarot_generar_lectura: validar en runtime ANTES
  // de castear. Un `as LecturaIAOutput` sin validación no es garantía real.
  const rawInput: unknown = toolBlock.input;
  const validacion = validateLectura(rawInput);
  if (!validacion.valida) {
    console.warn(`[ef_tarot_laboratorio] output_invalido: ${validacion.campo} — ${validacion.detalle}`);
    return json({
      ok: false,
      motivo: "output_invalido",
      campo: validacion.campo,
      detalle: validacion.detalle,
      stop_reason: anthropicData.stop_reason ?? null,
    }, 422);
  }
  const iaOutput = rawInput as LecturaIAOutput;

  const cartasOrdenadas = [...iaOutput.cartas].sort((a, b) => a.posicion - b.posicion);

  const contenidoJson = {
    producto:                   "Tu Tirada — Laboratorio",
    nombre:                     consultante.nombre,
    fecha_nacimiento:           consultante.fecha_nacimiento,
    fecha_lectura:              new Date().toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" }),
    tipo_tirada:                tiradaNombre,
    tema:                       consultante.tema,
    pregunta:                   preguntaFinal,
    descripcion_general_tirada: iaOutput.descripcion_general_tirada,
    cartas: cartas.map((carta, i) => ({
      posicion:        carta.posicion_numero,
      nombre_posicion: carta.posicion_nombre,
      carta_id:        carta.id,
      nombre_carta:    carta.nombre_es,
      orientacion:     carta.invertida ? "invertida" : "derecha",
      interpretacion:  cartasOrdenadas[i]?.interpretacion ?? "",
      consejo:         cartasOrdenadas[i]?.consejo         ?? "",
    })),
    resumen_lectura: iaOutput.resumen_lectura,
    mensaje_final:   iaOutput.mensaje_final,
    proximos_pasos:  iaOutput.proximos_pasos,
    disclaimer: iaOutput.disclaimer ||
      "Lectura simbólica generada con inteligencia artificial con fines reflexivos y de entretenimiento. No sustituye asesoramiento profesional.",
  };

  // ── 6. Guardar en laboratorio (si se solicitó) ───────────────
  let labId: string | null = null;
  if (guardar) {
    const { data: sData } = await supabase
      .from("tarot_lecturas_laboratorio")
      .insert({
        consultante_nombre:    consultante.nombre,
        consultante_fecha_nac: consultante.fecha_nacimiento,
        consultante_hora_nac:  consultante.hora_nacimiento  ?? null,
        consultante_lugar_nac: consultante.lugar_nacimiento ?? null,
        tema:                  consultante.tema,
        pregunta:              preguntaFinal,
        prompt_version_id:     promptVersionId ?? null,
        prompt_version_label:  promptVersionLabel,
        prompt_sistema:        promptSistema,
        prompt_usuario:        promptUsuario,
        prompt_modo:           promptModo,
        ia_modelo:             iaModelo,
        ia_temperatura:        iaTemperatura,
        ia_max_tokens:         iaMaxTokens,
        cartas_json:           cartas,
        cartas_modo:           Array.isArray(cartasInput) && cartasInput.length === 5 ? "manual" : "aleatorio",
        benchmark_caso_id:     benchmarkCasoId ?? null,
        contenido_json:        contenidoJson,
        ia_tokens_entrada:     tokensEntrada,
        ia_tokens_salida:      tokensSalida,
        ia_costo_usd:          costoUsd.toFixed(6),
        tiempo_ms:             tiempoMs,
        estado:                "completada",
      })
      .select("id")
      .maybeSingle();
    labId = sData?.id ?? null;
  }

  return json({
    ok:                   true,
    id:                   labId,
    cartas,
    contenido_json:       contenidoJson,
    prompt_version_id:    promptVersionId,
    prompt_version_label: promptVersionLabel,
    prompt_modo:          promptModo,
    ia_modelo:            iaModelo,
    ia_temperatura:       iaTemperatura,
    ia_max_tokens:        iaMaxTokens,
    ia_tokens_entrada:    tokensEntrada,
    ia_tokens_salida:     tokensSalida,
    ia_costo_usd:         costoUsd,
    tiempo_ms:            tiempoMs,
  });
});
