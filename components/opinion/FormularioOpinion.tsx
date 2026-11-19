"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Check, Loader2, MessageCircle, Heart, X } from "lucide-react";
import { CTA_GRADIENT, CREMA, GOLD, SERIF } from "@/components/home/theme";
import { CardTestimonio } from "@/components/tarot/TestimoniosTarot";
import type { ConsentimientoTexto } from "@/lib/feedbackPublico";

// Mini web de opinión (rediseño 2026-11-16). Flujo por pasos:
//   1. Estrellas (lo único visible al entrar: una sola decisión, un toque).
//   2. Al elegir la nota aparece el comentario con una pregunta que cambia
//      según la nota, y el botón de enviar.
//   3. Solo con 4 o 5 estrellas Y comentario: vista previa del testimonio y
//      un único permiso, solo web (interruptor, arranca apagado).
//      Con 1 a 3 no se pide permiso de publicar; se ofrece ayuda por WhatsApp.
// Lo que se envía y cómo se guarda no cambió (mismo POST /api/opinion).

const MAX_COMENTARIO = 600;
const ETIQUETAS = ["", "Mala", "Regular", "Buena", "Muy buena", "¡Excelente!"];

const PREGUNTA: Record<number, { titulo: string; ayuda: string; placeholder: string }> = {
  5: { titulo: "¡Qué alegría! ¿Qué fue lo que más te sirvió?", ayuda: "Tus palabras pueden ayudar a otra persona que está dudando.", placeholder: "Por ejemplo: qué te ayudó a ver, cómo te sentiste al leerla…" },
  4: { titulo: "¡Gracias! ¿Qué te gustó y qué le faltó para ser excelente?", ayuda: "Nos sirve saber las dos cosas.", placeholder: "Lo que más te gustó y lo que mejorarías…" },
  3: { titulo: "¿Qué le faltó a tu lectura?", ayuda: "Contanos con confianza: lo leemos todo.", placeholder: "Qué esperabas y qué no encontraste…" },
  2: { titulo: "Lamentamos que no haya sido lo que esperabas. ¿Qué pasó?", ayuda: "Lo leemos con atención para mejorar.", placeholder: "Contanos qué no funcionó…" },
  1: { titulo: "Lamentamos que no haya sido lo que esperabas. ¿Qué pasó?", ayuda: "Lo leemos con atención para mejorar.", placeholder: "Contanos qué no funcionó…" },
};

const PANEL = {
  background: "rgba(12,7,24,0.82)",
  border: "1px solid rgba(240,197,90,0.28)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
} as const;

interface Props {
  token: string;
  nombrePila: string;
  temaTexto: string;
  identidadPublica: string;
  consentimientos: { sitio: ConsentimientoTexto; difusion: ConsentimientoTexto };
  waNumero: string;
}

function Titulo({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 23, lineHeight: 1.2, color: CREMA }}>
      {children}
    </h2>
  );
}

// Un solo permiso (2026-11-16, pedido de Manuel: cero fricción). El texto es
// el vigente de la base, tal cual: es lo que queda registrado como aceptado.
// Arranca apagado: el permiso tiene que ser expreso.
function Compartir({ checked, onChange, texto, identidad }: { checked: boolean; onChange: (v: boolean) => void; texto: string; identidad: string }) {
  return (
    <label
      htmlFor="compartir"
      className="flex items-center gap-4 cursor-pointer rounded-xl px-4 py-3.5 transition-colors focus-within:ring-2 focus-within:ring-[#F0C55A]/70"
      style={{ background: checked ? "rgba(240,197,90,0.09)" : "rgba(255,255,255,0.04)" }}
    >
      <span className="flex-1">
        <span className="block text-[15.5px] leading-snug text-white/95">{texto}</span>
        <span className="mt-1 block text-[13.5px] text-white/60">Solo como {identidad}</span>
      </span>
      <input
        id="compartir"
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors"
        style={{ background: checked ? GOLD : "rgba(255,255,255,0.18)" }}
      >
        <span
          className="absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-transform"
          style={{ left: 3, transform: checked ? "translateX(22px)" : "translateX(0)" }}
        />
      </span>
    </label>
  );
}

// Pregunta al enviar (2026-11-19, idea de Manuel, como la hoja legal del
// checkout): si dejó 4-5 estrellas y comentario pero no activó el permiso,
// antes de mandar sube esta hoja. "Sí, compartir" activa el permiso y envía;
// "Enviar sin compartir" envía igual sin permiso (el permiso tiene que ser
// libre: siempre hay salida). Cerrar (✕, afuera, Escape) vuelve al formulario
// sin enviar. El texto aceptado es el mismo del interruptor (el de la base).
function PreguntaCompartir({ abierta, texto, identidad, onSi, onNo, onCerrar }: {
  abierta: boolean; texto: string; identidad: string;
  onSi: () => void; onNo: () => void; onCerrar: () => void;
}) {
  const siRef = useRef<HTMLButtonElement>(null);
  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;

  useEffect(() => {
    if (!abierta) return;
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrarRef.current(); };
    window.addEventListener("keydown", alTeclear);
    siRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflow;
      anterior?.focus?.({ preventScroll: true });
    };
  }, [abierta]);

  if (!abierta) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onCerrar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pregunta-compartir-titulo"
        aria-describedby="pregunta-compartir-texto"
        className="relative w-full md:max-w-[480px] rounded-t-3xl md:rounded-3xl px-5 pt-3"
        style={{
          background: "#0f0920",
          border: "1px solid rgba(240,197,90,0.30)",
          boxShadow: "0 -12px 48px rgba(0,0,0,0.6)",
          animation: "preguntaCompartirSube 220ms ease-out",
          paddingBottom: "max(18px, env(safe-area-inset-bottom))",
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: "@keyframes preguntaCompartirSube{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@media (prefers-reduced-motion:reduce){[role=dialog]{animation:none!important}}" }} />
        <div className="flex justify-end -mr-2">
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar y volver a mi opinión"
            className="flex items-center justify-center w-11 h-11 rounded-full text-white/70 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0C55A]"
          >
            <X size={22} />
          </button>
        </div>
        <div className="text-center -mt-2">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(240,197,90,0.12)", border: `1px solid ${GOLD}` }}>
            <Heart size={26} style={{ color: GOLD }} aria-hidden="true" />
          </span>
          <h2 id="pregunta-compartir-titulo" className="mt-4" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 25, lineHeight: 1.2, color: CREMA }}>
            ¿Nos ayudás a que otras personas se animen?
          </h2>
          <p className="mt-2.5 text-[16px] leading-relaxed text-white/85">
            Tu opinión puede ayudar a alguien que está dudando. Nos encantaría mostrarla en la web, solo como <strong className="text-white">{identidad}</strong>{identidad.endsWith(".") ? "" : "."}
          </p>
        </div>
        <p id="pregunta-compartir-texto" className="mt-4 rounded-xl px-4 py-3 text-[14px] leading-snug text-white/70" style={{ background: "rgba(255,255,255,0.04)" }}>
          Al tocar «Sí, compartir» aceptás: «{texto}»
        </p>
        <div className="mt-5 space-y-3">
          <button
            ref={siRef}
            type="button"
            onClick={onSi}
            className="w-full rounded-xl py-4 min-h-[54px] text-[17px] font-bold active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0920] focus-visible:ring-[#F0C55A]"
            style={{ background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 6px 24px rgba(240,197,90,0.30)" }}
          >
            Sí, compartir
          </button>
          <button
            type="button"
            onClick={onNo}
            className="w-full rounded-xl py-3.5 min-h-[50px] text-[16px] font-semibold text-white/80 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0C55A]"
          >
            Enviar sin compartir
          </button>
        </div>
      </div>
    </div>
  );
}

function linkWa(numero: string, texto: string) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function BotonAyuda({ waNumero, nombrePila }: { waNumero: string; nombrePila: string }) {
  if (!waNumero) {
    return (
      <a
        href="mailto:hola@tuoraculo.uy"
        className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 text-[16px] font-semibold transition-colors hover:bg-white/[0.06]"
        style={{ border: `1px solid ${GOLD}`, color: CREMA }}
      >
        <MessageCircle size={18} style={{ color: GOLD }} aria-hidden="true" />
        Escribinos a hola@tuoraculo.uy
      </a>
    );
  }
  return (
    <a
      href={linkWa(waNumero, `Hola${nombrePila ? `, soy ${nombrePila}` : ""}. Les escribo por mi lectura de tarot.`)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 text-[16px] font-semibold transition-colors hover:bg-white/[0.06]"
      style={{ border: `1px solid ${GOLD}`, color: CREMA }}
    >
      <MessageCircle size={18} style={{ color: GOLD }} aria-hidden="true" />
      Escribinos por WhatsApp
    </a>
  );
}

export function FormularioOpinion({ token, nombrePila, temaTexto, identidadPublica, consentimientos, waNumero }: Props) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState("");
  const [compartir, setCompartir] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);
  const [preguntar, setPreguntar] = useState(false);
  const enviandoRef = useRef(false);

  const positiva = rating >= 4;
  // El bloque de compartir solo tiene sentido con nota alta y comentario.
  const puedeCompartir = positiva && comentario.trim() !== "";
  const autoriza = puedeCompartir && compartir;
  // Desde el 16/11 solo se pide el permiso de la web (texto vigente de "sitio").
  // Difusión (redes, anuncios) no se pide: se envía siempre en false; la
  // versión vigente igual se manda porque la API la exige.
  const textoPermiso = consentimientos.sitio.texto;
  const pregunta = PREGUNTA[rating];
  const mostrada = hover || rating;

  function elegir(n: number) {
    const primera = rating === 0;
    setRating(n);
    setError(null);
    // Con nota baja no se pide publicar: se limpia el permiso marcado antes.
    if (n < 4) setCompartir(false);
    // La primera vez, llevar la vista al paso siguiente (sin robar el foco).
    if (primera) {
      window.setTimeout(() => {
        document.getElementById("paso-opinion")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setError("Elegí de 1 a 5 estrellas para enviar tu opinión.");
      return;
    }
    if (enviandoRef.current) return;
    // Nota alta + comentario sin permiso: antes de mandar, se pregunta una vez.
    if (puedeCompartir && !compartir) {
      setPreguntar(true);
      return;
    }
    void mandar(autoriza);
  }

  function compartirYEnviar() {
    setCompartir(true);
    setPreguntar(false);
    void mandar(true);
  }

  function enviarSinCompartir() {
    setPreguntar(false);
    void mandar(false);
  }

  async function mandar(autorizaSitio: boolean) {
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
          autoriza_sitio: autorizaSitio,
          autoriza_difusion: false,
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
    const autorizo = autoriza;
    return (
      <section className="mt-8 text-center rounded-2xl px-6 py-10" style={PANEL} aria-live="polite">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(240,197,90,0.12)", border: `1px solid ${GOLD}` }}>
          <Check size={30} style={{ color: GOLD }} aria-hidden="true" />
        </span>
        <h1 className="mt-5" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, lineHeight: 1.12, color: CREMA }}>
          {positiva ? `¡Gracias${nombrePila ? `, ${nombrePila}` : ""}!` : `Gracias por contárnoslo${nombrePila ? `, ${nombrePila}` : ""}`}
        </h1>
        <p className="mt-3 text-[16px] text-white/80 leading-relaxed">
          {positiva
            ? autorizo
              ? "Recibimos tu opinión. Antes de publicarla la revisamos, y siempre aparece solo con tu nombre y la inicial."
              : "Recibimos tu opinión. Nos ayuda mucho a seguir cuidando cada lectura."
            : "Recibimos tu opinión y la vamos a leer con atención. Si querés, escribinos y lo vemos con vos."}
        </p>
        <div className="mt-7 space-y-4">
          {positiva ? (
            <a href="https://tuoraculo.uy/tarot" className="block w-full rounded-xl py-3.5 text-[16px] font-semibold transition-colors hover:bg-white/[0.06]" style={{ border: `1px solid ${GOLD}`, color: CREMA }}>
              Volver a Tu Oráculo
            </a>
          ) : (
            <BotonAyuda waNumero={waNumero} nombrePila={nombrePila} />
          )}
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      {/* 1. Introducción. div, no <header>: PaginaMarca oculta todo <header>. */}
      <div className="text-center pt-3 pb-1">
        <p className="text-[15px] font-medium" style={{ color: GOLD }}>{nombrePila ? `Hola, ${nombrePila}` : "Hola"}</p>
        <h1 className="mt-1.5" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 32, lineHeight: 1.1, color: CREMA, textShadow: "0 2px 18px rgba(0,0,0,0.6)" }}>
          ¿Cómo te fue con tu lectura{temaTexto ? ` ${temaTexto}` : ""}?
        </h1>
        <p className="mt-2.5 text-[16px] text-white/80" style={{ textShadow: "0 1px 10px rgba(0,0,0,0.7)" }}>
          Te lleva menos de un minuto.
        </p>
      </div>

      {/* 2. Estrellas */}
      <section className="rounded-2xl px-4 pt-5 pb-4" style={PANEL}>
        <fieldset>
          <legend className="w-full text-center">
            <Titulo>Tocá las estrellas</Titulo>
          </legend>
          <div
            className="mt-3 flex justify-center gap-0.5 sm:gap-1.5"
            role="radiogroup"
            aria-label="Valoración de 1 a 5 estrellas"
            aria-required="true"
            onMouseLeave={() => setHover(0)}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className="relative cursor-pointer rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-[#F0C55A]/70"
                onMouseEnter={() => setHover(n)}
              >
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => elegir(n)}
                  className="sr-only"
                  aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}: ${ETIQUETAS[n]}`}
                />
                <Star
                  size={48}
                  aria-hidden="true"
                  strokeWidth={1.5}
                  style={{
                    color: "#D4A23C",
                    fill: n <= mostrada ? "#E8B53F" : "transparent",
                    filter: n <= mostrada ? "drop-shadow(0 0 10px rgba(240,197,90,0.45))" : "none",
                    transform: n <= mostrada ? "scale(1.04)" : "scale(1)",
                    transition: "fill 120ms, transform 150ms, filter 150ms",
                  }}
                />
              </label>
            ))}
          </div>
          <p className="mt-1 h-6 text-center text-[16px] font-semibold" style={{ color: GOLD }} aria-live="polite">
            {mostrada > 0 ? ETIQUETAS[mostrada] : ""}
          </p>
          {rating === 0 && (
            <p className="mt-1 text-center text-[14.5px] text-white/65">1 = nada bien · 5 = excelente</p>
          )}
        </fieldset>
      </section>

      {rating > 0 && (
        <>
          {/* 3. Comentario: la pregunta depende de la nota */}
          <section id="paso-opinion" className="rounded-2xl px-5 py-5 scroll-mt-4" style={PANEL}>
            <label htmlFor="comentario" className="block">
              <Titulo>{pregunta.titulo}</Titulo>
              <span className="mt-1.5 block text-[15px] text-white/75">
                {pregunta.ayuda} <span className="text-white/55">(opcional)</span>
              </span>
            </label>
            <textarea
              id="comentario"
              value={comentario}
              onChange={(e) => setComentario(e.target.value.slice(0, MAX_COMENTARIO))}
              rows={4}
              maxLength={MAX_COMENTARIO}
              className="mt-3 w-full rounded-xl px-4 py-3 text-[16px] leading-relaxed text-white placeholder:text-white/40 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-[#F0C55A]/60"
              style={{ background: "rgba(255,255,255,0.05)" }}
              placeholder={pregunta.placeholder}
            />
            <p className="mt-1 text-right text-[12.5px] text-white/45">{comentario.length}/{MAX_COMENTARIO}</p>
          </section>

          {positiva ? (
            puedeCompartir && (
              // 4. Solo con nota alta y comentario: la card REAL de /tarot y un único permiso.
              <section className="rounded-2xl px-4 pt-5 pb-4" style={PANEL} aria-labelledby="titulo-previa">
                <h2 id="titulo-previa" className="text-center" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: CREMA }}>
                  ¿Nos dejás compartirla?
                </h2>
                <div className="mx-auto mt-4 max-w-[330px]" aria-live="polite">
                  <CardTestimonio opinion={comentario.trim()} puntuacion={rating} nombre={identidadPublica} ciudad={null} verificada />
                </div>
                <div className="mt-4">
                  <Compartir checked={compartir} onChange={setCompartir} texto={textoPermiso} identidad={identidadPublica} />
                </div>
              </section>
            )
          ) : (
            <section className="rounded-2xl px-5 py-5 space-y-3" style={PANEL}>
              <p className="text-[15.5px] leading-relaxed text-white/85">
                Si algo de tu lectura no quedó claro o tenés una duda, escribinos y lo vemos con vos.
              </p>
              <BotonAyuda waNumero={waNumero} nombrePila={nombrePila} />
            </section>
          )}

          {error && (
            <p role="alert" className="rounded-xl px-4 py-3 text-[15px] text-red-200 bg-red-900/30 border border-red-500/30">{error}</p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-xl py-4 text-[17px] font-bold flex items-center justify-center gap-2 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-70"
            style={{ background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 6px 24px rgba(240,197,90,0.30)" }}
          >
            {enviando && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
            {enviando ? "Enviando…" : "Enviar mi opinión"}
          </button>
        </>
      )}
      <PreguntaCompartir
        abierta={preguntar}
        texto={textoPermiso}
        identidad={identidadPublica}
        onSi={compartirYEnviar}
        onNo={enviarSinCompartir}
        onCerrar={() => setPreguntar(false)}
      />
    </form>
  );
}
