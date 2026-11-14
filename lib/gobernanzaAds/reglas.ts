import type { ConfigGobernanza, EntradaGobernanza, Hallazgo, Kpis, ResultadoGobernanza } from "./tipos";

// Motor de reglas del módulo de gobernanza de Google Ads (2026-11-14).
// Función pura: misma entrada → mismos hallazgos. Sin IA, sin red, sin base.
//
// Regla de oro: ninguna conclusión con pocos datos. Cada regla tiene su mínimo
// (ConfigGobernanza.minimos); por debajo, el hallazgo va a la columna
// "esperar" diciendo qué falta. Y ninguna recomendación que suba el gasto se
// marca como aplicable: lleva sube_gasto y la decide el dueño (REGLA MÁXIMA).

const DIA = 86_400_000;
const sinTilde = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const pct = (x: number) => `${Math.round(x * 100)} %`;
const seg = (ms: number) => (ms / 1000).toFixed(1).replace(".", ",");
const CONC: Record<string, string> = { BROAD: "amplia", PHRASE: "frase", EXACT: "exacta" };
const INACTIVA = new Set(["PAUSED", "REMOVED", "ENDED"]);

function dinero(n: number, moneda: string) {
  const fijo = (d: number) => n.toLocaleString("es-UY", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (moneda === "USD") return `US$ ${fijo(2)}`;
  if (moneda === "UYU") return `$ ${fijo(0)}`;
  return `${moneda} ${fijo(2)}`;
}
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: "America/Montevideo" });

/** ¿El término queda bloqueado por alguna negativa? (exacta = igual; frase = contiene la frase; amplia = contiene todas las palabras). */
export function bloqueadoPor(termino: string, negativas: { texto: string; concordancia: string }[]) {
  const t = sinTilde(termino); const palabras = new Set(t.split(/\s+/));
  return negativas.find((n) => {
    const x = sinTilde(n.texto);
    if (n.concordancia === "EXACT") return t === x;
    if (n.concordancia === "PHRASE") return ` ${t} `.includes(` ${x} `);
    return x.split(/\s+/).every((w) => palabras.has(w));
  }) ?? null;
}
const contiene = (texto: string, frase: string) => ` ${sinTilde(texto)} `.includes(` ${sinTilde(frase)} `);

export function calcularKpis(e: EntradaGobernanza, cfg: ConfigGobernanza): Kpis {
  const gastoVenta = e.periodo.costo * e.moneda.tipo_cambio;
  const v = e.web.ventas;
  return {
    gasto_cuenta: e.periodo.costo, gasto_venta: gastoVenta, clics: e.periodo.clics, impresiones: e.periodo.impresiones,
    ventas: v, ingresos: e.web.ingresos,
    costo_por_venta: v > 0 ? gastoVenta / v : null,
    retorno: gastoVenta > 0 ? e.web.ingresos / gastoVenta : null,
    conversion: e.periodo.clics > 0 ? v / e.periodo.clics : null,
    suficientes: v >= cfg.minimos.ventas_para_cpa,
  };
}

// ── Piezas compartidas con las propuestas (propuestas.ts) ───────────────

/** Palabras activas agrupadas por texto (exacta y frase juntas: la web no distingue la concordancia), según si venden. */
export function clasificarPalabras(e: EntradaGobernanza, cfg: ConfigGobernanza) {
  const tc = e.moneda.tipo_cambio, tope = 2 * cfg.cpa_objetivo;
  const webPal = new Map<string, number>();
  for (const w of e.web_por_palabra) webPal.set(sinTilde(w.palabra), (webPal.get(sinTilde(w.palabra)) ?? 0) + w.ventas);
  const porTexto = new Map<string, { palabra: string; costo: number; impresiones: number; ids: string[] }>();
  for (const p of e.palabras.filter((x) => x.activa)) {
    const kk = sinTilde(p.palabra); const a = porTexto.get(kk) ?? { palabra: p.palabra, costo: 0, impresiones: 0, ids: [] };
    porTexto.set(kk, { ...a, costo: a.costo + p.costo, impresiones: a.impresiones + p.impresiones, ids: p.id ? [...a.ids, p.id] : a.ids });
  }
  // Una sola venta no prueba que una palabra funcione: hacen falta al menos 2.
  const ventasPalabra = Math.min(2, cfg.minimos.ventas_para_cpa);
  type P = { palabra: string; costoV: number; ventas: number; ids: string[] };
  const sinVender: P[] = [], venden: P[] = [], prometen: P[] = []; let sinDatos = 0;
  for (const [kk, p] of porTexto) {
    const x: P = { palabra: p.palabra, costoV: p.costo * tc, ventas: webPal.get(kk) ?? 0, ids: p.ids };
    if (x.ventas === 0 && x.costoV >= tope) sinVender.push(x);
    else if (x.ventas >= ventasPalabra && x.costoV / x.ventas <= cfg.cpa_objetivo) venden.push(x);
    else if (x.ventas > 0 && x.ventas < ventasPalabra) prometen.push(x);
    else if (x.ventas === 0 && p.impresiones > 0) sinDatos++;
  }
  return { sinVender, venden, prometen, sinDatos, ventasPalabra };
}

/** Búsquedas reales no bloqueadas que contienen una negativa base (gratis, curso…). */
export function busquedasBasura(e: EntradaGobernanza, cfg: ConfigGobernanza) {
  const terminos = Object.values(e.terminos.reduce<Record<string, { termino: string; impresiones: number; clics: number; costo: number }>>((acc, t) => {
    const kk = sinTilde(t.termino); const a = (acc[kk] ??= { termino: t.termino, impresiones: 0, clics: 0, costo: 0 });
    a.impresiones += t.impresiones; a.clics += t.clics; a.costo += t.costo; return acc;
  }, {}));
  const basura: { termino: string; neg: string; clics: number; costo: number }[] = [];
  for (const t of terminos) {
    if (bloqueadoPor(t.termino, e.negativas)) continue;
    const neg = cfg.negativas_base.find((n) => contiene(t.termino, n));
    if (neg) basura.push({ termino: t.termino, neg, clics: t.clics, costo: t.costo });
  }
  return basura;
}

/**
 * Negativas base que todavía no están cargadas (sin contar las que ya propone
 * busquedasBasura). Se compara el texto tal cual (en minúsculas), con tildes:
 * para Google «que es» y «qué es» son negativas distintas.
 */
export function negativasFaltantes(e: EntradaGobernanza, cfg: ConfigGobernanza, basura: { neg: string }[]) {
  const norm = (s: string) => s.toLowerCase().trim();
  const yaNegadas = new Set(e.negativas.map((n) => norm(n.texto)));
  const usadas = new Set(basura.map((b) => norm(b.neg)));
  return [...new Set(cfg.negativas_base.map(norm))].filter((n) => !yaNegadas.has(n) && !usadas.has(n));
}

export { sinTilde };

export function diagnosticar(e: EntradaGobernanza, cfg: ConfigGobernanza, ahora = Date.now()): ResultadoGobernanza {
  const H: Hallazgo[] = [];
  const mv = e.moneda.venta, mc = e.moneda.cuenta, tc = e.moneda.tipo_cambio;
  const $v = (n: number) => dinero(n, mv);
  const $c = (n: number) => dinero(n, mc);
  const k = calcularKpis(e, cfg);
  const min = cfg.minimos;
  const tope = 2 * cfg.cpa_objetivo; // gasto a partir del cual "sin ventas" ya es un dato

  // ── Medición ───────────────────────────────────────────────────────────
  if (!e.medicion_compras) {
    H.push({ id: "medicion", columna: "frenar", gravedad: 3, titulo: "Google no recibe las compras", detalle: "Sin la medición de compras, Google no sabe qué clics terminan en venta y optimiza a ciegas.", accion: "Activar la medición de compras antes de cualquier otro cambio." });
  } else {
    H.push({ id: "medicion", columna: "ok", gravedad: 1, titulo: "Medición de compras activa", detalle: "Cada venta se le avisa a Google con su valor." });
  }

  // ── Plata: ¿lo gastado vuelve? ─────────────────────────────────────────
  // Dónde se corta el embudo (para decir qué hacer, no solo que falla).
  const dondeSeCorta = e.web.visitas > 0 && e.web.checkout / e.web.visitas < 0.1
    ? "La gente no pasa de la página: revisar la página antes de gastar más."
    : e.web.checkout > 0 && e.web.fueron_a_pagar === 0
      ? "Llegan al checkout pero nadie va a pagar: el problema está en el checkout, no en los anuncios."
      : "Llegan a pagar y no compran: revisar el paso de pago.";
  if (k.ventas === 0) {
    if (k.gasto_venta >= tope) {
      H.push({ id: "gasto_sin_ventas", columna: "frenar", gravedad: 3, titulo: `${$v(k.gasto_venta)} gastados sin ventas en ${e.dias} días`, detalle: `Ya es más del doble de lo que aceptás pagar por una venta (${$v(cfg.cpa_objetivo)}).`, accion: dondeSeCorta });
    } else {
      H.push({ id: "gasto_sin_ventas", columna: "esperar", gravedad: 2, titulo: "Todavía sin ventas, pero es pronto para juzgar", detalle: `Gastado: ${$v(k.gasto_venta)} en ${e.dias} días.`, falta: `Recién con ${$v(tope)} gastados sin ventas es una señal (2× tu costo objetivo).` });
    }
  } else if (!k.suficientes) {
    H.push({ id: "costo_por_venta", columna: "esperar", gravedad: 1, titulo: `${k.ventas} ${k.ventas === 1 ? "venta" : "ventas"}: pocas para saber cuánto cuesta vender`, detalle: `Hoy da ${$v(k.costo_por_venta ?? 0)} por venta (objetivo ${$v(cfg.cpa_objetivo)}), pero con tan pocas ventas el número cambia mucho con una más o una menos.`, falta: `${min.ventas_para_cpa} ventas en el período.` });
  } else if ((k.costo_por_venta ?? 0) > cfg.cpa_objetivo * 1.3) {
    H.push({ id: "costo_por_venta", columna: "frenar", gravedad: 2, titulo: `Cada venta cuesta ${$v(k.costo_por_venta ?? 0)}`, detalle: `El objetivo es ${$v(cfg.cpa_objetivo)}. Se está pagando de más por vender.`, accion: dondeSeCorta });
  } else {
    H.push({ id: "costo_por_venta", columna: "escalar", gravedad: 2, titulo: `Cada venta cuesta ${$v(k.costo_por_venta ?? 0)}: dentro del objetivo`, detalle: `Objetivo: ${$v(cfg.cpa_objetivo)}. Retorno: ${(k.retorno ?? 0).toFixed(1).replace(".", ",")} veces lo gastado.`, accion: "Funciona. Para más volumen, subir el presupuesto: lo decidís vos (el módulo no lo hace).", sube_gasto: true });
  }

  // ── Palabras: ¿cuáles venden y cuáles solo gastan? ────────────────────
  const activas = e.palabras.filter((p) => p.activa);
  const cl = clasificarPalabras(e, cfg);
  const ventasPalabra = cl.ventasPalabra, sinDatos = cl.sinDatos;
  const sinVender = cl.sinVender.map((p) => `«${p.palabra}»: ${$v(p.costoV)} en 30 días, 0 ventas`);
  const venden = cl.venden.map((p) => `«${p.palabra}»: ${p.ventas} ventas, ${$v(p.costoV / p.ventas)} cada una`);
  const prometen = cl.prometen.map((p) => `«${p.palabra}»: ${p.ventas} ${p.ventas === 1 ? "venta" : "ventas"} con ${$v(p.costoV)} gastados`);
  if (sinVender.length) H.push({ id: "palabras_sin_ventas", columna: "frenar", gravedad: 2, titulo: `${sinVender.length} ${sinVender.length === 1 ? "palabra gastó" : "palabras gastaron"} el doble del objetivo sin vender`, detalle: `Más de ${$v(tope)} cada una en 30 días, sin ninguna venta.`, objetos: sinVender, accion: "Pausarlas, o dejar solo la versión exacta." });
  if (venden.length) H.push({ id: "palabras_que_venden", columna: "escalar", gravedad: 2, titulo: `${venden.length} ${venden.length === 1 ? "palabra vende" : "palabras venden"} por debajo del objetivo`, detalle: "Son las que pagan la campaña.", objetos: venden, accion: "Cuidarlas: no pausarlas ni cambiarles la concordancia. Mejorar su nota de calidad sí les da más lugar sin pagar más." });
  if (prometen.length) H.push({ id: "palabras_prometen", columna: "esperar", gravedad: 1, titulo: `${prometen.length} ${prometen.length === 1 ? "palabra ya vendió" : "palabras ya vendieron"}, pero una vez no prueba nada`, detalle: "Prometen. No pausarlas mientras juntan datos.", objetos: prometen, falta: `${ventasPalabra} ventas cada una para saber si salen a cuenta.` });
  if (sinDatos) H.push({ id: "palabras_sin_datos", columna: "esperar", gravedad: 1, titulo: `${sinDatos} ${sinDatos === 1 ? "palabra" : "palabras"} todavía sin datos para saber si venden`, detalle: "Gastaron poco y no vendieron: no alcanza para decir que no sirven.", falta: `Cada una necesita ~${$v(tope)} gastados (o una venta) para juzgarla.` });

  // ── Búsquedas que no compran ───────────────────────────────────────────
  const basura = busquedasBasura(e, cfg);
  if (basura.length) {
    const clics = basura.reduce((a, b) => a + b.clics, 0), costo = basura.reduce((a, b) => a + b.costo, 0);
    // Frenar solo si ya cuesta algo que importe; si no, es prevención.
    const pesa = costo * tc >= cfg.cpa_objetivo * 0.25 || clics >= 5;
    H.push({ id: "busquedas_basura", columna: pesa ? "frenar" : "oportunidad", gravedad: pesa ? 2 : 1, titulo: `${basura.length} ${basura.length === 1 ? "búsqueda que no compra sigue" : "búsquedas que no compran siguen"} activando el anuncio`, detalle: `${clics} ${clics === 1 ? "clic" : "clics"} y ${$c(costo)} en 30 días.`, objetos: basura.map((b) => `«${b.termino}» → negativa «${b.neg}»`), accion: "Agregar esas palabras negativas." });
  }
  const faltan = negativasFaltantes(e, cfg, basura);
  if (faltan.length) H.push({ id: "negativas_base", columna: "oportunidad", gravedad: 1, titulo: `${faltan.length} negativas preventivas sin cargar`, detalle: "Búsquedas que casi nunca compran en ningún rubro. Todavía no costaron, pero conviene cerrarlas antes.", objetos: faltan, accion: "Cargarlas como negativas de frase." });
  else H.push({ id: "negativas_base", columna: "ok", gravedad: 1, titulo: "Negativas básicas cargadas", detalle: "Gratis, cursos, trabajo y similares ya no activan el anuncio." });

  // ── Calidad por palabra ────────────────────────────────────────────────
  const impTot = activas.reduce((a, p) => a + p.impresiones, 0) || 1;
  const calidad = new Map<string, { palabra: string; nivel: number; impresiones: number; ctr: boolean; anuncio: boolean; pagina: boolean }>();
  for (const p of activas) {
    if (p.nivel == null) continue;
    const kk = sinTilde(p.palabra); const a = calidad.get(kk);
    calidad.set(kk, {
      palabra: p.palabra, nivel: Math.min(a?.nivel ?? 10, p.nivel), impresiones: (a?.impresiones ?? 0) + p.impresiones,
      ctr: (a?.ctr ?? false) || p.ctr === "BELOW_AVERAGE", anuncio: (a?.anuncio ?? false) || p.anuncio === "BELOW_AVERAGE", pagina: (a?.pagina ?? false) || p.pagina === "BELOW_AVERAGE",
    });
  }
  const notaEsperar: string[] = [];
  for (const q of calidad.values()) {
    if (q.nivel > 4) continue;
    if (q.impresiones < min.impresiones_nota) { notaEsperar.push(`«${q.palabra}» ${q.nivel}/10 con ${q.impresiones} impresiones`); continue; }
    const peso = q.impresiones / impTot;
    const causas = [q.anuncio && "el anuncio no se parece a lo que buscan", q.pagina && "la página no responde a esa búsqueda", q.ctr && "poca gente hace clic"].filter(Boolean) as string[];
    const acciones = [
      q.anuncio && `fijar un título que diga «${q.palabra}» y revisar qué búsquedas reales entran por esta palabra (Google le suma variantes cercanas)`,
      q.pagina && `que la página diga «${q.palabra}» arriba, en el título o el subtítulo`,
      q.ctr && "probar títulos más directos para esa búsqueda",
    ].filter(Boolean) as string[];
    H.push({ id: `nota_${sinTilde(q.palabra)}`, columna: "oportunidad", gravedad: peso > 0.3 ? 3 : 2, titulo: `«${q.palabra}» tiene nota ${q.nivel}/10`, detalle: `Se lleva el ${pct(peso)} de las impresiones. ${causas.length ? `Google marca: ${causas.join(", ")}.` : ""} Con nota baja cada clic cuesta más y el anuncio sale menos.`, accion: acciones.length ? `${acciones.join("; ")}.`.replace(/^./, (c) => c.toUpperCase()) : "Revisar anuncio y página para esa búsqueda." });
  }
  if (notaEsperar.length) H.push({ id: "nota_pocos_datos", columna: "esperar", gravedad: 1, titulo: `${notaEsperar.length} ${notaEsperar.length === 1 ? "palabra con nota baja" : "palabras con nota baja"} y pocas impresiones`, detalle: "Con tan pocas impresiones Google todavía no tiene una opinión firme.", objetos: notaEsperar, falta: `${min.impresiones_nota} impresiones cada una.` });
  if (calidad.size && ![...calidad.values()].some((q) => q.nivel <= 4)) H.push({ id: "nota", columna: "ok", gravedad: 1, titulo: "Ninguna palabra activa con nota baja", detalle: "Todas tienen 5/10 o más." });

  // ── Página de destino ──────────────────────────────────────────────────
  const conPagina = activas.filter((p) => p.pagina);
  const paginaMal = conPagina.filter((p) => p.pagina === "BELOW_AVERAGE");
  const lcp = e.velocidad.lcp_movil_ms;
  // "Lenta de verdad": más de un 20 % arriba del límite (la medición de laboratorio varía ±0,3 s).
  const muyLenta = lcp != null && lcp > cfg.lcp_max_ms * 1.2;
  if (paginaMal.length >= 2 && paginaMal.length >= conPagina.length / 2) {
    H.push({ id: "pagina_calidad", columna: "oportunidad", gravedad: 2, titulo: `Google califica la página por debajo del promedio (${paginaMal.length} de ${conPagina.length} palabras)`, detalle: "Es una sola nota que pesa en todas las palabras: si la página responde a lo que busca la gente, si carga rápido y si es clara en el celular. Google la re-evalúa despacio, en 1 a 2 semanas.", accion: muyLenta ? "Primero, que cargue más rápido en el celular." : `La velocidad no es el problema principal${lcp != null ? ` (${seg(lcp)} s)` : ""}: es de contenido. Que la página repita, arriba, las búsquedas principales.` });
  }
  if (lcp != null) {
    if (lcp > cfg.lcp_max_ms) H.push({ id: "velocidad", columna: "oportunidad", gravedad: muyLenta ? 2 : 1, titulo: `La página tarda ${seg(lcp)} s en el celular`, detalle: `Lo bueno es menos de ${seg(cfg.lcp_max_ms)} s. La lentitud baja la nota de la página y hace que la gente se vaya.`, accion: "Achicar imágenes y scripts que cargan al principio." });
    else H.push({ id: "velocidad", columna: "ok", gravedad: 1, titulo: `La página carga en ${seg(lcp)} s en el celular`, detalle: `Por debajo de ${seg(cfg.lcp_max_ms)} s.` });
  }
  if (cfg.paginas_destino.length) {
    const ruta = (u: string | null) => (u ?? "").replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/\/$/, "") || "/";
    const fuera = [...new Set(e.anuncios.filter((a) => a.activo && !cfg.paginas_destino.includes(ruta(a.url))).map((a) => `${a.grupo} → ${ruta(a.url)}`))];
    if (fuera.length) H.push({ id: "destino", columna: "oportunidad", gravedad: 1, titulo: "Hay anuncios que llevan a otra página", detalle: `Las páginas acordadas son: ${cfg.paginas_destino.join(", ")}.`, objetos: fuera, accion: "Cambiar la URL final de esos anuncios." });
    else H.push({ id: "destino", columna: "ok", gravedad: 1, titulo: `Los anuncios llevan a ${cfg.paginas_destino.join(", ")}`, detalle: "La página acordada." });
  }

  // ── Campañas: ranking, presupuesto, fin ───────────────────────────────
  for (const c of e.campanas) {
    if (INACTIVA.has(c.estado_principal)) continue;
    if ((c.perdida_ranking ?? 0) > 0.5) H.push({ id: `ranking_${c.id}`, columna: "oportunidad", gravedad: 2, titulo: `Se pierde el ${pct(c.perdida_ranking ?? 0)} de las búsquedas por ranking`, detalle: `${c.nombre}: el anuncio no sale en esas búsquedas porque su puesto (nota de calidad × puja) no alcanza.`, accion: "Subir la nota de calidad, no la puja: es lo que da más lugar sin pagar más por clic." });
    if ((c.perdida_presupuesto ?? 0) > 0.2) {
      if (k.suficientes && (k.costo_por_venta ?? Infinity) <= cfg.cpa_objetivo) H.push({ id: `presupuesto_${c.id}`, columna: "escalar", gravedad: 2, titulo: `Queda un ${pct(c.perdida_presupuesto ?? 0)} de búsquedas sin cubrir por presupuesto`, detalle: "Y las ventas salen dentro del objetivo.", accion: "Subir el presupuesto: lo decidís vos (el módulo no lo hace).", sube_gasto: true });
      else H.push({ id: `presupuesto_${c.id}`, columna: "esperar", gravedad: 1, titulo: `Se pierde un ${pct(c.perdida_presupuesto ?? 0)} por presupuesto`, detalle: "Más presupuesto traería más clics, pero todavía no está probado que vendan.", falta: `${min.ventas_para_cpa} ventas dentro del objetivo antes de pensar en subirlo.` });
    }
    const fin = c.fin ? new Date(`${c.fin.replace(" ", "T")}-03:00`).getTime() : null;
    const restan = fin ? Math.ceil((fin - ahora) / DIA) : null;
    const agotado = c.presupuesto_total ? c.gastado_total / c.presupuesto_total : null;
    if ((restan != null && restan >= 0 && restan <= 5) || (agotado != null && agotado >= 0.9)) {
      H.push({ id: `fin_${c.id}`, columna: "oportunidad", gravedad: 2, titulo: restan != null && restan <= 5 ? `${c.nombre} termina en ${restan} ${restan === 1 ? "día" : "días"}` : `${c.nombre} gastó el ${pct(agotado ?? 0)} de su presupuesto`, detalle: c.presupuesto_total ? `Gastado: ${$c(c.gastado_total)} de ${$c(c.presupuesto_total)}.` : "", accion: "Decidir si sigue. Extender fechas o presupuesto lo hacés vos.", sube_gasto: true });
    }
  }

  // ── Estructura ─────────────────────────────────────────────────────────
  const amplias = activas.filter((p) => p.concordancia === "BROAD");
  if (amplias.length && e.conversiones_30d < min.conversiones_amplia) H.push({ id: "amplias", columna: "frenar", gravedad: 2, titulo: `${amplias.length} ${amplias.length === 1 ? "palabra" : "palabras"} en concordancia amplia con pocas ventas`, detalle: `La amplia deja que Google elija las búsquedas; sin ${min.conversiones_amplia} compras en 30 días no tiene con qué aprender y trae búsquedas de cualquier cosa.`, objetos: amplias.map((p) => `«${p.palabra}» (${p.grupo})`), accion: "Pausarlas y dejar la versión frase o exacta." });
  else if (!amplias.length) H.push({ id: "amplias", columna: "ok", gravedad: 1, titulo: "Sin concordancia amplia", detalle: "Solo exacta y frase: control de qué búsquedas entran." });
  const grupos = activas.reduce<Record<string, Set<string>>>((a, p) => { const kk = `${sinTilde(p.palabra)} (${CONC[p.concordancia] ?? p.concordancia})`; (a[kk] ??= new Set()).add(p.grupo); return a; }, {});
  const repetidas = Object.entries(grupos).filter(([, g]) => g.size > 1).map(([kk, g]) => `${kk}: ${[...g].join(", ")}`);
  if (repetidas.length) H.push({ id: "repetidas", columna: "oportunidad", gravedad: 1, titulo: `${repetidas.length} ${repetidas.length === 1 ? "palabra repetida" : "palabras repetidas"} en varios grupos`, detalle: "Compiten entre sí y reparten los datos.", objetos: repetidas, accion: "Dejar cada palabra en un solo grupo." });
  const rechazados = [...e.anuncios.filter((a) => a.activo && a.aprobacion === "DISAPPROVED").map((a) => `Anuncio de ${a.grupo}`), ...activas.filter((p) => p.aprobacion === "DISAPPROVED").map((p) => `«${p.palabra}»`)];
  if (rechazados.length) H.push({ id: "rechazados", columna: "frenar", gravedad: 3, titulo: `${rechazados.length} ${rechazados.length === 1 ? "elemento rechazado" : "elementos rechazados"} por Google`, detalle: "No se muestran.", objetos: rechazados, accion: "Ver el motivo en Google Ads y corregirlo." });
  else H.push({ id: "rechazados", columna: "ok", gravedad: 1, titulo: "Anuncios y palabras aprobados", detalle: "Nada rechazado." });
  const flojos = e.anuncios.filter((a) => a.activo && (a.fuerza === "POOR" || a.fuerza === "AVERAGE"));
  if (flojos.length) H.push({ id: "fuerza", columna: "oportunidad", gravedad: 1, titulo: `${flojos.length} ${flojos.length === 1 ? "anuncio" : "anuncios"} con fuerza ${flojos.some((a) => a.fuerza === "POOR") ? "mala" : "promedio"}`, detalle: "Google le da más lugar a los anuncios con más títulos y descripciones distintos.", objetos: flojos.map((a) => a.grupo), accion: "Sumar títulos y descripciones distintos entre sí." });

  // ── Embudo de la web ───────────────────────────────────────────────────
  if (e.web.visitas >= min.visitas_pagina) {
    const t = e.web.checkout / e.web.visitas;
    if (t < 0.1) H.push({ id: "embudo_pagina", columna: "oportunidad", gravedad: 3, titulo: `Solo el ${pct(t)} de las visitas llega al checkout`, detalle: `${e.web.checkout} de ${e.web.visitas} visitas de Google.`, accion: "La página no convence: revisar oferta, precio y claridad antes de traer más gente." });
    else H.push({ id: "embudo_pagina", columna: "ok", gravedad: 1, titulo: `El ${pct(t)} de las visitas llega al checkout`, detalle: `${e.web.checkout} de ${e.web.visitas}: la página hace su trabajo.` });
  } else {
    H.push({ id: "embudo_pagina", columna: "esperar", gravedad: 1, titulo: "Pocas visitas para juzgar la página", detalle: `${e.web.visitas} visitas de Google en ${e.dias} días.`, falta: `${min.visitas_pagina} visitas.` });
  }
  if (e.web.checkout >= min.llegadas_checkout) {
    const t = e.web.fueron_a_pagar / e.web.checkout;
    if (t < 0.2) H.push({ id: "embudo_checkout", columna: "oportunidad", gravedad: 3, titulo: `De ${e.web.checkout} que llegan al checkout, ${e.web.fueron_a_pagar} van a pagar`, detalle: `Se pierde el ${pct(1 - t)} en el checkout. Ningún ajuste de anuncios compensa eso.`, accion: "Arreglar el checkout es lo que más ventas destraba hoy." });
    else H.push({ id: "embudo_checkout", columna: "ok", gravedad: 1, titulo: `El ${pct(t)} de los que llegan al checkout va a pagar`, detalle: `${e.web.fueron_a_pagar} de ${e.web.checkout}.` });
  } else {
    H.push({ id: "embudo_checkout", columna: "esperar", gravedad: 1, titulo: "Pocas llegadas al checkout para juzgarlo", detalle: `${e.web.checkout} en ${e.dias} días.`, falta: `${min.llegadas_checkout} llegadas.` });
  }

  // ── ¿Hay que esperar al último cambio? ────────────────────────────────
  let revision: ResultadoGobernanza["revision"] = { esperar: false, hasta: null, motivo: "Ningún cambio reciente pendiente de medir." };
  if (e.ultimo_cambio) {
    const desde = new Date(e.ultimo_cambio.desde).getTime();
    const diasDesde = (ahora - desde) / DIA;
    const hasta = new Date(desde + min.dias_tras_cambio * DIA).toISOString();
    const faltanDias = diasDesde < min.dias_tras_cambio;
    const faltanImp = e.impresiones_desde_cambio < min.impresiones_tras_cambio;
    if (faltanDias || faltanImp) {
      const partes = [faltanDias && `hasta el ${fecha(hasta)}`, faltanImp && `${min.impresiones_tras_cambio - e.impresiones_desde_cambio} impresiones más`].filter(Boolean).join(" y ");
      revision = { esperar: true, hasta: faltanDias ? hasta : null, motivo: `El último cambio (versión ${e.ultimo_cambio.version}, del ${fecha(e.ultimo_cambio.desde)}) necesita ${partes} para poder juzgarlo.` };
      H.push({ id: "ultimo_cambio", columna: "esperar", gravedad: 2, titulo: `Último cambio hace ${Math.max(Math.floor(diasDesde), 0)} ${Math.floor(diasDesde) === 1 ? "día" : "días"}: dejalo correr`, detalle: `Versión ${e.ultimo_cambio.version}, del ${fecha(e.ultimo_cambio.desde)}. Cambiar antes de tiempo es reaccionar al ruido: Google vuelve a aprender y no se sabe qué funcionó.`, falta: [faltanDias && `${min.dias_tras_cambio} días desde el cambio (lleva ${Math.max(Math.floor(diasDesde), 0)})`, faltanImp && `${min.impresiones_tras_cambio} impresiones desde el cambio (lleva ${e.impresiones_desde_cambio})`].filter(Boolean).join(" y ") + "." });
    } else {
      revision = { esperar: false, hasta: null, motivo: `El último cambio (versión ${e.ultimo_cambio.version}, del ${fecha(e.ultimo_cambio.desde)}) ya tiene datos para juzgarlo.` };
    }
  }

  // ── Puntaje de salud ───────────────────────────────────────────────────
  const castigo: Record<string, Record<number, number>> = { frenar: { 3: 25, 2: 12, 1: 5 }, oportunidad: { 3: 10, 2: 6, 1: 3 } };
  const puntaje = Math.max(0, Math.min(100, 100 - H.reduce((a, h) => a + (castigo[h.columna]?.[h.gravedad] ?? 0), 0)));
  const ORDEN = { frenar: 0, oportunidad: 1, escalar: 2, esperar: 3, ok: 4 };
  H.sort((a, b) => ORDEN[a.columna] - ORDEN[b.columna] || b.gravedad - a.gravedad);
  return { salud: { puntaje, estado: puntaje >= 80 ? "bien" : puntaje >= 50 ? "mejorable" : "mal" }, kpis: k, hallazgos: H, revision };
}

/** Las 3 cosas más urgentes de hoy (frenar y oportunidades, por gravedad). */
export function alertasPrincipales(h: Hallazgo[], n = 3) {
  return h.filter((x) => x.columna === "frenar" || x.columna === "oportunidad")
    .sort((a, b) => b.gravedad - a.gravedad || (a.columna === "frenar" ? -1 : 1) - (b.columna === "frenar" ? -1 : 1))
    .slice(0, n);
}
