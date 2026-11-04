"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, Info, RefreshCw } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Google Ads (2026-11-04). Panel de SOLO LECTURA de lo que la web mide de las
// visitas que llegan desde anuncios de Google: embudo, términos de búsqueda
// (vienen en el link del anuncio), páginas de llegada, dispositivos y
// recorrido de cada visita. Sin conexión a la cuenta de Google Ads: el gasto,
// las impresiones y los clics se ven allá (links abajo).

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
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
      <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-white">{titulo}</p>{extra}</div>
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

// Avisos en palabras a partir de los datos (sin inventar lo que no se mide).
function avisos(d: Datos): { tono: "rojo" | "amarillo" | "info"; texto: string }[] {
  const r = d.resumen; const out: { tono: "rojo" | "amarillo" | "info"; texto: string }[] = [];
  const gratis = d.terminos.filter((t) => esGratis(t.termino));
  const vGratis = gratis.reduce((a, t) => a + t.visitas, 0);
  if (vGratis > 0) out.push({ tono: gratis.some((t) => t.ventas > 0) ? "info" : "rojo", texto: `${vGratis} de ${r.visitas} visitas buscaron algo "gratis" (${gratis.map((t) => `«${t.termino}»`).join(", ")}). Conviene agregar "gratis" como palabra negativa: pagás clics de quien no quiere pagar.` });
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Google Ads</h1>
            <p className="mt-1 max-w-2xl text-xs text-gray-400">Lo que la web mide de las visitas que llegan desde anuncios de Google. Sin conexión a la cuenta: el gasto, las impresiones y los clics se ven en Google Ads.</p>
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
            <Medicion d={d} />

            {avisos(d).map((a) => (
              <p key={a.texto} className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${TONO[a.tono]}`}>
                {a.tono === "info" ? <Info size={14} className="mt-px shrink-0" /> : <AlertTriangle size={14} className="mt-px shrink-0" />}{a.texto}
              </p>
            ))}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              {embudo.map(([t, n], i) => (
                <div key={t} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                  <p className="text-[11px] text-gray-500">{t}</p>
                  <p className="mt-1 text-2xl font-bold text-white tabular-nums">{entero(n)}</p>
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
