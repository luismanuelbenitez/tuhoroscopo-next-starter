"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { CalendarClock, CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import { MarcoGoogleAds, SelectorDias } from "@/components/admin/googleAds/gobernanza/Marco";
import { useGobernanza, plata, fechaCorta, type DatosGobernanza } from "@/components/admin/googleAds/gobernanza/datos";
import { TarjetaHallazgo } from "@/components/admin/googleAds/gobernanza/Hallazgos";

// Google Ads · Resumen (centro de comando, 2026-11-14). Responde en 5
// segundos si la plata se está aprovechando: puntaje de salud, 4 números,
// si hay que esperar al último cambio y las 3 cosas más urgentes de hoy.
// Solo lectura. El detalle de siempre quedó en las otras pestañas.

const SALUD = {
  bien: { t: "Bien", color: "#34d399", texto: "text-emerald-300" },
  mejorable: { t: "Mejorable", color: "#fbbf24", texto: "text-amber-300" },
  mal: { t: "Mal", color: "#f87171", texto: "text-red-300" },
};

function Salud({ d }: { d: DatosGobernanza }) {
  const s = SALUD[d.salud.estado];
  const R = 42, C = 2 * Math.PI * R;
  const cuenta = (col: string) => d.hallazgos.filter((h) => h.columna === col).length;
  return (
    <section className="flex items-center gap-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 md:p-5">
      <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" role="img" aria-label={`Salud de la cuenta: ${d.salud.puntaje} de 100`}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="#1f2937" strokeWidth="8" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(d.salud.puntaje / 100) * C} ${C}`} transform="rotate(-90 50 50)" />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontSize="26" fontWeight="700" fill="#ffffff">{d.salud.puntaje}</text>
      </svg>
      <div className="min-w-0">
        <p className="text-[12px] uppercase tracking-wider text-gray-400">Salud de la cuenta</p>
        <p className={`text-xl font-bold ${s.texto}`}>{s.t}</p>
        <p className="mt-1 text-[13px] text-gray-300">
          {cuenta("frenar")} para frenar · {cuenta("oportunidad")} para mejorar · {cuenta("escalar")} para escalar · {cuenta("esperar")} esperando datos
        </p>
      </div>
    </section>
  );
}

function Numeros({ d }: { d: DatosGobernanza }) {
  const k = d.kpis, mv = d.moneda.venta, mc = d.moneda.cuenta;
  const pocos = !k.suficientes && k.ventas > 0;
  const tiles: { t: string; v: string; s: string; aviso?: boolean }[] = [
    { t: "Gasto", v: plata(k.gasto_cuenta, mc), s: `≈ ${plata(k.gasto_venta, mv)} · ${k.clics} clics` },
    { t: "Ventas", v: String(k.ventas), s: k.ventas ? `${plata(k.ingresos, mv)} cobrados` : "Ninguna desde Google en el período" },
    { t: "Costo por venta", v: k.costo_por_venta != null ? plata(k.costo_por_venta, mv) : "—", s: `Objetivo: ${plata(d.config.cpa_objetivo, mv)}${pocos ? " · pocas ventas para confiar" : ""}`, aviso: pocos },
    { t: "Retorno", v: k.retorno != null ? `${k.retorno.toFixed(1).replace(".", ",")}×` : "—", s: k.retorno != null ? `Por cada ${plata(100, mv)} gastados volvieron ${plata(k.retorno * 100, mv)}` : "Sin gasto en el período" },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((x) => (
        <div key={x.t} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5">
          <p className="text-[12px] text-gray-400">{x.t}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight text-white tabular-nums">{x.v}</p>
          <p className={`mt-0.5 text-[12px] leading-snug ${x.aviso ? "text-amber-300" : "text-gray-400"}`}>{x.s}</p>
        </div>
      ))}
    </section>
  );
}

function Revision({ d }: { d: DatosGobernanza }) {
  const r = d.revision;
  return (
    <section className={`flex items-start gap-3 rounded-xl border p-4 ${r.esperar ? "border-sky-900/60 bg-sky-950/30" : "border-emerald-900/60 bg-emerald-950/20"}`}>
      {r.esperar ? <CalendarClock size={20} className="mt-0.5 shrink-0 text-sky-300" /> : <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-300" />}
      <div>
        <p className="text-[15px] font-semibold text-white">{r.esperar ? `No toques la campaña${r.hasta ? ` hasta el ${fechaCorta(r.hasta)}` : " todavía"}` : "Se puede revisar y cambiar"}</p>
        <p className="mt-0.5 text-[13px] text-gray-300">{r.motivo}</p>
      </div>
    </section>
  );
}

// Resumen con IA (fase 2): solo cuando se toca el botón; cuesta ~1 centavo de dólar.
function ResumenIa({ dias }: { dias: number }) {
  const [r, setR] = useState<{ texto: string; costo_usd: number } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pedir = async () => {
    setCargando(true); setError(null);
    try {
      const j = await fetch("/api/admin/tarot/google-ads/gobernanza", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "resumen_ia", dias }) }).then((x) => x.json());
      if (!j.ok) throw new Error(j.motivo ?? "error");
      setR({ texto: j.texto, costo_usd: j.costo_usd });
    } catch (e) { setError(e instanceof Error ? e.message : "error"); } finally { setCargando(false); }
  };
  // **negrita** → <strong>; el resto, texto plano.
  const linea = (t: string, i: number) => <p key={i} className="text-[14px] leading-relaxed text-gray-200">{t.split(/(\*\*[^*]+\*\*)/g).map((s, j) => s.startsWith("**") ? <strong key={j} className="font-semibold text-white">{s.slice(2, -2)}</strong> : s)}</p>;
  return (
    <section className="rounded-2xl border border-violet-900/50 bg-violet-950/15 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white"><Sparkles size={17} className="text-violet-300" /> En palabras</h2>
        <button onClick={pedir} disabled={cargando} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-violet-800 px-3 text-[13px] text-violet-100 hover:bg-violet-950/50 disabled:opacity-50">
          {cargando ? "Escribiendo…" : r ? "Pedir otro" : "Pedir resumen con IA"}
        </button>
      </div>
      {!r && !error && <p className="mt-1 text-[13px] text-gray-400">La IA lee el diagnóstico y lo cuenta en 3 párrafos: cómo venimos, qué hacer esta semana y qué no tocar. Cuesta alrededor de 1 centavo de dólar.</p>}
      {error && <p className="mt-2 text-[13px] text-red-300">{error}</p>}
      {r && (
        <div className="mt-2 space-y-2">
          {r.texto.split(/\n+/).filter((t) => t.trim()).map(linea)}
          <p className="text-[11px] text-gray-500">Costó US$ {r.costo_usd.toFixed(4).replace(".", ",")}. La IA solo lee: no cambia nada.</p>
        </div>
      )}
    </section>
  );
}

function Campanas({ d }: { d: DatosGobernanza }) {
  if (!d.campanas.length) return null;
  return (
    <section className="space-y-2">
      {d.campanas.map((c) => {
        const total = c.presupuesto_total;
        const uso = total ? Math.min(c.gastado_total / total, 1) : null;
        return (
          <div key={c.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[14px] font-semibold text-white">{c.nombre}</p>
              <p className="text-[12px] text-gray-400">
                {total != null ? `${plata(c.gastado_total, d.moneda.cuenta)} de ${plata(total, d.moneda.cuenta)}` : c.presupuesto_diario != null ? `${plata(c.presupuesto_diario, d.moneda.cuenta)} por día` : ""}
                {c.fin ? ` · termina el ${fechaCorta(c.fin.replace(" ", "T") + "-03:00")}` : ""}
              </p>
            </div>
            {uso != null && (
              <div className="mt-2 h-2 rounded-full bg-gray-800" role="img" aria-label={`Presupuesto usado: ${Math.round(uso * 100)} %`}>
                <div className="h-2 rounded-full bg-sky-400" style={{ width: `${Math.max(uso * 100, 2)}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export default function GoogleAdsResumen() {
  const [dias, setDias] = useState(14);
  const { d, error, cargando, cargar } = useGobernanza(dias);
  return (
    <MarcoGoogleAds
      bajada="¿La plata se está aprovechando? El puntaje, los números que importan y lo más urgente de hoy."
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
          <Revision d={d} />
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Salud d={d} />
            <Numeros d={d} />
          </div>
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-white">Lo más urgente hoy</h2>
              <Link href={"/admin/tarot/google-ads/diagnostico" as Route} className="text-[13px] text-sky-300 hover:underline">Diagnóstico completo →</Link>
            </div>
            {d.alertas.length ? (
              <div className="grid gap-3 md:grid-cols-3">{d.alertas.map((h) => <TarjetaHallazgo key={h.id} h={h} conColumna />)}</div>
            ) : (
              <p className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 text-[14px] text-emerald-200">Nada urgente. Revisá la columna «Esperar» en el diagnóstico.</p>
            )}
          </section>
          {d.propuestas.length > 0 && (
            <Link href={"/admin/tarot/google-ads/cambios" as Route} className="flex items-center justify-between gap-3 rounded-xl border border-sky-900/60 bg-sky-950/20 p-4 hover:bg-sky-950/40">
              <span className="text-[14px] text-sky-100"><span className="font-semibold text-white">{d.propuestas.reduce((a, p) => a + p.items.length, 0)} cambios listos para aplicar</span> con un botón (negativas y pausas: nunca suben el gasto).</span>
              <span className="shrink-0 text-[13px] text-sky-300">Ver →</span>
            </Link>
          )}
          <ResumenIa dias={dias} />
          <Campanas d={d} />
          <p className="text-[12px] text-gray-500">
            Últimos {d.dias} días. Gasto según Google; ventas e ingresos según la web (sin tráfico interno). Dólar a {d.moneda.tipo_cambio}.
          </p>
        </>
      )}
    </MarcoGoogleAds>
  );
}
