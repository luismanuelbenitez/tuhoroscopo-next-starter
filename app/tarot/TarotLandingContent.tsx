'use client';

import Link from 'next/link';
import CardCross from '@/components/tarot/CardCross';

const GOLD = '#FFCE4D';
const GOLD_DIM = 'rgba(251,191,36,0.70)';

const DELIVERABLES = [
  { emoji: '🃏', label: 'Tirada de 5 cartas', desc: 'Cruz celta simplificada: situación, obstáculo, pasado, futuro y consejo final.' },
  { emoji: '✍️', label: 'Lectura narrativa', desc: 'Un texto fluido que conecta las 5 cartas con tu consulta, no una lista de significados.' },
  { emoji: '💬', label: 'Por WhatsApp', desc: 'Recibís la lectura completa en tu WhatsApp, en formato cómodo para leer cuando quieras.' },
  { emoji: '✨', label: 'Lectura única para vos', desc: 'Cada tirada se construye desde cero para tu pregunta y contexto. No hay dos lecturas iguales.' },
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
  { title: 'Simbología clásica', desc: 'Los arquetipos del tarot tradicional aplicados a tu consulta específica, con análisis simbólico profundo.' },
  { title: 'Tono honesto', desc: 'Sin promesas mágicas. La lectura ofrece perspectiva, no certezas absolutas.' },
];

const PDF_MOCK_POSITIONS = [
  { n: '1', label: 'Tu momento actual',       col: 2, row: 1 },
  { n: '2', label: 'El desafío',              col: 1, row: 2 },
  { n: '4', label: 'Consejo para avanzar',    col: 2, row: 2 },
  { n: '3', label: 'Lo que no estás viendo',  col: 3, row: 2 },
  { n: '5', label: 'Lo que viene',            col: 2, row: 3 },
];

const TESTIMONIALS = [
  {
    quote: 'No esperaba que fuera tan personalizado. Las cartas describieron exactamente lo que estaba viviendo.',
    name: 'Valentina R.',
    city: 'Montevideo',
    tema: 'Amor',
  },
  {
    quote: 'Me llegó en menos de 10 minutos. El PDF es precioso y me dio mucha claridad sobre mi situación laboral.',
    name: 'Marcela G.',
    city: 'Buenos Aires',
    tema: 'Trabajo',
  },
  {
    quote: 'Lo compré sin saber bien qué esperar y quedé sorprendida. Lo recomendé a dos amigas esa misma noche.',
    name: 'Daniela F.',
    city: 'Córdoba',
    tema: 'Situación general',
  },
];

const FAQ_ITEMS = [
  {
    q: '¿Es realmente personalizado o es un mensaje genérico?',
    a: 'Cada lectura se genera con tu nombre, fecha de nacimiento y la pregunta que vos escribís. Las cartas se seleccionan y se interpretan en relación a tu consulta específica. No es un texto estándar.',
  },
  {
    q: '¿Qué pasa si no me llega el mensaje de WhatsApp?',
    a: 'Si en 20 minutos no recibís nada, escribinos directamente. Lo resolvemos de inmediato. Por eso también te pedimos el email de forma opcional — si lo completás, enviamos el PDF por esa vía también.',
  },
  {
    q: '¿Puedo hacer otra consulta después?',
    a: 'Sí. Cada tirada es independiente. Podés comprar nuevas consultas cuando quieras, sobre el mismo tema o uno diferente. No hay suscripción ni renovación automática.',
  },
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
              <p className="mt-1 text-center md:text-left text-[11px] text-white/25">
                Una consulta con tarotista presencial cuesta $U 2.000+. Acá la recibís en minutos.
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

        {/* ── Vista previa del PDF ─────────────────────────────────── */}
        <div className="relative mx-auto max-w-4xl px-4 pb-12 md:pb-16" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-center mb-2" style={{ color: GOLD_DIM }}>
              ¿Y el PDF cómo es?
            </p>
            <h2 className="text-center text-white text-xl md:text-2xl font-bold mb-2">
              Esto es lo que vas a recibir.
            </h2>
            <p className="text-center text-white/50 text-sm mb-10">
              3 páginas · diseño premium · entregado directo a tu WhatsApp
            </p>

            <div className="flex justify-center">
              <div className="relative" style={{ width: 300, height: 410 }}>
                {/* Páginas detrás — efecto profundidad */}
                <div className="absolute rounded-xl" style={{
                  width: 280, height: 390, top: 16, left: 18,
                  background: '#120a2e', border: '1px solid rgba(251,191,36,0.10)',
                  transform: 'rotate(3deg)',
                }} />
                <div className="absolute rounded-xl" style={{
                  width: 280, height: 390, top: 8, left: 10,
                  background: '#150c35', border: '1px solid rgba(251,191,36,0.15)',
                  transform: 'rotate(1.5deg)',
                }} />

                {/* Página principal */}
                <div className="absolute rounded-xl" style={{
                  width: 280, height: 390, top: 0, left: 0,
                  background: 'linear-gradient(160deg, #1f0d4a 0%, #130827 100%)',
                  border: '1px solid rgba(251,191,36,0.45)',
                  boxShadow: '0 12px 48px rgba(0,0,0,0.70), 0 0 40px rgba(251,191,36,0.07)',
                  padding: '18px 16px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                }}>
                  {/* Header */}
                  <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, color: 'rgba(251,191,36,0.60)', marginBottom: 4 }}>
                    Tu Tirada Cósmica
                  </p>
                  <p style={{ color: 'white', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Valentina · Amor</p>
                  <div style={{ width: '80%', height: 1, background: 'rgba(251,191,36,0.15)', marginBottom: 14 }} />

                  {/* Cards cross */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gridTemplateRows: '1fr 1fr 1fr',
                    gap: 6,
                    width: '100%',
                    flex: 1,
                  }}>
                    {PDF_MOCK_POSITIONS.map((pos) => (
                      <div
                        key={pos.n}
                        style={{
                          gridColumn: pos.col,
                          gridRow: pos.row,
                          background: 'linear-gradient(160deg, #2d1b69 0%, #1a0f45 100%)',
                          border: pos.n === '1'
                            ? '1px solid rgba(251,191,36,0.65)'
                            : '1px solid rgba(251,191,36,0.22)',
                          borderRadius: 6,
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          gap: 4, padding: '4px 2px',
                          boxShadow: pos.n === '1' ? '0 0 16px rgba(251,191,36,0.18)' : 'none',
                        }}
                      >
                        <span style={{
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'rgba(251,191,36,0.15)',
                          border: '1px solid rgba(251,191,36,0.55)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700, color: GOLD, flexShrink: 0,
                        }}>{pos.n}</span>
                        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.3, padding: '0 2px' }}>
                          {pos.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div style={{ width: '80%', height: 1, background: 'rgba(251,191,36,0.10)', marginTop: 12, marginBottom: 8 }} />
                  <p style={{ fontSize: 7, color: 'rgba(251,191,36,0.28)', letterSpacing: '0.15em' }}>
                    TU HORÓSCOPO CÓSMICO · PÁG. 1 DE 3
                  </p>
                </div>
              </div>
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

        {/* ── Testimonios ──────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-4xl px-4 pb-12 md:pb-16" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-center mb-2" style={{ color: GOLD_DIM }}>
              Quienes ya consultaron
            </p>
            <h2 className="text-center text-white text-xl md:text-2xl font-bold mb-8">
              Lo que dicen sobre su tirada.
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {TESTIMONIALS.map((t) => (
                <div
                  key={t.name}
                  className="rounded-2xl p-5 flex flex-col gap-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <p className="text-white/70 text-sm leading-relaxed italic flex-1">&ldquo;{t.quote}&rdquo;</p>
                  <div
                    className="flex items-center justify-between gap-2 pt-2"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div>
                      <p className="text-white/90 text-xs font-semibold">{t.name}</p>
                      <p className="text-white/40 text-xs">{t.city}</p>
                    </div>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: 'rgba(251,191,36,0.10)', color: GOLD_DIM, border: '1px solid rgba(251,191,36,0.20)' }}
                    >
                      {t.tema}
                    </span>
                  </div>
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

        {/* ── FAQ ─────────────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-3xl px-4 pb-12 md:pb-16" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-center mb-2" style={{ color: GOLD_DIM }}>
              Preguntas frecuentes
            </p>
            <h2 className="text-center text-white text-xl md:text-2xl font-bold mb-8">
              Lo que más nos preguntan.
            </h2>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item) => (
                <div
                  key={item.q}
                  className="rounded-2xl p-5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <p className="text-white/90 text-sm font-semibold mb-2">{item.q}</p>
                  <p className="text-white/55 text-sm leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── CTA final ────────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-md px-4 pb-16 text-center" style={{ zIndex: 1 }}>
          <div
            className="rounded-2xl p-8"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(251,191,36,0.18)' }}
          >
            <p className="text-white/60 text-sm mb-1">Un pago único. Sin suscripción.</p>
            <p className="text-white/30 text-xs mb-4">Consultas presenciales: $U 2.000+. Acá, en minutos.</p>
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
