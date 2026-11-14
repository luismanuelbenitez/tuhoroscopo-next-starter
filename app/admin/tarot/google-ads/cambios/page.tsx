"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { MarcoGoogleAds } from "@/components/admin/googleAds/gobernanza/Marco";
import { useGobernanza, fechaCorta } from "@/components/admin/googleAds/gobernanza/datos";
import type { Propuesta } from "@/lib/gobernanzaAds/propuestas";

// Google Ads · Cambios (fase 2, 2026-11-14). Las propuestas del diagnóstico
// que se pueden aplicar con un botón: primero Google las revisa sin aplicar
// nada, después se confirma. Cada cambio queda registrado y se puede deshacer.
// REGLA MÁXIMA (14/11): solo cambios que no suben el gasto (negativas y
// pausar palabras); el guardia está en lib/googleAdsApi/escritura.ts.

interface Accion { id: number; propuesta_id: string; titulo: string; items: { clave: string; texto: string }[]; estado: string; error: string | null; en_espera: boolean; created_at: string; deshecha_at: string | null }

const cuando = (s: string) => new Date(s).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" });

async function post(cuerpo: Record<string, unknown>) {
  const r = await fetch("/api/admin/tarot/google-ads/gobernanza", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  return r.json();
}

function TarjetaPropuesta({ p, enEspera, motivoEspera, alAplicar }: { p: Propuesta; enEspera: boolean; motivoEspera: string; alAplicar: () => void }) {
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(p.items.map((i) => i.clave)));
  const [acepto, setAcepto] = useState(false);
  const [fase, setFase] = useState<"elegir" | "validando" | "validada" | "aplicando" | "hecha">("elegir");
  const [aviso, setAviso] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);
  const [cambios, setCambios] = useState(0);
  const alternar = (c: string) => { setElegidas((prev) => { const s = new Set(prev); if (s.has(c)) s.delete(c); else s.add(c); return s; }); setFase("elegir"); setAviso(null); };
  const puede = elegidas.size > 0 && (!enEspera || acepto);

  const correr = async (modo: "validar" | "aplicar") => {
    setFase(modo === "validar" ? "validando" : "aplicando"); setAviso(null);
    try {
      const j = await post({ accion: modo, propuesta_id: p.id, claves: [...elegidas], acepto_espera: acepto });
      if (!j.ok) {
        setFase("elegir");
        setAviso({ tono: "mal", texto: j.motivo === "en_espera" ? `Estás en período de espera: ${j.detalle}` : j.motivo ?? "error" });
        return;
      }
      setCambios(j.cambios ?? 0);
      if (modo === "validar") { setFase("validada"); setAviso({ tono: "ok", texto: `Google revisó ${j.cambios} ${j.cambios === 1 ? "cambio" : "cambios"} y los acepta. Todavía no se aplicó nada.` }); }
      else { setFase("hecha"); setAviso({ tono: "ok", texto: `Listo: ${j.cambios} ${j.cambios === 1 ? "cambio aplicado" : "cambios aplicados"} en Google Ads (acción #${j.accion_id}). Se puede deshacer abajo.` }); alAplicar(); }
    } catch (e) { setFase("elegir"); setAviso({ tono: "mal", texto: e instanceof Error ? e.message : "error" }); }
  };

  return (
    <article className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 md:p-5">
      <h3 className="text-[15px] font-semibold text-white">{p.titulo}</h3>
      <p className="mt-1 text-[13px] text-gray-300">{p.porque}</p>
      <ul className="mt-3 space-y-1.5">
        {p.items.map((i) => (
          <li key={i.clave}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-gray-950/60 px-3 py-2.5">
              <input type="checkbox" checked={elegidas.has(i.clave)} onChange={() => alternar(i.clave)} disabled={fase === "aplicando" || fase === "hecha"} className="mt-0.5 h-4 w-4 shrink-0 accent-sky-400" />
              <span className="min-w-0">
                <span className="block text-[14px] text-gray-100">{i.texto}</span>
                {i.detalle && <span className="block break-words text-[12px] text-gray-400">{i.detalle}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {enEspera && fase !== "hecha" && (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-sky-900/60 bg-sky-950/30 px-3 py-2.5">
          <input type="checkbox" checked={acepto} onChange={(e) => { setAcepto(e.target.checked); setFase("elegir"); }} className="mt-0.5 h-4 w-4 shrink-0 accent-sky-400" />
          <span className="text-[13px] text-sky-100">Período de espera: {motivoEspera} Aplicar ahora mezcla los resultados. Quiero aplicar igual.</span>
        </label>
      )}
      {aviso && <p className={`mt-3 rounded-lg border px-3 py-2 text-[13px] ${aviso.tono === "ok" ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-100" : "border-red-900/70 bg-red-950/30 text-red-100"}`}>{aviso.texto}</p>}
      {fase !== "hecha" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => correr("validar")} disabled={!puede || fase === "validando" || fase === "aplicando"}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-600 px-4 text-[14px] font-medium text-white hover:bg-gray-800 disabled:opacity-40">
            <ShieldCheck size={16} /> {fase === "validando" ? "Revisando con Google…" : `Revisar ${elegidas.size} con Google`}
          </button>
          {fase === "validada" || fase === "aplicando" ? (
            <button onClick={() => correr("aplicar")} disabled={fase === "aplicando"}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-sky-500 px-4 text-[14px] font-semibold text-gray-950 hover:bg-sky-400 disabled:opacity-60">
              <CheckCircle2 size={16} /> {fase === "aplicando" ? "Aplicando…" : `Aplicar ${cambios} ${cambios === 1 ? "cambio" : "cambios"}`}
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}

function Acciones({ acciones, alDeshacer }: { acciones: Accion[]; alDeshacer: () => void }) {
  const [seguro, setSeguro] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const deshacer = async (id: number) => {
    setTrabajando(id); setAviso(null);
    try {
      const j = await post({ accion: "deshacer", id });
      setAviso(j.ok ? `Acción #${id} deshecha (${j.cambios} ${j.cambios === 1 ? "cambio revertido" : "cambios revertidos"}).` : `No se pudo deshacer: ${j.motivo}`);
      if (j.ok) alDeshacer();
    } finally { setTrabajando(null); setSeguro(null); }
  };
  if (!acciones.length) return <p className="text-[13px] text-gray-400">Todavía no se aplicó nada desde acá.</p>;
  return (
    <div className="space-y-2">
      {aviso && <p className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-[13px] text-gray-200">{aviso}</p>}
      {acciones.map((a) => (
        <div key={a.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-[14px] font-semibold text-white">#{a.id} · {a.titulo}</p>
            <p className="text-[12px] text-gray-400">{cuando(a.created_at)}</p>
          </div>
          <p className="mt-1 text-[13px] text-gray-300">{a.items.map((i) => i.texto).join(" · ")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${a.estado === "aplicada" ? "border-emerald-900/70 bg-emerald-950/40 text-emerald-200" : a.estado === "deshecha" ? "border-gray-700 bg-gray-900 text-gray-300" : "border-red-900/70 bg-red-950/40 text-red-200"}`}>
              {a.estado === "aplicada" ? "Aplicada" : a.estado === "deshecha" ? `Deshecha${a.deshecha_at ? ` el ${fechaCorta(a.deshecha_at)}` : ""}` : "Error"}
            </span>
            {a.en_espera && <span className="text-[12px] text-sky-300">aplicada durante un período de espera</span>}
            {a.error && <span className="text-[12px] text-red-300">{a.error}</span>}
            {a.estado === "aplicada" && (
              seguro === a.id ? (
                <button onClick={() => deshacer(a.id)} disabled={trabajando === a.id} className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-red-500/90 px-3 text-[13px] font-semibold text-white disabled:opacity-60">
                  <RotateCcw size={14} /> {trabajando === a.id ? "Deshaciendo…" : "Sí, deshacer"}
                </button>
              ) : (
                <button onClick={() => setSeguro(a.id)} className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-600 px-3 text-[13px] text-gray-100 hover:bg-gray-800">
                  <RotateCcw size={14} /> Deshacer
                </button>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GoogleAdsCambios() {
  const { d, error, cargando, cargar } = useGobernanza(14);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const cargarAcciones = useCallback(async () => {
    const j = await fetch("/api/admin/tarot/google-ads/gobernanza?vista=acciones").then((r) => r.json()).catch(() => null);
    if (j?.ok) setAcciones(j.acciones);
  }, []);
  useEffect(() => { cargarAcciones(); }, [cargarAcciones]);
  const refrescar = () => { cargar(); cargarAcciones(); };

  return (
    <MarcoGoogleAds
      bajada="Cambios listos para aplicar con un botón. Google los revisa primero sin aplicar nada; después confirmás. Todo se puede deshacer."
      extra={<button onClick={refrescar} disabled={cargando} aria-label="Actualizar" className="rounded-lg border border-gray-700 p-2 text-gray-200 hover:bg-gray-800 disabled:opacity-50"><RefreshCw size={16} className={cargando ? "animate-spin" : ""} /></button>}
    >
      <p className="flex items-start gap-2 rounded-xl border border-gray-800 bg-gray-900/50 p-3 text-[13px] text-gray-300">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-300" />
        Estos botones solo agregan palabras negativas y pausan palabras: nunca suben el gasto. Presupuesto, pujas, campañas y redes los cambiás vos en Google Ads.
      </p>
      {error && <p className="rounded-xl border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200">No se pudieron cargar los datos ({error}).</p>}
      {!d && !error && <p className="text-sm text-gray-400">Cargando…</p>}
      {d && (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-white">Para aplicar ({d.propuestas.length})</h2>
            {d.propuestas.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {d.propuestas.map((p) => <TarjetaPropuesta key={`${p.id}:${p.items.map((i) => i.clave).join(",")}`} p={p} enEspera={d.revision.esperar} motivoEspera={d.revision.motivo} alAplicar={refrescar} />)}
              </div>
            ) : <p className="rounded-xl border border-dashed border-gray-800 p-4 text-[13px] text-gray-400">No hay cambios con botón para hoy.</p>}
          </section>
          {d.manuales.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-base font-semibold text-white"><ClipboardList size={17} className="text-amber-300" /> Para hacer a mano ({d.manuales.length})</h2>
              <p className="text-[13px] text-gray-400">Cambios en anuncios, la página o el checkout: no tienen botón (los anuncios de tarot pasan por revisión legal de Google).</p>
              <ul className="space-y-2">
                {d.manuales.map((m) => (
                  <li key={m.hallazgo_id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5">
                    <p className="text-[14px] font-semibold text-white">{m.titulo}</p>
                    <p className="mt-1 text-[13px] text-gray-300">{m.accion}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">Aplicados desde acá</h2>
            <Acciones acciones={acciones} alDeshacer={refrescar} />
          </section>
        </>
      )}
    </MarcoGoogleAds>
  );
}
