"use client";
import { useState, useCallback } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { AvisosTarot } from "@/components/admin/AvisosTarot";
import { usePollingRefresh } from "@/lib/usePollingRefresh";
import { duracionHumana } from "@/lib/ejecuciones";

// Dashboard estratégico (2026-10-31). Cinco preguntas: qué atender hoy,
// ¿estoy vendiendo?, ¿dónde se cae la gente?, ¿al cliente le gustó? y ¿la
// máquina anda bien? Datos de /api/admin/tarot/estrategico (solo lectura).
// El panel anterior quedó en /admin/tarot/panel-anterior.

interface Embudo { personas: number; interes: number; checkout: number; formulario: number; pagaron: number }
interface Plata { ventas: number; bruto: number; comision: number; neto: number; ia: number; audio: number; queda: number; cortesias: number; costo_cortesias: number }
interface Origen { fuente: string; personas: number; checkout: number; ventas: number; ingreso: number }
interface Experiencia { entregadas: number; abrieron: number; leyeron_1min: number; bajaron_pdf: number; demora_apertura_mediana_ms: number | null; reclamos: number }
interface Ventana { embudo: Embudo; plata: Plata; origen: Origen[]; experiencia: Experiencia }
interface Datos {
  ok: boolean; periodo: number; incluir: boolean;
  tipo_cambio: { valor: number; estimado: boolean };
  actual: Ventana; anterior: Ventana;
  ventas_por_dia: { fecha: string; ventas: number }[];
  recompra: { clientes: number; recompraron: number };
  atender: { trabadas: { id: string; cliente: string | null; estado: string }[]; reclamos: { id: string; cliente: string | null }[] };
}
interface Salud { compras: number; sin_problemas: number; con_error: number; en_curso: number; entrega_mediana_ms: number | null }

const PERIODOS = [{ dias: 1, label: "24 h" },{ dias: 7, label: "7 días" }, { dias: 30, label: "30 días" }];
const POLL_MS = 120_000;

const pesos = (v: number) => `$ ${Math.round(v).toLocaleString("es-UY")}`;
const pesosFino = (v: number) => `$ ${v.toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");

export default function TarotDashboardPage() {
  const [periodo, setPeriodo] = useState(7);
  const [incluir, setIncluir] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [salud, setSalud] = useState<Salud | null>(null);
  const [alertas, setAlertas] = useState(0);
  const [reenvios, setReenvios] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const [d, s, a, r] = await Promise.allSettled([
      fetch(`/api/admin/tarot/estrategico?periodo=${periodo}&incluir=${incluir ? 1 : 0}`, { cache: "no-store" }).then(async (res) => {
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.ok) throw new Error(j?.detalle ?? j?.motivo ?? `Error HTTP ${res.status}`);
        return j as Datos;
      }),
      fetch("/api/admin/tarot/ejecuciones?limit=1", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/admin/tarot/alertas/no-leidas", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/admin/tarot/entregas/solicitudes?estado=pendiente_autorizacion&limit=20", { cache: "no-store" }).then((res) => res.json()),
    ]);
    if (d.status === "fulfilled") { setDatos(d.value); setErrorMsg(null); }
    else setErrorMsg(d.reason instanceof Error ? d.reason.message : "Error al cargar el panel");
    if (s.status === "fulfilled" && s.value?.resumen) setSalud(s.value.resumen);
    if (a.status === "fulfilled") setAlertas(a.value?.count ?? 0);
    if (r.status === "fulfilled") setReenvios((r.value?.solicitudes ?? []).length);
    setCargando(false);
  }, [periodo, incluir]);
  usePollingRefresh(cargar, POLL_MS);

  const nombrePeriodo = periodo === 1 ? "las 24 h anteriores" : `los ${periodo} días anteriores`;

  return (
    <TarotAdminShell>
      <main className="px-6 py-6 max-w-[1280px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Panel</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {incluir ? "Todo: ventas, cortesías y pruebas propias." : "Solo ventas reales (sin cortesías ni pruebas propias)."} Comparado con {nombrePeriodo}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
              <input type="checkbox" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} className="accent-amber-500" />
              Incluir cortesías y pruebas
            </label>
            <div className="flex gap-1">
              {PERIODOS.map((p) => (
                <button key={p.dias} onClick={() => setPeriodo(p.dias)}
                  className={`px-3 py-1 text-xs rounded-md border transition-colors ${periodo === p.dias ? "border-amber-500 bg-amber-900/40 text-amber-300" : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <AvisosTarot />

        {errorMsg && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" /> {errorMsg}
          </div>
        )}
        {cargando && !datos && <p className="mb-5 text-sm text-gray-500 animate-pulse">Cargando el panel…</p>}

        {datos && (
          <div className="space-y-8">
            <Atender d={datos} alertas={alertas} reenvios={reenvios} />
            <Vendiendo d={datos} nombrePeriodo={nombrePeriodo} />
            <Embudo d={datos} />
            <Publicidad />
            <LeGusto d={datos} />
            <Maquina s={salud} />
            <p className="text-[11px] text-gray-600">
              ¿Buscás el panel anterior? <Link href={"/admin/tarot/panel-anterior" as Route} className="text-gray-400 hover:text-gray-200 underline">Panel anterior</Link>
            </p>
          </div>
        )}
      </main>
    </TarotAdminShell>
  );
}

// ── Piezas comunes ──────────────────────────────────────────────────────────

function Seccion({ titulo, pregunta, children, extra }: { titulo: string; pregunta: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-amber-500/80">{titulo}</p>
          <h3 className="text-sm font-semibold text-gray-100">{pregunta}</h3>
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Delta({ actual, anterior, formato = (v: number) => String(v), invertir = false }: { actual: number; anterior: number; formato?: (v: number) => string; invertir?: boolean }) {
  const dif = actual - anterior;
  if (Math.abs(dif) < 0.5) return <span className="text-[11px] text-gray-500">igual que antes</span>;
  const bueno = invertir ? dif < 0 : dif > 0;
  return (
    <span className={`text-[11px] ${bueno ? "text-emerald-400" : "text-red-400"}`}>
      {dif > 0 ? "↑" : "↓"} {formato(Math.abs(dif))} <span className="text-gray-500">(antes {formato(anterior)})</span>
    </span>
  );
}

function Tarjeta({ titulo, valor, children, destacar }: { titulo: string; valor: React.ReactNode; children?: React.ReactNode; destacar?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${destacar ? "border-emerald-800/60 bg-emerald-950/20" : "border-gray-800 bg-gray-900/60"}`}>
      <p className="text-[11px] text-gray-500">{titulo}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${destacar ? "text-emerald-300" : "text-white"}`}>{valor}</p>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

// ── 0. Qué atender hoy ──────────────────────────────────────────────────────

function Atender({ d, alertas, reenvios }: { d: Datos; alertas: number; reenvios: number }) {
  const items: { texto: string; href: string; grave?: boolean }[] = [];
  for (const t of d.atender.trabadas) items.push({ texto: `Compra de ${t.cliente ?? "un cliente"} trabada o con error`, href: `/admin/tarot/ordenes?orden_id=${t.id}`, grave: true });
  for (const r of d.atender.reclamos) items.push({ texto: `Reclamo sin responder de ${r.cliente ?? "un cliente"}`, href: `/admin/tarot/ordenes?orden_id=${r.id}`, grave: true });
  if (reenvios > 0) items.push({ texto: `${reenvios} reenvío${reenvios > 1 ? "s" : ""} esperando tu autorización`, href: "/admin/tarot/entregas" });
  if (alertas > 0) items.push({ texto: `${alertas} alerta${alertas > 1 ? "s" : ""} sin leer`, href: "/admin/tarot/alertas" });

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
        <CheckCircle2 size={16} /> Todo en orden: nada para atender ahora.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 px-4 py-3">
      <p className="text-xs font-semibold text-amber-300 mb-2">Para atender hoy</p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i}>
            <Link href={it.href as Route} className={`inline-flex items-center gap-1.5 text-sm hover:underline ${it.grave ? "text-red-300" : "text-amber-200"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${it.grave ? "bg-red-400" : "bg-amber-400"}`} />
              {it.texto} <ArrowRight size={12} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 1. ¿Estoy vendiendo? ────────────────────────────────────────────────────

function Vendiendo({ d, nombrePeriodo }: { d: Datos; nombrePeriodo: string }) {
  const a = d.actual.plata, b = d.anterior.plata;
  const porVenta = a.ventas > 0 ? a.queda / a.ventas : null;
  const precioMedio = a.ventas > 0 ? a.bruto / a.ventas : null;
  return (
    <Seccion titulo="1 · Ventas" pregunta="¿Estoy vendiendo?">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta titulo="Ventas" valor={a.ventas}>
          <Delta actual={a.ventas} anterior={b.ventas} />
        </Tarjeta>
        <Tarjeta titulo="Cobrado" valor={pesos(a.bruto)}>
          <Delta actual={a.bruto} anterior={b.bruto} formato={pesos} />
        </Tarjeta>
        <Tarjeta titulo="Lo que te queda" valor={pesos(a.queda)} destacar={a.queda > 0}>
          <p className="text-[11px] text-gray-500">cobrado − Mercado Pago − IA − audio</p>
          <Delta actual={a.queda} anterior={b.queda} formato={pesos} />
        </Tarjeta>
        <Tarjeta titulo="Por cada venta" valor={porVenta != null ? pesos(porVenta) : "—"}>
          {precioMedio != null ? (
            <p className="text-[11px] text-gray-500">de {pesos(precioMedio)} te quedan {pct(a.queda, a.bruto)}</p>
          ) : <p className="text-[11px] text-gray-500">sin ventas en el período</p>}
        </Tarjeta>
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
          <p className="text-[11px] text-gray-500 mb-2">Ventas por día · últimas 4 semanas</p>
          <Barras dias={d.ventas_por_dia} />
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3 text-xs">
          <p className="text-[11px] text-gray-500 mb-2">A dónde se va la plata (período)</p>
          <Linea label="Cobrado" valor={pesos(a.bruto)} />
          <Linea label="− Comisión Mercado Pago" valor={pesos(a.comision)} tenue />
          <Linea label="− Lectura con IA" valor={pesosFino(a.ia)} tenue />
          <Linea label="− Audio" valor={pesosFino(a.audio)} tenue />
          <div className="my-1.5 border-t border-gray-800" />
          <Linea label="Te queda" valor={pesos(a.queda)} fuerte />
          {a.cortesias > 0 && !d.incluir && (
            <p className="mt-2 text-[11px] text-fuchsia-300/80">Aparte: {a.cortesias} cortesía{a.cortesias > 1 ? "s" : ""} regalada{a.cortesias > 1 ? "s" : ""}, costaron {pesosFino(a.costo_cortesias)} en IA y audio.</p>
          )}
          <p className="mt-2 text-[11px] text-gray-600">
            Todavía no descuenta costos fijos (Vercel, Supabase, dominio) ni publicidad. Dólar a {d.tipo_cambio.valor}
            {d.tipo_cambio.estimado && <> (estimado: <Link href={"/admin/tarot/config" as Route} className="underline">configurá el tipo de cambio</Link>)</>}.
          </p>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-gray-600">Comparación contra {nombrePeriodo}.</p>
    </Seccion>
  );
}

function Linea({ label, valor, tenue, fuerte }: { label: string; valor: string; tenue?: boolean; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${tenue ? "text-gray-500" : fuerte ? "text-emerald-300 font-semibold" : "text-gray-200"}`}>
      <span>{label}</span><span className="tabular-nums">{valor}</span>
    </div>
  );
}

function Barras({ dias }: { dias: { fecha: string; ventas: number }[] }) {
  const max = Math.max(1, ...dias.map((d) => d.ventas));
  const total = dias.reduce((a, d) => a + d.ventas, 0);
  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {dias.map((d) => (
          <div key={d.fecha} className="flex-1 h-full flex items-end" title={`${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}: ${d.ventas} venta${d.ventas === 1 ? "" : "s"}`}>
            <div className={`w-full rounded-sm ${d.ventas > 0 ? "bg-emerald-500/80" : "bg-gray-800"}`} style={{ height: d.ventas > 0 ? `${(d.ventas / max) * 100}%` : "3px" }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-600">
        <span>hace 4 semanas</span><span>{total} venta{total === 1 ? "" : "s"} en total</span><span>hoy</span>
      </div>
    </div>
  );
}

// ── 2. ¿Dónde se cae la gente? ──────────────────────────────────────────────

function Embudo({ d }: { d: Datos }) {
  const e = d.actual.embudo, ant = d.anterior.embudo;
  const pasos = [
    { label: "Entraron a la web", n: e.personas, previo: ant.personas, ayuda: "Personas distintas que visitaron el sitio" },
    { label: "Miraron la oferta", n: e.interes, previo: ant.interes, ayuda: "Bajaron al menos hasta la mitad de /tarot o abrieron el formulario (el scroll se mide desde el 30/10)" },
    { label: "Abrieron el formulario", n: e.checkout, previo: ant.checkout, ayuda: "Entraron a la página de checkout" },
    { label: "Completaron el formulario", n: e.formulario, previo: ant.formulario, ayuda: "Enviaron sus datos y fueron a Mercado Pago" },
    { label: "Pagaron", n: e.pagaron, previo: ant.pagaron, ayuda: "Pago aprobado" },
  ];
  // Mayor caída: el paso que más gente pierde respecto del anterior.
  let peor = -1, peorPerdida = 0;
  for (let i = 1; i < pasos.length; i++) {
    const perdida = pasos[i - 1].n - pasos[i].n;
    if (pasos[i - 1].n > 0 && perdida > peorPerdida) { peor = i; peorPerdida = perdida; }
  }
  const base = Math.max(1, e.personas);
  return (
    <Seccion titulo="2 · Embudo" pregunta="¿Dónde se me cae la gente?">
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-4">
        <div className="space-y-2">
          {pasos.map((p, i) => (
            <div key={p.label} className="grid grid-cols-[170px_1fr_150px] items-center gap-3 text-xs" title={p.ayuda}>
              <span className={i === peor ? "text-red-300 font-medium" : "text-gray-300"}>{p.label}</span>
              <div className="h-5 rounded bg-gray-800/60 overflow-hidden">
                <div className={`h-full rounded ${i === peor ? "bg-red-500/70" : i === pasos.length - 1 ? "bg-emerald-500/80" : "bg-amber-500/60"}`}
                  style={{ width: `${p.n > 0 ? Math.max((p.n / base) * 100, 1.5) : 0}%` }} />
              </div>
              <span className="text-right tabular-nums">
                <span className="text-white font-semibold">{p.n}</span>
                {i > 0 && <span className="text-gray-500"> · {pct(p.n, pasos[i - 1].n)} del paso anterior</span>}
              </span>
            </div>
          ))}
        </div>
        {peor > 0 && (
          <p className="mt-3 rounded-lg bg-red-950/30 border border-red-900/40 px-3 py-2 text-xs text-red-200">
            La mayor caída está en <strong>“{pasos[peor].label}”</strong>: de {pasos[peor - 1].n} que {verboPaso(peor - 1)}, {pasos[peor].n === 0 ? "ninguno siguió" : `siguieron ${pasos[peor].n}`} ({peorPerdida} se fueron).
          </p>
        )}
        <p className="mt-2 text-[11px] text-gray-600">
          Con pocas ventas los porcentajes se mueven mucho: mirá los números absolutos.
          {d.periodo > 1 && " “Miraron la oferta” se mide desde el 30/10: en períodos que empiezan antes aparece más bajo de lo real."}
        </p>
      </div>

      {d.actual.origen.length > 0 && (
        <div className="mt-3 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">De dónde vinieron</th>
                <th className="px-4 py-2 font-medium text-right">Personas</th>
                <th className="px-4 py-2 font-medium text-right">Abrieron el formulario</th>
                <th className="px-4 py-2 font-medium text-right">Compraron</th>
                <th className="px-4 py-2 font-medium text-right">Cobrado</th>
                <th className="px-4 py-2 font-medium text-right">Compran</th>
              </tr>
            </thead>
            <tbody>
              {d.actual.origen.map((o) => (
                <tr key={o.fuente} className="border-t border-gray-800/60">
                  <td className="px-4 py-2 text-gray-200">{o.fuente}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-300">{o.personas}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-300">{o.checkout}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${o.ventas > 0 ? "text-emerald-300 font-semibold" : "text-gray-500"}`}>{o.ventas}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-300">{o.ingreso > 0 ? pesos(o.ingreso) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-400">{o.personas > 0 ? `1 de cada ${o.ventas > 0 ? Math.round(o.personas / o.ventas) : "—"}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}

function verboPaso(i: number): string {
  return ["entraron", "miraron la oferta", "abrieron el formulario", "lo completaron", "pagaron"][i] ?? "llegaron";
}

// ── 3. Publicidad (fase 2) ──────────────────────────────────────────────────

function Publicidad() {
  return (
    <Seccion titulo="3 · Publicidad" pregunta="¿Me rinde la publicidad?">
      <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 px-4 py-4 text-xs text-gray-400">
        Para ver cuánto te cuesta cada venta y cuánto vuelve por cada $ invertido, falta cargar el gasto.{" "}
        <Link href={"/admin/tarot/adquisicion" as Route} className="text-amber-300 hover:text-amber-200 underline">Cargar gasto de publicidad</Link>.
        <span className="block mt-1 text-gray-600">Próximo paso: una página de Presupuesto con publicidad y costos fijos (Vercel, Supabase, dominio, etc.).</span>
      </div>
    </Seccion>
  );
}

// ── 4. ¿Al cliente le gustó? ────────────────────────────────────────────────

function LeGusto({ d }: { d: Datos }) {
  const x = d.actual.experiencia;
  return (
    <Seccion titulo="4 · Experiencia" pregunta="¿Al cliente le gustó?">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tarjeta titulo="Abrieron la lectura" valor={x.entregadas ? `${x.abrieron} de ${x.entregadas}` : "—"}>
          <p className="text-[11px] text-gray-500">{x.demora_apertura_mediana_ms != null ? `normalmente a los ${duracionHumana(x.demora_apertura_mediana_ms)} de comprar` : "de las entregadas en el período"}</p>
        </Tarjeta>
        <Tarjeta titulo="La leyeron con calma" valor={x.abrieron ? `${x.leyeron_1min} de ${x.abrieron}` : "—"}>
          <p className="text-[11px] text-gray-500">más de 1 minuto en la lectura (se mide desde el 30/10)</p>
        </Tarjeta>
        <Tarjeta titulo="Bajaron el PDF" valor={x.entregadas ? `${x.bajaron_pdf} de ${x.entregadas}` : "—"} />
        <Tarjeta titulo="Volvieron a comprar" valor={d.recompra.clientes ? `${d.recompra.recompraron} de ${d.recompra.clientes}` : "—"}>
          <p className="text-[11px] text-gray-500">clientes con más de una compra (histórico)</p>
        </Tarjeta>
        <Tarjeta titulo="Reclamos" valor={x.reclamos}>
          <p className="text-[11px] text-gray-500">en el período</p>
        </Tarjeta>
      </div>
    </Seccion>
  );
}

// ── 5. ¿La máquina anda bien? ───────────────────────────────────────────────

function Maquina({ s }: { s: Salud | null }) {
  const ok = s && s.con_error === 0;
  return (
    <Seccion titulo="5 · Sistema" pregunta="¿La máquina anda bien?">
      <Link href={"/admin/tarot/ejecuciones" as Route}
        className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 text-sm transition-colors hover:bg-gray-800/30 ${ok ? "border-emerald-900/50" : "border-red-900/50"}`}>
        {s ? (
          <>
            <span className={ok ? "text-emerald-300" : "text-red-300"}>{ok ? "✓" : "⚠"} {s.sin_problemas} de {s.compras} compras salieron solas</span>
            <span className="text-gray-400">entrega normal {duracionHumana(s.entrega_mediana_ms)}</span>
            <span className={s.con_error ? "text-red-300" : "text-gray-400"}>{s.con_error} con error</span>
            {s.en_curso > 0 && <span className="text-sky-300">{s.en_curso} en curso</span>}
            <span className="text-[11px] text-gray-600">últimos 7 días · incluye todas las compras</span>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-violet-300">Ver ejecuciones <ArrowRight size={12} /></span>
          </>
        ) : <span className="text-gray-500">Cargando…</span>}
      </Link>
    </Seccion>
  );
}
