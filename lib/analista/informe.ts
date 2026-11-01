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
  required: ["titular", "estado", "resumen_ejecutivo", "numeros_clave", "hallazgos", "recomendaciones", "experimentos", "datos_que_faltan", "advertencias", "seguimiento", "memoria"],
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
    seguimiento: {
      type: "array",
      description: "Evaluación de recomendaciones anteriores marcadas como 'hecha' o 'en_curso' (memoria.recomendaciones_anteriores). Vacío si no hay.",
      items: {
        type: "object", additionalProperties: false, required: ["recomendacion_id", "veredicto", "explicacion"],
        properties: {
          recomendacion_id: { type: "string", description: "El id exacto de memoria.recomendaciones_anteriores." },
          veredicto: { type: "string", enum: ["funciono", "no_funciono", "sin_datos_aun", "no_aplica"] },
          explicacion: { type: "string", description: "Antes contra después, con números." },
        },
      },
    },
    memoria: {
      type: "object", additionalProperties: false, required: ["nuevos", "actualizados", "refutados"],
      description: "Cambios a 'lo que ya sabemos' (memoria.aprendizajes_vigentes).",
      properties: {
        nuevos: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["texto", "area", "confianza", "evidencia"],
            properties: {
              texto: { type: "string", description: "Conclusión duradera en una frase." },
              area: { type: "string", enum: ["trafico", "pagina", "checkout", "pago", "postcompra", "oferta", "medicion", "otro"] },
              confianza: { type: "string", enum: ["alta", "media", "baja"] },
              evidencia: { type: "string" },
            },
          },
        },
        actualizados: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["id", "texto", "confianza", "evidencia"],
            properties: { id: { type: "string" }, texto: { type: "string" }, confianza: { type: "string", enum: ["alta", "media", "baja"] }, evidencia: { type: "string" } },
          },
        },
        refutados: {
          type: "array",
          items: { type: "object", additionalProperties: false, required: ["id", "motivo"], properties: { id: { type: "string" }, motivo: { type: "string" } } },
        },
      },
    },
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

Memoria (bloque "memoria" del paquete, si viene):
- "informes_anteriores": lo que ya dijiste. No repitas igual: compará números con esos informes, decí qué cambió y sostené lo pendiente solo si sigue siendo lo más importante.
- "recomendaciones_anteriores": con el estado que les puso el dueño. Para cada una "hecha" o "en_curso", agregá una entrada en "seguimiento" con su id exacto: compará antes contra después de la fecha en que se marcó (estado_at y la bitácora). Si pasó poco tiempo o hay poca muestra, el veredicto es "sin_datos_aun". No vuelvas a recomendar algo "descartado" salvo que haya evidencia nueva fuerte, y explicalo.
- "aprendizajes_vigentes": lo que ya sabemos. En "memoria": agregá en "nuevos" solo conclusiones duraderas y sostenidas por datos (no observaciones de un día); si un dato nuevo cambia uno existente, ponelo en "actualizados" con su id; si los datos lo contradicen, en "refutados" con el motivo. No dupliques: si ya existe, actualizalo. Los de origen "manual" los escribió el dueño: no los actualices ni refutes; si los datos los contradicen, decilo en advertencias. Con muestra chica, confianza "baja". Mejor pocos y buenos (0 a 3 nuevos por informe).

Contexto del mercado: Uruguay, precio en pesos uruguayos, pago con Mercado Pago, mucha navegación desde el navegador interno de Facebook/Instagram (más lento, sesiones cortas, menos confianza para pagar).

Escribí en español rioplatense (voseo), claro y directo, para un dueño de negocio sin formación técnica. Frases cortas. Nada de jerga sin explicar.`;

export interface OpcionesInforme { foco: Foco; dias: number; modelo: Modelo; esfuerzo: Esfuerzo; fuentes: Record<Fuente, boolean>; contextoNegocio: string; minimoVisitas: number }

/** Memoria: últimos informes, recomendaciones con su estado y aprendizajes vigentes. */
export async function armarMemoria(rest: Rest, excluirInforme?: string) {
  const [informes, aprendizajes] = await Promise.all([
    rest(`tarot_analista_informes?estado=eq.listo${excluirInforme ? `&id=neq.${excluirInforme}` : ""}&select=id,created_at,foco,periodo_desde,periodo_hasta,titular:contenido->>titular,numeros_clave:contenido->numeros_clave&order=created_at.desc&limit=5`),
    rest(`tarot_analista_aprendizajes?activo=eq.true&select=id,texto,area,confianza,evidencia,origen,updated_at&order=updated_at.desc&limit=60`),
  ]);
  const ids = (informes as { id: string }[]).map((i) => i.id);
  const hace90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [deUltimos, marcadasViejas] = await Promise.all([
    ids.length ? rest(`tarot_analista_recomendaciones?informe_id=in.(${ids.join(",")})&select=id,informe_id,prioridad,accion,donde,como_medir,estado,nota,estado_at,evaluacion_veredicto,evaluacion_texto&order=created_at.desc`) : Promise.resolve([]),
    rest(`tarot_analista_recomendaciones?estado=in.(hecha,en_curso,descartada)&created_at=gte.${hace90}&select=id,informe_id,prioridad,accion,donde,como_medir,estado,nota,estado_at,evaluacion_veredicto,evaluacion_texto&order=estado_at.desc&limit=30`),
  ]);
  const recs = new Map<string, Record<string, unknown>>();
  for (const r of [...(deUltimos as Record<string, unknown>[]), ...(marcadasViejas as Record<string, unknown>[])]) recs.set(String(r.id), r);
  return {
    informes_anteriores: (informes as Record<string, unknown>[]).map((i) => ({
      fecha: i.created_at, foco: i.foco, periodo: [i.periodo_desde, i.periodo_hasta], titular: i.titular, numeros_clave: i.numeros_clave,
    })),
    recomendaciones_anteriores: Array.from(recs.values()).map((r) => ({
      id: r.id, de_informe_del: (informes as { id: string; created_at: string }[]).find((i) => i.id === r.informe_id)?.created_at ?? null,
      prioridad: r.prioridad, accion: r.accion, donde: r.donde, como_medir: r.como_medir,
      estado: r.estado, nota_del_dueno: r.nota, estado_desde: r.estado_at,
      evaluacion_anterior: r.evaluacion_veredicto ? { veredicto: r.evaluacion_veredicto, texto: r.evaluacion_texto } : null,
    })),
    aprendizajes_vigentes: aprendizajes,
  };
}

/** Paquete que vería la IA con la configuración actual (para "Ver lo que se le manda"). */
export async function paqueteParaInforme(rest: Rest, dias: number, fuentes: Record<Fuente, boolean>, contextoNegocio: string, minimoVisitas: number, excluirInforme?: string) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86_400_000);
  const activas = { ...FUENTES_POR_DEFECTO, ...fuentes };
  const paquete = await armarPaquete((q) => rest(q), { desde, hasta, fuentes: activas, contextoNegocio, minimoVisitas });
  if (activas.memoria) paquete.memoria = await armarMemoria(rest, excluirInforme);
  return paquete;
}

type Contenido = {
  recomendaciones?: { prioridad: number; accion: string; donde: string; impacto: string; esfuerzo: string; como_medir: string }[];
  seguimiento?: { recomendacion_id: string; veredicto: string; explicacion: string }[];
  memoria?: {
    nuevos?: { texto: string; area: string; confianza: string; evidencia: string }[];
    actualizados?: { id: string; texto: string; confianza: string; evidencia: string }[];
    refutados?: { id: string; motivo: string }[];
  };
};

/** Después de un informe: guarda sus recomendaciones, los veredictos de las
 *  anteriores y los cambios a la memoria. Solo toca ids que se le mostraron. */
export async function aplicarMemoria(rest: Rest, informeId: string, c: Contenido, paquete: Record<string, unknown>) {
  const mem = paquete.memoria as { recomendaciones_anteriores?: { id: string }[]; aprendizajes_vigentes?: { id: string; origen: string }[] } | undefined;
  const recsVistas = new Set((mem?.recomendaciones_anteriores ?? []).map((r) => r.id));
  const aprendIA = new Set((mem?.aprendizajes_vigentes ?? []).filter((a) => a.origen === "ia").map((a) => a.id));
  const ahora = new Date().toISOString();
  const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body), headers: { Prefer: "return=minimal" } });

  const recs = (c.recomendaciones ?? []).map((r, i) => ({
    informe_id: informeId, indice: i, prioridad: r.prioridad, accion: r.accion, donde: r.donde, impacto: r.impacto, esfuerzo: r.esfuerzo, como_medir: r.como_medir,
  }));
  if (recs.length) await rest("tarot_analista_recomendaciones", json("POST", recs));

  for (const s of c.seguimiento ?? []) {
    if (!recsVistas.has(s.recomendacion_id)) continue;
    await rest(`tarot_analista_recomendaciones?id=eq.${s.recomendacion_id}`, json("PATCH", {
      evaluacion_veredicto: s.veredicto, evaluacion_texto: s.explicacion.slice(0, 1000), evaluado_informe_id: informeId, evaluado_at: ahora,
    }));
  }

  const nuevos = (c.memoria?.nuevos ?? []).slice(0, 5).filter((a) => a.texto?.trim().length >= 3).map((a) => ({
    texto: a.texto.slice(0, 600), area: a.area, confianza: a.confianza, evidencia: a.evidencia?.slice(0, 1000), origen: "ia", informe_id: informeId,
  }));
  if (nuevos.length) await rest("tarot_analista_aprendizajes", json("POST", nuevos));
  for (const a of c.memoria?.actualizados ?? []) {
    if (!aprendIA.has(a.id)) continue;
    await rest(`tarot_analista_aprendizajes?id=eq.${a.id}`, json("PATCH", {
      texto: a.texto.slice(0, 600), confianza: a.confianza, evidencia: a.evidencia?.slice(0, 1000), informe_id: informeId, updated_at: ahora,
    }));
  }
  for (const a of c.memoria?.refutados ?? []) {
    if (!aprendIA.has(a.id)) continue;
    await rest(`tarot_analista_aprendizajes?id=eq.${a.id}`, json("PATCH", { activo: false, motivo_baja: a.motivo.slice(0, 600), informe_id: informeId, updated_at: ahora }));
  }
}

/** Corre el informe ya creado (fila en estado "generando") y guarda el resultado. */
export async function generarInforme(rest: Rest, id: string, o: OpcionesInforme) {
  const t0 = Date.now();
  const guardar = (campos: Record<string, unknown>) =>
    rest(`tarot_analista_informes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos), headers: { Prefer: "return=minimal" } });
  try {
    const paquete = await paqueteParaInforme(rest, o.dias, o.fuentes, o.contextoNegocio, o.minimoVisitas, id);
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
    // La memoria es un extra: si falla, el informe ya quedó guardado igual.
    await aplicarMemoria(rest, id, contenido, paquete).catch((e) => console.error("analista: memoria", e));
  } catch (e: unknown) {
    const mensaje = e instanceof Anthropic.APIError ? `API de Anthropic ${e.status ?? ""}: ${e.message}` : e instanceof Error ? e.message : String(e);
    await guardar({ estado: "error", error: mensaje.slice(0, 500), duracion_ms: Date.now() - t0 }).catch(() => {});
  }
}
