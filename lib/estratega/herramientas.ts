// Estratega de anuncios (2026-11-04): las consultas que puede hacer la IA.
// Todas son de SOLO LECTURA sobre la base, salvo "proponer", que solo guarda
// una propuesta en estratega_propuestas (no toca Pendientes hasta que Manuel
// la acepta). Ninguna devuelve nombres, teléfonos, emails ni IPs de clientes.
// La misma lista se muestra en Admin → Estratega → "Qué datos ve".

import { calcularEstrategico } from "@/lib/estrategico";
import { diagnosticar, type MetaPanel } from "@/lib/metaAds/diagnostico";

export type Rest = (q: string, init?: RequestInit) => Promise<any>;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const AGRUPAR = ["fuente", "campana", "anuncio", "ubicacion", "dispositivo", "dia", "landing", "ciudad"] as const;
const PRIORIDADES = new Set(["alta", "media", "baja"]);
// Tope por resultado: lo que pase de acá se corta (la IA ve que está cortado).
const MAX_CARACTERES = 40_000;

const hoyUy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const haceDias = (n: number) => new Date(Date.now() - 3 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);
// Fechas de Montevideo (día completo) a instantes.
const inicioDia = (f: string) => `${f}T00:00:00-03:00`;
const finDia = (f: string) => new Date(Date.parse(`${f}T00:00:00-03:00`) + 86_400_000).toISOString();
const entero = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
};
const rango = (i: Record<string, unknown>, porDefecto: number) => {
  const desde = typeof i.desde === "string" && FECHA.test(i.desde) ? i.desde : haceDias(porDefecto - 1);
  const hasta = typeof i.hasta === "string" && FECHA.test(i.hasta) ? i.hasta : hoyUy();
  return { desde, hasta };
};

export interface Herramienta {
  name: string;
  /** Lo que se muestra en "Qué datos ve". */
  titulo: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
  /** Entrada de ejemplo para la vista previa del admin (null: no se previsualiza). */
  ejemplo: Record<string, unknown> | null;
  correr: (rest: Rest, input: Record<string, unknown>, ctx: Contexto) => Promise<unknown>;
}
export interface Contexto { mensajeId?: string | null; informeId?: string | null }

const rangoProps = {
  desde: { type: "string", description: "Fecha inicial YYYY-MM-DD (hora de Montevideo). Por defecto, hace 7 días." },
  hasta: { type: "string", description: "Fecha final YYYY-MM-DD, incluida. Por defecto, hoy." },
};

export const HERRAMIENTAS: Herramienta[] = [
  {
    name: "economia",
    titulo: "Economía y ventas",
    description: "Ventas cobradas, ingresos, comisión de Mercado Pago, costo de IA/audio/WhatsApp, costos fijos y puntuales, publicidad cargada a mano, resultado, CAC, punto de equilibrio, embudo general, origen de las ventas y recompra. Compara el período con el anterior de igual largo. También trae la lista de costos cargados en Presupuesto.",
    input_schema: { type: "object", additionalProperties: false, properties: { dias: { type: "integer", description: "Largo del período en días (1 a 90). Por defecto 30." } } },
    ejemplo: { dias: 30 },
    correr: async (rest, i) => {
      const dias = entero(i.dias, 30, 1, 90);
      const [r, costos, publicidad] = await Promise.all([
        calcularEstrategico((q) => rest(q), dias, false),
        rest("tarot_costos?select=nombre,categoria,tipo,monto,moneda,frecuencia,fecha_desde,fecha_hasta,activo,notas&order=tipo.asc"),
        rest("campaign_costs?select=date,platform,utm_campaign,amount,currency,notes&order=date.desc&limit=60"),
      ]);
      // "atender" trae nombres de clientes: no se le pasa a la IA.
      const { atender: _fuera, ...resto } = r;
      return { ...resto, costos_cargados: costos, publicidad_cargada_a_mano: publicidad };
    },
  },
  {
    name: "embudo",
    titulo: "Embudo agrupado",
    description: "Visitas reales (sin tráfico interno ni robots de Meta) agrupadas, con: sesiones, personas, % que se va en 5 segundos o menos, mediana de segundos, cuántos vieron el producto, llegaron al checkout, ventas e ingresos. agrupar: fuente (Meta Ads, Google Ads, Directo…), campana (utm_campaign), anuncio (utm_content), ubicacion (utm_source: fb, ig, wa = Estado de WhatsApp, google…), dispositivo, dia, landing (primera página) o ciudad.",
    input_schema: { type: "object", additionalProperties: false, properties: { ...rangoProps, agrupar: { type: "string", enum: [...AGRUPAR] } }, required: ["agrupar"] },
    ejemplo: { agrupar: "fuente" },
    correr: async (rest, i) => {
      const { desde, hasta } = rango(i, 7);
      const agrupar = AGRUPAR.includes(i.agrupar as (typeof AGRUPAR)[number]) ? i.agrupar : "fuente";
      const filas = await rest("rpc/estratega_embudo", { method: "POST", body: JSON.stringify({ p_desde: inicioDia(desde), p_hasta: finDia(hasta), p_agrupar: agrupar }) });
      return { desde, hasta, agrupar, filas };
    },
  },
  {
    name: "sesiones",
    titulo: "Visitas una por una",
    description: "Últimas visitas reales con su comportamiento: hora, fuente, ubicación, campaña, anuncio, dispositivo, ciudad, si es recurrente, segundos en la web, páginas, scroll máximo (%), si llegó al checkout, si compró y qué tocó (acciones: secciones vistas, botones, campos del formulario). Sin datos personales. Útil para entender por qué se van.",
    input_schema: {
      type: "object", additionalProperties: false,
      properties: {
        ...rangoProps,
        fuente: { type: "string", description: "Filtrar por fuente exacta, ej. \"Meta Ads\" o \"Google Ads\"." },
        campana: { type: "string", description: "Filtrar por utm_campaign exacta, ej. \"meta_exp2\"." },
        solo_checkout: { type: "boolean", description: "Solo las que llegaron al checkout." },
        limite: { type: "integer", description: "Máximo de filas (1 a 200). Por defecto 60." },
      },
    },
    ejemplo: { limite: 10 },
    correr: async (rest, i) => {
      const { desde, hasta } = rango(i, 7);
      const filas = await rest("rpc/estratega_sesiones", {
        method: "POST",
        body: JSON.stringify({
          p_desde: inicioDia(desde), p_hasta: finDia(hasta),
          p_fuente: typeof i.fuente === "string" && i.fuente ? i.fuente.slice(0, 60) : null,
          p_campana: typeof i.campana === "string" && i.campana ? i.campana.slice(0, 120) : null,
          p_solo_checkout: i.solo_checkout === true,
          p_limite: entero(i.limite, 60, 1, 200),
        }),
      });
      return { desde, hasta, filas };
    },
  },
  {
    name: "meta_ads",
    titulo: "Meta Ads",
    description: "Datos de la cuenta de Meta Ads sincronizados cada hora: campañas (todas, también las borradas, con gasto total), configuración de campañas / conjuntos / anuncios (objetivo, presupuesto, público, ubicaciones), gasto, impresiones, clics y compras de Meta por día, por ubicación y por anuncio; visitas, checkout y ventas medidas en la web para esas campañas; cambios detectados y diagnóstico automático. Moneda de la cuenta: UYU.",
    input_schema: {
      type: "object", additionalProperties: false,
      properties: {
        dias: { type: "integer", description: "Días hacia atrás (1 a 90). Por defecto 14." },
        campana: { type: "string", description: "Id de campaña de Meta para filtrar (sale de la lista 'campanas'). Sin esto: toda la cuenta." },
      },
    },
    ejemplo: { dias: 7 },
    correr: async (rest, i) => {
      const campana = typeof i.campana === "string" && /^\d{5,25}$/.test(i.campana) ? i.campana : null;
      const panel = (await rest("rpc/meta_ads_panel", { method: "POST", body: JSON.stringify({ p_dias: entero(i.dias, 14, 1, 90), p_campana: campana }) })) as MetaPanel;
      const diag = panel?.cuenta ? diagnosticar(panel) : null;
      // El panel no trae la configuración completa (público, ubicaciones, evento): se suma acá.
      const ids = (panel?.objetos ?? []).map((o) => o.id).filter((id) => /^\d{5,25}$/.test(id)).slice(0, 60);
      const configs = ids.length ? ((await rest(`meta_ads_objetos?id=in.(${ids.join(",")})&select=id,config`)) as { id: string; config: unknown }[]) : [];
      const configDe = new Map(configs.map((c) => [c.id, c.config]));
      return { ...panel, objetos: (panel?.objetos ?? []).map((o) => ({ ...o, config: configDe.get(o.id) ?? null })), diagnostico: diag };
    },
  },
  {
    name: "google_ads",
    titulo: "Google Ads",
    description: "Lo que la web mide de las visitas de Google Ads: resumen (visitas, vieron producto, checkout, empezaron formulario, fueron a pagar, ventas, ingresos), por día, páginas de llegada, dispositivos, términos de búsqueda (utm_term), visitas una por una y comparación con otras fuentes. El GASTO de Google no está acá: está en Presupuesto (publicidad cargada a mano) o en el documento de economía.",
    input_schema: { type: "object", additionalProperties: false, properties: { dias: { type: "integer", description: "Días hacia atrás (1 a 90). Por defecto 14." } } },
    ejemplo: { dias: 14 },
    correr: async (rest, i) => rest("rpc/google_ads_panel", { method: "POST", body: JSON.stringify({ p_dias: entero(i.dias, 14, 1, 90) }) }),
  },
  {
    name: "experimentos",
    titulo: "Campañas registradas",
    description: "Campañas y experimentos registrados en Admin → Campañas Ads: utm_campaign, plataforma, objetivo, página de destino, presupuesto, fechas, estado y notas.",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
    ejemplo: {},
    correr: async (rest) => rest("ads_campanas?select=utm_campaign,nombre,plataforma,objetivo,destino_path,presupuesto,moneda,fecha_inicio,fecha_fin,estado,notas&order=fecha_inicio.desc.nullslast"),
  },
  {
    name: "pendientes",
    titulo: "Pendientes abiertos",
    description: "Tareas abiertas de Admin → Pendientes (de Manuel, de Claude y de terceros): título, detalle, área, prioridad, estado y vencimiento. Sirve para no proponer algo que ya está anotado y para ver qué falta hacer (ej. pasos de Google Ads).",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
    ejemplo: {},
    correr: async (rest) => rest("admin_pendientes?estado=in.(abierto,en_curso,esperando)&select=titulo,detalle,area,responsable,prioridad,estado,vence,created_at&order=created_at.desc&limit=80"),
  },
  {
    name: "proponer",
    titulo: "Dejar una propuesta (no ejecuta nada)",
    description: "Deja una propuesta concreta para que Manuel la acepte o la descarte con un botón. Si la acepta, pasa a Pendientes y a 'Decisiones tomadas'. Usarla solo para acciones claras y accionables (máximo 3 por respuesta). El detalle tiene que ser ejecutable sin preguntar: dónde tocar, qué valores poner, cuándo revisar y qué número decide.",
    input_schema: {
      type: "object", additionalProperties: false,
      properties: {
        titulo: { type: "string", description: "Corto, empieza con verbo. Ej: \"Pausar el exp 2 de Meta\"." },
        detalle: { type: "string", description: "Pasos exactos y cómo medir si funcionó." },
        prioridad: { type: "string", enum: ["alta", "media", "baja"] },
      },
      required: ["titulo", "detalle", "prioridad"],
    },
    ejemplo: null,
    correr: async (rest, i, ctx) => {
      const titulo = String(i.titulo ?? "").trim().slice(0, 160);
      const detalle = String(i.detalle ?? "").trim().slice(0, 3000);
      if (titulo.length < 3 || detalle.length < 3) return { ok: false, motivo: "Falta título o detalle." };
      const [fila] = await rest("estratega_propuestas", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          titulo, detalle, prioridad: PRIORIDADES.has(String(i.prioridad)) ? i.prioridad : "media",
          mensaje_id: ctx.mensajeId ?? null, informe_id: ctx.informeId ?? null,
        }),
      });
      return { ok: true, id: fila?.id, nota: "Quedó como propuesta: Manuel la acepta o descarta desde el admin." };
    },
  },
];

const porNombre = new Map(HERRAMIENTAS.map((h) => [h.name, h]));

/** Definición para la API de Anthropic. */
export const definicionesHerramientas = () => HERRAMIENTAS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

/** Corre una herramienta y devuelve el texto (JSON, cortado si es enorme). */
export async function correrHerramienta(rest: Rest, nombre: string, input: unknown, ctx: Contexto): Promise<{ texto: string; error: boolean }> {
  const h = porNombre.get(nombre);
  if (!h) return { texto: `Herramienta desconocida: ${nombre}`, error: true };
  try {
    const r = await h.correr(rest, input && typeof input === "object" ? (input as Record<string, unknown>) : {}, ctx);
    const t = JSON.stringify(r);
    return { texto: t.length > MAX_CARACTERES ? `${t.slice(0, MAX_CARACTERES)}… [cortado: ${t.length} caracteres en total; pedí un período más corto o un filtro]` : t, error: false };
  } catch (e: unknown) {
    return { texto: `Error al consultar: ${e instanceof Error ? e.message : String(e)}`, error: true };
  }
}
