"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, Loader2, Megaphone } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { ESTADO_CAMPANA_UI, TIPO_CAMPANA_UI, fmtFecha, fmtMoneda, fmtPct, type CampanaResumen } from "@/components/admin/campanas/ui";

// ============================================================================
// Campañas (2026-10-19). Módulo general; hoy implementado el tipo
// "Feedback de experiencia". Toda campaña nace en borrador + modo simulado.
// ============================================================================

export default function TarotCampanasPage() {
  const [campanas, setCampanas] = useState<CampanaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const r = await fetch("/api/admin/tarot/campanas", { cache: "no-store" });
      const json = await r.json();
      if (json.ok) setCampanas(json.campanas);
      else setErrorMsg(json.detalle ?? json.motivo ?? `Error HTTP ${r.status}`);
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <TarotAdminShell>
      <main className="px-6 py-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2"><Megaphone size={16} className="text-amber-400" /> Campañas</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Toda campaña nace en <strong>borrador</strong> y en modo <strong>simulado</strong>: no envía nada hasta activarla, y en simulado nunca llama a WhatsApp.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" /> {errorMsg}
          </div>
        )}

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800 text-left">
                  {["Campaña", "Tipo", "Estado", "Audiencia", "Canal", "Inicio", "Enviados", "Entregados", "Respuestas", "Tasa resp.", "Rating", "Autoriz. web", "Costo", "Costo/resp."].map((h) => (
                    <th key={h} className="px-3 py-3 font-medium text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr><td colSpan={14} className="px-4 py-8 text-center text-gray-500"><Loader2 size={16} className="inline animate-spin mr-2" />Cargando…</td></tr>
                )}
                {!cargando && campanas.length === 0 && (
                  <tr><td colSpan={14} className="px-4 py-8 text-center text-gray-500">No hay campañas.</td></tr>
                )}
                {campanas.map((c) => {
                  const est = ESTADO_CAMPANA_UI[c.estado] ?? ESTADO_CAMPANA_UI.borrador;
                  const reales = c.metricas.enviados - c.metricas.simulados;
                  return (
                    <tr key={c.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                      <td className="px-3 py-3">
                        <Link href={`/admin/tarot/campanas/${c.id}` as Route} className="font-medium text-amber-300 hover:underline">{c.nombre}</Link>
                        {c.modo_envio === "simulado" && <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] bg-gray-800 text-gray-400">simulado</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-300 whitespace-nowrap">{TIPO_CAMPANA_UI[c.tipo] ?? c.tipo}</td>
                      <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-xs ${est.cls}`}>{est.label}</span></td>
                      <td className="px-3 py-3 text-gray-300 whitespace-nowrap">{c.elegibles.total + c.elegibles.encolados} elegibles</td>
                      <td className="px-3 py-3 text-gray-300">WhatsApp</td>
                      <td className="px-3 py-3 text-gray-400 whitespace-nowrap">{fmtFecha(c.activada_at)}</td>
                      <td className="px-3 py-3 text-gray-200">{reales}{c.metricas.simulados > 0 && <span className="text-gray-500"> (+{c.metricas.simulados} sim.)</span>}</td>
                      <td className="px-3 py-3 text-gray-200">{c.metricas.entregados}</td>
                      <td className="px-3 py-3 text-gray-200">{c.metricas.respuestas}</td>
                      <td className="px-3 py-3 text-gray-200">{fmtPct(c.metricas.respuestas, c.metricas.enviados)}</td>
                      <td className="px-3 py-3 text-gray-200">{c.metricas.rating_promedio ?? "—"}</td>
                      <td className="px-3 py-3 text-gray-200">{c.metricas.autoriza_sitio}</td>
                      <td className="px-3 py-3 text-gray-200 whitespace-nowrap">{fmtMoneda(c.costos.real ?? c.costos.estimado, c.costos.moneda)} <span className="text-[10px] text-gray-500">{c.costos.fuente}</span></td>
                      <td className="px-3 py-3 text-gray-200 whitespace-nowrap">{c.costos.por_respuesta === null ? "—" : fmtMoneda(c.costos.por_respuesta, c.costos.moneda)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </TarotAdminShell>
  );
}
