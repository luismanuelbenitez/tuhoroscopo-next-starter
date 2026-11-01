// Lector de las exportaciones CSV del Administrador de anuncios de Meta
// (Analista de conversión, 2026-11-01). Soporta comillas, comas o punto y
// coma como separador y el BOM de Excel. Devuelve columnas y filas como
// objetos; detecta el período con las columnas "Inicio/Fin del informe".

export interface CsvLeido {
  columnas: string[];
  filas: Record<string, string>[];
  periodo_desde: string | null;
  periodo_hasta: string | null;
}

const MAX_FILAS = 500;

function separar(linea: string, sep: string): string[] {
  const out: string[] = [];
  let actual = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comillas) {
      if (c === '"' && linea[i + 1] === '"') { actual += '"'; i++; }
      else if (c === '"') comillas = false;
      else actual += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { out.push(actual.trim()); actual = ""; }
    else actual += c;
  }
  out.push(actual.trim());
  return out;
}

/** Une líneas cortadas dentro de un campo entre comillas. */
function registros(texto: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const l of texto.split(/\r?\n/)) {
    buf = buf ? `${buf}\n${l}` : l;
    if ((buf.match(/"/g)?.length ?? 0) % 2 === 0) { if (buf.trim()) out.push(buf); buf = ""; }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

const fechaISO = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function leerCsvMeta(texto: string): CsvLeido {
  const limpio = texto.replace(/^﻿/, "");
  const lineas = registros(limpio);
  if (lineas.length < 2) throw new Error("El archivo no tiene filas de datos.");
  const sep = (lineas[0].match(/;/g)?.length ?? 0) > (lineas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const columnas = separar(lineas[0], sep).map((c) => c.slice(0, 120));
  if (columnas.length < 2) throw new Error("No reconozco el formato: exportá como CSV desde el Administrador de anuncios.");
  const filas = lineas.slice(1, MAX_FILAS + 1).map((l) => {
    const valores = separar(l, sep);
    return Object.fromEntries(columnas.map((c, i) => [c, (valores[i] ?? "").slice(0, 200)]));
  }).filter((f) => Object.values(f).some((v) => v !== ""));
  const col = (re: RegExp) => columnas.find((c) => re.test(c.toLowerCase()));
  const cIni = col(/inicio del informe|reporting starts/);
  const cFin = col(/fin del informe|reporting ends/);
  const inicios = filas.map((f) => fechaISO(cIni ? f[cIni] : undefined)).filter(Boolean).sort() as string[];
  const fines = filas.map((f) => fechaISO(cFin ? f[cFin] : undefined)).filter(Boolean).sort() as string[];
  return { columnas, filas, periodo_desde: inicios[0] ?? null, periodo_hasta: fines[fines.length - 1] ?? null };
}
