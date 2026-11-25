// Inteligencia comercial · memoria única (2026-11-25, fase 3).
//
// Una sola memoria acumulativa: tarot_analista_aprendizajes (la del Analista,
// ampliada). Acá se lee y se busca lo relacionado con una recomendación, para
// que la bandeja la consulte antes de recomendar (p. ej. "ya se probó y no
// funcionó"). La escritura vive en lib/analista/memoria.ts.

import { fichas, parecido } from "./texto";

export type Nivel = "hecho" | "senal" | "hipotesis";
export const NIVEL_DE_CONFIANZA: Record<string, Nivel> = { alta: "hecho", media: "senal", baja: "hipotesis" };
export const CONFIANZA_DE_NIVEL: Record<Nivel, string> = { hecho: "alta", senal: "media", hipotesis: "baja" };
export const NOMBRE_NIVEL: Record<Nivel, string> = { hecho: "Hecho comprobado", senal: "Señal", hipotesis: "Hipótesis" };

export interface Recuerdo {
  id: string; texto: string; area: string; confianza: string; nivel: Nivel; evidencia: string | null;
  origen: string; activo: boolean; motivo_baja: string | null; canal: string | null; resultado: "funciono" | "no_funciono" | null; ref: string | null;
  created_at: string; updated_at: string;
}

type Get = (q: string) => Promise<any>;

export async function leerMemoria(get: Get, negocio: string, soloActivos = false): Promise<Recuerdo[]> {
  const filas = (await get(`tarot_analista_aprendizajes?negocio_id=eq.${encodeURIComponent(negocio)}${soloActivos ? "&activo=eq.true" : ""}&select=id,texto,area,confianza,evidencia,origen,activo,motivo_baja,canal,resultado,ref,created_at,updated_at&order=activo.desc,updated_at.desc&limit=500`)) as Omit<Recuerdo, "nivel">[];
  return filas.map((f) => ({ ...f, nivel: NIVEL_DE_CONFIANZA[f.confianza] ?? "hipotesis" }));
}

/** Lo de la memoria que habla de lo mismo que `texto` (más parecido primero).
 *  Pide al menos 3 palabras con contenido en común para no unir cosas distintas. */
export function relacionados(texto: string, memoria: Recuerdo[], n = 2, umbral = 0.25) {
  const f = fichas(texto);
  return memoria
    .map((m) => { const g = fichas(m.texto); let comunes = 0; for (const x of f) if (g.has(x)) comunes += 1; return { m, p: comunes >= 3 ? parecido(f, g) : 0 }; })
    .filter((x) => x.p >= umbral)
    .sort((a, b) => b.p - a.p)
    .slice(0, n)
    .map((x) => x.m);
}
