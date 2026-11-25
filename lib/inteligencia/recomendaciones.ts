// Inteligencia comercial · bandeja única de recomendaciones (2026-11-25, fase 2).
//
// Junta lo que proponen las herramientas que ya existen, sin reemplazarlas:
//   - el motor de reglas de Google Ads (lib/gobernanzaAds, en vivo);
//   - las alertas del Centro de control (lib/inteligencia/centro);
//   - las propuestas abiertas del Estratega (estratega_propuestas);
//   - las recomendaciones abiertas del Analista (tarot_analista_recomendaciones,
//     con el "por qué" y el "cómo" del informe que las generó);
//   - los experimentos (ic_experimentos).
// Y hace lo que ninguna hace sola: une las repetidas, marca las viejas y las
// que probablemente ya se resolvieron, avisa cuando una choca con un
// experimento en curso o con un "esperá" del motor, separa lo que pide
// esperar por falta de datos y ordena por efecto en la rentabilidad.
//
// Las recomendaciones NO se guardan: se recalculan cada vez. Lo único que se
// guarda es lo que decide Manuel (ic_decisiones). Sin IA: no cuesta nada.
// Nada de acá toca Google, Meta, la web ni clientes.

import type { Rest } from "@/lib/asistenteParte";
import { gobernanzaGoogle } from "@/lib/gobernanzaAds/fuenteGoogle";
import type { Hallazgo } from "@/lib/gobernanzaAds/tipos";
import { calcularCentro, type Atencion } from "./centro";
import { gastoPublicitario } from "./gasto";
import { NOMBRE_CANAL, type Canal } from "./canales";
import { NEGOCIO_POR_DEFECTO } from "./negocio";
import { DIA, OFFSET_UY, ymd } from "./medicion";
import { fichas, parecido, sinTildes } from "./texto";
import { leerMemoria, relacionados, type Recuerdo } from "./memoria";

export type Area = "publicidad" | "pagina" | "checkout" | "medicion" | "oferta" | "postcompra" | "negocio" | "otro";
export type CanalRec = Canal | "negocio";
export type TipoFuente = "regla" | "centro" | "estratega" | "analista" | "experimento";
export type EstadoDecision = "aceptada" | "descartada" | "pospuesta" | "hecha" | "no_aplica";

export interface FuenteRec { tipo: TipoFuente; nombre: string; ref: string; fecha: string | null; enlace: string }
export interface Conflicto { tipo: "interferencia" | "contradiccion" | "esperar" | "memoria"; texto: string }
export interface Decision { estado: EstadoDecision; nota: string | null; posponer_hasta: string | null; decidida_at: string; experimento_id: string | null }

export interface Recomendacion {
  clave: string;
  canal: CanalRec;
  area: Area;
  tipo: "actuar" | "esperar";
  titulo: string;
  que_pasa: string;
  por_que_importa: string;
  accion: string;
  principio: string;
  resultado_esperado: string;
  como_medir: string;
  evidencia: "hecho" | "senal" | "hipotesis";
  evidencia_motivo: string;
  efecto: string;            // en qué mueve la rentabilidad
  prioridad: number;         // 0–100
  prioridad_motivo: string[];
  fuentes: FuenteRec[];
  repeticiones: number;
  fecha: string | null;      // la más reciente de sus fuentes
  vieja: boolean;
  posible_resuelta: string | null;
  conflictos: Conflicto[];
  sube_gasto: boolean;
  /** Lo que la memoria única ya sabe de este tema (fase 3). */
  memoria: { id: string; texto: string; nivel: Recuerdo["nivel"]; resultado: Recuerdo["resultado"]; ref: string | null }[];
  decision: Decision | null;
}

export interface Experimento {
  id: string; negocio_id: string; canal: string; nombre: string; hipotesis: string; cambios: string[];
  estado: "planificado" | "activo" | "cerrado" | "cancelado"; resultado: string | null;
  aplicado_desde: string | null; fin_previsto: string | null;
  volumen_minimo: { metrica: string; valor: number } | null;
  kpis: { clave: string; nombre: string; antes: string; esperado: string }[];
  criterios: { si: string; entonces: string }[];
  linea_base: Record<string, unknown> | null;
  faltantes: string[]; referencias: { titulo: string; url: string }[]; alcance: string[];
  conclusion: string | null; aprendizaje: string | null; created_at: string; updated_at: string;
}

export const DIAS_VIEJA = 14;
const NOMBRE_AREA: Record<Area, string> = {
  publicidad: "anuncios", pagina: "página", checkout: "checkout", medicion: "medición", oferta: "oferta y precio", postcompra: "después de la compra", negocio: "negocio", otro: "otro",
};
export { NOMBRE_AREA };

// ── Principios comerciales y por qué importa, por área (genéricos) ─────────
const PRINCIPIO: Record<Area, string> = {
  publicidad: "Pagar solo por la gente que puede comprar: cada clic sin intención de compra sube el costo por cliente.",
  pagina: "La página es la mitad del anuncio: si la gente se va al llegar, el clic se pagó igual.",
  checkout: "Quien ya decidió comprar no puede encontrar trabas: cada paso de más pierde ventas que ya se pagaron.",
  medicion: "Medir antes de optimizar: sin el dato de la venta no hay decisión rentable.",
  oferta: "El precio y los descuentos definen el margen: un descuento de más se come la ganancia de la venta.",
  postcompra: "Un cliente conforme vende por vos: las opiniones reales bajan el costo de convencer al próximo.",
  negocio: "Sin un objetivo económico claro no se sabe cuánto conviene invertir para conseguir un cliente.",
  otro: "Primero lo que más mueve el resultado; de a un cambio por vez para saber qué funcionó.",
};
const IMPORTA: Record<Area, string> = {
  publicidad: "Es plata que sale todos los días: lo que no vende sube el costo por cliente.",
  pagina: "Si la página no retiene, todo lo que se invierte en anuncios rinde menos.",
  checkout: "Afecta a quienes ya están por pagar: es la venta más cercana.",
  medicion: "Sin medir bien, cualquier decisión de inversión es a ciegas.",
  oferta: "Cambia cuánto deja cada venta y, con eso, cuánto se puede pagar por cliente.",
  postcompra: "Más confianza al llegar suele bajar lo que cuesta cada venta.",
  negocio: "Define si invertir más en publicidad hace ganar o perder plata.",
  otro: "Puede mover ventas o costos; conviene confirmarlo con datos.",
};
const EFECTO: Record<string, string> = {
  frena: "Frena una pérdida", convierte: "Mejora la conversión", mide: "Mide mejor", escala: "Escala lo rentable", ordena: "Ordena la decisión", otro: "Otro",
};

// ── Motor de reglas de Google Ads: textos por hallazgo ─────────────────────
const AREA_REGLA: Record<string, Area> = {
  medicion: "medicion", destino: "pagina", pagina_calidad: "pagina", velocidad: "pagina", embudo_pagina: "pagina", embudo_checkout: "checkout",
};
const TEXTO_REGLA: Record<string, { importa?: string; resultado: string; medir?: string; principio?: string }> = {
  medicion: { importa: "Sin el dato de compra, Google optimiza a ciegas.", resultado: "Google aprende qué clics venden y el costo por venta se puede controlar." },
  gasto_sin_ventas: { importa: "Es plata que se va sin volver: el costo por cliente sube cada día que sigue igual.", resultado: "Cortar el gasto que no vende o encontrar dónde se corta el camino a la compra.", principio: "Cortar la pérdida antes de buscar crecer." },
  costo_por_venta: { importa: "Si cada venta cuesta más de lo que deja, cada venta pierde plata.", resultado: "Costo por venta por debajo del objetivo.", medir: "Costo por venta de Google en el Centro de control, con al menos 3 ventas.", principio: "El costo de conseguir una venta tiene que quedar por debajo de lo que deja esa venta." },
  busquedas_basura: { importa: "Son clics de gente que no busca comprar: se pagan igual.", resultado: "Menos gasto sin perder ventas; costo por venta más bajo." },
  negativas_base: { importa: "Búsquedas que casi nunca compran (gratis, cursos, etc.) pueden activar el anuncio.", resultado: "Menos clics de curiosos desde el primer día." },
  amplias: { importa: "Las palabras amplias muestran el anuncio en búsquedas muy distintas a la que se eligió.", resultado: "Clics más parecidos a lo que se vende." },
  palabras_sin_ventas: { importa: "Ya gastaron lo suficiente para saber que no venden.", resultado: "El presupuesto se concentra en las palabras que sí venden." },
  palabras_que_venden: { importa: "Son las búsquedas que ya demostraron que venden.", resultado: "Más ventas desde lo que ya funciona." },
  palabras_prometen: { importa: "Muestran interés real aunque todavía no alcanzan para juzgarlas.", resultado: "Confirmar si venden con más datos." },
  fuerza: { importa: "Un anuncio débil se muestra menos y cuesta más por clic.", resultado: "Más clics al mismo costo." },
  rechazados: { importa: "Un anuncio rechazado no sale: el grupo pierde alcance.", resultado: "Recuperar las impresiones perdidas." },
  repetidas: { importa: "Palabras repetidas compiten entre sí y ensucian la medición.", resultado: "Datos más claros por palabra." },
};

function evidenciaRegla(h: Hallazgo, suficientes: boolean): { evidencia: Recomendacion["evidencia"]; motivo: string } {
  if (h.columna === "esperar") return { evidencia: "senal", motivo: h.falta ? `Faltan datos: ${h.falta}` : "Todavía no hay datos suficientes." };
  const deConfiguracion = ["medicion", "fuerza", "rechazados", "repetidas", "amplias", "negativas_base", "destino", "velocidad", "busquedas_basura"];
  if (deConfiguracion.includes(h.id)) return { evidencia: "hecho", motivo: "Sale de la configuración y las búsquedas reales de la cuenta." };
  return suficientes
    ? { evidencia: "hecho", motivo: "Hay ventas suficientes en el período para confiar en el número." }
    : { evidencia: "senal", motivo: "Pocas ventas en el período: es una señal, no una conclusión." };
}

// ── Similitud de textos (para unir recomendaciones repetidas) ──────────────
/** Temas reconocibles que unen textos aunque estén escritos distinto. */
const TEMAS: { id: string; re: RegExp }[] = [
  { id: "primera_pantalla", re: /primera pantalla/ },
  { id: "opiniones", re: /opinion|testimoni|resena/ },
  { id: "codigos_descuento", re: /codigos? de descuento/ },
  { id: "medicion_compras_google", re: /(medicion|conversion)[^.]{0,30}compras?[^.]{0,40}google|google[^.]{0,40}(medicion|conversion)[^.]{0,20}compra/ },
  { id: "publico_pais", re: /personas que viven en|viven en uruguay/ },
  { id: "bitacora", re: /bitacora/ },
];
const temaDe = (t: string) => TEMAS.find((x) => x.re.test(sinTildes(t)))?.id ?? null;

const fechaUY = (iso: string) => { const d = new Date(new Date(iso).getTime() - OFFSET_UY).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}`; };
const usd = (v: number) => `US$${v.toFixed(2).replace(".", ",")}`;
const hashCorto = (t: string) => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

type Get = (q: string) => Promise<any>;

interface AnalistaRec { id: string; informe_id: string; indice: number; prioridad: number; accion: string; donde: string; impacto: string | null; esfuerzo: string | null; como_medir: string | null; estado: string; created_at: string }
interface Propuesta { id: string; titulo: string; detalle: string | null; area: string | null; prioridad: string | null; created_at: string }

export interface Bandeja {
  ok: true;
  generado_at: string;
  para_decidir: Recomendacion[];
  esperando: Recomendacion[];
  pospuestas: Recomendacion[];
  aceptadas: Recomendacion[];
  decididas: (Decision & { clave: string; titulo: string; canal: string | null; fuentes: { tipo: string; id: string }[] })[];
  experimentos: Experimento[];
  fuentes: { nombre: string; ok: boolean; detalle: string; enlace: string }[];
  unidas: number;
  esperar_google: { esperar: boolean; hasta: string | null; motivo: string } | null;
}

export async function armarBandeja(rest: Rest, opciones: { negocio?: string; ahora?: number } = {}): Promise<Bandeja> {
  const get = rest as unknown as Get;
  const negocio = opciones.negocio ?? NEGOCIO_POR_DEFECTO;
  const ahora = opciones.ahora ?? Date.now();
  const hoy = ymd(ahora);

  const [gob, centro, analistas, propuestas, decisionesFilas, experimentos, memoria] = await Promise.all([
    gobernanzaGoogle(rest, 30).catch((e) => ({ ok: false as const, motivo: e instanceof Error ? e.message : String(e) })),
    calcularCentro(get, { negocio, dias: 30, atribucion: "ultimo", ahora }).catch((e) => ({ ok: false as const, motivo: e instanceof Error ? e.message : String(e) })),
    (get(`tarot_analista_recomendaciones?estado=in.(pendiente,en_curso)&select=id,informe_id,indice,prioridad,accion,donde,impacto,esfuerzo,como_medir,estado,created_at&order=created_at.desc`) as Promise<AnalistaRec[]>).catch(() => null),
    (get(`estratega_propuestas?estado=eq.propuesta&select=id,titulo,detalle,area,prioridad,created_at&order=created_at.desc`) as Promise<Propuesta[]>).catch(() => null),
    get(`ic_decisiones?negocio_id=eq.${encodeURIComponent(negocio)}&select=*&order=decidida_at.desc`) as Promise<(Decision & { clave: string; titulo: string; canal: string | null; fuentes: { tipo: string; id: string }[] })[]>,
    get(`ic_experimentos?negocio_id=eq.${encodeURIComponent(negocio)}&select=*&order=id.asc`) as Promise<Experimento[]>,
    leerMemoria(get, negocio).catch(() => [] as Recuerdo[]),
  ]);

  // "Por qué" y "cómo hacerlo" de cada recomendación del Analista, desde su informe.
  const detalleAnalista = new Map<string, { por_que?: string; como_hacerlo?: string }>();
  if (analistas?.length) {
    const ids = Array.from(new Set(analistas.map((a) => a.informe_id)));
    const informes = (await get(`tarot_analista_informes?id=in.(${ids.join(",")})&select=id,recs:contenido->recomendaciones`).catch(() => [])) as { id: string; recs: { prioridad?: number; accion?: string; por_que?: string; como_hacerlo?: string }[] | null }[];
    for (const inf of informes) {
      for (const a of analistas.filter((x) => x.informe_id === inf.id)) {
        const r = (inf.recs ?? []).find((x) => x.accion === a.accion) ?? (inf.recs ?? [])[a.indice] ?? null;
        if (r) detalleAnalista.set(a.id, { por_que: r.por_que, como_hacerlo: r.como_hacerlo });
      }
    }
  }

  const items: Recomendacion[] = [];
  const base = (p: Partial<Recomendacion> & Pick<Recomendacion, "clave" | "canal" | "area" | "titulo">): Recomendacion => ({
    tipo: "actuar", que_pasa: "", por_que_importa: IMPORTA[p.area], accion: "", principio: PRINCIPIO[p.area], resultado_esperado: "", como_medir: "",
    evidencia: "senal", evidencia_motivo: "", efecto: EFECTO.otro, prioridad: 40, prioridad_motivo: [], fuentes: [], repeticiones: 1, fecha: null,
    vieja: false, posible_resuelta: null, conflictos: [], sube_gasto: false, decision: null, memoria: [], ...p,
  });

  // ── 1. Motor de reglas de Google Ads ─────────────────────────────────────
  const fuentes: Bandeja["fuentes"] = [];
  let esperarGoogle: Bandeja["esperar_google"] = null;
  let medicionGoogleOk = false;
  if (gob.ok) {
    esperarGoogle = gob.revision;
    medicionGoogleOk = gob.hallazgos.some((h) => h.id === "medicion" && h.columna === "ok");
    const utiles = gob.hallazgos.filter((h) => h.columna !== "ok" && !h.id.startsWith("nota"));
    fuentes.push({ nombre: "Motor de reglas de Google Ads", ok: true, detalle: `${utiles.length} ${utiles.length === 1 ? "punto" : "puntos"} (últimos 30 días)`, enlace: "/admin/tarot/google-ads/diagnostico" });
    for (const h of utiles) {
      const area = AREA_REGLA[h.id] ?? "publicidad";
      const t = TEXTO_REGLA[h.id];
      const ev = evidenciaRegla(h, gob.kpis.suficientes);
      const esperar = h.columna === "esperar";
      const frena = h.columna === "frenar";
      const pesos: Record<string, Record<number, number>> = { frenar: { 3: 90, 2: 78, 1: 60 }, oportunidad: { 3: 70, 2: 58, 1: 45 }, escalar: { 3: 55, 2: 50, 1: 45 }, esperar: { 3: 30, 2: 25, 1: 20 } };
      const objetos = (h.objetos ?? []).slice().sort().join("|");
      items.push(base({
        clave: `regla:google_ads:${h.id}${objetos ? `:${hashCorto(objetos)}` : ""}`,
        canal: "google_ads", area, tipo: esperar ? "esperar" : "actuar",
        titulo: h.titulo,
        que_pasa: h.detalle + (h.objetos?.length ? ` (${h.objetos.slice(0, 6).join(", ")}${h.objetos.length > 6 ? `, y ${h.objetos.length - 6} más` : ""})` : ""),
        por_que_importa: t?.importa ?? IMPORTA[area],
        principio: t?.principio ?? PRINCIPIO[area],
        accion: esperar ? `Esperar. ${h.falta ?? ""}`.trim() : h.accion ?? "Revisarlo en el diagnóstico de Google Ads.",
        resultado_esperado: esperar ? "Juntar los datos que faltan para decidir sin reaccionar al ruido." : t?.resultado ?? "Mejor relación entre gasto y ventas en Google Ads.",
        como_medir: t?.medir ?? "El motor lo recalcula con cada sincronización de Google (06:15 y 18:15): cuando se resuelve, deja de aparecer acá.",
        evidencia: ev.evidencia, evidencia_motivo: ev.motivo,
        efecto: frena ? EFECTO.frena : h.columna === "escalar" ? EFECTO.escala : area === "medicion" ? EFECTO.mide : area === "publicidad" ? EFECTO.frena : EFECTO.convierte,
        prioridad: pesos[h.columna]?.[h.gravedad] ?? 40,
        prioridad_motivo: [frena ? "Frena gasto que no vuelve" : h.columna === "escalar" ? "Funciona dentro del objetivo" : esperar ? "Pide esperar datos" : "Oportunidad de mejora", h.gravedad === 3 ? "urgente según el motor" : h.gravedad === 2 ? "importante según el motor" : "menor según el motor"],
        fuentes: [{ tipo: "regla", nombre: "Motor de reglas de Google Ads", ref: h.id, fecha: new Date(ahora).toISOString(), enlace: "/admin/tarot/google-ads/diagnostico" }],
        fecha: new Date(ahora).toISOString(),
        sube_gasto: !!h.sube_gasto,
      }));
    }
  } else {
    fuentes.push({ nombre: "Motor de reglas de Google Ads", ok: false, detalle: `No se pudo leer (${gob.motivo}).`, enlace: "/admin/tarot/google-ads/diagnostico" });
  }

  // ── 2. Centro de control ─────────────────────────────────────────────────
  if (centro.ok) {
    const textos: Record<string, Omit<Partial<Recomendacion>, "clave"> & { area: Area; prioridad: number; efecto: string }> = {
      cac_sobre_margen: { area: "negocio", prioridad: 85, efecto: EFECTO.frena, accion: "No sumar inversión hasta bajar el costo por cliente: cortar lo que no vende y mejorar la conversión del tráfico que ya se paga.", por_que_importa: "Cada cliente nuevo hoy deja menos de lo que costó conseguirlo: más inversión agranda la pérdida.", resultado_esperado: "CAC publicitario por debajo del margen por venta.", como_medir: "CAC semana a semana del Centro de control contra la línea del máximo rentable.", principio: "El costo de conseguir un cliente tiene que quedar por debajo de lo que deja su primera compra (o de lo que deja en total, si vuelve)." },
      falta_cac_objetivo: { area: "negocio", prioridad: 65, efecto: EFECTO.ordena, accion: "Definir el CAC objetivo en Objetivos y economía (la tabla muestra cuánto se puede pagar para cada volumen de ventas).", resultado_esperado: "Todas las herramientas (y el motor de Google Ads) usan el mismo tope de costo por cliente.", como_medir: "Que el Centro de control compare el CAC contra el objetivo." },
      ventas_sin_origen: { area: "medicion", prioridad: 30, efecto: EFECTO.mide, accion: "Revisar en Visitantes por qué esas compras no quedaron unidas a una visita medida.", resultado_esperado: "Todas las ventas con su canal de origen.", como_medir: "Que «Otros» quede en 0 ventas en el Centro de control." },
    };
    let n = 0;
    for (const a of centro.atencion as Atencion[]) {
      const canal = (a.canal as Canal | undefined) ?? "negocio";
      if (a.id.startsWith("gasto_sin_ventas:")) {
        n += 1;
        items.push(base({
          clave: `centro:${a.id}`, canal, area: "publicidad", titulo: a.titulo, que_pasa: `${a.detalle} (últimos 30 días)`,
          por_que_importa: "Es plata que se va sin volver: el costo por cliente sube cada día que sigue igual.",
          accion: `Revisar ${NOMBRE_CANAL[canal as Canal] ?? "el canal"}: cortar lo que no vende o pausarlo hasta tener un cambio que probar.`,
          resultado_esperado: "Gasto del canal con ventas, o gasto en 0 mientras se corrige.", como_medir: "Inversión y ventas del canal en el Centro de control.",
          evidencia: "hecho", evidencia_motivo: "Gasto y ventas cobradas reales del período.", efecto: EFECTO.frena, prioridad: 88,
          prioridad_motivo: ["Frena gasto que no vuelve", "ya pasó lo que deja una venta"],
          fuentes: [{ tipo: "centro", nombre: "Centro de control", ref: a.id, fecha: new Date(ahora).toISOString(), enlace: "/admin/tarot/inteligencia" }], fecha: new Date(ahora).toISOString(),
        }));
        continue;
      }
      const t = textos[a.id];
      if (!t) continue; // días sin venta y pocas ventas son contexto, no acciones
      n += 1;
      items.push(base({
        clave: `centro:${a.id}`, canal, titulo: a.titulo, que_pasa: a.detalle, evidencia: "hecho", evidencia_motivo: "Datos reales del período (30 días).",
        prioridad_motivo: [t.efecto], fuentes: [{ tipo: "centro", nombre: "Centro de control", ref: a.id, fecha: new Date(ahora).toISOString(), enlace: a.enlace ?? "/admin/tarot/inteligencia" }],
        fecha: new Date(ahora).toISOString(), ...t,
      }));
    }
    fuentes.push({ nombre: "Centro de control", ok: true, detalle: `${n} ${n === 1 ? "alerta accionable" : "alertas accionables"}`, enlace: "/admin/tarot/inteligencia" });
  } else {
    fuentes.push({ nombre: "Centro de control", ok: false, detalle: `No se pudo calcular (${centro.motivo}).`, enlace: "/admin/tarot/inteligencia" });
  }

  // ── 3. Estratega ─────────────────────────────────────────────────────────
  if (propuestas) {
    fuentes.push({ nombre: "Estratega", ok: true, detalle: `${propuestas.length} ${propuestas.length === 1 ? "propuesta abierta" : "propuestas abiertas"}`, enlace: "/admin/tarot/estratega" });
    for (const p of propuestas) {
      const area: Area = /meta|google|anunc|campa/i.test(`${p.area} ${p.titulo}`) ? "publicidad" : "otro";
      const canal: CanalRec = /google/i.test(`${p.titulo} ${p.detalle}`) ? "google_ads" : /meta|facebook|instagram/i.test(`${p.titulo} ${p.detalle}`) ? "meta_ads" : "negocio";
      items.push(base({
        clave: `estratega:${p.id}`, canal, area, titulo: p.titulo, que_pasa: "Propuesta del Estratega a partir de los datos que consultó.", accion: p.detalle ?? p.titulo,
        resultado_esperado: "El que indica la propuesta (ver el detalle en el Estratega).", como_medir: "Según los pasos de la propuesta en el Estratega.",
        evidencia: "senal", evidencia_motivo: "Juicio de la IA sobre datos reales; no está validado.", efecto: area === "publicidad" ? EFECTO.frena : EFECTO.otro,
        prioridad: p.prioridad === "alta" ? 70 : p.prioridad === "baja" ? 40 : 55, prioridad_motivo: [`Prioridad ${p.prioridad ?? "media"} según el Estratega`],
        fuentes: [{ tipo: "estratega", nombre: "Estratega", ref: p.id, fecha: p.created_at, enlace: "/admin/tarot/estratega" }], fecha: p.created_at,
      }));
    }
  } else fuentes.push({ nombre: "Estratega", ok: false, detalle: "No se pudo leer.", enlace: "/admin/tarot/estratega" });

  // ── 4. Analista (unidas las repetidas) ───────────────────────────────────
  let unidas = 0;
  if (analistas) {
    const AREA_DONDE: Record<string, Area> = { meta: "publicidad", pagina_tarot: "pagina", checkout: "checkout", medicion: "medicion", oferta: "oferta", postcompra: "postcompra" };
    type Grupo = { recs: AnalistaRec[]; fichas: Set<string>; tema: string | null };
    const grupos: Grupo[] = [];
    for (const a of analistas) { // de la más nueva a la más vieja
      const f = fichas(a.accion), tema = temaDe(a.accion);
      const g = grupos.find((x) => (tema && x.tema === tema) || parecido(x.fichas, f) >= 0.6);
      if (g) { g.recs.push(a); unidas += 1; } else grupos.push({ recs: [a], fichas: f, tema });
    }
    fuentes.push({ nombre: "Analista", ok: true, detalle: `${analistas.length} abiertas en ${new Set(analistas.map((a) => a.informe_id)).size} informes${unidas ? ` · ${unidas} repetidas unidas` : ""}`, enlace: "/admin/tarot/analista" });
    for (const g of grupos) {
      const a = g.recs[0]; // la más reciente manda
      const texto = sinTildes(`${a.accion} ${a.donde}`);
      const area: Area = AREA_DONDE[a.donde] ?? (/google|meta|anunci|campan/.test(texto) ? "publicidad" : "otro");
      const canal: CanalRec = /google/.test(texto) ? "google_ads" : a.donde === "meta" || /\bmeta\b|facebook|instagram/.test(texto) ? "meta_ads" : "negocio";
      const det = detalleAnalista.get(a.id) ?? {};
      const vieja = ahora - new Date(a.created_at).getTime() > DIAS_VIEJA * DIA;
      const impacto = a.impacto ?? "medio";
      const enCurso = g.recs.some((r) => r.estado === "en_curso");
      let prioridad = (impacto === "alto" ? 62 : impacto === "bajo" ? 35 : 48) + (a.esfuerzo === "bajo" ? 5 : 0) - Math.max(0, (a.prioridad ?? 1) - 1) * 2;
      const motivo = [`Impacto ${impacto}${a.esfuerzo ? `, esfuerzo ${a.esfuerzo}` : ""} según el Analista`];
      if (g.recs.length > 1) { prioridad += Math.min(12, (g.recs.length - 1) * 4); motivo.push(`se repitió en ${g.recs.length} informes`); }
      if (vieja) { prioridad -= 25; motivo.push(`vieja: del ${fechaUY(a.created_at)}, puede no aplicar más`); }
      let posible: string | null = null;
      if (g.tema === "medicion_compras_google" && medicionGoogleOk) {
        posible = "El motor de Google Ads confirma que la medición de compras ya está activa: probablemente ya se hizo.";
        prioridad -= 30; motivo.push("probablemente ya resuelta");
      }
      items.push(base({
        clave: `analista:${a.id}`, canal, area, titulo: a.accion,
        que_pasa: det.por_que ?? "El informe no guardó el motivo de esta recomendación.",
        accion: det.como_hacerlo ?? a.accion,
        resultado_esperado: `Según el Analista, impacto ${impacto} en la conversión o el costo.`,
        como_medir: a.como_medir ?? "El informe no indicó cómo medirla.",
        evidencia: "senal", evidencia_motivo: "Juicio de la IA sobre los datos de ese momento; no está validado con un antes y después.",
        efecto: area === "publicidad" ? EFECTO.frena : area === "medicion" ? EFECTO.mide : ["pagina", "checkout", "oferta", "postcompra"].includes(area) ? EFECTO.convierte : EFECTO.otro,
        prioridad: Math.max(5, prioridad), prioridad_motivo: motivo,
        fuentes: g.recs.map((r) => ({ tipo: "analista" as const, nombre: "Analista", ref: r.id, fecha: r.created_at, enlace: `/admin/tarot/analista?informe=${r.informe_id}` })),
        repeticiones: g.recs.length, fecha: a.created_at, vieja, posible_resuelta: posible,
        decision: enCurso ? { estado: "aceptada", nota: "En curso según el Analista.", posponer_hasta: null, decidida_at: a.created_at, experimento_id: null } : null,
      }));
    }
  } else fuentes.push({ nombre: "Analista", ok: false, detalle: "No se pudo leer.", enlace: "/admin/tarot/analista" });

  // ── 5. Experimentos ──────────────────────────────────────────────────────
  const vivos = experimentos.filter((e) => e.estado === "planificado" || e.estado === "activo");
  if (vivos.length) {
    const desde = Math.min(...vivos.map((e) => new Date(e.created_at).getTime()));
    const gasto = await gastoPublicitario(get, ymd(desde)).catch(() => []);
    for (const e of vivos) {
      const canal = e.canal as Canal;
      if (e.estado === "planificado") {
        const desdeE = ymd(new Date(e.created_at).getTime());
        const gastado = gasto.filter((g) => g.canal === canal && g.fecha >= desdeE);
        const monto = gastado.reduce((s, g) => s + g.monto, 0);
        const moneda = gastado[0]?.moneda ?? "USD";
        const diasFin = e.fin_previsto ? Math.ceil((new Date(`${e.fin_previsto}T23:59:59-03:00`).getTime() - ahora) / DIA) : null;
        items.push(base({
          clave: `experimento:${e.id}:sin_aplicar`, canal, area: "publicidad",
          titulo: `${e.id} está planificado pero no aplicado`,
          que_pasa: `«${e.nombre}» se decidió y todavía no se aplicó.${monto > 0 ? ` Desde que se cargó (${fechaUY(e.created_at)}) ${NOMBRE_CANAL[canal]} siguió gastando ${moneda === "USD" ? usd(monto) : `$ ${Math.round(monto)}`} con la estructura que el experimento quiere cambiar.` : ""}${diasFin != null ? ` Quedan ${Math.max(diasFin, 0)} ${diasFin === 1 ? "día" : "días"} hasta el fin previsto (${fechaUY(`${e.fin_previsto}T12:00:00-03:00`)}).` : ""}`,
          por_que_importa: "Cada día con la estructura vieja es gasto que ya se decidió cortar, y menos días para juntar datos del cambio.",
          accion: `Aplicar el plan (o cancelar el experimento) y marcar la fecha en Acciones y experimentos.${e.volumen_minimo ? ` Para juzgarlo hacen falta ${e.volumen_minimo.valor} ${e.volumen_minimo.metrica}.` : ""}`,
          principio: "Una decisión sin ejecutar no deja aprendizaje: se prueba con fecha clara o se descarta.",
          resultado_esperado: e.kpis.map((k) => `${k.nombre}: ${k.esperado}`).join(" · "),
          como_medir: "En Acciones y experimentos, antes y después de la fecha de aplicación, con los criterios del plan.",
          evidencia: "hecho", evidencia_motivo: "El experimento sigue en «planificado» y la cuenta no registra la versión nueva.",
          efecto: EFECTO.ordena, prioridad: monto > 0 ? 82 : 60, prioridad_motivo: ["Decisión tomada sin ejecutar", monto > 0 ? "el canal sigue gastando con la estructura vieja" : "sin gasto desde que se cargó"],
          fuentes: [{ tipo: "experimento", nombre: e.id, ref: e.id, fecha: e.created_at, enlace: "/admin/tarot/inteligencia/experimentos" }], fecha: e.created_at,
        }));
      }
    }
  }

  // ── Interferencias y contradicciones ─────────────────────────────────────
  for (const r of items) {
    if (r.tipo !== "actuar" || r.clave.startsWith("experimento:")) continue;
    for (const e of vivos) {
      const alcance = new Set(e.alcance ?? []);
      const toca = (r.area === "publicidad" && alcance.has(r.canal)) || alcance.has(r.area) || (r.area === "medicion" && alcance.has(r.canal));
      if (!toca) continue;
      r.conflictos.push({ tipo: "interferencia", texto: `Puede interferir con ${e.id} («${e.nombre}», ${e.estado === "activo" ? "en curso" : "planificado"}): si se cambia ${r.area === "publicidad" ? NOMBRE_CANAL[r.canal as Canal] ?? "el canal" : `la ${NOMBRE_AREA[r.area]}`} mientras corre, no se va a saber qué funcionó. Conviene esperar${e.fin_previsto ? ` al ${fechaUY(`${e.fin_previsto}T12:00:00-03:00`)}` : " a que termine"} o sumarlo al experimento.` });
      r.prioridad = Math.max(5, r.prioridad - 15);
      r.prioridad_motivo.push(`choca con ${e.id}`);
    }
    if (esperarGoogle?.esperar && r.canal === "google_ads") {
      r.conflictos.push({ tipo: "esperar", texto: `El motor de Google Ads pide no tocar la campaña todavía: ${esperarGoogle.motivo}` });
    }
  }
  // ── La memoria, consultada antes de recomendar ───────────────────────────
  // Lo que ya se sabe del tema, y avisos si algo parecido ya se probó y no
  // funcionó o si Manuel ya lo descartó con un motivo.
  const activos = memoria.filter((m) => m.activo);
  const fracasos = memoria.filter((m) => m.resultado === "no_funciono");
  const descartadas = decisionesFilas.filter((d) => (d.estado === "descartada" || d.estado === "no_aplica") && d.nota && !/^Vieja \(/.test(d.nota));
  for (const r of items) {
    const texto = r.titulo;
    r.memoria = relacionados(texto, activos, 2).map((m) => ({ id: m.id, texto: m.texto, nivel: m.nivel, resultado: m.resultado, ref: m.ref }));
    for (const m of relacionados(texto, fracasos, 1, 0.35)) {
      r.conflictos.push({ tipo: "memoria", texto: `Ya se probó algo parecido y no funcionó${m.ref ? ` (${m.ref})` : ""}: «${m.texto}»${m.evidencia ? ` ${m.evidencia}` : ""}` });
    }
    const f = fichas(r.titulo);
    const previa = descartadas.find((d) => d.clave !== r.clave && parecido(f, fichas(d.titulo)) >= 0.6);
    if (previa) r.conflictos.push({ tipo: "memoria", texto: `Ya descartaste algo parecido el ${fechaUY(previa.decidida_at)} («${previa.titulo}»): ${previa.nota}` });
  }

  // Escalar (subir inversión) mientras el negocio pierde en cada cliente: contradicción.
  const negocioPierde = items.some((r) => r.clave === "centro:cac_sobre_margen" || r.clave.startsWith("centro:gasto_sin_ventas"));
  for (const r of items.filter((x) => x.sube_gasto)) {
    if (negocioPierde) r.conflictos.push({ tipo: "contradiccion", texto: "Sugiere subir la inversión, pero el Centro de control muestra que hoy cada cliente cuesta más de lo que deja (o que hay gasto sin ventas). Primero resolver eso." });
  }

  // ── Decisiones de Manuel ────────────────────────────────────────────────
  const decisionPor = new Map(decisionesFilas.map((d) => [d.clave, d]));
  const vistas = new Set<string>();
  const paraDecidir: Recomendacion[] = [], esperando: Recomendacion[] = [], pospuestas: Recomendacion[] = [], aceptadas: Recomendacion[] = [];
  for (const r of items) {
    const d = decisionPor.get(r.clave);
    if (d) { vistas.add(r.clave); r.decision = { estado: d.estado, nota: d.nota, posponer_hasta: d.posponer_hasta, decidida_at: d.decidida_at, experimento_id: d.experimento_id }; }
    const est = r.decision?.estado;
    if (est === "descartada" || est === "hecha" || est === "no_aplica") continue;
    if (est === "pospuesta" && r.decision?.posponer_hasta && r.decision.posponer_hasta > hoy) { pospuestas.push(r); continue; }
    if (est === "aceptada") { aceptadas.push(r); continue; }
    (r.tipo === "esperar" ? esperando : paraDecidir).push(r);
  }
  const orden = (a: Recomendacion, b: Recomendacion) => b.prioridad - a.prioridad || (b.fecha ?? "").localeCompare(a.fecha ?? "");
  paraDecidir.sort(orden); esperando.sort(orden); pospuestas.sort(orden); aceptadas.sort(orden);

  return {
    ok: true, generado_at: new Date(ahora).toISOString(),
    para_decidir: paraDecidir, esperando, pospuestas, aceptadas,
    // Decisiones cerradas (hechas, descartadas, ya no aplica): memoria de lo decidido.
    decididas: decisionesFilas.filter((d) => ["descartada", "hecha", "no_aplica"].includes(d.estado)).slice(0, 60),
    experimentos, fuentes, unidas, esperar_google: esperarGoogle,
  };
}
