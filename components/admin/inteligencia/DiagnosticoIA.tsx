"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { MarkdownSimple } from "@/components/admin/MarkdownSimple";

// Diagnóstico ejecutivo con IA (Inteligencia comercial, fase 3, 2026-11-25).
// Solo a pedido: muestra el costo estimado antes y pide confirmación. Lee lo
// que ya calculan las pantallas del módulo; no consulta nada por su cuenta ni
// toca campañas.

type Diag = { id: string; estado: "generando" | "listo" | "error"; modelo: string; texto: string | null; costo_usd: number | null; duracion_ms: number | null; error: string | null; created_at: string };
type Resp = { diagnosticos: Diag[]; modelo: string; costo_estimado_usd: number; gasto_mes_usd: number; tope_mensual_usd: number | null; clave_configurada: boolean };
const usd = (v: number | null | undefined) => (v == null ? "—" : `US$ ${Number(v).toFixed(2).replace(".", ",")}`);
const cuando = (iso: string) => new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" });

export function DiagnosticoIA() {
  const [d, setD] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [abierto, setAbierto] = useState(true);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/tarot/inteligencia?vista=diagnosticos", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.motivo || "Error");
      setD(j);
      if (j.diagnosticos[0]?.estado === "generando") temporizador.current = setTimeout(cargar, 5000);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { cargar(); return () => { if (temporizador.current) clearTimeout(temporizador.current); }; }, [cargar]);

  async function pedir() {
    if (!d) return;
    if (!window.confirm(`El diagnóstico usa ${d.modelo} y cuesta alrededor de ${usd(d.costo_estimado_usd)}. ¿Lo pido?`)) return;
    setPidiendo(true); setError(null);
    try {
      const r = await fetch("/api/admin/tarot/inteligencia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "diagnosticar" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.motivo || "No se pudo pedir.");
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setPidiendo(false); }
  }

  const ultimo = d?.diagnosticos[0] ?? null;
  const generando = ultimo?.estado === "generando";
  return (
    <section className="space-y-3 rounded-2xl border border-violet-900/60 bg-violet-950/15 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white"><Sparkles size={16} className="text-violet-300" /> Diagnóstico ejecutivo con IA</h2>
          <p className="mt-0.5 text-[12.5px] text-gray-400">
            Lee el Centro de control, la bandeja, los experimentos y la memoria, y te dice qué decidir esta semana. Solo cuando lo pedís.
            {d && <> Costo aprox. {usd(d.costo_estimado_usd)} · este mes {usd(d.gasto_mes_usd)} en IA del panel{d.tope_mensual_usd != null ? ` de un tope de ${usd(d.tope_mensual_usd)}` : ""}.</>}
          </p>
        </div>
        <button type="button" onClick={pedir} disabled={!d || pidiendo || generando || !d.clave_configurada} className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-violet-700 bg-violet-900/40 px-3 text-[13px] font-medium text-violet-100 hover:bg-violet-900/70 disabled:opacity-50">
          {pidiendo || generando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {generando ? "Pensando…" : "Pedir diagnóstico"}
        </button>
      </div>
      {d && !d.clave_configurada && <p className="text-[13px] text-amber-200">Falta la clave de Anthropic del panel en Vercel.</p>}
      {error && <p className="text-[13px] text-red-300">{error}</p>}
      {generando && <p className="text-[13px] text-gray-300">Armando el diagnóstico con los datos de hoy. Suele tardar menos de un minuto; esta caja se actualiza sola.</p>}
      {ultimo && ultimo.estado === "error" && <p className="text-[13px] text-red-300">El último diagnóstico ({cuando(ultimo.created_at)}) falló: {ultimo.error}</p>}
      {(() => {
        const listo = d?.diagnosticos.find((x) => x.estado === "listo");
        if (!listo?.texto) return !generando && d ? <p className="text-[13px] text-gray-500">Todavía no pediste ninguno.</p> : null;
        return (
          <div className="space-y-2">
            <button type="button" onClick={() => setAbierto(!abierto)} className="text-[12.5px] text-gray-400 hover:text-gray-200">
              {abierto ? "Ocultar" : "Ver"} el último ({cuando(listo.created_at)} · {usd(listo.costo_usd)})
            </button>
            {abierto && <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-3 text-[14px] md:p-4"><MarkdownSimple texto={listo.texto} /></div>}
            {abierto && <p className="text-[11.5px] text-gray-500">Escrito por IA con los datos de ese momento. Cada afirmación dice si es hecho, señal o hipótesis; verificá los números en las pantallas antes de decidir.</p>}
          </div>
        );
      })()}
    </section>
  );
}
