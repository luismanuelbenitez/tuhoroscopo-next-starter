"use client";
import { useState, useEffect, useCallback } from "react";
import { LogOut, AlertCircle, RefreshCw, TrendingUp } from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { TarotNav } from "@/components/admin/TarotNav";

// ============================================================================
// Types
// ============================================================================

interface PorSemana { semana: string; uyu: number; ars: number; count: number }

interface PagoReciente {
  id: string;
  orden_id: string;
  monto: number | null;
  moneda: string;
  mp_payment_type: string | null;
  created_at: string;
}

interface TtcData {
  total_uyu: number;
  total_ars: number;
  count_uyu: number;
  count_ars: number;
  ticket_prom_uyu: number;
  ticket_prom_ars: number;
  por_semana: PorSemana[];
  recientes: PagoReciente[];
}

interface ThcEstado { estado: string; count: number }

interface ThcData {
  activas_total: number;
  activas_uyu: number;
  activas_ars: number;
  mrr_uyu: number;
  mrr_ars: number;
  nuevas_periodo: number;
  canceladas_periodo: number;
  total_suscripciones: number;
  por_estado: ThcEstado[];
}

interface ApiResponse {
  ok: boolean;
  periodo: string;
  ttc: TtcData;
  thc: ThcData;
  motivo?: string;
  detalle?: string;
}

// ============================================================================
// Helpers
// ============================================================================

const PERIODOS = [
  { key: "hoy",  label: "Hoy" },
  { key: "7d",   label: "7 días" },
  { key: "30d",  label: "30 días" },
  { key: "90d",  label: "90 días" },
  { key: "todo", label: "Todo" },
] as const;
type Periodo = typeof PERIODOS[number]["key"];

const ESTADO_LABEL: Record<string, string> = {
  activo:      "Activo",
  provisional: "Provisional",
  cancelado:   "Cancelado",
  vencido:     "Vencido",
  pausado:     "Pausado",
};
const ESTADO_CLS: Record<string, string> = {
  activo:      "text-emerald-400",
  provisional: "text-amber-400",
  cancelado:   "text-gray-500",
  vencido:     "text-red-400",
  pausado:     "text-sky-400",
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", dateStyle: "short", timeStyle: "short" });
}

function fmtSemana(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short" });
}

function num(n: number, dec = 0) {
  return n.toLocaleString("es-UY", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ============================================================================
// Metric card
// ============================================================================

function Metric({ label, value, sub, amber }: { label: string; value: string | number; sub?: string; amber?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${amber ? "text-amber-300" : "text-gray-100"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ============================================================================
// Mini bar chart (relative widths, no external lib)
// ============================================================================

function BarChart({ semanas }: { semanas: PorSemana[] }) {
  const maxUyu = Math.max(...semanas.map((s) => s.uyu), 1);
  const maxArs = Math.max(...semanas.map((s) => s.ars), 1);
  const hasData = semanas.some((s) => s.uyu > 0 || s.ars > 0);

  if (!hasData) {
    return <p className="text-xs text-gray-600 text-center py-4">Sin datos en el período.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500/70" /><span className="text-xs text-gray-500">UYU</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-sky-500/70" /><span className="text-xs text-gray-500">ARS</span></div>
      </div>
      {semanas.map((s) => (
        <div key={s.semana} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-16 shrink-0 text-right">{fmtSemana(s.semana)}</span>
          <div className="flex-1 space-y-1">
            {s.uyu > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="h-4 rounded-sm bg-amber-500/60" style={{ width: `${(s.uyu / maxUyu) * 100}%`, minWidth: "4px" }} />
                <span className="text-xs text-amber-400/80 whitespace-nowrap">{num(s.uyu)}</span>
              </div>
            )}
            {s.ars > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="h-4 rounded-sm bg-sky-500/60" style={{ width: `${(s.ars / maxArs) * 100}%`, minWidth: "4px" }} />
                <span className="text-xs text-sky-400/80 whitespace-nowrap">{num(s.ars)}</span>
              </div>
            )}
            {s.uyu === 0 && s.ars === 0 && (
              <div className="h-4" />
            )}
          </div>
          {s.count > 0 && <span className="text-xs text-gray-700 shrink-0">{s.count} pago{s.count !== 1 ? "s" : ""}</span>}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function IngresosPage() {
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  const cargar = useCallback(async (p: Periodo) => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/tarot/ingresos?periodo=${p}`);
      const json: ApiResponse = await res.json();
      if (json.ok) {
        setData(json);
      } else {
        setErrorMsg(json.detalle ?? json.motivo ?? "Error al cargar datos");
      }
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(periodo); }, [cargar, periodo]);

  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  const ttc = data?.ttc;
  const thc = data?.thc;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <AdminPanelSwitcher current="ttc" />
          <button
            onClick={handleLogout} disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            <LogOut size={15} />
            {cerrandoSesion ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
        <div className="max-w-6xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <TarotNav current="/admin/tarot/ingresos" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Header + period selector */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-amber-400" />
            <h2 className="text-base font-semibold text-white">Ingresos</h2>
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

        {/* ── TTC ────────────────────────────────────────────── */}
        {ttc && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-amber-500">Tu Tirada Cósmica (TTC)</span>
              <div className="flex-1 h-px bg-amber-900/40" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
              <Metric label="Pagos UYU"       value={ttc.count_uyu}            amber />
              <Metric label="Total UYU"       value={`$ ${num(ttc.total_uyu)}`} amber />
              <Metric label="Ticket prom UYU" value={`$ ${num(ttc.ticket_prom_uyu)}`} />
              <Metric label="Pagos ARS"       value={ttc.count_ars} />
              <Metric label="Total ARS"       value={`$ ${num(ttc.total_ars)}`} />
              <Metric label="Ticket prom ARS" value={`$ ${num(ttc.ticket_prom_ars)}`} />
            </div>

            {/* Bar chart — last 8 weeks (only meaningful for 30d / 90d / todo) */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4 mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Ingresos por semana (últimas 8)</p>
              <BarChart semanas={ttc.por_semana} />
            </div>

            {/* Recent payments */}
            {ttc.recientes.length > 0 && (
              <div className="rounded-xl border border-gray-800 overflow-hidden">
                <div className="bg-gray-900 px-4 py-2.5 border-b border-gray-800">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Últimos pagos aprobados</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-900/50 text-left">
                      <th className="px-4 py-2 text-xs font-medium text-gray-500">Fecha</th>
                      <th className="px-4 py-2 text-xs font-medium text-gray-500">Monto</th>
                      <th className="px-4 py-2 text-xs font-medium text-gray-500">Tipo</th>
                      <th className="px-4 py-2 text-xs font-medium text-gray-500 font-mono">Orden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ttc.recientes.map((p) => (
                      <tr key={p.id} className="border-t border-gray-800/60 hover:bg-gray-800/20 transition-colors">
                        <td className="px-4 py-2 text-xs text-gray-400">{fmt(p.created_at)}</td>
                        <td className="px-4 py-2 font-mono text-sm font-semibold text-amber-300">
                          {p.moneda} {num(Number(p.monto ?? 0))}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">{p.mp_payment_type ?? "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-600 truncate max-w-[160px]">{p.orden_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ttc.count_uyu === 0 && ttc.count_ars === 0 && (
              <p className="text-sm text-gray-600 text-center py-4">Sin pagos aprobados en el período seleccionado.</p>
            )}
          </section>
        )}

        {/* ── THC ────────────────────────────────────────────── */}
        {thc && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-violet-400">Tu Oráculo · Horóscopo</span>
              <div className="flex-1 h-px bg-violet-900/40" />
              <span className="text-xs text-gray-600">MRR = suscripciones activas autorizadas. Período aplica a nuevas/canceladas.</span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-6">
              <Metric label="Activas (total)"  value={thc.activas_total}      sub={`UYU: ${thc.activas_uyu} · ARS: ${thc.activas_ars}`} />
              <Metric label="MRR UYU"          value={`$ ${num(thc.mrr_uyu)}`} sub="mensual recurrente" />
              <Metric label="MRR ARS"          value={`$ ${num(thc.mrr_ars)}`} sub="mensual recurrente" />
              <Metric label="Nuevas (período)" value={thc.nuevas_periodo}     sub={`de ${thc.total_suscripciones} totales`} />
              <Metric label="Canceladas"        value={thc.canceladas_periodo} />
            </div>

            {/* Estado distribution */}
            {thc.por_estado.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Distribución por estado</p>
                <div className="space-y-2">
                  {thc.por_estado.map((e) => {
                    const pct = thc.total_suscripciones > 0
                      ? Math.round((e.count / thc.total_suscripciones) * 100)
                      : 0;
                    return (
                      <div key={e.estado} className="flex items-center gap-3">
                        <span className={`text-xs w-24 shrink-0 ${ESTADO_CLS[e.estado] ?? "text-gray-400"}`}>
                          {ESTADO_LABEL[e.estado] ?? e.estado}
                        </span>
                        <div className="flex-1 bg-gray-800 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full ${e.estado === "activo" ? "bg-emerald-500" : e.estado === "provisional" ? "bg-amber-500" : "bg-gray-600"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-8 text-right">{e.count}</span>
                        <span className="text-xs text-gray-600 w-8">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
