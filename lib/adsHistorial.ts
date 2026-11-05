import { createHash } from "crypto";

// Histórico de configuración de campañas (2026-11-05). Las sincronizaciones de
// Meta y Google arman la configuración completa de cada campaña y llaman a
// registrarHistorial: si la huella cambió contra la versión vigente se abre
// una versión nueva (con la lista de diferencias) en ads_config_historial, y
// se recalculan los resultados de cada versión. Solo escribe en nuestra base.

type Rest = (q: string, init?: RequestInit) => Promise<any>;
type Fila = Record<string, unknown>;

export interface CampanaHistorial {
  campana_id: string;
  nombre: string | null;
  utm_campaign: string | null;
  estado: string | null;
  /** Configuración estable (sin lo que cambia solo); es lo que define la huella. */
  config: Fila;
  /** Lo esencial en claro. */
  resumen: unknown;
  /** Lo que la plataforma informa y cambia sola (calidad, aprendizaje, recomendaciones). */
  diagnostico?: unknown;
  /** Inicio de la campaña, para la primera versión. */
  desde?: string | null;
}

/** Copia con las claves ordenadas y sin las claves `fuera` (en cualquier nivel). */
export function estable(v: unknown, fuera: Set<string> = new Set()): unknown {
  if (Array.isArray(v)) return v.map((x) => estable(x, fuera));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as Fila).filter((k) => !fuera.has(k)).sort().map((k) => [k, estable((v as Fila)[k], fuera)]));
  }
  return v;
}

const huella = (config: unknown) => createHash("sha256").update(JSON.stringify(estable(config))).digest("hex").slice(0, 32);

// Aplana a {ruta: valor}. En listas de objetos con id (o texto) la ruta usa
// ese id, así un elemento nuevo no corre a todos los demás.
function aplanar(v: unknown, ruta: string, out: Map<string, unknown>) {
  if (Array.isArray(v)) {
    const conClave = v.length > 0 && v.every((x) => x && typeof x === "object" && ("id" in (x as Fila) || "clave" in (x as Fila)));
    if (!conClave && v.every((x) => x === null || typeof x !== "object")) { out.set(ruta, v); return; }
    v.forEach((x, i) => aplanar(x, `${ruta}[${conClave ? String((x as Fila).id ?? (x as Fila).clave) : i}]`, out));
    if (!v.length) out.set(ruta, []);
    return;
  }
  if (v && typeof v === "object") {
    const claves = Object.keys(v as Fila);
    if (!claves.length) out.set(ruta, {});
    for (const k of claves) aplanar((v as Fila)[k], ruta ? `${ruta}.${k}` : k, out);
    return;
  }
  out.set(ruta, v);
}

/** Diferencias entre dos configuraciones: [{ruta, antes, despues}] (máximo 200). */
export function diferencias(antes: unknown, despues: unknown) {
  const a = new Map<string, unknown>(), d = new Map<string, unknown>();
  aplanar(antes, "", a); aplanar(despues, "", d);
  const rutas = [...new Set([...a.keys(), ...d.keys()])].sort();
  const lista: { ruta: string; antes: unknown; despues: unknown }[] = [];
  for (const r of rutas) {
    if (JSON.stringify(a.get(r)) !== JSON.stringify(d.get(r))) lista.push({ ruta: r, antes: a.get(r) ?? null, despues: d.get(r) ?? null });
  }
  return lista.slice(0, 200);
}

export async function registrarHistorial(rest: Rest, plataforma: "meta" | "google", campanas: CampanaHistorial[]) {
  if (!campanas.length) return { nuevas_versiones: 0 };
  const vigentes = (await rest(`ads_config_historial?plataforma=eq.${plataforma}&vigente_hasta=is.null&select=campana_id,huella,config`)) as { campana_id: string; huella: string; config: unknown }[];
  const previa = new Map(vigentes.map((v) => [v.campana_id, v]));
  const filas = campanas.map((c) => {
    const h = huella(c.config);
    const antes = previa.get(c.campana_id);
    return { ...c, huella: h, cambios: antes && antes.huella !== h ? diferencias(antes.config, c.config) : null };
  });
  return rest("rpc/ads_historial_guardar", { method: "POST", body: JSON.stringify({ p_plataforma: plataforma, p_campanas: filas }) });
}
