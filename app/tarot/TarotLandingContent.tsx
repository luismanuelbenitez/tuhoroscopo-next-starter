'use client';

import Link from 'next/link';
import CardCross from '@/components/tarot/CardCross';

const GOLD = '#FFCE4D';
const GOLD_DIM = 'rgba(251,191,36,0.70)';

const DELIVERABLES = [
  { emoji: '🃏', label: 'Tirada de 5 cartas', desc: 'Cruz celta simplificada: situación, obstáculo, pasado, futuro y consejo final.' },
  { emoji: '✍️', label: 'Lectura narrativa', desc: 'Un texto fluido que conecta las 5 cartas con tu consulta, no una lista de significados.' },
  { emoji: '💬', label: 'Por WhatsApp', desc: 'Recibís la lectura completa en tu WhatsApp, en formato cómodo para leer cuando quieras.' },
  { emoji: '🤖', label: 'Generado con IA', desc: 'Combinamos simbología tarot clásica con inteligencia artificial para una lectura precisa y personalizada.' },
  { emoji: '⏱️', label: 'Entrega en minutos', desc: 'Una vez confirmado el pago, tu lectura llega en menos de 15 minutos.' },
  { emoji: '📎', label: 'Sin suscripción', desc: 'Es un pago único. Sin compromisos, sin renovaciones automáticas.' },
];

const STEPS = [
  { n: '1', title: 'Completás el formulario', desc: 'Tu nombre, tu consulta y unos datos básicos para personalizar la lectura.' },
  { n: '2', title: 'Confirmás el pago', desc: 'Pago único seguro vía Mercado Pago. Sin suscripciones.' },
  { n: '3', title: 'La IA genera tu lectura', desc: 'En minutos, construimos una tirada personalizada para tu pregunta.' },
  { n: '4', title: 'La recibís por WhatsApp', desc: 'Texto completo, claro y listo para releer cuando lo necesités.' },
];

const VALUE_CARDS = [
  { title: 'Una pregunta real', desc: 'No es un horóscopo genérico por signo. La lectura gira alrededor de lo que vos preguntás.' },
  { title: 'Contexto tuyo', desc: 'Usamos tu nombre y tu fecha de nacimiento para anclar la lectura en tu energía.' },
  { title: 'Simbología clásica', desc: 'Los arquetipos del tarot tradicional, interpretados por IA entrenada en hermenéutica simbólica.' },
  { title: 'Tono honesto', desc: 'Sin promesas mágicas. La lectura ofrece perspectiva, no certezas absolutas.' },
];

export default function TarotLandingContent() {
  return (
    <>
      <style jsx global>{`
        body {
          background-image: none !important;
          background-color: #0e0b22 !important;
        }
        body::before { display: none !important; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tarot-in   { animation: fadeUp 0.6s ease both; }
        .tarot-in-2 { animation: fadeUp 0.6s 0.2s ease both; }
      `}</style>

      <div
        className="min-h-screen text-white relative z-[1]"
        style={{ background: 'linear-gradient(180deg, #110927 0%, #0d0820 55%, #0e0b22 100%)' }}
      >
        {/* Gold glow top */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(251,191,36,0.08), transparent)', zIndex: 0 }}
        />

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-5xl px-4 pt-6 md:pt-10 pb-6" style={{ zIndex: 1 }}>
          <div className="flex flex-col md:flex-row gap-8 md:gap-14 md:items-center">

            {/* Texto + CTA */}
            <div className="tarot-in flex-1 text-center md:text-left">
              <div
                className="inline-block mb-5 px-3 py-1 rounded-full text-xs tracking-widest uppercase font-semibold"
                style={{ border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.08)', color: GOLD_DIM }}
              >
                Lectura de tarot personalizada
              </div>

              <h1 className="text-3xl md:text-[2.9rem] font-extrabold text-white leading-tight mb-4">
                Una respuesta clara{' '}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: `linear-gradient(90deg, ${GOLD}, rgba(251,191,36,0.75))` }}
                >
                  para tu pregunta real.
                </span>
              </h1>

              <p className="text-white/70 text-base md:text-lg max-w-lg mx-auto md:mx-0 mb-6 leading-relaxed">
                Tirada de 5 cartas generada con IA, entregada por WhatsApp en minutos. Un pago único, sin suscripción.
              </p>

              <div className="flex flex-wrap justify-center md:justify-start gap-3 text-sm mb-8">
                <span
                  className="rounded-full px-4 py-1.5 font-bold text-white"
                  style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.25)' }}
                >
                  $U 590<span className="font-normal" style={{ color: 'rgba(255,255,255,0.50)' }}> · pago único</span>
                </span>
                <span className="text-white/30">·</span>
                <span className="text-white/65">Sin suscripción</span>
                <span className="text-white/30">·</span>
                <span className="text-white/65">Entrega en minutos</span>
              </div>

              <Link
                href={'/tarot/checkout' as never}
                className="inline-block w-full md:w-auto rounded-xl px-10 py-4 text-base font-bold transition-all active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #d4a017 0%, #FFCE4D 60%, #f0c840 100%)',
                  color: '#0f0820',
                  boxShadow: '0 4px 24px rgba(251,191,36,0.30)',
                }}
              >
                Consultar ahora →
              </Link>

              <p className="mt-3 text-center md:text-left text-[12px] text-white/40">
                Pago seguro vía Mercado Pago · Sin renovaciones
              </p>
            </div>

            {/* CardCross — oculto en mobile, visible en desktop */}
            <div className="tarot-in-2 hidden md:flex w-[260px] shrink-0 items-center justify-center">
              <CardCross />
            </div>

          </div>
        </div>

        {/* CardCross mobile */}
        <div className="relative md:hidden flex justify-center px-4 pb-8" style={{ zIndex: 1 }}>
          <CardCross />
        </div>

        {/* ── Qué recibís ──────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-4xl px-4 pb-12 md:pb-16" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-center mb-2" style={{ color: GOLD_DIM }}>
              ¿Qué recibís exactamente?
            </p>
            <p className="text-center text-white/50 text-sm mb-8">Todo en un solo mensaje de WhatsApp.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {DELIVERABLES.map(item => (
                <div
                  key={item.label}
                  className="rounded-2xl p-5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="text-2xl mb-3">{item.emoji}</div>
                  <p className="text-white/90 text-sm font-semibold mb-1">{item.label}</p>
                  <p className="text-white/50 text-xs leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Cómo funciona ────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-4xl px-4 pb-12 md:pb-16" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-center mb-8" style={{ color: GOLD_DIM }}>
              ¿Cómo funciona?
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {STEPS.map(step => (
                <div key={step.n} className="flex md:flex-col gap-4 md:gap-3 md:items-center md:text-center">
                  <div
                    className="text-3xl md:text-4xl font-extrabold leading-none shrink-0"
                    style={{ color: 'rgba(251,191,36,0.55)' }}
                  >
                    {step.n}
                  </div>
                  <div>
                    <p className="text-white/90 font-semibold text-sm md:text-base">{step.title}</p>
                    <p className="text-white/50 text-xs md:text-sm mt-1 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── No es un mensaje genérico ────────────────────────────── */}
        <div className="relative mx-auto max-w-4xl px-4 pb-12 md:pb-16" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-center mb-2" style={{ color: GOLD_DIM }}>
              Por qué es diferente
            </p>
            <h2 className="text-center text-white text-xl md:text-2xl font-bold mb-8">
              No es un mensaje genérico.
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {VALUE_CARDS.map(card => (
                <div
                  key={card.title}
                  className="rounded-2xl p-5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <p className="text-sm font-semibold mb-1" style={{ color: GOLD }}>{card.title}</p>
                  <p className="text-white/60 text-sm leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Transparencia ────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-2xl px-4 pb-12" style={{ zIndex: 1 }}>
          <div
            className="rounded-2xl p-5"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: GOLD_DIM }}>
              Transparencia
            </p>
            <p className="text-white/50 text-sm leading-relaxed">
              Esta lectura es generada por inteligencia artificial aplicando simbología tarot tradicional a tu consulta. No es una predicción del futuro ni una garantía de resultados. El objetivo es ofrecerte una perspectiva simbólica para reflexionar — no reemplaza consejo profesional en ninguna área.
            </p>
          </div>
        </div>

        {/* ── CTA final ────────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-md px-4 pb-16 text-center" style={{ zIndex: 1 }}>
          <div
            className="rounded-2xl p-8"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(251,191,36,0.18)' }}
          >
            <p className="text-white/60 text-sm mb-2">Un pago único. Sin suscripción.</p>
            <div className="mb-6">
              <span className="text-3xl font-extrabold text-white">$U 590</span>
              <span className="text-white/55 text-sm ml-1">· IVA incluido</span>
            </div>
            <Link
              href={'/tarot/checkout' as never}
              className="inline-block w-full rounded-xl py-4 text-base font-bold transition-all active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #d4a017 0%, #FFCE4D 60%, #f0c840 100%)',
                color: '#0f0820',
                boxShadow: '0 4px 24px rgba(251,191,36,0.28)',
              }}
            >
              Consultar ahora →
            </Link>
            <p className="mt-3 text-[12px] text-white/40">Pago seguro · Entrega en minutos · Sin renovaciones</p>
          </div>
        </div>

      </div>
    </>
  );
}
