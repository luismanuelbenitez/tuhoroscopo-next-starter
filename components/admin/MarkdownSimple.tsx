// Markdown simple para el admin (2026-11-04, Estratega): títulos, listas,
// tablas, negrita, cursiva y código en línea. Arma elementos de React (nunca
// HTML crudo), así un texto de la IA no puede inyectar nada en la página.
import React from "react";

function enLinea(t: string, k: string): React.ReactNode[] {
  const partes: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let ultimo = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(t))) {
    if (m.index > ultimo) partes.push(t.slice(ultimo, m.index));
    const s = m[0];
    if (s.startsWith("**")) partes.push(<strong key={`${k}b${i++}`} className="font-semibold text-white">{s.slice(2, -2)}</strong>);
    else if (s.startsWith("`")) partes.push(<code key={`${k}c${i++}`} className="rounded bg-gray-800 px-1 py-0.5 text-[0.85em] text-violet-200">{s.slice(1, -1)}</code>);
    else partes.push(<em key={`${k}i${i++}`}>{s.slice(1, -1)}</em>);
    ultimo = m.index + s.length;
  }
  if (ultimo < t.length) partes.push(t.slice(ultimo));
  return partes;
}

const celdas = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function MarkdownSimple({ texto, className = "" }: { texto: string; className?: string }) {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    const k = `l${i}`;
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      const n = h[1].length;
      const cls = n <= 2 ? "mt-4 mb-2 text-[15px] font-semibold text-white" : "mt-3 mb-1.5 text-sm font-semibold text-gray-100";
      out.push(<p key={k} className={cls}>{enLinea(h[2], k)}</p>);
      i++; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lineas.length && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1])) {
      const cabeza = celdas(l);
      const filas: string[][] = [];
      i += 2;
      while (i < lineas.length && /^\s*\|.*\|\s*$/.test(lineas[i])) { filas.push(celdas(lineas[i])); i++; }
      out.push(
        <div key={k} className="my-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{cabeza.map((c, j) => <th key={j} className="border-b border-gray-700 px-2 py-1.5 text-left font-medium text-gray-400">{enLinea(c, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{filas.map((f, r) => <tr key={r} className="border-b border-gray-800/80">{f.map((c, j) => <td key={j} className="px-2 py-1.5 text-gray-200">{enLinea(c, `${k}${r}_${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const lista = /^\s*([-*]|\d+\.)\s+/;
    if (lista.test(l)) {
      const ordenada = /^\s*\d+\./.test(l);
      const items: string[] = [];
      while (i < lineas.length && lista.test(lineas[i])) { items.push(lineas[i].replace(lista, "")); i++; }
      const Tag = ordenada ? "ol" : "ul";
      out.push(
        <Tag key={k} className={`my-1.5 space-y-1 pl-5 ${ordenada ? "list-decimal" : "list-disc"} marker:text-gray-500`}>
          {items.map((it, j) => <li key={j}>{enLinea(it, `${k}${j}`)}</li>)}
        </Tag>,
      );
      continue;
    }
    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !/^(#{1,4})\s/.test(lineas[i]) && !lista.test(lineas[i]) && !/^\s*\|.*\|\s*$/.test(lineas[i])) { parrafo.push(lineas[i]); i++; }
    out.push(<p key={k} className="my-1.5">{enLinea(parrafo.join(" "), k)}</p>);
  }
  return <div className={`text-sm leading-relaxed text-gray-300 ${className}`}>{out}</div>;
}
