// Inteligencia comercial · clasificación de la bandeja (Level Up, 2026-11-25).
//
// Función pura (sin base de datos): la usan el Centro de control (decisiones
// prioritarias) y Recomendaciones, así las dos pantallas cuentan lo mismo.
// No recalcula nada del motor: solo ordena lo que ya trae la bandeja en
// grupos de decisión.
//   - Problemas comerciales: síntomas económicos (p. ej. "cada cliente cuesta
//     más de lo que deja"). No son acciones: agrupan las palancas que los atacan.
//   - Ejecutables: se pueden decidir y hacer ahora.
//   - Bloqueadas: hacerlas ahora interferiría con un experimento EN CURSO o
//     el motor de Google pide esperar. Dicen qué las libera. Un experimento
//     solo planificado (sin aplicar) no bloquea: la recomendación sigue
//     ejecutable con un aviso para coordinarla (2026-11-26).
//   - Para revalidar: viejas (más de 14 días sin decidir). No compiten por
//     atención hasta que se confirme que siguen vigentes.
//   - Esperando evidencia, en marcha (aceptadas), pospuestas y cerradas.

import type { Bandeja, Recomendacion, Area } from "./recomendaciones";

export type Grupo = "ejecutables" | "bloqueadas" | "revalidar" | "esperando" | "decididas";

/** Palanca comercial: dónde se actúa para mover el resultado. */
export const PALANCA: Record<Area, string> = {
  publicidad: "Costo y calidad del tráfico",
  pagina: "Página de destino",
  checkout: "Checkout",
  oferta: "Oferta y precio",
  medicion: "Medición",
  postcompra: "Confianza y recompra",
  negocio: "Objetivos del negocio",
  otro: "Otra",
};

/** Dónde se hace el cambio (ámbito de ejecución). */
export function dondeSeHace(r: Pick<Recomendacion, "canal" | "area">): string {
  if (r.area === "pagina") return "Web: página /tarot";
  if (r.area === "checkout") return "Web: checkout (/tarot/checkout)";
  if (r.area === "oferta") return "Ofertas: reglas comerciales y cupones";
  if (r.area === "postcompra") return "Después de la compra (WhatsApp, lectura)";
  if (r.canal === "google_ads") return r.area === "medicion" ? "Cuenta de Google Ads: medición de conversiones" : "Cuenta de Google Ads";
  if (r.canal === "meta_ads") return "Administrador de anuncios de Meta";
  if (r.area === "medicion") return "Medición de la web (Visitantes)";
  if (r.area === "negocio") return "Objetivos y economía";
  return "Según el detalle de la recomendación";
}

const AREAS_DE_COSTO: Area[] = ["publicidad", "pagina", "checkout", "oferta"];
const esProblema = (r: Recomendacion) => r.clave === "centro:cac_sobre_margen" || r.clave.startsWith("centro:gasto_sin_ventas:");
export const estaBloqueada = (r: Recomendacion) => r.conflictos.some((c) => c.tipo === "interferencia" || c.tipo === "esperar");

export interface Problema {
  r: Recomendacion;
  /** Recomendaciones abiertas que atacan este problema, por palanca. */
  palancas: { area: Area; nombre: string; ejecutables: number; bloqueadas: number }[];
  ejecutables: number;
  bloqueadas: number;
}

export interface Clasificada {
  problemas: Problema[];
  ejecutables: Recomendacion[];
  bloqueadas: Recomendacion[];
  revalidar: Recomendacion[];
  esperando: Recomendacion[];
  aceptadas: Recomendacion[];
  pospuestas: Recomendacion[];
  /** Clave del problema que resuelve cada recomendación (si hay uno). */
  problemaDe: Map<string, Problema>;
  /** Qué libera cada recomendación bloqueada. */
  liberaCuando: Map<string, string>;
}

const fechaCorta = (ymd: string) => ymd.split("-").reverse().slice(0, 2).join("/");

export function clasificar(b: Bandeja, filtro: (r: Recomendacion) => boolean = () => true): Clasificada {
  const abiertas = b.para_decidir.filter(filtro);
  const problemasR = abiertas.filter((r) => esProblema(r) && !r.vieja);
  const resto = abiertas.filter((r) => !problemasR.includes(r));
  const revalidar = resto.filter((r) => r.vieja);
  const vigentes = resto.filter((r) => !r.vieja);
  const bloqueadas = vigentes.filter(estaBloqueada);
  const ejecutables = vigentes.filter((r) => !estaBloqueada(r));

  // Qué libera una bloqueada: el fin del experimento con el que choca o el "esperá" del motor.
  const liberaCuando = new Map<string, string>();
  const vivos = b.experimentos.filter((e) => e.estado === "planificado" || e.estado === "activo");
  for (const r of bloqueadas) {
    const partes: string[] = [];
    for (const e of vivos) {
      if (!r.conflictos.some((c) => c.tipo === "interferencia" && c.texto.includes(e.id))) continue;
      partes.push(e.estado === "planificado"
        ? `cuando ${e.id} se aplique y se evalúe${e.fin_previsto ? ` (fin previsto ${fechaCorta(e.fin_previsto)})` : ""}, o si se suma al experimento`
        : `al evaluar ${e.id}${e.fin_previsto ? ` (fin previsto ${fechaCorta(e.fin_previsto)})` : ""}, o si se suma al experimento`);
      // (Solo los experimentos en curso generan "interferencia"; los planificados no bloquean.)
    }
    if (r.conflictos.some((c) => c.tipo === "esperar")) partes.push(b.esperar_google?.hasta ? `cuando el motor de Google Ads deje de pedir espera (${fechaCorta(b.esperar_google.hasta.slice(0, 10))})` : "cuando el motor de Google Ads tenga datos del último cambio");
    liberaCuando.set(r.clave, partes.join("; ") || "cuando termine lo que la bloquea");
  }

  // Problemas → palancas que los atacan (sin duplicar: cada recomendación cuenta una vez por problema).
  const problemaDe = new Map<string, Problema>();
  const problemas: Problema[] = problemasR.map((p) => {
    const canalP = p.clave.startsWith("centro:gasto_sin_ventas:") ? p.clave.split(":")[2] : null;
    const relacionadas = [...ejecutables, ...bloqueadas].filter((r) => AREAS_DE_COSTO.includes(r.area) && (!canalP || r.canal === canalP));
    const porArea = new Map<Area, { ejecutables: number; bloqueadas: number }>();
    for (const r of relacionadas) {
      const x = porArea.get(r.area) ?? { ejecutables: 0, bloqueadas: 0 };
      if (estaBloqueada(r)) x.bloqueadas += 1; else x.ejecutables += 1;
      porArea.set(r.area, x);
    }
    const prob: Problema = {
      r: p,
      palancas: Array.from(porArea.entries()).map(([area, x]) => ({ area, nombre: PALANCA[area], ...x })).sort((a, z) => z.ejecutables + z.bloqueadas - (a.ejecutables + a.bloqueadas)),
      ejecutables: relacionadas.filter((r) => !estaBloqueada(r)).length,
      bloqueadas: relacionadas.filter(estaBloqueada).length,
    };
    for (const r of relacionadas) if (!problemaDe.has(r.clave)) problemaDe.set(r.clave, prob);
    return prob;
  });

  return {
    problemas, ejecutables, bloqueadas, revalidar, problemaDe, liberaCuando,
    esperando: b.esperando.filter(filtro), aceptadas: b.aceptadas.filter(filtro), pospuestas: b.pospuestas.filter(filtro),
  };
}

/** Período de los datos que originaron la recomendación. */
export function periodoDe(r: Recomendacion): string {
  const f = r.fuentes[0];
  const corta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: "America/Montevideo" }) : "—");
  if (!f) return "—";
  if (f.tipo === "regla" || f.tipo === "centro") return `Últimos 30 días, calculado en vivo (${corta(f.fecha)})`;
  if (f.tipo === "analista") return `Informe del Analista del ${corta(r.fecha)}${r.repeticiones > 1 ? ` (se repitió en ${r.repeticiones} informes)` : ""}`;
  if (f.tipo === "estratega") return `Propuesta del Estratega del ${corta(f.fecha)}`;
  return `Desde el ${corta(f.fecha)}`;
}
