"use client";

import { useRef, useState } from "react";
import { Star, Check, Loader2 } from "lucide-react";
import { CTA_GRADIENT, CREMA, GOLD, SERIF } from "@/components/home/theme";
import { CardTestimonio } from "@/components/tarot/TestimoniosTarot";
import type { ConsentimientoTexto } from "@/lib/feedbackPublico";

const MAX_COMENTARIO = 600;
const ETIQUETAS = ["", "Mala", "Regular", "Buena", "Muy buena", "Excelente"];

const PANEL = { background: "rgba(12,7,24,0.80)", border: "1px solid rgba(240,197,90,0.28)" } as const;

interface Props {
  token: string;
  nombrePila: string;
  identidadPublica: string;
  consentimientos: { sitio: ConsentimientoTexto; difusion: ConsentimientoTexto };
}

function Titulo({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, lineHeight: 1.2, color: CREMA }}>
      {children}
    </h2>
  );
}

function Consentimiento({ id, checked, onChange, texto }: { id: string; checked: boolean; onChange: (v: boolean) => void; texto: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer rounded-xl px-3.5 py-3 transition-colors hover:bg-white/[0.03]" style={{ border: "1px solid rgba(255,255,255,0.10)" }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#F0C55A]"
      />
      <span className="text-[14px] leading-snug text-white/85">{texto}</span>
    </label>
  );
}

export function FormularioOpinion({ token, nombrePila, identidadPublica, consentimientos }: Props) {
  const [rating, setRating] = useState(0);
  const [comentario, setComentario] = useState("");
  const [sitio, setSitio] = useState(false);
  const [difusion, setDifusion] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);
  const enviandoRef = useRef(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setError("Elegí de 1 a 5 estrellas para enviar tu opinión.");
      return;
    }
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/opinion/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comentario: comentario.trim(),
          autoriza_sitio: sitio,
          autoriza_difusion: difusion,
          version_sitio: consentimientos.sitio.version,
          version_difusion: consentimientos.difusion.version,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        setEnviada(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setError(data?.mensaje ?? "No pudimos guardar tu opinión. Probá de nuevo.");
    } catch {
      setError("No pudimos guardar tu opinión. Revisá tu conexión y probá de nuevo.");
    }
    enviandoRef.current = false;
    setEnviando(false);
  }

  if (enviada) {
    return (
      <section className="mt-10 text-center rounded-2xl px-6 py-10" style={PANEL} aria-live="polite">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(240,197,90,0.12)", border: `1px solid ${GOLD}` }}>
          <Check size={26} style={{ color: GOLD }} aria-hidden="true" />
        </span>
        <h1 className="mt-5" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 28, lineHeight: 1.15, color: CREMA }}>
          Gracias por compartir tu experiencia.
        </h1>
        <p className="mt-3 text-[15px] text-white/70 leading-relaxed">
          {nombrePila ? `${nombrePila}, tu` : "Tu"} opinión nos ayuda a seguir mejorando Tu Oráculo.
        </p>
      </section>
    );
  }

  const previaTexto = comentario.trim() || "Acá va a aparecer tu opinión con tus palabras.";

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      {/* 1. Introducción */}
      {/* div, no <header>: PaginaMarca oculta todo <header> (el global del sitio). */}
      <div className="text-center pt-2 pb-1">
        {nombrePila && <p className="text-[14px] text-white/60">Hola, {nombrePila}</p>}
        <h1 className="mt-1" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, lineHeight: 1.12, color: CREMA }}>
          ¿Cómo fue tu experiencia con tu lectura?
        </h1>
        <p className="mt-2 text-[15px] text-white/65">Tu opinión nos ayuda a mejorar Tu Oráculo.</p>
      </div>

      {/* 2. Rating */}
      <section className="rounded-2xl px-5 py-5" style={PANEL}>
        <fieldset>
          <legend className="w-full text-center">
            <Titulo>¿Cómo valorarías tu experiencia?</Titulo>
          </legend>
          <div className="mt-4 flex justify-center gap-1.5" role="radiogroup" aria-label="Valoración de 1 a 5 estrellas" aria-required="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="relative cursor-pointer rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-[#F0C55A]/70">
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => { setRating(n); setError(null); }}
                  className="sr-only"
                  aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"} — ${ETIQUETAS[n]}`}
                />
                <Star
                  size={44}
                  aria-hidden="true"
                  strokeWidth={1.5}
                  style={{ color: "#D4A23C", fill: n <= rating ? "#E2AE3C" : "transparent", transition: "fill 120ms" }}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 h-5 text-center text-[14px]" style={{ color: GOLD }} aria-live="polite">
            {rating > 0 ? ETIQUETAS[rating] : ""}
          </p>
        </fieldset>
      </section>

      {/* 3. Opinión */}
      <section className="rounded-2xl px-5 py-5" style={PANEL}>
        <label htmlFor="comentario" className="block">
          <Titulo>Tu opinión <span className="text-[14px] font-normal text-white/45" style={{ fontFamily: "inherit" }}>(opcional)</span></Titulo>
          <span className="mt-1 block text-[14px] text-white/60">Si querés, contanos en tus palabras cómo viviste la experiencia.</span>
        </label>
        <textarea
          id="comentario"
          value={comentario}
          onChange={(e) => setComentario(e.target.value.slice(0, MAX_COMENTARIO))}
          rows={4}
          maxLength={MAX_COMENTARIO}
          className="mt-3 w-full rounded-xl px-4 py-3 text-[15px] text-white placeholder:text-white/35 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-[#F0C55A]/60"
          style={{ background: "rgba(255,255,255,0.045)" }}
          placeholder="Escribí acá…"
        />
        <p className="mt-1 text-right text-[12px] text-white/40">{comentario.length}/{MAX_COMENTARIO}</p>
      </section>

      {/* Vista previa con la card REAL de /tarot */}
      <section className="rounded-2xl px-4 py-5" style={PANEL} aria-labelledby="titulo-previa">
        <p className="text-center text-[11px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>Testimonios</p>
        <h2 id="titulo-previa" className="mt-1 text-center" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 21, color: CREMA }}>
          Así se vería tu opinión en nuestro sitio
        </h2>
        <div className="mx-auto mt-4 max-w-[330px]" aria-live="polite">
          <div style={{ opacity: comentario.trim() ? 1 : 0.6 }}>
            <CardTestimonio opinion={previaTexto} puntuacion={rating} nombre={identidadPublica} ciudad={null} />
          </div>
        </div>
        <p className="mt-3 text-center text-[12.5px] text-white/55 leading-relaxed">
          Siempre se muestra solo como <strong className="text-white/80">{identidadPublica}</strong>: nunca tu apellido completo ni otros datos personales.
          {!comentario.trim() && " Para publicarse como testimonio necesita un comentario."}
        </p>
      </section>

      {/* Consentimientos: independientes y desmarcados */}
      <section className="rounded-2xl px-5 py-5 space-y-3" style={PANEL}>
        <p className="text-[14px] text-white/65">
          Tu opinión nos llega igual aunque no marques ninguna opción. Solo se publica si lo autorizás.
        </p>
        <Consentimiento id="consentimiento-sitio" checked={sitio} onChange={setSitio} texto={consentimientos.sitio.texto} />
        <Consentimiento id="consentimiento-difusion" checked={difusion} onChange={setDifusion} texto={consentimientos.difusion.texto} />
      </section>

      {error && (
        <p role="alert" className="rounded-xl px-4 py-3 text-[14px] text-red-200 bg-red-900/25 border border-red-500/30">{error}</p>
      )}

      <button
        type="submit"
        disabled={enviando}
        aria-disabled={rating < 1 || enviando}
        className="w-full rounded-xl py-4 text-[17px] font-bold flex items-center justify-center gap-2 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-70"
        style={{ background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 6px 24px rgba(240,197,90,0.30)", opacity: rating < 1 ? 0.55 : 1 }}
      >
        {enviando && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
        {enviando ? "Enviando…" : "Enviar mi opinión"}
      </button>
    </form>
  );
}
