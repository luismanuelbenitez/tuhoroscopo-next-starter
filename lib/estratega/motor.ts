// Estratega de anuncios (2026-11-04): la IA que responde el chat y arma el
// informe semanal. Antes de cada respuesta lee "lo que sabe" (los documentos
// de estratega_documentos) y después consulta los datos con las herramientas
// de lib/estratega/herramientas.ts. Corre en segundo plano (waitUntil): la
// fila queda en "generando" y la pantalla la consulta hasta que esté lista.

import Anthropic from "@anthropic-ai/sdk";
import { NOMBRE_CLAVE, claveAnalista, costoReal } from "@/lib/analista/informe";
import { REGLA_MAXIMA } from "@/lib/reglaMaxima";
import { correrHerramienta, definicionesHerramientas, type Contexto, type Rest } from "@/lib/estratega/herramientas";

export const MODELO_ESTRATEGA = "claude-opus-5-5";
const MAX_RONDAS = 12;
const HISTORIAL = 20;

export interface Consulta { herramienta: string; entrada: unknown; error: boolean; caracteres: number }
interface Documento { clave: string; titulo: string; contenido: string; updated_at: string }

const INSTRUCCIONES = `Sos el Estratega de anuncios de Tu Oráculo (tuhoroscopocosmico.com), un negocio uruguayo chico que vende lecturas de tarot online por $690 y las entrega por WhatsApp. Le hablás a Manuel, el dueño. Tu trabajo: decirle dónde poner la plata de publicidad para vender de forma rentable, con un costo por cliente (CAC) que permita crecer y formalizar la empresa.

${REGLA_MAXIMA}

Cómo trabajás:
- Primero leé los documentos de "Lo que sabés" (abajo). Son la base: reglas, economía, guías y experimentos.
- Después consultá los datos con las herramientas antes de afirmar cualquier número. No inventes cifras. Si un dato no está, decilo y explicá cómo conseguirlo.
- Pensá siempre en plata: costo por visita real, por checkout y por venta, contra el margen por venta y el CAC objetivo del documento de economía.
- Con pocos datos (menos de ~30 visitas o 1–2 ventas), avisá que la muestra es chica y no saques conclusiones fuertes.
- Las visitas de Meta desde fuera de Uruguay y las de 0 segundos sin acciones suelen ser robots o clics sin querer: separalas.
- Respetá las reglas del negocio y las decisiones tomadas. Si una decisión anterior choca con los datos nuevos, decilo y proponé revisarla.
- No podés tocar Meta, Google ni la web, ni escribirle a clientes. Proponés; Manuel ejecuta. Cuando haya una acción clara, dejala con la herramienta "proponer" (máximo 3 por respuesta) con pasos exactos: pantalla, campo, valor, cuándo revisar y qué número decide si sigue o se corta.

Cómo respondés:
- En español rioplatense, claro y directo, sin jerga: si usás un término (CTR, CPM, CAC), explicalo la primera vez en pocas palabras.
- Primero la respuesta en una o dos frases. Después los números que la sostienen (tablas cortas cuando comparás) y qué hacer.
- Corto: lo que Manuel necesita para decidir, nada más. Markdown simple (títulos ##, listas, tablas, negritas).
- Montos en pesos uruguayos con $ salvo que se indique US$. Fechas en formato día/mes.`;

const PEDIDO_INFORME = `Armá el informe semanal de anuncios (últimos 7 días contra los 7 anteriores). Estructura:
## En una frase
## Cómo vino la semana (tabla: canal, gasto, visitas reales, checkout, ventas, costo por venta)
## Qué funcionó y qué no (con números)
## Qué hacer esta semana (en orden; dejá cada acción con "proponer")
## Qué datos faltan
Consultá al menos: economia (7 días), embudo por fuente y por ubicación, meta_ads (7 días), google_ads (7 días) y pendientes.`;

async function leerDocumentos(rest: Rest): Promise<Documento[]> {
  return rest("estratega_documentos?select=clave,titulo,contenido,updated_at&order=orden.asc");
}

function sistema(docs: Documento[]): Anthropic.TextBlockParam[] {
  const hoy = new Date().toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Montevideo" });
  const saber = docs.map((d) => `<documento titulo="${d.titulo}" actualizado="${d.updated_at.slice(0, 10)}">\n${d.contenido}\n</documento>`).join("\n\n");
  // Los documentos van en un bloque con caché: se reutilizan entre rondas de herramientas.
  return [
    { type: "text", text: `${INSTRUCCIONES}\n\n# Lo que sabés\n\n${saber}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: `Hoy es ${hoy} (hora de Montevideo).` },
  ];
}

/** Corre la conversación con herramientas hasta la respuesta final. */
async function conversar(rest: Rest, mensajes: Anthropic.MessageParam[], ctx: Contexto, esfuerzo: "medium" | "high") {
  const apiKey = claveAnalista();
  if (!apiKey) throw new Error(`Falta ${NOMBRE_CLAVE} en las variables de entorno de Vercel.`);
  const client = new Anthropic({ apiKey });
  const system = sistema(await leerDocumentos(rest));
  const tools = definicionesHerramientas() as Anthropic.Tool[];
  const consultas: Consulta[] = [];
  let entrada = 0, salida = 0;
  const conv = [...mensajes];

  for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
    const msg = await client.messages
      .stream({ model: MODELO_ESTRATEGA, max_tokens: 16_000, system, tools, thinking: { type: "adaptive" }, output_config: { effort: esfuerzo }, messages: conv })
      .finalMessage();
    entrada += msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
    salida += msg.usage.output_tokens;
    if (msg.stop_reason === "refusal") throw new Error("El modelo no quiso responder (refusal).");
    if (msg.stop_reason === "max_tokens") throw new Error("La respuesta se cortó por largo. Probá con una pregunta más acotada.");

    const usos = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || !usos.length) {
      const texto = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
      return { texto, consultas, entrada, salida };
    }
    // El bloque del asistente va completo (incluye el razonamiento) para la ronda siguiente.
    conv.push({ role: "assistant", content: msg.content });
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const u of usos) {
      const r = await correrHerramienta(rest, u.name, u.input, ctx);
      consultas.push({ herramienta: u.name, entrada: u.input, error: r.error, caracteres: r.texto.length });
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: r.texto, is_error: r.error });
    }
    conv.push({ role: "user", content: resultados });
  }
  throw new Error(`Se pasó de ${MAX_RONDAS} rondas de consultas sin terminar.`);
}

const mensajeDeError = (e: unknown) =>
  (e instanceof Anthropic.APIError ? `API de Anthropic ${e.status ?? ""}: ${e.message}` : e instanceof Error ? e.message : String(e)).slice(0, 500);
const patch = (rest: Rest, tabla: string, id: string, campos: Record<string, unknown>) =>
  rest(`${tabla}?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(campos) });

/** Responde el mensaje del asistente `mensajeId` (ya creado en "generando"). */
export async function responderChat(rest: Rest, conversacionId: string, mensajeId: string) {
  const t0 = Date.now();
  try {
    const previos = (await rest(
      `estratega_mensajes?conversacion_id=eq.${conversacionId}&estado=eq.listo&select=rol,texto&order=created_at.desc&limit=${HISTORIAL}`,
    )) as { rol: "user" | "assistant"; texto: string }[];
    const mensajes: Anthropic.MessageParam[] = [];
    for (const m of previos.reverse()) {
      if (!m.texto.trim()) continue;
      // La API pide alternar: dos seguidos del mismo rol se juntan.
      const ult = mensajes[mensajes.length - 1];
      if (ult && ult.role === m.rol) ult.content = `${ult.content}\n\n${m.texto}`;
      else mensajes.push({ role: m.rol, content: m.texto });
    }
    if (!mensajes.length || mensajes[0].role !== "user") throw new Error("No hay pregunta para responder.");
    const r = await conversar(rest, mensajes, { mensajeId }, "medium");
    await patch(rest, "estratega_mensajes", mensajeId, {
      estado: "listo", texto: r.texto, consultas: r.consultas, modelo: MODELO_ESTRATEGA,
      tokens_entrada: r.entrada, tokens_salida: r.salida, costo_usd: Math.round(costoReal(MODELO_ESTRATEGA, r.entrada, r.salida) * 10000) / 10000,
      duracion_ms: Date.now() - t0,
    });
  } catch (e: unknown) {
    await patch(rest, "estratega_mensajes", mensajeId, { estado: "error", error: mensajeDeError(e), duracion_ms: Date.now() - t0 }).catch(() => {});
  }
}

/** Arma el informe semanal `informeId` (ya creado en "generando"). */
export async function generarInformeSemanal(rest: Rest, informeId: string) {
  const t0 = Date.now();
  try {
    const r = await conversar(rest, [{ role: "user", content: PEDIDO_INFORME }], { informeId }, "high");
    await patch(rest, "estratega_informes", informeId, {
      estado: "listo", texto: r.texto, consultas: r.consultas, modelo: MODELO_ESTRATEGA,
      tokens_entrada: r.entrada, tokens_salida: r.salida, costo_usd: Math.round(costoReal(MODELO_ESTRATEGA, r.entrada, r.salida) * 10000) / 10000,
      duracion_ms: Date.now() - t0,
    });
  } catch (e: unknown) {
    await patch(rest, "estratega_informes", informeId, { estado: "error", error: mensajeDeError(e), duracion_ms: Date.now() - t0 }).catch(() => {});
  }
}

/** Lunes de la semana (hora de Montevideo) en YYYY-MM-DD. */
export function lunesDeLaSemana(ahora = Date.now()) {
  const d = new Date(ahora - 3 * 3600_000);
  const dia = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}
