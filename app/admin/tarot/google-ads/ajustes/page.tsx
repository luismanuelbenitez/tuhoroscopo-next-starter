"use client";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { MarcoGoogleAds } from "@/components/admin/googleAds/gobernanza/Marco";

// Google Ads · Ajustes (fase 3, 2026-11-14). Lo propio de cada negocio, sin
// tocar código: cuánto vale una venta, cuánto se acepta pagar por ella, a qué
// página llevan los anuncios, qué búsquedas bloquear y cuántos datos pide
// cada regla antes de opinar. Se guarda en tarot_configuracion
// (gobernanza_google_ads) y el motor lo usa en la próxima carga.

type Minimos = Record<string, number>;
interface Config { valor_venta: number; cpa_objetivo: number; paginas_destino: string[]; negativas_base: string[]; minimos: Minimos; lcp_max_ms: number }
interface Guardada { valor_venta?: number; cpa_objetivo?: number; paginas_destino?: string[]; negativas_extra?: string[]; no_negar?: string[]; minimos?: Minimos; lcp_max_ms?: number }

const MINIMOS: { k: string; t: string; ayuda: string }[] = [
  { k: "dias_tras_cambio", t: "Días a esperar después de un cambio", ayuda: "Antes de este plazo, el módulo dice «no toques»." },
  { k: "impresiones_tras_cambio", t: "Impresiones a esperar después de un cambio", ayuda: "También hace falta este volumen para juzgar el cambio." },
  { k: "ventas_para_cpa", t: "Ventas para confiar en el costo por venta", ayuda: "Con menos, el costo por venta va a «Esperar»." },
  { k: "impresiones_nota", t: "Impresiones para tomar en serio la nota de una palabra", ayuda: "Con menos, Google todavía no tiene opinión firme." },
  { k: "visitas_pagina", t: "Visitas para juzgar la página", ayuda: "Para decir si la página lleva (o no) al checkout." },
  { k: "llegadas_checkout", t: "Llegadas al checkout para juzgarlo", ayuda: "Para decir si el checkout pierde gente." },
  { k: "conversiones_amplia", t: "Compras en 30 días antes de usar concordancia amplia", ayuda: "Sin esto, la amplia trae búsquedas de cualquier cosa." },
];

const lineas = (s: string) => s.split(/\n/).map((x) => x.trim()).filter(Boolean);

function Campo({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[14px] font-medium text-white">{titulo}</span>
      {ayuda && <span className="mb-1.5 block text-[12px] text-gray-400">{ayuda}</span>}
      {children}
    </label>
  );
}
const input = "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-[15px] text-white placeholder:text-gray-600 focus:border-sky-500 focus:outline-none";

export default function GoogleAdsAjustes() {
  const [datos, setDatos] = useState<{ guardada: Guardada; precio: number; por_defecto: Config; efectiva: Config; universales: string[] } | null>(null);
  const [f, setF] = useState({ valor_venta: "", cpa_objetivo: "", paginas: "", extra: "", no_negar: "", lcp: "", minimos: {} as Record<string, string> });
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch("/api/admin/tarot/google-ads/gobernanza?vista=config").then((r) => r.json()).then((j) => {
      if (!j.ok) { setAviso({ ok: false, texto: j.motivo ?? "error" }); return; }
      setDatos(j);
      const g = j.guardada as Guardada;
      setF({
        valor_venta: g.valor_venta ? String(g.valor_venta) : "", cpa_objetivo: g.cpa_objetivo ? String(g.cpa_objetivo) : "",
        paginas: (g.paginas_destino ?? []).join("\n"), extra: (g.negativas_extra ?? []).join("\n"), no_negar: (g.no_negar ?? []).join("\n"),
        lcp: g.lcp_max_ms ? String(g.lcp_max_ms / 1000).replace(".", ",") : "",
        minimos: Object.fromEntries(Object.entries(g.minimos ?? {}).map(([k, v]) => [k, String(v)])),
      });
    }).catch((e) => setAviso({ ok: false, texto: e instanceof Error ? e.message : "error" }));
  }, []);

  const guardar = async () => {
    setGuardando(true); setAviso(null);
    const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(/\./g, "").replace(",", ".")));
    const config = {
      valor_venta: num(f.valor_venta), cpa_objetivo: num(f.cpa_objetivo),
      lcp_max_ms: f.lcp.trim() ? Math.round(Number(f.lcp.replace(",", ".")) * 1000) : undefined,
      paginas_destino: lineas(f.paginas), negativas_extra: lineas(f.extra), no_negar: lineas(f.no_negar),
      minimos: Object.fromEntries(Object.entries(f.minimos).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)])),
    };
    try {
      const j = await fetch("/api/admin/tarot/google-ads/gobernanza", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "guardar_config", config }) }).then((r) => r.json());
      setAviso(j.ok ? { ok: true, texto: "Guardado. El Resumen, el Diagnóstico y los Cambios ya usan estos ajustes." } : { ok: false, texto: j.motivo ?? "error" });
    } catch (e) { setAviso({ ok: false, texto: e instanceof Error ? e.message : "error" }); } finally { setGuardando(false); }
  };

  const pd = datos?.por_defecto;
  return (
    <MarcoGoogleAds bajada="Lo propio de tu negocio. El motor de reglas es el mismo para cualquier sitio: lo que cambia está acá. Los campos vacíos usan el valor por defecto.">
      {!datos && !aviso && <p className="text-sm text-gray-400">Cargando…</p>}
      {datos && pd && (
        <div className="space-y-5">
          <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 md:p-5">
            <h2 className="text-base font-semibold text-white">Plata</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Campo titulo="Valor de una venta ($)" ayuda={`Vacío = el precio actual ($ ${datos.precio.toLocaleString("es-UY")}).`}>
                <input inputMode="decimal" className={input} value={f.valor_venta} placeholder={String(pd.valor_venta)} onChange={(e) => setF({ ...f, valor_venta: e.target.value })} />
              </Campo>
              <Campo titulo="Costo objetivo por venta ($)" ayuda="Lo máximo que aceptás pagar en anuncios por una venta. Vacío = el valor de la venta (no perder plata).">
                <input inputMode="decimal" className={input} value={f.cpa_objetivo} placeholder={String(datos.efectiva.cpa_objetivo)} onChange={(e) => setF({ ...f, cpa_objetivo: e.target.value })} />
              </Campo>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 md:p-5">
            <h2 className="text-base font-semibold text-white">Página y búsquedas</h2>
            <Campo titulo="Páginas de destino acordadas" ayuda="Una por línea, como ruta (ej. /tarot). El módulo avisa si un anuncio lleva a otra.">
              <textarea rows={2} className={input} value={f.paginas} onChange={(e) => setF({ ...f, paginas: e.target.value })} />
            </Campo>
            <Campo titulo="Negativas propias de tu rubro" ayuda="Una por línea. Se suman a las universales de abajo.">
              <textarea rows={4} className={input} value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })} />
            </Campo>
            <Campo titulo="Palabras que en tu negocio SÍ venden" ayuda="Una por línea. Se sacan de las universales (ej. «trabajo»: «tarot trabajo» es una consulta, no alguien buscando empleo).">
              <textarea rows={3} className={input} value={f.no_negar} onChange={(e) => setF({ ...f, no_negar: e.target.value })} />
            </Campo>
            <div>
              <p className="text-[14px] font-medium text-white">Negativas universales</p>
              <p className="mb-1.5 text-[12px] text-gray-400">Búsquedas que casi nunca compran en ningún rubro. Vienen con el módulo.</p>
              <p className="flex flex-wrap gap-1.5">{datos.universales.map((u) => <span key={u} className="rounded-md bg-gray-950 px-2 py-1 text-[12px] text-gray-300">{u}</span>)}</p>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 md:p-5">
            <h2 className="text-base font-semibold text-white">Cuántos datos pide cada regla</h2>
            <p className="text-[13px] text-gray-400">Por debajo de estos mínimos el módulo no opina: manda el tema a «Esperar». Subirlos lo hace más prudente; bajarlos, más ansioso.</p>
            <div className="grid gap-4 md:grid-cols-2">
              {MINIMOS.map((x) => (
                <Campo key={x.k} titulo={x.t} ayuda={x.ayuda}>
                  <input inputMode="numeric" className={input} value={f.minimos[x.k] ?? ""} placeholder={String(pd.minimos[x.k])} onChange={(e) => setF({ ...f, minimos: { ...f.minimos, [x.k]: e.target.value } })} />
                </Campo>
              ))}
              <Campo titulo="Carga máxima en celular (segundos)" ayuda="Por encima, el módulo marca la página como lenta.">
                <input inputMode="decimal" className={input} value={f.lcp} placeholder={String(pd.lcp_max_ms / 1000).replace(".", ",")} onChange={(e) => setF({ ...f, lcp: e.target.value })} />
              </Campo>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={guardar} disabled={guardando} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-sky-500 px-5 text-[15px] font-semibold text-gray-950 hover:bg-sky-400 disabled:opacity-60">
              <Save size={16} /> {guardando ? "Guardando…" : "Guardar ajustes"}
            </button>
            <p className="text-[12px] text-gray-500">Guardar no cambia nada en Google Ads: solo cómo el módulo lee tu cuenta.</p>
          </div>
        </div>
      )}
      {aviso && <p className={`rounded-xl border px-3 py-2 text-[14px] ${aviso.ok ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-100" : "border-red-900/70 bg-red-950/30 text-red-100"}`}>{aviso.texto}</p>}
    </MarcoGoogleAds>
  );
}
