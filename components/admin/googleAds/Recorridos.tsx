"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowRight, CheckCircle2, CircleDashed, ExternalLink, Megaphone, RefreshCw, Search, ShoppingCart, Sparkles, Globe } from "lucide-react";
import { MarcoGoogleAds, SelectorDias } from "@/components/admin/googleAds/gobernanza/Marco";

// Google Ads · Recorridos (2026-11-15, piloto "Tarot del amor"). Por cada
// intención de búsqueda, el camino completo y sus números:
//   búsquedas → anuncio → página → checkout → venta
// más los chequeos de punta a punta (que no compita con otro grupo, que el
// anuncio lleve a su página, que la página mida). Solo lectura.

type Palabra = { grupo: string; palabra: string; concordancia: string; estado: string; impresiones: number; clics: number; costo: number; nivel: number | null; ctr: string | null; anuncio: string | null; pagina: string | null };
type Chequeo = { id: string; texto: string; estado: "ok" | "falta" | "aviso"; detalle?: string };
type Recorrido = {
  clave: string; nombre: string; estado: "activo" | "piloto" | "en_armado"; pagina: string; tema: string | null; terminos: string | null;
  grupos: { nombre: string; estado: string }[];
  google: { impresiones: number; clics: number; costo: number; nivel: number | null; palabras: Palabra[]; anuncios: { grupo: string; estado: string; url: string | null; fuerza: string | null; titulos: string[] }[] };
  web: { visitas: number; tocaron_boton: number; checkout: number; empezaron_form: number; fueron_a_pagar: number; ventas: number; ingresos: number; temas_venta: Record<string, number> };
  compiten: Palabra[];
  chequeos: Chequeo[];
  listo: boolean;
};
type Datos = { ok: boolean; motivo?: string; dias: number; desde_google: string | null; hasta_google: string | null; lectura: string | null; recorridos: Recorrido[]; otras: { pagina: string; visitas: number; ventas: number }[] };

const entero = (n: number) => Math.round(n).toLocaleString("es-UY");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
const usd = (n: number) => `US$ ${n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaCorta = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : "—");
const COMPONENTE: Record<string, string> = { ABOVE_AVERAGE: "arriba del promedio", AVERAGE: "en el promedio", BELOW_AVERAGE: "abajo del promedio" };
const ESTADO_GRUPO: Record<string, string> = { ENABLED: "activo", PAUSED: "pausado", NO_EXISTE: "no existe" };

function Etapa({ icono: Icono, titulo, children, apagada = false }: { icono: typeof Search; titulo: string; children: React.ReactNode; apagada?: boolean }) {
  return (
    <div className={`min-w-0 flex-1 rounded-xl border p-3.5 ${apagada ? "border-dashed border-gray-700 bg-gray-950/40" : "border-gray-800 bg-gray-900/70"}`}>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300"><Icono size={13} /> {titulo}</p>
      <div className="space-y-1.5 text-[13px] text-gray-300">{children}</div>
    </div>
  );
}

function Flecha({ texto }: { texto?: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-1 text-[11px] text-gray-500 md:w-6 md:flex-col">
      <ArrowDown size={15} className="md:hidden" /><ArrowRight size={15} className="hidden md:block" />
      {texto && <span>{texto}</span>}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return <p className="flex items-baseline justify-between gap-2"><span className="text-gray-400">{etiqueta}</span><span className="font-semibold tabular-nums text-white">{valor}</span></p>;
}

function IconoChequeo({ estado }: { estado: Chequeo["estado"] }) {
  if (estado === "ok") return <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />;
  if (estado === "aviso") return <CircleDashed size={16} className="mt-0.5 shrink-0 text-amber-300" />;
  return <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />;
}

function TarjetaRecorrido({ r }: { r: Recorrido }) {
  // Una misma búsqueda puede estar en exacta y en frase: se muestra una vez.
  const activas = [...new Set(r.google.palabras.filter((p) => p.estado === "ENABLED").map((p) => p.palabra))];
  const grupoActivo = r.grupos.some((g) => g.estado === "ENABLED");
  const faltan = r.chequeos.filter((c) => c.estado !== "ok").length;
  const titulos = r.google.anuncios.find((a) => a.estado === "ENABLED")?.titulos ?? r.google.anuncios[0]?.titulos ?? [];
  return (
    <section className="rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-900/80 to-gray-950/60 p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold tracking-tight text-white">{r.nombre}</h2>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${r.estado === "piloto" ? "border-fuchsia-800 bg-fuchsia-950/40 text-fuchsia-200" : "border-sky-900 bg-sky-950/40 text-sky-200"}`}>
            {r.estado === "piloto" ? "Piloto" : r.estado === "activo" ? "Activo" : "En armado"}
          </span>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[12px] font-medium ${r.listo ? "border-emerald-900 bg-emerald-950/40 text-emerald-200" : "border-amber-900 bg-amber-950/30 text-amber-200"}`}>
          {r.listo ? "Listo de punta a punta" : `${faltan} paso${faltan === 1 ? "" : "s"} pendiente${faltan === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* El recorrido */}
      <div className="flex flex-col gap-1.5 md:flex-row md:items-stretch md:gap-0">
        <Etapa icono={Search} titulo="Búsquedas" apagada={!grupoActivo}>
          <p className="text-gray-400">{r.grupos.map((g) => `${g.nombre} (${ESTADO_GRUPO[g.estado] ?? g.estado})`).join(" · ")}</p>
          <div className="flex flex-wrap gap-1">
            {activas.slice(0, 5).map((p) => <span key={p} className="rounded-md bg-gray-800 px-1.5 py-0.5 text-[12px] text-gray-200">{p}</span>)}
            {activas.length > 5 && <span className="px-1 text-[12px] text-gray-500">+{activas.length - 5}</span>}
            {!activas.length && <span className="text-[12px] text-gray-500">Sin palabras activas</span>}
          </div>
          <Dato etiqueta="Apariciones (30 d)" valor={entero(r.google.impresiones)} />
          <Dato etiqueta="Clics" valor={entero(r.google.clics)} />
          <Dato etiqueta="Costo" valor={usd(r.google.costo)} />
        </Etapa>
        <Flecha />
        <Etapa icono={Megaphone} titulo="Anuncio" apagada={!grupoActivo}>
          {titulos.length ? <ul className="space-y-0.5">{titulos.slice(0, 3).map((t) => <li key={t} className="truncate text-[12.5px] text-gray-200">“{t}”</li>)}</ul> : <p className="text-gray-500">Sin anuncio</p>}
          {titulos.length > 3 && <p className="text-[12px] text-gray-500">y {titulos.length - 3} títulos más</p>}
          <Dato etiqueta="Nota de calidad" valor={r.google.nivel != null ? `${r.google.nivel}/10` : "—"} />
        </Etapa>
        <Flecha />
        <Etapa icono={Globe} titulo="Página">
          <a href={r.pagina} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-sky-300 hover:underline">{r.pagina} <ExternalLink size={12} /></a>
          <Dato etiqueta="Visitas de Google" valor={entero(r.web.visitas)} />
          <Dato etiqueta="Tocaron el botón" valor={`${entero(r.web.tocaron_boton)} · ${pct(r.web.tocaron_boton, r.web.visitas)}`} />
        </Etapa>
        <Flecha />
        <Etapa icono={ShoppingCart} titulo="Checkout">
          <p className="text-gray-400">{r.tema ? <>Llega con <span className="font-medium text-white">«{r.tema}»</span> elegido</> : "La persona elige el tema"}</p>
          <Dato etiqueta="Llegaron" valor={`${entero(r.web.checkout)} · ${pct(r.web.checkout, r.web.visitas)}`} />
          <Dato etiqueta="Empezaron el formulario" valor={entero(r.web.empezaron_form)} />
          <Dato etiqueta="Fueron a pagar" valor={entero(r.web.fueron_a_pagar)} />
        </Etapa>
        <Flecha />
        <Etapa icono={Sparkles} titulo="Venta">
          <Dato etiqueta="Ventas" valor={entero(r.web.ventas)} />
          <Dato etiqueta="Ingresos" valor={`$ ${entero(r.web.ingresos)}`} />
          <Dato etiqueta="De cada 100 visitas" valor={r.web.visitas ? (Math.round((r.web.ventas / r.web.visitas) * 1000) / 10).toLocaleString("es-UY") : "—"} />
          {Object.keys(r.web.temas_venta).length > 0 && <p className="text-[12px] text-gray-400">Temas: {Object.entries(r.web.temas_venta).map(([t, n]) => `${t} ${n}`).join(" · ")}</p>}
        </Etapa>
      </div>

      {/* Chequeos */}
      <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/50 p-3.5">
        <p className="mb-2 text-sm font-semibold text-white">Punta a punta</p>
        <ul className="space-y-2">
          {r.chequeos.map((c) => (
            <li key={c.id} className="flex gap-2 text-[13px]">
              <IconoChequeo estado={c.estado} />
              <span><span className={c.estado === "ok" ? "text-gray-200" : "font-medium text-white"}>{c.texto}</span>{c.detalle && <span className="block text-[12.5px] text-gray-400">{c.detalle}</span>}</span>
            </li>
          ))}
        </ul>
        {r.terminos && <p className="mt-3 text-[12px] text-gray-500">Búsquedas de este tema: las que dicen {r.terminos}.</p>}
      </div>

      {r.compiten.length > 0 && (
        <details className="mt-3 rounded-xl border border-amber-900/60 bg-amber-950/10 p-3.5">
          <summary className="cursor-pointer text-[13px] font-semibold text-amber-200">Palabras que compiten con {r.nombre.toLowerCase()} ({r.compiten.length})</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-gray-400"><th className="py-1 pr-3 font-medium">Palabra</th><th className="py-1 pr-3 font-medium">Está en</th><th className="py-1 text-right font-medium">Apariciones</th></tr></thead>
              <tbody>{r.compiten.map((p) => <tr key={`${p.grupo}${p.palabra}${p.concordancia}`} className="border-t border-gray-800"><td className="py-1.5 pr-3 text-gray-200">{p.palabra}</td><td className="py-1.5 pr-3 text-gray-400">{p.grupo}</td><td className="py-1.5 text-right tabular-nums text-gray-200">{entero(p.impresiones)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      )}

      <details className="mt-3 rounded-xl border border-gray-800 p-3.5">
        <summary className="cursor-pointer text-[13px] font-semibold text-gray-200">Palabras del grupo y su nota ({r.google.palabras.length})</summary>
        <div className="mt-2 overflow-x-auto">
          {r.google.palabras.length ? (
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead><tr className="text-left text-gray-400"><th className="py-1 pr-3 font-medium">Palabra</th><th className="py-1 pr-3 font-medium">Estado</th><th className="py-1 pr-3 text-right font-medium">Apar.</th><th className="py-1 pr-3 text-right font-medium">Clics</th><th className="py-1 pr-3 text-right font-medium">Nota</th><th className="py-1 font-medium">Página según Google</th></tr></thead>
              <tbody>
                {r.google.palabras.map((p) => (
                  <tr key={`${p.grupo}${p.palabra}${p.concordancia}`} className="border-t border-gray-800">
                    <td className="py-1.5 pr-3 text-gray-200">{p.palabra} <span className="text-gray-500">({p.concordancia === "EXACT" ? "exacta" : p.concordancia === "PHRASE" ? "frase" : "amplia"})</span></td>
                    <td className="py-1.5 pr-3 text-gray-400">{p.estado === "ENABLED" ? "activa" : p.estado === "PAUSED" ? "pausada" : p.estado.toLowerCase()}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-200">{entero(p.impresiones)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-200">{entero(p.clics)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-200">{p.nivel ?? "—"}</td>
                    <td className="py-1.5 text-gray-400">{p.pagina ? COMPONENTE[p.pagina] ?? p.pagina : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-[12.5px] text-gray-500">El grupo no tiene palabras.</p>}
        </div>
      </details>
    </section>
  );
}

export function Recorridos() {
  const [dias, setDias] = useState(30);
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch(`/api/admin/tarot/google-ads/recorridos?dias=${dias}`, { cache: "no-store" });
      const j = (await r.json()) as Datos;
      if (!r.ok || !j.ok) throw new Error(j.motivo ?? `HTTP ${r.status}`);
      setD(j);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setCargando(false);
  }, [dias]);
  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <MarcoGoogleAds
      bajada="Cada tema con su camino completo: lo que la gente busca, el anuncio que ve, la página donde cae y el checkout. Todos terminan en el mismo checkout."
      extra={
        <div className="flex items-center gap-2">
          <SelectorDias dias={dias} setDias={setDias} opciones={[7, 14, 30, 60]} />
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
          {d.recorridos.map((r) => <TarjetaRecorrido key={r.clave} r={r} />)}
          {d.otras.length > 0 && (
            <p className="text-[12.5px] text-gray-400">
              Visitas de Google que entraron por otras páginas: {d.otras.map((o) => `${o.pagina} (${o.visitas}${o.ventas ? `, ${o.ventas} venta${o.ventas === 1 ? "" : "s"}` : ""})`).join(" · ")}.
            </p>
          )}
          <p className="text-[12px] text-gray-500">
            Búsquedas, anuncio y nota: lo que informa Google de los últimos 30 días ({fechaCorta(d.desde_google)}–{fechaCorta(d.hasta_google)}). Página, checkout y venta: lo que midió la web en los últimos {d.dias} días, solo visitas de anuncios de Google.
          </p>
        </>
      )}
    </MarcoGoogleAds>
  );
}
