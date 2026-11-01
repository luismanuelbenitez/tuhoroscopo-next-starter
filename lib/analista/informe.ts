// Analista de conversión (2026-11-01): genera el informe con Claude a partir
// del paquete de datos (lib/analista/datos.ts). Salida estructurada con un
// esquema fijo, así la pantalla lo muestra siempre igual. Guarda en
// tarot_analista_informes el informe, el paquete exacto que vio la IA y el
// costo real (tokens × precio del modelo).

import Anthropic from "@anthropic-ai/sdk";
import { armarPaquete, FUENTES_POR_DEFECTO, type Fuente } from "@/lib/analista/datos";

export type Rest = (q: string, init?: RequestInit) => Promise<any>;

// Clave propia del panel (separada de la que usan las lecturas en Supabase):
// se puede revocar o topear sin afectar a los clientes.
export const NOMBRE_CLAVE = "ANTHROPIC_API_KEY_PANEL_ADMIN";
export const claveAnalista = () => process.env.ANTHROPIC_API_KEY_PANEL_ADMIN || process.env.ANTHROPIC_API_KEY || "";

// Precios por millón de tokens (USD), entrada / salida. El razonamiento
// interno se cobra como salida (ya viene sumado en usage.output_tokens).
export const MODELOS = {
  "claude-haiku-5-5": { nombre: "Claude Haiku 5.5", calidad: "Básico", entrada: 0.1, salida: 0.5 },
  "claude-sonnet-5-5": { nombre: "Claude Sonnet 5.5", calidad: "Muy bueno", entrada: 2, salida: 10 },
  "claude-opus-5-5": { nombre: "Claude Opus 5.5", calidad: "Excelente (recomendado)", entrada: 4, salida: 20 },
  "claude-fable-5-1": { nombre: "Claude Fable 5.1", calidad: "Máximo", entrada: 10, salida: 50 },
} as const;
export type Modelo = keyof typeof MODELOS;
export const ESFUERZOS = { medium: "Normal", high: "Alto", xhigh: "Máximo" } as const;
export type Esfuerzo = keyof typeof ESFUERZOS;

export const FOCOS = {
  general: "Visión general: dónde se pierde la venta y qué hacer primero",
  meta: "Campaña de Meta: calidad del tráfico pago, ubicaciones, público y gasto",
  pagina: "Página de tarot: qué secciones funcionan y cuáles frenan",
  checkout: "Checkout: formulario, cupones y paso a Mercado Pago",
  postcompra: "Después de la compra: experiencia, recompra y reclamos",
} as const;
export type Foco = keyof typeof FOCOS;

/** Estimación previa (para mostrar al elegir el modelo): ~10k de entrada (manual +
 *  paquete; con CSVs de Meta puede crecer) y la salida según la profundidad. */
export function costoEstimado(modelo: Modelo, esfuerzo: Esfuerzo) {
  const m = MODELOS[modelo];
  const salida = { medium: 8_000, high: 12_000, xhigh: 20_000 }[esfuerzo];
  return (10_000 * m.entrada + salida * m.salida) / 1_000_000;
}
export function costoReal(modelo: string, entrada: number, salida: number) {
  const m = MODELOS[modelo as Modelo] ?? MODELOS["claude-opus-5-5"];
  return (entrada * m.entrada + salida * m.salida) / 1_000_000;
}

const NIVEL = { type: "string", enum: ["alto", "medio", "bajo"] } as const;
const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titular", "estado", "resumen_ejecutivo", "numeros_clave", "hallazgos", "recomendaciones", "experimentos", "datos_que_faltan", "advertencias"],
  properties: {
    titular: { type: "string", description: "Una sola frase con la conclusión principal." },
    estado: { type: "string", enum: ["bien", "atencion", "critico"] },
    resumen_ejecutivo: { type: "array", items: { type: "string" }, description: "3 a 6 frases cortas." },
    numeros_clave: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["nombre", "valor", "comparacion", "lectura"],
        properties: {
          nombre: { type: "string" }, valor: { type: "string" },
          comparacion: { type: "string", description: "Contra el período anterior o una referencia; vacío si no hay." },
          lectura: { type: "string", description: "Qué significa, en una frase." },
        },
      },
    },
    hallazgos: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["titulo", "area", "evidencia", "interpretacion", "confianza"],
        properties: {
          titulo: { type: "string" },
          area: { type: "string", enum: ["trafico", "pagina", "checkout", "pago", "postcompra", "oferta", "medicion"] },
          evidencia: { type: "string", description: "Los números exactos del paquete que lo sostienen." },
          interpretacion: { type: "string" },
          confianza: { type: "string", enum: ["alta", "media", "baja"] },
        },
      },
    },
    recomendaciones: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["prioridad", "accion", "donde", "por_que", "impacto", "esfuerzo", "como_hacerlo", "como_medir"],
        properties: {
          prioridad: { type: "integer", description: "1 = lo primero que hay que hacer." },
          accion: { type: "string" },
          donde: { type: "string", enum: ["meta", "pagina_tarot", "checkout", "oferta", "postcompra", "medicion", "otro"] },
          por_que: { type: "string" },
          impacto: NIVEL,
          esfuerzo: NIVEL,
          como_hacerlo: { type: "string", description: "Pasos concretos (dónde tocar, qué escribir)." },
          como_medir: { type: "string", description: "Qué número mirar y cuándo para saber si funcionó." },
        },
      },
    },
    experimentos: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["nombre", "hipotesis", "que_cambiar", "metrica", "muestra_necesaria"],
        properties: {
          nombre: { type: "string" }, hipotesis: { type: "string" }, que_cambiar: { type: "string" },
          metrica: { type: "string" }, muestra_necesaria: { type: "string", description: "Visitas o días necesarios para concluir." },
        },
      },
    },
    datos_que_faltan: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["dato", "para_que", "como_conseguirlo"],
        properties: {
          dato: { type: "string" }, para_que: { type: "string" },
          como_conseguirlo: { type: "string", description: "Instrucciones exactas, paso a paso (ej. qué desglose exportar en Meta)." },
        },
      },
    },
    advertencias: { type: "array", items: { type: "string" }, description: "Límites del análisis: muestra chica, mediciones nuevas, etc." },
  },
} as const;

const MANUAL = `Sos el analista de conversión de Tu Oráculo (tuoraculo.uy), experto en CRO (optimización de la tasa de conversión) de productos digitales de bajo precio y compra por impulso, con foco en tráfico de Meta en celulares. Tu trabajo: explicar por qué la gente que entra no compra y qué hacer, con números.

Cómo trabajás:
1. Todo hallazgo se apoya en números exactos del paquete; citalos en "evidencia". Si un número no está en el paquete, no existe: no inventes métricas, benchmarks precisos ni datos de Meta que no te pasaron.
2. Rigor con muestras chicas. El paquete trae "minimo_visitas_para_concluir": por debajo de eso, decilo y bajá la confianza. Una venta más o menos no es una tendencia. Cuando no alcance, proponé cuántas visitas o días hacen falta.
3. Mediciones nuevas: "mediciones_disponibles_desde" dice desde cuándo existe cada medición. Antes de esa fecha, un 0 significa "no se medía", no "nadie lo hizo". Comparalo solo con el tramo medido.
4. Bitácora de cambios: usala para separar el efecto de un cambio (ej. sacar Audience Network) de la casualidad. Si un cambio es muy reciente, decí que todavía no se puede evaluar.
5. Pensá el recorrido completo: anuncio → calidad del clic → página /tarot (secciones, scroll, tiempo) → botón de compra → checkout (qué campo frena, errores, cupón) → Mercado Pago → pago → experiencia post-compra. Encontrá la etapa con mayor pérdida evitable y empezá por ahí.
6. Recomendaciones accionables y priorizadas por impacto/esfuerzo: dónde exactamente (ej. "Administrador de anuncios → conjunto → Ubicaciones"), qué cambiar y qué número mirar después. Máximo 7, la #1 es lo que harías mañana.
7. Experimentos solo si hay tráfico para concluirlos; indicá la muestra necesaria.
8. "datos_que_faltan": pedí lo que de verdad cambiaría la conclusión, con instrucciones exactas para conseguirlo (ej. Meta → Desglose → Edad y sexo → exportar CSV y subirlo en el Analista).
9. Ética del rubro: nada de escasez falsa, testimonios inventados, promesas de resultados o de predicción del futuro, ni presión indebida. La lectura es simbólica y generada con IA; la claridad sobre eso es parte de la confianza.
10. Las ventas de dispositivos propios (pruebas del dueño) son plata real pero no prueban que el público compre: separalas al evaluar la conversión.

Contexto del mercado: Uruguay, precio en pesos uruguayos, pago con Mercado Pago, mucha navegación desde el navegador interno de Facebook/Instagram (más lento, sesiones cortas, menos confianza para pagar).

Escribí en español rioplatense (voseo), claro y directo, para un dueño de negocio sin formación técnica. Frases cortas. Nada de jerga sin explicar.`;

export interface OpcionesInforme { foco: Foco; dias: number; modelo: Modelo; esfuerzo: Esfuerzo; fuentes: Record<Fuente, boolean>; contextoNegocio: string; minimoVisitas: number }

/** Paquete que vería la IA con la configuración actual (para "Ver lo que se le manda"). */
export async function paqueteParaInforme(rest: Rest, dias: number, fuentes: Record<Fuente, boolean>, contextoNegocio: string, minimoVisitas: number) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86_400_000);
  return armarPaquete((q) => rest(q), { desde, hasta, fuentes: { ...FUENTES_POR_DEFECTO, ...fuentes }, contextoNegocio, minimoVisitas });
}

/** Corre el informe ya creado (fila en estado "generando") y guarda el resultado. */
export async function generarInforme(rest: Rest, id: string, o: OpcionesInforme) {
  const t0 = Date.now();
  const guardar = (campos: Record<string, unknown>) =>
    rest(`tarot_analista_informes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos), headers: { Prefer: "return=minimal" } });
  try {
    const paquete = await paqueteParaInforme(rest, o.dias, o.fuentes, o.contextoNegocio, o.minimoVisitas);
    await guardar({ datos_enviados: paquete });

    const apiKey = claveAnalista();
    if (!apiKey) throw new Error(`Falta ${NOMBRE_CLAVE} en las variables de entorno de Vercel.`);
    const client = new Anthropic({ apiKey });
    const stream = client.messages.stream({
      model: o.modelo,
      max_tokens: 32_000,
      system: MANUAL,
      output_config: { effort: o.esfuerzo, format: { type: "json_schema", schema: ESQUEMA as unknown as Record<string, unknown> } },
      messages: [{
        role: "user",
        content: `Foco de este informe: ${FOCOS[o.foco]}.\nPeríodo: últimos ${o.dias} días (y el período anterior para comparar).\n\nPaquete de datos (JSON):\n${JSON.stringify(paquete)}`,
      }],
    });
    const msg = await stream.finalMessage();
    const entrada = msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
    const salida = msg.usage.output_tokens;
    const costo = costoReal(o.modelo, entrada, salida);
    if (msg.stop_reason === "refusal") throw new Error("El modelo no quiso generar el informe (refusal).");
    if (msg.stop_reason === "max_tokens") throw new Error("El informe se cortó por largo; probá con esfuerzo menor o un período más corto.");
    const texto = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const contenido = JSON.parse(texto);
    await guardar({ estado: "listo", contenido, tokens_entrada: entrada, tokens_salida: salida, costo_usd: Math.round(costo * 10000) / 10000, duracion_ms: Date.now() - t0 });
  } catch (e: unknown) {
    const mensaje = e instanceof Anthropic.APIError ? `API de Anthropic ${e.status ?? ""}: ${e.message}` : e instanceof Error ? e.message : String(e);
    await guardar({ estado: "error", error: mensaje.slice(0, 500), duracion_ms: Date.now() - t0 }).catch(() => {});
  }
}
