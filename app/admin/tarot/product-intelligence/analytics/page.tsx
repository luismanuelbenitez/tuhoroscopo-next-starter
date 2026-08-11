"use client";
import { useState, useEffect, useCallback } from "react";
import { TrendingUp, AlertCircle, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { PIABreadcrumb } from "@/components/admin/product-intelligence/PIABreadcrumb";
import { KPICard } from "@/components/admin/product-intelligence/KPICard";
import { ContextBanner } from "@/components/admin/product-intelligence/ContextBanner";
import { EmptyState } from "@/components/admin/product-intelligence/EmptyState";

// ── Types ─────────────────────────────────────────────────────────────────────

type Periodo = "hoy" | "7d" | "30d";

interface KPIs {
  total: number;
  exitosas: number;
  con_error: number;
  tasa_exito: number;
  costo_total: number;
  costo_promedio: number;
  tokens_entrada_avg: number;
  tokens_salida_avg: number;
}

interface SerieDia {
  dia: string;
  exitosas: number;
  con_error: number;
}

interface CostoModelo {
  modelo: string;
  total_lecturas: number;
  costo_promedio: number;
  costo_total: number;
}

interface TokensStats {
  avg: number;
  p50: number;
  p90: number;
  p99: number;
}

interface ErrorItem {
  id: string;
  error_codigo: string | null;
  error_mensaje: string | null;
  generado_at: string | null;
  created_at: string;
}

interface AnalyticsData {
  periodo: string;
  kpis: KPIs;
  series_temporal: SerieDia[];
  costo_por_modelo: CostoModelo[];
  tokens_stats: TokensStats;
  ultimos_errores: ErrorItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: "America/Montevideo" });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo",
  });
}

// ── Bar Chart (SVG puro, sin deps externas) ───────────────────────────────────

function BarChart({ data }: { data: SerieDia[] }) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d.exitosas + d.con_error), 1);
  const H = 120;
  const barW = Math.max(8, Math.min(32, Math.floor(560 / Math.max(data.length * 2, 1))));
  const gap = Math.max(2, barW / 4);
  const groupW = barW * 2 + gap;
  const chartW = data.length * (groupW + gap) + gap;

  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(chartW, 300)} height={H + 32} className="block">
        {data.map((d, i) => {
          const x = gap + i * (groupW + gap);
          const hExit = Math.max(2, (d.exitosas / maxVal) * H);
          const hErr = Math.max(d.con_error > 0 ? 2 : 0, (d.con_error / maxVal) * H);
          return (
            <g key={d.dia}>
              {/* exitosas */}
              <rect
                x={x}
                y={H - hExit}
                width={barW}
                height={hExit}
                fill="#10b981"
                fillOpacity={0.7}
                rx={2}
              />
              {/* con error */}
              <rect
                x={x + barW + gap}
                y={H - hErr}
                width={barW}
                height={hErr}
                fill="#ef4444"
                fillOpacity={0.6}
                rx={2}
              />
              {/* label día */}
              {(i === 0 || i === data.length - 1 || data.length <= 10) && (
                <text
                  x={x + groupW / 2}
                  y={H + 20}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#6b7280"
                >
                  {fmtDate(d.dia)}
                </text>
              )}
            </g>
          );
        })}
        {/* baseline */}
        <line x1={0} y1={H} x2={Math.max(chartW, 300)} y2={H} stroke="#374151" strokeWidth={1} />
      </svg>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (p: Periodo) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tarot/product-intelligence/analytics?periodo=${p}`);
      const json = await res.json();
      if (json.ok) {
        setData(json);
      } else {
        setError(json.detalle ?? json.motivo ?? "Error al cargar datos");
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(periodo); }, [cargar, periodo]);

  function changePeriodo(p: Periodo) {
    setPeriodo(p);
    cargar(p);
  }

  const tabCls = (p: Periodo) =>
    `px-3 py-1.5 text-xs rounded-lg transition-colors ${
      periodo === p ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"
    }`;

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <PIABreadcrumb segments={[{ label: "Product Intelligence", href: "/admin/tarot/product-intelligence" }, { label: "Analytics" }]} />
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-green-400" />
            <h1 className="text-base font-semibold text-white">Analytics</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Selector de período */}
            <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
              <button onClick={() => changePeriodo("hoy")} className={tabCls("hoy")}>Hoy</button>
              <button onClick={() => changePeriodo("7d")}  className={tabCls("7d")}>7 días</button>
              <button onClick={() => changePeriodo("30d")} className={tabCls("30d")}>30 días</button>
            </div>
            <button
              onClick={() => cargar(periodo)}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-800 rounded-lg px-3 py-1.5 transition-colors"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
              Actualizar
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Context banner */}
        <ContextBanner variant="info">
          Métricas de la generación de lecturas con IA. Solo lecturas con estado{" "}
          <code className="text-xs bg-gray-800 px-1 rounded">completada</code> o{" "}
          <code className="text-xs bg-gray-800 px-1 rounded">error</code> son incluidas.
          Los datos de ventas y funnel están en el{" "}
          <a href="/admin/tarot" className="text-amber-400 hover:underline">panel principal</a>.
        </ContextBanner>

        {/* Error global */}
        {error && !loading && (
          <div className="flex items-center gap-2 rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {error}
            <button onClick={() => cargar(periodo)} className="ml-auto text-xs underline">Reintentar</button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KPICard
            loading={loading}
            value={data?.kpis.exitosas ?? 0}
            label="Lecturas exitosas"
            sub={data ? `${data.kpis.total} intentadas` : undefined}
          />
          <KPICard
            loading={loading}
            value={data ? fmtPct(data.kpis.tasa_exito) : "—"}
            label="Tasa de éxito"
            valueClassName={
              !data ? "text-white" :
              data.kpis.tasa_exito >= 0.95 ? "text-emerald-400" :
              data.kpis.tasa_exito >= 0.8 ? "text-amber-400" : "text-red-400"
            }
            sub="exitosas / intentadas"
          />
          <KPICard
            loading={loading}
            value={data ? fmt$(data.kpis.costo_promedio) : "—"}
            label="Costo promedio / lectura"
            sub={data && data.kpis.exitosas > 0 ? `Total ${fmt$(data.kpis.costo_total)}` : undefined}
          />
          <KPICard
            loading={loading}
            value={data?.kpis.con_error ?? 0}
            label="Lecturas con error"
            valueClassName={data && data.kpis.con_error > 0 ? "text-red-400" : "text-white"}
            sub={`en ${periodo === "hoy" ? "hoy" : periodo}`}
          />
        </div>

        {/* Gráfico temporal */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
            <span className="text-sm font-semibold text-gray-200">Lecturas por día</span>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/70 inline-block" /> Exitosas</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/60 inline-block" /> Error</span>
            </div>
          </div>
          <div className="p-4">
            {loading && <div className="h-36 bg-gray-800/50 rounded animate-pulse" />}
            {!loading && data && data.series_temporal.length === 0 && (
              <EmptyState
                icon={TrendingUp}
                title="Sin lecturas en este período"
                description="Las lecturas aparecen aquí cuando los clientes completan el proceso de pago."
              />
            )}
            {!loading && data && data.series_temporal.length > 0 && (
              <BarChart data={data.series_temporal} />
            )}
          </div>
        </div>

        {/* Fila: Costo por modelo + Performance de tokens */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Costo por modelo */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800/60">
              <span className="text-sm font-semibold text-gray-200">Lecturas por modelo de IA</span>
              <p className="text-xs text-gray-600 mt-0.5">Proxy de versión de prompt hasta que exista prompt_version_id</p>
            </div>
            <div className="divide-y divide-gray-800/40">
              {loading && (
                <div className="p-4 space-y-2">
                  {[1, 2].map((i) => <div key={i} className="h-6 bg-gray-800/50 rounded animate-pulse" />)}
                </div>
              )}
              {!loading && data && data.costo_por_modelo.length === 0 && (
                <p className="px-4 py-4 text-xs text-gray-600">Sin lecturas exitosas en el período.</p>
              )}
              {!loading && data && data.costo_por_modelo.map((m) => (
                <div key={m.modelo} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-xs font-mono text-gray-300">{m.modelo}</p>
                    <p className="text-xs text-gray-600">{m.total_lecturas} lecturas</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-300">{fmt$(m.costo_promedio)} prom.</p>
                    <p className="text-xs text-gray-600">{fmt$(m.costo_total)} total</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance de tokens */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800/60">
              <span className="text-sm font-semibold text-gray-200">Tokens de salida</span>
              <p className="text-xs text-gray-600 mt-0.5">Proxy de complejidad / longitud de lectura</p>
            </div>
            <div className="divide-y divide-gray-800/40">
              {loading && (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4].map((i) => <div key={i} className="h-6 bg-gray-800/50 rounded animate-pulse" />)}
                </div>
              )}
              {!loading && data && (
                <>
                  {[
                    { label: "Promedio", value: data.tokens_stats.avg },
                    { label: "P50 (mediana)", value: data.tokens_stats.p50 },
                    { label: "P90", value: data.tokens_stats.p90 },
                    { label: "P99", value: data.tokens_stats.p99 },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-gray-400">{label}</span>
                      <span className="text-xs font-mono text-gray-300">
                        {value > 0 ? value.toLocaleString() : "—"}
                      </span>
                    </div>
                  ))}
                  {data.kpis.exitosas === 0 && (
                    <p className="px-4 py-2 text-xs text-gray-600">Sin lecturas exitosas.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Últimos errores */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800/60">
            <AlertTriangle size={14} className="text-amber-400" />
            <span className="text-sm font-semibold text-gray-200">Últimos errores de generación</span>
            {data && data.kpis.con_error > 10 && (
              <span className="ml-auto text-xs text-gray-600">Mostrando los 10 más recientes</span>
            )}
          </div>
          {loading && (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-gray-800/50 rounded animate-pulse" />)}
            </div>
          )}
          {!loading && data && data.ultimos_errores.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-4 text-xs text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Sin errores en el período. El sistema está operando correctamente.
            </div>
          )}
          {!loading && data && data.ultimos_errores.length > 0 && (
            <div className="divide-y divide-gray-800/40">
              {data.ultimos_errores.map((e) => (
                <div key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-500">#{e.id.slice(0, 8)}</span>
                      {e.error_codigo && (
                        <span className="text-xs bg-red-950/60 text-red-400 px-1.5 py-0.5 rounded font-mono">{e.error_codigo}</span>
                      )}
                    </div>
                    {e.error_mensaje && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{e.error_mensaje}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-600 shrink-0 whitespace-nowrap">
                    {fmtDateTime(e.generado_at ?? e.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Nota sobre campo tiempo_generacion_ms */}
        <p className="text-xs text-gray-700 pb-2">
          Nota técnica: el campo <code>tiempo_generacion_ms</code> no existe en el schema actual.
          La latencia puede aproximarse con <code>generado_at − created_at</code> cuando ambos campos están disponibles — pendiente para Sprint 3.
        </p>
      </div>
    </div>
  );
}
