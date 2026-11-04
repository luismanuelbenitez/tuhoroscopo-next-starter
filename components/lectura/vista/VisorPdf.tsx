"use client";

import { useEffect, useRef, useState } from "react";
import { TINTA_TEXTO } from "./Base";

// Visor del PDF dentro de la lectura (Manuel 2026-11-04). Desde WhatsApp, el
// navegador interno no puede mostrar ni guardar un PDF: lo pasa a otra app y
// avisa "estás saliendo de WhatsApp". Acá las páginas se dibujan en la propia
// página, así que verlo no sale de WhatsApp; guardarlo sí (botón aparte).
//
// pdf.js 4.10 (versión legacy, para teléfonos viejos) se sirve desde
// public/pdfjs/ y se carga recién al abrir el visor, sin pasar por el
// empaquetador. Para actualizarlo: copiar de node_modules/pdfjs-dist/legacy/
// build/ los archivos pdf.min.mjs y pdf.worker.min.mjs. El PDF se pide a
// /pdf/[token] (proxy propio): nunca aparece la URL de Supabase.
// isEvalSupported: false — el PDF nunca ejecuta código.

const PDFJS = "/pdfjs/pdf.min.mjs";
const WORKER = "/pdfjs/pdf.worker.min.mjs";

type Estado = "cargando" | "listo" | "error";

export function VisorPdf({ src }: { src: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>("cargando");

  useEffect(() => {
    let cancelado = false;
    const cajaEfecto = contenedor.current;
    // Si se cierra el visor a mitad de carga, se corta la descarga.
    const corte = new AbortController();
    let destruir: (() => void) | undefined;
    (async () => {
      try {
        const pdfjs = await import(/* webpackIgnore: true */ PDFJS);
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
        // Una sola descarga: dejando que pdf.js pida la URL, la pedía dos veces
        // (4 MB y dos "tocó PDF" en el admin).
        const res = await fetch(src, { signal: corte.signal });
        if (!res.ok) throw new Error(`pdf ${res.status}`);
        const datos = new Uint8Array(await res.arrayBuffer());
        if (cancelado) return;
        const tarea = pdfjs.getDocument({ data: datos, isEvalSupported: false });
        destruir = () => { tarea.destroy(); };
        const doc = await tarea.promise;
        const caja = contenedor.current;
        if (cancelado || !caja) return;
        // Nitidez: ancho real del contenedor × densidad de pantalla (tope 2,
        // para no gastar memoria de más en teléfonos de gama baja).
        const ancho = caja.clientWidth || 340;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= doc.numPages; n++) {
          const pagina = await doc.getPage(n);
          if (cancelado) return;
          const base = pagina.getViewport({ scale: 1 });
          const vista = pagina.getViewport({ scale: (ancho * dpr) / base.width });
          const lienzo = document.createElement("canvas");
          lienzo.width = Math.floor(vista.width);
          lienzo.height = Math.floor(vista.height);
          lienzo.setAttribute("role", "img");
          lienzo.setAttribute("aria-label", `Página ${n} de ${doc.numPages} de tu lectura en PDF`);
          lienzo.className = "block w-full h-auto rounded-[6px] shadow-[0_10px_26px_rgba(40,20,5,0.4)] ring-1 ring-[rgba(120,85,30,0.35)]";
          // Se agrega recién dibujada: si no, mientras se dibuja (la última
          // página tarda unos segundos) se ve un rectángulo blanco.
          await pagina.render({ canvasContext: lienzo.getContext("2d")!, viewport: vista }).promise;
          if (cancelado) return;
          caja.appendChild(lienzo);
          if (n === 1) setEstado("listo");
        }
      } catch {
        if (!cancelado) setEstado("error");
      }
    })();
    return () => {
      cancelado = true;
      corte.abort();
      destruir?.();
      cajaEfecto?.replaceChildren();
    };
  }, [src]);

  return (
    <div>
      {estado === "cargando" && (
        <p role="status" className="flex items-center justify-center gap-2.5 py-8 text-[15px]" style={{ color: TINTA_TEXTO }}>
          <span aria-hidden="true" className="inline-block w-5 h-5 rounded-full border-2 border-[rgba(120,85,30,0.3)] border-t-[#7a5418] animate-spin" />
          Abriendo tu PDF…
        </p>
      )}
      {estado === "error" && (
        <p role="status" className="py-4 text-center text-[15px] leading-relaxed" style={{ color: TINTA_TEXTO }}>
          No pudimos mostrarlo acá. Podés guardarlo con el botón de abajo.
        </p>
      )}
      <div ref={contenedor} className="flex flex-col gap-4" />
    </div>
  );
}
