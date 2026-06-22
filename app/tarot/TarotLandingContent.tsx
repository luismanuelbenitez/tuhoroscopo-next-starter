'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Layers, FileText, MessageCircle, Sparkles, Clock, ShieldCheck, Target, User, BookOpen, Scale } from 'lucide-react';

const GOLD = '#FFCE4D';
const GOLD_DIM = 'rgba(251,191,36,0.70)';

const DELIVERABLES = [
  { Icon: Layers,        label: 'Tirada de 5 cartas',    desc: 'Cruz celta simplificada: situación, obstáculo, pasado, futuro y consejo final.' },
  { Icon: FileText,      label: 'Lectura narrativa',      desc: 'Un texto fluido que conecta las 5 cartas con tu consulta, no una lista de significados.' },
  { Icon: MessageCircle, label: 'Por WhatsApp',           desc: 'Recibís el PDF completo directo en tu WhatsApp. Sin apps ni descargas adicionales.' },
  { Icon: Sparkles,      label: 'Lectura única para vos', desc: 'Cada tirada se construye desde cero para tu pregunta y contexto. No hay dos lecturas iguales.' },
  { Icon: Clock,         label: 'En menos de 15 minutos', desc: 'Una vez confirmado el pago, tu lectura llega en minutos.' },
  { Icon: ShieldCheck,   label: 'Sin suscripción',        desc: 'Un pago único. Sin compromisos, sin renovaciones automáticas.' },
];

const STEPS = [
  { n: '1', title: 'Completás el formulario', desc: 'Tu nombre, tu consulta y unos datos básicos para personalizar la lectura.' },
  { n: '2', title: 'Confirmás el pago', desc: 'Pago único seguro vía Mercado Pago. Sin suscripciones.' },
  { n: '3', title: 'La IA genera tu lectura', desc: 'En minutos, la IA construye una tirada personalizada basada en tu pregunta.' },
  { n: '4', title: 'La recibís por WhatsApp', desc: 'Texto completo, claro y listo para releer cuando lo necesités.' },
];

const VALUE_CARDS = [
  { Icon: Target,   title: 'Una pregunta real',  desc: 'No es un horóscopo genérico por signo. La lectura gira alrededor de lo que vos preguntás.' },
  { Icon: User,     title: 'Contexto tuyo',      desc: 'Usamos tu nombre y tu fecha de nacimiento para anclar la lectura en tu energía.' },
  { Icon: BookOpen, title: 'Simbología clásica', desc: 'Los arquetipos del tarot tradicional aplicados a tu consulta específica, con análisis simbólico profundo.' },
  { Icon: Scale,    title: 'Tono honesto',        desc: 'Sin promesas mágicas. La lectura ofrece perspectiva, no certezas absolutas.' },
];

const PDF_PAGES = [
  { src: '/img/tarot/pdf-p1.jpg', label: 'Tirada de cartas' },
  { src: '/img/tarot/pdf-p2.jpg', label: 'Interpretación' },
  { src: '/img/tarot/pdf-p3.jpg', label: 'Mensaje final' },
];

const TESTIMONIALS = [
  {
    quote: 'No esperaba que fuera tan personalizado. Las cartas describieron exactamente lo que estaba viviendo.',
    name: 'Valentina R.',
    city: 'Montevideo',
    tema: 'Amor',
    avatar: '/img/tarot/avatar-valentina.jpg',
  },
  {
    quote: 'Me llegó en menos de 10 minutos. El PDF es precioso y me dio mucha claridad sobre mi situación laboral.',
    name: 'Marcela G.',
    city: 'Punta del Este',
    tema: 'Trabajo',
    avatar: '/img/tarot/avatar-marcela.jpg',
  },
  {
    quote: 'Lo compré sin saber bien qué esperar y quedé sorprendida. Lo recomendé a dos amigas esa misma noche.',
    name: 'Daniela F.',
    city: 'Salto',
    tema: 'Situación general',
    avatar: '/img/tarot/avatar-daniela.jpg',
  },
];

const FAQ_ITEMS = [
  {
    q: '¿En qué formato recibo la lectura?',
    a: 'Recibís un PDF de 3 páginas directo en tu WhatsApp: la tirada visual con tus 5 cartas, la interpretación de cada una en relación a tu pregunta, y un mensaje final personalizado. Si completás el email, también te lo enviamos por esa vía como respaldo.',
  },
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

function PdfPageViewer({ width = 220 }: { width?: number }) {
  const [active, setActive] = useState(0);
  const height = Math.round(width * 1.414); // A4 ratio

  const prev = () => setActive(i => (i - 1 + PDF_PAGES.length) % PDF_PAGES.length);
  const next = () => setActive(i => (i + 1) % PDF_PAGES.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, userSelect: 'none' }}>

      {/* Visor */}
      <div style={{ position: 'relative', width, height }}>
        {PDF_PAGES.map((page, i) => (
          <div
            key={page.src}
            className="absolute rounded-xl overflow-hidden"
            style={{
              inset: 0,
              border: '1px solid rgba(251,191,36,0.45)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.65), 0 0 28px rgba(251,191,36,0.07)',
              opacity: i === active ? 1 : 0,
              transform: i === active ? 'scale(1)' : 'scale(0.97)',
              transition: 'opacity 0.32s ease, transform 0.32s ease',
              pointerEvents: i === active ? 'auto' : 'none',
            }}
          >
            <Image
              src={page.src}
              alt={page.label}
              width={width}
              height={height}
              priority={i === 0}
              style={{ objectFit: 'cover', objectPosition: 'top', display: 'block', width: '100%', height: '100%' }}
            />
          </div>
        ))}

        {/* Flechas */}
        {active > 0 && (
          <button onClick={prev} style={{
            position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)',
            width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(251,191,36,0.30)',
            background: 'rgba(13,8,32,0.80)', color: GOLD, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
          }}>‹</button>
        )}
        {active < PDF_PAGES.length - 1 && (
          <button onClick={next} style={{
            position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%)',
            width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(251,191,36,0.30)',
            background: 'rgba(13,8,32,0.80)', color: GOLD, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
          }}>›</button>
        )}
      </div>

      {/* Dots + label */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {PDF_PAGES.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              style={{
                width: i === active ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: i === active ? GOLD : 'rgba(251,191,36,0.22)',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.22s ease',
              }}
            />
          ))}
        </div>
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em', margin: 0 }}>
          {PDF_PAGES[active].label.toUpperCase()} · {active + 1} / {PDF_PAGES.length}
        </p>
      </div>

    </div>
  );
}

export default function TarotLandingContent({ precioUYU = 590 }: { precioUYU?: number }) {
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
                  $U {precioUYU}<span className="font-normal" style={{ color: 'rgba(255,255,255,0.50)' }}> · pago único</span>
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
              <p className="mt-1.5 text-center md:text-left text-[11px]" style={{ color: 'rgba(251,191,36,0.38)' }}>
                ✦ Si no recibís tu lectura en 15 minutos, te devolvemos el dinero.
              </p>
            </div>

            {/* PDF viewer — oculto en mobile, visible en desktop */}
            <div className="tarot-in-2 hidden md:flex w-[260px] shrink-0 items-center justify-center">
              <PdfPageViewer width={220} />
            </div>

          </div>
        </div>

        {/* PDF viewer mobile */}
        <div className="relative md:hidden flex justify-center px-4 pb-8" style={{ zIndex: 1 }}>
          <PdfPageViewer width={240} />
        </div>

        {/* ── Qué recibís ──────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-4xl px-4 pb-12 md:pb-16" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-center mb-2" style={{ color: GOLD_DIM }}>
              ¿Qué recibís exactamente?
            </p>
            <p className="text-center text-white/50 text-sm mb-8">Tu PDF llega directo a tu WhatsApp. Sin apps ni pasos extra.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {DELIVERABLES.map(({ Icon, label, desc }) => (
                <div
                  key={label}
                  className="rounded-2xl p-5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <Icon size={22} style={{ color: GOLD_DIM }} className="mb-3" />
                  <p className="text-white/90 text-sm font-semibold mb-1">{label}</p>
                  <p className="text-white/50 text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>

            {/* WhatsApp mockup */}
            <div className="mt-12 flex flex-col items-center gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: GOLD_DIM }}>
                Así llega a tu WhatsApp
              </p>
              <Image
                src="/img/tarot/whatsapp-mockup.jpg"
                alt="Vista previa de la lectura llegando por WhatsApp"
                width={260}
                height={371}
                className="rounded-2xl"
                style={{ border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 8px 40px rgba(0,0,0,0.55)' }}
              />
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
              3 páginas · diseño premium · navegá entre ellas con las flechas
            </p>

            <div className="flex flex-col items-center gap-6">
              <PdfPageViewer width={300} />
              <Link
                href={'/tarot/checkout' as never}
                className="inline-block rounded-xl px-10 py-3.5 text-sm font-bold transition-all active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #d4a017 0%, #FFCE4D 60%, #f0c840 100%)',
                  color: '#0f0820',
                  boxShadow: '0 4px 20px rgba(251,191,36,0.28)',
                }}
              >
                Quiero mi lectura →
              </Link>
            </div>
          </div>
        </div>

        {/* ── Cómo funciona ────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-4xl px-4 pb-12 md:pb-16" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-center mb-8" style={{ color: GOLD_DIM }}>
              ¿Cómo funciona?
            </p>
            <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-0">
              {STEPS.map((step, idx) => (
                <Fragment key={step.n}>
                  <div className="flex md:flex-col gap-4 md:gap-3 md:items-center md:text-center flex-1 min-w-0">
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
                  {idx < STEPS.length - 1 && (
                    <div className="hidden md:flex items-center justify-center self-start mt-4 px-1 text-lg shrink-0" style={{ color: 'rgba(251,191,36,0.22)' }}>
                      ›
                    </div>
                  )}
                </Fragment>
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
              {VALUE_CARDS.map(({ Icon, title, desc }) => (
                <div
                  key={title}
                  className="rounded-2xl p-5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <Icon size={20} style={{ color: GOLD_DIM }} className="mb-3" />
                  <p className="text-sm font-semibold mb-1" style={{ color: GOLD }}>{title}</p>
                  <p className="text-white/60 text-sm leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Testimonios ──────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-4xl px-4 pb-12 md:pb-16" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-center mb-2" style={{ color: GOLD_DIM }}>
              Experiencias reales
            </p>
            <h2 className="text-center text-white text-xl md:text-2xl font-bold mb-8">
              Lo que sintieron después de su lectura.
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
                    <div className="flex items-center gap-2">
                      <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: '1.5px solid rgba(251,191,36,0.35)', flexShrink: 0 }}>
                        <Image src={t.avatar} alt={t.name} width={32} height={32} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                      </div>
                      <div>
                        <p className="text-white/90 text-xs font-semibold">{t.name}</p>
                        <p className="text-white/40 text-xs">{t.city}</p>
                      </div>
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
            <p className="text-center mt-6 text-[10px]" style={{ color: 'rgba(255,255,255,0.18)' }}>
              * Experiencias ilustrativas del tipo de lectura que entregamos. Producto en lanzamiento.
            </p>
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
              <span className="text-3xl font-extrabold text-white">$U {precioUYU}</span>
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
