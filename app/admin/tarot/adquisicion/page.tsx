"use client";
import { useState, useEffect, useCallback } from "react";
import { AlertCircle, RefreshCw, Target, Plus, X, Pencil } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// ============================================================================
// Panel de Adquisición — discovery comercial V1 (Tu Tirada)
// Ver docs/product/DECISIONS.md (2026-08-20) para las decisiones y fórmulas.
//
// Combina, sin duplicar lógica:
//   - /api/admin/tarot/adquisicion  → gasto, costo IA, compradores, CAC/ROAS/margen
//   - /api/admin/tarot/metricas     → funnel comercial+operativo y ventas por UTM
//     (ya existían, reutilizados tal cual)
// ============================================================================

// ── Types ────────────────────────────────────────────────────────────────

interface Experimento {
  nombre: string;
  hipotesis: string | null;
  presupuesto: number;
  moneda: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

interface GastoEntrada {
  id: string;
  date: string;
  platform: string;
  utm_source: string | null;
  utm_campaign: string | null;
  amount: number;
  currency: string;
  impressions: number | null;
  clicks: number | null;
  notes: string | null;
}

interface AdquisicionData {
  ok: boolean;
  experimento: Experimento | null;
  tipo_cambio_usd_uyu: number | null;
  gasto: {
    total_experimento_por_moneda: Record<string, number>;
    total_periodo_por_moneda: Record<string, number>;
    entradas_recientes: GastoEntrada[];
  };
  costo_ia: { total_usd: number; lecturas_contadas: number; promedio_usd_por_lectura: number | null };
  compradores: { total: number; cobro_manual: number; reales_mercado_pago: number };
  ingresos: { bruto_uyu: number; descuentos_uyu: number; neto_uyu: number; ticket_promedio_uyu: number };
  derivados: {
    cac_usd: number | null;
    roas: number | null;
    costo_variable_usd_por_orden: number | null;
    margen_contribucion_uyu: number | null;
    margen_por_orden_uyu: number | null;
  };
  motivo?: string;
  detalle?: string;
}

interface FunnelData {
  visitas: number;
  vistas_producto: number;
  checkout_iniciado: number;
  pagos_aprobados: number;
  lectura_ok: number;
  pdf_ok: number;
  whatsapp_ok: number;
  conv_visita_a_pago: number;
  conv_checkout_a_pago: number;
}
interface UtmRow { utm_source: string; utm_campaign: string | null; ventas: number; total_uyu: number }
interface MetricasData { ok: boolean; funnel?: FunnelData; ventas_por_utm?: UtmRow[] }

// ── Helpers ──────────────────────────────────────────────────────────────

const PERIODOS = [
  { key: "1", label: "Hoy" },
  { key: "7", label: "7 días" },
  { key: "30", label: "30 días" },
  { key: "90", label: "90 días" },
] as const;

function num(n: number, dec = 0) {
  return n.toLocaleString("es-UY", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function usd(n: number, dec = 2) {
  return `US$ ${num(n, dec)}`;
}
function uyu(n: number, dec = 0) {
  return `$U ${num(n, dec)}`;
}
function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}
const ND = <span className="text-gray-600">No disponible</span>;

// ── Small UI atoms ───────────────────────────────────────────────────────

function Metric({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "amber" | "emerald" | "red" | "default" }) {
  const toneCls = tone === "amber" ? "text-amber-300" : tone === "emerald" ? "text-emerald-400" : tone === "red" ? "text-red-400" : "text-gray-100";
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${toneCls}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function Bloque({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-sm font-semibold text-gray-300">{titulo}</h2>
      </div>
      {sub && <p className="text-xs text-gray-600 mb-4">{sub}</p>}
      {!sub && <div className="mb-4" />}
      {children}
    </section>
  );
}

// ── Bloque 1: Experimento ────────────────────────────────────────────────

function BloqueExperimento({ data }: { data: AdquisicionData | null }) {
  const exp = data?.experimento;
  const gastadoUsd = data?.gasto.total_experimento_por_moneda.USD ?? 0;
  const presupuesto = exp?.presupuesto ?? 0;
  const disponible = Math.max(0, presupuesto - gastadoUsd);
  const pctConsumido = presupuesto > 0 ? Math.min(100, (gastadoUsd / presupuesto) * 100) : 0;

  return (
    <Bloque titulo="Experimento" sub={exp?.hipotesis ?? undefined}>
      {!exp ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-6 text-sm text-gray-500 text-center">
          No hay un experimento activo configurado en <code className="text-gray-400">discovery_experimentos</code>.
        </div>
      ) : (
        <div className="rounded-xl border border-amber-800/40 bg-gray-900 px-5 py-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-amber-400" />
              <span className="text-sm font-semibold text-white">{exp.nombre}</span>
            </div>
            <span className="text-xs text-gray-500">
              {exp.fecha_inicio ? `Inicio: ${exp.fecha_inicio}` : "Sin fecha de inicio cargada"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
            <Metric label="Presupuesto" value={usd(presupuesto, 0)} />
            <Metric label="Gastado" value={usd(gastadoUsd)} tone="amber" />
            <Metric label="Disponible" value={usd(disponible)} tone="emerald" />
            <Metric label="% consumido" value={`${pctConsumido.toFixed(0)}%`} />
            <Metric label="Compradores (histórico)" value={data?.compradores.total ?? "—"} />
          </div>
          <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
            <div className="h-2 bg-amber-500" style={{ width: `${pctConsumido}%` }} />
          </div>
        </div>
      )}
    </Bloque>
  );
}

// ── Bloque 2: Métricas principales ───────────────────────────────────────

function BloqueMetricas({ data, funnel }: { data: AdquisicionData | null; funnel: FunnelData | null }) {
  const d = data?.derivados;
  return (
    <Bloque titulo="Métricas principales" sub="Del período seleccionado — no del experimento completo.">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Metric label="Ventas (compradores)" value={data?.compradores.total ?? "—"} sub={data ? `${data.compradores.reales_mercado_pago} MP · ${data.compradores.cobro_manual} manual` : undefined} />
        <Metric label="CAC" value={d?.cac_usd != null ? usd(d.cac_usd) : ND} tone="amber" />
        <Metric label="ROAS" value={d?.roas != null ? d.roas.toFixed(2) + "x" : ND} tone={d?.roas != null && d.roas >= 1 ? "emerald" : "red"} />
        <Metric label="Visita → Compra" value={funnel ? pct(funnel.conv_visita_a_pago) : "—"} />
        <Metric label="Ticket promedio" value={data ? uyu(data.ingresos.ticket_promedio_uyu) : "—"} />
        <Metric
          label="Margen contribución"
          value={d?.margen_contribucion_uyu != null ? uyu(d.margen_contribucion_uyu) : ND}
          tone={d?.margen_contribucion_uyu != null ? (d.margen_contribucion_uyu >= 0 ? "emerald" : "red") : "default"}
        />
      </div>
    </Bloque>
  );
}

// ── Bloque 3: Funnel (reutiliza /api/admin/tarot/metricas) ──────────────

function FunnelStep({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[64px]">
      <span className="text-xl font-bold tabular-nums text-gray-200">{value}</span>
      <span className="text-[11px] text-gray-500 text-center leading-tight">{label}</span>
    </div>
  );
}

function BloqueFunnel({ funnel }: { funnel: FunnelData | null }) {
  return (
    <Bloque titulo="Funnel" sub="Comercial (visita → pago) y operativo (pago → entrega). Vista completa en Dashboard.">
      {!funnel || (funnel.visitas === 0 && funnel.checkout_iniciado === 0 && funnel.pagos_aprobados === 0) ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-6 text-sm text-gray-500 text-center">
          Sin eventos de funnel en el período seleccionado.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center flex-wrap gap-y-3 overflow-x-auto">
            <FunnelStep label="Visitas" value={funnel.visitas} />
            <span className="text-gray-700 px-1">→</span>
            <FunnelStep label="Producto" value={funnel.vistas_producto} />
            <span className="text-gray-700 px-1">→</span>
            <FunnelStep label="Checkout" value={funnel.checkout_iniciado} />
            <span className="text-gray-700 px-1">→</span>
            <FunnelStep label="Pago (MP)" value={funnel.pagos_aprobados} />
            <span className="text-gray-800 px-2">|</span>
            <FunnelStep label="Lectura ✓" value={funnel.lectura_ok} />
            <span className="text-gray-700 px-1">→</span>
            <FunnelStep label="PDF ✓" value={funnel.pdf_ok} />
            <span className="text-gray-700 px-1">→</span>
            <FunnelStep label="WA ✓" value={funnel.whatsapp_ok} />
          </div>
          <p className="text-[11px] text-gray-600 mt-3">
            &quot;Pago (MP)&quot; cuenta solo el evento <code>payment_approved</code> del webhook real — no incluye ventas por cobro manual (ver Bloque 2, &quot;Ventas&quot;, para el total real).
          </p>
        </div>
      )}
    </Bloque>
  );
}

// ── Bloque 4: Costos operativos ──────────────────────────────────────────

function BloqueCostos({ data }: { data: AdquisicionData | null }) {
  return (
    <Bloque titulo="Costos operativos" sub="Solo se muestra lo que efectivamente podemos medir.">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Costo IA total" value={data ? usd(data.costo_ia.total_usd) : "—"} sub={data ? `${data.costo_ia.lecturas_contadas} lecturas` : undefined} />
        <Metric label="Costo IA / lectura" value={data?.costo_ia.promedio_usd_por_lectura != null ? usd(data.costo_ia.promedio_usd_por_lectura, 4) : ND} />
        <Metric label="Costo PDF" value={ND} sub="Sin costo imputable trackeado" />
        <Metric label="WhatsApp / Email" value={ND} sub="Sin costo imputable trackeado" />
      </div>
    </Bloque>
  );
}

// ── Bloque 5: Adquisición por canal + carga de gasto ─────────────────────

function BloqueAdquisicion({
  data, utm, tipoCambio, onGuardarGasto, onGuardarTipoCambio, guardando,
}: {
  data: AdquisicionData | null;
  utm: UtmRow[];
  tipoCambio: number | null;
  onGuardarGasto: (payload: Record<string, unknown>) => Promise<boolean>;
  onGuardarTipoCambio: (valor: string) => Promise<boolean>;
  guardando: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: "", currency: "USD", utm_source: "meta", utm_campaign: "", impressions: "", clicks: "", notes: "" });
  const [editandoCambio, setEditandoCambio] = useState(false);
  const [cambioForm, setCambioForm] = useState(tipoCambio?.toString() ?? "");

  return (
    <Bloque titulo="Adquisición" sub="Atribución basada en UTM (tarot_ordenes.utm_source / utm_campaign).">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          Tipo de cambio USD→UYU:{" "}
          {editandoCambio ? (
            <span className="inline-flex items-center gap-1">
              <input
                value={cambioForm}
                onChange={(e) => setCambioForm(e.target.value)}
                className="w-20 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-white text-xs"
                placeholder="ej: 40"
              />
              <button
                onClick={async () => { if (await onGuardarTipoCambio(cambioForm)) setEditandoCambio(false); }}
                className="text-emerald-400 hover:text-emerald-300"
              >Guardar</button>
              <button onClick={() => setEditandoCambio(false)} className="text-gray-500 hover:text-gray-300">Cancelar</button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span className="text-gray-300 font-medium">{tipoCambio ?? "no cargado"}</span>
              <button onClick={() => { setCambioForm(tipoCambio?.toString() ?? ""); setEditandoCambio(true); }} className="text-gray-600 hover:text-gray-300">
                <Pencil size={11} />
              </button>
            </span>
          )}
        </div>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-700/50 text-amber-300 hover:bg-amber-900/20 transition-colors"
        >
          {abierto ? <X size={13} /> : <Plus size={13} />}
          {abierto ? "Cerrar" : "Cargar gasto"}
        </button>
      </div>

      {abierto && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await onGuardarGasto({
              date: form.date,
              platform: "meta",
              amount: Number(form.amount),
              currency: form.currency,
              utm_source: form.utm_source || null,
              utm_campaign: form.utm_campaign || null,
              impressions: form.impressions || null,
              clicks: form.clicks || null,
              notes: form.notes || null,
            });
            if (ok) { setForm({ ...form, amount: "", utm_campaign: "", impressions: "", clicks: "", notes: "" }); setAbierto(false); }
          }}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Fecha
            <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-white" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Gasto
            <div className="flex gap-1">
              <input type="number" step="0.01" min="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-white" placeholder="0.00" />
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="rounded border border-gray-700 bg-gray-800 px-1.5 py-1.5 text-white text-xs">
                <option value="USD">USD</option>
                <option value="UYU">UYU</option>
              </select>
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            UTM campaign
            <input value={form.utm_campaign} onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })} className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-white" placeholder="opcional" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Impresiones / Clicks
            <div className="flex gap-1">
              <input type="number" min="0" value={form.impressions} onChange={(e) => setForm({ ...form, impressions: e.target.value })} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-white" placeholder="opcional" />
              <input type="number" min="0" value={form.clicks} onChange={(e) => setForm({ ...form, clicks: e.target.value })} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-white" placeholder="opcional" />
            </div>
          </label>
          <div className="col-span-2 sm:col-span-4 flex justify-end">
            <button type="submit" disabled={guardando} className="text-xs px-4 py-1.5 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-500 transition-colors disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar gasto"}
            </button>
          </div>
        </form>
      )}

      {utm.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-6 text-sm text-gray-500 text-center">
          Sin ventas atribuidas por UTM en el período — todas las órdenes llegaron sin parámetros de campaña o directas.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800">
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Fuente</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Campaña</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Ventas</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Ingresos UYU</th>
              </tr>
            </thead>
            <tbody>
              {utm.map((r, i) => (
                <tr key={i} className="border-t border-gray-800/60">
                  <td className="px-4 py-2 text-amber-300 font-medium">{r.utm_source}</td>
                  <td className="px-4 py-2 text-gray-400">{r.utm_campaign ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-white">{r.ventas}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{uyu(r.total_uyu)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.gasto.entradas_recientes.length > 0 && (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="bg-gray-900 px-4 py-2 border-b border-gray-800">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Gasto cargado (últimas 20 entradas)</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Fecha</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Campaña</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Gasto</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Impr. / Clicks</th>
              </tr>
            </thead>
            <tbody>
              {data.gasto.entradas_recientes.map((g) => (
                <tr key={g.id} className="border-t border-gray-800/60">
                  <td className="px-4 py-2 text-gray-400 text-xs">{g.date}</td>
                  <td className="px-4 py-2 text-gray-300">{g.utm_campaign ?? <span className="text-gray-700">—</span>}</td>
                  <td className="px-4 py-2 text-right text-amber-300">{g.currency} {num(g.amount, 2)}</td>
                  <td className="px-4 py-2 text-right text-gray-500 text-xs">{g.impressions ?? "—"} / {g.clicks ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bloque>
  );
}

// ── Bloque 6: Diagnóstico (solo ratios, sin IA) ──────────────────────────

function BloqueDiagnostico({ funnel }: { funnel: FunnelData | null }) {
  if (!funnel || funnel.visitas === 0) {
    return (
      <Bloque titulo="Diagnóstico">
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-6 text-sm text-gray-500 text-center">
          Sin visitas suficientes en el período para diagnosticar el funnel.
        </div>
      </Bloque>
    );
  }

  const senales: { texto: string; tono: "warning" | "info" }[] = [];
  const rVisitaCheckout = funnel.checkout_iniciado / funnel.visitas;
  const rCheckoutPago = funnel.checkout_iniciado > 0 ? funnel.pagos_aprobados / funnel.checkout_iniciado : 0;

  if (funnel.visitas >= 20 && rVisitaCheckout < 0.05) {
    senales.push({ texto: `Muchas visitas (${funnel.visitas}) y pocos CTA/checkout (${funnel.checkout_iniciado}) → posible problema de propuesta, creativo o landing.`, tono: "warning" });
  }
  if (funnel.checkout_iniciado >= 5 && rCheckoutPago < 0.2) {
    senales.push({ texto: `Checkout iniciado correctamente (${funnel.checkout_iniciado}) pero poca conversión a pago (${funnel.pagos_aprobados}) → posible fricción de precio, confianza o medio de pago.`, tono: "warning" });
  }
  if (senales.length === 0) {
    senales.push({ texto: "Sin señales de alerta claras todavía con el volumen actual del período.", tono: "info" });
  }

  return (
    <Bloque titulo="Diagnóstico" sub="Solo ratios simples — sin motor de recomendaciones.">
      <div className="flex flex-col gap-2">
        {senales.map((s, i) => (
          <div key={i} className={`rounded-lg border px-4 py-2.5 text-sm ${s.tono === "warning" ? "border-amber-800/40 bg-amber-950/20 text-amber-200" : "border-gray-800 bg-gray-900/50 text-gray-400"}`}>
            {s.texto}
          </div>
        ))}
      </div>
    </Bloque>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function AdquisicionPage() {
  const [periodo, setPeriodo] = useState("30");
  const [data, setData] = useState<AdquisicionData | null>(null);
  const [metricas, setMetricas] = useState<MetricasData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (p: string) => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const [adqRes, metRes] = await Promise.all([
        fetch(`/api/admin/tarot/adquisicion?periodo=${p}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/admin/tarot/metricas?periodo=${p}`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (adqRes.ok) setData(adqRes); else setErrorMsg(adqRes.detalle ?? adqRes.motivo ?? "Error al cargar adquisición");
      if (metRes.ok) setMetricas(metRes);
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(periodo); }, [cargar, periodo]);

  const guardarGasto = useCallback(async (payload: Record<string, unknown>): Promise<boolean> => {
    setGuardando(true);
    try {
      const res = await fetch("/api/admin/tarot/adquisicion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) { setErrorMsg(json.detalle ?? json.motivo ?? "Error al guardar gasto"); return false; }
      await cargar(periodo);
      return true;
    } catch {
      setErrorMsg("Error de red al guardar gasto");
      return false;
    } finally {
      setGuardando(false);
    }
  }, [cargar, periodo]);

  const guardarTipoCambio = useCallback(async (valor: string): Promise<boolean> => {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) { setErrorMsg("Tipo de cambio inválido"); return false; }
    try {
      const res = await fetch("/api/admin/tarot/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: { tipo_cambio_usd_uyu: valor } }),
      });
      const json = await res.json();
      if (!json.ok) { setErrorMsg(json.detalle ?? json.motivo ?? "Error al guardar tipo de cambio"); return false; }
      await cargar(periodo);
      return true;
    } catch {
      setErrorMsg("Error de red al guardar tipo de cambio");
      return false;
    }
  }, [cargar, periodo]);

  return (
    <TarotAdminShell>
      <main className="px-6 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Adquisición · Tu Tirada</h2>
            <p className="text-xs text-gray-500 mt-0.5">Discovery comercial — CAC, ROAS y unit economics del experimento</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-700 overflow-hidden">
              {PERIODOS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPeriodo(key)}
                  className={`text-xs px-3 py-1.5 transition-colors ${periodo === key ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => cargar(periodo)}
              disabled={cargando}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <RefreshCw size={11} className={cargando ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" /> {errorMsg}
          </div>
        )}

        {cargando && !data && (
          <div className="text-sm text-gray-500 animate-pulse py-12 text-center">Cargando…</div>
        )}

        <BloqueExperimento data={data} />
        <BloqueMetricas data={data} funnel={metricas?.funnel ?? null} />
        <BloqueFunnel funnel={metricas?.funnel ?? null} />
        <BloqueCostos data={data} />
        <BloqueAdquisicion
          data={data}
          utm={metricas?.ventas_por_utm ?? []}
          tipoCambio={data?.tipo_cambio_usd_uyu ?? null}
          onGuardarGasto={guardarGasto}
          onGuardarTipoCambio={guardarTipoCambio}
          guardando={guardando}
        />
        <BloqueDiagnostico funnel={metricas?.funnel ?? null} />
      </main>
    </TarotAdminShell>
  );
}
