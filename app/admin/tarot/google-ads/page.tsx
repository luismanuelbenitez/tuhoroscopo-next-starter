"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, Info, RefreshCw, Search } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { PaginaDestino, type Destino } from "@/components/admin/googleAds/PaginaDestino";

// Google Ads (2026-11-04). Panel de SOLO LECTURA: arriba, cómo califica Google
// la página de destino (2026-11-05); después lo que la API lee de la cuenta
// (gasto, palabras, búsquedas) y abajo lo que la web mide de esas visitas
// (embudo, términos, páginas, dispositivos y recorrido de cada visita).

interface Fila { visitas: number; checkout: number; ventas: number }
interface Datos {
  ok: boolean; motivo?: string; dias: number;
  medicion: { etiqueta: boolean; compra: boolean };
  pasos: { id: string; titulo: string; estado: string; enlace: string | null; origen_ref: string }[];
  resumen: { visitas: number; vieron_producto: number; checkout: number; empezaron_form: number; fueron_a_pagar: number; ventas: number; ingresos: number; movil: number; ultima_visita: string | null };
  por_dia: (Fila & { fecha: string })[];
  landings: (Fila & { path: string })[];
  dispositivos: (Fila & { dispositivo: string })[];
  terminos: (Fila & { termino: string })[];
  visitas: { inicio: string; dispositivo: string | null; ciudad: string | null; landing: string | null; termino: string | null; paginas: number; etapa: string }[];
  fuentes: (Fila & { fuente: string })[];
  cuenta: Cuenta;
}
interface CampanaG { id: string; nombre: string; estado: string; estado_principal: string; motivos: string[]; puja: string; presupuesto_diario: number | null; presupuesto_total: number | null; limitada_por_presupuesto: boolean }
interface DiaG { fecha: string; impresiones: number; clics: number; costo: number; conversiones: number; cuota_impresiones: number | null; perdida_por_presupuesto: number | null; perdida_por_ranking: number | null }
interface PalabraG { palabra: string; concordancia: string; negativa: boolean; estado: string; impresiones: number; clics: number; costo: number }
interface TerminoG { termino: string; impresiones: number; clics: number; costo: number }
interface Cuenta {
  conectada: boolean; ultima_lectura: { iniciado_at: string; terminado_at: string | null; ok: boolean | null; error: string | null } | null;
  tipo_cambio?: number; campanas?: CampanaG[]; por_dia?: DiaG[];
  palabras?: { desde: string; hasta: string; filas: PalabraG[] } | null; terminos?: { desde: string; hasta: string; filas: TerminoG[] } | null;
  destino?: Destino;
}

const entero = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("es-UY"));
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
const diaCorto = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const fechaHora = (s: string) => new Date(s).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" });
const esGratis = (t: string) => /grat|free/i.test(t);

const LINKS = [
  { href: "https://ads.google.com/aw/campaigns", label: "Campañas" },
  { href: "https://ads.google.com/aw/searchterms", label: "Términos de búsqueda" },
  { href: "https://ads.google.com/aw/keywords/negative", label: "Palabras negativas" },
  { href: "https://ads.google.com/aw/conversions", label: "Conversiones" },
];

const ETAPA: Record<string, string> = {
  "compró": "text-emerald-300 border-emerald-900/70 bg-emerald-950/40",
  "fue a pagar": "text-sky-300 border-sky-900/70 bg-sky-950/40",
  "empezó el formulario": "text-sky-300 border-sky-900/70 bg-sky-950/40",
  "llegó al checkout": "text-amber-300 border-amber-900/70 bg-amber-950/30",
  "vio el producto": "text-gray-300 border-gray-700 bg-gray-900",
  "solo entró": "text-gray-500 border-gray-800 bg-gray-900",
};

function Tarjeta({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-900/80 to-gray-950/60 p-5 shadow-[0_8px_30px_-18px_rgba(0,0,0,0.8)]">
      <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold tracking-tight text-white">{titulo}</p>{extra}</div>
      {children}
    </div>
  );
}

// izquierda: cuántas columnas de texto van alineadas a la izquierda.
function Tabla({ cabeza, filas, izquierda = 1 }: { cabeza: string[]; filas: React.ReactNode[][]; izquierda?: number }) {
  if (!filas.length) return <p className="text-xs text-gray-500">Sin datos en este período.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-gray-500">{cabeza.map((c, i) => <th key={c} className={`pb-2 font-medium ${i >= izquierda ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i} className="border-t border-gray-800/80">{f.map((c, j) => <td key={j} className={`py-1.5 pr-3 ${j >= izquierda ? "text-right tabular-nums" : "text-gray-200"}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// Medición de compras: activa o, si no, los pasos (pendientes "Google Ads n/6").
function Medicion({ d }: { d: Datos }) {
  const activa = d.medicion.etiqueta && d.medicion.compra;
  const abiertos = d.pasos.filter((p) => !["resuelto", "descartado"].includes(p.estado));
  return (
    <div className={`rounded-xl border p-5 ${activa ? "border-emerald-900/70 bg-emerald-950/30" : "border-amber-900/50 bg-amber-950/20"}`}>
      <p className={`flex items-center gap-2 text-sm font-semibold ${activa ? "text-emerald-200" : "text-amber-200"}`}>
        {activa ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
        {activa ? "Medición de compras activa" : "La medición de compras todavía no está activa"}
      </p>
      <p className="mt-1 text-xs text-gray-400">
        {activa
          ? "Cada compra confirmada se avisa a Google Ads con su valor, para que aprenda qué búsquedas venden."
          : "El código ya está publicado; se activa al cargar el ID y la etiqueta en Vercel y volver a desplegar."}
      </p>
      {d.pasos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {d.pasos.map((p) => {
            const hecho = ["resuelto", "descartado"].includes(p.estado);
            return (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                {hecho ? <CheckCircle2 size={13} className="shrink-0 text-emerald-400" /> : <CircleDashed size={13} className="shrink-0 text-amber-400" />}
                <span className={hecho ? "text-gray-500 line-through" : "text-gray-200"}>{p.titulo}</span>
                {p.enlace && /^https?:/.test(p.enlace) && <a href={p.enlace} target="_blank" rel="noreferrer" className="text-sky-300"><ExternalLink size={12} /></a>}
              </li>
            );
          })}
        </ul>
      )}
      {abiertos.length > 0 && <Link href="/admin/tarot/pendientes" className="mt-3 inline-block text-xs text-sky-300 hover:underline">Marcar avances en Pendientes →</Link>}
    </div>
  );
}

// Cuenta de Google Ads (2026-11-05): lo que la API leyó de la cuenta (solo
// lectura, REGLA MÁXIMA). Gasto en USD (la moneda de la cuenta) y en pesos.
const ESTADO_CAMPANA: Record<string, string> = { ELIGIBLE: "Activa", LEARNING: "Aprendiendo", LIMITED: "Limitada", PAUSED: "Pausada", NOT_ELIGIBLE: "No se muestra", PENDING: "Pendiente", ENDED: "Terminada", MISCONFIGURED: "Mal configurada" };
const PUJA: Record<string, string> = { TARGET_SPEND: "Maximizar clics", MAXIMIZE_CONVERSIONS: "Maximizar conversiones", MAXIMIZE_CONVERSION_VALUE: "Maximizar valor", MANUAL_CPC: "CPC manual", TARGET_CPA: "CPA objetivo", TARGET_ROAS: "ROAS objetivo", TARGET_IMPRESSION_SHARE: "Cuota de impresiones" };
const CONCORDANCIA: Record<string, string> = { BROAD: "amplia", PHRASE: "frase", EXACT: "exacta" };
const usd = (n: number) => `US$ ${n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hace = (s: string) => { const m = Math.round((Date.now() - new Date(s).getTime()) / 60_000); return m < 1 ? "recién" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };
const promedio = (v: (number | null)[]) => { const x = v.filter((n): n is number => n != null); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };

function Etiqueta({ texto, tono = "rojo" }: { texto: string; tono?: "rojo" | "gris" }) {
  return <span className={`rounded-full border px-1.5 text-[10px] ${tono === "rojo" ? "border-red-900/70 bg-red-950/40 text-red-300" : "border-gray-700 bg-gray-900 text-gray-400"}`}>{texto}</span>;
}

function CuentaGoogle({ d, alLeer }: { d: Datos; alLeer: () => void }) {
  const c = d.cuenta;
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const leer = async () => {
    setLeyendo(true); setAviso(null);
    try {
      const r = await fetch("/api/admin/tarot/google-ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "sincronizar", dias: 30 }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.detalle ?? j.motivo ?? "error");
      alLeer();
    } catch (e) { setAviso(e instanceof Error ? e.message : "error"); } finally { setLeyendo(false); }
  };
  const boton = (
    <button onClick={leer} disabled={leyendo} className="inline-flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50">
      <RefreshCw size={12} className={leyendo ? "animate-spin" : ""} /> Leer ahora
    </button>
  );
  if (!c?.conectada) {
    return (
      <Tarjeta titulo="Tu cuenta de Google Ads" extra={boton}>
        <p className="text-xs text-gray-400">Todavía no se leyó la cuenta. {c?.ultima_lectura?.error ? `Último error: ${c.ultima_lectura.error}` : "Se lee sola cada hora."}</p>
        {aviso && <p className="mt-2 text-xs text-red-300">{aviso}</p>}
      </Tarjeta>
    );
  }
  const dias = c.por_dia ?? [];
  const tot = dias.reduce((a, x) => ({ imp: a.imp + x.impresiones, clics: a.clics + x.clics, costo: a.costo + Number(x.costo) }), { imp: 0, clics: 0, costo: 0 });
  const tc = c.tipo_cambio ?? 40;
  const ventas = d.resumen.ventas;
  const cuota = promedio(dias.map((x) => x.cuota_impresiones));
  const pierdeRanking = promedio(dias.map((x) => x.perdida_por_ranking));
  const pierdePresupuesto = promedio(dias.map((x) => x.perdida_por_presupuesto));
  const terminos = c.terminos?.filas ?? [];
  const gratis = terminos.filter((t) => esGratis(t.termino));
  const clicsGratis = gratis.reduce((a, t) => a + t.clics, 0), clicsTerm = terminos.reduce((a, t) => a + t.clics, 0);
  const costoGratis = gratis.reduce((a, t) => a + Number(t.costo), 0);
  const palabrasGratis = (c.palabras?.filas ?? []).filter((p) => !p.negativa && esGratis(p.palabra));
  const kpis: [string, string, string?][] = [
    ["Gasto", usd(tot.costo), `≈ $ ${entero(tot.costo * tc)}`],
    ["Clics", entero(tot.clics), `${entero(tot.imp)} impresiones`],
    ["Clics / impresiones", pct(tot.clics, tot.imp), "CTR"],
    ["Costo por clic", tot.clics ? usd(tot.costo / tot.clics) : "—", tot.clics ? `≈ $ ${entero((tot.costo / tot.clics) * tc)}` : undefined],
    ["Costo por venta", ventas ? `$ ${entero((tot.costo * tc) / ventas)}` : "—", `${ventas} ${ventas === 1 ? "venta" : "ventas"} medidas en la web`],
    ["Cuota de impresiones", cuota != null ? `${Math.round(cuota * 100)}%` : "—", "de las búsquedas posibles"],
  ];
  return (
    <section className="space-y-4 rounded-2xl border border-sky-900/50 bg-gradient-to-b from-sky-950/30 via-gray-900/30 to-gray-950/30 p-4 shadow-[0_10px_40px_-22px_rgba(56,189,248,0.45)] md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">Cuenta</p>
          <p className="text-base font-semibold text-white">Tu cuenta de Google Ads</p>
          <p className="text-[11px] text-gray-400">
            Leída por la API {c.ultima_lectura?.terminado_at ? hace(c.ultima_lectura.terminado_at) : "—"} · se lee sola cada hora · solo lectura (no puede cambiar nada)
            {c.ultima_lectura?.ok === false && <span className="text-red-300"> · última lectura con error: {c.ultima_lectura.error}</span>}
          </p>
        </div>
        {boton}
      </div>
      {aviso && <p className="text-xs text-red-300">{aviso}</p>}

      {(c.campanas ?? []).map((k) => (
        <div key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-xs">
          <span className="font-semibold text-white">{k.nombre}</span>
          <span className="text-gray-300">{ESTADO_CAMPANA[k.estado_principal] ?? k.estado_principal}</span>
          <span className="text-gray-500">Puja: {PUJA[k.puja] ?? k.puja}</span>
          <span className="text-gray-500">Presupuesto: {k.presupuesto_diario != null ? `${usd(k.presupuesto_diario)} por día` : k.presupuesto_total != null ? `${usd(k.presupuesto_total)} en total` : "—"}</span>
          {k.limitada_por_presupuesto && <Etiqueta texto="limitada por presupuesto" />}
        </div>
      ))}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {kpis.map(([t, v, s]) => (
          <div key={t} className="rounded-xl border border-gray-800 bg-gray-950/50 p-3.5 ring-1 ring-inset ring-white/[0.02]">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">{t}</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-white tabular-nums">{v}</p>
            {s && <p className="text-[11px] text-gray-500">{s}</p>}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-500">Últimos {d.dias} días según Google. El costo por venta usa el dólar a {tc} y las ventas que midió la web desde anuncios de Google.</p>

      {(palabrasGratis.length > 0 || clicsGratis > 0) && (
        <p className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${palabrasGratis.length ? "border-red-900/70 bg-red-950/30 text-red-200" : "border-gray-800 bg-gray-900/60 text-gray-300"}`}>
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            {clicsGratis > 0 && <>En 30 días, {clicsGratis} de {clicsTerm} clics fueron de búsquedas con &quot;gratis&quot; ({usd(costoGratis)}). </>}
            {palabrasGratis.length > 0 ? <>Hay palabras clave activas con &quot;gratis&quot; ({palabrasGratis.map((p) => `«${p.palabra}»`).join(", ")}): traen gente que no quiere pagar.</> : <>Desde el 5/11 &quot;gratis&quot; es palabra negativa: esos clics ya no se pagan.</>}
          </span>
        </p>
      )}
      {pierdeRanking != null && pierdeRanking > 0.5 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-200">
          <Info size={14} className="mt-px shrink-0" />
          El anuncio aparece en {cuota != null ? Math.round(cuota * 100) : "—"}% de las búsquedas posibles: pierde {Math.round(pierdeRanking * 100)}% por ranking (puja y calidad) y {Math.round((pierdePresupuesto ?? 0) * 100)}% por presupuesto. Más presupuesto solo no trae más visitas.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Tarjeta titulo="Palabras clave" extra={<span className="text-[11px] text-gray-500">últimos 30 días</span>}>
          <Tabla cabeza={["Palabra", "Impr.", "Clics", "Gasto"]} filas={(c.palabras?.filas ?? []).filter((p) => !p.negativa && (p.impresiones > 0 || p.costo > 0)).slice(0, 20).map((p) => [
            <span key="p" className="inline-flex flex-wrap items-center gap-1.5">{p.palabra}<Etiqueta texto={CONCORDANCIA[p.concordancia] ?? p.concordancia} tono="gris" />{esGratis(p.palabra) && <Etiqueta texto="gratis" />}</span>,
            entero(p.impresiones), entero(p.clics), usd(Number(p.costo)),
          ])} />
        </Tarjeta>
        <Tarjeta titulo="Qué buscó la gente (según Google)" extra={<span className="text-[11px] text-gray-500">con clics · 30 días</span>}>
          <Tabla cabeza={["Búsqueda", "Impr.", "Clics", "Gasto"]} filas={terminos.filter((t) => t.clics > 0).slice(0, 25).map((t) => [
            <span key="t" className="inline-flex items-center gap-1.5">{t.termino}{esGratis(t.termino) && <Etiqueta texto="gratis" />}</span>,
            entero(t.impresiones), entero(t.clics), usd(Number(t.costo)),
          ])} />
        </Tarjeta>
      </div>

      <Tarjeta titulo="Por día (Google)">
        <Tabla cabeza={["Día", "Impr.", "Clics", "Gasto", "Cuota"]} filas={[...dias].reverse().map((x) => [
          diaCorto(x.fecha), entero(x.impresiones), entero(x.clics), usd(Number(x.costo)), x.cuota_impresiones != null ? `${Math.round(x.cuota_impresiones * 100)}%` : "—",
        ])} />
      </Tarjeta>
    </section>
  );
}

// Avisos en palabras a partir de los datos (sin inventar lo que no se mide).
function avisos(d: Datos): { tono: "rojo" | "amarillo" | "info"; texto: string }[] {
  const r = d.resumen; const out: { tono: "rojo" | "amarillo" | "info"; texto: string }[] = [];
  const gratis = d.terminos.filter((t) => esGratis(t.termino));
  const vGratis = gratis.reduce((a, t) => a + t.visitas, 0);
  if (vGratis > 0) out.push({ tono: gratis.some((t) => t.ventas > 0) ? "info" : "rojo", texto: `${vGratis} de ${r.visitas} visitas buscaron algo "gratis" (${gratis.map((t) => `«${t.termino}»`).join(", ")}). Desde el 5/11 "gratis" es palabra negativa: las que siguen en la lista son de antes.` });
  if (r.checkout >= 3 && r.empezaron_form === 0) out.push({ tono: "amarillo", texto: `${r.checkout} visitas llegaron al checkout y ninguna empezó el formulario.` });
  if (r.visitas > 0 && d.terminos.length === 0) out.push({ tono: "info", texto: "No llegan los términos de búsqueda: agregá en la campaña el sufijo de URL final con utm_term={keyword}." });
  if (!d.medicion.compra) out.push({ tono: "info", texto: "Hasta activar la medición, Google no sabe qué clics terminaron en compra y optimiza a ciegas." });
  return out;
}
const TONO = { rojo: "border-red-900/70 bg-red-950/30 text-red-200", amarillo: "border-amber-900/60 bg-amber-950/20 text-amber-200", info: "border-gray-800 bg-gray-900/60 text-gray-300" };

export default function GoogleAdsPage() {
  const [dias, setDias] = useState(14);
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch(`/api/admin/tarot/google-ads?dias=${dias}`);
      const j = (await r.json()) as Datos;
      if (!j.ok) throw new Error(j.motivo ?? "error");
      setD(j);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setCargando(false); }
  }, [dias]);
  useEffect(() => { cargar(); }, [cargar]);

  const r = d?.resumen;
  const embudo = r ? [
    ["Visitas", r.visitas], ["Vieron el producto", r.vieron_producto], ["Llegaron al checkout", r.checkout],
    ["Empezaron el formulario", r.empezaron_form], ["Fueron a pagar", r.fueron_a_pagar], ["Compraron", r.ventas],
  ] as [string, number][] : [];

  return (
    <TarotAdminShell>
      <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-gray-800 bg-[radial-gradient(ellipse_at_top_left,rgba(66,133,244,0.18),transparent_55%),linear-gradient(180deg,rgba(17,24,39,0.9),rgba(3,7,18,0.6))] px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">Anuncios · Búsqueda</p>
            <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-bold tracking-tight text-white"><Search size={20} className="text-sky-300" /> Google Ads</h1>
            <p className="mt-1 max-w-2xl text-xs text-gray-400">Cómo califica Google tu página, qué dice la cuenta (gasto, palabras, búsquedas) y qué hacen esas visitas en la web (checkout y ventas). Solo lectura.</p>
            {d && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {(d.cuenta?.campanas ?? []).map((k) => {
                  const bien = ["ELIGIBLE", "LEARNING"].includes(k.estado_principal);
                  return (
                    <span key={k.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${bien ? "border-emerald-800/70 bg-emerald-950/40 text-emerald-200" : "border-amber-800/60 bg-amber-950/30 text-amber-200"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${bien ? "bg-emerald-400" : "bg-amber-400"}`} />
                      {k.nombre} · {ESTADO_CAMPANA[k.estado_principal] ?? k.estado_principal}{k.motivos?.includes("MOST_ADS_UNDER_REVIEW") ? " (anuncio en revisión)" : ""}
                    </span>
                  );
                })}
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${d.medicion.compra ? "border-emerald-800/70 bg-emerald-950/40 text-emerald-200" : "border-red-900/70 bg-red-950/40 text-red-200"}`}>
                  {d.medicion.compra ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} {d.medicion.compra ? "Mide compras" : "No mide compras"}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white">
              {[7, 14, 30, 90].map((n) => <option key={n} value={n}>Últimos {n} días</option>)}
            </select>
            <button onClick={cargar} disabled={cargando} className="inline-flex items-center gap-1.5 rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50">
              <RefreshCw size={14} className={cargando ? "animate-spin" : ""} /> Actualizar
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800">
              {l.label} en Google Ads <ExternalLink size={11} />
            </a>
          ))}
        </div>

        {error && <p className="rounded border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200">No se pudieron cargar los datos ({error}).</p>}
        {!d && !error && <p className="text-sm text-gray-500">Cargando…</p>}

        {d && r && (
          <>
            <PaginaDestino destino={d.cuenta?.destino} alMedir={cargar} />
            <CuentaGoogle d={d} alLeer={cargar} />
            <div className="pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">Web</p>
              <p className="text-base font-semibold text-white">Lo que mide la web de esas visitas</p>
            </div>
            <Medicion d={d} />

            {avisos(d).map((a) => (
              <p key={a.texto} className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${TONO[a.tono]}`}>
                {a.tono === "info" ? <Info size={14} className="mt-px shrink-0" /> : <AlertTriangle size={14} className="mt-px shrink-0" />}{a.texto}
              </p>
            ))}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              {embudo.map(([t, n], i) => (
                <div key={t} className={`rounded-xl border p-4 ${i === embudo.length - 1 && n > 0 ? "border-emerald-900/70 bg-emerald-950/30" : "border-gray-800 bg-gradient-to-b from-gray-900/80 to-gray-950/60"}`}>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">{t}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight text-white tabular-nums">{entero(n)}</p>
                  {i > 0 && <p className="text-[11px] text-gray-500">{pct(n, r.visitas)} de las visitas</p>}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Ingresos: <span className="text-gray-200">$ {entero(r.ingresos)}</span> · Desde el celular: {pct(r.movil, r.visitas)} ·
              Última visita: {r.ultima_visita ? fechaHora(r.ultima_visita) : "—"} · Sin tráfico interno ni cortesías.
            </p>

            <Tarjeta titulo="Qué buscó la gente" extra={<span className="text-[11px] text-gray-500">término que activó el anuncio</span>}>
              <Tabla cabeza={["Búsqueda", "Visitas", "Checkout", "Compras"]} filas={d.terminos.map((t) => [
                <span key="t" className="inline-flex items-center gap-1.5">{t.termino}{esGratis(t.termino) && <span className="rounded-full border border-red-900/70 bg-red-950/40 px-1.5 text-[10px] text-red-300">gratis</span>}</span>,
                entero(t.visitas), entero(t.checkout), entero(t.ventas),
              ])} />
            </Tarjeta>

            <div className="grid gap-5 md:grid-cols-2">
              <Tarjeta titulo="Por día">
                <Tabla cabeza={["Día", "Visitas", "Checkout", "Compras"]} filas={[...d.por_dia].reverse().map((x) => [diaCorto(x.fecha), entero(x.visitas), entero(x.checkout), entero(x.ventas)])} />
              </Tarjeta>
              <div className="space-y-5">
                <Tarjeta titulo="Página de llegada">
                  <Tabla cabeza={["Página", "Visitas", "Checkout", "Compras"]} filas={d.landings.map((x) => [x.path, entero(x.visitas), entero(x.checkout), entero(x.ventas)])} />
                </Tarjeta>
                <Tarjeta titulo="Dispositivo">
                  <Tabla cabeza={["Dispositivo", "Visitas", "Checkout", "Compras"]} filas={d.dispositivos.map((x) => [x.dispositivo, entero(x.visitas), entero(x.checkout), entero(x.ventas)])} />
                </Tarjeta>
              </div>
            </div>

            <Tarjeta titulo="Cada visita" extra={<span className="text-[11px] text-gray-500">últimas 40 · hasta dónde llegó</span>}>
              <Tabla izquierda={5} cabeza={["Cuándo", "Búsqueda", "Llegó a", "Dispositivo", "Ciudad", "Etapa"]} filas={d.visitas.map((v) => [
                fechaHora(v.inicio), v.termino ?? "—", v.landing ?? "—", v.dispositivo ?? "—", v.ciudad ?? "—",
                <span key="e" className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ETAPA[v.etapa] ?? ""}`}>{v.etapa}</span>,
              ])} />
            </Tarjeta>

            <Tarjeta titulo="Comparado con las otras fuentes">
              <Tabla cabeza={["Fuente", "Visitas", "% al checkout", "Compras"]} filas={d.fuentes.map((f) => [
                <span key="f" className={f.fuente === "Google Ads" ? "font-semibold text-white" : ""}>{f.fuente}</span>,
                entero(f.visitas), pct(f.checkout, f.visitas), entero(f.ventas),
              ])} />
            </Tarjeta>
          </>
        )}
      </div>
    </TarotAdminShell>
  );
}
