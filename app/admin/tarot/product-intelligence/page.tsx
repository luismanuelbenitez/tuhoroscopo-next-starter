"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { type Route } from "next";
import {
  Brain, Sparkles, Boxes, BarChart3, Target, Mic2,
  FlaskConical, AlertCircle, CheckCircle2, Clock,
  RefreshCw, Loader2, ArrowRight, TrendingUp, Zap,
} from "lucide-react";

type OverviewData = {
  ok: boolean;
  prompt: {
    version: number | null;
    version_label: string | null;
    ia_modelo_override: string | null;
    updated_at: string | null;
  };
  modelo: { global: string; temperatura: string; max_tokens: string };
  entrega: { mp_modo: string | null; whatsapp_modo: string | null; canal: string | null };
  ni: { total: number; aprobadas: number; implementadas: number };
  benchmark: { casos_evaluados: number };
  lecturas_hoy: { total: number; exitosas: number; errores: number };
  errores_recientes: Array<{
    id: string;
    error_codigo?: string;
    error_mensaje?: string;
    created_at: string;
  }>;
};

type PipelineStage = {
  id: string;
  label: string;
  sublabel: string;
  status: "ok" | "warn" | "error" | "neutral";
  detail: string;
  href: Route<string> | null;
};

function StatusDot({ status }: { status: PipelineStage["status"] }) {
  const cls =
    status === "ok" ? "bg-emerald-400" :
    status === "warn" ? "bg-amber-400" :
    status === "error" ? "bg-red-400" :
    "bg-gray-600";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function buildPipeline(d: OverviewData): PipelineStage[] {
  const modelo = d.prompt.ia_modelo_override ?? d.modelo.global ?? "—";
  const tasaError = d.lecturas_hoy.total > 0
    ? (d.lecturas_hoy.errores / d.lecturas_hoy.total) * 100
    : 0;

  return [
    {
      id: "prompt",
      label: "Prompt",
      sublabel: "Motor de instrucciones",
      status: d.prompt.version != null ? "ok" : "warn",
      detail: d.prompt.version_label
        ? `v${d.prompt.version ?? "?"} — ${d.prompt.version_label}`
        : d.prompt.version != null ? `Versión ${d.prompt.version}` : "Sin versión registrada",
      href: "/admin/tarot/product-intelligence/prompt" as Route<string>,
    },
    {
      id: "ni",
      label: "Motor Narrativo",
      sublabel: "Reglas de estilo",
      status: d.ni.total === 0 ? "warn" : d.ni.implementadas > 0 ? "ok" : "neutral",
      detail: d.ni.total === 0
        ? "Sin reglas configuradas"
        : `${d.ni.total} reglas · ${d.ni.implementadas} implementadas · ${d.ni.aprobadas} aprobadas`,
      href: "/admin/tarot/product-intelligence/motor-narrativo" as Route<string>,
    },
    {
      id: "modelo",
      label: "Modelo IA",
      sublabel: "Anthropic",
      status: "ok",
      detail: `${modelo} · temp ${d.modelo.temperatura} · ${d.modelo.max_tokens} tokens`,
      href: "/admin/tarot/product-intelligence/configuracion" as Route<string>,
    },
    {
      id: "generacion",
      label: "Generación",
      sublabel: "Edge Function",
      status: tasaError > 20 ? "error" : tasaError > 5 ? "warn" : "ok",
      detail: d.lecturas_hoy.total === 0
        ? "Sin lecturas hoy"
        : `${d.lecturas_hoy.exitosas} exitosas · ${d.lecturas_hoy.errores} errores hoy`,
      href: "/admin/tarot/product-intelligence/analytics" as Route<string>,
    },
    {
      id: "entrega",
      label: "Entrega",
      sublabel: "PDF · WhatsApp",
      status: d.entrega.canal ? "ok" : "neutral",
      detail: [
        d.entrega.canal ? `Canal: ${d.entrega.canal}` : "—",
        d.entrega.mp_modo ? `MP: ${d.entrega.mp_modo}` : null,
        d.entrega.whatsapp_modo ? `WA: ${d.entrega.whatsapp_modo}` : null,
      ].filter(Boolean).join(" · ") || "—",
      href: "/admin/tarot/product-intelligence/configuracion" as Route<string>,
    },
  ];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProductIntelligenceOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tarot/product-intelligence/overview");
      const d = await res.json();
      if (d.ok) setData(d);
      else setError("No se pudieron cargar los datos.");
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const pipeline = data ? buildPipeline(data) : [];
  const tasaExito = data && data.lecturas_hoy.total > 0
    ? Math.round((data.lecturas_hoy.exitosas / data.lecturas_hoy.total) * 100)
    : null;

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain size={18} className="text-amber-400" />
            <h1 className="text-base font-semibold text-white">Product Intelligence</h1>
          </div>
          <p className="text-xs text-gray-500">Visión general del pipeline de generación de lecturas</p>
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-xs transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* ── Pipeline visual ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800/60 flex items-center gap-2">
          <Zap size={14} className="text-amber-400" />
          <span className="text-sm font-semibold text-gray-200">Pipeline de generación</span>
        </div>
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 size={20} className="text-gray-600 animate-spin" />
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-stretch gap-0 overflow-x-auto">
              {pipeline.map((stage, i) => (
                <div key={stage.id} className="flex items-center">
                  <div className="flex-shrink-0 w-44">
                    {stage.href ? (
                      <Link href={stage.href} className="block rounded-xl border border-gray-800 bg-gray-950/60 p-3 hover:border-amber-700/50 hover:bg-amber-950/10 transition-colors group">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusDot status={stage.status} />
                          <span className="text-xs font-semibold text-gray-200 group-hover:text-amber-300 transition-colors">{stage.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">{stage.sublabel}</p>
                        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{stage.detail}</p>
                      </Link>
                    ) : (
                      <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusDot status={stage.status} />
                          <span className="text-xs font-semibold text-gray-200">{stage.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">{stage.sublabel}</p>
                        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{stage.detail}</p>
                      </div>
                    )}
                  </div>
                  {i < pipeline.length - 1 && (
                    <div className="flex items-center px-1.5 flex-shrink-0">
                      <ArrowRight size={14} className="text-gray-700" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── KPIs de hoy ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Lecturas hoy",
            value: loading ? "…" : String(data?.lecturas_hoy.total ?? 0),
            icon: <Sparkles size={16} className="text-amber-400" />,
            sub: loading ? "" : `${data?.lecturas_hoy.exitosas ?? 0} exitosas`,
          },
          {
            label: "Tasa de éxito",
            value: loading ? "…" : tasaExito != null ? `${tasaExito}%` : "—",
            icon: <TrendingUp size={16} className="text-emerald-400" />,
            sub: loading || !data ? "" : data.lecturas_hoy.total === 0 ? "Sin lecturas" : `${data.lecturas_hoy.errores} errores`,
          },
          {
            label: "Reglas NI",
            value: loading ? "…" : String(data?.ni.total ?? 0),
            icon: <Mic2 size={16} className="text-violet-400" />,
            sub: loading ? "" : `${data?.ni.implementadas ?? 0} implementadas`,
          },
          {
            label: "Casos Benchmark",
            value: loading ? "…" : String(data?.benchmark.casos_evaluados ?? 0),
            icon: <Target size={16} className="text-blue-400" />,
            sub: "casos evaluados",
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              {kpi.icon}
              <span className="text-xs text-gray-500">{kpi.label}</span>
            </div>
            <p className="text-2xl font-bold text-white tabular-nums">{kpi.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Prompt activo + Errores recientes ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Prompt activo */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              <span className="text-sm font-semibold text-gray-200">Prompt activo</span>
            </div>
            <Link href={"/admin/tarot/product-intelligence/prompt" as Route<string>} className="text-xs text-amber-500 hover:text-amber-400">
              Gestionar →
            </Link>
          </div>
          {loading ? (
            <div className="p-6 flex justify-center"><Loader2 size={16} className="text-gray-700 animate-spin" /></div>
          ) : (
            <div className="p-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Versión</span>
                <span className="text-gray-300 font-mono">
                  {data?.prompt.version != null ? `v${data.prompt.version}` : "—"}
                  {data?.prompt.version_label && <span className="text-gray-500 ml-1">({data.prompt.version_label})</span>}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Modelo</span>
                <span className="text-gray-300 font-mono">{data?.prompt.ia_modelo_override ?? data?.modelo.global ?? "—"}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Actualizado</span>
                <span className="text-gray-400">{fmtDate(data?.prompt.updated_at ?? null)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Errores recientes */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="text-red-400" />
              <span className="text-sm font-semibold text-gray-200">Errores recientes</span>
            </div>
            <Link href={"/admin/tarot/product-intelligence/analytics" as Route<string>} className="text-xs text-amber-500 hover:text-amber-400">
              Ver analytics →
            </Link>
          </div>
          {loading ? (
            <div className="p-6 flex justify-center"><Loader2 size={16} className="text-gray-700 animate-spin" /></div>
          ) : !data || data.errores_recientes.length === 0 ? (
            <div className="p-6 flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 size={14} /> Sin errores recientes
            </div>
          ) : (
            <div className="divide-y divide-gray-800/30">
              {data.errores_recientes.map((e) => (
                <div key={e.id} className="px-4 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-red-300 font-mono truncate flex-1">{e.error_codigo ?? "error"}</span>
                    <span className="text-xs text-gray-600 flex-shrink-0 flex items-center gap-1">
                      <Clock size={10} /> {fmtDate(e.created_at)}
                    </span>
                  </div>
                  {e.error_mensaje && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{e.error_mensaje}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Accesos rápidos ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800/60">
          <span className="text-sm font-semibold text-gray-200">Módulos</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y divide-gray-800/30">
          {[
            { href: "/admin/tarot/product-intelligence/prompt", label: "Prompt Lab", icon: <Sparkles size={16} /> },
            { href: "/admin/tarot/product-intelligence/motor-narrativo", label: "Motor Narrativo", icon: <Mic2 size={16} /> },
            { href: "/admin/tarot/product-intelligence/benchmark", label: "Benchmark", icon: <Target size={16} /> },
            { href: "/admin/tarot/product-intelligence/analytics", label: "Analytics", icon: <BarChart3 size={16} /> },
            { href: "/admin/tarot/product-intelligence/laboratorio", label: "Laboratorio", icon: <FlaskConical size={16} /> },
          ].map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href as Route<string>}
              className="flex flex-col items-center gap-2 p-4 text-gray-500 hover:text-amber-400 hover:bg-amber-950/10 transition-colors"
            >
              {icon}
              <span className="text-xs font-medium text-center">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
