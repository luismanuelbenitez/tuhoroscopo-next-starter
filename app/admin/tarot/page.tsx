"use client";
import { useState, useEffect } from "react";
import {
  ShoppingCart,
  Sparkles,
  FileText,
  Users,
  AlertTriangle,
  Star,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// ============================================================================
// Types
// ============================================================================

interface FunnelData {
  periodo_dias: number;
  visitas: number;
  vistas_producto: number;
  checkout_iniciado: number;
  pagos_aprobados: number;
  lectura_ok: number;
  pdf_ok: number;
  whatsapp_ok: number;
  lectura_fallida: number;
  pdf_fallido: number;
  whatsapp_fallido: number;
  conv_visita_a_pago: number;
  conv_checkout_a_pago: number;
  conv_pago_a_whatsapp: number;
  clientes_recurrentes: number;
}

interface UtmRow {
  utm_source: string;
  utm_campaign: string | null;
  ventas: number;
  total_uyu: number;
}

interface MetricasTTC {
  ok: boolean;
  ordenes: {
    total: number;
    hoy: number;
    pagadas: number;
    completadas: number;
    con_error: number;
  };
  lecturas: { total: number; hoy: number };
  pdfs: { total: number; hoy: number };
  clientes: { total: number };
  funnel?: FunnelData;
  ventas_por_utm?: UtmRow[];
  reclamos?: { total: number; abiertos: number };
}

// ============================================================================
// MetricCard (reutiliza el patrón de AdminDashboard)
// ============================================================================

interface MetricCardProps {
  iconColor: string;
  borderColor: string;
  hoverBorderColor: string;
  alertBadgeColor?: string;
  icon: React.ReactNode;
  valor: number | string;
  titulo: string;
  alerta?: boolean;
  children?: React.ReactNode;
}

function MetricCard({
  iconColor,
  borderColor,
  hoverBorderColor,
  alertBadgeColor,
  icon,
  valor,
  titulo,
  alerta,
  children,
}: MetricCardProps) {
  const [abierto, setAbierto] = useState(false);
  const clicable = children != null && children !== false;
  const valorVacio = valor === "—";

  return (
    <div
      className={`rounded-xl border ${borderColor} bg-gray-900 p-5 flex flex-col gap-3
        ${clicable ? `cursor-pointer select-none transition-colors ${hoverBorderColor}` : ""}`}
      onClick={clicable ? () => setAbierto((v) => !v) : undefined}
    >
      <div className="flex items-center justify-between">
        <span className={iconColor}>{icon}</span>
        <div className="flex items-center gap-2">
          {alerta && alertBadgeColor && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${alertBadgeColor}`}>
              alerta
            </span>
          )}
          {clicable && (
            <span className="text-gray-600">
              {abierto ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </span>
          )}
        </div>
      </div>
      <div>
        <p className={`text-2xl font-bold ${valorVacio ? "text-gray-600" : ""}`}>{valor}</p>
        <p className="text-sm text-gray-400 mt-0.5">{titulo}</p>
      </div>
      {abierto && children && (
        <div className="mt-1 pt-3 border-t border-gray-800">{children}</div>
      )}
    </div>
  );
}

function Row({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium">{String(valor)}</span>
    </div>
  );
}

// ============================================================================
// Cards
// ============================================================================

function CardOrdenes({ m }: { m: MetricasTTC | null }) {
  const valor = m?.ordenes.total ?? "—";
  return (
    <MetricCard
      iconColor="text-amber-400"
      borderColor="border-amber-800/40"
      hoverBorderColor="hover:border-amber-700/60"
      icon={<ShoppingCart size={20} />}
      valor={valor}
      titulo="Órdenes totales"
    >
      {m?.ordenes && (
        <div className="flex flex-col gap-1.5 text-sm">
          <Row label="Hoy" valor={m.ordenes.hoy} />
          <Row label="Con pago" valor={m.ordenes.pagadas} />
          <Row label="Completadas" valor={m.ordenes.completadas} />
          <Row label="Con error" valor={m.ordenes.con_error} />
        </div>
      )}
    </MetricCard>
  );
}

function CardOrdenesHoy({ m }: { m: MetricasTTC | null }) {
  const valor = m?.ordenes.hoy ?? "—";
  return (
    <MetricCard
      iconColor="text-violet-400"
      borderColor="border-violet-800/40"
      hoverBorderColor="hover:border-violet-700/60"
      icon={<Star size={20} />}
      valor={valor}
      titulo="Órdenes hoy"
    >
      {m?.ordenes && (
        <div className="flex flex-col gap-1.5 text-sm">
          <Row label="Completadas hoy" valor={m.ordenes.hoy > 0 ? "ver órdenes" : "—"} />
          <Row label="Total histórico" valor={m.ordenes.total} />
        </div>
      )}
    </MetricCard>
  );
}

function CardLecturas({ m }: { m: MetricasTTC | null }) {
  const valor = m?.lecturas.total ?? "—";
  return (
    <MetricCard
      iconColor="text-sky-400"
      borderColor="border-sky-800/40"
      hoverBorderColor="hover:border-sky-700/60"
      icon={<Sparkles size={20} />}
      valor={valor}
      titulo="Lecturas generadas"
    >
      {m?.lecturas && (
        <div className="flex flex-col gap-1.5 text-sm">
          <Row label="Hoy" valor={m.lecturas.hoy} />
          <Row label="Total vigentes" valor={m.lecturas.total} />
        </div>
      )}
    </MetricCard>
  );
}

function CardPdfs({ m }: { m: MetricasTTC | null }) {
  const valor = m?.pdfs.total ?? "—";
  return (
    <MetricCard
      iconColor="text-emerald-400"
      borderColor="border-emerald-800/40"
      hoverBorderColor="hover:border-emerald-700/60"
      icon={<FileText size={20} />}
      valor={valor}
      titulo="PDFs generados"
    >
      {m?.pdfs && (
        <div className="flex flex-col gap-1.5 text-sm">
          <Row label="Hoy" valor={m.pdfs.hoy} />
          <Row label="Total generados" valor={m.pdfs.total} />
        </div>
      )}
    </MetricCard>
  );
}

function CardClientes({ m }: { m: MetricasTTC | null }) {
  const valor = m?.clientes.total ?? "—";
  return (
    <MetricCard
      iconColor="text-indigo-400"
      borderColor="border-indigo-800/40"
      hoverBorderColor="hover:border-indigo-700/60"
      icon={<Users size={20} />}
      valor={valor}
      titulo="Clientes únicos"
    />
  );
}

function CardErrores({ m }: { m: MetricasTTC | null }) {
  const valor = m?.ordenes.con_error ?? "—";
  const alerta = m != null && m.ordenes.con_error > 0;
  return (
    <MetricCard
      iconColor="text-red-400"
      borderColor="border-red-800/40"
      hoverBorderColor="hover:border-red-700/60"
      alertBadgeColor="bg-red-900/50 text-red-300"
      icon={<AlertTriangle size={20} />}
      valor={valor}
      titulo="Órdenes con error"
      alerta={alerta}
    >
      {m?.ordenes && (
        <div className="flex flex-col gap-1.5 text-sm">
          <Row label="Errores activos" valor={m.ordenes.con_error} />
          <p className="text-xs text-gray-600 mt-1">
            <a href="/admin/tarot/ordenes" className="text-amber-400/70 hover:text-amber-400 underline">
              Ver órdenes →
            </a>
          </p>
        </div>
      )}
    </MetricCard>
  );
}

// ============================================================================
// Funnel de validación
// ============================================================================

const PERIODOS_FUNNEL = [
  { label: "Hoy",    dias: 1  },
  { label: "7 días", dias: 7  },
  { label: "30 días", dias: 30 },
  { label: "90 días", dias: 90 },
] as const;

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function FunnelStep({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[68px]">
      <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-xs text-gray-500 text-center leading-tight">{label}</span>
    </div>
  );
}

function FunnelArrow({ rate }: { rate?: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1 shrink-0">
      <span className="text-gray-700 text-base leading-none">→</span>
      {rate !== undefined && (
        <span className="text-[11px] text-gray-600 tabular-nums">{pct(rate)}</span>
      )}
    </div>
  );
}

function SeccionFunnel({
  m,
  periodo,
  onPeriodo,
}: {
  m: MetricasTTC | null;
  periodo: number;
  onPeriodo: (p: number) => void;
}) {
  const f   = m?.funnel;
  const utm = m?.ventas_por_utm ?? [];
  const rec = m?.reclamos;

  const sinDatos =
    !f ||
    (f.visitas === 0 &&
      f.checkout_iniciado === 0 &&
      f.pagos_aprobados === 0 &&
      f.lectura_ok === 0 &&
      f.pdf_ok === 0 &&
      f.whatsapp_ok === 0);

  return (
    <div className="mt-10">
      {/* Header + selector de período */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="text-lg font-semibold text-white">Funnel de validación</h2>
        <div className="flex gap-1">
          {PERIODOS_FUNNEL.map((p) => (
            <button
              key={p.dias}
              onClick={() => onPeriodo(p.dias)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                periodo === p.dias
                  ? "border-amber-500 bg-amber-900/40 text-amber-300"
                  : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Seguimiento mínimo para validar compradores reales de tarot.
      </p>

      {sinDatos ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-10 text-center text-sm text-gray-500">
          Todavía no hay eventos de funnel para el período seleccionado.
          <br />
          <span className="text-xs text-gray-600 mt-1 block">
            El tracking se registra desde el momento de activación. Las ventas por canal se muestran a continuación si existen órdenes pagadas en el período.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Funnel visual */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-[11px] text-gray-600 uppercase tracking-wide mb-4">Tráfico → Conversión</p>
            <div className="flex items-center flex-wrap gap-y-4 overflow-x-auto pb-1">
              <FunnelStep label="Visitas"   value={f!.visitas}           color="text-gray-200"   />
              <FunnelArrow />
              <FunnelStep label="Producto"  value={f!.vistas_producto}   color="text-violet-400" />
              <FunnelArrow />
              <FunnelStep label="Checkout"  value={f!.checkout_iniciado} color="text-amber-400"  />
              <FunnelArrow rate={f!.conv_checkout_a_pago} />
              <FunnelStep label="Pago"      value={f!.pagos_aprobados}   color="text-emerald-400"/>
            </div>

            <p className="text-[11px] text-gray-600 uppercase tracking-wide mt-5 mb-4">Pipeline por pedido</p>
            <div className="flex items-center flex-wrap gap-y-4 overflow-x-auto pb-1">
              <FunnelStep label="Lectura ✓" value={f!.lectura_ok}  color="text-sky-400"    />
              <FunnelArrow />
              <FunnelStep label="PDF ✓"     value={f!.pdf_ok}      color="text-indigo-400" />
              <FunnelArrow rate={f!.conv_pago_a_whatsapp} />
              <FunnelStep label="WA ✓"      value={f!.whatsapp_ok} color="text-emerald-400"/>
            </div>
          </div>

          {/* Tasas + clientes recurrentes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Visita → Pago</p>
              <p className="text-xl font-bold text-white tabular-nums">{pct(f!.conv_visita_a_pago)}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Checkout → Pago</p>
              <p className="text-xl font-bold text-white tabular-nums">{pct(f!.conv_checkout_a_pago)}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Pago → WhatsApp</p>
              <p className="text-xl font-bold text-white tabular-nums">{pct(f!.conv_pago_a_whatsapp)}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Clientes recurrentes</p>
              <p className="text-xs text-gray-700 mb-1">histórico total</p>
              <p className="text-xl font-bold text-indigo-400 tabular-nums">{f!.clientes_recurrentes}</p>
            </div>
          </div>

          {/* Chips de alerta: fallos + reclamos */}
          {(f!.lectura_fallida > 0 ||
            f!.pdf_fallido > 0 ||
            f!.whatsapp_fallido > 0 ||
            (rec && rec.abiertos > 0)) && (
            <div className="flex flex-wrap gap-2">
              {f!.lectura_fallida > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-900/40 border border-red-700/50 text-red-300">
                  ⚠ {f!.lectura_fallida} lectura{f!.lectura_fallida !== 1 ? "s" : ""} fallida{f!.lectura_fallida !== 1 ? "s" : ""}
                </span>
              )}
              {f!.pdf_fallido > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-900/40 border border-red-700/50 text-red-300">
                  ⚠ {f!.pdf_fallido} PDF{f!.pdf_fallido !== 1 ? "s" : ""} fallido{f!.pdf_fallido !== 1 ? "s" : ""}
                </span>
              )}
              {f!.whatsapp_fallido > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-900/40 border border-red-700/50 text-red-300">
                  ⚠ {f!.whatsapp_fallido} WhatsApp fallido{f!.whatsapp_fallido !== 1 ? "s" : ""}
                </span>
              )}
              {rec && rec.abiertos > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-900/40 border border-amber-700/50 text-amber-300">
                  ⚠ {rec.abiertos} reclamo{rec.abiertos !== 1 ? "s" : ""} abierto{rec.abiertos !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabla UTM — siempre visible si hay datos, independiente del estado del funnel */}
      {utm.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden mt-5">
          <div className="px-5 py-3 border-b border-gray-800">
            <p className="text-sm font-medium text-white">Ventas por canal / UTM</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Órdenes pagadas en el período. Fuente: tarot_ordenes (utm_source / utm_campaign).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">Fuente</th>
                  <th className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">Campaña</th>
                  <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Ventas</th>
                  <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Total UYU</th>
                </tr>
              </thead>
              <tbody>
                {utm.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-5 py-2.5 text-amber-300 font-medium">{row.utm_source}</td>
                    <td className="px-5 py-2.5 text-gray-400">
                      {row.utm_campaign ?? <span className="text-gray-700">—</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right text-white font-medium tabular-nums">
                      {row.ventas}
                    </td>
                    <td className="px-5 py-2.5 text-right text-emerald-400 font-medium tabular-nums">
                      {row.total_uyu > 0
                        ? `$${row.total_uyu.toLocaleString("es-UY")}`
                        : <span className="text-gray-700">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function TarotDashboardPage() {
  const [metricas, setMetricas] = useState<MetricasTTC | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState(30);

  useEffect(() => {
    setCargando(true);
    setErrorMsg(null);
    fetch(`/api/admin/tarot/metricas?periodo=${periodo}`)
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
          return;
        }
        setMetricas(json as MetricasTTC);
      })
      .catch((e: unknown) => setErrorMsg(e instanceof Error ? e.message : "Error de red"))
      .finally(() => setCargando(false));
  }, [periodo]);

  return (
    <TarotAdminShell>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Panel · Tarot (TTC)</h2>
            <p className="text-xs text-gray-500 mt-0.5">Métricas, órdenes y estado de lecturas</p>
          </div>
          <a
            href="/admin/tarot/config"
            className="text-xs text-amber-500/70 hover:text-amber-300 transition-colors"
          >
            Config →
          </a>
        </div>
        {cargando && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 text-sm text-gray-400">
            <span className="animate-pulse">Cargando métricas…</span>
          </div>
        )}
        {errorMsg && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardOrdenes m={metricas} />
          <CardOrdenesHoy m={metricas} />
          <CardLecturas m={metricas} />
          <CardPdfs m={metricas} />
          <CardClientes m={metricas} />
          <CardErrores m={metricas} />
        </div>

        <SeccionFunnel m={metricas} periodo={periodo} onPeriodo={setPeriodo} />
      </main>
    </TarotAdminShell>
  );
}
