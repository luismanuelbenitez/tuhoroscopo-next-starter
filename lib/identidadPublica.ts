// Identidad pública de una persona en testimonios y piezas de difusión
// (decisión de producto 2026-10-19, ver docs/product/DECISIONS.md):
//
//   SIEMPRE "Nombre + inicial del apellido" (si existe). Nunca apellido
//   completo, ciudad, email, teléfono ni fecha de nacimiento.
//
// Es la ÚNICA implementación del formato: la usan la mini web de feedback
// (vista previa y respuesta guardada) y el admin. Reglas, conservadoras:
//   · Nombre = primera palabra (en nombres compuestos se muestra solo la
//     primera: "María José Rodríguez" → "María R.").
//   · Inicial = primera letra de la ÚLTIMA palabra que no sea partícula
//     (de, del, la, las, los, y, da, das, do, dos, di, van, von, mc):
//     nunca se expone más de una inicial.
//   · Palabras con dígitos, "@" o de una sola letra no cuentan; si el nombre
//     no es confiable → "Anónimo" (ante ambigüedad, privacidad).

const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "das", "do", "dos", "di", "van", "von", "mc"]);

function capitalizar(palabra: string): string {
  return palabra
    .split("-")
    .map((p) => p.charAt(0).toLocaleUpperCase("es") + p.slice(1).toLocaleLowerCase("es"))
    .join("-");
}

function palabrasValidas(nombreCompleto: string | null | undefined): string[] {
  return (nombreCompleto ?? "")
    .normalize("NFC")
    .split(/\s+/)
    // Palabras con dígitos, "@" o "." (teléfonos, emails, dominios) se
    // descartan ENTERAS antes de limpiar: nunca sobrevive un pedazo.
    .filter((p) => p && !/[\d@.]/.test(p))
    .map((p) => p.replace(/[^\p{L}'-]/gu, ""))
    .filter((p) => p.replace(/['-]/g, "").length > 1);
}

/** "Paula Rodríguez" → "Paula R."; "Nico" → "Nico"; sin datos fiables → "Anónimo". */
export function identidadPublica(nombreCompleto: string | null | undefined): string {
  const palabras = palabrasValidas(nombreCompleto);
  if (palabras.length === 0) return "Anónimo";
  const nombre = capitalizar(palabras[0]);
  const resto = palabras.slice(1).filter((p) => !PARTICULAS.has(p.toLocaleLowerCase("es")));
  const ultimo = resto[resto.length - 1];
  if (!ultimo) return nombre;
  return `${nombre} ${ultimo.charAt(0).toLocaleUpperCase("es")}.`;
}

/** Nombre de pila para saludar ("Hola, Paula"). */
export function nombreDePila(nombreCompleto: string | null | undefined): string {
  const palabras = palabrasValidas(nombreCompleto);
  return palabras.length > 0 ? capitalizar(palabras[0]) : "";
}
