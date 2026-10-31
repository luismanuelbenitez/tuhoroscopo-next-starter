"use client";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, RefreshCw, ArrowRight, Wallet, Clock } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { usePollingRefresh } from "@/lib/usePollingRefresh";

// Ingresos de Tarot (rediseño 2026-10-31): cuánto entró, cuánto te queda
// después de Mercado Pago, cómo viene contra el período anterior, cuánta plata
// falta liberar, de dónde vienen las ventas y quién pagó.

interface Totales { ventas: number; cobrado: number; comision: number; neto: number }
interface Punto { fecha: string; cobrado: number; ventas: number }
interface Grupo { clave: string; ventas: number; cobrado: number }
interface Pago {
  id: string; orden_id: string; created_at: string; moneda: string; monto: number; comision: number; neto: number;
  medio: string; marca: string | null; cuotas: number; liberacion_at: string | null; liberada: boolean;
  cliente: string | null; tema: string | null; estado_orden: string | null; origen: string; interna: boolean;
}
interface Datos {
  ok: boolean; periodo: string; dias: number;
  actual: Totales; anterior: Totales | null; internas: number;
  serie: Punto[]; serie_anterior: Punto[] | null;
  por_tema: Grupo[]; por_origen: Grupo[]; por_medio: Grupo[];
  mes: { nombre: string; cobrado: number; ventas: number; dia: number; dias: number; proyeccion: number | null };
  por_liberar: { neto: number; proxima: string | null };
  otras_monedas: { moneda: string; monto: number }[];
  pagos: Pago[];
}

const PERIODOS = [
  { key: "hoy", label: "Hoy", antes: "ayer" },
  { key: "7d", label: "7 días", antes: "los 7 días anteriores" },
  { key: "30d", label: "30 días", antes: "los 30 días anteriores" },
  { key: "90d", label: "90 días", antes: "los 90 días anteriores" },
  { key: "todo", label: "Todo", antes: "" },
];
const TEMAS: Record<string, string> = { general: "General", amor: "Amor", trabajo: "Trabajo", salud: "Salud", dinero: "Dinero", decision: "Decisión", "sin tema": "Sin tema" };
const MEDIOS: Record<string, string> = { credit_card: "Tarjeta de crédito", debit_card: "Tarjeta de débito", account_money: "Dinero en Mercado Pago", ticket: "Efectivo (Abitab / Redpagos)", bank_transfer: "Transferencia", prepaid_card: "Tarjeta prepaga", otro: "Otro" };
const MARCAS: Record<string, string> = { visa: "Visa", master: "Mastercard", oca: "OCA", debvisa: "Visa", debmaster: "Mastercard", amex: "Amex", diners: "Diners", lider: "Líder", creditel: "Creditel" };

const pesos = (v: number) => `$ ${Math.round(v).toLocaleString("es-UY")}`;
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-UY", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit" });
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

export default function TarotIngresosPage() {
  const [periodo, setPeriodo] = useState("30d");
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`/api/admin/tarot/ingresos?periodo=${periodo}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`);
      else { setD(j); setErrorMsg(null); }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [periodo]);
  usePollingRefresh(cargar, 120_000);

  const antes = PERIODOS.find((p) => p.key === periodo)?.antes ?? "";

  return (
    <TarotAdminShell>
      <main className="px-6 py-6 max-w-[1320px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Ingresos</h2>
            <p className="text-xs text-gray-500 mt-0.5">Todo lo que se cobró por lecturas de Tarot y lo que te queda después de Mercado Pago{antes ? `, comparado con ${antes}` : ""}.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-800 bg-gray-900/60 p-0.5">
              {PERIODOS.map((p) => (
                <button key={p.key} onClick={() => setPeriodo(p.key)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${periodo === p.key ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40" : "text-gray-400 hover:text-gray-200"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={cargar} title="Actualizar" className="p-2 rounded-lg border border-gray-800 bg-gray-900/60 text-gray-400 hover:text-gray-200">
              <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" /> {errorMsg}
          </div>
        )}
        {!d && cargando && <p className="text-sm text-gray-500 animate-pulse">Cargando ingresos…</p>}

        {d && (
          <div className={`space-y-5 transition-opacity ${cargando ? "opacity-70" : ""}`}>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <Hero d={d} />
              <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Tile titulo="Ventas" valor={String(d.actual.ventas)} delta={d.anterior ? d.actual.ventas - d.anterior.ventas : null} deltaFmt={(v) => String(v)}
                  nota={d.anterior ? `antes ${d.anterior.ventas}` : undefined} />
                <Tile titulo="Ticket promedio" valor={d.actual.ventas ? pesos(d.actual.cobrado / d.actual.ventas) : "—"}
                  nota={d.actual.ventas ? `neto ${pesos(d.actual.neto / d.actual.ventas)} por venta` : "sin ventas en el período"} />
                <Tile titulo="Por liberar en Mercado Pago" valor={d.por_liberar.neto > 0 ? pesos(d.por_liberar.neto) : "$ 0"}
                  icono={d.por_liberar.neto > 0 ? <Clock size={13} className="text-amber-300/80" /> : <Wallet size={13} className="text-emerald-300/80" />}
                  nota={d.por_liberar.neto > 0 && d.por_liberar.proxima ? `se libera desde el ${fechaCorta(d.por_liberar.proxima)}` : "todo disponible para retirar"} />
                <Mes m={d.mes} />
              </div>
            </div>

            <Grafico d={d} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Desglose titulo="Por tema" grupos={d.por_tema} etiqueta={(k) => TEMAS[k] ?? k} total={d.actual.cobrado} />
              <Desglose titulo="Por origen" grupos={d.por_origen} etiqueta={(k) => k} total={d.actual.cobrado} />
              <Desglose titulo="Cómo pagaron" grupos={d.por_medio} etiqueta={(k) => MEDIOS[k] ?? k} total={d.actual.cobrado} />
            </div>

            <Pagos pagos={d.pagos} />

            {d.otras_monedas.length > 0 && (
              <p className="text-[11px] text-gray-500">Además hubo {d.otras_monedas.length} cobro{d.otras_monedas.length > 1 ? "s" : ""} en otra moneda (no sumados arriba).</p>
            )}
          </div>
        )}
      </main>
    </TarotAdminShell>
  );
}

// ── Cifra principal: lo que te queda ────────────────────────────────────────

function Hero({ d }: { d: Datos }) {
  const a = d.actual;
  const pctNeto = a.cobrado > 0 ? (a.neto / a.cobrado) * 100 : 0;
  const delta = d.anterior ? a.neto - d.anterior.neto : null;
  return (
    <div className="xl:col-span-5 rounded-2xl border border-emerald-900/50 bg-gradient-to-br from-emerald-950/40 via-gray-900/60 to-gray-900/60 px-6 py-5">
      <p className="text-xs text-emerald-300/80">Te quedó</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums text-white tracking-tight">{pesos(a.neto)}</p>
      <p className="mt-1 text-sm text-gray-400">
        de <span className="text-gray-200">{pesos(a.cobrado)}</span> cobrados en {a.ventas} venta{a.ventas === 1 ? "" : "s"}
        {delta != null && Math.abs(delta) >= 0.5 && (
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${delta > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
            {delta > 0 ? "↑" : "↓"} {pesos(Math.abs(delta))}
          </span>
        )}
      </p>
      {a.cobrado > 0 ? (
        <div className="mt-5">
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
            <div className="h-full rounded-l-full bg-emerald-400/80" style={{ width: `${pctNeto}%` }} title={`Te queda ${pesos(a.neto)}`} />
            <div className="h-full rounded-r-full bg-gray-600" style={{ width: `${100 - pctNeto}%` }} title={`Mercado Pago ${pesos(a.comision)}`} />
          </div>
          <div className="mt-2 flex justify-between text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-gray-300"><span className="h-2 w-2 rounded-sm bg-emerald-400/80" />Te queda {Math.round(pctNeto)} %</span>
            <span className="inline-flex items-center gap-1.5 text-gray-400"><span className="h-2 w-2 rounded-sm bg-gray-600" />Mercado Pago {pesos(a.comision)} · {Math.round(100 - pctNeto)} %</span>
          </div>
        </div>
      ) : <p className="mt-5 text-xs text-gray-500">Todavía no hay cobros en este período.</p>}
      {d.internas > 0 && <p className="mt-3 text-[11px] text-gray-500">Incluye {d.internas} compra{d.internas > 1 ? "s" : ""} hecha{d.internas > 1 ? "s" : ""} desde un dispositivo de casa (plata real, marcada como “Interna”).</p>}
    </div>
  );
}

function Tile({ titulo, valor, nota, delta, deltaFmt, icono }: { titulo: string; valor: string; nota?: string; delta?: number | null; deltaFmt?: (v: number) => string; icono?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-4 py-4">
      <p className="flex items-center gap-1.5 text-xs text-gray-500">{icono}{titulo}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{valor}</p>
      <p className="mt-1 text-[11px] text-gray-500">
        {delta != null && delta !== 0 && deltaFmt && <span className={`mr-1.5 ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}>{delta > 0 ? "↑" : "↓"} {deltaFmt(Math.abs(delta))}</span>}
        {nota}
      </p>
    </div>
  );
}

function Mes({ m }: { m: Datos["mes"] }) {
  const avance = (m.dia / m.dias) * 100;
  return (
    <div className="sm:col-span-3 rounded-2xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-gray-500"><span className="capitalize text-gray-300">{m.nombre}</span> en curso · día {m.dia} de {m.dias}</p>
        <p className="text-xs text-gray-400">
          <span className="text-white font-semibold tabular-nums">{pesos(m.cobrado)}</span> cobrados en {m.ventas} venta{m.ventas === 1 ? "" : "s"}
          {m.proyeccion != null && m.dia < m.dias && <> · a este ritmo cerrás en <span className="text-amber-300 tabular-nums">{pesos(m.proyeccion)}</span></>}
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
        <div className="h-full rounded-full bg-amber-500/60" style={{ width: `${avance}%` }} />
      </div>
    </div>
  );
}

// ── Gráfico: cobrado acumulado contra el período anterior ────────────────────

function Grafico({ d }: { d: Datos }) {
  const [hover, setHover] = useState<number | null>(null);
  // Ancho real del contenedor: el SVG se dibuja a escala 1:1 (sin estirar textos).
  const sinGrafico = d.dias <= 1;
  const caja = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(1000);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [sinGrafico]);
  const datos = useMemo(() => {
    let acc = 0, accA = 0;
    return d.serie.map((p, i) => {
      acc += p.cobrado;
      const ant = d.serie_anterior?.[i];
      if (ant) accA += ant.cobrado;
      return { ...p, acumulado: acc, acumuladoAnterior: d.serie_anterior ? accA : null };
    });
  }, [d]);

  if (sinGrafico) {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-4 text-sm text-gray-400">
        Hoy: {d.actual.ventas ? `${d.actual.ventas} venta${d.actual.ventas > 1 ? "s" : ""} por ${pesos(d.actual.cobrado)}` : "todavía no hubo ventas"}.
        {d.anterior && <span className="text-gray-500"> Ayer: {d.anterior.ventas} venta{d.anterior.ventas === 1 ? "" : "s"}.</span>}
      </div>
    );
  }

  const H = 220, PL = 48, PR = 16, PT = 14, PB = 28;
  const max = Math.max(1, ...datos.map((p) => Math.max(p.acumulado, p.acumuladoAnterior ?? 0)));
  const tope = Math.ceil(max / 500) * 500 || 500;
  const x = (i: number) => PL + (datos.length === 1 ? 0 : (i / (datos.length - 1)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - v / tope) * (H - PT - PB);
  const linea = (k: "acumulado" | "acumuladoAnterior") => datos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k] ?? 0).toFixed(1)}`).join(" ");
  const area = `${linea("acumulado")} L${x(datos.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const cada = Math.max(1, Math.ceil(datos.length / 8));
  const h = hover != null ? datos[hover] : null;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-200">Cobrado acumulado</p>
        <div className="flex items-center gap-4 text-[11px] text-gray-400">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-amber-400" />Este período</span>
          {d.serie_anterior && <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-gray-500" />Período anterior</span>}
        </div>
      </div>
      <div className="relative" ref={caja}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full" onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="ingresos-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(251 191 36)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="rgb(251 191 36)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={PL} x2={W - PR} y1={y(tope * f)} y2={y(tope * f)} stroke="rgb(55 65 81)" strokeWidth="1" strokeDasharray={f ? "3 4" : undefined} />
              <text x={PL - 8} y={y(tope * f) + 4} textAnchor="end" className="fill-gray-500" fontSize="11">{Math.round(tope * f).toLocaleString("es-UY")}</text>
            </g>
          ))}
          {d.serie_anterior && <path d={linea("acumuladoAnterior")} fill="none" stroke="rgb(107 114 128)" strokeWidth="2" strokeDasharray="5 5" />}
          <path d={area} fill="url(#ingresos-area)" />
          <path d={linea("acumulado")} fill="none" stroke="rgb(251 191 36)" strokeWidth="2" strokeLinejoin="round" />
          {h && hover != null && <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="rgb(156 163 175)" strokeWidth="1" />}
          {datos.map((p, i) => (i % cada === 0 || i === datos.length - 1) && (
            <text key={p.fecha} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === datos.length - 1 ? "end" : "middle"} className="fill-gray-500" fontSize="11">{ddmm(p.fecha)}</text>
          ))}
          {/* Días con venta: punto de 8px con anillo del color de fondo */}
          {datos.map((p, i) => p.ventas > 0 && (
            <circle key={`v-${p.fecha}`} cx={x(i)} cy={y(p.acumulado)} r={hover === i ? 6 : 4.5} fill="rgb(251 191 36)" stroke="rgb(17 24 39)" strokeWidth="2" />
          ))}
          {datos.map((_, i) => (
            <rect key={i} x={x(i) - (W - PL - PR) / datos.length / 2} y={PT} width={(W - PL - PR) / datos.length} height={H - PT - PB} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {h && hover != null && (
          <div className="pointer-events-none absolute top-1 z-10 rounded-lg border border-gray-700 bg-gray-950/95 px-3 py-2 text-[11px] shadow-xl"
            style={{ left: Math.min(Math.max(x(hover) - 85, 0), W - 180) }}>
            <p className="text-gray-300 font-medium">{new Date(`${h.fecha}T12:00:00-03:00`).toLocaleDateString("es-UY", { weekday: "short", day: "numeric", month: "short" })}</p>
            <p className="text-gray-400 mt-0.5">Ese día: <span className="text-gray-100 tabular-nums">{h.ventas ? `${pesos(h.cobrado)} · ${h.ventas} venta${h.ventas > 1 ? "s" : ""}` : "sin ventas"}</span></p>
            <p className="text-gray-400">Acumulado: <span className="text-amber-300 tabular-nums">{pesos(h.acumulado)}</span></p>
            {h.acumuladoAnterior != null && <p className="text-gray-500">Período anterior: <span className="tabular-nums">{pesos(h.acumuladoAnterior)}</span></p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Desgloses ───────────────────────────────────────────────────────────────

function Desglose({ titulo, grupos, etiqueta, total }: { titulo: string; grupos: Grupo[]; etiqueta: (k: string) => string; total: number }) {
  const max = Math.max(1, ...grupos.map((g) => g.cobrado));
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-4">
      <p className="text-sm font-medium text-gray-200 mb-3">{titulo}</p>
      {grupos.length === 0 && <p className="text-xs text-gray-600">Sin ventas en el período.</p>}
      <div className="space-y-3">
        {grupos.map((g) => (
          <div key={g.clave} title={`${g.ventas} venta${g.ventas === 1 ? "" : "s"}`}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-gray-300 truncate">{etiqueta(g.clave)}</span>
              <span className="tabular-nums text-gray-200 shrink-0">{pesos(g.cobrado)} <span className="text-gray-500">· {total > 0 ? Math.round((g.cobrado / total) * 100) : 0} %</span></span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-800">
              <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${(g.cobrado / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pagos ───────────────────────────────────────────────────────────────────

function Pagos({ pagos }: { pagos: Pago[] }) {
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <p className="text-sm font-medium text-gray-200">Quién pagó</p>
        <Link href={"/admin/tarot/pagos" as Route} className="inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200">Detalle técnico en Pagos <ArrowRight size={11} /></Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 font-medium">Cuándo</th>
              <th className="px-4 py-2.5 font-medium text-right">Cobrado</th>
              <th className="px-4 py-2.5 font-medium text-right">Mercado Pago</th>
              <th className="px-4 py-2.5 font-medium text-right">Te queda</th>
              <th className="px-4 py-2.5 font-medium">Medio</th>
              <th className="px-4 py-2.5 font-medium">Plata</th>
              <th className="px-4 py-2.5 font-medium">Lectura</th>
            </tr>
          </thead>
          <tbody>
            {pagos.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-500">Sin cobros en este período.</td></tr>}
            {pagos.map((p) => {
              const ini = (p.cliente ?? "?").trim().charAt(0).toUpperCase();
              const entregada = p.estado_orden === "entregado" || p.estado_orden === "entregado_simulado";
              const error = p.estado_orden?.startsWith("error");
              return (
                <tr key={p.id} className="border-t border-gray-800/60 hover:bg-gray-800/30">
                  <td className="px-5 py-3" title={`Orden ${p.orden_id}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold">{ini}</span>
                      <div className="min-w-0">
                        <Link href={`/admin/tarot/ordenes?orden_id=${p.orden_id}` as Route} className="text-sm text-gray-100 hover:text-amber-200">{p.cliente ?? "Sin nombre"}</Link>
                        {p.interna && <span className="ml-1.5 align-middle rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-gray-800 text-gray-400" title="Compra hecha desde un dispositivo de casa (igual es plata real)">Interna</span>}
                        <p className="text-[11px] text-gray-500">{p.tema ? (TEMAS[p.tema] ?? p.tema) : "—"} · {p.origen}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fechaHora(p.created_at)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-200">{pesos(p.monto)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">− {pesos(p.comision)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-300 font-medium">{pesos(p.neto)}</td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {MEDIOS[p.medio] ?? p.medio}
                    <span className="block text-[11px] text-gray-600">{[p.marca ? MARCAS[p.marca] ?? p.marca : null, p.cuotas > 1 ? `${p.cuotas} cuotas` : null].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.liberada
                      ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300/90"><Wallet size={11} /> Disponible</span>
                      : <span className="inline-flex items-center gap-1 text-[11px] text-amber-300/90"><Clock size={11} /> {p.liberacion_at ? `Se libera el ${fechaCorta(p.liberacion_at)}` : "Por liberar"}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${entregada ? "bg-emerald-500/10 text-emerald-300" : error ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300"}`}>
                      {entregada ? "Entregada" : error ? "Con error" : "En curso"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
