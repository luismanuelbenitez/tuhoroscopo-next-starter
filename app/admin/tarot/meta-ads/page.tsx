"use client";
import { useState, useEffect, useCallback, Fragment } from "react";
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, CircleDot, Info, Plug, RefreshCw, X } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { configEnPalabras } from "@/lib/metaAds/configEnPalabras";
import { estadoEs, estadoCuentaEs, ubicacionEs, type Aviso, type MetaObjeto, type MetaPanel } from "@/lib/metaAds/diagnostico";

// Meta Ads (2026-11-02). Panel de SOLO LECTURA de la cuenta publicitaria:
// estado en palabras, avisos, gasto contra visitas y ventas reales, ubicaciones,
// por hora, configuración completa de cada campaña / conjunto / anuncio y
// cambios detectados. Nada de esta página puede modificar los anuncios.

interface CampanaLista { id: string; nombre: string | null; estado: string | null; estado_efectivo: string | null; utm_campaign: string | null; inicio: string | null; fin: string | null; gasto_total: number; primer_dia: string | null; ultimo_dia: string | null }
type Datos = MetaPanel & {
  ok: boolean; configurado: boolean; avisos: Aviso[];
  campana_elegida: string; dias_periodo: number; campanas: CampanaLista[];
  semaforo: { gravedad: string; titulo: string; detalle: string };
};

const SEMAFORO: Record<string, string> = {
  rojo: "border-red-900/70 bg-red-950/40 text-red-200",
  naranja: "border-amber-900/70 bg-amber-950/30 text-amber-200",
  amarillo: "border-yellow-900/60 bg-yellow-950/20 text-yellow-200",
  verde: "border-emerald-900/70 bg-emerald-950/40 text-emerald-200",
  gris: "border-gray-800 bg-gray-900/60 text-gray-300",
};
const PUNTO: Record<string, string> = { rojo: "text-red-400", naranja: "text-amber-400", amarillo: "text-yellow-400", verde: "text-emerald-400", gris: "text-gray-500" };

const plata = (n: number | null | undefined, moneda: string | null | undefined) =>
  n == null ? "—" : `${moneda === "USD" ? "US$" : "$"} ${Math.round(n).toLocaleString("es-UY")}`;
const entero = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("es-UY"));
const hace = (s: string | null | undefined) => {
  if (!s) return "nunca";
  const min = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  return min < 1 ? "recién" : min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} d`;
};
const fechaCorta = (s: string) => new Date(s).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: "America/Montevideo" });
const diaCorto = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

function estadoClase(ef: string | null) {
  if (ef === "ACTIVE") return "text-emerald-300 border-emerald-900/70 bg-emerald-950/40";
  if (["DISAPPROVED", "WITH_ISSUES", "PENDING_BILLING_INFO"].includes(ef ?? "")) return "text-red-300 border-red-900/70 bg-red-950/40";
  if (["IN_PROCESS", "PENDING_REVIEW", "PREAPPROVED"].includes(ef ?? "")) return "text-amber-300 border-amber-900/70 bg-amber-950/30";
  return "text-gray-400 border-gray-700 bg-gray-900";
}
const Estado = ({ ef }: { ef: string | null }) => (
  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${estadoClase(ef)}`}>{estadoEs(ef)}</span>
);

function Tarjeta({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
      <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-white">{titulo}</p>{extra}</div>
      {children}
    </div>
  );
}

// ── Sin conectar ────────────────────────────────────────────────────────────
function SinConectar() {
  const pasos = [
    "En business.facebook.com → Configuración del negocio → Usuarios → Usuarios del sistema: crear «Panel Tu Oráculo» con rol Empleado.",
    "Asignarle la cuenta publicitaria con permiso solo de ver rendimiento (no administrar).",
    "Asignarle la app (la misma de WhatsApp) y generar la clave marcando solo el permiso ads_read.",
    "Cargar en Vercel META_ADS_TOKEN (la clave) y META_ADS_ACCOUNT_ID (el número act_…). También CRON_SECRET.",
    "Volver acá y tocar «Actualizar ahora» con 60 días para la primera carga.",
  ];
  return (
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-200"><Plug size={15} /> Falta conectar la cuenta de Meta</p>
      <p className="mt-1 text-xs text-gray-400">La conexión es de solo lectura: la clave no permite pausar, editar ni crear anuncios.</p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs text-gray-300">{pasos.map((p) => <li key={p}>{p}</li>)}</ol>
    </div>
  );
}

// ── Detalle de un objeto (configuración completa) ───────────────────────────
function Detalle({ id, moneda, onCerrar }: { id: string; moneda: string | null; onCerrar: () => void }) {
  const [d, setD] = useState<{ objeto: (MetaObjeto & { config: Record<string, unknown> }) | null; cambios: { id: number; tipo: string; detectado_at: string; antes: unknown; despues: unknown }[] } | null>(null);
  const [crudo, setCrudo] = useState(false);
  useEffect(() => { fetch(`/api/admin/tarot/meta-ads?objeto=${id}`).then((r) => r.json()).then(setD).catch(() => setD(null)); }, [id]);
  const o = d?.objeto;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onCerrar}>
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-gray-800 bg-gray-950 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-500">{o?.nivel === "campana" ? "Campaña" : o?.nivel === "conjunto" ? "Conjunto de anuncios" : "Anuncio"}</p>
            <p className="text-base font-semibold text-white">{o?.nombre ?? "Cargando…"}</p>
            {o && <p className="mt-1 text-[11px] text-gray-500">ID {o.id} · <Estado ef={o.estado_efectivo} /></p>}
          </div>
          <button onClick={onCerrar} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>
        {o && (
          <>
            <dl className="mt-5 divide-y divide-gray-800/70 rounded-lg border border-gray-800">
              {configEnPalabras(o.nivel, o.config, moneda).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[170px_1fr] gap-3 px-3 py-2 text-xs">
                  <dt className="text-gray-500">{k}</dt>
                  <dd className="break-words text-gray-200">{v.startsWith("http") ? <a href={v} target="_blank" rel="noreferrer" className="text-sky-300 underline">{v}</a> : v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-sm font-semibold text-white">Historial</p>
            <ul className="mt-2 space-y-1.5 text-xs">
              {(d?.cambios ?? []).map((c) => (
                <li key={c.id} className="text-gray-400">
                  <span className="text-gray-500">{new Date(c.detectado_at).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" })}</span>{" "}
                  {c.tipo === "nuevo" ? "Detectado por primera vez" : c.tipo === "estado"
                    ? <>Estado: {estadoEs((c.antes as { estado_efectivo?: string })?.estado_efectivo ?? null)} → <span className="text-gray-200">{estadoEs((c.despues as { estado_efectivo?: string })?.estado_efectivo ?? null)}</span></>
                    : "Se modificó la configuración"}
                </li>
              ))}
              {!d?.cambios?.length && <li className="text-gray-600">Sin cambios registrados.</li>}
            </ul>
            <button onClick={() => setCrudo(!crudo)} className="mt-6 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
              {crudo ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Configuración completa (tal como la da Meta)
            </button>
            {crudo && <pre className="mt-2 max-h-[50vh] overflow-auto rounded-lg border border-gray-800 bg-black/50 p-3 text-[10.5px] leading-relaxed text-gray-300">{JSON.stringify(o.config, null, 2)}</pre>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function MetaAdsPage() {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [diasSync, setDiasSync] = useState(3);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  // Campaña a mirar (2026-11-04): null = la que elija el servidor (la activa
  // más reciente); "todas" = toda la cuenta como antes.
  const [campana, setCampana] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const q = campana ? `?campana=${encodeURIComponent(campana)}` : "";
    const r = await fetch(`/api/admin/tarot/meta-ads${q}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setD(r); setError(null); } else setError(r?.detalle ?? r?.motivo ?? "No se pudieron cargar los datos.");
  }, [campana]);
  useEffect(() => { cargar(); }, [cargar]);

  async function sincronizar() {
    setSincronizando(true); setError(null);
    const r = await fetch("/api/admin/tarot/meta-ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "sincronizar", dias: diasSync }) })
      .then((x) => x.json()).catch(() => null);
    setSincronizando(false);
    if (!r?.ok) setError(r?.motivo === "sin_configurar" ? `Falta configurar Meta en Vercel: ${r.detalle ?? "clave o número de cuenta"}.` : r?.motivo ?? "Falló la sincronización.");
    cargar();
  }

  const moneda = d?.cuenta?.moneda ?? null;
  const campanas = d?.objetos.filter((o) => o.nivel === "campana") ?? [];
  const hijos = (nivel: string, padre: string) => d?.objetos.filter((o) => o.nivel === nivel && (nivel === "conjunto" ? o.campana_id === padre : o.conjunto_id === padre)) ?? [];
  const porAnuncio = new Map((d?.por_anuncio ?? []).map((a) => [a.anuncio_id, a]));
  const t = (d?.dias ?? []).reduce((s, x) => ({ gasto: s.gasto + x.gasto, clics: s.clics + x.clics_enlace, vistas: s.vistas + x.vistas_pagina, visitas: s.visitas + x.visitas, ventas: s.ventas + x.ventas, compras_meta: s.compras_meta + x.compras_meta, ingresos: s.ingresos + x.ingresos }),
    { gasto: 0, clics: 0, vistas: 0, visitas: 0, ventas: 0, compras_meta: 0, ingresos: 0 });
  const maxGasto = Math.max(1, ...(d?.dias ?? []).map((x) => x.gasto));
  const gastoUbic = (d?.ubicaciones ?? []).reduce((s, u) => s + u.gasto, 0);

  return (
    <TarotAdminShell>
      <div className="p-6 max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Meta Ads</h1>
            <p className="text-xs text-gray-500">Solo lectura · {d?.cuenta ? <>{d.cuenta.nombre} ({d.cuenta.id}) · datos {hace(d.ultimo_sync_ok)}</> : "sin datos todavía"}</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={diasSync} onChange={(e) => setDiasSync(Number(e.target.value))} className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200">
              <option value={3}>Últimos 3 días</option><option value={14}>Últimos 14 días</option><option value={60}>Últimos 60 días</option>
            </select>
            <button onClick={sincronizar} disabled={sincronizando} className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-gray-500 disabled:opacity-50">
              <RefreshCw size={13} className={sincronizando ? "animate-spin" : ""} /> {sincronizando ? "Leyendo Meta…" : "Actualizar ahora"}
            </button>
          </div>
        </div>

        {d && (d.campanas?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
            <span className="text-xs text-gray-400">Campaña:</span>
            <select value={d.campana_elegida} onChange={(e) => setCampana(e.target.value)} className="min-w-0 max-w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white">
              {d.campanas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre ?? c.id} · {estadoEs(c.estado_efectivo)}{c.inicio ? ` · desde ${fechaCorta(c.inicio)}` : ""}{c.gasto_total ? ` · gastó ${plata(c.gasto_total, d.cuenta?.moneda)}` : ""}
                </option>
              ))}
              <option value="todas">Todas las campañas de la cuenta</option>
            </select>
            <span className="text-[11px] text-gray-500">
              {d.campana_elegida === "todas" ? `Toda la cuenta · últimos ${d.dias_periodo} días` : `Solo esta campaña · desde que empezó (${d.dias_periodo} ${d.dias_periodo === 1 ? "día" : "días"})`}
            </span>
          </div>
        )}

        {error && <p className="flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-200"><AlertCircle size={14} /> {error}</p>}
        {d && !d.configurado && <SinConectar />}

        {d && (
          <>
            <div className={`rounded-xl border p-5 ${SEMAFORO[d.semaforo.gravedad] ?? SEMAFORO.gris}`}>
              <p className="flex items-center gap-2 text-base font-semibold"><CircleDot size={16} className={PUNTO[d.semaforo.gravedad]} /> {d.semaforo.titulo}</p>
              <p className="mt-1 text-xs opacity-80">{d.semaforo.detalle}</p>
              {d.cuenta && (
                <p className="mt-3 text-[11px] opacity-70">
                  Cuenta: {estadoCuentaEs(d.cuenta.estado)} · gastado en total {plata(d.cuenta.gastado_total, moneda)}
                  {d.cuenta.limite_gasto ? ` de un límite de ${plata(d.cuenta.limite_gasto, moneda)}` : ""} · saldo pendiente {plata(d.cuenta.saldo, moneda)}
                </p>
              )}
            </div>

            {d.avisos.length > 0 && (
              <Tarjeta titulo={`Avisos (${d.avisos.length})`}>
                <ul className="space-y-2">
                  {d.avisos.map((a, i) => (
                    <li key={i} className="flex gap-2 text-xs">
                      <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${PUNTO[a.gravedad]}`} />
                      <div>
                        <p className="font-semibold text-gray-200">{a.titulo}{a.objeto_id && <button onClick={() => setDetalle(a.objeto_id!)} className="ml-2 text-[11px] font-normal text-sky-300 underline">ver</button>}</p>
                        <p className="text-gray-500">{a.detalle}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              {[
                [d.campana_elegida === "todas" ? `Gasto (${d.dias_periodo} días)` : "Gasto de la campaña", plata(t.gasto, moneda)],
                ["Clics al enlace", entero(t.clics)],
                ["Visitas registradas", entero(t.visitas)],
                ["Ventas reales", entero(t.ventas)],
                ["Costo por venta real", t.ventas ? plata(t.gasto / t.ventas, moneda) : "—"],
                ["Compras según Meta", entero(t.compras_meta)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                  <p className="text-[11px] text-gray-500">{k}</p><p className="mt-1 text-lg font-semibold text-white">{v}</p>
                </div>
              ))}
            </div>
            {t.clics > 0 && (
              <p className="-mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
                <Info size={12} /> De cada 100 clics que cobra Meta, a la web llegan {Math.round((t.visitas / t.clics) * 100)}. Ventas reales = pagadas en Mercado Pago desde visitas de estas campañas; Meta atribuye distinto (hasta 7 días después del clic).
              </p>
            )}

            <Tarjeta titulo="Campañas, conjuntos y anuncios">
              {campanas.length === 0 && <p className="text-xs text-gray-500">Sin campañas sincronizadas.</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-[11px] text-gray-500">
                    <tr><th className="py-1.5 font-medium">Nombre</th><th className="font-medium">Entrega</th><th className="font-medium">Presupuesto</th><th className="font-medium">Restante</th><th className="font-medium">Fin</th><th className="text-right font-medium">Gasto 14 d</th><th className="text-right font-medium">Clics</th><th className="text-right font-medium">Frec.</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/70">
                    {campanas.map((c) => (
                      <Fragment key={c.id}>
                        <Fila o={c} moneda={moneda} sangria={0} abierto={abiertos[c.id] !== false} onToggle={() => setAbiertos({ ...abiertos, [c.id]: abiertos[c.id] === false })} onVer={() => setDetalle(c.id)} />
                        {abiertos[c.id] !== false && hijos("conjunto", c.id).map((s) => (
                          <Fragment key={s.id}>
                            <Fila o={s} moneda={moneda} sangria={1} onVer={() => setDetalle(s.id)} />
                            {hijos("anuncio", s.id).map((a) => <Fila key={a.id} o={a} moneda={moneda} sangria={2} rend={porAnuncio.get(a.id)} onVer={() => setDetalle(a.id)} />)}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>

            <Tarjeta titulo="Día por día: lo que cobra Meta contra lo que pasa en la web">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-[11px] text-gray-500">
                    <tr><th className="py-1.5 font-medium">Día</th><th className="font-medium w-1/3">Gasto</th><th className="text-right font-medium">Impresiones</th><th className="text-right font-medium">Clics</th><th className="text-right font-medium">Visitas web</th><th className="text-right font-medium">Checkout</th><th className="text-right font-medium">Ventas</th><th className="text-right font-medium">Compras Meta</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/70 text-gray-300">
                    {[...(d.dias ?? [])].reverse().map((x) => (
                      <tr key={x.fecha}>
                        <td className="py-1.5 text-gray-400">{diaCorto(x.fecha)}</td>
                        <td><div className="flex items-center gap-2"><div className="h-2 rounded-sm bg-sky-500/70" style={{ width: `${(x.gasto / maxGasto) * 70}%` }} /><span>{plata(x.gasto, moneda)}</span></div></td>
                        <td className="text-right">{entero(x.impresiones)}</td><td className="text-right">{entero(x.clics_enlace)}</td>
                        <td className="text-right">{entero(x.visitas)}</td><td className="text-right">{entero(x.checkout)}</td>
                        <td className="text-right font-semibold text-white">{entero(x.ventas)}</td><td className="text-right text-gray-500">{entero(x.compras_meta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>

            <div className="grid gap-5 md:grid-cols-2">
              <Tarjeta titulo="¿Dónde se mostró?">
                {!d.ubicaciones.length && <p className="text-xs text-gray-500">Sin datos.</p>}
                <ul className="space-y-1.5 text-xs">
                  {d.ubicaciones.map((u) => (
                    <li key={u.ubicacion} className={u.ubicacion.startsWith("audience_network") ? "text-amber-300" : "text-gray-300"}>
                      <div className="flex justify-between gap-2"><span>{ubicacionEs(u.ubicacion)}</span><span>{plata(u.gasto, moneda)} · {entero(u.clics_enlace)} clics</span></div>
                      <div className="mt-0.5 h-1.5 rounded-sm bg-gray-800"><div className={`h-1.5 rounded-sm ${u.ubicacion.startsWith("audience_network") ? "bg-amber-500/80" : "bg-sky-500/70"}`} style={{ width: `${gastoUbic ? (u.gasto / gastoUbic) * 100 : 0}%` }} /></div>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
              <Tarjeta titulo="Por hora (hoy y ayer, toda la cuenta: Meta no lo separa por campaña)">
                <Horas horas={d.horas} moneda={moneda} />
              </Tarjeta>
            </div>

            <Tarjeta titulo="Cambios detectados">
              <ul className="space-y-1.5 text-xs">
                {d.cambios.map((c) => (
                  <li key={c.id} className="text-gray-400">
                    <span className="text-gray-500">{new Date(c.detectado_at).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" })}</span>{" "}
                    <button onClick={() => setDetalle(c.objeto_id)} className="text-gray-200 hover:underline">{c.nombre}</button>:{" "}
                    {c.tipo === "nuevo" ? "apareció" : c.tipo === "estado" ? `${estadoEs(c.antes?.estado_efectivo ?? null)} → ${estadoEs(c.despues?.estado_efectivo ?? null)}` : "cambió la configuración"}
                  </li>
                ))}
                {!d.cambios.length && <li className="text-gray-600">Todavía no hay cambios registrados.</li>}
              </ul>
            </Tarjeta>
          </>
        )}
      </div>
      {detalle && <Detalle id={detalle} moneda={moneda} onCerrar={() => setDetalle(null)} />}
    </TarotAdminShell>
  );
}

function Fila({ o, moneda, sangria, rend, abierto, onToggle, onVer }: {
  o: MetaObjeto; moneda: string | null; sangria: number; rend?: { gasto: number; clics_enlace: number; frecuencia_max: number | null };
  abierto?: boolean; onToggle?: () => void; onVer: () => void;
}) {
  const presupuesto = o.presupuesto_diario ? `${plata(o.presupuesto_diario, moneda)}/día` : o.presupuesto_total ? `${plata(o.presupuesto_total, moneda)} total` : "—";
  return (
    <tr className={sangria === 0 ? "text-gray-100" : "text-gray-300"}>
      <td className="py-2" style={{ paddingLeft: sangria * 18 }}>
        <span className="inline-flex items-center gap-1">
          {onToggle && <button onClick={onToggle} className="text-gray-500">{abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>}
          <span className={sangria === 0 ? "font-semibold" : ""}>{o.nombre}</span>
        </span>
        {o.nivel === "anuncio" && o.utm_campaign && <span className="ml-2 text-[10px] text-gray-600">{o.utm_campaign}</span>}
      </td>
      <td><Estado ef={o.estado_efectivo} /></td>
      <td>{o.nivel === "anuncio" ? "" : presupuesto}</td>
      <td>{o.presupuesto_total ? plata(o.presupuesto_restante, moneda) : ""}</td>
      <td>{o.fin ? new Date(o.fin).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" }) : ""}</td>
      <td className="text-right">{rend ? plata(rend.gasto, moneda) : ""}</td>
      <td className="text-right">{rend ? entero(rend.clics_enlace) : ""}</td>
      <td className="text-right">{rend?.frecuencia_max ? rend.frecuencia_max.toFixed(1) : ""}</td>
      <td className="text-right"><button onClick={onVer} className="text-[11px] text-sky-300 hover:underline">configuración</button></td>
    </tr>
  );
}

function Horas({ horas, moneda }: { horas: MetaPanel["horas"]; moneda: string | null }) {
  const fechas = [...new Set(horas.map((h) => String(h.fecha).slice(0, 10)))].sort();
  if (!fechas.length) return <p className="text-xs text-gray-500">Sin datos.</p>;
  const max = Math.max(1, ...horas.map((h) => h.gasto));
  return (
    <div className="space-y-3">
      {fechas.map((f) => (
        <div key={f}>
          <p className="mb-1 text-[11px] text-gray-500">{diaCorto(f)} · {plata(horas.filter((h) => String(h.fecha).slice(0, 10) === f).reduce((s, h) => s + h.gasto, 0), moneda)}</p>
          <div className="flex h-14 items-end gap-[2px]">
            {Array.from({ length: 24 }, (_, i) => {
              const h = horas.find((x) => String(x.fecha).slice(0, 10) === f && x.hora === i);
              return <div key={i} title={`${i}:00 · ${plata(h?.gasto ?? 0, moneda)} · ${h?.clics_enlace ?? 0} clics`} className="flex-1 rounded-t-sm bg-sky-500/70" style={{ height: `${Math.max(((h?.gasto ?? 0) / max) * 100, h?.gasto ? 4 : 1)}%`, opacity: h?.gasto ? 1 : 0.25 }} />;
            })}
          </div>
          <div className="mt-0.5 flex justify-between text-[9px] text-gray-600"><span>0 h</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
        </div>
      ))}
    </div>
  );
}
