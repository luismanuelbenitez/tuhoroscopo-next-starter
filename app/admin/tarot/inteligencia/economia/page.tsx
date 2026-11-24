"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Calculator, Check, Save, Target } from "lucide-react";
import { MarcoInteligencia, pesos } from "@/components/admin/inteligencia/Marco";
import { modelo, cacParaVolumen, DIAS_MES } from "@/lib/inteligencia/economia";

// Inteligencia comercial · Objetivos y economía (fase 1, 2026-11-24).
// Única fuente de los objetivos (ganancia mensual deseada y CAC objetivo, en
// ic_negocios). Los costos no se cargan acá: se leen de lo real (cobros de
// Mercado Pago, IA, audio, WhatsApp) y de Presupuesto (costos fijos), así no
// hay dos lugares con el mismo dato.

interface Datos {
  negocio: { id: string; nombre: string; moneda: string; precio: number | null; ganancia_mensual_objetivo: number | null; cac_objetivo: number | null; updated_at: string };
  referencia: { dias: number; ventas: number; precio_promedio: number | null; por_venta: { comision: number; ia: number; audio: number; whatsapp: number; neto_cobrado: number } | null; costo_variable: number | null; margen_contribucion: number | null };
  fijos_mensuales: number;
  costos_fijos: { nombre: string; monto: string | number; moneda: string; frecuencia: string | null }[];
  tipo_cambio: { valor: number; estimado: boolean };
}

const input = "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-[15px] text-white tabular-nums focus:border-amber-500 focus:outline-none";
const aNumero = (s: string) => { const n = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const aTexto = (v: number | null | undefined) => (v == null ? "" : String(Math.round(v)));

function Linea({ t, v, fuerte, tenue }: { t: string; v: string; fuerte?: boolean; tenue?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1 text-[14px] ${fuerte ? "mt-1 border-t border-gray-800 pt-2 font-semibold text-white" : tenue ? "text-gray-400" : "text-gray-200"}`}>
      <span>{t}</span><span className="tabular-nums">{v}</span>
    </div>
  );
}

function Objetivos({ d, onGuardado, sugerido }: { d: Datos; onGuardado: () => void; sugerido: number | null }) {
  const [ganancia, setGanancia] = useState(aTexto(d.negocio.ganancia_mensual_objetivo));
  const [cac, setCac] = useState(aTexto(d.negocio.cac_objetivo));
  const [estado, setEstado] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => { if (sugerido != null) setCac(String(Math.round(sugerido))); }, [sugerido]);
  const guardar = async () => {
    setEstado(null);
    const g = ganancia.trim() === "" ? null : aNumero(ganancia), c = cac.trim() === "" ? null : aNumero(cac);
    if ((g != null && (!Number.isFinite(g) || g < 0)) || (c != null && (!Number.isFinite(c) || c <= 0))) { setEstado({ ok: false, t: "Revisá los números: la ganancia puede ser 0 o más y el CAC tiene que ser mayor que 0." }); return; }
    const j = await fetch("/api/admin/tarot/inteligencia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "guardar_objetivos", ganancia_mensual_objetivo: g, cac_objetivo: c }) }).then((r) => r.json()).catch(() => ({ ok: false, motivo: "error de red" }));
    if (j.ok) { setEstado({ ok: true, t: "Guardado. El Centro de control y el motor de Google Ads ya usan estos objetivos." }); onGuardado(); }
    else setEstado({ ok: false, t: j.motivo ?? "error" });
  };
  const cambio = ganancia !== aTexto(d.negocio.ganancia_mensual_objetivo) || cac !== aTexto(d.negocio.cac_objetivo);
  return (
    <section className="rounded-2xl border border-amber-900/50 bg-amber-950/10 p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-white"><Target size={17} className="text-amber-400" /> Objetivos del negocio</h2>
      <p className="mt-0.5 text-[13px] text-gray-400">Se definen acá y en ningún otro lugar. Los usan el Centro de control, las recomendaciones y el motor de Google Ads.</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-[13px] font-medium text-white">Ganancia mensual deseada ($)</span>
          <span className="mb-1.5 block text-[12px] text-gray-400">Lo que querés que quede por mes, después de publicidad y costos fijos.</span>
          <input inputMode="decimal" className={input} value={ganancia} onChange={(e) => setGanancia(e.target.value)} placeholder="sin definir" />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-white">CAC objetivo ($ por cliente nuevo)</span>
          <span className="mb-1.5 block text-[12px] text-gray-400">Lo máximo que decidís pagar en publicidad por cada cliente nuevo. Tiene que quedar por debajo del máximo rentable.</span>
          <input inputMode="decimal" className={input} value={cac} onChange={(e) => setCac(e.target.value)} placeholder="sin definir" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={guardar} disabled={!cambio} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-700 bg-amber-900/40 px-4 text-[14px] font-medium text-amber-100 hover:bg-amber-800/50 disabled:opacity-40"><Save size={15} /> Guardar objetivos</button>
        {estado && <span className={`inline-flex items-center gap-1 text-[13px] ${estado.ok ? "text-emerald-300" : "text-red-300"}`}>{estado.ok && <Check size={14} />}{estado.t}</span>}
      </div>
    </section>
  );
}

function EconomiaReal({ d }: { d: Datos }) {
  const r = d.referencia, pv = r.por_venta;
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <h2 className="text-base font-semibold text-white">Lo que deja una venta</h2>
        <p className="text-[12px] text-gray-400">Promedio real de los últimos {r.dias} días ({r.ventas} {r.ventas === 1 ? "venta" : "ventas"} cobradas).</p>
        {!pv ? <p className="mt-3 text-[13px] text-amber-300">Sin ventas en el período: no hay datos reales para calcularlo.</p> : (
          <div className="mt-2">
            <Linea t="Precio cobrado (promedio)" v={pesos(r.precio_promedio)} />
            <Linea t="− Comisión de Mercado Pago" v={pesos(pv.comision)} tenue />
            <Linea t="− Lectura con IA" v={pesos(pv.ia)} tenue />
            <Linea t="− Audio" v={pesos(pv.audio)} tenue />
            <Linea t="− WhatsApp" v={pesos(pv.whatsapp)} tenue />
            <Linea t="= Margen de contribución" v={pesos(r.margen_contribucion)} fuerte />
            <p className="mt-2 rounded-lg bg-gray-950/60 px-3 py-2 text-[13px] text-gray-300">Ese es el <b className="text-white">CAC máximo rentable</b>: pagar más de {pesos(r.margen_contribucion)} por cliente nuevo hace perder plata en la primera venta.</p>
            {r.ventas < 5 && <p className="mt-2 text-[12px] text-amber-300">Con {r.ventas} ventas el promedio todavía puede moverse.</p>}
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-white">Costos fijos por mes</h2>
          <Link href={"/admin/tarot/presupuesto" as Route} className="text-[12px] text-sky-300 hover:underline">Editar en Presupuesto →</Link>
        </div>
        <div className="mt-2">
          {d.costos_fijos.length === 0 && <p className="text-[13px] text-gray-500">No hay costos fijos cargados.</p>}
          {d.costos_fijos.map((c) => {
            const mensual = (Number(c.monto) || 0) * (c.moneda === "USD" ? d.tipo_cambio.valor : 1) / (c.frecuencia === "anual" ? 12 : 1);
            return <Linea key={c.nombre} t={`${c.nombre}${c.moneda === "USD" ? ` (US$ ${Number(c.monto)}${c.frecuencia === "anual" ? "/año" : ""})` : ""}`} v={pesos(mensual)} tenue />;
          })}
          <Linea t="Total por mes" v={pesos(d.fijos_mensuales)} fuerte />
          <p className="mt-2 text-[12px] text-gray-500">Incluye los impuestos fijos (BPS). Dólar a {d.tipo_cambio.valor}{d.tipo_cambio.estimado ? " (estimado)" : ""}. Los costos por venta se toman de lo real; los valores de referencia se ajustan en Presupuesto.</p>
        </div>
      </div>
    </section>
  );
}

function LoQuePideLaMeta({ d }: { d: Datos }) {
  const m = d.referencia.margen_contribucion, g = d.negocio.ganancia_mensual_objetivo;
  if (m == null || g == null) return null;
  const volumenes = [20, 30, 45, 60, 90, 120];
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <h2 className="text-base font-semibold text-white">Para ganar {pesos(g)} por mes</h2>
      <p className="text-[12px] text-gray-400">Cuánto podés pagar como máximo por cliente nuevo según cuántas ventas hagas por mes (con el margen real de {pesos(m)} y {pesos(d.fijos_mensuales)} de costos fijos). Es cálculo, no pronóstico.</p>
      <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6">
        {volumenes.map((n) => {
          const c = cacParaVolumen(m, d.fijos_mensuales, g, n);
          return (
            <div key={n} className="rounded-xl border border-gray-800 bg-gray-950/50 p-2.5 text-center">
              <p className="text-[12px] text-gray-400">{n} ventas/mes</p>
              <p className={`mt-0.5 text-lg font-bold tabular-nums ${c == null ? "text-red-300" : "text-white"}`}>{c == null ? "No alcanza" : pesos(c)}</p>
              <p className="text-[11px] text-gray-500">{(n / DIAS_MES).toFixed(1).replace(".", ",")} por día</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Simulador({ d, usarCac }: { d: Datos; usarCac: (v: number) => void }) {
  const r = d.referencia;
  const [f, setF] = useState({
    // Precio: el promedio real cobrado (incluye cupones), así el margen coincide con el CAC máximo real.
    precio: aTexto(r.precio_promedio ?? d.negocio.precio), variable: aTexto(r.costo_variable),
    cac: aTexto(d.negocio.cac_objetivo ?? r.margen_contribucion), fijos: aTexto(d.fijos_mensuales), ganancia: aTexto(d.negocio.ganancia_mensual_objetivo),
  });
  const n = { precio: aNumero(f.precio), variable: aNumero(f.variable), cac: aNumero(f.cac), fijos: aNumero(f.fijos), ganancia: aNumero(f.ganancia) };
  const valido = Object.values(n).every((v) => Number.isFinite(v) && v >= 0);
  const res = valido ? modelo({ precio: n.precio, costo_variable: n.variable, cac: n.cac, fijos_mensuales: n.fijos, ganancia_deseada: n.ganancia }) : null;
  const campos: { k: keyof typeof f; t: string; a: string }[] = [
    { k: "precio", t: "Precio de venta", a: `Promedio real cobrado${d.negocio.precio != null ? ` (lista: ${pesos(d.negocio.precio)})` : ""}` },
    { k: "variable", t: "Costos variables por venta", a: "Real: Mercado Pago, IA, audio, WhatsApp" },
    { k: "cac", t: "CAC (por cliente nuevo)", a: "Lo que pagás en publicidad por cliente" },
    { k: "fijos", t: "Costos fijos mensuales", a: "Presupuesto" },
    { k: "ganancia", t: "Ganancia mensual deseada", a: "Tu objetivo" },
  ];
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-white"><Calculator size={17} className="text-sky-300" /> Simulador</h2>
      <p className="text-[12px] text-gray-400">Arranca con tus números reales. Cambiá cualquiera para ver qué pasa; no se guarda nada hasta que lo decidas.</p>
      <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-3">
          {campos.map((c) => (
            <label key={c.k} className="block">
              <span className="text-[12px] font-medium text-gray-200">{c.t}</span>
              <input inputMode="decimal" className={`${input} mt-1`} value={f[c.k]} onChange={(e) => setF({ ...f, [c.k]: e.target.value })} />
              <span className="mt-0.5 block text-[11px] text-gray-500">{c.a}</span>
            </label>
          ))}
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-3.5">
          {!res ? <p className="text-[13px] text-red-300">Completá todos los valores con números.</p> : (
            <>
              <Linea t="Margen antes de publicidad" v={pesos(res.margen_antes_publicidad)} />
              <Linea t="Contribución por venta (después del CAC)" v={pesos(res.contribucion_por_venta)} />
              {res.ventas_necesarias_mes == null ? (
                <p className="mt-3 rounded-lg bg-red-950/40 px-3 py-2 text-[13px] text-red-200">Con ese CAC cada venta no deja nada para cubrir los costos fijos: no hay volumen que alcance la meta. Hay que bajar el CAC o subir el margen.</p>
              ) : (
                <>
                  <Linea t="Ventas necesarias por mes" v={String(res.ventas_necesarias_mes)} fuerte />
                  <Linea t="Ventas por día (promedio)" v={(res.ventas_por_dia ?? 0).toFixed(1).replace(".", ",")} />
                  <Linea t="Inversión publicitaria por mes" v={pesos(res.inversion_publicitaria_mes)} />
                  <Linea t="Facturación por mes" v={pesos(res.facturacion_mes)} />
                </>
              )}
              {Number.isFinite(n.cac) && n.cac > 0 && (
                <button onClick={() => usarCac(n.cac)} className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-700 px-3 text-[13px] text-gray-200 hover:bg-gray-800">Usar {pesos(n.cac)} como CAC objetivo</button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default function ObjetivosEconomia() {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sugerido, setSugerido] = useState<number | null>(null);
  const cargar = useCallback(async () => {
    try {
      const j = await fetch("/api/admin/tarot/inteligencia?vista=economia", { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.detalle ?? j.motivo ?? "error");
      setD(j); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const usarCac = useMemo(() => (v: number) => { setSugerido(v); window.scrollTo({ top: 0, behavior: "smooth" }); }, []);

  return (
    <MarcoInteligencia bajada="La economía real del producto y tus objetivos: cuánto deja cada venta, cuánto podés pagar por cliente y cuántas ventas hacen falta para ganar lo que querés.">
      {error && <p className="rounded-xl border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200">No se pudieron cargar los datos ({error}).</p>}
      {!d && !error && <p className="text-sm text-gray-400">Cargando…</p>}
      {d && (
        <div className="space-y-4 md:space-y-5">
          <Objetivos key={d.negocio.updated_at} d={d} onGuardado={cargar} sugerido={sugerido} />
          <EconomiaReal d={d} />
          <LoQuePideLaMeta d={d} />
          <Simulador d={d} usarCac={usarCac} />
          <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-3.5 text-[12px] text-gray-400">
            <p className="mb-1 font-medium text-gray-300">Definiciones (las mismas en toda la consola)</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li><b className="text-gray-300">Margen de contribución:</b> precio menos costos variables por venta. Es lo que deja una venta antes de publicidad y costos fijos.</li>
              <li><b className="text-gray-300">CAC máximo rentable:</b> igual al margen de contribución. Por encima, se pierde plata en la primera venta.</li>
              <li><b className="text-gray-300">CAC objetivo:</b> lo que decidís pagar como máximo para llegar a la ganancia deseada.</li>
              <li><b className="text-gray-300">CAC publicitario:</b> inversión publicitaria ÷ clientes nuevos. <b className="text-gray-300">CAC total:</b> suma los costos fijos, gastos puntuales y cortesías del período.</li>
              <li><b className="text-gray-300">Ventas</b> son las cobradas por Mercado Pago; las conversiones que informa cada plataforma se muestran aparte.</li>
            </ul>
          </section>
        </div>
      )}
    </MarcoInteligencia>
  );
}
