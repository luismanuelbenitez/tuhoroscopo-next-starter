import type { ConfigGobernanza } from "./tipos";

// Configuración por defecto del módulo de gobernanza (2026-11-14). Genérica:
// lo propio de cada negocio (páginas, negativas de su rubro, objetivo de costo)
// va en la configuración guardada, no acá.

/**
 * Búsquedas que casi nunca compran, en cualquier rubro (español e inglés).
 * Con y sin tilde: Google las trata como negativas distintas.
 */
export const NEGATIVAS_UNIVERSALES = [
  "gratis", "gratuito", "gratuita", "free",
  "curso", "cursos", "tutorial", "aprender", "como hacer", "cómo hacer",
  "trabajo", "empleo", "sueldo",
  "que es", "qué es", "significado", "definicion", "definición",
  "pdf", "descargar", "libro", "youtube",
];

export function configPorDefecto(valorVenta: number): ConfigGobernanza {
  return {
    valor_venta: valorVenta,
    cpa_objetivo: valorVenta,
    paginas_destino: [],
    negativas_base: NEGATIVAS_UNIVERSALES,
    minimos: {
      impresiones_nota: 20,
      dias_tras_cambio: 7,
      impresiones_tras_cambio: 100,
      visitas_pagina: 50,
      llegadas_checkout: 15,
      conversiones_amplia: 15,
      ventas_para_cpa: 3,
    },
    lcp_max_ms: 2500,
  };
}

/** Configuración que se guarda (lo que el dueño ajusta en la pestaña Ajustes). */
export interface ConfigGuardada {
  valor_venta?: number; cpa_objetivo?: number;
  paginas_destino: string[]; negativas_extra: string[]; no_negar: string[];
  minimos: Partial<ConfigGobernanza["minimos"]>;
  lcp_max_ms?: number;
}

const LIMITES_MINIMOS: Record<keyof ConfigGobernanza["minimos"], [number, number]> = {
  impresiones_nota: [5, 1000], dias_tras_cambio: [1, 30], impresiones_tras_cambio: [10, 10000],
  visitas_pagina: [10, 10000], llegadas_checkout: [5, 5000], conversiones_amplia: [1, 500], ventas_para_cpa: [1, 100],
};

/** Valida lo que llega de la pestaña Ajustes antes de guardarlo. */
export function limpiarConfig(x: unknown): { ok: true; config: ConfigGuardada } | { ok: false; motivo: string } {
  if (!x || typeof x !== "object") return { ok: false, motivo: "Configuración vacía." };
  const g = x as Record<string, unknown>;
  const lista = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((s) => String(s).trim()).filter((s) => s && s.length <= 80).slice(0, max);
  const opcional = (v: unknown, nombre: string): number | undefined | string => {
    if (v === null || v === undefined || v === "") return undefined;
    const n = Number(v); return Number.isFinite(n) && n > 0 && n < 1e9 ? n : `${nombre} tiene que ser un número mayor que 0.`;
  };
  const valor = opcional(g.valor_venta, "El valor de la venta"); if (typeof valor === "string") return { ok: false, motivo: valor };
  const cpa = opcional(g.cpa_objetivo, "El costo objetivo"); if (typeof cpa === "string") return { ok: false, motivo: cpa };
  const lcp = opcional(g.lcp_max_ms, "El tiempo de carga"); if (typeof lcp === "string") return { ok: false, motivo: lcp };
  const paginas = lista(g.paginas_destino, 10);
  if (paginas.some((p) => !p.startsWith("/"))) return { ok: false, motivo: "Las páginas de destino van como ruta, empezando con / (ej. /tarot)." };
  const minimos: Partial<ConfigGobernanza["minimos"]> = {};
  const m = (g.minimos ?? {}) as Record<string, unknown>;
  for (const [k, [lo, hi]] of Object.entries(LIMITES_MINIMOS) as [keyof ConfigGobernanza["minimos"], [number, number]][]) {
    if (m[k] === undefined || m[k] === "" || m[k] === null) continue;
    const n = Math.round(Number(m[k]));
    if (!Number.isFinite(n) || n < lo || n > hi) return { ok: false, motivo: `El mínimo «${k}» tiene que estar entre ${lo} y ${hi}.` };
    minimos[k] = n;
  }
  return { ok: true, config: { valor_venta: valor, cpa_objetivo: cpa, lcp_max_ms: lcp, paginas_destino: paginas, negativas_extra: lista(g.negativas_extra, 200), no_negar: lista(g.no_negar, 100), minimos } };
}

/**
 * Une la configuración guardada (JSON parcial) con la de por defecto.
 * Además de los campos de ConfigGobernanza acepta:
 * - negativas_extra: negativas propias del rubro, que se suman a las universales.
 * - no_negar: palabras universales que en este negocio SÍ compran (ej. "trabajo"
 *   en tarot: "tarot trabajo" es una consulta, no alguien buscando empleo).
 */
export function armarConfig(valorVenta: number, guardada: unknown): ConfigGobernanza {
  const base = configPorDefecto(valorVenta);
  if (!guardada || typeof guardada !== "object") return base;
  const g = guardada as Partial<ConfigGobernanza> & { negativas_extra?: string[]; no_negar?: string[] };
  const noNegar = new Set((Array.isArray(g.no_negar) ? g.no_negar : []).map((x) => String(x).toLowerCase().trim()));
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
  return {
    valor_venta: num(g.valor_venta, base.valor_venta),
    cpa_objetivo: num(g.cpa_objetivo, num(g.valor_venta, base.cpa_objetivo)),
    paginas_destino: Array.isArray(g.paginas_destino) ? g.paginas_destino.filter((x) => typeof x === "string") : base.paginas_destino,
    negativas_base: [
      ...(Array.isArray(g.negativas_base) ? g.negativas_base : base.negativas_base),
      ...(Array.isArray(g.negativas_extra) ? g.negativas_extra : []),
    ].filter((x): x is string => typeof x === "string" && x.trim() !== "" && !noNegar.has(x.toLowerCase().trim())),
    minimos: Object.fromEntries(
      Object.entries(base.minimos).map(([k, v]) => [k, num((g.minimos as Record<string, unknown> | undefined)?.[k], v)]),
    ) as ConfigGobernanza["minimos"],
    lcp_max_ms: num(g.lcp_max_ms, base.lcp_max_ms),
  };
}
