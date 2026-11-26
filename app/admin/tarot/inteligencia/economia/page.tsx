"use client";
import { useEffect, useMemo, useState } from "react";
import { Calculator, ChevronDown, Info, Pencil, RotateCcw, Save, Scale, SlidersHorizontal, Target, TrendingUp } from "lucide-react";
import {
  Pagina, Seccion, Panel, Insignia, Aviso, EsqueletoPagina, ErrorCarga, Boton, Enlace, Ayuda, Dato,
  useVista, useNotificacion, enviarIC, pesos, pesosConSigno, entero, decimal, type Tono,
} from "@/components/admin/inteligencia/ui";
import { useAncho, COLOR } from "@/components/admin/inteligencia/graficos";
import { modelo, resultadoConVolumen, cacParaVolumen, DIAS_MES } from "@/lib/inteligencia/economia";
import type { DatosCentro } from "@/lib/inteligencia/centro";

// Inteligencia comercial · Objetivos y economía (fase 1; Level Up 2026-11-25).
// Única fuente de los objetivos (ganancia mensual deseada y CAC objetivo, en
// ic_negocios). Los costos no se cargan acá: se leen de lo real (cobros de
// Mercado Pago, IA, audio, WhatsApp) y de Presupuesto (costos fijos), así no
// hay dos lugares con el mismo dato. Escenarios y simulador son cálculo, no
// pronóstico, y no guardan nada.

interface Datos {
  negocio: { id: string; nombre: string; moneda: string; precio: number | null; ganancia_mensual_objetivo: number | null; cac_objetivo: number | null; updated_at: string };
  referencia: { dias: number; ventas: number; precio_promedio: number | null; por_venta: { comision: number; ia: number; audio: number; whatsapp: number; neto_cobrado: number } | null; costo_variable: number | null; margen_contribucion: number | null };
  fijos_mensuales: number;
  costos_fijos: { nombre: string; monto: string | number; moneda: string; frecuencia: string | null }[];
  tipo_cambio: { valor: number; estimado: boolean };
}

const aNumero = (s: string) => { const n = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const aTexto = (v: number | null | undefined) => (v == null ? "" : String(Math.round(v)));

// ── 1. Cifras protagonistas (los objetivos se editan acá mismo) ─────────────
function Cifra({ etiqueta, tipo, children, sub, ayuda }: { etiqueta: string; tipo: "config" | "calc"; children: React.ReactNode; sub: React.ReactNode; ayuda?: string }) {
  return (
    <div className={`min-w-0 rounded-xl border p-4 md:p-5 ${tipo === "config" ? "border-amber-300/20 bg-amber-300/[0.03]" : "border-white/[0.07] bg-white/[0.02]"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-gray-300">{etiqueta}{ayuda && <Ayuda texto={ayuda} />}</p>
        <Insignia tono={tipo === "config" ? "marca" : "neutro"} icono={tipo === "config" ? Pencil : Calculator}>{tipo === "config" ? "Configurable" : "Calculado"}</Insignia>
      </div>
      <div className="mt-2.5">{children}</div>
      <div className="mt-2 text-[12.5px] leading-snug text-gray-400">{sub}</div>
    </div>
  );
}
const valorGrande = "text-[30px] font-semibold leading-none tracking-[-0.025em] tabular-nums text-gray-50 md:text-[32px]";

function EntradaGrande({ valor, onChange, etiqueta }: { valor: string; onChange: (v: string) => void; etiqueta: string }) {
  return (
    <label className="flex items-baseline gap-1.5 rounded-lg ring-1 ring-inset ring-transparent focus-within:ring-sky-400/60 hover:ring-white/10">
      <span className={`${valorGrande} text-gray-400`}>$</span>
      <input aria-label={etiqueta} inputMode="numeric" value={valor === "" ? "" : Number(valor).toLocaleString("es-UY")} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))} placeholder="sin definir"
        className={`${valorGrande} w-full min-w-0 bg-transparent placeholder:text-[18px] placeholder:font-normal placeholder:text-gray-500 focus:outline-none`} />
    </label>
  );
}

// ── 2. Economía unitaria (cascada) ──────────────────────────────────────────
function Cascada({ d, cacObjetivo }: { d: Datos; cacObjetivo: number | null }) {
  const r = d.referencia, pv = r.por_venta;
  const [detalle, setDetalle] = useState(false);
  if (!pv || r.precio_promedio == null || r.margen_contribucion == null || r.costo_variable == null) return <Aviso tono="alerta" titulo="Sin ventas en los últimos 90 días">No hay datos reales para calcular la economía por venta.</Aviso>;
  const precio = r.precio_promedio, margen = r.margen_contribucion, cac = cacObjetivo ?? 0, despues = margen - cac;
  const escala = Math.max(precio, 1);
  const x = (v: number) => `${(Math.max(v, 0) / escala) * 100}%`;
  const filas: { t: string; v: number; desde: number; hasta: number; tipo: "total" | "resta" | "resultado"; tono: string; ayuda?: string }[] = [
    { t: "Precio promedio cobrado", v: precio, desde: 0, hasta: precio, tipo: "total", tono: "bg-gray-300/70", ayuda: d.negocio.precio != null ? `Precio de lista ${pesos(d.negocio.precio)}; el promedio cobrado es menor por cupones y segundas lecturas.` : undefined },
    { t: "Costos variables", v: -r.costo_variable, desde: margen, hasta: precio, tipo: "resta", tono: "bg-rose-400/70" },
    { t: "Margen antes de publicidad", v: margen, desde: 0, hasta: margen, tipo: "resultado", tono: "bg-sky-400/80", ayuda: "También es el CAC de equilibrio por primera compra: pagar más por cliente hace perder plata en su primera compra." },
    ...(cacObjetivo != null ? [
      { t: "CAC objetivo", v: -cac, desde: Math.max(despues, 0), hasta: margen, tipo: "resta" as const, tono: "bg-amber-400/70" },
      { t: "Margen después de publicidad", v: despues, desde: 0, hasta: Math.max(despues, 0), tipo: "resultado" as const, tono: despues > 0 ? "bg-emerald-400/80" : "bg-rose-400/80", ayuda: "Lo que deja cada venta de un cliente nuevo, para cubrir costos fijos y ganancia." },
    ] : []),
  ];
  return (
    <Panel titulo="Economía por venta" subtitulo={`Promedio real de los últimos ${r.dias} días (${r.ventas} ${r.ventas === 1 ? "venta cobrada" : "ventas cobradas"}).`}
      accion={r.ventas < 10 ? <Insignia tono="alerta">Con {r.ventas} ventas el promedio puede moverse</Insignia> : undefined}>
      <div className="space-y-3">
        {filas.map((f) => (
          <div key={f.t} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 md:grid-cols-[230px_minmax(0,1fr)_96px]">
            <p className={`col-start-1 row-start-1 flex items-center gap-1 text-[13.5px] ${f.tipo === "resultado" ? "font-semibold text-gray-50" : "text-gray-300"}`}>{f.tipo === "resta" ? "− " : f.tipo === "resultado" ? "= " : ""}{f.t}{f.ayuda && <Ayuda texto={f.ayuda} lado="izq" />}</p>
            <div className="relative col-span-2 row-start-2 h-6 rounded bg-white/[0.03] md:col-span-1 md:col-start-2 md:row-start-1" aria-hidden="true">
              <div className={`absolute inset-y-1 rounded-sm ${f.tono}`} style={{ left: x(f.desde), width: `calc(${x(f.hasta)} - ${x(f.desde)})` }} />
            </div>
            <p className={`col-start-2 row-start-1 whitespace-nowrap text-right tabular-nums md:col-start-3 ${f.tipo === "resultado" ? `text-[15px] font-semibold ${f.v < 0 ? "text-rose-300" : "text-gray-50"}` : "text-[14px] text-gray-200"}`}>{f.tipo === "resta" ? pesosConSigno(f.v) : pesos(f.v)}</p>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setDetalle(!detalle)} aria-expanded={detalle} className="mt-4 inline-flex min-h-[34px] items-center gap-1 rounded text-[13px] font-medium text-sky-300 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70">Detalle de los costos variables <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${detalle ? "rotate-180" : ""}`} /></button>
      {detalle && (
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato etiqueta="Comisión de Mercado Pago" valor={pesos(pv.comision)} />
          <Dato etiqueta="Lectura con IA" valor={pesos(pv.ia)} />
          <Dato etiqueta="Audio" valor={pesos(pv.audio)} />
          <Dato etiqueta="WhatsApp" valor={pesos(pv.whatsapp)} />
        </dl>
      )}
      {cacObjetivo == null && <p className="mt-3 text-[13px] text-amber-200">Definí el CAC objetivo para ver el margen después de publicidad.</p>}
    </Panel>
  );
}

function CostosFijos({ d }: { d: Datos }) {
  return (
    <Panel titulo="Costos fijos por mes" subtitulo={<>Vigentes hoy. Se editan en <Enlace href="/admin/tarot/presupuesto">Presupuesto</Enlace>. Dólar a {d.tipo_cambio.valor}{d.tipo_cambio.estimado ? " (estimado)" : ""}. En el Centro de control cada período carga solo los días en que cada costo estuvo vigente.</>}>
      <ul className="divide-y divide-white/[0.05]">
        {d.costos_fijos.length === 0 && <li className="py-2 text-[13.5px] text-gray-400">No hay costos fijos cargados.</li>}
        {d.costos_fijos.map((c) => {
          const mensual = (Number(c.monto) || 0) * (c.moneda === "USD" ? d.tipo_cambio.valor : 1) / (c.frecuencia === "anual" ? 12 : 1);
          return (
            <li key={c.nombre} className="flex items-baseline justify-between gap-3 py-2 text-[13.5px]">
              <span className="min-w-0 text-gray-300">{c.nombre}{c.moneda === "USD" && <span className="text-gray-500"> · US$ {Number(c.monto)}{c.frecuencia === "anual" ? "/año" : ""}</span>}</span>
              <span className="shrink-0 tabular-nums text-gray-100">{pesos(mensual)}</span>
            </li>
          );
        })}
        <li className="flex items-baseline justify-between gap-3 pt-2.5 text-[14px] font-semibold text-gray-50"><span>Total por mes</span><span className="tabular-nums">{pesos(d.fijos_mensuales)}</span></li>
      </ul>
    </Panel>
  );
}

// ── 3. Conceptos (precisión) ────────────────────────────────────────────────
function Conceptos({ d, centro, cacObjetivo }: { d: Datos; centro: DatosCentro | null; cacObjetivo: number | null }) {
  const m = d.referencia.margen_contribucion;
  const eqNegocio = m != null && cacObjetivo != null && m - cacObjetivo > 0 ? Math.ceil(d.fijos_mensuales / (m - cacObjetivo)) : null;
  const a = centro?.actual;
  const pagos = centro?.canales.filter((c) => c.pago) ?? [];
  const nuevosPagos = pagos.reduce((t, c) => t + c.clientes_nuevos, 0), invPagos = pagos.reduce((t, c) => t + c.inversion, 0);
  const filas: { t: string; def: string; v: string; tipo: "objetivo" | "referencia" | "medido" }[] = [
    { t: "CAC de equilibrio por primera compra", def: "Margen de contribución por venta. Pagar más por un cliente nuevo pierde plata en su primera compra (sin contar costos fijos).", v: pesos(m), tipo: "referencia" },
    { t: "CAC objetivo", def: "Lo que decidís pagar como máximo por cliente nuevo para llegar a la ganancia deseada.", v: cacObjetivo != null ? pesos(cacObjetivo) : "Sin definir", tipo: "objetivo" },
    { t: "Equilibrio del negocio", def: "Ventas por mes que cubren los costos fijos, con el CAC objetivo y sin ganancia.", v: eqNegocio != null ? `${eqNegocio} ventas/mes` : "—", tipo: "referencia" },
    { t: "CAC combinado", def: "Inversión publicitaria ÷ todos los clientes nuevos, vengan del canal que vengan.", v: a?.cac_publicitario != null ? pesos(a.cac_publicitario) : centro ? "—" : "…", tipo: "medido" },
    { t: "CAC de canales pagos", def: "Inversión ÷ clientes nuevos atribuidos a canales pagos. Es más alto que el combinado si hay clientes orgánicos.", v: invPagos > 0 && nuevosPagos > 0 ? pesos(invPagos / nuevosPagos) : centro ? "—" : "…", tipo: "medido" },
    { t: "CAC por canal", def: "Inversión de un canal ÷ sus clientes nuevos. Está en la tabla de canales del Centro de control.", v: pagos.filter((c) => c.cac != null).map((c) => `${c.nombre} ${pesos(c.cac)}`).join(" · ") || (centro ? "—" : "…"), tipo: "medido" },
    { t: "Costo publicitario por venta", def: "Inversión ÷ todas las ventas (también las de clientes que ya habían comprado).", v: a && a.ventas > 0 ? pesos(a.inversion / a.ventas) : centro ? "—" : "…", tipo: "medido" },
    { t: "Costo total por cliente nuevo", def: "(Inversión + costos fijos y puntuales + cortesías) ÷ clientes nuevos. No es un CAC: suma costos que no son de adquisición.", v: a?.cac_total != null ? pesos(a.cac_total) : centro ? "—" : "…", tipo: "medido" },
  ];
  const tono: Record<string, Tono> = { objetivo: "marca", referencia: "neutro", medido: "info" };
  const nombre: Record<string, string> = { objetivo: "Tu objetivo", referencia: "Referencia", medido: "Medido · 30 días" };
  return (
    <Panel titulo="Qué es cada costo por cliente" subtitulo="Las mismas definiciones en toda la consola. Los valores medidos son de los últimos 30 días (último contacto).">
      <dl className="divide-y divide-white/[0.05]">
        {filas.map((f) => (
          <div key={f.t} className="grid gap-x-6 gap-y-1 py-3 md:grid-cols-[260px_minmax(0,1fr)_auto] md:items-baseline">
            <dt className="text-[14px] font-medium text-gray-100">{f.t}</dt>
            <dd className="text-[13px] leading-relaxed text-gray-400">{f.def}</dd>
            <dd className="flex items-center gap-2 md:justify-end"><span className="text-[14.5px] font-semibold tabular-nums text-gray-50">{f.v}</span><Insignia tono={tono[f.tipo]}>{nombre[f.tipo]}</Insignia></dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

// ── 4. Escenarios ───────────────────────────────────────────────────────────
function Escenarios({ d, cacObjetivo, ganancia, ritmo }: { d: Datos; cacObjetivo: number | null; ganancia: number | null; ritmo: number | null }) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = d.referencia.margen_contribucion, precio = d.referencia.precio_promedio;
  if (m == null || precio == null || cacObjetivo == null || ganancia == null) return <Aviso tono="alerta" titulo="Faltan datos para los escenarios">Hacen falta ventas reales en los últimos 90 días, el CAC objetivo y la ganancia deseada.</Aviso>;
  const base = { precio, costo_variable: precio - m, cac: cacObjetivo, fijos_mensuales: d.fijos_mensuales, ganancia_deseada: ganancia };
  const vols = [10, 20, 30, 45, 60, 90, 120];
  const necesarias = modelo(base).ventas_necesarias_mes;
  const filas = vols.map((n) => ({ n, resultado: resultadoConVolumen(base, n), inversion: n * cacObjetivo, facturacion: n * precio, cacMax: cacParaVolumen(m, d.fijos_mensuales, ganancia, n) }));
  const estado = (r: number): { t: string; corto: string; tono: Tono } => (r >= ganancia ? { t: "Alcanza la meta", corto: "Alcanza", tono: "positivo" } : r >= 0 ? { t: "Gana, sin llegar a la meta", corto: "Bajo la meta", tono: "alerta" } : { t: "Pierde plata", corto: "Pierde", tono: "negativo" });
  const W = Math.max(ancho, 280), movil = W < 560, H = movil ? 230 : 240, L = movil ? 44 : 64, R = 12, T = 22, B = 44;
  const minY = Math.min(...filas.map((f) => f.resultado), 0), maxY = Math.max(...filas.map((f) => f.resultado), ganancia) * 1.1;
  const y = (v: number) => T + (1 - (v - minY) / (maxY - minY)) * (H - T - B);
  const paso = (W - L - R) / filas.length, bw = Math.min(paso * 0.55, 46);
  const xc = (i: number) => L + paso * (i + 0.5);
  const kilo = (v: number) => `${v < 0 ? "−" : ""}$ ${Math.abs(v) >= 1000 ? `${Math.round(Math.abs(v) / 1000)} mil` : Math.round(Math.abs(v))}`;
  return (
    <Panel titulo={`Qué hace falta para ganar ${pesos(ganancia)} por mes`} subtitulo={`Resultado mensual según cuántas ventas se hagan, pagando el CAC objetivo (${pesos(cacObjetivo)}) por cada una y con ${pesos(d.fijos_mensuales)} de costos fijos. Es cálculo, no pronóstico.`}>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Dato etiqueta="Ventas para llegar a la meta" valor={necesarias != null ? `${necesarias} por mes` : "No alcanza"} sub={necesarias != null ? `${decimal(necesarias / DIAS_MES)} por día` : "El CAC objetivo no deja margen"} tono={necesarias != null ? "neutro" : "negativo"} />
        <Dato etiqueta="Inversión publicitaria necesaria" valor={necesarias != null ? pesos(necesarias * cacObjetivo) : "—"} sub="Al CAC objetivo, todas desde publicidad" />
        <Dato etiqueta="Ritmo actual" valor={ritmo != null ? `${ritmo} ventas` : "…"} sub="Últimos 30 días, para comparar" />
      </div>
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        {ancho > 0 && (
          <svg width={W} height={H} role="img" aria-label="Resultado mensual por volumen de ventas" className="block">
            <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={COLOR.eje} />
            {movil && <text x={W - R} y={H - 10} textAnchor="end" fontSize="11.5" fill={COLOR.texto} dy="-14">ventas por mes</text>}
            <text x={L - 10} y={y(0)} textAnchor="end" dominantBaseline="central" fontSize="12" fill={COLOR.texto}>$ 0</text>
            <line x1={L} x2={W - R} y1={y(ganancia)} y2={y(ganancia)} stroke={COLOR.objetivo} strokeDasharray="4 4" opacity="0.8" />
            <text x={L - 10} y={y(ganancia)} textAnchor="end" dominantBaseline="central" fontSize="12" fill="#6ee7b7">Meta</text>
            {filas.map((f, i) => {
              const e = estado(f.resultado);
              const top = Math.min(y(f.resultado), y(0)), alto = Math.abs(y(f.resultado) - y(0));
              return (
                <g key={f.n}>
                  <rect x={xc(i) - bw / 2} y={top} width={bw} height={Math.max(alto, 1)} rx="3" fill={e.tono === "positivo" ? COLOR.objetivo : e.tono === "negativo" ? COLOR.perdida : COLOR.barra} opacity={hover === i ? 1 : 0.8} />
                  <text x={xc(i)} y={f.resultado >= 0 ? top - 6 : top + alto + 14} textAnchor="middle" fontSize="11.5" fill={COLOR.textoFuerte} className="tabular-nums">{kilo(f.resultado)}</text>
                  <text x={xc(i)} y={H - 10} textAnchor="middle" fontSize="12" fill={COLOR.texto} className="tabular-nums">{movil ? f.n : `${f.n} ventas`}</text>
                  <rect x={xc(i) - paso / 2} y={0} width={paso} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
                </g>
              );
            })}
            {ritmo != null && ritmo <= vols[vols.length - 1] && (() => {
              const i = vols.findIndex((v) => v >= ritmo); const xr = i <= 0 ? L + paso * 0.5 * (ritmo / vols[0]) : xc(i - 1) + (xc(i) - xc(i - 1)) * ((ritmo - vols[i - 1]) / (vols[i] - vols[i - 1]));
              return <g><line x1={xr} x2={xr} y1={T} y2={H - B} stroke={COLOR.observado} strokeDasharray="2 3" /><text x={xr + 4} y={T + 4} fontSize="11.5" fill={COLOR.observado}>Ritmo actual</text></g>;
            })()}
          </svg>
        )}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[13.5px] lg:min-w-[640px]">
          <thead><tr className="border-b border-white/[0.07] text-left text-[12.5px] text-gray-400">
            <th scope="col" className="py-2 pr-3 font-medium"><span className="lg:hidden">Ventas</span><span className="hidden lg:inline">Ventas por mes</span></th><th scope="col" className="hidden px-3 py-2 text-right font-medium lg:table-cell">Por día</th><th scope="col" className="hidden px-3 py-2 text-right font-medium lg:table-cell">Inversión</th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium lg:table-cell">Facturación</th><th scope="col" className="px-3 py-2 text-right font-medium">Resultado</th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium lg:table-cell"><span className="inline-flex items-center gap-1">CAC máximo para la meta<Ayuda texto="Lo más que se puede pagar por cliente con ese volumen y llegar igual a la ganancia deseada." lado="der" /></span></th>
            <th scope="col" className="py-2 pl-3 text-right font-medium lg:text-left">Escenario</th>
          </tr></thead>
          <tbody>{filas.map((f, i) => { const e = estado(f.resultado); return (
            <tr key={f.n} className={`border-b border-white/[0.04] ${hover === i ? "bg-white/[0.03]" : ""}`}>
              <th scope="row" className="py-2.5 pr-3 text-left font-medium tabular-nums text-gray-100">{f.n}</th>
              <td className="hidden whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-300 lg:table-cell">{decimal(f.n / DIAS_MES)}</td>
              <td className="hidden whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-300 lg:table-cell">{pesos(f.inversion)}</td>
              <td className="hidden whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-300 lg:table-cell">{pesos(f.facturacion)}</td>
              <td className={`whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums ${f.resultado < 0 ? "text-rose-300" : "text-gray-50"}`}>{pesos(f.resultado)}</td>
              <td className="hidden whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-300 lg:table-cell">{f.cacMax != null ? pesos(f.cacMax) : <span className="text-rose-300">No alcanza</span>}</td>
              <td className="py-2.5 pl-3 text-right lg:text-left"><Insignia tono={e.tono}><span className="lg:hidden">{e.corto}</span><span className="hidden lg:inline">{e.t}</span></Insignia></td>
            </tr>); })}</tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── 5. Simulador ────────────────────────────────────────────────────────────
type Campos = { precio: string; variable: string; cac: string; fijos: string; ganancia: string; pct: string; ventas: string };
function Simulador({ d, ritmo, usarCac }: { d: Datos; ritmo: number | null; usarCac: (v: number) => void }) {
  const r = d.referencia;
  const reales: Campos = useMemo(() => ({
    precio: aTexto(r.precio_promedio ?? d.negocio.precio), variable: aTexto(r.costo_variable), cac: aTexto(d.negocio.cac_objetivo ?? r.margen_contribucion),
    fijos: aTexto(d.fijos_mensuales), ganancia: aTexto(d.negocio.ganancia_mensual_objetivo), pct: "100", ventas: ritmo != null ? String(ritmo) : "30",
  }), [r, d, ritmo]);
  const [f, setF] = useState<Campos>(reales);
  useEffect(() => { setF((x) => (x.ventas === "30" && ritmo != null ? { ...x, ventas: String(ritmo) } : x)); }, [ritmo]);
  const n = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, aNumero(v)])) as Record<keyof Campos, number>;
  const valido = Object.values(n).every((v) => Number.isFinite(v) && v >= 0) && n.pct <= 100;
  const entrada = { precio: n.precio, costo_variable: n.variable, cac: n.cac, fijos_mensuales: n.fijos, ganancia_deseada: n.ganancia, pct_publicidad: n.pct / 100 };
  const res = valido ? modelo(entrada) : null;
  const resultado = valido ? resultadoConVolumen(entrada, n.ventas) : null;
  const cambiado = (Object.keys(f) as (keyof Campos)[]).some((k) => f[k] !== reales[k]);
  const viable: { t: string; tono: Tono; detalle: string } | null = !res || resultado == null ? null
    : res.ventas_necesarias_mes == null ? { t: "No viable", tono: "negativo", detalle: "Con ese costo de adquisición cada venta no deja nada para cubrir los costos fijos: ningún volumen llega a la meta." }
      : resultado >= n.ganancia ? { t: "Alcanza la meta", tono: "positivo", detalle: `Con ${n.ventas} ventas por mes el resultado supera la ganancia deseada.` }
        : resultado >= 0 ? { t: "Gana, sin llegar a la meta", tono: "alerta", detalle: `Faltan ${pesos(n.ganancia - resultado)} por mes: hacen falta ${res.ventas_necesarias_mes} ventas.` }
          : { t: "Pierde plata", tono: "negativo", detalle: `Con ${n.ventas} ventas por mes no se cubren los costos fijos. Hacen falta ${res.ventas_necesarias_mes} para la meta.` };
  const campos: { k: keyof Campos; t: string; a: string; prefijo?: string; sufijo?: string; max?: number }[] = [
    { k: "precio", t: "Precio de venta", a: `Promedio real cobrado${d.negocio.precio != null ? ` (lista ${pesos(d.negocio.precio)})` : ""}`, prefijo: "$", max: 2000 },
    { k: "variable", t: "Costos variables por venta", a: "Real: Mercado Pago, IA, audio, WhatsApp", prefijo: "$", max: 400 },
    { k: "cac", t: "CAC de canales pagos", a: "Lo que se paga en publicidad por cliente", prefijo: "$", max: 1500 },
    { k: "pct", t: "Ventas que vienen de publicidad", a: "El resto (orgánicas, directas, recompras) no paga CAC", sufijo: "%", max: 100 },
    { k: "fijos", t: "Costos fijos mensuales", a: "Presupuesto", prefijo: "$", max: 30000 },
    { k: "ganancia", t: "Ganancia mensual deseada", a: "Tu objetivo", prefijo: "$", max: 100000 },
    { k: "ventas", t: "Ventas por mes del escenario", a: ritmo != null ? `Ritmo actual: ${ritmo} en 30 días` : "Para calcular el resultado", max: 300 },
  ];
  return (
    <Panel subtitulo="Arranca con tus números reales. Movelos para ver qué pasa: es una simulación y no cambia la configuración."
      accion={cambiado && <Boton tamano="sm" variante="fantasma" icono={RotateCcw} onClick={() => setF(reales)}>Volver a los valores reales</Boton>}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          {campos.map((c) => {
            const v = aNumero(f[c.k]);
            return (
              <div key={c.k} className="min-w-0">
                <label htmlFor={`sim-${c.k}`} className="flex items-baseline justify-between gap-2 text-[13px] font-medium text-gray-200">{c.t}{f[c.k] !== reales[c.k] && <span className="text-[11.5px] font-normal text-amber-200">modificado</span>}</label>
                <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 ring-1 ring-inset ring-white/[0.1] focus-within:ring-2 focus-within:ring-sky-400/60">
                  {c.prefijo && <span className="text-[14px] text-gray-500">{c.prefijo}</span>}
                  <input id={`sim-${c.k}`} inputMode="decimal" value={f[c.k]} onChange={(e) => setF({ ...f, [c.k]: e.target.value.replace(/[^\d.,]/g, "") })} className="min-h-[40px] w-full min-w-0 bg-transparent text-[15px] tabular-nums text-gray-50 focus:outline-none" />
                  {c.sufijo && <span className="text-[14px] text-gray-500">{c.sufijo}</span>}
                </div>
                {c.max && <input type="range" aria-label={`${c.t} (control deslizante)`} min={0} max={Math.max(c.max, Number.isFinite(v) ? v : 0)} step={c.k === "pct" ? 5 : c.max > 5000 ? 100 : c.max > 500 ? 10 : 1} value={Number.isFinite(v) ? v : 0} onChange={(e) => setF({ ...f, [c.k]: e.target.value })} className="mt-2 h-1.5 w-full cursor-pointer accent-sky-400" />}
                <p className="mt-1 text-[12px] leading-snug text-gray-400">{c.a}</p>
              </div>
            );
          })}
        </div>
        <div className="space-y-4 rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.07] md:p-5">
          {!res ? <p className="text-[13.5px] text-rose-300">Completá todos los valores con números (el porcentaje, de 0 a 100).</p> : (
            <>
              {viable && (
                <div>
                  <Insignia tono={viable.tono}>{viable.t}</Insignia>
                  <p className="mt-2 text-[14px] leading-relaxed text-gray-200">{viable.detalle}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4">
                <Dato etiqueta="Margen por venta" valor={pesos(res.margen_antes_publicidad)} sub="Antes de publicidad" />
                <Dato etiqueta="Contribución por venta" valor={pesos(res.contribucion_por_venta)} tono={res.contribucion_por_venta > 0 ? "neutro" : "negativo"} sub={n.pct < 100 ? `Con ${pesos(n.cac * n.pct / 100)} de adquisición promedio` : "Después del CAC"} />
                <Dato etiqueta="Ventas necesarias" valor={res.ventas_necesarias_mes != null ? `${res.ventas_necesarias_mes} por mes` : "No alcanza"} tono={res.ventas_necesarias_mes != null ? "neutro" : "negativo"} sub={res.ventas_por_dia != null ? `${decimal(res.ventas_por_dia)} por día` : undefined} />
                <Dato etiqueta="Inversión necesaria" valor={pesos(res.inversion_publicitaria_mes)} sub="Por mes" />
                <Dato etiqueta="Facturación requerida" valor={pesos(res.facturacion_mes)} sub="Por mes" />
                <Dato etiqueta={`Resultado con ${entero(n.ventas)} ventas`} valor={pesos(resultado)} tono={resultado != null && resultado < 0 ? "negativo" : resultado != null && resultado >= n.ganancia ? "positivo" : "neutro"} sub="Después de publicidad y costos fijos" />
              </div>
              {Number.isFinite(n.cac) && n.cac > 0 && n.cac !== d.negocio.cac_objetivo && (
                <Boton tamano="sm" icono={Target} onClick={() => usarCac(n.cac)}>Usar {pesos(n.cac)} como CAC objetivo</Boton>
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function ObjetivosEconomia() {
  const { d, error, cargando, cargar } = useVista<Datos>("economia");
  const centro = useVista<DatosCentro>("centro&dias=30&atribucion=ultimo");
  const { nodo, avisar } = useNotificacion();
  const [ganancia, setGanancia] = useState("");
  const [cac, setCac] = useState("");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (d) { setGanancia(aTexto(d.negocio.ganancia_mensual_objetivo)); setCac(aTexto(d.negocio.cac_objetivo)); } }, [d]);
  const cambio = !!d && (ganancia !== aTexto(d.negocio.ganancia_mensual_objetivo) || cac !== aTexto(d.negocio.cac_objetivo));
  const cacN = cac.trim() === "" ? null : aNumero(cac), ganN = ganancia.trim() === "" ? null : aNumero(ganancia);
  const margen = d?.referencia.margen_contribucion ?? null;
  const ritmo = centro.d ? centro.d.actual.ventas : null;

  async function guardar() {
    if ((ganN != null && (!Number.isFinite(ganN) || ganN < 0)) || (cacN != null && (!Number.isFinite(cacN) || cacN <= 0))) { avisar("Revisá los números: la ganancia puede ser 0 o más y el CAC tiene que ser mayor que 0.", "negativo"); return; }
    if (cacN != null && margen != null && cacN >= margen && !window.confirm(`El CAC objetivo (${pesos(cacN)}) es igual o mayor que el CAC de equilibrio (${pesos(margen)}): cada cliente nuevo perdería plata en su primera compra. ¿Guardarlo igual?`)) return;
    setGuardando(true);
    try { await enviarIC({ accion: "guardar_objetivos", ganancia_mensual_objetivo: ganN, cac_objetivo: cacN }); avisar("Objetivos guardados. El Centro de control, la bandeja y el motor de Google Ads ya los usan."); cargar(); }
    catch (e) { avisar(e instanceof Error ? e.message : String(e), "negativo"); } finally { setGuardando(false); }
  }

  return (
    <Pagina titulo="Objetivos y economía" icono={Scale} descripcion="Cuánto deja cada venta, cuánto se puede pagar por un cliente y cuántas ventas hacen falta para ganar lo que querés.">
      {nodo}
      {error && <ErrorCarga mensaje={error} reintentar={cargar} />}
      {!d && !error && <EsqueletoPagina />}
      {d && (
        <div className={`space-y-8 transition-opacity md:space-y-10 ${cargando ? "opacity-60" : ""}`}>
          <section aria-label="Cifras del negocio" className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Cifra etiqueta="Ganancia mensual deseada" tipo="config" sub="Lo que querés que quede por mes, después de publicidad y costos fijos.">
                <EntradaGrande etiqueta="Ganancia mensual deseada" valor={ganancia} onChange={setGanancia} />
              </Cifra>
              <Cifra etiqueta="CAC objetivo" tipo="config" sub={cacN != null && margen != null && cacN >= margen ? <span className="text-rose-300">Igual o mayor que el equilibrio ({pesos(margen)}): se pierde en la primera compra.</span> : <>Lo máximo que decidís pagar por cliente nuevo. Equilibrio: {pesos(margen)}.</>}>
                <EntradaGrande etiqueta="CAC objetivo" valor={cac} onChange={setCac} />
              </Cifra>
              <Cifra etiqueta="Margen de contribución" tipo="calc" ayuda="Precio cobrado menos costos variables. También es el CAC de equilibrio por primera compra." sub={`Por venta · promedio de ${d.referencia.ventas} ventas en ${d.referencia.dias} días`}>
                <p className={valorGrande}>{pesos(margen)}</p>
              </Cifra>
              <Cifra etiqueta="Costos fijos mensuales" tipo="calc" sub={<>Desde <Enlace href="/admin/tarot/presupuesto">Presupuesto</Enlace>, incluye BPS.</>}>
                <p className={valorGrande}>{pesos(d.fijos_mensuales)}</p>
              </Cifra>
            </div>
            {cambio && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-300/[0.06] px-4 py-3 ring-1 ring-inset ring-amber-300/25">
                <p className="text-[13.5px] text-amber-100">Cambiaste los objetivos. Se usan en el Centro de control, la bandeja y el motor de Google Ads.</p>
                <div className="flex gap-2">
                  <Boton tamano="sm" variante="fantasma" onClick={() => { setGanancia(aTexto(d.negocio.ganancia_mensual_objetivo)); setCac(aTexto(d.negocio.cac_objetivo)); }}>Descartar</Boton>
                  <Boton tamano="sm" variante="marca" icono={Save} cargando={guardando} onClick={guardar}>Guardar objetivos</Boton>
                </div>
              </div>
            )}
          </section>

          <Seccion titulo="Economía unitaria" icono={TrendingUp} descripcion="Cómo el precio cobrado se convierte en margen, antes y después de pagar la publicidad.">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Cascada d={d} cacObjetivo={cacN != null && Number.isFinite(cacN) ? cacN : null} />
              <CostosFijos d={d} />
            </div>
          </Seccion>

          <Seccion titulo="Escenarios" icono={Target}>
            <Escenarios d={d} cacObjetivo={cacN != null && Number.isFinite(cacN) ? cacN : null} ganancia={ganN != null && Number.isFinite(ganN) ? ganN : null} ritmo={ritmo} />
          </Seccion>

          <Seccion titulo="Simulador comercial" icono={SlidersHorizontal}>
            <Simulador d={d} ritmo={ritmo} usarCac={(v) => { setCac(String(Math.round(v))); window.scrollTo({ top: 0, behavior: "smooth" }); avisar(`CAC objetivo en ${pesos(v)}: revisalo arriba y guardá para aplicarlo.`, "info"); }} />
          </Seccion>

          <Seccion titulo="Definiciones" icono={Info}>
            <Conceptos d={d} centro={centro.d} cacObjetivo={cacN != null && Number.isFinite(cacN) ? cacN : null} />
          </Seccion>
        </div>
      )}
    </Pagina>
  );
}
