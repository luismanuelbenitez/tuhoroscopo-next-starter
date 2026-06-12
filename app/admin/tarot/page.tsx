"use client";
import { useState, useEffect } from "react";
import {
  ShoppingCart,
  Sparkles,
  FileText,
  Users,
  AlertTriangle,
  Star,
  LogOut,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { TarotNav } from "@/components/admin/TarotNav";

// ============================================================================
// Types
// ============================================================================

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
// Page
// ============================================================================

export default function TarotDashboardPage() {
  const [metricas, setMetricas] = useState<MetricasTTC | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  useEffect(() => {
    fetch("/api/admin/tarot/metricas")
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
  }, []);

  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <AdminPanelSwitcher current="ttc" />
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
          <TarotNav current="/admin/tarot" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
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
      </main>
    </div>
  );
}
