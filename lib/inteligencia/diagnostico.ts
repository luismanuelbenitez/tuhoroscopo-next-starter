// Inteligencia comercial · diagnóstico ejecutivo con IA (2026-11-25, fase 3).
//
// Solo a pedido (botón; decisión de Manuel del 24/11). Arma un paquete con lo
// que ya calculan las otras pantallas (Centro de control, bandeja de
// recomendaciones, experimentos medidos, memoria única) y le pide a Claude un
// diagnóstico corto. La IA no consulta nada por su cuenta, no inventa números
// y no puede tocar campañas: solo lee el paquete y escribe texto.
// Costo: se muestra antes de correr y respeta el tope mensual de IA del panel.

import Anthropic from "@anthropic-ai/sdk";
import type { Rest } from "@/lib/asistenteParte";
import { MODELOS, NOMBRE_CLAVE, claveAnalista, costoReal, type Modelo } from "@/lib/analista/informe";
import { REGLA_MAXIMA } from "@/lib/reglaMaxima";
import { calcularCentro } from "./centro";
import { armarBandeja } from "./recomendaciones";
import { medirExperimentos } from "./experimentos";
import { leerMemoria, NOMBRE_NIVEL } from "./memoria";
import { NEGOCIO_POR_DEFECTO } from "./negocio";

export const MODELO_DIAGNOSTICO: Modelo = "claude-sonnet-5-5";
/** Consumo típico: paquete real del 25/11 ≈ 21.500 caracteres (~7k tokens) + instrucciones;
 *  salida con razonamiento ~4–6k. Margen incluido. */
export const CONSUMO_DIAGNOSTICO = { entrada: 10_000, salida: 6_000 };
export const costoEstimadoDiagnostico = (modelo: Modelo = MODELO_DIAGNOSTICO) =>
  (CONSUMO_DIAGNOSTICO.entrada * MODELOS[modelo].entrada + CONSUMO_DIAGNOSTICO.salida * MODELOS[modelo].salida) / 1_000_000;

const r0 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v));
const r2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

export async function armarPaquete(rest: Rest, negocio = NEGOCIO_POR_DEFECTO) {
  const get = rest as unknown as (q: string) => Promise<any>;
  const [centro, bandeja, memoria] = await Promise.all([
    calcularCentro(get, { negocio, dias: 30, atribucion: "ultimo" }),
    armarBandeja(rest, { negocio }),
    leerMemoria(get, negocio),
  ]);
  const exps = await medirExperimentos(rest, bandeja.experimentos);
  if (!centro.ok) throw new Error("No se pudo calcular el Centro de control.");
  const compactoRec = (r: (typeof bandeja.para_decidir)[number]) => ({
    titulo: r.titulo, canal: r.canal, area: r.area, prioridad: r.prioridad, evidencia: r.evidencia, efecto: r.efecto,
    que_pasa: r.que_pasa.slice(0, 400), accion: r.accion.slice(0, 300), vieja: r.vieja, repeticiones: r.repeticiones,
    posible_resuelta: r.posible_resuelta, conflictos: r.conflictos.map((c) => `${c.tipo}: ${c.texto.slice(0, 220)}`), fuentes: Array.from(new Set(r.fuentes.map((f) => f.nombre))),
  });
  return {
    negocio: centro.negocio,
    generado: new Date().toISOString(),
    moneda: "Montos en pesos uruguayos salvo que diga USD.",
    ultimos_30_dias: {
      consolidado: Object.fromEntries(Object.entries(centro.actual).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v])),
      periodo_anterior: Object.fromEntries(Object.entries(centro.anterior).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v])),
      por_canal: centro.canales.map((c) => ({ canal: c.nombre, inversion: r0(c.inversion), clics: c.clics, visitas: c.visitas, checkout: c.checkout, ventas: c.ventas, clientes_nuevos: c.clientes_nuevos, cac: r0(c.cac), conversiones_que_informa_la_plataforma: c.conversiones_plataforma })),
      dias_sin_venta: centro.dias_sin_venta,
    },
    economia: { ...centro.economia, cac_maximo: r0(centro.economia.cac_maximo), margen_contribucion_por_venta: r0(centro.economia.margen_contribucion_por_venta), costo_variable_por_venta: r0(centro.economia.costo_variable_por_venta) },
    mes_en_curso: centro.mes,
    cac_semanal: centro.semanas.map((s) => ({ semana: s.desde, inversion: r0(s.inversion), ventas: s.ventas, clientes_nuevos: s.clientes_nuevos, cac: r0(s.cac) })),
    atencion: centro.atencion.map((a) => `${a.titulo}: ${a.detalle}`),
    recomendaciones_para_decidir: bandeja.para_decidir.slice(0, 15).map(compactoRec),
    esperando_datos: bandeja.esperando.map((r) => `${r.titulo} (${r.evidencia_motivo})`),
    aceptadas_sin_terminar: bandeja.aceptadas.map((r) => r.titulo),
    decisiones_recientes: bandeja.decididas.slice(0, 20).map((d) => ({ titulo: d.titulo, estado: d.estado, nota: d.nota, fecha: d.decidida_at.slice(0, 10) })),
    google_pide_esperar: bandeja.esperar_google,
    experimentos: exps.experimentos.map((e) => ({
      id: e.id, nombre: e.nombre, estado: e.estado, evaluacion: e.evaluacion, hipotesis: e.hipotesis, aplicado_desde: e.aplicado_desde, fin_previsto: e.fin_previsto,
      volumen: e.volumen, indicadores: e.indicadores.map((k) => ({ nombre: k.nombre, plan_antes: k.plan_antes, plan_esperado: k.plan_esperado, medido_antes: r2(k.antes), medido_despues: r2(k.despues) })),
      criterios: e.criterios, atribucion: e.atribucion, faltantes: e.faltantes, resultado: e.resultado, conclusion: e.conclusion,
    })),
    memoria: memoria.map((m) => ({ texto: m.texto, nivel: NOMBRE_NIVEL[m.nivel], vigente: m.activo, motivo_baja: m.motivo_baja, resultado: m.resultado, canal: m.canal, ref: m.ref, evidencia: m.evidencia?.slice(0, 300) ?? null })),
  };
}

const INSTRUCCIONES = `Sos el director comercial de Tu Oráculo, un negocio chico de Uruguay que vende lecturas de tarot online. Le escribís a Manuel, el dueño, un diagnóstico ejecutivo para decidir esta semana.

${REGLA_MAXIMA}

Reglas:
- Usá SOLO los números del paquete. No inventes ni estimes cifras que no estén. Si falta un dato para decidir algo, decilo.
- Marcá cada afirmación importante como **[Hecho]** (dato real con volumen suficiente), **[Señal]** (dato con poco volumen o juicio no validado) o **[Hipótesis]** (idea a probar).
- Con pocos datos (menos de 3 ventas en un canal o un experimento sin el volumen mínimo), recomendá esperar y decí qué dato falta.
- Respetá los experimentos en curso o planificados: no propongas cambiar lo que tienen en "alcance" mientras corren, salvo para frenar una pérdida grave (y explicá el costo de hacerlo).
- Consultá la memoria: no propongas lo que ya se probó y no funcionó ni lo que Manuel ya descartó, salvo que haya un dato nuevo (decí cuál).
- Pensá en plata: CAC contra margen por venta, resultado del mes contra la meta. Primero lo que frena pérdidas.
- Elegí entre las recomendaciones de la bandeja; no inventes otras salvo que algo muy claro del paquete falte (y marcalo como [Hipótesis]).

Formato (markdown simple, en español rioplatense, sin jerga; si usás CAC o ROAS explicalo la primera vez). Usá exactamente estos títulos, en este orden (la pantalla los muestra por separado):
## Situación
(una o dos frases: si el negocio gana o pierde y por qué)
## Principal problema u oportunidad
(una frase)
## Evidencia
(3 a 5 viñetas con números del paquete, cada una marcada)
## Decisión prioritaria
(una sola: qué hacer, por qué, qué número la juzga y cuándo)
## Otras decisiones
(hasta 2 más, en orden; si no hay, escribí "Ninguna por ahora.")
## Qué observar
(los números a mirar esta semana)
## Qué no tocar todavía
## Qué falta saber
Corto: menos de 450 palabras.`;

export async function generarDiagnostico(rest: Rest, id: string, paquete: unknown, modelo: Modelo = MODELO_DIAGNOSTICO) {
  const t0 = Date.now();
  try {
    const apiKey = claveAnalista();
    if (!apiKey) throw new Error(`Falta ${NOMBRE_CLAVE} en las variables de entorno de Vercel.`);
    const client = new Anthropic({ apiKey });
    const msg = await client.messages
      .stream({
        model: modelo, max_tokens: 12_000, thinking: { type: "adaptive" }, output_config: { effort: "medium" },
        system: INSTRUCCIONES,
        messages: [{ role: "user", content: `Paquete de datos (JSON):\n\n${JSON.stringify(paquete)}` }],
      })
      .finalMessage();
    if (msg.stop_reason === "refusal") throw new Error("La IA no quiso responder.");
    const texto = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!texto) throw new Error(msg.stop_reason === "max_tokens" ? "Se cortó antes de terminar." : "La respuesta vino vacía.");
    const entrada = msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
    await rest(`ic_diagnosticos?id=eq.${id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ estado: "listo", texto, tokens_entrada: entrada, tokens_salida: msg.usage.output_tokens, costo_usd: costoReal(modelo, entrada, msg.usage.output_tokens), duracion_ms: Date.now() - t0 }),
    });
  } catch (e) {
    await rest(`ic_diagnosticos?id=eq.${id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ estado: "error", error: (e instanceof Error ? e.message : String(e)).slice(0, 500), duracion_ms: Date.now() - t0 }),
    }).catch(() => {});
  }
}
