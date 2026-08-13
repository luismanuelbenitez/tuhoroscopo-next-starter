"use client";
import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, RefreshCw, Check, CheckCheck, ExternalLink } from "lucide-react";

interface AlertaEvento {
  id: string;
  tipo_alerta: string;
  severidad: "success" | "warning" | "error";
  titulo: string;
  mensaje: string;
  orden_id: string | null;
  metadata: Record<string, string>;
  creada_at: string;
  leida_at: string | null;
}

const FILTROS = [
  { key: "all",       label: "Todas"     },
  { key: "ventas",    label: "Ventas"    },
  { key: "warnings",  label: "Avisos"    },
  { key: "errores",   label: "Errores"   },
  { key: "no_leidas", label: "No leídas" },
] as const;

function tiempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hs = Math.floor(mins / 60);
  if (hs < 24)   return `hace ${hs}h`;
  return `hace ${Math.floor(hs / 24)}d`;
}

function SeveridadIcon({ s }: { s: "success" | "warning" | "error" }) {
  if (s === "success") return <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />;
  if (s === "warning") return <AlertTriangle size={15} className="text-amber-400 shrink-0" />;
  return <AlertCircle size={15} className="text-red-400 shrink-0" />;
}

export function TarotAlertasEventos() {
  const [eventos, setEventos]         = useState<AlertaEvento[]>([]);
  const [filtro, setFiltro]           = useState<string>("all");
  const [cargando, setCargando]       = useState(true);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const [marcandoId, setMarcandoId]   = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/tarot/alertas/eventos?filtro=${filtro}&limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setEventos(json.eventos ?? []);
    } catch {
      setErrorMsg("Error al cargar eventos");
    } finally {
      setCargando(false);
    }
  }, [filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  async function marcarLeida(id: string) {
    setMarcandoId(id);
    try {
      await fetch(`/api/admin/tarot/alertas/eventos/${id}`, { method: "PATCH" });
      setEventos(prev =>
        prev.map(e => e.id === id ? { ...e, leida_at: new Date().toISOString() } : e),
      );
    } catch { /* silencioso */ } finally {
      setMarcandoId(null);
    }
  }

  async function marcarTodas() {
    setMarcandoTodas(true);
    try {
      await fetch("/api/admin/tarot/alertas/marcar-todas", { method: "POST" });
      const ahora = new Date().toISOString();
      setEventos(prev => prev.map(e => ({ ...e, leida_at: e.leida_at ?? ahora })));
    } catch { /* silencioso */ } finally {
      setMarcandoTodas(false);
    }
  }

  const noLeidas = eventos.filter(e => !e.leida_at).length;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex gap-1 flex-wrap">
          {FILTROS.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                filtro === f.key
                  ? "border-amber-500 bg-amber-900/40 text-amber-300"
                  : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {noLeidas > 0 && (
            <button
              onClick={marcarTodas}
              disabled={marcandoTodas}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-md border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors disabled:opacity-50"
            >
              <CheckCheck size={13} />
              Marcar todas leídas
            </button>
          )}
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-md border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
          >
            <RefreshCw size={12} className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Loading */}
      {cargando && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-8 text-center text-sm text-gray-500 animate-pulse">
          Cargando eventos…
        </div>
      )}

      {/* Error */}
      {!cargando && errorMsg && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Empty */}
      {!cargando && !errorMsg && eventos.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-12 text-center">
          <p className="text-sm text-gray-600">Sin eventos en esta categoría</p>
        </div>
      )}

      {/* List */}
      {!cargando && eventos.length > 0 && (
        <div className="space-y-2">
          {eventos.map(evento => (
            <div
              key={evento.id}
              className={`rounded-xl border px-4 py-3 flex items-start gap-3 transition-colors ${
                evento.leida_at
                  ? "border-gray-800 bg-gray-900/40 opacity-60"
                  : "border-gray-700 bg-gray-900"
              }`}
            >
              <div className="mt-0.5">
                <SeveridadIcon s={evento.severidad} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-100">{evento.titulo}</span>
                  <span className="text-xs text-gray-600">{tiempoRelativo(evento.creada_at)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{evento.mensaje}</p>
                {evento.orden_id && (
                  <a
                    href={`/admin/tarot/ordenes/${evento.orden_id}`}
                    className="inline-flex items-center gap-1 mt-1.5 text-xs text-amber-400/80 hover:text-amber-300 transition-colors"
                  >
                    Ver orden <ExternalLink size={10} />
                  </a>
                )}
              </div>
              {!evento.leida_at && (
                <button
                  onClick={() => marcarLeida(evento.id)}
                  disabled={marcandoId === evento.id}
                  title="Marcar como leída"
                  className="shrink-0 p-1.5 rounded-md text-gray-600 hover:text-emerald-400 hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <Check size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
