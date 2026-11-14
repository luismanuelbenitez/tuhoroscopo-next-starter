"use client";
import { useEffect, useState } from "react";
import { GitCommitVertical } from "lucide-react";
import { MarcoGoogleAds } from "@/components/admin/googleAds/gobernanza/Marco";

// Google Ads · Historial (2026-11-14): cada versión de la configuración de la
// campaña (el sync la detecta sola cada hora), qué cambió y qué pasó después.
// Fuente: ads_config_historial. Solo lectura.

interface Cambio { ruta: string; antes: unknown; despues: unknown }
interface Version {
  id: number; version: number; campana_nombre: string | null; vigente_desde: string; vigente_hasta: string | null; origen: string | null;
  cambios: Cambio[] | null; analisis: string | null;
  resultados: { dias?: number; web?: { sesiones?: number; checkout?: number; ventas?: number; ingresos?: number }; plataforma?: { costo?: number; clics?: number; impresiones?: number } } | null;
}

const cuando = (s: string) => new Date(s).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" });
const valor = (v: unknown) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
const ruta = (r: string) => r
  .replace(/^grupos\[[^\]]+\]\.(status|estado)$/, "Estado de un grupo")
  .replace(/^palabras\[[^\]]+\]\.estado$/, "Estado de una palabra")
  .replace(/^anuncios\[[^\]]+\]\./, "Anuncio: ")
  .replace(/^negativas$/, "Palabras negativas");

function TarjetaVersion({ v }: { v: Version }) {
  const [abierto, setAbierto] = useState(false);
  const cambios = v.cambios ?? [];
  const web = v.resultados?.web;
  return (
    <article className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white"><GitCommitVertical size={16} className="text-sky-300" /> Versión {v.version}{!v.vigente_hasta && <span className="rounded-full border border-emerald-900/70 bg-emerald-950/40 px-2 py-0.5 text-[11px] text-emerald-200">vigente</span>}</h2>
        <p className="text-[12px] text-gray-400">{cuando(v.vigente_desde)}{v.vigente_hasta ? ` → ${cuando(v.vigente_hasta)}` : " → hoy"}</p>
      </div>
      {v.analisis && <p className={`mt-2 whitespace-pre-line text-[13px] leading-relaxed text-gray-300 ${abierto ? "" : "line-clamp-3"}`}>{v.analisis}</p>}
      {web && (
        <p className="mt-2 text-[13px] text-gray-300">
          <span className="font-semibold text-white">Qué pasó{v.resultados?.dias ? ` en ${v.resultados.dias.toLocaleString("es-UY")} días` : ""}:</span>{" "}
          {web.sesiones ?? 0} visitas · {web.checkout ?? 0} al checkout · {web.ventas ?? 0} {web.ventas === 1 ? "venta" : "ventas"}
        </p>
      )}
      {cambios.length > 0 && (
        <>
          <button onClick={() => setAbierto(!abierto)} className="mt-2 text-[13px] text-sky-300 hover:underline">
            {abierto ? "Ocultar" : `Ver ${cambios.length} ${cambios.length === 1 ? "cambio" : "cambios"}${v.analisis ? " y el análisis completo" : ""}`}
          </button>
          {abierto && (
            <ul className="mt-2 space-y-1">
              {cambios.map((c, i) => (
                <li key={i} className="break-words rounded-md bg-gray-950/70 px-2.5 py-1.5 text-[12px] text-gray-300">
                  <span className="text-gray-400">{ruta(c.ruta)}:</span> {valor(c.antes)} → <span className="text-white">{valor(c.despues)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
}

export default function GoogleAdsHistorial() {
  const [versiones, setVersiones] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/tarot/google-ads/gobernanza?vista=historial")
      .then((r) => r.json())
      .then((j) => { if (!j.ok) throw new Error(j.motivo ?? "error"); setVersiones(j.versiones); })
      .catch((e) => setError(e instanceof Error ? e.message : "error"));
  }, []);
  return (
    <MarcoGoogleAds bajada="Cada cambio en la campaña queda como una versión, con lo que pasó después. Sirve para no repetir errores y para saber qué funcionó.">
      {error && <p className="rounded-xl border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200">No se pudo cargar el historial ({error}).</p>}
      {!versiones && !error && <p className="text-sm text-gray-400">Cargando…</p>}
      {versiones && (versiones.length ? <div className="space-y-3">{versiones.map((v) => <TarjetaVersion key={v.id} v={v} />)}</div> : <p className="text-sm text-gray-400">Todavía no hay versiones guardadas.</p>)}
    </MarcoGoogleAds>
  );
}
