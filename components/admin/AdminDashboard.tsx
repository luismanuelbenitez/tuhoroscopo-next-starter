"use client";
import { useState } from "react";
import {
  Users,
  MessageCircle,
  Send,
  AlertTriangle,
  Clock,
  AlertCircle,
  LogOut,
  ShieldCheck,
} from "lucide-react";

interface MetricCard {
  titulo: string;
  valor: number | string;
  icono: React.ReactNode;
  color: string;
  alerta?: boolean;
}

const MOCK_METRICAS: MetricCard[] = [
  {
    titulo: "Premium activos",
    valor: 142,
    icono: <Users size={20} />,
    color: "emerald",
  },
  {
    titulo: "WhatsApp confirmados",
    valor: 138,
    icono: <ShieldCheck size={20} />,
    color: "sky",
  },
  {
    titulo: "Mensajes enviados hoy",
    valor: 97,
    icono: <Send size={20} />,
    color: "violet",
  },
  {
    titulo: "Mensajes fallidos",
    valor: 3,
    icono: <AlertCircle size={20} />,
    color: "red",
    alerta: true,
  },
  {
    titulo: "Contenido pendiente",
    valor: 5,
    icono: <Clock size={20} />,
    color: "amber",
    alerta: true,
  },
  {
    titulo: "Errores recientes",
    valor: 1,
    icono: <AlertTriangle size={20} />,
    color: "red",
    alerta: true,
  },
];

const colorClasses: Record<string, { icon: string; border: string; badge: string }> = {
  emerald: {
    icon: "text-emerald-400",
    border: "border-emerald-800/40",
    badge: "bg-emerald-900/50 text-emerald-300",
  },
  sky: {
    icon: "text-sky-400",
    border: "border-sky-800/40",
    badge: "bg-sky-900/50 text-sky-300",
  },
  violet: {
    icon: "text-violet-400",
    border: "border-violet-800/40",
    badge: "bg-violet-900/50 text-violet-300",
  },
  red: {
    icon: "text-red-400",
    border: "border-red-800/40",
    badge: "bg-red-900/50 text-red-300",
  },
  amber: {
    icon: "text-amber-400",
    border: "border-amber-800/40",
    badge: "bg-amber-900/50 text-amber-300",
  },
};

export function AdminDashboard() {
  const [cargando, setCargando] = useState(false);

  async function handleLogout() {
    setCargando(true);
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
            disabled={cargando}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            <LogOut size={15} />
            {cargando ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Mock data banner */}
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-800/50 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-300">
          <AlertTriangle size={15} className="shrink-0" />
          Datos de ejemplo — sin conexión a Edge Functions aún
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_METRICAS.map((card) => {
            const colors = colorClasses[card.color];
            const mostrarAlerta = card.alerta && Number(card.valor) > 0;
            return (
              <div
                key={card.titulo}
                className={`rounded-xl border bg-gray-900 p-5 flex flex-col gap-3 ${colors.border}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`${colors.icon}`}>{card.icono}</span>
                  {mostrarAlerta && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                      alerta
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold">{card.valor}</p>
                  <p className="text-sm text-gray-400 mt-0.5">{card.titulo}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
