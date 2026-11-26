"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, RotateCw, Sparkles, Target } from "lucide-react";
import { MarkdownSimple } from "@/components/admin/MarkdownSimple";
import { Boton, Esqueleto, Insignia, usd, haceCuanto, fechaHora } from "./ui";

// Diagnóstico ejecutivo con IA (fase 3; Level Up 2026-11-25).
// Solo a pedido: muestra el costo estimado antes y pide confirmación. Lee lo
// que ya calculan las pantallas del módulo; no consulta nada por su cuenta ni
// toca campañas. La pantalla muestra el texto por bloques (situación, problema,
// decisión prioritaria, evidencia, qué observar, qué no tocar) y el análisis
// completo a pedido. Los diagnósticos anteriores al formato por bloques se
// muestran completos.

type Diag = { id: string; estado: "generando" | "listo" | "error"; modelo: string; texto: string | null; costo_usd: number | null; duracion_ms: number | null; error: string | null; created_at: string };
type Resp = { diagnosticos: Diag[]; modelo: string; costo_estimado_usd: number; gasto_mes_usd: number; tope_mensual_usd: number | null; clave_configurada: boolean };

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const CLAVES: Record<string, string> = {
  situacion: "situacion", "en una frase": "situacion",
  "principal problema u oportunidad": "problema",
  evidencia: "evidencia", "como esta el negocio": "evidencia",
  "decision prioritaria": "decision",
  "otras decisiones": "otras", "que decidir esta semana": "otras",
  "que observar": "observar",
  "que no tocar todavia": "no_tocar",
  "que falta saber": "falta",
};
function secciones(texto: string): Record<string, string> {
  const out: Record<string, string> = {};
  const partes = texto.split(/^##\s+/m);
  for (const p of partes.slice(1)) {
    const [cabeza, ...resto] = p.split("\n");
    const k = CLAVES[sinTildes(cabeza.trim().replace(/[:.]$/, ""))];
    if (k) out[k] = resto.join("\n").trim();
  }
  return out;
}

function Bloque({ titulo, texto, destacado }: { titulo: string; texto?: string; destacado?: boolean }) {
  if (!texto) return null;
  return (
    <div className={`min-w-0 rounded-lg p-3.5 ${destacado ? "bg-violet-400/[0.08] ring-1 ring-inset ring-violet-400/25" : "bg-white/[0.025]"}`}>
      <p className={`flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.06em] ${destacado ? "text-violet-200" : "text-gray-400"}`}>{destacado && <Target size={13} aria-hidden="true" />}{titulo}</p>
      <div className="mt-1.5 text-[14px] leading-relaxed text-gray-100 [&_p]:my-1 [&_ul]:my-1"><MarkdownSimple texto={texto} /></div>
    </div>
  );
}

export function DiagnosticoIA() {
  const [d, setD] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [completo, setCompleto] = useState(false);
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
    if (!window.confirm(`El diagnóstico usa ${d.modelo} y cuesta alrededor de ${usd(d.costo_estimado_usd)}. ¿Lo genero?`)) return;
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
  const listo = d?.diagnosticos.find((x) => x.estado === "listo") ?? null;
  const s = useMemo(() => (listo?.texto ? secciones(listo.texto) : {}), [listo]);
  const estructurado = !!(s.situacion && (s.decision || s.otras));
  const consumo = d ? `${usd(d.gasto_mes_usd)}${d.tope_mensual_usd != null ? ` de ${usd(d.tope_mensual_usd)}` : ""} usados este mes en IA del panel` : "";

  const cabeza = (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300 ring-1 ring-inset ring-violet-400/25"><Sparkles size={17} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-gray-50">Diagnóstico ejecutivo</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-gray-400">
            {listo
              ? <>Generado {haceCuanto(listo.created_at)} ({fechaHora(listo.created_at)}) con los datos de los últimos 30 días · {usd(listo.costo_usd)}</>
              : <>La IA lee el Centro de control, la bandeja, los experimentos y la memoria, y propone qué decidir esta semana. Solo cuando lo pedís{d ? ` · ≈ ${usd(d.costo_estimado_usd)}` : ""}.</>}
          </p>
        </div>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
        {d && !d.clave_configurada && <Insignia tono="alerta">Falta la clave de IA del panel</Insignia>}
        <Boton variante="ia" tamano="sm" icono={listo ? RotateCw : Sparkles} onClick={pedir} cargando={pidiendo || generando} disabled={!d || !d.clave_configurada}>
          {generando ? "Analizando…" : listo ? "Generar uno nuevo" : "Generar diagnóstico"}
        </Boton>
      </div>
    </div>
  );

  return (
    <section aria-label="Diagnóstico ejecutivo con IA" className="rounded-xl border border-violet-400/[0.18] bg-gradient-to-b from-violet-400/[0.05] to-transparent p-4 md:p-5">
      {cabeza}
      {error && <p className="mt-3 text-[13px] text-rose-300">{error}</p>}
      {generando && (
        <div className="mt-4 space-y-2" role="status">
          <Esqueleto className="h-4 w-3/4" /><Esqueleto className="h-4 w-1/2" /><Esqueleto className="h-16 w-full" />
          <p className="text-[12.5px] text-gray-400">Suele tardar menos de un minuto; se actualiza solo.</p>
        </div>
      )}
      {ultimo?.estado === "error" && !generando && <p className="mt-3 text-[13px] text-rose-300">El último intento ({fechaHora(ultimo.created_at)}) falló: {ultimo.error}</p>}
      {listo?.texto && !generando && (
        <div className="mt-4 space-y-3">
          {estructurado ? (
            <>
              <div className="text-[15.5px] font-medium leading-relaxed text-gray-50 [&_p]:my-0"><MarkdownSimple texto={s.situacion} /></div>
              <div className="grid gap-3 lg:grid-cols-2">
                <Bloque titulo="Decisión prioritaria" texto={s.decision} destacado />
                <Bloque titulo="Principal problema u oportunidad" texto={s.problema} />
              </div>
              {completo && (
                <div className="grid gap-3 lg:grid-cols-2">
                  <Bloque titulo="Evidencia" texto={s.evidencia} />
                  <Bloque titulo="Qué observar" texto={s.observar} />
                  <Bloque titulo="Qué no tocar todavía" texto={s.no_tocar} />
                  <Bloque titulo="Otras decisiones" texto={s.otras} />
                  <Bloque titulo="Qué falta saber" texto={s.falta} />
                </div>
              )}
            </>
          ) : (
            <div className={`relative overflow-hidden text-[14px] leading-relaxed text-gray-100 ${completo ? "" : "max-h-48"}`}>
              <MarkdownSimple texto={listo.texto} />
              {!completo && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0a0912] to-transparent" />}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setCompleto(!completo)} aria-expanded={completo} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-1 text-[13.5px] font-medium text-violet-200 hover:text-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70">
              {completo ? "Ver menos" : estructurado ? "Ver evidencia, qué observar y qué no tocar" : "Ver el análisis completo"}
              <ChevronDown size={15} aria-hidden="true" className={`transition-transform ${completo ? "rotate-180" : ""}`} />
            </button>
            <p className="text-[12px] text-gray-400">Escrito por IA: cada afirmación dice si es hecho, señal o hipótesis. Verificá los números antes de decidir.</p>
          </div>
        </div>
      )}
      {d && !listo && !generando && <p className="mt-3 text-[12.5px] text-gray-400">{consumo}.</p>}
    </section>
  );
}
