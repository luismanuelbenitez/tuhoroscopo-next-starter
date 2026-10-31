"use client";
import { useState, useCallback } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, CheckCircle2, ArrowRight, RefreshCw, BrainCircuit, Workflow } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { AvisosTarot } from "@/components/admin/AvisosTarot";
import { usePollingRefresh } from "@/lib/usePollingRefresh";
import { duracionHumana } from "@/lib/ejecuciones";

// Panel estratégico (2026-10-31, rediseño visual). Cinco preguntas: qué
// atender, ¿estoy vendiendo?, ¿dónde se cae la gente?, ¿gano plata?, ¿al
// cliente le gustó? y ¿la máquina anda bien? Datos de
// /api/admin/tarot/estrategico (solo lectura). Panel viejo: /admin/tarot/panel-anterior.

interface Embudo { personas: number; interes: number; checkout: number; formulario: number; pagaron: number }
interface Plata {
  ventas: number; bruto: number; comision: number; neto: number; ia: number; audio: number; wa: number; queda: number;
  cortesias: number; costo_cortesias: number; fijos: number; puntuales: number; publicidad: number; resultado: number;
}
interface Adquisicion { clientes_nuevos: number; cac: number | null; retorno_por_peso: number | null }
interface Origen { fuente: string; personas: number; checkout: number; ventas: number; ingreso: number }
interface Experiencia { entregadas: number; abrieron: number; leyeron_1min: number; bajaron_pdf: number; demora_apertura_mediana_ms: number | null; reclamos: number }
interface Ventana { embudo: Embudo; plata: Plata; adquisicion: Adquisicion; origen: Origen[]; experiencia: Experiencia }
interface Datos {
  ok: boolean; periodo: number; incluir: boolean;
  tipo_cambio: { valor: number; estimado: boolean };
  punto_equilibrio: number | null; margen_por_venta: number | null; fijos_mensuales: number; ventas_mes: number;
  actual: Ventana; anterior: Ventana;
  ventas_por_dia: { fecha: string; ventas: number }[];
  recompra: { clientes: number; recompraron: number };
  atender: { trabadas: { id: string; cliente: string | null; estado: string }[]; reclamos: { id: string; cliente: string | null }[] };
}
interface Salud { compras: number; sin_problemas: number; con_error: number; en_curso: number; entrega_mediana_ms: number | null }

const PERIODOS = [{ dias: 1, label: "24 h", antes: "las 24 h anteriores" }, { dias: 7, label: "7 días", antes: "los 7 días anteriores" }, { dias: 30, label: "30 días", antes: "los 30 días anteriores" }];
const POLL_MS = 120_000;

const pesos = (v: number) => `${v < 0 ? "−" : ""}$ ${Math.round(Math.abs(v)).toLocaleString("es-UY")}`;
const pesosFino = (v: number) => `$ ${v.toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

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
    setCargando(true);
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

  const antes = PERIODOS.find((p) => p.dias === periodo)?.antes ?? "";
  const hoy = new Date().toLocaleDateString("es-UY", { timeZone: "America/Montevideo", weekday: "long", day: "numeric", month: "long" });

  return (
    <TarotAdminShell>
      <main className="px-6 py-6 max-w-[1320px]">
        {/* Encabezado */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Panel</h2>
            <p className="text-xs text-gray-500 mt-0.5"><span className="capitalize">{hoy}</span> · ventas cobradas{incluir ? " y cortesías" : ""}, comparadas con {antes}.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="mr-1 inline-flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
              <input type="checkbox" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} className="accent-amber-500" />
              Incluir cortesías
            </label>
            <div className="flex rounded-lg border border-gray-800 bg-gray-900/60 p-0.5">
              {PERIODOS.map((p) => (
                <button key={p.dias} onClick={() => setPeriodo(p.dias)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${periodo === p.dias ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40" : "text-gray-400 hover:text-gray-200"}`}>
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
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" /> {errorMsg}
          </div>
        )}
        {!datos && cargando && <p className="text-sm text-gray-500 animate-pulse">Cargando el panel…</p>}

        {datos && (
          <div className={`space-y-8 transition-opacity ${cargando ? "opacity-70" : ""}`}>
            <EstadoHoy d={datos} alertas={alertas} reenvios={reenvios} />
            <Ventas d={datos} />
            <EmbudoSeccion d={datos} />
            <Rentabilidad d={datos} />
            <Experiencia d={datos} />
            <Sistema s={salud} />
            <p className="text-[11px] text-gray-600">
              ¿Querés el análisis completo con recomendaciones? <Link href={"/admin/tarot/asistente" as Route} className="text-gray-400 hover:text-gray-200 underline">Asistente CEO</Link>
              {" · "}<Link href={"/admin/tarot/panel-anterior" as Route} className="text-gray-500 hover:text-gray-300 underline">Panel anterior</Link>
            </p>
          </div>
        )}
      </main>
    </TarotAdminShell>
  );
}

// ── Piezas comunes ──────────────────────────────────────────────────────────

function Seccion({ n, titulo, pregunta, children, extra }: { n: number; titulo: string; pregunta: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/20">{n}</span>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">{titulo}</p>
            <h3 className="text-sm font-semibold text-gray-100 leading-tight">{pregunta}</h3>
          </div>
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Delta({ actual, anterior, fmt = (v: number) => String(v), invertir = false }: { actual: number; anterior: number; fmt?: (v: number) => string; invertir?: boolean }) {
  const dif = actual - anterior;
  if (Math.abs(dif) < 0.5) return <span className="text-[11px] text-gray-500">igual que antes</span>;
  const bueno = invertir ? dif < 0 : dif > 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      <span className={`rounded-full px-1.5 py-0.5 ${bueno ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>{dif > 0 ? "↑" : "↓"} {fmt(Math.abs(dif))}</span>
      <span className="text-gray-500">antes {fmt(anterior)}</span>
    </span>
  );
}

function Tile({ titulo, valor, children, tono }: { titulo: string; valor: React.ReactNode; children?: React.ReactNode; tono?: "bien" | "mal" }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-4 py-4">
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${tono === "bien" ? "text-emerald-300" : tono === "mal" ? "text-red-300" : "text-white"}`}>{valor}</p>
      <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">{children}</div>
    </div>
  );
}

function Proporcion({ a, b, color = "bg-emerald-400/80" }: { a: number; b: number; color?: string }) {
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${b > 0 ? Math.min(100, (a / b) * 100) : 0}%` }} />
    </div>
  );
}

// ── 0. Estado de hoy ────────────────────────────────────────────────────────

function EstadoHoy({ d, alertas, reenvios }: { d: Datos; alertas: number; reenvios: number }) {
  const items: { texto: string; href: string; grave?: boolean }[] = [];
  for (const t of d.atender.trabadas) items.push({ texto: `Compra de ${t.cliente ?? "un cliente"} trabada o con error`, href: `/admin/tarot/ordenes?orden_id=${t.id}`, grave: true });
  for (const r of d.atender.reclamos) items.push({ texto: `Reclamo sin responder de ${r.cliente ?? "un cliente"}`, href: `/admin/tarot/ordenes?orden_id=${r.id}`, grave: true });
  if (reenvios > 0) items.push({ texto: `${reenvios} reenvío${reenvios > 1 ? "s" : ""} esperando tu autorización`, href: "/admin/tarot/entregas" });
  if (alertas > 0) items.push({ texto: `${alertas} alerta${alertas > 1 ? "s" : ""} sin leer`, href: "/admin/tarot/alertas" });
  const ok = items.length === 0;
  return (
    <div className={`rounded-2xl border px-4 py-3 ${ok ? "border-emerald-900/50 bg-emerald-950/15" : "border-amber-800/50 bg-amber-950/20"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`inline-flex items-center gap-2 text-sm ${ok ? "text-emerald-300" : "text-amber-200 font-medium"}`}>
          {ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {ok ? "Todo en orden: nada para atender ahora." : `${items.length} cosa${items.length > 1 ? "s" : ""} para atender`}
        </p>
        <AvisosTarot compacto />
      </div>
      {!ok && (
        <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {items.map((it, i) => (
            <li key={i}>
              <Link href={it.href as Route} className={`inline-flex items-center gap-1.5 text-sm hover:underline ${it.grave ? "text-red-300" : "text-amber-200"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${it.grave ? "bg-red-400" : "bg-amber-400"}`} />{it.texto}<ArrowRight size={12} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 1. ¿Estoy vendiendo? ────────────────────────────────────────────────────

function Ventas({ d }: { d: Datos }) {
  const a = d.actual.plata, b = d.anterior.plata, e = d.actual.embudo;
  const costos = a.ia + a.audio + a.wa;
  const seg = a.bruto > 0
    ? [
      { label: "Te queda", v: a.queda, cls: "bg-emerald-400/80" },
      { label: "Mercado Pago", v: a.comision, cls: "bg-gray-500" },
      { label: "IA, audio y WhatsApp", v: costos, cls: "bg-gray-700" },
    ]
    : [];
  const porVenta = a.ventas > 0 ? a.queda / a.ventas : null;
  const unoDeCada = e.pagaron > 0 ? Math.round(e.personas / e.pagaron) : null;

  return (
    <Seccion n={1} titulo="Ventas" pregunta="¿Estoy vendiendo?"
      extra={<Link href={"/admin/tarot/ingresos" as Route} className="inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200">Ver Ingresos <ArrowRight size={12} /></Link>}>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Cifra principal */}
        <div className="xl:col-span-5 rounded-2xl border border-emerald-900/50 bg-gradient-to-br from-emerald-950/40 via-gray-900/60 to-gray-900/60 px-6 py-5">
          <p className="text-xs text-emerald-300/80">Te quedó</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-white tracking-tight">{pesos(a.queda)}</p>
          <p className="mt-1 text-sm text-gray-400">
            de <span className="text-gray-200">{pesos(a.bruto)}</span> cobrados en {a.ventas} venta{a.ventas === 1 ? "" : "s"}
            <span className="ml-2"><Delta actual={a.queda} anterior={b.queda} fmt={pesos} /></span>
          </p>
          {seg.length > 0 ? (
            <div className="mt-5">
              <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
                {seg.map((s) => s.v > 0 && <div key={s.label} className={`h-full ${s.cls}`} style={{ width: `${(s.v / a.bruto) * 100}%` }} title={`${s.label}: ${pesos(s.v)}`} />)}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
                {seg.map((s) => (
                  <div key={s.label}>
                    <p className="inline-flex items-center gap-1.5 text-gray-400"><span className={`h-2 w-2 rounded-sm ${s.cls}`} />{s.label}</p>
                    <p className="text-gray-200 tabular-nums mt-0.5">{s.label === "IA, audio y WhatsApp" ? pesosFino(s.v) : pesos(s.v)} <span className="text-gray-500">· {pct(s.v, a.bruto)} %</span></p>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="mt-5 text-xs text-gray-500">Sin ventas en este período.</p>}
          {a.cortesias > 0 && !d.incluir && (
            <p className="mt-4 text-[11px] text-fuchsia-300/70">Aparte: {a.cortesias} cortesía{a.cortesias > 1 ? "s" : ""} regalada{a.cortesias > 1 ? "s" : ""}, costaron {pesosFino(a.costo_cortesias)}.</p>
          )}
        </div>

        {/* Cifras */}
        <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Tile titulo="Ventas" valor={a.ventas}>
            <Delta actual={a.ventas} anterior={b.ventas} />
          </Tile>
          <Tile titulo="Te deja cada venta" valor={porVenta != null ? pesos(porVenta) : "—"}>
            {porVenta != null ? <p>de {pesos(a.bruto / a.ventas)} de precio · {pct(a.queda, a.bruto)} % queda</p> : <p>sin ventas en el período</p>}
          </Tile>
          <Tile titulo="Compran" valor={unoDeCada ? `1 de cada ${unoDeCada}` : "—"}>
            <p>{e.pagaron} venta{e.pagaron === 1 ? "" : "s"} de {e.personas} visitantes (sin tus visitas)</p>
          </Tile>
          <Tile titulo="Este mes" valor={d.punto_equilibrio != null ? `${d.ventas_mes} de ${d.punto_equilibrio}` : String(d.ventas_mes)}>
            {d.punto_equilibrio != null ? (
              <>
                <p>ventas para cubrir {pesos(d.fijos_mensuales)} de costos fijos</p>
                <Proporcion a={d.ventas_mes} b={d.punto_equilibrio} color={d.ventas_mes >= d.punto_equilibrio ? "bg-emerald-400/80" : "bg-amber-400/80"} />
              </>
            ) : <p>ventas en el mes calendario</p>}
          </Tile>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-200">Ventas por día</p>
          <p className="text-[11px] text-gray-500">últimas 4 semanas · {d.ventas_por_dia.reduce((x, y) => x + y.ventas, 0)} en total</p>
        </div>
        <BarrasDias dias={d.ventas_por_dia} />
      </div>
    </Seccion>
  );
}

function BarrasDias({ dias }: { dias: { fecha: string; ventas: number }[] }) {
  const max = Math.max(1, ...dias.map((x) => x.ventas));
  return (
    <div>
      <div className="flex items-end gap-1 h-24">
        {dias.map((x) => {
          const finde = [0, 6].includes(new Date(`${x.fecha}T12:00:00-03:00`).getDay());
          return (
            <div key={x.fecha} className={`group flex-1 h-full flex flex-col justify-end items-center rounded-sm ${finde ? "bg-gray-800/30" : ""}`}
              title={`${new Date(`${x.fecha}T12:00:00-03:00`).toLocaleDateString("es-UY", { weekday: "short", day: "numeric", month: "short" })}: ${x.ventas} venta${x.ventas === 1 ? "" : "s"}`}>
              {x.ventas > 0 && <span className="text-[10px] text-emerald-300 tabular-nums mb-0.5">{x.ventas}</span>}
              <div className={`w-full max-w-[22px] rounded-t ${x.ventas > 0 ? "bg-emerald-500/80 group-hover:bg-emerald-400" : "bg-gray-800"}`}
                style={{ height: x.ventas > 0 ? `${Math.max((x.ventas / max) * 75, 8)}%` : "2px" }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1">
        {dias.map((x, i) => (
          <span key={x.fecha} className="flex-1 text-center text-[9px] text-gray-600">{i % 7 === 0 || i === dias.length - 1 ? `${x.fecha.slice(8, 10)}/${x.fecha.slice(5, 7)}` : ""}</span>
        ))}
      </div>
    </div>
  );
}

// ── 2. ¿Dónde se cae la gente? ──────────────────────────────────────────────

function EmbudoSeccion({ d }: { d: Datos }) {
  const e = d.actual.embudo;
  const pasos = [
    { label: "Entraron a la web", n: e.personas, ayuda: "Personas distintas (sin tus visitas)" },
    { label: "Miraron la oferta", n: e.interes, ayuda: "Bajaron al menos hasta la mitad de /tarot o abrieron el formulario (se mide desde el 31/10)" },
    { label: "Abrieron el formulario", n: e.checkout, ayuda: "Entraron al checkout" },
    { label: "Lo completaron", n: e.formulario, ayuda: "Enviaron sus datos y fueron a Mercado Pago" },
    { label: "Pagaron", n: e.pagaron, ayuda: "Pago aprobado" },
  ];
  let peor = -1, perdidaMax = 0;
  for (let i = 1; i < pasos.length; i++) {
    const p = pasos[i - 1].n - pasos[i].n;
    if (pasos[i - 1].n > 0 && p > perdidaMax) { peor = i; perdidaMax = p; }
  }
  const base = Math.max(1, e.personas);
  const verbos = ["entraron", "miraron la oferta", "abrieron el formulario", "lo completaron"];

  return (
    <Seccion n={2} titulo="Embudo" pregunta="¿Dónde se me cae la gente?">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-4">
          <div className="space-y-1">
            {pasos.map((p, i) => (
              <div key={p.label}>
                {i > 0 && (
                  <div className="flex items-center gap-2 py-0.5 pl-[150px] text-[10px]">
                    <span className={`rounded-full px-1.5 py-0.5 ${i === peor ? "bg-red-500/15 text-red-300" : "bg-gray-800 text-gray-400"}`}>
                      ↓ {pasos[i - 1].n > 0 ? `${pct(p.n, pasos[i - 1].n)} % siguió` : "—"}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-[140px_1fr_44px] items-center gap-2.5" title={p.ayuda}>
                  <span className={`text-xs ${i === peor ? "text-red-300 font-medium" : "text-gray-300"}`}>{p.label}</span>
                  <div className="h-6 rounded-md bg-gray-800/50 overflow-hidden">
                    <div className={`h-full rounded-md ${i === pasos.length - 1 ? "bg-emerald-500/80" : i === peor ? "bg-red-500/60" : "bg-amber-500/50"}`}
                      style={{ width: `${p.n > 0 ? Math.max((p.n / base) * 100, 2) : 0}%` }} />
                  </div>
                  <span className="text-right text-sm font-semibold tabular-nums text-white">{p.n}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-5 flex flex-col gap-4">
          {peor > 0 ? (
            <div className="rounded-2xl border border-red-900/50 bg-red-950/20 px-5 py-4">
              <p className="text-[11px] uppercase tracking-wider text-red-300/80">La mayor fuga</p>
              <p className="mt-1 text-sm text-gray-100">“{pasos[peor].label}”</p>
              <p className="mt-1 text-xs text-gray-400">De {pasos[peor - 1].n} que {verbos[peor - 1]}, {pasos[peor].n === 0 ? "ninguno siguió" : `siguieron ${pasos[peor].n}`}: se fueron {perdidaMax}.</p>
              <Link href={"/admin/tarot/asistente" as Route} className="mt-2 inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200">Qué hacer, en el Asistente <ArrowRight size={11} /></Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-4 text-xs text-gray-500">Todavía no hay suficiente tráfico para marcar una fuga.</div>
          )}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-4 flex-1">
            <p className="text-sm font-medium text-gray-200 mb-2">De dónde vienen</p>
            {d.actual.origen.length === 0 && <p className="text-xs text-gray-600">Sin visitas en el período.</p>}
            <div className="space-y-2.5">
              {d.actual.origen.slice(0, 6).map((o) => (
                <div key={o.fuente}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-gray-300 truncate">{o.fuente}</span>
                    <span className="tabular-nums text-gray-400 shrink-0">
                      {o.personas} personas · {o.checkout} al formulario · <span className={o.ventas > 0 ? "text-emerald-300 font-medium" : "text-gray-500"}>{o.ventas} venta{o.ventas === 1 ? "" : "s"}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-400/60" style={{ width: `${pct(o.personas, Math.max(1, e.personas))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-gray-600">Con pocas ventas los porcentajes se mueven mucho: mirá los números absolutos.{d.periodo > 1 && " “Miraron la oferta” se mide desde el 31/10."}</p>
    </Seccion>
  );
}

// ── 3. ¿Gano plata? ─────────────────────────────────────────────────────────

function Rentabilidad({ d }: { d: Datos }) {
  const p = d.actual.plata, a = d.actual.adquisicion;
  const porCliente = a.cac != null && d.margen_por_venta != null ? d.margen_por_venta - a.cac : null;
  const gana = p.resultado >= 0;
  return (
    <Seccion n={3} titulo="Rentabilidad" pregunta="¿Gano plata y me rinde la publicidad?"
      extra={<Link href={"/admin/tarot/presupuesto" as Route} className="inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200">Ver Presupuesto <ArrowRight size={12} /></Link>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className={`rounded-2xl border px-4 py-4 ${gana ? "border-emerald-800/60 bg-emerald-950/20" : "border-red-900/60 bg-red-950/20"}`}>
          <p className="text-xs text-gray-400">{gana ? "Ganancia" : "Pérdida"} del período</p>
          <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${gana ? "text-emerald-300" : "text-red-300"}`}>{pesos(p.resultado)}</p>
          <p className="mt-1 text-[11px] text-gray-500">lo que dejaron las ventas ({pesos(p.queda)}) − costos fijos ({pesos(p.fijos)}) − publicidad ({pesos(p.publicidad)}) − cortesías</p>
        </div>
        <Tile titulo="Punto de equilibrio" valor={d.punto_equilibrio != null ? `${d.punto_equilibrio} ventas/mes` : "—"}>
          <p>para cubrir {pesos(d.fijos_mensuales)} de costos fijos por mes</p>
        </Tile>
        {a.cac != null ? (
          <Tile titulo="Costo de conseguir un cliente (CAC)" valor={pesos(a.cac)}>
            <p>{pesos(p.publicidad)} de publicidad ÷ {a.clientes_nuevos} cliente{a.clientes_nuevos === 1 ? "" : "s"} nuevo{a.clientes_nuevos === 1 ? "" : "s"}</p>
          </Tile>
        ) : (
          <Link href={"/admin/tarot/presupuesto" as Route} className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/30 px-4 py-4 hover:border-amber-700/60 transition-colors">
            <p className="text-xs text-gray-500">Costo de conseguir un cliente (CAC)</p>
            <p className="mt-1.5 text-sm text-amber-200">Cargá el gasto de publicidad</p>
            <p className="mt-1 text-[11px] text-gray-500">{p.publicidad > 0 ? `${pesos(p.publicidad)} invertidos y ningún cliente nuevo` : "Con eso sale cuánto te cuesta cada cliente"} →</p>
          </Link>
        )}
        <Tile titulo="Cada cliente nuevo te deja" valor={porCliente != null ? pesos(porCliente) : "—"} tono={porCliente == null ? undefined : porCliente >= 0 ? "bien" : "mal"}>
          <p>{porCliente != null ? (porCliente < 0 ? "pierde plata en la primera compra" : "después de pagar lo que costó conseguirlo") : "necesita publicidad cargada y ventas"}</p>
        </Tile>
      </div>
    </Seccion>
  );
}

// ── 4. ¿Al cliente le gustó? ────────────────────────────────────────────────

function Experiencia({ d }: { d: Datos }) {
  const x = d.actual.experiencia;
  const ratio = (a: number, b: number) => (b ? `${a} de ${b}` : "—");
  return (
    <Seccion n={4} titulo="Experiencia" pregunta="¿Al cliente le gustó?">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Tile titulo="Abrieron la lectura" valor={ratio(x.abrieron, x.entregadas)}>
          <p>{x.demora_apertura_mediana_ms != null ? `en ${duracionHumana(x.demora_apertura_mediana_ms)} desde la compra` : "de las entregadas"}</p>
          <Proporcion a={x.abrieron} b={x.entregadas} />
        </Tile>
        <Tile titulo="La leyeron con calma" valor={ratio(x.leyeron_1min, x.abrieron)}>
          <p>más de 1 minuto leyendo</p>
          <Proporcion a={x.leyeron_1min} b={x.abrieron} />
        </Tile>
        <Tile titulo="Bajaron el PDF" valor={ratio(x.bajaron_pdf, x.entregadas)}>
          <p>desde su lectura</p>
          <Proporcion a={x.bajaron_pdf} b={x.entregadas} />
        </Tile>
        <Tile titulo="Volvieron a comprar" valor={ratio(d.recompra.recompraron, d.recompra.clientes)}>
          <p>clientes con más de una compra</p>
          <Proporcion a={d.recompra.recompraron} b={d.recompra.clientes} />
        </Tile>
        <Tile titulo="Reclamos" valor={x.reclamos} tono={x.reclamos > 0 ? "mal" : undefined}>
          <p>{x.reclamos ? "en el período" : "ninguno en el período"}</p>
        </Tile>
      </div>
    </Seccion>
  );
}

// ── 5. ¿La máquina anda bien? ───────────────────────────────────────────────

function Sistema({ s }: { s: Salud | null }) {
  const ok = s && s.con_error === 0;
  return (
    <Seccion n={5} titulo="Sistema" pregunta="¿La máquina anda bien?">
      <Link href={"/admin/tarot/ejecuciones" as Route}
        className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border px-5 py-4 transition-colors hover:bg-gray-800/30 ${ok ? "border-emerald-900/50 bg-emerald-950/10" : "border-red-900/50 bg-red-950/10"}`}>
        {s ? (
          <>
            <span className={`inline-flex items-center gap-2 text-sm font-medium ${ok ? "text-emerald-300" : "text-red-300"}`}>
              <Workflow size={15} /> {s.sin_problemas} de {s.compras} compras salieron solas
            </span>
            <span className="text-xs text-gray-400">Entrega normal <span className="text-gray-200 tabular-nums">{duracionHumana(s.entrega_mediana_ms)}</span></span>
            <span className={`text-xs ${s.con_error ? "text-red-300" : "text-gray-400"}`}>{s.con_error} con error</span>
            {s.en_curso > 0 && <span className="text-xs text-sky-300">{s.en_curso} en curso</span>}
            <span className="text-[11px] text-gray-600">últimos 7 días</span>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-violet-300">Ver ejecuciones <ArrowRight size={12} /></span>
          </>
        ) : <span className="text-gray-500 text-sm">Cargando…</span>}
      </Link>
      <Link href={"/admin/tarot/asistente" as Route} className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200">
        <BrainCircuit size={13} /> Revisión completa por área en el Asistente CEO
      </Link>
    </Seccion>
  );
}
