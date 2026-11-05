"use client";
import { useState } from "react";
import { Gauge, RefreshCw, Smartphone, Monitor, KeyRound } from "lucide-react";

// Página de destino de Google Ads (2026-11-05). Tres miradas sobre /tarot:
//  1. Velocidad medida con PageSpeed (el motor de Google), una vez por día.
//  2. Lo que Google opina de la página en cada palabra clave ("experiencia
//     en la página de destino", relevancia del anuncio y CTR esperado): son
//     los tres componentes del nivel de calidad.
//  3. Clics por página de destino según Google.
// Solo lectura.

export interface Medicion { rendimiento: number | null; lcp_ms: number | null; fcp_ms: number | null; tbt_ms: number | null; cls: number | null; real: { lcp_ms: number | null; categoria: string | null } | null; error?: string }
export interface Destino {
  version: number | null; desde: string | null;
  calidad: { texto: string; concordancia: string; estado: string; nivel_calidad: number | null; ctr_esperado: string | null; relevancia_anuncio: string | null; experiencia_pagina: string | null }[];
  paginas: { filas: { url: string; impresiones: number; clics: number; velocidad_google: number | null }[] } | null;
  velocidad: { url: string; medido_at: string; movil: Medicion; escritorio: Medicion } | null;
  clave_pagespeed: boolean;
}

const COMPONENTE: Record<string, { label: string; cls: string; peso: number }> = {
  ABOVE_AVERAGE: { label: "Por encima", cls: "border-emerald-800/70 bg-emerald-950/40 text-emerald-300", peso: 2 },
  AVERAGE: { label: "Promedio", cls: "border-amber-800/60 bg-amber-950/30 text-amber-300", peso: 1 },
  BELOW_AVERAGE: { label: "Por debajo", cls: "border-red-900/70 bg-red-950/40 text-red-300", peso: 0 },
};
const CONC: Record<string, string> = { BROAD: "amplia", PHRASE: "frase", EXACT: "exacta" };
const seg = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toLocaleString("es-UY", { maximumFractionDigits: 1 })} s`);
const hace = (s: string) => { const m = Math.round((Date.now() - new Date(s).getTime()) / 60_000); return m < 1 ? "recién" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };
const tonoPuntaje = (p: number | null) => (p == null ? "#4b5563" : p >= 90 ? "#34d399" : p >= 50 ? "#fbbf24" : "#f87171");

function Chip({ v }: { v: string | null }) {
  const c = v ? COMPONENTE[v] : null;
  return c ? <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c.cls}`}>{c.label}</span> : <span className="text-[11px] text-gray-600">sin datos</span>;
}

function Anillo({ puntaje }: { puntaje: number | null }) {
  const r = 30, c = 2 * Math.PI * r, color = tonoPuntaje(puntaje);
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`Rendimiento ${puntaje ?? "sin medir"} de 100`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="#1f2937" strokeWidth="7" />
      {puntaje != null && <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(puntaje / 100) * c} ${c}`} transform="rotate(-90 38 38)" />}
      <text x="38" y="44" textAnchor="middle" fontSize="20" fontWeight="700" fill={puntaje == null ? "#6b7280" : "#fff"}>{puntaje ?? "—"}</text>
    </svg>
  );
}

function Dispositivo({ titulo, Icon, m, objetivo }: { titulo: string; Icon: typeof Smartphone; m: Medicion | undefined; objetivo: number }) {
  const lcp = m?.lcp_ms ?? null;
  const ok = lcp != null && lcp <= objetivo;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-950/50 p-4">
      <Anillo puntaje={m?.rendimiento ?? null} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-white"><Icon size={13} className="text-gray-400" /> {titulo}</p>
        {m?.error ? (
          <p className="mt-1 text-[11px] text-amber-300">{m.error === "cupo_agotado" ? "PageSpeed sin cupo hoy: se reintenta en la próxima hora." : `No se pudo medir (${m.error}).`}</p>
        ) : (
          <>
            <p className="mt-1 text-[11px] text-gray-400">
              Carga de lo principal: <span className={`font-semibold tabular-nums ${lcp == null ? "text-gray-500" : ok ? "text-emerald-300" : "text-amber-300"}`}>{seg(lcp)}</span>
              <span className="text-gray-600"> · objetivo {seg(objetivo)}</span>
            </p>
            <p className="text-[11px] text-gray-500">Primer contenido {seg(m?.fcp_ms ?? null)} · bloqueo {m?.tbt_ms != null ? `${Math.round(m.tbt_ms)} ms` : "—"}</p>
            {m?.real?.lcp_ms != null && <p className="text-[11px] text-sky-300">Visitantes reales (Chrome): {seg(m.real.lcp_ms)}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export function PaginaDestino({ destino, alMedir }: { destino: Destino | undefined; alMedir: () => void }) {
  const [midiendo, setMidiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  if (!destino) return null;
  const v = destino.velocidad;
  const medir = async () => {
    setMidiendo(true); setAviso(null);
    try {
      const r = await fetch("/api/admin/tarot/google-ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "medir_pagina" }) });
      const j = await r.json();
      if (!j.ok) setAviso(j.motivo === "cupo_agotado" ? "PageSpeed no tiene cupo hoy (sin clave propia). Se reintenta sola cada hora." : "PageSpeed no respondió. Probá más tarde.");
      alMedir();
    } catch { setAviso("No se pudo medir."); } finally { setMidiendo(false); }
  };

  // Solo palabras activas con opinión de Google.
  const activas = destino.calidad.filter((k) => k.estado === "ENABLED");
  const conDatos = activas.filter((k) => k.experiencia_pagina);
  const cuenta = (campo: "experiencia_pagina" | "relevancia_anuncio" | "ctr_esperado", val: string) => conDatos.filter((k) => k[campo] === val).length;
  const debajo = cuenta("experiencia_pagina", "BELOW_AVERAGE");
  const filas = [...conDatos].sort((a, b) => (COMPONENTE[a.experiencia_pagina ?? ""]?.peso ?? 9) - (COMPONENTE[b.experiencia_pagina ?? ""]?.peso ?? 9) || (a.nivel_calidad ?? 0) - (b.nivel_calidad ?? 0));
  const paginas = (destino.paginas?.filas ?? []).filter((p) => p.impresiones > 0 || p.clics > 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-900/50 bg-gradient-to-b from-violet-950/30 via-gray-900/40 to-gray-950/40 shadow-[0_10px_40px_-20px_rgba(139,92,246,0.45)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800/80 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">Página de destino</p>
          <p className="mt-0.5 flex items-center gap-2 text-base font-semibold text-white"><Gauge size={16} className="text-violet-300" /> Cómo califica Google a /tarot</p>
          <p className="mt-0.5 text-[11px] text-gray-400">La experiencia en la página es uno de los tres componentes del nivel de calidad: si está por debajo, cada clic cuesta más y el anuncio sale menos.</p>
        </div>
        <div className="text-right">
          <button onClick={medir} disabled={midiendo} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-800/70 bg-violet-950/40 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-900/40 disabled:opacity-50">
            <RefreshCw size={12} className={midiendo ? "animate-spin" : ""} /> {midiendo ? "Midiendo (~1 min)…" : "Medir velocidad ahora"}
          </button>
          <p className="mt-1 text-[10px] text-gray-500">{v ? `Medida ${hace(v.medido_at)} · se mide sola 1 vez por día` : "Todavía sin medición · se mide sola 1 vez por día"}</p>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Velocidad (PageSpeed)</p>
          <Dispositivo titulo="Celular" Icon={Smartphone} m={v?.movil} objetivo={2500} />
          <Dispositivo titulo="Computadora" Icon={Monitor} m={v?.escritorio} objetivo={2500} />
          <p className="text-[10px] leading-relaxed text-gray-500">Puntaje de 0 a 100 con un celular lento simulado (el más exigente). Verde ≥ 90 · amarillo 50–89 · rojo &lt; 50. Google Ads no publica su propio puntaje de velocidad hasta tener más clics.</p>
          {!destino.clave_pagespeed && (
            <p className="flex items-start gap-1.5 rounded-lg border border-gray-800 bg-gray-950/60 p-2.5 text-[10px] text-gray-400">
              <KeyRound size={12} className="mt-px shrink-0 text-gray-500" /> Sin clave propia de PageSpeed: usa el cupo compartido de Google, que a veces se agota. Para que nunca falle: crear una clave gratis y cargarla en Vercel como PAGESPEED_API_KEY.
            </p>
          )}
          {aviso && <p className="text-[11px] text-amber-300">{aviso}</p>}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Lo que opina Google, por palabra</p>
            {destino.version != null && <p className="text-[10px] text-gray-500">versión {destino.version} de la campaña</p>}
          </div>
          {conDatos.length === 0 ? (
            <p className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 text-xs text-gray-400">Google todavía no califica las palabras activas (necesita impresiones). Aparece en unos días.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {([["experiencia_pagina", "Experiencia en la página"], ["relevancia_anuncio", "Relevancia del anuncio"], ["ctr_esperado", "Clics esperados"]] as const).map(([campo, t]) => {
                  const bajo = cuenta(campo, "BELOW_AVERAGE");
                  return (
                    <div key={campo} className={`rounded-xl border p-3 ${bajo ? "border-red-900/60 bg-red-950/20" : "border-emerald-900/50 bg-emerald-950/20"}`}>
                      <p className="text-[10px] text-gray-400">{t}</p>
                      <p className={`mt-0.5 text-lg font-bold tabular-nums ${bajo ? "text-red-300" : "text-emerald-300"}`}>{conDatos.length - bajo}/{conDatos.length}</p>
                      <p className="text-[10px] text-gray-500">en promedio o mejor</p>
                    </div>
                  );
                })}
              </div>
              {debajo > 0 && <p className="text-[11px] text-red-300">En {debajo} de {conDatos.length} palabras la página está por debajo del promedio. Google tarda días en recalcularlo después de cada mejora.</p>}
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-xs">
                  <thead className="bg-gray-950/60 text-left text-[10px] uppercase tracking-wider text-gray-500">
                    <tr><th className="px-3 py-2 font-medium">Palabra</th><th className="px-2 py-2 text-center font-medium">Calidad</th><th className="px-2 py-2 font-medium">Página</th><th className="px-2 py-2 font-medium">Anuncio</th><th className="px-2 py-2 font-medium">Clics esp.</th></tr>
                  </thead>
                  <tbody>
                    {filas.map((k) => (
                      <tr key={k.texto + k.concordancia} className="border-t border-gray-800/80">
                        <td className="px-3 py-1.5 text-gray-200">{k.texto} <span className="text-[10px] text-gray-500">{CONC[k.concordancia] ?? k.concordancia}</span></td>
                        <td className="px-2 py-1.5 text-center tabular-nums"><span className={`font-bold ${(k.nivel_calidad ?? 0) >= 7 ? "text-emerald-300" : (k.nivel_calidad ?? 0) >= 5 ? "text-amber-300" : "text-red-300"}`}>{k.nivel_calidad ?? "—"}</span><span className="text-gray-600">/10</span></td>
                        <td className="px-2 py-1.5"><Chip v={k.experiencia_pagina} /></td>
                        <td className="px-2 py-1.5"><Chip v={k.relevancia_anuncio} /></td>
                        <td className="px-2 py-1.5"><Chip v={k.ctr_esperado} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {paginas.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Páginas de destino según Google · 30 días</p>
              {paginas.map((p) => (
                <div key={p.url} className="flex items-center justify-between gap-3 border-t border-gray-800/60 py-1 text-[11px] first:border-t-0">
                  <span className="truncate text-gray-300">{p.url.replace("https://tuoraculo.uy", "") || "/"}</span>
                  <span className="shrink-0 tabular-nums text-gray-500">{p.impresiones} impr. · <span className="text-gray-200">{p.clics} clics</span>{p.velocidad_google != null && <> · velocidad Google {p.velocidad_google}/10</>}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
