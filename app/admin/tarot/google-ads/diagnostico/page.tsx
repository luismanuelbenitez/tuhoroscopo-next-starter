"use client";
import { useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { MarcoGoogleAds, SelectorDias } from "@/components/admin/googleAds/gobernanza/Marco";
import { useGobernanza } from "@/components/admin/googleAds/gobernanza/datos";
import { COLUMNAS, TarjetaHallazgo } from "@/components/admin/googleAds/gobernanza/Hallazgos";
import type { Columna } from "@/lib/gobernanzaAds/tipos";

// Google Ads · Diagnóstico (2026-11-14): todo lo que encontró el motor de
// reglas, en 4 columnas (frenar, mejorar, escalar, esperar) más lo que está
// bien. Solo lectura: los cambios con botón "Aplicar" llegan en la fase 2.

const ORDEN: Columna[] = ["frenar", "oportunidad", "escalar", "esperar"];

export default function GoogleAdsDiagnostico() {
  const [dias, setDias] = useState(14);
  const { d, error, cargando, cargar } = useGobernanza(dias);
  return (
    <MarcoGoogleAds
      bajada="Qué está mal, qué funciona y qué hay que dejar correr. Cada regla dice cuántos datos necesita: si no alcanzan, va a «Esperar»."
      extra={
        <div className="flex items-center gap-2">
          <SelectorDias dias={dias} setDias={setDias} />
          <button onClick={cargar} disabled={cargando} aria-label="Actualizar" className="rounded-lg border border-gray-700 p-2 text-gray-200 hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
          </button>
        </div>
      }
    >
      {error && <p className="rounded-xl border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200">No se pudieron cargar los datos ({error}).</p>}
      {!d && !error && <p className="text-sm text-gray-400">Cargando…</p>}
      {d && (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 xl:gap-4">
            {ORDEN.map((col) => {
              const c = COLUMNAS[col];
              const Icono = c.icono;
              const lista = d.hallazgos.filter((h) => h.columna === col);
              return (
                <section key={col} className="min-w-0 space-y-3">
                  <header>
                    <h2 className={`flex items-center gap-2 text-base font-semibold ${c.texto}`}><Icono size={17} /> {c.titulo} <span className="text-[13px] font-normal text-gray-400">({lista.length})</span></h2>
                    <p className="text-[13px] text-gray-400">{c.bajada}</p>
                  </header>
                  {lista.length ? lista.map((h) => <TarjetaHallazgo key={h.id} h={h} />) : <p className="rounded-xl border border-dashed border-gray-800 p-4 text-[13px] text-gray-500">Nada por acá.</p>}
                </section>
              );
            })}
          </div>
          {(() => {
            const bien = d.hallazgos.filter((h) => h.columna === "ok");
            if (!bien.length) return null;
            return (
              <section className="rounded-2xl border border-gray-800 bg-gray-900/50 p-4">
                <h2 className="flex items-center gap-2 text-base font-semibold text-emerald-300"><CheckCircle2 size={17} /> Lo que está bien ({bien.length})</h2>
                <ul className="mt-2 grid gap-x-6 gap-y-2 md:grid-cols-2">
                  {bien.map((h) => (
                    <li key={h.id} className="text-[13px] text-gray-300"><span className="font-medium text-white">{h.titulo}.</span> {h.detalle}</li>
                  ))}
                </ul>
              </section>
            );
          })()}
          <p className="text-[12px] text-gray-500">
            Últimos {d.dias} días para gasto y web; palabras, búsquedas y calidad, 30 días. Costo objetivo por venta: $ {Math.round(d.config.cpa_objetivo).toLocaleString("es-UY")} (el precio: no perder plata en la primera venta).
          </p>
        </>
      )}
    </MarcoGoogleAds>
  );
}
