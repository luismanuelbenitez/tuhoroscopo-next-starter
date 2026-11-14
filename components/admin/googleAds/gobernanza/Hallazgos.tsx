"use client";
import { useState } from "react";
import { AlertOctagon, ArrowUpRight, CheckCircle2, Hourglass, Wrench } from "lucide-react";
import type { Columna, Hallazgo } from "@/lib/gobernanzaAds/tipos";

// Tarjetas de hallazgos del módulo de gobernanza (2026-11-14).

export const COLUMNAS: Record<Columna, { titulo: string; bajada: string; icono: typeof AlertOctagon; borde: string; texto: string; chip: string }> = {
  frenar: { titulo: "Frenar", bajada: "Está costando plata o bloquea las ventas.", icono: AlertOctagon, borde: "border-red-900/70", texto: "text-red-300", chip: "border-red-900/70 bg-red-950/50 text-red-200" },
  oportunidad: { titulo: "Mejorar", bajada: "Hay margen claro con los datos que ya hay.", icono: Wrench, borde: "border-amber-900/60", texto: "text-amber-300", chip: "border-amber-900/60 bg-amber-950/40 text-amber-200" },
  escalar: { titulo: "Escalar", bajada: "Funciona: cuidarlo y darle más lugar.", icono: ArrowUpRight, borde: "border-emerald-900/70", texto: "text-emerald-300", chip: "border-emerald-900/70 bg-emerald-950/40 text-emerald-200" },
  esperar: { titulo: "Esperar", bajada: "Faltan datos: no tocar todavía.", icono: Hourglass, borde: "border-sky-900/60", texto: "text-sky-300", chip: "border-sky-900/60 bg-sky-950/40 text-sky-200" },
  ok: { titulo: "Está bien", bajada: "", icono: CheckCircle2, borde: "border-gray-800", texto: "text-emerald-300", chip: "border-gray-700 bg-gray-900 text-gray-300" },
};
const GRAVEDAD: Record<number, string> = { 3: "Urgente", 2: "Importante", 1: "Menor" };

export function TarjetaHallazgo({ h, conColumna = false }: { h: Hallazgo; conColumna?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const c = COLUMNAS[h.columna];
  const objetos = h.objetos ?? [];
  const visibles = abierto ? objetos : objetos.slice(0, 4);
  return (
    <article className={`rounded-xl border ${c.borde} bg-gray-950/60 p-4`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {conColumna && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.chip}`}>{c.titulo}</span>}
        {h.columna !== "ok" && h.columna !== "esperar" && <span className="text-[11px] font-medium text-gray-400">{GRAVEDAD[h.gravedad]}</span>}
      </div>
      <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{h.titulo}</h3>
      {h.detalle && <p className="mt-1 text-[13px] leading-relaxed text-gray-300">{h.detalle}</p>}
      {objetos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {visibles.map((o) => <li key={o} className="rounded-md bg-gray-900/80 px-2.5 py-1.5 text-[13px] text-gray-200">{o}</li>)}
          {objetos.length > 4 && (
            <li><button onClick={() => setAbierto(!abierto)} className="text-[13px] text-sky-300 hover:underline">{abierto ? "Ver menos" : `Ver las ${objetos.length}`}</button></li>
          )}
        </ul>
      )}
      {h.accion && <p className="mt-2.5 text-[13px] leading-relaxed text-gray-100"><span className={`font-semibold ${c.texto}`}>Qué hacer: </span>{h.accion}</p>}
      {h.falta && <p className="mt-2 text-[13px] leading-relaxed text-gray-300"><span className="font-semibold text-sky-300">Qué falta: </span>{h.falta}</p>}
      {h.sube_gasto && <p className="mt-2 inline-flex rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-[12px] text-gray-300">Sube el gasto: lo decidís vos. El módulo nunca lo aplica.</p>}
    </article>
  );
}
