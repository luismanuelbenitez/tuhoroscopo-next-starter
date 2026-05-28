// ============================================================
// ef_tarot_generar_lectura — Sprint 3 v3
// Recibe { orden_id } desde ef_tarot_webhook_mp tras pago aprobado.
// Selecciona 5 cartas al azar, llama a Claude via Anthropic API
// con tool_use para garantizar JSON estructurado, valida, guarda
// en tarot_lecturas + tarot_lecturas_cartas y dispara el PDF.
//
// REGLAS CRÍTICAS:
//   1. Solo procesa órdenes en estado "pago_confirmado" o "error_lectura".
//   2. Idempotente: si ya hay lectura completada, ignorar.
//   3. Registra cada intento en tarot_lecturas con numero_intento.
//   4. Si agota max_reintentos → error_critico (requiere intervención).
//   5. No toca tablas del SaaS THC.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FN = "ef_tarot_generar_lectura";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Costo aproximado por millón de tokens (claude-sonnet-4-6, mayo 2026)
const PRECIO_INPUT_POR_MTOKEN = 3.0;
const PRECIO_OUTPUT_POR_MTOKEN = 15.0;

// Estados que indican que la lectura ya está completa — no procesar
const ESTADOS_YA_COMPLETOS = new Set([
  "lectura_lista",
  "generando_pdf",
  "pdf_listo",
  "enviando_whatsapp",
  "entregado",
]);

// Estados desde los cuales se puede (re)intentar generar lectura
const ESTADOS_REINTENTABLES = new Set([
  "pago_confirmado",
  "error_lectura",
]);

// ── Logging ──────────────────────────────────────────────────

async function registrarLog(
  ordenId: string | null,
  evento: string,
  nivel: "debug" | "info" | "warning" | "error" | "critical",
  mensaje: string,
  payload: unknown = {},
  duracion_ms?: number,
) {
  try {
    await supabase.from("tarot_logs").insert({
      orden_id: ordenId,
      evento,
      nivel,
      mensaje,
      payload: payload ?? {},
      funcion_origen: FN,
      duracion_ms: duracion_ms ?? null,
    });
  } catch (e) {
    console.error("tarot_logs insert falló:", e);
  }
}

// ── Fisher-Yates shuffle ─────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Tool schema para Anthropic (garantiza JSON estructurado) ──

const LECTURA_TOOL = {
  name: "entregar_lectura_tarot",
  description: "Entrega la lectura de tarot personalizada en formato estructurado.",
  input_schema: {
    type: "object",
    properties: {
      descripcion_general_tirada: {
        type: "string",
        description: "Descripción introductoria de la tirada completa. Presentá el contexto general antes de entrar carta por carta. 2 a 3 oraciones que enmarquen la energía global de la consulta.",
      },
      cartas: {
        type: "array",
        description: "Interpretación de cada una de las 5 cartas en su posición",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            posicion: { type: "integer", description: "Número de posición (1 a 5)" },
            interpretacion: {
              type: "string",
              description: "Interpretación profunda y personal de esta carta en esta posición. Mínimo 3 oraciones. Conectá la carta con el tema/pregunta del consultante.",
            },
            consejo: {
              type: "string",
              description: "Consejo accionable y empático basado en esta carta. 1 a 2 oraciones directas.",
            },
          },
          required: ["posicion", "interpretacion", "consejo"],
        },
      },
      resumen_lectura: {
        type: "string",
        description: "Síntesis de la tirada completa. Cómo las 5 cartas dialogan entre sí. 3 a 4 oraciones.",
      },
      mensaje_final: {
        type: "string",
        description: "Mensaje final cálido y motivador para el consultante. 2 a 3 oraciones.",
      },
      proximos_pasos: {
        type: "array",
        description: "2 a 4 acciones concretas o reflexiones para los próximos días",
        minItems: 2,
        maxItems: 4,
        items: { type: "string" },
      },
      disclaimer: {
        type: "string",
        description: "Nota al pie de carácter legal/espiritual. Usar el texto estándar.",
      },
    },
    required: ["descripcion_general_tirada", "cartas", "resumen_lectura", "mensaje_final", "proximos_pasos", "disclaimer"],
  },
};

// ── Construcción de prompts ──────────────────────────────────

function buildSystemPrompt(): string {
  return `Sos un tarotista experto con décadas de experiencia en el sistema Rider-Waite-Smith.
Tu estilo es cálido, empático, profundo y esperanzador — nunca alarmista ni fatalista.
Usás el voseo rioplatense (vos, tu, tus) de forma natural y cercana.
Tus lecturas son profundamente personalizadas: conectás cada carta con la situación real del consultante.
Cuando una carta aparece invertida, su energía es más interna, bloqueada o en proceso de transformación — nunca "mala".
Sos honesto pero siempre constructivo: si hay un desafío, también señalás el camino.
El disclaimer estándar que siempre usás es: "Lectura simbólica generada con inteligencia artificial con fines reflexivos y de entretenimiento. No sustituye asesoramiento profesional."`;
}

function buildUserPrompt(
  cliente: { nombre_completo: string; fecha_nacimiento: string; hora_nacimiento?: string | null; lugar_nacimiento?: string | null },
  orden: { pregunta_usuario?: string | null; tema: string },
  cartasConPosicion: Array<{
    nombre_es: string;
    invertida: boolean;
    significado_normal: string;
    significado_invertido: string;
    keywords: string[];
    posicion: { numero: number; nombre: string; descripcion: string };
  }>,
): string {
  const datosCliente = [
    `Nombre: ${cliente.nombre_completo}`,
    `Fecha de nacimiento: ${cliente.fecha_nacimiento}`,
    cliente.hora_nacimiento ? `Hora de nacimiento: ${cliente.hora_nacimiento}` : null,
    cliente.lugar_nacimiento ? `Lugar de nacimiento: ${cliente.lugar_nacimiento}` : null,
  ].filter(Boolean).join("\n");

  const pregunta = orden.pregunta_usuario?.trim() || "Claridad sobre mi momento actual";
  const tema = orden.tema;

  const cartasTexto = cartasConPosicion.map((c) => {
    const orientacion = c.invertida ? "INVERTIDA" : "derecha";
    const significado = c.invertida ? c.significado_invertido : c.significado_normal;
    const keywords = c.keywords?.join(", ") ?? "";
    return `  Posición ${c.posicion.numero}: "${c.posicion.nombre}"
    - Carta: ${c.nombre_es} (${orientacion})
    - Qué representa esta posición: ${c.posicion.descripcion}
    - Significado de la carta: ${significado}
    - Keywords: ${keywords}`;
  }).join("\n\n");

  return `Realizá una lectura de tarot personalizada para el siguiente consultante:

DATOS DEL CONSULTANTE:
${datosCliente}

PREGUNTA / INTENCIÓN:
"${pregunta}"

TEMA PRINCIPAL: ${tema}

TIRADA: Tirada Cósmica de 5 Cartas

CARTAS QUE SALIERON:
${cartasTexto}

INSTRUCCIONES:
- Comenzá con una descripción general de la tirada (campo descripcion_general_tirada) que enmarque la energía global.
- Interpretá cada carta en el contexto de su posición Y de la pregunta/tema del consultante.
- Usá el voseo rioplatense de forma natural.
- Sé específico: mencioná detalles del consultante (nombre, tema) en la interpretación.
- Las cartas invertidas no son "malas" — representan energías internas o en proceso.
- El resumen final debe integrar cómo las 5 cartas cuentan una historia coherente.
- Incluí el disclaimer estándar en el campo correspondiente.`;
}

// ── Procesamiento principal ──────────────────────────────────

async function generarLectura(ordenId: string): Promise<void> {
  const t0 = Date.now();

  if (!ANTHROPIC_API_KEY) {
    await registrarLog(ordenId, "anthropic_token_faltante", "critical",
      "ANTHROPIC_API_KEY no está configurado");
    await supabase.from("tarot_ordenes")
      .update({ estado: "error_critico", updated_at: new Date().toISOString() })
      .eq("id", ordenId);
    return;
  }

  // 1. Fetch orden
  const { data: orden, error: errOrden } = await supabase
    .from("tarot_ordenes")
    .select("id, estado, cliente_id, tipo_tirada_id, mazo_id, pregunta_usuario, tema")
    .eq("id", ordenId)
    .maybeSingle();

  if (errOrden || !orden?.id) {
    await registrarLog(ordenId, "orden_no_encontrada", "error",
      "Orden no encontrada", { error: errOrden?.message });
    return;
  }

  // 2. Idempotencia
  if (ESTADOS_YA_COMPLETOS.has(orden.estado)) {
    await registrarLog(ordenId, "lectura_ya_completada", "info",
      "Lectura ya generada — webhook duplicado ignorado", { estado: orden.estado });
    return;
  }

  if (!ESTADOS_REINTENTABLES.has(orden.estado)) {
    await registrarLog(ordenId, "estado_invalido_para_lectura", "warning",
      `Estado '${orden.estado}' no permite generar lectura`, { estado: orden.estado });
    return;
  }

  // 3. Contar intentos previos
  const { count: intentosPrevios } = await supabase
    .from("tarot_lecturas")
    .select("*", { count: "exact", head: true })
    .eq("orden_id", ordenId);

  // 4. Leer configuración IA
  const { data: configRows } = await supabase
    .from("tarot_configuracion")
    .select("clave, valor")
    .in("clave", ["ia_modelo", "ia_max_tokens", "ia_temperatura", "max_reintentos_lectura"])
    .eq("activo", true);

  const cfg: Record<string, string> = {};
  for (const row of configRows ?? []) cfg[row.clave] = row.valor;

  const iaModelo = cfg.ia_modelo || "claude-sonnet-4-6";
  const iaMaxTokens = Number(cfg.ia_max_tokens) || 4000;
  const iaTemperatura = Number(cfg.ia_temperatura) || 0.8;
  const maxReintentos = Number(cfg.max_reintentos_lectura) || 3;
  const numeroIntento = (intentosPrevios ?? 0) + 1;

  if (numeroIntento > maxReintentos) {
    await registrarLog(ordenId, "lectura_max_reintentos_alcanzado", "critical",
      "Se agotaron los reintentos de generación IA. Intervención manual requerida.",
      { intentos_previos: intentosPrevios, max: maxReintentos });
    await supabase.from("tarot_ordenes")
      .update({ estado: "error_critico", updated_at: new Date().toISOString() })
      .eq("id", ordenId);
    return;
  }

  // 5. Fetch cliente
  const { data: cliente } = await supabase
    .from("tarot_clientes")
    .select("nombre_completo, fecha_nacimiento, hora_nacimiento, lugar_nacimiento")
    .eq("id", orden.cliente_id)
    .maybeSingle();

  if (!cliente) {
    await registrarLog(ordenId, "cliente_no_encontrado", "error",
      "Cliente no encontrado para la orden");
    return;
  }

  // 6. Fetch posiciones de la tirada (ordenadas por numero)
  const { data: posiciones } = await supabase
    .from("tarot_posiciones_tirada")
    .select("id, numero, nombre, descripcion")
    .eq("tipo_tirada_id", orden.tipo_tirada_id)
    .order("numero");

  if (!posiciones || posiciones.length < 5) {
    await registrarLog(ordenId, "posiciones_insuficientes", "critical",
      "La tirada no tiene 5 posiciones configuradas");
    return;
  }

  // 7. Selección aleatoria de 5 cartas (sin repetición, con chance de invertida)
  const { data: todasLasCartas } = await supabase
    .from("tarot_cartas")
    .select("id, nombre_es, arcano, palo, significado_normal, significado_invertido, keywords")
    .eq("mazo_id", orden.mazo_id)
    .eq("activa", true);

  if (!todasLasCartas || todasLasCartas.length < 5) {
    await registrarLog(ordenId, "cartas_insuficientes", "critical",
      "El mazo no tiene suficientes cartas activas", { total: todasLasCartas?.length ?? 0 });
    return;
  }

  const barajadas = shuffle(todasLasCartas);
  const cartasSeleccionadas = barajadas.slice(0, 5).map((carta, i) => ({
    ...carta,
    invertida: Math.random() < 0.25, // 25% probabilidad de carta invertida
    posicion: posiciones[i],
  }));

  // 8. Marcar lecturas anteriores como no vigentes y crear nuevo registro
  const ahora = new Date().toISOString();

  await supabase.from("tarot_lecturas")
    .update({ es_vigente: false, updated_at: ahora })
    .eq("orden_id", ordenId);

  await supabase.from("tarot_ordenes")
    .update({ estado: "generando_lectura", updated_at: ahora })
    .eq("id", ordenId);

  const promptSistema = buildSystemPrompt();
  const promptUsuario = buildUserPrompt(cliente, orden, cartasSeleccionadas);

  const { data: lecturaRow, error: errLectura } = await supabase
    .from("tarot_lecturas")
    .insert({
      orden_id: ordenId,
      estado: "generando",
      numero_intento: numeroIntento,
      es_vigente: false, // se pone true solo al completar con éxito
      ia_modelo: iaModelo,
    })
    .select("id")
    .single();

  if (errLectura || !lecturaRow?.id) {
    await registrarLog(ordenId, "lectura_insert_error", "error",
      "No se pudo crear el registro de lectura", { error: errLectura?.message });
    return;
  }

  const lecturaId = lecturaRow.id;

  await registrarLog(ordenId, "lectura_iniciada", "info",
    `Iniciando generación de lectura (intento ${numeroIntento}/${maxReintentos})`,
    { lectura_id: lecturaId, modelo: iaModelo, cartas: cartasSeleccionadas.map((c) => ({ nombre: c.nombre_es, invertida: c.invertida })) });

  // 9. Llamada a Anthropic API
  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: iaModelo,
        max_tokens: iaMaxTokens,
        temperature: iaTemperatura,
        system: promptSistema,
        tools: [LECTURA_TOOL],
        tool_choice: { type: "tool", name: "entregar_lectura_tarot" },
        messages: [{ role: "user", content: promptUsuario }],
      }),
    });

    if (!anthropicRes.ok) {
      const errData = await anthropicRes.json().catch(() => ({}));
      throw new Error(`Anthropic API ${anthropicRes.status}: ${JSON.stringify(errData)}`);
    }

    const anthropicData = await anthropicRes.json();

    // Tokens y costo
    const tokensEntrada = anthropicData.usage?.input_tokens ?? 0;
    const tokensSalida = anthropicData.usage?.output_tokens ?? 0;
    const costoUsd = Number(
      ((tokensEntrada / 1_000_000) * PRECIO_INPUT_POR_MTOKEN +
       (tokensSalida / 1_000_000) * PRECIO_OUTPUT_POR_MTOKEN).toFixed(6)
    );

    // Extraer respuesta del tool_use block
    const toolBlock = (anthropicData.content ?? [])
      .find((b: { type: string }) => b.type === "tool_use");

    if (!toolBlock?.input) {
      throw new Error("Anthropic no devolvió un tool_use block válido");
    }

    const iaOutput = toolBlock.input as {
      descripcion_general_tirada: string;
      cartas: Array<{ posicion: number; interpretacion: string; consejo: string }>;
      resumen_lectura: string;
      mensaje_final: string;
      proximos_pasos: string[];
      disclaimer: string;
    };

    // Validación básica del schema
    if (!Array.isArray(iaOutput.cartas) || iaOutput.cartas.length !== 5) {
      throw new Error(`Schema inválido: se esperaban 5 cartas, llegaron ${iaOutput.cartas?.length ?? 0}`);
    }
    if (!iaOutput.descripcion_general_tirada || !iaOutput.resumen_lectura || !iaOutput.mensaje_final || !Array.isArray(iaOutput.proximos_pasos)) {
      throw new Error("Schema inválido: faltan campos obligatorios en la respuesta IA");
    }

    // Ordenar la respuesta de la IA por número de posición (por si viene desordenada)
    const cartasIA = [...iaOutput.cartas].sort((a, b) => a.posicion - b.posicion);

    // 10. Construir contenido_json final (combina datos BD + texto IA)
    const fechaLectura = new Date().toLocaleDateString("es-UY", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });

    const contenidoJson = {
      producto: "Tu Tirada Cósmica",
      nombre: cliente.nombre_completo,
      fecha_nacimiento: cliente.fecha_nacimiento,
      fecha_lectura: fechaLectura,
      tipo_tirada: "Tirada Cósmica de 5 Cartas",
      tema: orden.tema,
      pregunta: orden.pregunta_usuario?.trim() || "Claridad sobre mi momento actual",
      descripcion_general_tirada: iaOutput.descripcion_general_tirada,
      cartas: cartasSeleccionadas.map((carta, i) => ({
        posicion: carta.posicion.numero,
        nombre_posicion: carta.posicion.nombre,
        carta_id: carta.id,
        nombre_carta: carta.nombre_es,
        orientacion: carta.invertida ? "invertida" : "derecha",
        interpretacion: cartasIA[i]?.interpretacion ?? "",
        consejo: cartasIA[i]?.consejo ?? "",
      })),
      resumen_lectura: iaOutput.resumen_lectura,
      mensaje_final: iaOutput.mensaje_final,
      proximos_pasos: iaOutput.proximos_pasos,
      disclaimer: iaOutput.disclaimer ||
        "Lectura simbólica generada con inteligencia artificial con fines reflexivos y de entretenimiento. No sustituye asesoramiento profesional.",
    };

    const ahoraNow = new Date().toISOString();

    // 11. Actualizar lectura como completada
    await supabase.from("tarot_lecturas").update({
      estado: "completada",
      es_vigente: true,
      prompt_sistema: promptSistema,
      prompt_usuario: promptUsuario,
      ia_tokens_entrada: tokensEntrada,
      ia_tokens_salida: tokensSalida,
      ia_costo_usd: costoUsd,
      contenido_json: contenidoJson,
      resumen_lectura: contenidoJson.resumen_lectura,
      mensaje_final: contenidoJson.mensaje_final,
      generado_at: ahoraNow,
      updated_at: ahoraNow,
    }).eq("id", lecturaId);

    // 12. Insertar tarot_lecturas_cartas (descomposición relacional)
    const registrosCartas = cartasSeleccionadas.map((carta, i) => ({
      lectura_id: lecturaId,
      carta_id: carta.id,
      posicion_id: carta.posicion.id,
      numero_posicion: carta.posicion.numero,
      invertida: carta.invertida,
      interpretacion: cartasIA[i]?.interpretacion ?? "",
      consejo: cartasIA[i]?.consejo ?? "",
    }));

    await supabase.from("tarot_lecturas_cartas").insert(registrosCartas);

    // 13. Actualizar orden
    await supabase.from("tarot_ordenes")
      .update({ estado: "lectura_lista", updated_at: ahoraNow })
      .eq("id", ordenId);

    const duracionMs = Date.now() - t0;
    await registrarLog(ordenId, "lectura_completada", "info",
      "Lectura generada correctamente con IA",
      {
        lectura_id: lecturaId,
        modelo: iaModelo,
        tokens_entrada: tokensEntrada,
        tokens_salida: tokensSalida,
        costo_usd: costoUsd,
        duracion_ms: duracionMs,
      },
      duracionMs,
    );

    // 14. Disparar ef_tarot_generar_pdf (fire-and-forget)
    const pdfUrl = `${SUPABASE_URL}/functions/v1/ef_tarot_generar_pdf`;
    fetch(pdfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-internal-key": TAROT_INTERNAL_KEY,
      },
      body: JSON.stringify({ orden_id: ordenId, lectura_id: lecturaId }),
    }).catch(async (err) => {
      await registrarLog(ordenId, "pdf_dispatch_error", "warning",
        "No se pudo disparar ef_tarot_generar_pdf (puede no existir aún)",
        { error: String(err), lectura_id: lecturaId });
    });

  } catch (err) {
    // Error durante la generación IA
    const errMsg = String(err);
    const ahoraNow = new Date().toISOString();

    await supabase.from("tarot_lecturas").update({
      estado: "error",
      error_codigo: "IA_ERROR",
      error_mensaje: errMsg.substring(0, 500),
      error_detalle: { raw: errMsg },
      prompt_sistema: promptSistema,
      prompt_usuario: promptUsuario,
      updated_at: ahoraNow,
    }).eq("id", lecturaId);

    const estadoOrden = numeroIntento >= maxReintentos ? "error_critico" : "error_lectura";
    await supabase.from("tarot_ordenes")
      .update({ estado: estadoOrden, updated_at: ahoraNow })
      .eq("id", ordenId);

    const duracionMs = Date.now() - t0;
    await registrarLog(ordenId, "lectura_error", "error",
      `Error en generación IA (intento ${numeroIntento}/${maxReintentos})`,
      {
        error: errMsg,
        lectura_id: lecturaId,
        intento: numeroIntento,
        max_reintentos: maxReintentos,
        estado_orden: estadoOrden,
        duracion_ms: duracionMs,
      },
      duracionMs,
    );
  }
}

// ── Router principal ─────────────────────────────────────────

serve(async (req) => {
  // Validación de clave interna — solo ef_tarot_webhook_mp puede invocar esta función
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "JSON_INVALIDO" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ordenId = String(body?.orden_id ?? "").trim();
  if (!ordenId) {
    return new Response(JSON.stringify({ ok: false, error: "ORDEN_ID_REQUERIDO" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Procesar de forma asíncrona para no bloquear la respuesta HTTP
  generarLectura(ordenId).catch((err) => {
    console.error(`${FN} fatal para orden ${ordenId}:`, err);
  });

  return new Response(JSON.stringify({ ok: true, mensaje: "Procesando lectura" }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
});
