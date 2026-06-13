"use client";
import { useState, useEffect, useCallback } from "react";
import { LogOut, AlertCircle, RefreshCw, TrendingUp } from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { AdminNav } from "@/components/admin/AdminNav";

// ── Types ───────────────────────────────────────────────────────────────────

interface PorSemana { semana: string; uyu: number; count: number }
interface PorEstado { estado: string; count: number }

interface PagoReciente {
  id_pago: string;
  suscriptor_id: number | null;
  nombre: string | null;
  whatsapp: string | null;
  amount: number | null;
  mp_payment_id: string | null;
  fecha_pago: string | null;
}

interface ApiData {
  ok: boolean;
  periodo: string;
  total_uyu: number;
  count_uyu: number;
  ticket_prom: number;
  mrr_uyu: number;
  activas_total: number;
  activas_uyu: number;
  nuevas: number;
  canceladas: number;
  total_suscripciones: number;
  por_semana: PorSemana[];
  por_estado: PorEstado[];
  recientes: PagoReciente[];
  motivo?: string;
  detalle?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const PERIODOS = [
  { key: "hoy",  label: "Hoy" },
  { key: "7d",   label: "7 días" },
  { key: "30d",  label: "30 días" },
  { key: "90d",  label: "90 días" },
  { key: "todo", label: "Todo" },
] as const;
type Periodo = typeof PERIODOS[number]["key"];

const ESTADO_CLS: Record<string, string> = {
  activa:              "text-emerald-400",
  activa_provisional:  "text-amber-400",
  pendiente:           "text-sky-400",
  cancelada:           "text-gray-500",
  finalizada:          "text-gray-500",
  suspendida:          "text-red-400",
  expirada_ttl:        "text-gray-600",
};

const ESTADO_LABEL: Record<string, string> = {
  activa:              "Activa",
  activa_provisional:  "Provisional",
  pendiente:           "Pendiente",
  cancelada:           "Cancelada",
  finalizada:          "Finalizada",
  suspendida:          "Suspendida",
  expirada_ttl:        "Expirada TTL",
};

function num(n: number, dec = 0) {
  return n.toLocaleString("es-UY", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", {
    timeZone: "America/Montevideo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function fmtSemana(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short" });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Metric({
  label, value, sub, highlight = false,
}: { label: string; value: string | number; sub?: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? "text-violet-300" : "text-gray-100"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function BarChart({ semanas }: { semanas: PorSemana[] }) {
  const maxUyu = Math.max(...semanas.map((s) => s.uyu), 1);
  const hasData = semanas.some((s) => s.uyu > 0);

  if (!hasData) {
    return <p className="text-xs text-gray-600 text-center py-4">Sin pagos en el período.</p>;
  }

  return (
    <div className="space-y-2">
      {semanas.map((s) => (
        <div key={s.semana} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-16 shrink-0 text-right">{fmtSemana(s.semana)}</span>
          <div className="flex-1">
            {s.uyu > 0 ? (
              <div className="flex items-center gap-2">
                <div
                  className="h-5 rounded-sm bg-violet-500/60"
                  style={{ width: `${(s.uyu / maxUyu) * 100}%`, minWidth: "4px" }}
                />
                <span className="text-xs text-violet-300/80 whitespace-nowrap">$ {num(s.uyu)}</span>
              </div>
            ) : (
              <div className="h-5" />
            )}
          </div>
          {s.count > 0 && (
            <span className="text-xs text-gray-700 shrink-0 w-14 text-right">
              {s.count} pago{s.count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function EstadoBar({ estados, total }: { estados: PorEstado[]; total: number }) {
  if (estados.length === 0) return null;
  return (
    <div className="space-y-2">
      {estados.map((e) => {
        const pct = total > 0 ? Math.round((e.count / total) * 100) : 0;
        return (
          <div key={e.estado} className="flex items-center gap-3">
            <span className={`text-xs w-28 shrink-0 ${ESTADO_CLS[e.estado] ?? "text-gray-400"}`}>
              {ESTADO_LABEL[e.estado] ?? e.estado}
            </span>
            <div className="flex-1 bg-gray-800 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  e.estado === "activa"             ? "bg-emerald-500" :
                  e.estado === "activa_provisional" ? "bg-amber-500"   :
                  e.estado === "pendiente"          ? "bg-sky-500"     : "bg-gray-600"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-6 text-right">{e.count}</span>
            <span className="text-xs text-gray-600 w-8">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IngresosPage() {
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [data, setData] = useState<ApiData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  const cargar = useCallback(async (p: Periodo) => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/ingresos?periodo=${p}`);
      const json: ApiData = await res.json();
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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <AdminPanelSwitcher current="thc" />
          <button
            onClick={handleLogout}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            <LogOut size={15} />
            {cerrandoSesion ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
        <div className="max-w-6xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <AdminNav current="/admin/ingresos" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">

        {/* Título + período */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-violet-400" />
            <h2 className="text-base font-semibold text-white">Ingresos THC</h2>
            <span className="text-xs text-gray-600 ml-1">— solo UYU</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-700 overflow-hidden">
              {PERIODOS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPeriodo(key)}
                  className={`text-xs px-3 py-1.5 transition-colors ${
                    periodo === key
                      ? "bg-gray-700 text-white"
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                  }`}
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

        {data && (
          <>
            {/* ── Métricas ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7 mb-6">
              <Metric
                label="Pagos en período"
                value={data.count_uyu}
                sub="aprobados"
              />
              <Metric
                label="Total UYU"
                value={`$ ${num(data.total_uyu)}`}
                highlight
              />
              <Metric
                label="Ticket promedio"
                value={data.count_uyu > 0 ? `$ ${num(data.ticket_prom)}` : "—"}
              />
              <Metric
                label="MRR"
                value={`$ ${num(data.mrr_uyu)}`}
                sub="mensual recurrente"
                highlight
              />
              <Metric
                label="Activas"
                value={data.activas_uyu}
                sub={`de ${data.total_suscripciones} totales`}
              />
              <Metric
                label="Nuevas"
                value={data.nuevas}
                sub="en el período"
              />
              <Metric
                label="Canceladas"
                value={data.canceladas}
                sub="en el período"
              />
            </div>

            {/* ── Gráfico semanal ──────────────────────────────── */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4 mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                Ingresos por semana (últimas 8)
              </p>
              <BarChart semanas={data.por_semana} />
            </div>

            {/* ── Distribución por estado ──────────────────────── */}
            {data.por_estado.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4 mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                  Suscripciones por estado
                </p>
                <EstadoBar estados={data.por_estado} total={data.total_suscripciones} />
              </div>
            )}

            {/* ── Últimos pagos ────────────────────────────────── */}
            {data.recientes.length > 0 && (
              <div className="rounded-xl border border-gray-800 overflow-hidden">
                <div className="bg-gray-900 px-4 py-2.5 border-b border-gray-800">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Últimos pagos aprobados
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-900/50 text-left">
                      <th className="px-4 py-2 text-xs font-medium text-gray-500">Fecha</th>
                      <th className="px-4 py-2 text-xs font-medium text-gray-500">Suscriptor</th>
                      <th className="px-4 py-2 text-xs font-medium text-gray-500">Monto UYU</th>
                      <th className="px-4 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">MP Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recientes.map((p) => (
                      <tr
                        key={p.id_pago}
                        className="border-t border-gray-800/60 hover:bg-gray-800/20 transition-colors"
                      >
                        <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">
                          {fmtFecha(p.fecha_pago)}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          {p.nombre ? (
                            <span className="text-gray-200">{p.nombre}</span>
                          ) : (
                            <span className="text-gray-600 font-mono">#{p.suscriptor_id ?? "—"}</span>
                          )}
                          {p.whatsapp && (
                            <span className="text-gray-600 ml-1.5">{p.whatsapp}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono font-semibold text-violet-300">
                          $ {num(Number(p.amount ?? 0))}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-600 hidden sm:table-cell truncate max-w-[140px]">
                          {p.mp_payment_id ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.count_uyu === 0 && (
              <p className="text-sm text-gray-600 text-center py-6">
                Sin pagos aprobados en el período seleccionado.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
