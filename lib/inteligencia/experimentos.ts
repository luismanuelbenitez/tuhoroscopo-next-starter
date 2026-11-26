// Inteligencia comercial · experimentos y acciones (2026-11-25, fase 2).
//
// Mide cada experimento antes y después de su fecha efectiva con la MISMA
// medición del Centro de control (lib/inteligencia/medicion.ts): una venta
// se cuenta igual en todas las pantallas. Se juzga por volumen (no por días)
// y distingue una mejora observada de una atribuible: si en el período hubo
// otros cambios registrados (versiones de la campaña, bitácora, acciones del
// motor de reglas u otros experimentos), lo dice.
// Solo lectura, salvo las acciones que pide Manuel desde la pantalla.

import type { Rest } from "@/lib/asistenteParte";
import { prepararMedicion, DIA, OFFSET_UY, type FilaCanal } from "./medicion";
import { NOMBRE_CANAL, type Canal } from "./canales";
import type { Experimento } from "./recomendaciones";

type Get = (q: string) => Promise<any>;

/** Días de la línea base cuando todavía no hay una congelada. */
export const DIAS_LINEA_BASE = 14;
const PLATAFORMA: Partial<Record<Canal, string>> = { google_ads: "google", meta_ads: "meta" };

export interface Medida {
  desde: string; hasta: string; dias: number;
  clics: number | null; impresiones: number | null; gasto_pesos: number; gasto_usd: number;
  visitas: number; checkout: number; ventas: number; clientes_nuevos: number; ingresos: number;
}

/** Catálogo de indicadores: un experimento elige los suyos por clave. */
export const KPIS: Record<string, { nombre: string; calc: (m: Medida) => number | null; formato: "entero" | "decimal" | "usd" | "pesos" | "pct"; mejor: "mas" | "menos" | "rango" }> = {
  clics: { nombre: "Clics", calc: (m) => m.clics, formato: "entero", mejor: "mas" },
  clics_dia: { nombre: "Clics por día", calc: (m) => (m.clics != null && m.dias > 0 ? m.clics / m.dias : null), formato: "decimal", mejor: "rango" },
  gasto_dia_usd: { nombre: "Gasto por día", calc: (m) => (m.dias > 0 ? m.gasto_usd / m.dias : null), formato: "usd", mejor: "rango" },
  gasto_dia: { nombre: "Gasto por día", calc: (m) => (m.dias > 0 ? m.gasto_pesos / m.dias : null), formato: "pesos", mejor: "rango" },
  cpc_usd: { nombre: "Costo por clic", calc: (m) => (m.clics ? m.gasto_usd / m.clics : null), formato: "usd", mejor: "menos" },
  cpc: { nombre: "Costo por clic", calc: (m) => (m.clics ? m.gasto_pesos / m.clics : null), formato: "pesos", mejor: "menos" },
  ventas: { nombre: "Ventas", calc: (m) => m.ventas, formato: "entero", mejor: "mas" },
  ventas_100_clics: { nombre: "Ventas cada 100 clics", calc: (m) => (m.clics ? (m.ventas / m.clics) * 100 : null), formato: "decimal", mejor: "mas" },
  costo_venta_usd: { nombre: "Costo por venta", calc: (m) => (m.ventas > 0 ? m.gasto_usd / m.ventas : null), formato: "usd", mejor: "menos" },
  costo_venta: { nombre: "Costo por venta", calc: (m) => (m.ventas > 0 ? m.gasto_pesos / m.ventas : null), formato: "pesos", mejor: "menos" },
  pct_checkout: { nombre: "Visitas que llegan al checkout", calc: (m) => (m.visitas > 0 ? (m.checkout / m.visitas) * 100 : null), formato: "pct", mejor: "mas" },
};

/** tipo y registro (Level Up, 2026-11-25): qué clase de cambio es y si lo detectó el sistema o se anotó a mano. */
export type TipoCambio = "publicidad" | "web" | "oferta" | "decision" | "experimento" | "otro";
export interface CambioRegistrado { fecha: string; canal: string; origen: "campana" | "bitacora" | "motor"; tipo: TipoCambio; registro: "automatico" | "manual"; titulo: string; detalle: string | null; experimentos: string[] }

/** Tipo de una nota de la bitácora (categoría + palabras clave). */
function tipoBitacora(categoria: string, descripcion: string): TipoCambio {
  if (/^Experimento EXP-\d+ aplicado/.test(descripcion)) return "experimento";
  if (/^Aplicado \(Inteligencia comercial\)/.test(descripcion)) return "decision";
  // Solo notas sin categoría web/publicidad: un cambio de diseño que menciona el precio sigue siendo "web".
  if (/precio|cup[oó]n|descuento|oferta|promo/i.test(descripcion) && categoria !== "publicidad" && categoria !== "web") return "oferta";
  if (categoria === "web") return "web";
  if (categoria === "publicidad") return "publicidad";
  return "otro";
}

export interface ExperimentoMedido extends Experimento {
  evaluacion: "sin_aplicar" | "juntando_datos" | "listo_para_juzgar" | "cerrado";
  antes: Medida | null; antes_etiqueta: string;
  despues: Medida | null;
  volumen: { metrica: string; minimo: number; actual: number } | null;
  indicadores: { clave: string; nombre: string; plan_antes: string; plan_esperado: string; antes: number | null; despues: number | null; formato: string; mejor: string }[];
  version_detectada: { version: number; desde: string; cambios: number; resumen: string } | null;
  otros_cambios: CambioRegistrado[];
  atribucion: string;
  dolar: { valor: number; estimado: boolean };
}

function medir(fila: FilaCanal | undefined, ini: number, fin: number, tc: number): Medida {
  const dias = Math.max((fin - ini) / DIA, 0);
  const gasto = fila?.inversion ?? 0;
  return {
    desde: new Date(ini).toISOString(), hasta: new Date(fin).toISOString(), dias,
    clics: fila?.clics ?? null, impresiones: fila?.impresiones ?? null, gasto_pesos: gasto, gasto_usd: tc > 0 ? gasto / tc : 0,
    visitas: fila?.visitas ?? 0, checkout: fila?.checkout ?? 0, ventas: fila?.ventas ?? 0, clientes_nuevos: fila?.clientes_nuevos ?? 0, ingresos: fila?.ingresos ?? 0,
  };
}

const fechaUY = (iso: string) => { const d = new Date(new Date(iso).getTime() - OFFSET_UY).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}`; };

export async function medirExperimentos(rest: Rest, experimentos: Experimento[], ahora = Date.now()) {
  const get = rest as unknown as Get;
  const [cfg, versiones, bitacora, acciones] = await Promise.all([
    get("tarot_configuracion?clave=eq.tipo_cambio_usd_uyu&select=valor").catch(() => []),
    get(`ads_config_historial?vigente_desde=gte.${new Date(ahora - 45 * DIA).toISOString()}&select=plataforma,version,vigente_desde,cambios,analisis,origen&order=vigente_desde.desc`).catch(() => []),
    get(`tarot_analista_bitacora?fecha=gte.${new Date(ahora - 45 * DIA - OFFSET_UY).toISOString().slice(0, 10)}&select=fecha,categoria,descripcion,created_at&order=fecha.desc`).catch(() => []),
    get(`ads_gobernanza_acciones?created_at=gte.${new Date(ahora - 45 * DIA).toISOString()}&select=plataforma,titulo,estado,created_at&order=created_at.desc`).catch(() => []),
  ]) as [{ valor: string }[], { plataforma: string; version: number; vigente_desde: string; cambios: unknown[] | null; analisis: string | null; origen: string | null }[], { fecha: string; categoria: string; descripcion: string; created_at: string }[], { plataforma: string; titulo: string; estado: string; created_at: string }[]];
  const tcCfg = Number(cfg[0]?.valor);
  const dolar = { valor: Number.isFinite(tcCfg) && tcCfg > 0 ? tcCfg : 40, estimado: !(Number.isFinite(tcCfg) && tcCfg > 0) };

  // Registro de cambios de los últimos 30 días (todas las fuentes).
  const desde30 = ahora - 30 * DIA;
  const canalDePlataforma = (p: string) => (p === "google" ? "google_ads" : p === "meta" ? "meta_ads" : p);
  const cambios: CambioRegistrado[] = [
    ...versiones.filter((v) => new Date(v.vigente_desde).getTime() >= desde30).map((v) => ({
      fecha: v.vigente_desde, canal: canalDePlataforma(v.plataforma), origen: "campana" as const, tipo: "publicidad" as TipoCambio, registro: "automatico" as const,
      titulo: `${NOMBRE_CANAL[canalDePlataforma(v.plataforma) as Canal] ?? v.plataforma}: versión ${v.version} de la campaña`,
      detalle: v.analisis?.trim() ? v.analisis.trim().slice(0, 280) : `${(v.cambios ?? []).length} ${(v.cambios ?? []).length === 1 ? "cambio detectado" : "cambios detectados"} por la sincronización.`, experimentos: [] as string[],
    })),
    ...bitacora.filter((b) => new Date(`${b.fecha}T12:00:00-03:00`).getTime() >= desde30).map((b) => ({
      fecha: `${b.fecha}T12:00:00-03:00`, canal: b.categoria === "publicidad" ? "publicidad" : "negocio", origen: "bitacora" as const,
      tipo: tipoBitacora(b.categoria, b.descripcion), registro: "manual" as const,
      titulo: `Bitácora · ${b.categoria}`, detalle: b.descripcion, experimentos: [] as string[],
    })),
    ...acciones.filter((a) => new Date(a.created_at).getTime() >= desde30).map((a) => ({
      fecha: a.created_at, canal: canalDePlataforma(a.plataforma), origen: "motor" as const, tipo: "publicidad" as TipoCambio, registro: "automatico" as const,
      titulo: `Motor de reglas: ${a.titulo}`, detalle: `Estado: ${a.estado}`, experimentos: [] as string[],
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Una sola carga de medición para todos los experimentos.
  const inicios = experimentos.map((e) => (e.aplicado_desde ? new Date(e.aplicado_desde).getTime() : ahora) - DIAS_LINEA_BASE * DIA);
  const desde = inicios.length ? Math.min(...inicios) : ahora - DIAS_LINEA_BASE * DIA;
  const med = await prepararMedicion(get, { desde, atribucion: "ultimo", tc: dolar.valor });

  const medidos: ExperimentoMedido[] = experimentos.map((e) => {
    const canal = e.canal as Canal;
    const fila = (ini: number, fin: number) => med.porCanal(ini, fin).find((f) => f.canal === canal);
    const aplicado = e.aplicado_desde ? new Date(e.aplicado_desde).getTime() : null;
    const finE = e.estado === "cerrado" || e.estado === "cancelado" ? Math.min(ahora, new Date(e.updated_at).getTime()) : ahora;

    let antes: Medida | null; let etiqueta: string;
    if (aplicado && e.linea_base && (e.linea_base as { medida?: Medida }).medida) {
      antes = (e.linea_base as { medida: Medida }).medida;
      etiqueta = `Línea base congelada: ${DIAS_LINEA_BASE} días antes de aplicar (${fechaUY(antes.desde)}–${fechaUY(new Date(new Date(antes.hasta).getTime() - 1).toISOString())})`;
    } else if (aplicado) {
      antes = medir(fila(aplicado - DIAS_LINEA_BASE * DIA, aplicado), aplicado - DIAS_LINEA_BASE * DIA, aplicado, dolar.valor);
      etiqueta = `${DIAS_LINEA_BASE} días antes de aplicar`;
    } else {
      antes = medir(fila(ahora - DIAS_LINEA_BASE * DIA, ahora), ahora - DIAS_LINEA_BASE * DIA, ahora, dolar.valor);
      etiqueta = `Últimos ${DIAS_LINEA_BASE} días, todavía sin el cambio`;
    }
    const despues = aplicado ? medir(fila(aplicado, finE), aplicado, finE, dolar.valor) : null;

    const vm = e.volumen_minimo;
    const actualVol = despues && vm ? Number((despues as unknown as Record<string, number | null>)[vm.metrica] ?? 0) : 0;
    const volumen = vm ? { metrica: vm.metrica, minimo: vm.valor, actual: actualVol } : null;
    const evaluacion: ExperimentoMedido["evaluacion"] = e.estado === "cerrado" || e.estado === "cancelado" ? "cerrado" : !aplicado ? "sin_aplicar" : volumen && volumen.actual < volumen.minimo ? "juntando_datos" : "listo_para_juzgar";

    const indicadores = e.kpis.map((k) => {
      const def = KPIS[k.clave];
      return { clave: k.clave, nombre: k.nombre ?? def?.nombre ?? k.clave, plan_antes: k.antes, plan_esperado: k.esperado, antes: def && antes ? def.calc(antes) : null, despues: def && despues ? def.calc(despues) : null, formato: def?.formato ?? "decimal", mejor: def?.mejor ?? "mas" };
    });

    // ¿La sincronización ya vio una versión nueva de la campaña después de planificarlo?
    const plataforma = PLATAFORMA[canal];
    const desdePlan = new Date(e.created_at).getTime();
    const nueva = !aplicado && plataforma ? versiones.filter((v) => v.plataforma === plataforma && new Date(v.vigente_desde).getTime() > desdePlan).sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde))[0] : undefined;
    const version_detectada = nueva ? {
      version: nueva.version, desde: nueva.vigente_desde, cambios: (nueva.cambios ?? []).length,
      resumen: Array.from(new Set((nueva.cambios as { ruta?: string }[] | null ?? []).map((c) => String(c.ruta ?? "").split(/[.[]/)[0]).filter(Boolean))).slice(0, 6).join(", "),
    } : null;

    // Otros cambios durante el experimento (para separar observado de atribuible).
    const otros: CambioRegistrado[] = [];
    if (aplicado) {
      const alcance = new Set(e.alcance ?? []);
      for (const c of cambios) {
        const t = new Date(c.fecha).getTime();
        if (t < aplicado || t > finE) continue;
        // La versión de la campaña que registra la aplicación misma (primeras 24 h) no cuenta como "otro".
        if (c.origen === "campana" && c.canal === canal && t - aplicado < DIA) continue;
        // La nota de la propia aplicación (bitácora) no es "otro" cambio.
        if (c.origen === "bitacora" && c.detalle?.startsWith(`Experimento ${e.id} aplicado`)) continue;
        const relevante = c.canal === canal || alcance.has(c.canal) || c.origen === "bitacora";
        if (relevante) { otros.push(c); c.experimentos.push(e.id); }
      }
      for (const o of experimentos) {
        if (o.id === e.id || !o.aplicado_desde) continue;
        const t = new Date(o.aplicado_desde).getTime();
        const cruza = t >= aplicado && t <= finE && (o.canal === e.canal || (o.alcance ?? []).some((x) => (e.alcance ?? []).includes(x)));
        if (cruza) otros.push({ fecha: o.aplicado_desde, canal: o.canal, origen: "bitacora", tipo: "experimento", registro: "manual", titulo: `Otro experimento: ${o.id}`, detalle: o.nombre, experimentos: [e.id] });
      }
    }
    const atribucion = !aplicado
      ? "Todavía no se aplicó: no hay un después para comparar."
      : otros.length
        ? `Hubo ${otros.length} ${otros.length === 1 ? "cambio más" : "cambios más"} durante el experimento: una mejora sería observada, pero no atribuible solo a este cambio.`
        : "No hay otros cambios registrados en el período: lo que cambie se le puede atribuir a este experimento (con la salvedad del volumen). Los cambios en la web solo cuentan si quedan anotados en la bitácora.";

    return { ...e, evaluacion, antes, antes_etiqueta: etiqueta, despues, volumen, indicadores, version_detectada, otros_cambios: otros, atribucion, dolar };
  });

  return { experimentos: medidos, cambios, dolar };
}

/** Foto congelada de la línea base al marcar un experimento como aplicado. */
export async function lineaBaseAlAplicar(rest: Rest, e: Experimento, aplicado: number) {
  const get = rest as unknown as Get;
  const cfg = (await get("tarot_configuracion?clave=eq.tipo_cambio_usd_uyu&select=valor").catch(() => [])) as { valor: string }[];
  const tc = Number(cfg[0]?.valor) > 0 ? Number(cfg[0]?.valor) : 40;
  const ini = aplicado - DIAS_LINEA_BASE * DIA;
  const med = await prepararMedicion(get, { desde: ini, atribucion: "ultimo", tc });
  const fila = med.porCanal(ini, aplicado).find((f) => f.canal === (e.canal as Canal));
  return { congelada_at: new Date().toISOString(), dias: DIAS_LINEA_BASE, dolar: tc, atribucion: "ultimo", medida: medir(fila, ini, aplicado, tc) };
}
