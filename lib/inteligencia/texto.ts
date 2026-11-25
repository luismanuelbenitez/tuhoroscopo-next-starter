// Comparación simple de textos en español (2026-11-25). Sin IA: se usa para
// unir recomendaciones repetidas y para buscar en la memoria lo relacionado.

const VACIAS = new Set("de la el los las y en a que del con por para un una uno tu tus su sus al lo se si no es mas o e ya hoy cuando sin como cual cada este esta estos estas antes despues solo todo toda todos muy bien".split(" "));

export const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palabras con contenido, recortadas a 6 letras (así "descuento" y "descuentan" coinciden). */
export function fichas(t: string) {
  return new Set(sinTildes(t).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !VACIAS.has(w)).map((w) => w.slice(0, 6)));
}

/** Parte de las palabras del texto más corto que aparecen en el otro (0 a 1). */
export function parecido(a: Set<string>, b: Set<string>, minimo = 3) {
  const min = Math.min(a.size, b.size);
  if (min < minimo) return 0;
  let comunes = 0;
  for (const x of a) if (b.has(x)) comunes += 1;
  return comunes / min;
}
