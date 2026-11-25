"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CircleDot, FlaskConical, Info, ListChecks, RefreshCw } from "lucide-react";
import { MarcoInteligencia, pesos, entero, veces, pct, fechaCorta } from "@/components/admin/inteligencia/Marco";
import { DiagnosticoIA } from "@/components/admin/inteligencia/DiagnosticoIA";
import type { DatosCentro, FilaCanal } from "@/lib/inteligencia/centro";
import { ATRIBUCIONES, type Atribucion } from "@/lib/inteligencia/canales";

// Inteligencia comercial · Centro de control (fase 1, 2026-11-24).
// En 10 segundos: ¿gano o pierdo plata?, ¿cuánto cuesta un cliente y hacia
// dónde va?, ¿qué canal rinde?, ¿qué pide atención? El detalle vive en las
// herramientas de cada canal (Google Ads, Meta Ads, Presupuesto…).

type Consolidado = DatosCentro["actual"];

function Variacion({ ahora, antes, menosEsMejor = false, formato }: { ahora: number | null; antes: number | null; menosEsMejor?: boolean; formato: (v: number) => string }) {
  if (ahora == null || antes == null) return <span className="text-gray-500">sin comparación</span>;
  const d = ahora - antes;
  if (Math.abs(d) < 0.5) return <span className="text-gray-500">igual que antes</span>;
  const bueno = menosEsMejor ? d < 0 : d > 0;
  const Icono = d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 ${bueno ? "text-emerald-300" : "text-red-300"}`}>
      <Icono size={13} aria-hidden="true" />{formato(Math.abs(d))} <span className="text-gray-500">&nbsp;vs. {formato(antes)}</span>
    </span>
  );
}

function Veredicto({ d }: { d: DatosCentro }) {
  const a = d.actual, e = d.economia, m = d.mes;
  const gana = a.resultado >= 0;
  const cacArriba = a.cac_publicitario != null && e.cac_maximo != null && a.cac_publicitario > e.cac_maximo;
  const avance = m.objetivo ? m.resultado / m.objetivo : null;
  return (
    <section className={`rounded-2xl border p-4 md:p-5 ${gana ? "border-emerald-900/60 bg-emerald-950/20" : "border-red-900/60 bg-red-950/25"}`}>
      <p className="text-[12px] uppercase tracking-wider text-gray-400">Últimos {d.dias} días</p>
      <p className={`mt-0.5 text-xl font-bold md:text-2xl ${gana ? "text-emerald-300" : "text-red-300"}`}>
        {gana ? `El negocio ganó ${pesos(a.resultado)}` : `El negocio perdió ${pesos(Math.abs(a.resultado))}`}
      </p>
      <p className="mt-1 text-[14px] text-gray-200">
        {a.ventas} {a.ventas === 1 ? "venta" : "ventas"} por {pesos(a.facturacion)} · {pesos(a.inversion)} en publicidad
        {a.cac_publicitario != null && e.cac_maximo != null && <> · cada cliente nuevo costó {pesos(a.cac_publicitario)} y deja {pesos(e.cac_maximo)}{cacArriba ? ": se pierde en la primera venta" : ""}</>}
        {a.cac_publicitario == null && a.inversion > 0 && a.clientes_nuevos === 0 && <> · ningún cliente nuevo para esa inversión</>}
        .
      </p>
      {m.objetivo != null && (
        <div className="mt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
            <span className="text-gray-300">Este mes (desde el {fechaCorta(m.desde)}): <span className={`font-semibold tabular-nums ${m.resultado >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pesos(m.resultado)}</span> de una meta de {pesos(m.objetivo)}</span>
            <span className="text-gray-500">{m.ventas} {m.ventas === 1 ? "venta" : "ventas"} en {m.dias_transcurridos} días</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-gray-800" role="img" aria-label={`Avance hacia la meta del mes: ${avance != null ? Math.round(Math.max(avance, 0) * 100) : 0} %`}>
            <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Math.min(Math.max(avance ?? 0, 0), 1) * 100}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}

function Indicadores({ a, b, d }: { a: Consolidado; b: Consolidado; d: DatosCentro }) {
  const e = d.economia;
  const pocas = a.ventas > 0 && a.ventas < 3;
  const tiles = [
    { t: "Facturación", v: pesos(a.facturacion), s: <><span className="text-gray-400">{a.ventas} {a.ventas === 1 ? "venta cobrada" : "ventas cobradas"} · </span><Variacion ahora={a.facturacion} antes={b.facturacion} formato={pesos} /></> },
    { t: "Inversión publicitaria", v: pesos(a.inversion), s: <Variacion ahora={a.inversion} antes={b.inversion} menosEsMejor formato={pesos} /> },
    {
      t: "CAC publicitario", v: a.cac_publicitario != null ? pesos(a.cac_publicitario) : a.inversion > 0 ? "Sin clientes" : "—",
      s: <span className={pocas ? "text-amber-300" : "text-gray-400"}>Máximo rentable {pesos(e.cac_maximo)} · objetivo {e.cac_objetivo != null ? pesos(e.cac_objetivo) : "sin definir"}{pocas ? " · pocas ventas para confiar" : ""}</span>,
      malo: a.cac_publicitario != null && e.cac_maximo != null && a.cac_publicitario > e.cac_maximo,
    },
    { t: "Margen de contribución", v: pesos(a.margen_contribucion), s: <span className="text-gray-400">Lo que dejaron las ventas antes de publicidad y costos fijos</span> },
    { t: "Resultado neto", v: pesos(a.resultado), s: <Variacion ahora={a.resultado} antes={b.resultado} formato={pesos} />, malo: a.resultado < 0, bueno: a.resultado >= 0 },
  ];
  return (
    <section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((x) => (
          <div key={x.t} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5">
            <p className="text-[12px] text-gray-400">{x.t}</p>
            <p className={`mt-0.5 text-2xl font-bold tracking-tight tabular-nums ${x.malo ? "text-red-300" : x.bueno ? "text-emerald-300" : "text-white"}`}>{x.v}</p>
            <p className="mt-0.5 text-[12px] leading-snug">{x.s}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-400">
        <span>Clientes nuevos: <b className="text-gray-200">{a.clientes_nuevos}</b></span>
        <span title="Inversión publicitaria + costos fijos, gastos puntuales y cortesías, por cliente nuevo">CAC total: <b className="text-gray-200">{a.cac_total != null ? pesos(a.cac_total) : "—"}</b></span>
        <span title="Facturación por cada peso invertido en publicidad">ROAS: <b className="text-gray-200">{veces(a.roas)}</b></span>
        <span>Costos variables: <b className="text-gray-200">{pesos(a.costos_variables)}</b></span>
        <span>Costos fijos del período: <b className="text-gray-200">{pesos(a.costos_fijos)}</b></span>
      </p>
    </section>
  );
}

function Atencion({ d }: { d: DatosCentro }) {
  const estilo = { alta: "border-red-900/60 bg-red-950/20 text-red-200", media: "border-amber-900/60 bg-amber-950/15 text-amber-200", info: "border-gray-800 bg-gray-900/60 text-gray-300" };
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-base font-semibold text-white"><AlertTriangle size={16} className="text-amber-400" /> Qué pide atención</h2>
      {d.atencion.length === 0 && <p className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-3 text-[14px] text-emerald-200">Nada fuera de lo normal en el período.</p>}
      {d.atencion.map((x) => (
        <div key={x.titulo} className={`rounded-xl border p-3 ${estilo[x.nivel]}`}>
          <p className="text-[14px] font-semibold">{x.titulo}</p>
          <p className="mt-0.5 text-[13px] text-gray-300">{x.detalle}{x.enlace && <> <Link href={x.enlace as Route<string>} className="text-sky-300 hover:underline">Definirlo →</Link></>}</p>
        </div>
      ))}
    </section>
  );
}

function Decisiones({ d }: { d: DatosCentro }) {
  const filas = [
    { n: d.decisiones.analista, t: "recomendaciones del Analista sin revisar", href: "/admin/tarot/inteligencia/recomendaciones" },
    { n: d.decisiones.estratega, t: "propuestas del Estratega sin decidir", href: "/admin/tarot/inteligencia/recomendaciones" },
    { n: d.decisiones.pendientes, t: "pendientes abiertos", href: "/admin/tarot/pendientes" },
  ];
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-base font-semibold text-white"><ListChecks size={16} className="text-sky-300" /> Decisiones pendientes</h2>
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 divide-y divide-gray-800">
        {filas.map((f) => (
          <Link key={f.t} href={f.href as Route<string>} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] hover:bg-gray-800/40">
            <span className="text-gray-300"><b className="tabular-nums text-white">{f.n}</b> {f.t}</span><span className="text-sky-300">Ver →</span>
          </Link>
        ))}
      </div>
      <Link href={"/admin/tarot/inteligencia/recomendaciones" as Route<string>} className="flex items-center justify-between gap-3 rounded-xl border border-sky-900/70 bg-sky-950/20 px-3.5 py-2.5 text-[13px] text-sky-100 hover:bg-sky-950/40">
        <span>Todo junto, sin repetidas y ordenado por plata: <b>Recomendaciones</b></span><span className="text-sky-300">Abrir →</span>
      </Link>
      <h2 className="flex items-center gap-2 pt-2 text-base font-semibold text-white"><FlaskConical size={16} className="text-violet-300" /> Experimentos activos</h2>
      {d.experimentos.length === 0
        ? <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 text-[13px] text-gray-400">No hay experimentos en curso.</p>
        : (
          <div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/60">
            {d.experimentos.map((e) => (
              <Link key={e.id} href={"/admin/tarot/inteligencia/experimentos" as Route<string>} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] hover:bg-gray-800/40">
                <span className="min-w-0 text-gray-300"><b className="text-violet-200">{e.id}</b> {e.nombre} <span className="text-gray-500">· {e.estado === "activo" ? "en curso" : "planificado, sin aplicar"}</span></span><span className="shrink-0 text-sky-300">Ver →</span>
              </Link>
            ))}
          </div>
        )}
    </section>
  );
}

// CAC semanal: una línea (CAC publicitario) y dos referencias (máximo rentable y objetivo), mismo eje en pesos.
function GraficoCac({ d }: { d: DatosCentro }) {
  const [hover, setHover] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);
  // Celular: el gráfico de 12 semanas no se lee a 360 px; arranca en tabla.
  useEffect(() => { if (window.matchMedia?.("(max-width: 767px)").matches) setTabla(true); }, []);
  // Desde la primera semana con actividad (como mínimo las últimas 4): las semanas vacías de antes no dicen nada.
  const primera = d.semanas.findIndex((w) => w.inversion > 0 || w.ventas > 0);
  const s = d.semanas.slice(primera < 0 ? 0 : Math.min(primera, d.semanas.length - 4));
  const max = d.economia.cac_maximo, obj = d.economia.cac_objetivo;
  const valores = [...s.map((x) => x.cac ?? 0), max ?? 0, obj ?? 0];
  const tope = Math.max(...valores, 1) * 1.15;
  const W = 720, H = 200, L = 56, R = 16, T = 14, B = 30;
  const x = (i: number) => L + (i * (W - L - R)) / (s.length - 1);
  const y = (v: number) => T + (1 - v / tope) * (H - T - B);
  const marcas = [0, tope / 3, (2 * tope) / 3].map((v) => Math.round(v / 100) * 100);
  const tramos: string[] = [];
  let actual = "";
  s.forEach((w, i) => {
    if (w.cac == null) { if (actual) tramos.push(actual); actual = ""; return; }
    actual += `${actual ? "L" : "M"}${x(i).toFixed(1)},${y(w.cac).toFixed(1)}`;
  });
  if (actual) tramos.push(actual);
  const h = hover != null ? s[hover] : null;
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-white">Costo de adquisición, semana a semana</h2>
        <button onClick={() => setTabla((v) => !v)} className="text-[12px] text-sky-300 hover:underline">{tabla ? "Ver gráfico" : "Ver tabla"}</button>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-400">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded bg-sky-400" />CAC publicitario</span>
        {max != null && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-gray-400" />Máximo rentable ({pesos(max)})</span>}
        {obj != null && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dotted border-violet-300" />Objetivo ({pesos(obj)})</span>}
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-red-300" />Inversión sin clientes nuevos</span>
      </div>
      {tabla ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3 font-medium">Semana</th><th className="py-1 pr-3 text-right font-medium">Inversión</th><th className="py-1 pr-3 text-right font-medium">Ventas</th><th className="py-1 pr-3 text-right font-medium">Clientes nuevos</th><th className="py-1 text-right font-medium">CAC</th></tr></thead>
            <tbody>{s.map((w) => (
              <tr key={w.desde} className="border-t border-gray-800/60 text-gray-300">
                <td className="py-1 pr-3">{fechaCorta(w.desde)} – {fechaCorta(w.hasta)}{w.en_curso ? " (en curso)" : ""}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{pesos(w.inversion)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{w.ventas}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{w.clientes_nuevos}</td>
                <td className="py-1 text-right tabular-nums">{w.cac != null ? pesos(w.cac) : w.inversion > 0 ? "sin clientes" : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="CAC publicitario por semana, últimas 12 semanas" onMouseLeave={() => setHover(null)}>
            {marcas.map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#1f2937" strokeWidth="1" />
                <text x={L - 8} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize="11" fill="#9ca3af">{pesos(v)}</text>
              </g>
            ))}
            {max != null && <line x1={L} x2={W - R} y1={y(max)} y2={y(max)} stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="6 5" />}
            {obj != null && <line x1={L} x2={W - R} y1={y(obj)} y2={y(obj)} stroke="#c4b5fd" strokeWidth="1.5" strokeDasharray="2 4" />}
            {tramos.map((p) => <path key={p} d={p} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
            {s.map((w, i) => (
              <g key={w.desde}>
                {w.cac != null && <circle cx={x(i)} cy={y(w.cac)} r={hover === i ? 5 : 4} fill="#38bdf8" stroke="#111827" strokeWidth="2" />}
                {w.cac == null && w.inversion > 0 && <circle cx={x(i)} cy={T + 6} r={hover === i ? 5 : 4} fill="#111827" stroke="#fca5a5" strokeWidth="2" />}
                <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="10.5" fill={hover === i ? "#e5e7eb" : "#6b7280"}>{fechaCorta(w.desde)}</text>
                <rect x={x(i) - (W - L - R) / (s.length - 1) / 2} y={0} width={(W - L - R) / (s.length - 1)} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            ))}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#374151" strokeWidth="1" pointerEvents="none" />}
          </svg>
          {h && hover != null && (
            <div className="pointer-events-none absolute top-1 rounded-lg border border-gray-700 bg-gray-950/95 px-3 py-2 text-[12px] text-gray-200 shadow-lg"
              style={{ left: `${Math.min(Math.max((x(hover) / W) * 100, 12), 78)}%`, transform: "translateX(-50%)" }}>
              <p className="font-semibold text-white">Semana del {fechaCorta(h.desde)}{h.en_curso ? " (en curso)" : ""}</p>
              <p>Inversión {pesos(h.inversion)} · {h.ventas} {h.ventas === 1 ? "venta" : "ventas"} · {h.clientes_nuevos} nuevos</p>
              <p>CAC: <b>{h.cac != null ? pesos(h.cac) : h.inversion > 0 ? "sin clientes nuevos" : "sin inversión"}</b></p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Canales({ d }: { d: DatosCentro }) {
  const ant = new Map(d.canales_anterior.map((c) => [c.canal, c]));
  const total = d.canales.reduce((a, c) => ({ inversion: a.inversion + c.inversion, visitas: a.visitas + c.visitas, checkout: a.checkout + c.checkout, ventas: a.ventas + c.ventas, ingresos: a.ingresos + c.ingresos, nuevos: a.nuevos + c.clientes_nuevos }), { inversion: 0, visitas: 0, checkout: 0, ventas: 0, ingresos: 0, nuevos: 0 });
  const orden = [...d.canales].sort((a, b) => b.inversion - a.inversion || b.ventas - a.ventas || b.visitas - a.visitas);
  const cacColor = (c: FilaCanal) => c.cac == null ? "text-gray-300" : d.economia.cac_maximo != null && c.cac > d.economia.cac_maximo ? "text-red-300" : "text-emerald-300";
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-white">Resultado por canal</h2>
        <p className="text-[12px] text-gray-500">Cada venta cuenta en un solo canal ({ATRIBUCIONES.find((a) => a.id === d.atribucion)?.nombre.toLowerCase()}).</p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-gray-500">
              <th className="py-1.5 pr-3 font-medium">Canal</th>
              <th className="py-1.5 pr-3 text-right font-medium">Inversión</th>
              <th className="py-1.5 pr-3 text-right font-medium">Visitas</th>
              <th className="py-1.5 pr-3 text-right font-medium">Checkout</th>
              <th className="py-1.5 pr-3 text-right font-medium">Ventas</th>
              <th className="py-1.5 pr-3 text-right font-medium">Clientes nuevos</th>
              <th className="py-1.5 pr-3 text-right font-medium">CAC</th>
              <th className="py-1.5 pr-3 text-right font-medium">ROAS</th>
              <th className="py-1.5 text-right font-medium" title="Lo que informa la plataforma; no son ventas cobradas">Conv. informadas</th>
            </tr>
          </thead>
          <tbody>
            {orden.map((c) => {
              const a = ant.get(c.canal);
              return (
                <tr key={c.canal} className="border-t border-gray-800/60 text-gray-200">
                  <td className="py-2 pr-3"><span className="font-medium text-white">{c.nombre}</span>{c.pago && <span className="ml-1.5 rounded border border-gray-700 px-1 text-[10px] text-gray-400">pago</span>}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c.inversion > 0 ? pesos(c.inversion) : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{entero(c.visitas)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{entero(c.checkout)} <span className="text-[11px] text-gray-500">{pct(c.checkout, c.visitas)}</span></td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c.ventas}{a && a.ventas !== c.ventas && <span className="ml-1 text-[11px] text-gray-500">(antes {a.ventas})</span>}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c.clientes_nuevos}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${cacColor(c)}`}>{c.cac != null ? pesos(c.cac) : c.inversion > 0 ? "sin clientes" : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{veces(c.roas)}</td>
                  <td className="py-2 text-right tabular-nums text-gray-400">{c.conversiones_plataforma != null ? entero(c.conversiones_plataforma) : "—"}</td>
                </tr>
              );
            })}
            <tr className="border-t border-gray-700 font-semibold text-white">
              <td className="py-2 pr-3">Total del negocio</td>
              <td className="py-2 pr-3 text-right tabular-nums">{pesos(total.inversion)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{entero(total.visitas)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{entero(total.checkout)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{total.ventas}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{total.nuevos}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{total.inversion > 0 && total.nuevos > 0 ? pesos(total.inversion / total.nuevos) : "—"}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{total.inversion > 0 ? veces(total.ingresos / total.inversion) : "—"}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Embudo({ d }: { d: DatosCentro }) {
  const pagos = d.canales.filter((c) => c.pago && c.inversion > 0);
  const [canal, setCanal] = useState<string>(pagos.find((c) => c.canal === "google_ads")?.canal ?? pagos[0]?.canal ?? "todos");
  const c = d.canales.find((x) => x.canal === canal);
  const filas = c
    ? [{ t: "Impresiones", v: c.impresiones }, { t: "Clics", v: c.clics }, { t: "Visitas medidas", v: c.visitas }, { t: "Llegan al checkout", v: c.checkout }, { t: "Compras", v: c.ventas }]
    : [
        { t: "Impresiones (pagas)", v: pagos.reduce((a, x) => a + (x.impresiones ?? 0), 0) },
        { t: "Clics (pagos)", v: pagos.reduce((a, x) => a + (x.clics ?? 0), 0) },
        { t: "Visitas (todos los canales)", v: d.canales.reduce((a, x) => a + x.visitas, 0) },
        { t: "Llegan al checkout", v: d.canales.reduce((a, x) => a + x.checkout, 0) },
        { t: "Compras", v: d.actual.ventas },
      ];
  const base = Math.max(...filas.map((f) => f.v ?? 0), 1);
  const clics = filas[1].v ?? 0, compras = filas[4].v ?? 0;
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">Embudo comercial</h2>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} aria-label="Canal del embudo" className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-[13px] text-white">
          {pagos.map((p) => <option key={p.canal} value={p.canal}>{p.nombre}</option>)}
          <option value="todos">Todos los canales</option>
        </select>
      </div>
      <div className="mt-3 space-y-1.5">
        {filas.map((f, i) => (
          <div key={f.t} className="grid grid-cols-[104px_1fr_84px] items-center gap-2 text-[13px] md:grid-cols-[190px_1fr_120px] md:gap-3">
            <span className="text-gray-300">{f.t}</span>
            <span className="h-3 rounded bg-gray-800"><span className="block h-3 rounded bg-sky-500/80" style={{ width: `${f.v ? Math.max((f.v / base) * 100, 1.5) : 0}%` }} /></span>
            <span className="text-right tabular-nums text-white">{f.v == null ? "—" : entero(f.v)}{i > 0 && f.v != null && filas[i - 1].v ? <span className="ml-1 text-[11px] text-gray-500">{pct(f.v, filas[i - 1].v ?? 0)}</span> : null}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-gray-400">Conversión clic → compra: <b className="text-white">{clics > 0 ? pct(compras, clics) : "—"}</b>{c?.conversiones_plataforma != null && <> · la plataforma informa {entero(c.conversiones_plataforma)} conversiones y se cobraron {c.ventas} ventas</>}</p>
    </section>
  );
}

export default function CentroDeControl() {
  const [dias, setDias] = useState(30);
  const [atribucion, setAtribucion] = useState<Atribucion>("ultimo");
  const [d, setD] = useState<DatosCentro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const j = await fetch(`/api/admin/tarot/inteligencia?vista=centro&dias=${dias}&atribucion=${atribucion}`, { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.detalle ?? j.motivo ?? "error");
      setD(j);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); } finally { setCargando(false); }
  }, [dias, atribucion]);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <MarcoInteligencia
      bajada="¿Gano o pierdo plata, cuánto me cuesta cada cliente y qué pide atención? El negocio completo y cada canal, en una pantalla."
      extra={
        <div className="flex flex-wrap items-center gap-2">
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período" className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-2 text-sm text-white">
            {[7, 14, 30, 90].map((n) => <option key={n} value={n}>Últimos {n} días</option>)}
          </select>
          <select value={atribucion} onChange={(e) => setAtribucion(e.target.value as Atribucion)} aria-label="Modelo de atribución" title={ATRIBUCIONES.find((a) => a.id === atribucion)?.ayuda} className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-2 text-sm text-white">
            {ATRIBUCIONES.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <button onClick={cargar} disabled={cargando} aria-label="Actualizar" className="rounded-lg border border-gray-700 p-2 text-gray-200 hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
          </button>
        </div>
      }
    >
      {error && <p className="rounded-xl border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200">No se pudieron cargar los datos ({error}).</p>}
      {!d && !error && <p className="text-sm text-gray-400">Cargando…</p>}
      {d && (
        <div className={`space-y-4 md:space-y-5 ${cargando ? "opacity-60" : ""}`}>
          <Veredicto d={d} />
          <DiagnosticoIA />
          <Indicadores a={d.actual} b={d.anterior} d={d} />
          <div className="grid gap-4 md:grid-cols-2">
            <Atencion d={d} />
            <Decisiones d={d} />
          </div>
          <GraficoCac d={d} />
          <Canales d={d} />
          <Embudo d={d} />
          <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-3.5 text-[12px] text-gray-400">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-gray-300"><Info size={13} /> Cómo se calcula</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {d.notas.map((n) => <li key={n}>{n}</li>)}
              <li>Comparación: los {d.dias} días anteriores. Margen por venta y CAC máximo: últimos 90 días ({d.economia.ventas_referencia} ventas). Dólar a {d.economia.tipo_cambio.valor}{d.economia.tipo_cambio.estimado ? " (estimado)" : ""}.</li>
            </ul>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              <span className="flex items-center gap-1"><CircleDot size={12} /> Detalle por herramienta:</span>
              {[["Google Ads", "/admin/tarot/google-ads"], ["Meta Ads", "/admin/tarot/meta-ads"], ["Presupuesto", "/admin/tarot/presupuesto"], ["Visitantes", "/admin/tarot/visitantes"], ["Analista", "/admin/tarot/analista"], ["Estratega", "/admin/tarot/estratega"]].map(([t, h]) => (
                <Link key={h} href={h as Route<string>} className="text-sky-300 hover:underline">{t}</Link>
              ))}
            </p>
          </section>
        </div>
      )}
    </MarcoInteligencia>
  );
}
