import Anthropic from "@anthropic-ai/sdk";
import { claveAnalista, NOMBRE_CLAVE } from "@/lib/analista/informe";

// Resumen con IA del módulo de gobernanza (fase 2, 2026-11-14). A demanda:
// solo corre cuando Manuel toca el botón (cuesta centavos). Traduce el
// diagnóstico de las reglas a un parte corto en castellano rioplatense. No
// decide nada ni aplica nada: lee lo que ya calcularon las reglas.

const MODELO = "claude-sonnet-5-5";
const PRECIO = { entrada: 2, salida: 10 }; // USD por millón de tokens

const SISTEMA = `Sos el analista de Google Ads de un negocio chico. Escribís para el dueño, que no es experto: frases cortas, castellano rioplatense (vos), sin jerga sin explicar.
Te paso el diagnóstico que ya hizo un motor de reglas (salud, números y hallazgos en columnas: frenar, mejorar, escalar, esperar).
Reglas:
- Usá solo esos datos. No inventes números ni causas.
- Si una regla dice "esperar", respetalo: no recomiendes cambiar eso todavía.
- Nunca recomiendes subir el presupuesto o las pujas como algo para hacer ya; si los datos lo justifican, decí que es una decisión del dueño.
- Máximo 3 párrafos cortos, con estos títulos en negrita: **Cómo venimos**, **Qué hacer esta semana** (máximo 3 cosas, en orden de impacto), **Qué no tocar**.`;

export async function resumenConIa(datos: unknown) {
  const apiKey = claveAnalista();
  if (!apiKey) return { ok: false as const, motivo: `Falta ${NOMBRE_CLAVE} en las variables de entorno.` };
  const client = new Anthropic({ apiKey });
  try {
    const msg = await client.messages.create({
      model: MODELO,
      max_tokens: 1500,
      system: SISTEMA,
      messages: [{ role: "user", content: `Diagnóstico (JSON):\n${JSON.stringify(datos)}` }],
    });
    if (msg.stop_reason === "refusal") return { ok: false as const, motivo: "El modelo no quiso responder." };
    const texto = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
    const costo = (msg.usage.input_tokens * PRECIO.entrada + msg.usage.output_tokens * PRECIO.salida) / 1_000_000;
    return { ok: true as const, texto, costo_usd: Math.round(costo * 10000) / 10000, modelo: MODELO };
  } catch (e) {
    const m = e instanceof Anthropic.APIError ? `API de Anthropic ${e.status ?? ""}: ${e.message}` : e instanceof Error ? e.message : String(e);
    return { ok: false as const, motivo: m };
  }
}
