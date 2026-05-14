"use client";
import { useState, useEffect } from "react";
import {
  Users,
  MessageCircle,
  Send,
  AlertTriangle,
  Clock,
  AlertCircle,
  LogOut,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SuscriptoresMetrica {
  premium_activos_actuales: number;
  whatsapp_confirmados_actuales: number;
  pausados_actuales: number;
  altas_periodo: number;
  tasa_confirmacion_whatsapp_pct: number | null;
}

interface SuscripcionesMetrica {
  activadas_definitivamente_periodo: number;
  creadas_periodo: number;
}

interface MetricasResponse {
  ok: boolean;
  periodo: { desde_utc: string; hasta_utc: string };
  suscriptores: SuscriptoresMetrica;
  suscripciones: SuscripcionesMetrica;
}

// ---------------------------------------------------------------------------
// Hook: fetch métricas reales
// ---------------------------------------------------------------------------

function useMetricasBasicas() {
  const [data, setData] = useState<MetricasResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/metricas-basicas")
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          const detalle: string = json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`;
          setErrorMsg(detalle);
          return;
        }
        setData(json as MetricasResponse);
      })
      .catch((e: unknown) => {
        setErrorMsg(e instanceof Error ? e.message : "Error de red");
      })
      .finally(() => setCargando(false));
  }, []);

  return { data, cargando, errorMsg };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fechaCorta(iso: string) {
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// PremiumActivosCard
// ---------------------------------------------------------------------------

function PremiumActivosCard({ metricas }: { metricas: MetricasResponse | null }) {
  const [abierto, setAbierto] = useState(false);

  const s = metricas?.suscriptores;
  const sus = metricas?.suscripciones;
  const valor = s?.premium_activos_actuales ?? "—";
  const tasa =
    s?.tasa_confirmacion_whatsapp_pct != null
      ? `${s.tasa_confirmacion_whatsapp_pct}%`
      : "—";

  return (
    <div
      className="rounded-xl border border-emerald-800/40 bg-gray-900 p-5 flex flex-col gap-3 cursor-pointer select-none transition-colors hover:border-emerald-700/60"
      onClick={() => setAbierto((v) => !v)}
    >
      <div className="flex items-center justify-between">
        <span className="text-emerald-400">
          <Users size={20} />
        </span>
        <span className="text-gray-600">
          {abierto ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </div>
      <div>
        <p className="text-2xl font-bold">{valor}</p>
        <p className="text-sm text-gray-400 mt-0.5">Premium activos</p>
      </div>

      {abierto && s && (
        <div className="mt-1 pt-3 border-t border-gray-800 flex flex-col gap-1.5 text-sm">
          <Row label="WhatsApp confirmados" valor={`${s.whatsapp_confirmados_actuales} / ${s.premium_activos_actuales}`} />
          <Row label="Tasa confirmación" valor={tasa} />
          <Row label="Pausados" valor={s.pausados_actuales} />
          <Row label="Altas hoy" valor={s.altas_periodo} />
          {sus && (
            <Row label="Suscripciones activadas hoy" valor={sus.activadas_definitivamente_periodo} />
          )}
          {metricas?.periodo && (
            <p className="text-xs text-gray-600 mt-1">
              Período UTC: {fechaCorta(metricas.periodo.desde_utc)} → {fechaCorta(metricas.periodo.hasta_utc)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium">{valor}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock cards (restantes)
// ---------------------------------------------------------------------------

interface MockCard {
  titulo: string;
  valor: number | string;
  icono: React.ReactNode;
  color: string;
  alerta?: boolean;
}

const MOCK_CARDS: MockCard[] = [
  {
    titulo: "WhatsApp confirmados",
    valor: "—",
    icono: <ShieldCheck size={20} />,
    color: "sky",
  },
  {
    titulo: "Mensajes enviados hoy",
    valor: "—",
    icono: <Send size={20} />,
    color: "violet",
  },
  {
    titulo: "Mensajes fallidos",
    valor: "—",
    icono: <AlertCircle size={20} />,
    color: "red",
  },
  {
    titulo: "Contenido pendiente",
    valor: "—",
    icono: <Clock size={20} />,
    color: "amber",
  },
  {
    titulo: "Errores recientes",
    valor: "—",
    icono: <AlertTriangle size={20} />,
    color: "red",
  },
];

const colorClasses: Record<string, { icon: string; border: string }> = {
  sky: { icon: "text-sky-400", border: "border-sky-800/40" },
  violet: { icon: "text-violet-400", border: "border-violet-800/40" },
  red: { icon: "text-red-400", border: "border-red-800/40" },
  amber: { icon: "text-amber-400", border: "border-amber-800/40" },
};

function PlaceholderCard({ card }: { card: MockCard }) {
  const colors = colorClasses[card.color];
  return (
    <div className={`rounded-xl border bg-gray-900 p-5 flex flex-col gap-3 ${colors.border}`}>
      <span className={colors.icon}>{card.icono}</span>
      <div>
        <p className="text-2xl font-bold text-gray-600">{card.valor}</p>
        <p className="text-sm text-gray-400 mt-0.5">{card.titulo}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminDashboard
// ---------------------------------------------------------------------------

export function AdminDashboard() {
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const { data, cargando, errorMsg } = useMetricasBasicas();

  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle size={22} className="text-violet-400" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">Panel THC</h1>
              <p className="text-xs text-gray-500 leading-tight">Administración operativa</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            <LogOut size={15} />
            {cerrandoSesion ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Estado de carga / error */}
        {cargando && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 text-sm text-gray-400">
            <span className="animate-pulse">Cargando métricas...</span>
          </div>
        )}
        {errorMsg && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}
        {!cargando && !errorMsg && !data?.ok && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-800/50 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-300">
            <AlertTriangle size={15} className="shrink-0" />
            La Edge Function respondió pero reportó un error interno.
          </div>
        )}
        {!cargando && !errorMsg && data?.ok && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-800/50 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-300">
            <AlertTriangle size={15} className="shrink-0" />
            5 cards restantes en placeholder — se conectarán gradualmente
          </div>
        )}

        {/* Grid de cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <PremiumActivosCard metricas={data} />
          {MOCK_CARDS.map((card) => (
            <PlaceholderCard key={card.titulo} card={card} />
          ))}
        </div>
      </main>
    </div>
  );
}
