"use client";
import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Presupuesto (2026-10-31): resultado del negocio (últimos 30 días), punto de
// equilibrio, costo de adquisición (CAC) y la carga manual de costos fijos,
// gastos puntuales, publicidad y costos de referencia por venta.

interface Costo {
  id: string; nombre: string; categoria: string; tipo: "fijo" | "puntual"; monto: string | number; moneda: "USD" | "UYU";
  frecuencia: "mensual" | "anual" | null; fecha_desde: string; fecha_hasta: string | null; activo: boolean; notas: string | null;
}
interface Gasto { id: string; date: string; platform: string; utm_campaign: string | null; amount: string | number; currency: string | null; notes: string | null }
interface Plata {
  ventas: number; bruto: number; comision: number; neto: number; ia: number; audio: number; wa: number; queda: number;
  cortesias: number; costo_cortesias: number; fijos: number; puntuales: number; publicidad: number; resultado: number;
}
interface Resumen {
  tipo_cambio: { valor: number; estimado: boolean };
  fijos_mensuales: number; punto_equilibrio: number | null; margen_por_venta: number | null;
  actual: { plata: Plata; adquisicion: { clientes_nuevos: number; cac: number | null; retorno_por_peso: number | null; por_campana: { campana: string; gasto: number }[] } };
}
interface Datos { costos: Costo[]; publicidad: Gasto[]; config: { clave: string; valor: string }[]; resumen: Resumen }

const CATEGORIAS: Record<string, string> = {
  infraestructura: "Infraestructura", herramientas: "Herramientas", dominio: "Dominio", licencias: "Licencias", operativo: "Operativo", otros: "Otros",
};
const CONFIG_LABEL: Record<string, { label: string; ayuda: string; paso: string }> = {
  tipo_cambio_usd_uyu: { label: "Dólar (UYU por US$)", ayuda: "Para pasar a pesos los costos en dólares", paso: "0.01" },
  whatsapp_costo_por_mensaje_usd: { label: "WhatsApp por mensaje (US$)", ayuda: "Plantilla Marketing, Uruguay (~0,074 desde 1/10/2026)", paso: "0.0001" },
  tts_costo_por_1000_caracteres_usd: { label: "Audio por 1.000 caracteres (US$)", ayuda: "Voz de OpenAI (gpt-4o-mini-tts)", paso: "0.001" },
};

const pesos = (v: number) => `${v < 0 ? "−" : ""}$ ${Math.round(Math.abs(v)).toLocaleString("es-UY")}`;
const pesosFino = (v: number) => `$ ${v.toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const fecha = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

async function enviar(cuerpo: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch("/api/admin/tarot/presupuesto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const j = await r.json().catch(() => null);
    return r.ok && j?.ok ? null : (j?.detalle ?? j?.motivo ?? `Error ${r.status}`);
  } catch (e: unknown) {
    return e instanceof Error ? e.message : "Error de red";
  }
}

export default function TarotPresupuestoPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/tarot/presupuesto", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`);
      else { setDatos(j); setErrorMsg(null); }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (cuerpo: Record<string, unknown>) => {
    const err = await enviar(cuerpo);
    if (err) setErrorMsg(err); else await cargar();
    return err;
  };

  return (
    <TarotAdminShell>
      <main className="px-6 py-6 max-w-[1280px]">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-100">Presupuesto</h2>
          <p className="text-xs text-gray-500 mt-0.5">¿El negocio gana o pierde plata? Últimos 30 días, todas las ventas cobradas. Los costos por venta se calculan solos; lo demás se carga acá.</p>
        </div>
        {errorMsg && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" /> {errorMsg}
          </div>
        )}
        {!datos && !errorMsg && <p className="text-sm text-gray-500 animate-pulse">Cargando…</p>}
        {datos && (
          <div className="space-y-8">
            <Resultado r={datos.resumen} />
            <Referencias config={datos.config} accion={accion} />
            <TablaCostos titulo="Costos fijos" ayuda="Se reparten por día: un costo mensual de US$ 20 cuenta ~US$ 0,66 por día." tipo="fijo"
              costos={datos.costos.filter((c) => c.tipo === "fijo")} tc={datos.resumen.tipo_cambio.valor} accion={accion} />
            <TablaCostos titulo="Gastos puntuales" ayuda="Pagos de una sola vez (un diseño, una compra). Cuentan en el período de su fecha." tipo="puntual"
              costos={datos.costos.filter((c) => c.tipo === "puntual")} tc={datos.resumen.tipo_cambio.valor} accion={accion} />
            <TablaPublicidad gastos={datos.publicidad} accion={accion} />
          </div>
        )}
      </main>
    </TarotAdminShell>
  );
}

// ── Resultado, equilibrio y CAC ─────────────────────────────────────────────

function Resultado({ r }: { r: Resumen }) {
  const p = r.actual.plata, a = r.actual.adquisicion;
  const gana = p.resultado >= 0;
  const porCliente = a.cac != null && r.margen_por_venta != null ? r.margen_por_venta - a.cac : null;
  return (
    <section className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4 text-sm">
        <p className="text-[11px] uppercase tracking-wide text-amber-500/80 mb-2">Resultado · últimos 30 días</p>
        <Linea label={`Cobrado (${p.ventas} venta${p.ventas === 1 ? "" : "s"})`} valor={pesos(p.bruto)} />
        <Linea label="− Comisión Mercado Pago" valor={pesos(p.comision)} tenue />
        <Linea label="− Lectura con IA" valor={pesosFino(p.ia)} tenue />
        <Linea label="− Audio" valor={pesosFino(p.audio)} tenue />
        <Linea label="− WhatsApp" valor={pesosFino(p.wa)} tenue />
        <Linea label="= Te queda de las ventas" valor={pesos(p.queda)} borde />
        <Linea label={`− Cortesías regaladas (${p.cortesias})`} valor={pesosFino(p.costo_cortesias)} tenue />
        <Linea label="− Publicidad" valor={pesos(p.publicidad)} tenue />
        <Linea label="− Costos fijos (parte del período)" valor={pesos(p.fijos)} tenue />
        <Linea label="− Gastos puntuales" valor={pesos(p.puntuales)} tenue />
        <div className={`mt-2 flex justify-between rounded-lg px-3 py-2 font-semibold ${gana ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>
          <span>{gana ? "Ganancia" : "Pérdida"}</span><span className="tabular-nums">{pesos(p.resultado)}</span>
        </div>
        <p className="mt-2 text-[11px] text-gray-600">
          Dólar a {r.tipo_cambio.valor}{r.tipo_cambio.estimado ? " (estimado: cargalo abajo)" : ""}. Las cortesías y los costos fijos también cuentan.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
        <Cifra titulo="Punto de equilibrio" valor={r.punto_equilibrio != null ? `${r.punto_equilibrio} ventas por mes` : "—"}>
          {r.punto_equilibrio != null
            ? <>para cubrir {pesos(r.fijos_mensuales)} de costos fijos por mes, con lo que deja cada venta ({pesos(r.margen_por_venta ?? 0)})</>
            : <>costos fijos {pesos(r.fijos_mensuales)} por mes; falta al menos una venta para calcularlo</>}
        </Cifra>
        <Cifra titulo="Costo de adquisición (CAC)" valor={a.cac != null ? pesos(a.cac) : "—"}>
          {a.cac != null
            ? <>publicidad ÷ {a.clientes_nuevos} cliente{a.clientes_nuevos === 1 ? "" : "s"} nuevo{a.clientes_nuevos === 1 ? "" : "s"}</>
            : p.publicidad > 0 ? <>hubo publicidad ({pesos(p.publicidad)}) pero ningún cliente nuevo</> : <>cargá el gasto de publicidad para calcularlo</>}
        </Cifra>
        <Cifra titulo="Cada cliente nuevo te deja" valor={porCliente != null ? pesos(porCliente) : "—"} bueno={porCliente != null ? porCliente >= 0 : undefined}>
          {porCliente != null
            ? <>lo que deja la venta ({pesos(r.margen_por_venta ?? 0)}) menos lo que costó conseguirlo ({pesos(a.cac ?? 0)}). {porCliente < 0 ? "Hoy cada cliente nuevo te hace perder plata en la primera compra." : ""}</>
            : <>necesita publicidad cargada y al menos una venta</>}
        </Cifra>
        <Cifra titulo="Retorno de la publicidad" valor={a.retorno_por_peso != null ? `$ ${a.retorno_por_peso.toFixed(2)}` : "—"} bueno={a.retorno_por_peso != null ? a.retorno_por_peso >= 1 : undefined}>
          {a.retorno_por_peso != null ? <>vuelven por cada $ 1 invertido (en lo cobrado)</> : <>sin publicidad cargada en el período</>}
        </Cifra>
        {a.por_campana.length > 0 && (
          <div className="sm:col-span-2 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3 text-xs">
            <p className="text-[11px] text-gray-500 mb-1">Publicidad por campaña (30 días)</p>
            {a.por_campana.map((c) => <Linea key={c.campana} label={c.campana} valor={pesos(c.gasto)} />)}
          </div>
        )}
      </div>
    </section>
  );
}

function Linea({ label, valor, tenue, borde }: { label: string; valor: string; tenue?: boolean; borde?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${tenue ? "text-gray-500" : "text-gray-200"} ${borde ? "mt-1 border-t border-gray-800 pt-1.5 font-medium" : ""}`}>
      <span>{label}</span><span className="tabular-nums">{valor}</span>
    </div>
  );
}

function Cifra({ titulo, valor, children, bueno }: { titulo: string; valor: string; children: React.ReactNode; bueno?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <p className="text-[11px] text-gray-500">{titulo}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${bueno === undefined ? "text-white" : bueno ? "text-emerald-300" : "text-red-300"}`}>{valor}</p>
      <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">{children}</p>
    </div>
  );
}

// ── Costos de referencia por venta ──────────────────────────────────────────

function Referencias({ config, accion }: { config: { clave: string; valor: string }[]; accion: (c: Record<string, unknown>) => Promise<string | null> }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-100">Valores de referencia</h3>
      <p className="text-[11px] text-gray-500 mb-3">Con esto se calcula el costo de cada venta. La IA y la comisión de Mercado Pago se toman de lo real.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Object.entries(CONFIG_LABEL).map(([clave, info]) => (
          <CampoConfig key={clave} clave={clave} info={info} valor={config.find((c) => c.clave === clave)?.valor ?? ""} accion={accion} />
        ))}
      </div>
    </section>
  );
}

function CampoConfig({ clave, info, valor, accion }: { clave: string; info: { label: string; ayuda: string; paso: string }; valor: string; accion: (c: Record<string, unknown>) => Promise<string | null> }) {
  const [v, setV] = useState(valor);
  const [ok, setOk] = useState(false);
  useEffect(() => setV(valor), [valor]);
  const cambio = v !== valor && v.trim() !== "";
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <label className="text-[11px] text-gray-500">{info.label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input type="number" step={info.paso} min="0" value={v} onChange={(e) => { setV(e.target.value); setOk(false); }}
          placeholder="sin cargar" className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-white focus:border-amber-500 focus:outline-none" />
        {cambio && (
          <button onClick={async () => { if (!(await accion({ accion: "config", clave, valor: v }))) setOk(true); }}
            className="rounded-md border border-amber-700 bg-amber-900/40 px-2 py-1 text-xs text-amber-200 hover:bg-amber-800/50">Guardar</button>
        )}
        {ok && !cambio && <Check size={14} className="text-emerald-400" />}
      </div>
      <p className="mt-1 text-[11px] text-gray-600">{info.ayuda}</p>
    </div>
  );
}

// ── Costos fijos y puntuales ────────────────────────────────────────────────

type Borrador = Partial<Costo> & { monto?: string | number };

function TablaCostos({ titulo, ayuda, tipo, costos, tc, accion }: {
  titulo: string; ayuda: string; tipo: "fijo" | "puntual"; costos: Costo[]; tc: number;
  accion: (c: Record<string, unknown>) => Promise<string | null>;
}) {
  const [editando, setEditando] = useState<Borrador | null>(null);
  const nuevo = (): Borrador => ({ tipo, nombre: "", categoria: "otros", monto: "", moneda: "USD", frecuencia: tipo === "fijo" ? "mensual" : null, fecha_desde: hoy(), activo: true, notas: "" });
  const mensual = (c: Costo) => (Number(c.monto) || 0) * (c.moneda === "USD" ? tc : 1) / (c.frecuencia === "anual" ? 12 : 1);
  const totalMes = costos.filter((c) => c.activo).reduce((a, c) => a + mensual(c), 0);

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">{titulo}</h3>
          <p className="text-[11px] text-gray-500">{ayuda}</p>
        </div>
        <div className="flex items-center gap-3">
          {tipo === "fijo" && <span className="text-xs text-gray-400">Total activos: <span className="text-white font-semibold">{pesos(totalMes)}</span> por mes</span>}
          <button onClick={() => setEditando(nuevo())} className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:border-gray-500">
            <Plus size={12} /> Agregar
          </button>
        </div>
      </div>
      {editando && <FormCosto key={editando.id ?? "nuevo"} inicial={editando} onCancelar={() => setEditando(null)} onGuardar={async (b) => { if (!(await accion({ accion: "guardar_costo", ...b }))) setEditando(null); }} />}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-900 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Concepto</th>
              <th className="px-4 py-2 font-medium">Categoría</th>
              <th className="px-4 py-2 font-medium text-right">Monto</th>
              {tipo === "fijo" && <th className="px-4 py-2 font-medium text-right">Por mes en $</th>}
              <th className="px-4 py-2 font-medium">{tipo === "fijo" ? "Desde" : "Fecha"}</th>
              {tipo === "fijo" && <th className="px-4 py-2 font-medium">Estado</th>}
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {costos.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Nada cargado todavía.</td></tr>}
            {costos.map((c) => (
              <tr key={c.id} className={`border-t border-gray-800/60 ${c.activo ? "" : "opacity-50"}`}>
                <td className="px-4 py-2">
                  <p className="text-gray-100">{c.nombre}</p>
                  {c.notas && <p className="text-[11px] text-gray-500 max-w-[360px]">{c.notas}</p>}
                </td>
                <td className="px-4 py-2 text-gray-400">{CATEGORIAS[c.categoria] ?? c.categoria}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-200 whitespace-nowrap">
                  {c.moneda === "USD" ? "US$" : "$"} {Number(c.monto).toLocaleString("es-UY")}{c.frecuencia ? <span className="text-gray-500"> /{c.frecuencia === "anual" ? "año" : "mes"}</span> : null}
                </td>
                {tipo === "fijo" && <td className="px-4 py-2 text-right tabular-nums text-gray-300">{pesos(mensual(c))}</td>}
                <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{fecha(c.fecha_desde)}{c.fecha_hasta ? ` → ${fecha(c.fecha_hasta)}` : ""}</td>
                {tipo === "fijo" && (
                  <td className="px-4 py-2">
                    <button onClick={() => accion({ accion: "activar_costo", id: c.id, activo: !c.activo })}
                      className={`rounded-full px-2 py-0.5 text-[11px] border ${c.activo ? "border-emerald-800 text-emerald-300" : "border-gray-700 text-gray-500"}`}
                      title={c.activo ? "Tocá para pausarlo (deja de contar)" : "Tocá para activarlo"}>
                      {c.activo ? "Activo" : "Pausado"}
                    </button>
                  </td>
                )}
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => setEditando(c)} className="p-1 text-gray-500 hover:text-gray-200" title="Editar"><Pencil size={13} /></button>
                  <button onClick={() => { if (confirm(`¿Borrar "${c.nombre}"?`)) accion({ accion: "borrar_costo", id: c.id }); }} className="p-1 text-gray-500 hover:text-red-300" title="Borrar"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const inputCls = "rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-white focus:border-amber-500 focus:outline-none";

function FormCosto({ inicial, onCancelar, onGuardar }: { inicial: Borrador; onCancelar: () => void; onGuardar: (b: Borrador) => void }) {
  const [b, setB] = useState<Borrador>(inicial);
  const set = (k: keyof Borrador, v: unknown) => setB((x) => ({ ...x, [k]: v }));
  const fijo = b.tipo === "fijo";
  return (
    <div className="mb-3 rounded-xl border border-amber-900/50 bg-amber-950/10 px-4 py-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
        <Campo label="Concepto" className="col-span-2"><input className={`${inputCls} w-full`} value={b.nombre ?? ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Vercel Pro" /></Campo>
        <Campo label="Categoría">
          <select className={`${inputCls} w-full`} value={b.categoria ?? "otros"} onChange={(e) => set("categoria", e.target.value)}>
            {Object.entries(CATEGORIAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Campo>
        <Campo label="Monto">
          <div className="flex gap-1">
            <select className={inputCls} value={b.moneda ?? "USD"} onChange={(e) => set("moneda", e.target.value)}><option value="USD">US$</option><option value="UYU">$</option></select>
            <input type="number" min="0" step="0.01" className={`${inputCls} w-full`} value={b.monto ?? ""} onChange={(e) => set("monto", e.target.value)} />
          </div>
        </Campo>
        {fijo && (
          <Campo label="Cada">
            <select className={`${inputCls} w-full`} value={b.frecuencia ?? "mensual"} onChange={(e) => set("frecuencia", e.target.value)}><option value="mensual">Mes</option><option value="anual">Año</option></select>
          </Campo>
        )}
        <Campo label={fijo ? "Desde" : "Fecha"}><input type="date" className={`${inputCls} w-full`} value={b.fecha_desde ?? ""} onChange={(e) => set("fecha_desde", e.target.value)} /></Campo>
        {fijo && <Campo label="Hasta (opcional)"><input type="date" className={`${inputCls} w-full`} value={b.fecha_hasta ?? ""} onChange={(e) => set("fecha_hasta", e.target.value || null)} /></Campo>}
        <Campo label="Nota (opcional)" className="col-span-2 md:col-span-3"><input className={`${inputCls} w-full`} value={b.notas ?? ""} onChange={(e) => set("notas", e.target.value)} /></Campo>
        <div className="flex gap-2">
          <button onClick={() => onGuardar(b)} className="inline-flex items-center gap-1 rounded-md border border-amber-700 bg-amber-900/40 px-3 py-1 text-xs text-amber-200 hover:bg-amber-800/50"><Check size={12} /> Guardar</button>
          <button onClick={onCancelar} className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-400 hover:border-gray-500"><X size={12} /> Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] text-gray-500 mb-0.5">{label}</span>
      {children}
    </label>
  );
}

// ── Publicidad ──────────────────────────────────────────────────────────────

function TablaPublicidad({ gastos, accion }: { gastos: Gasto[]; accion: (c: Record<string, unknown>) => Promise<string | null> }) {
  const vacio = { date: hoy(), amount: "", currency: "USD", platform: "meta", utm_campaign: "", notes: "" };
  const [b, setB] = useState(vacio);
  const [abierto, setAbierto] = useState(false);
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">Publicidad</h3>
          <p className="text-[11px] text-gray-500">Cargá lo que gastaste (por semana o por día) y en qué campaña. Con esto salen el CAC y el retorno.</p>
        </div>
        <button onClick={() => setAbierto(true)} className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:border-gray-500">
          <Plus size={12} /> Cargar gasto
        </button>
      </div>
      {abierto && (
        <div className="mb-3 rounded-xl border border-amber-900/50 bg-amber-950/10 px-4 py-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <Campo label="Fecha"><input type="date" className={`${inputCls} w-full`} value={b.date} onChange={(e) => setB({ ...b, date: e.target.value })} /></Campo>
          <Campo label="Monto">
            <div className="flex gap-1">
              <select className={inputCls} value={b.currency} onChange={(e) => setB({ ...b, currency: e.target.value })}><option value="USD">US$</option><option value="UYU">$</option></select>
              <input type="number" min="0" step="0.01" className={`${inputCls} w-full`} value={b.amount} onChange={(e) => setB({ ...b, amount: e.target.value })} />
            </div>
          </Campo>
          <Campo label="Plataforma">
            <select className={`${inputCls} w-full`} value={b.platform} onChange={(e) => setB({ ...b, platform: e.target.value })}><option value="meta">Meta (FB/IG)</option><option value="google">Google</option><option value="otra">Otra</option></select>
          </Campo>
          <Campo label="Campaña (como en el link utm_campaign)"><input className={`${inputCls} w-full`} value={b.utm_campaign} onChange={(e) => setB({ ...b, utm_campaign: e.target.value })} /></Campo>
          <Campo label="Nota"><input className={`${inputCls} w-full`} value={b.notes} onChange={(e) => setB({ ...b, notes: e.target.value })} placeholder="Ej. semana 27/10–2/11" /></Campo>
          <div className="flex gap-2">
            <button onClick={async () => { if (!(await accion({ accion: "guardar_publicidad", ...b }))) { setB(vacio); setAbierto(false); } }}
              className="inline-flex items-center gap-1 rounded-md border border-amber-700 bg-amber-900/40 px-3 py-1 text-xs text-amber-200 hover:bg-amber-800/50"><Check size={12} /> Guardar</button>
            <button onClick={() => setAbierto(false)} className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-400"><X size={12} /></button>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-900 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Plataforma</th>
              <th className="px-4 py-2 font-medium">Campaña</th>
              <th className="px-4 py-2 font-medium text-right">Monto</th>
              <th className="px-4 py-2 font-medium">Nota</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {gastos.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Todavía no cargaste gasto de publicidad.</td></tr>}
            {gastos.map((g) => (
              <tr key={g.id} className="border-t border-gray-800/60">
                <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{fecha(g.date)}</td>
                <td className="px-4 py-2 text-gray-400">{g.platform === "meta" ? "Meta" : g.platform}</td>
                <td className="px-4 py-2 text-gray-300">{g.utm_campaign ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-200">{g.currency === "USD" ? "US$" : "$"} {Number(g.amount).toLocaleString("es-UY")}</td>
                <td className="px-4 py-2 text-gray-500">{g.notes ?? ""}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => { if (confirm("¿Borrar este gasto?")) accion({ accion: "borrar_publicidad", id: g.id }); }} className="p-1 text-gray-500 hover:text-red-300" title="Borrar"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
