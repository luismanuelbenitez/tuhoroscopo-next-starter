"use client";
import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Check, Copy, ExternalLink, Plus, RefreshCw, Target, X } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { SITIO } from "@/lib/seo/paginasSeo";

// Campañas de anuncios (2026-10-22). Flujo:
//  1. Se registra la campaña acá → queda un identificador fijo (utm_campaign).
//  2. El Admin arma los "Parámetros de URL" para pegar en cada anuncio de Meta.
//  3. Se carga el gasto con ese mismo identificador.
// Visitas (funnel_sessions), compras (tarot_ordenes) y gasto (campaign_costs)
// quedan unidos por ese identificador → costo por compra.

interface Campana {
  id: string; utm_campaign: string; nombre: string; objetivo: string | null; destino_path: string;
  presupuesto: number | null; moneda: string; fecha_inicio: string | null; fecha_fin: string | null;
  estado: string; notas: string | null; created_at: string;
  sesiones: number; pruebas: number; vieron_producto: number; checkout: number; compras: number; ingresos_uyu: number;
  primera_visita: string | null; ultima_visita: string | null; ultima_prueba: string | null; anuncios: string | null;
  gasto: number | null; moneda_gasto: string | null; ultimo_gasto: string | null; impresiones: number | null; clics: number | null;
  costo_por_compra: number | null;
}
interface SinRegistrar { utm_campaign: string; sesiones: number; compras: number; gasto: number | null }

const DESTINOS = [
  { path: "/tarot", label: "Tarot (página principal del producto)" },
  { path: "/tarot/amor", label: "Tarot del amor" },
  { path: "/tarot/trabajo-y-dinero", label: "Tarot de trabajo y dinero" },
  { path: "/tarot/decisiones", label: "Tarot para decisiones" },
  { path: "/tarot/lectura-personalizada", label: "Lectura personalizada" },
  { path: "/tarot/online-uruguay", label: "Tarot online Uruguay" },
  { path: "/", label: "Inicio" },
];
const ESTADOS: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "text-gray-300 border-gray-700 bg-gray-900" },
  activa: { label: "Activa", cls: "text-emerald-300 border-emerald-900/70 bg-emerald-950/40" },
  pausada: { label: "Pausada", cls: "text-amber-300 border-amber-900/70 bg-amber-950/30" },
  finalizada: { label: "Finalizada", cls: "text-gray-400 border-gray-700 bg-gray-900" },
};

const ID_VALIDO = /^[a-z0-9][a-z0-9_-]{1,59}$/;
function aIdentificador(txt: string): string {
  return txt.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}
const parametrosMeta = (id: string) =>
  `utm_source={{site_source_name}}&utm_medium=paid&utm_campaign=${id}&utm_content={{ad.name}}&utm_term={{adset.name}}`;
const linkPrueba = (c: Pick<Campana, "utm_campaign" | "destino_path">) =>
  `${SITIO}${c.destino_path}?utm_source=fb&utm_medium=paid&utm_campaign=${c.utm_campaign}&utm_content=prueba_admin&interno=1`;

const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-UY", { day: "2-digit", month: "short" }) : "—");
const uyu = (n: number) => `$ ${Math.round(n).toLocaleString("es-UY")}`;
const dinero = (n: number | null, moneda: string | null) =>
  n == null ? "—" : `${moneda === "UYU" ? "$" : "US$"} ${n.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`;
const hoy = () => new Date().toISOString().slice(0, 10);

const input = "w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white placeholder:text-gray-600";

function Copiar({ texto, label }: { texto: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}
      className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${ok ? "border-emerald-700 text-emerald-300" : "border-gray-700 text-gray-300 hover:border-gray-500"}`}
    >
      {ok ? <Check size={12} /> : <Copy size={12} />} {ok ? "Copiado" : label ?? "Copiar"}
    </button>
  );
}

function CampoCopiable({ titulo, ayuda, valor }: { titulo: string; ayuda: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-300">{titulo}</p>
      <p className="text-[11px] text-gray-500 mb-1">{ayuda}</p>
      <div className="flex items-start gap-2">
        <code className="flex-1 min-w-0 break-all rounded border border-gray-800 bg-black/40 px-2 py-1.5 text-[11px] text-amber-200">{valor}</code>
        <Copiar texto={valor} />
      </div>
    </div>
  );
}

// ── Explicación ─────────────────────────────────────────────────────────────
function ComoFunciona() {
  const pasos = [
    { n: 1, t: "Registrá la campaña acá", d: "Le das un nombre y el sistema crea su identificador (ej. tarot_amor_nov). Ese identificador es la «llave» que une todo." },
    { n: 2, t: "Pegá las etiquetas en Meta", d: "En cada anuncio, sección Seguimiento → Parámetros de URL, pegás el texto que te damos. Meta completa solo si fue Facebook o Instagram y el nombre del anuncio." },
    { n: 3, t: "Probá el enganche", d: "Abrí el «link de prueba»: la campaña pasa a «Probada». Tu visita se marca como interna y no ensucia los números." },
    { n: 4, t: "Cargá el gasto", d: "Cada semana o al terminar, cargás lo que Meta te cobró. Con eso aparece el costo por compra." },
  ];
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
      <p className="text-sm font-semibold text-white">Cómo funciona</p>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        {pasos.map((p) => (
          <div key={p.n} className="rounded-lg border border-gray-800 bg-black/20 p-3">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300">{p.n}</span>
            <p className="mt-2 text-xs font-semibold text-gray-200">{p.t}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{p.d}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-gray-500">
        Recorrido del dato: <span className="text-gray-300">anuncio</span> → visita con la etiqueta de la campaña → <span className="text-gray-300">compra</span> en esa misma visita → se divide el <span className="text-gray-300">gasto</span> cargado entre las compras.
        Las compras se toman solo si se pagaron. Ingresos en pesos; gasto en la moneda que lo cargues.
      </p>
    </div>
  );
}

// ── Alta de campaña ─────────────────────────────────────────────────────────
function NuevaCampana({ inicial, onCreada, onCerrar }: { inicial?: string; onCreada: () => void; onCerrar: () => void }) {
  const [f, setF] = useState({
    nombre: inicial ?? "", utm_campaign: inicial ?? "", idManual: !!inicial, objetivo: "", destino_path: "/tarot",
    presupuesto: "", moneda: "USD", fecha_inicio: hoy(), fecha_fin: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const idOk = ID_VALIDO.test(f.utm_campaign);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true); setError(null);
    const r = await fetch("/api/admin/tarot/campanas-ads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, estado: "borrador" }),
    }).then((x) => x.json()).catch(() => null);
    setGuardando(false);
    if (r?.ok) onCreada();
    else setError(r?.motivo === "identificador_existente" ? "Ya existe una campaña con ese identificador." : r?.motivo === "identificador_invalido" ? "El identificador no es válido." : r?.detalle ?? "No se pudo guardar.");
  }

  return (
    <form onSubmit={guardar} className="rounded-xl border border-amber-900/50 bg-gray-900/80 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Nueva campaña</p>
        <button type="button" onClick={onCerrar} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-xs text-gray-400">Nombre de la campaña
          <input required className={`${input} mt-1`} placeholder="ej: Tarot amor noviembre" value={f.nombre}
            onChange={(e) => setF({ ...f, nombre: e.target.value, utm_campaign: f.idManual ? f.utm_campaign : aIdentificador(e.target.value) })} />
          <span className="mt-1 block text-[11px] text-gray-600">Usá el mismo nombre en Meta para reconocerla fácil.</span>
        </label>
        <label className="text-xs text-gray-400">Identificador (la «llave»)
          <input required className={`${input} mt-1 font-mono ${f.utm_campaign && !idOk ? "border-red-700" : ""}`} value={f.utm_campaign}
            onChange={(e) => setF({ ...f, idManual: true, utm_campaign: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} />
          <span className={`mt-1 block text-[11px] ${f.utm_campaign && !idOk ? "text-red-400" : "text-gray-600"}`}>
            Minúsculas, números y guion bajo. No se puede cambiar después.
          </span>
        </label>
        <label className="text-xs text-gray-400">Página a la que lleva el anuncio
          <select className={`${input} mt-1`} value={f.destino_path} onChange={(e) => setF({ ...f, destino_path: e.target.value })}>
            {DESTINOS.map((d) => <option key={d.path} value={d.path}>{d.label} — {d.path}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-400">Objetivo (opcional)
          <input className={`${input} mt-1`} placeholder="ej: probar público mujeres 25-45 Montevideo" value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })} />
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="text-xs text-gray-400">Presupuesto previsto (opcional)
            <input type="number" min="0" step="0.01" className={`${input} mt-1`} value={f.presupuesto} onChange={(e) => setF({ ...f, presupuesto: e.target.value })} />
          </label>
          <label className="text-xs text-gray-400">Moneda
            <select className={`${input} mt-1`} value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })}><option>USD</option><option>UYU</option></select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-400">Inicio
            <input type="date" className={`${input} mt-1`} value={f.fecha_inicio} onChange={(e) => setF({ ...f, fecha_inicio: e.target.value })} />
          </label>
          <label className="text-xs text-gray-400">Fin (opcional)
            <input type="date" className={`${input} mt-1`} value={f.fecha_fin} onChange={(e) => setF({ ...f, fecha_fin: e.target.value })} />
          </label>
        </div>
      </div>
      {error && <p className="mt-3 flex items-center gap-1.5 text-xs text-red-400"><AlertCircle size={13} /> {error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className="rounded-md px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200">Cancelar</button>
        <button disabled={guardando || !idOk} className="rounded-md bg-amber-600 px-4 py-1.5 text-xs font-semibold text-black hover:bg-amber-500 disabled:opacity-40">
          {guardando ? "Guardando…" : "Crear y ver etiquetas"}
        </button>
      </div>
    </form>
  );
}

// ── Carga de gasto (usa el endpoint de Adquisición) ─────────────────────────
function CargarGasto({ c, onListo }: { c: Campana; onListo: () => void }) {
  const [f, setF] = useState({ date: hoy(), amount: "", currency: c.moneda || "USD", impressions: "", clicks: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await fetch("/api/admin/tarot/adquisicion", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, platform: "meta", utm_source: "meta", utm_campaign: c.utm_campaign }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) onListo(); else setError(r?.detalle ?? r?.motivo ?? "No se pudo guardar.");
  }
  return (
    <form onSubmit={guardar} className="mt-3 rounded-lg border border-gray-800 bg-black/20 p-3">
      <p className="text-[11px] text-gray-500 mb-2">
        Mirá en el Administrador de anuncios de Meta el «Importe gastado» de esta campaña en el período y cargalo acá. Podés cargar varias veces (por semana, por ejemplo): se suman.
      </p>
      <div className="grid gap-2 sm:grid-cols-6">
        <label className="text-[11px] text-gray-400 sm:col-span-1">Fecha<input type="date" required className={`${input} mt-0.5`} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="text-[11px] text-gray-400 sm:col-span-1">Importe<input type="number" min="0.01" step="0.01" required className={`${input} mt-0.5`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        <label className="text-[11px] text-gray-400 sm:col-span-1">Moneda<select className={`${input} mt-0.5`} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}><option>USD</option><option>UYU</option></select></label>
        <label className="text-[11px] text-gray-400 sm:col-span-1">Impresiones<input type="number" min="0" className={`${input} mt-0.5`} value={f.impressions} onChange={(e) => setF({ ...f, impressions: e.target.value })} /></label>
        <label className="text-[11px] text-gray-400 sm:col-span-1">Clics<input type="number" min="0" className={`${input} mt-0.5`} value={f.clicks} onChange={(e) => setF({ ...f, clicks: e.target.value })} /></label>
        <div className="flex items-end sm:col-span-1"><button className="w-full rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-500">Guardar gasto</button></div>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </form>
  );
}

// ── Tarjeta de campaña ──────────────────────────────────────────────────────
function Enganche({ c }: { c: Campana }) {
  if (c.sesiones > 0) return <span className="text-[11px] text-emerald-300">● Enganchada — llegan visitas reales (última {fmtFecha(c.ultima_visita)})</span>;
  if (c.pruebas > 0) return <span className="text-[11px] text-sky-300">● Probada — el link de prueba llegó bien ({fmtFecha(c.ultima_prueba)}). Falta la primera visita desde el anuncio.</span>;
  return <span className="text-[11px] text-gray-500">○ Sin visitas todavía — abrí el link de prueba para verificar.</span>;
}

function Metrica({ label, valor, sub, tono }: { label: string; valor: string | number; sub?: string; tono?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-black/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-base font-semibold ${tono ?? "text-white"}`}>{valor}</p>
      {sub && <p className="text-[10px] text-gray-600">{sub}</p>}
    </div>
  );
}

function TarjetaCampana({ c, abierta, onToggle, onCambio }: { c: Campana; abierta: boolean; onToggle: () => void; onCambio: () => void }) {
  const [gasto, setGasto] = useState(false);
  const est = ESTADOS[c.estado] ?? ESTADOS.borrador;
  async function cambiarEstado(estado: string) {
    await fetch("/api/admin/tarot/campanas-ads", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, estado }) });
    onCambio();
  }
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{c.nombre}</p>
          <p className="mt-0.5 font-mono text-[11px] text-amber-300/80">{c.utm_campaign} <span className="text-gray-600">→ {c.destino_path}</span></p>
          {c.objetivo && <p className="mt-1 text-[11px] text-gray-500">{c.objetivo}</p>}
          <div className="mt-1.5"><Enganche c={c} /></div>
        </div>
        <div className="flex items-center gap-2">
          <select value={c.estado} onChange={(e) => cambiarEstado(e.target.value)} className={`rounded-md border px-2 py-1 text-[11px] ${est.cls}`}>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Metrica label="Visitas" valor={c.sesiones} sub={c.pruebas ? `+${c.pruebas} de prueba` : undefined} />
        <Metrica label="Vieron producto" valor={c.vieron_producto} />
        <Metrica label="Checkout" valor={c.checkout} />
        <Metrica label="Compras" valor={c.compras} tono={c.compras ? "text-emerald-300" : undefined} />
        <Metrica label="Ingresos" valor={uyu(c.ingresos_uyu)} />
        <Metrica label="Gasto cargado" valor={dinero(c.gasto, c.moneda_gasto)} sub={c.presupuesto != null ? `previsto ${dinero(c.presupuesto, c.moneda)}` : undefined} tono="text-amber-300" />
        <Metrica label="Costo por compra" valor={dinero(c.costo_por_compra, c.moneda_gasto)}
          sub={c.costo_por_compra == null ? (c.gasto == null ? "falta cargar gasto" : "aún sin compras") : undefined} />
      </div>
      {c.anuncios && <p className="mt-2 text-[11px] text-gray-500">Anuncios que trajeron visitas: <span className="text-gray-300">{c.anuncios}</span></p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onToggle} className="rounded-md border border-amber-800/70 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200 hover:border-amber-600">
          {abierta ? "Ocultar etiquetas para Meta" : "Etiquetas para Meta"}
        </button>
        <a href={linkPrueba(c)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500">
          Abrir link de prueba <ExternalLink size={12} />
        </a>
        <button onClick={() => setGasto(!gasto)} className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500">
          {gasto ? "Cancelar" : "Cargar gasto"}
        </button>
      </div>

      {abierta && (
        <div className="mt-4 space-y-4 rounded-lg border border-amber-900/40 bg-black/30 p-4">
          <p className="text-xs text-gray-300">
            En el <span className="font-semibold">Administrador de anuncios de Meta</span>, abrí <span className="font-semibold">cada anuncio</span> de esta campaña (nivel anuncio, no campaña ni conjunto):
          </p>
          <CampoCopiable
            titulo="① URL del sitio web"
            ayuda="Sección «Destino» → URL del sitio web."
            valor={`${SITIO}${c.destino_path}`}
          />
          <CampoCopiable
            titulo="② Parámetros de URL"
            ayuda="Bajá hasta «Seguimiento» → «Parámetros de URL» → pegalo tal cual. Lo que está entre llaves {{ }} lo completa Meta solo."
            valor={parametrosMeta(c.utm_campaign)}
          />
          <div className="text-[11px] text-gray-500 leading-relaxed">
            <p className="font-semibold text-gray-400">Qué significa cada parte</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              <li><code className="text-gray-300">utm_source</code> — Meta pone fb, ig o msg según dónde se vio el anuncio.</li>
              <li><code className="text-gray-300">utm_medium=paid</code> — marca la visita como publicidad paga.</li>
              <li><code className="text-gray-300">utm_campaign={c.utm_campaign}</code> — la llave fija de esta campaña. <span className="text-amber-300/80">No la cambies.</span></li>
              <li><code className="text-gray-300">utm_content</code> / <code className="text-gray-300">utm_term</code> — Meta pone el nombre del anuncio y del conjunto: así se ve qué anuncio vende.</li>
            </ul>
            <p className="mt-2">Para verificar: después de pegar, usá «Vista previa» del anuncio, o el botón <span className="text-gray-300">Abrir link de prueba</span> de acá. La campaña debería pasar a «Probada».</p>
          </div>
        </div>
      )}
      {gasto && <CargarGasto c={c} onListo={() => { setGasto(false); onCambio(); }} />}
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function CampanasAdsPage() {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [sinRegistrar, setSinRegistrar] = useState<SinRegistrar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nueva, setNueva] = useState<{ inicial?: string } | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await fetch("/api/admin/tarot/campanas-ads").then((x) => x.json()).catch(() => null);
    setCargando(false);
    if (!r?.ok) { setError(r?.detalle ?? r?.motivo ?? "Error al cargar"); return; }
    setError(null);
    setCampanas(r.campanas ?? []);
    setSinRegistrar(r.sin_registrar ?? []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <TarotAdminShell>
      <div className="p-6 max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Target size={18} className="text-amber-400" /> Campañas de anuncios</h1>
            <p className="text-xs text-gray-500 mt-1">Registrá cada campaña de Meta, copiá sus etiquetas y cargá el gasto: visitas, compras y costo por compra quedan unidos solos.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={cargar} className="rounded-md border border-gray-700 p-2 text-gray-400 hover:text-gray-200" title="Actualizar"><RefreshCw size={14} className={cargando ? "animate-spin" : ""} /></button>
            <button onClick={() => setNueva({})} className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-500"><Plus size={14} /> Nueva campaña</button>
          </div>
        </div>

        <ComoFunciona />

        {nueva && (
          <NuevaCampana
            inicial={nueva.inicial}
            onCerrar={() => setNueva(null)}
            onCreada={async () => {
              const id = nueva.inicial;
              setNueva(null);
              await cargar();
              // Recién creada: abrir sus etiquetas directamente.
              setAbierta(id ?? "__ultima__");
            }}
          />
        )}

        {error && <div className="flex items-center gap-2 text-sm text-red-400"><AlertCircle size={14} /> {error}</div>}

        {!cargando && !campanas.length && !error && (
          <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center text-sm text-gray-500">
            Todavía no hay campañas registradas. Tocá <span className="text-amber-300">Nueva campaña</span> para crear la primera.
          </div>
        )}

        <div className="space-y-4">
          {campanas.map((c, i) => (
            <TarjetaCampana
              key={c.id}
              c={c}
              abierta={abierta === c.utm_campaign || (abierta === "__ultima__" && i === 0)}
              onToggle={() => setAbierta(abierta === c.utm_campaign || (abierta === "__ultima__" && i === 0) ? null : c.utm_campaign)}
              onCambio={cargar}
            />
          ))}
        </div>

        {sinRegistrar.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
            <p className="text-sm font-semibold text-white">Campañas detectadas sin registrar</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Llegaron visitas o se cargó gasto con estos identificadores, pero no están dados de alta acá. Registralos para verlos completos.</p>
            <div className="mt-3 divide-y divide-gray-800">
              {sinRegistrar.map((s) => (
                <div key={s.utm_campaign} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-mono text-xs text-gray-300">{s.utm_campaign}</span>
                  <span className="text-[11px] text-gray-500">{s.sesiones} visitas · {s.compras} compras{s.gasto != null ? ` · gasto ${s.gasto}` : ""}</span>
                  {ID_VALIDO.test(s.utm_campaign)
                    ? <button onClick={() => setNueva({ inicial: s.utm_campaign })} className="rounded-md border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:border-gray-500">Registrar</button>
                    : <span className="text-[11px] text-gray-600">identificador con formato no válido</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </TarotAdminShell>
  );
}
