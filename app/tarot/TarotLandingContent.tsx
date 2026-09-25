'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, Clock, MessageCircle, FileText, Zap, ChevronDown } from 'lucide-react';
import { trackViewItem, trackLandingViewed } from '@/lib/analytics';
import { metaViewContent } from '@/lib/metaPixel';

const GOLD = '#FFCE4D';
const GOLD_DIM = 'rgba(251,191,36,0.68)';
const CHECKOUT = '/tarot/checkout';

const PDF_PAGES = [
  { src: '/img/tarot/pdf-p1.jpg', label: 'Tu tirada' },
  { src: '/img/tarot/pdf-p2.jpg', label: 'Interpretación' },
  { src: '/img/tarot/pdf-p3.jpg', label: 'Mensaje final' },
];

// La propuesta (2026-09-25): no se vende "un PDF", se vende una EXPERIENCIA —
// se sortean tus 5 cartas, se leen para vos, y te llegan por WhatsApp y/o
// email con lectura online (móvil, 30 días) + PDF. Todo texto de esta página
// debe ser coherente con esa entrega y con la garantía de 15 minutos.

const BENEFITS = [
  {
    icon: '🔍',
    heading: 'Claridad sobre tu momento',
    desc: 'Ves lo que estás viviendo desde afuera. A veces ese ángulo cambia todo.',
  },
  {
    icon: '🃏',
    heading: 'Una tirada que es solo tuya',
    desc: 'Tus 5 cartas se sortean cuando pagás y se leen en relación con vos: tu nombre, tu fecha y lo que quieras explorar.',
  },
  {
    icon: '🚧',
    heading: 'Lo que quizás no estás viendo',
    desc: 'La tirada pone sobre la mesa lo que puede estar frenándote, aunque no lo notes desde adentro.',
  },
  {
    icon: '🗝️',
    heading: 'Claves para avanzar',
    desc: 'Cada lectura cierra con un resumen, un mensaje personal y tres claves concretas. Sin predicciones: simbología del tarot aplicada a tu momento.',
  },
];

const STEPS = [
  {
    n: '01',
    icon: '✏️',
    title: 'Contanos tu momento',
    desc: 'Tu nombre, tu WhatsApp, tu fecha de nacimiento y, si querés, una pregunta. Menos de 2 minutos.',
  },
  {
    n: '02',
    icon: '💳',
    title: 'Confirmás el pago',
    desc: 'Un pago único y seguro con Mercado Pago. Sin suscripción ni cargos futuros.',
  },
  {
    n: '03',
    icon: '🔮',
    title: 'Se tiran tus cartas',
    desc: 'Se sortean tus 5 cartas y se leen una por una en relación con tu situación. Cada tirada es única.',
  },
  {
    n: '04',
    icon: '📲',
    title: 'Te llega en menos de 15 min',
    desc: 'Por WhatsApp (y por email, si lo dejás): tu tirada, la lectura online y el PDF. Sin apps ni descargas.',
  },
];

const TRUST_BADGES = [
  { Icon: ShieldCheck,   text: 'Pago seguro con Mercado Pago' },
  { Icon: Zap,           text: 'Te llega en menos de 15 min' },
  { Icon: MessageCircle, text: 'Por WhatsApp y/o email' },
  { Icon: FileText,      text: 'Sin suscripción' },
  { Icon: Clock,         text: 'Garantía de devolución' },
];

const QUESTION_TYPES = [
  { icon: '❤️', label: 'Amor y relaciones' },
  { icon: '💼', label: 'Trabajo y carrera' },
  { icon: '💰', label: 'Economía' },
  { icon: '👨‍👩‍👧', label: 'Familia' },
  { icon: '🛣️', label: 'Decisiones importantes' },
  { icon: '🌱', label: 'Crecimiento personal' },
  { icon: '✈️', label: 'Cambios de vida' },
  { icon: '🔮', label: 'Lo que viene' },
];

const FAQ = [
  {
    q: '¿Qué recibo exactamente?',
    a: 'Un mensaje en tu WhatsApp (y en tu email, si lo dejás) con tus 5 cartas y dos botones: "Leer mi tirada", una lectura online pensada para el celular que queda disponible 30 días, y "Descargar PDF", un archivo de 3 páginas que es tuyo para siempre.',
  },
  {
    q: '¿Cuánto tarda?',
    a: 'Menos de 15 minutos desde que se confirma tu pago. Si pasado ese tiempo no la recibiste, escribinos a hola@tuoraculo.uy y te la enviamos de inmediato o te devolvemos el dinero.',
  },
  {
    q: '¿Es realmente personalizado?',
    a: 'Sí. Tus 5 cartas se sortean para vos y se interpretan con tu nombre, tu fecha de nacimiento, el tema que elegiste y tu pregunta, si la escribís. Con pregunta concreta o sin ella. No es texto estándar ni genérico.',
  },
  {
    q: '¿Qué pasa si no me llega?',
    a: 'Primero revisá que el número de WhatsApp esté bien escrito y mirá tu email (incluida la carpeta de spam). Si pasaron 15 minutos y no hay nada, escribinos a hola@tuoraculo.uy: la reenviamos o te devolvemos el dinero.',
  },
  {
    q: '¿Es IA o hay un tarotista humano?',
    a: 'Las cartas se sortean y la lectura la genera inteligencia artificial, aplicando la simbología del tarot clásico a tu situación. No hay un tarotista humano detrás. Es una perspectiva simbólica para reflexionar, no una predicción.',
  },
  {
    q: '¿Puedo consultar más de una vez?',
    a: 'Sí. Cada tirada es independiente: cada vez se sortean cartas nuevas. Podés pedir otra cuando quieras, sobre el mismo tema o uno diferente. Sin suscripción ni renovaciones.',
  },
  {
    q: '¿Cómo funciona el pago?',
    a: 'El pago se procesa con Mercado Pago. Podés pagar con tarjeta, saldo o transferencia. Tus datos bancarios nunca pasan por nuestros servidores. Un único cobro, sin cargos ocultos.',
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function PdfViewer({ width }: { width: number }) {
  const [active, setActive] = useState(0);
  const h = Math.round(width * 1.414);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, userSelect: 'none' }}>
      <div style={{ position: 'relative', width, height: h }}>
        {PDF_PAGES.map((page, i) => (
          <div
            key={page.src}
            style={{
              position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden',
              border: `1.5px solid ${i === active ? 'rgba(251,191,36,0.50)' : 'rgba(251,191,36,0.16)'}`,
              boxShadow: i === active
                ? '0 24px 64px rgba(0,0,0,0.75), 0 0 48px rgba(251,191,36,0.09)'
                : '0 8px 24px rgba(0,0,0,0.5)',
              opacity: i === active ? 1 : 0,
              transform: i === active ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(6px)',
              transition: 'all 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: i === active ? 'auto' : 'none',
            }}
          >
            <Image
              src={page.src} alt={page.label}
              width={width} height={h} priority={i === 0}
              style={{ objectFit: 'cover', objectPosition: 'top', display: 'block', width: '100%', height: '100%' }}
            />
          </div>
        ))}
        {active > 0 && (
          <button
            onClick={() => setActive(i => i - 1)}
            aria-label="Página anterior"
            style={{
              position: 'absolute', left: -17, top: '50%', transform: 'translateY(-50%)',
              width: 34, height: 34, borderRadius: '50%',
              border: '1px solid rgba(251,191,36,0.35)',
              background: 'rgba(8,5,20,0.88)', backdropFilter: 'blur(6px)',
              color: GOLD, fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
              transition: 'all 0.18s',
            }}
          >‹</button>
        )}
        {active < PDF_PAGES.length - 1 && (
          <button
            onClick={() => setActive(i => i + 1)}
            aria-label="Página siguiente"
            style={{
              position: 'absolute', right: -17, top: '50%', transform: 'translateY(-50%)',
              width: 34, height: 34, borderRadius: '50%',
              border: '1px solid rgba(251,191,36,0.35)',
              background: 'rgba(8,5,20,0.88)', backdropFilter: 'blur(6px)',
              color: GOLD, fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
              transition: 'all 0.18s',
            }}
          >›</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        {PDF_PAGES.map((_, i) => (
          <button
            key={i} onClick={() => setActive(i)}
            aria-label={PDF_PAGES[i].label}
            style={{
              width: i === active ? 22 : 7, height: 7, borderRadius: 4,
              background: i === active ? GOLD : 'rgba(251,191,36,0.22)',
              border: 'none', cursor: 'pointer', padding: 0,
              transition: 'all 0.25s ease',
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.10em', margin: 0 }}>
        {PDF_PAGES[active].label.toUpperCase()} · {active + 1} / {PDF_PAGES.length}
      </p>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderRadius: 14,
      border: `1px solid ${open ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.08)'}`,
      background: open ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.025)',
      transition: 'border-color 0.2s, background 0.2s',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '18px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>{q}</span>
        <ChevronDown
          size={15}
          style={{
            color: open ? GOLD : 'rgba(255,255,255,0.38)',
            transition: 'all 0.25s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
      </button>
      <div style={{ maxHeight: open ? 340 : 0, overflow: 'hidden', transition: 'max-height 0.32s cubic-bezier(0.4,0,0.2,1)' }}>
        <p style={{ padding: '0 20px 18px', color: 'rgba(255,255,255,0.58)', fontSize: 14, lineHeight: 1.72, margin: 0 }}>{a}</p>
      </div>
    </div>
  );
}

function CtaLink({ size = 'md', children }: { size?: 'sm' | 'md' | 'lg'; children?: React.ReactNode }) {
  const pad  = size === 'lg' ? '18px 48px' : size === 'sm' ? '11px 24px' : '15px 36px';
  const fs   = size === 'lg' ? 17 : size === 'sm' ? 14 : 15;
  return (
    <Link
      href={CHECKOUT as never}
      className="tl-cta"
      style={{
        display: 'inline-block', padding: pad, borderRadius: 14,
        background: `linear-gradient(135deg, #c49008 0%, ${GOLD} 55%, #f2cc44 100%)`,
        color: '#0c0618', fontWeight: 800, fontSize: fs, textDecoration: 'none',
        letterSpacing: '-0.01em',
        boxShadow: '0 4px 24px rgba(251,191,36,0.30)',
      }}
    >
      {children ?? 'Quiero mi tirada →'}
    </Link>
  );
}

const EYEBROW: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: GOLD_DIM, textAlign: 'center', marginBottom: 10,
};
const H2: React.CSSProperties = {
  fontSize: 'clamp(22px, 4vw, 34px)', fontWeight: 800, textAlign: 'center',
  marginBottom: 10, color: 'white', letterSpacing: '-0.022em', lineHeight: 1.25,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TarotLandingContent({ precioUYU }: { precioUYU: number | null }) {
  const [showSticky, setShowSticky] = useState(false);
  const precioTexto = precioUYU !== null ? `$U ${precioUYU}` : 'Ver precio en el checkout';

  useEffect(() => {
    trackViewItem('tarot', precioUYU ?? undefined);
    trackLandingViewed('tarot');
    metaViewContent(precioUYU ?? undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-tl-reveal]');
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('tl-revealed'); io.unobserve(e.target); }
      }),
      { threshold: 0.10 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const fn = () => setShowSticky(window.scrollY > 520);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <>
      <style jsx global>{`
        body { background-color: #0d0820 !important; background-image: none !important; }
        body::before { display: none !important; }

        @keyframes tl-fade-up {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tl-gold-pulse {
          0%,100% { box-shadow: 0 4px 24px rgba(251,191,36,0.30); }
          50%      { box-shadow: 0 6px 40px rgba(251,191,36,0.52); }
        }
        @keyframes tl-float {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        @keyframes tl-slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }

        .tl-in0 { animation: tl-fade-up 0.65s ease both; }
        .tl-in1 { animation: tl-fade-up 0.65s 0.10s ease both; }
        .tl-in2 { animation: tl-fade-up 0.65s 0.22s ease both; }
        .tl-in3 { animation: tl-fade-up 0.65s 0.38s ease both; }
        .tl-in4 { animation: tl-fade-up 0.65s 0.52s ease both; }

        [data-tl-reveal] {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.58s ease, transform 0.58s ease;
        }
        [data-tl-reveal].tl-revealed { opacity: 1; transform: translateY(0); }

        .tl-cta {
          animation: tl-gold-pulse 2.8s ease infinite;
          transition: transform 0.16s ease !important;
        }
        .tl-cta:hover {
          transform: translateY(-2px) !important;
          animation: none;
          box-shadow: 0 10px 40px rgba(251,191,36,0.55) !important;
        }
        .tl-cta:active { transform: scale(0.97) !important; }

        .tl-card {
          transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
        }
        .tl-card:hover {
          transform: translateY(-4px);
          border-color: rgba(251,191,36,0.26) !important;
          box-shadow: 0 16px 48px rgba(0,0,0,0.45) !important;
        }

        .tl-step {
          transition: background 0.22s ease, border-color 0.22s ease;
        }
        .tl-step:hover {
          background: rgba(251,191,36,0.06) !important;
          border-color: rgba(251,191,36,0.20) !important;
        }

        .tl-q-card {
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }
        .tl-q-card:hover {
          transform: translateY(-3px);
          border-color: rgba(251,191,36,0.28) !important;
          background: rgba(251,191,36,0.06) !important;
        }

        .tl-sticky { animation: tl-slide-up 0.28s cubic-bezier(0.4,0,0.2,1) both; }

        /* Hero: dos celulares superpuestos (mensaje de WhatsApp + lectura online) */
        .tl-phones { position: relative; width: 340px; height: 420px; animation: tl-float 5s ease-in-out infinite; }
        .tl-phone {
          position: absolute; top: 0; height: auto !important; border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          box-shadow: 0 22px 60px rgba(0,0,0,0.7);
        }
        .tl-phone-a { left: 0; width: 195px !important; transform: rotate(-5deg); z-index: 1; }
        .tl-phone-b {
          right: 0; top: 36px; width: 195px !important; transform: rotate(4deg); z-index: 2;
          box-shadow: 0 26px 70px rgba(0,0,0,0.8), 0 0 46px rgba(251,191,36,0.14);
        }
        @media (max-width: 700px) {
          .tl-phones { width: min(340px, 92vw); height: 380px; }
          .tl-phone-a, .tl-phone-b { width: 46vw !important; max-width: 185px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tl-phones, .tl-cta { animation: none; }
        }

        /* Hero grid: 2 cols on ≥700px, stacked on mobile */
        .tl-hero-grid {
          display: grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 40px;
          align-items: center;
        }
        @media (max-width: 700px) {
          .tl-hero-grid {
            grid-template-columns: 1fr;
            gap: 36px;
          }
          .tl-hero-copy { order: 1; }
          .tl-hero-visual  { order: 2; }
        }

        /* Quick facts: wrap neatly on small screens */
        .tl-quick-facts {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 22px;
        }

        /* Trust bar: horizontal scroll on mobile */
        .tl-trust-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 24px;
          justify-content: center;
        }
      `}</style>

      <div style={{
        background: 'linear-gradient(180deg, #130a2e 0%, #0e0820 30%, #0d0820 65%, #0c0920 100%)',
        minHeight: '100vh', color: 'white', position: 'relative',
      }}>

        {/* Ambient glow — fixed */}
        <div style={{
          position: 'fixed', inset: '0 0 auto 0', height: 320,
          background: 'radial-gradient(ellipse 90% 65% at 50% 0%, rgba(251,191,36,0.07), transparent)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* ══════════════════════════════════════════════════════════
            HERO
        ══════════════════════════════════════════════════════════ */}
        <section style={{ position: 'relative', zIndex: 1, maxWidth: 1080, margin: '0 auto', padding: '48px 24px 52px' }}>
          <div className="tl-hero-grid">

            {/* Copy */}
            <div className="tl-hero-copy">
              <div className="tl-in0" style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 22,
                padding: '6px 16px', borderRadius: 100,
                border: '1px solid rgba(251,191,36,0.22)',
                background: 'rgba(251,191,36,0.07)',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.09em',
                textTransform: 'uppercase', color: GOLD_DIM,
              }}>
                ✦ Tarot personalizado con IA · Tu Oráculo
              </div>

              <h1 className="tl-in1" style={{
                fontSize: 'clamp(28px, 5vw, 50px)', fontWeight: 900,
                lineHeight: 1.16, marginBottom: 18, letterSpacing: '-0.025em',
              }}>
                Tirá tus cartas.<br />
                <span style={{
                  background: `linear-gradient(90deg, ${GOLD} 0%, rgba(251,191,36,0.72) 100%)`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  Mirá tu momento desde otra perspectiva.
                </span>
              </h1>

              <p className="tl-in2" style={{
                fontSize: 17, color: 'rgba(255,255,255,0.68)',
                lineHeight: 1.65, marginBottom: 28, maxWidth: 500,
              }}>
                Contanos qué estás viviendo (y una pregunta, si querés). Sorteamos tus 5 cartas, las leemos
                para vos y en menos de 15 minutos te llegan por WhatsApp: una lectura online hecha para el celular
                y un PDF para guardar.
              </p>

              <div className="tl-quick-facts tl-in2" style={{ marginBottom: 32 }}>
                {[
                  { icon: '💰', label: precioTexto, sub: 'pago único' },
                  { icon: '⏱',  label: 'En menos de 15 min', sub: '' },
                  { icon: '📲', label: 'Por WhatsApp',       sub: 'y/o email' },
                  { icon: '🔓', label: 'Sin suscripción',    sub: '' },
                ].map(f => (
                  <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{f.icon}</span>
                    <span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{f.label}</span>
                      {f.sub && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', marginLeft: 4 }}>{f.sub}</span>}
                    </span>
                  </div>
                ))}
              </div>

              <div className="tl-in3">
                <CtaLink size="lg" />
                <p style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.34)', lineHeight: 1.65 }}>
                  Pago seguro con Mercado Pago · Sin renovaciones<br />
                  <span style={{ color: GOLD_DIM }}>✦ Si tu tirada no llega en 15 minutos, te devolvemos el dinero.</span>
                </p>
              </div>
            </div>

            {/* Experiencia: el mensaje de WhatsApp + la lectura online */}
            <div className="tl-hero-visual" style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="tl-phones tl-in2">
                <Image
                  src="/img/tarot/whatsapp-mockup.jpg"
                  alt="Mensaje de WhatsApp con tu tirada: tus cinco cartas, botón para leer online y botón para descargar el PDF"
                  width={430} height={740} priority
                  className="tl-phone tl-phone-a"
                />
                <Image
                  src="/img/tarot/lectura-mockup.jpg"
                  alt="La lectura online en el celular: tu nombre, tus cinco cartas y el acceso a cada interpretación"
                  width={430} height={740} priority
                  className="tl-phone tl-phone-b"
                />
              </div>
            </div>

          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            TRUST BAR
        ══════════════════════════════════════════════════════════ */}
        <section data-tl-reveal style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto', padding: '0 24px 56px' }}>
          <div style={{
            padding: '18px 28px', borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.025)',
          }}>
            <div className="tl-trust-bar">
              {TRUST_BADGES.map(({ Icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.62)', fontSize: 13 }}>
                  <Icon size={14} style={{ color: GOLD_DIM, flexShrink: 0 }} />
                  {text}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            LA EXPERIENCIA — qué recibís (WhatsApp → lectura online → PDF)
        ══════════════════════════════════════════════════════════ */}
        <section data-tl-reveal style={{ position: 'relative', zIndex: 1, maxWidth: 1060, margin: '0 auto', padding: '0 24px 80px' }}>
          <div>
            <p style={EYEBROW}>La experiencia</p>
            <h2 style={H2}>
              Tu tirada llega,<br />y se lee como una experiencia.
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 52, lineHeight: 1.65, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
              No es un archivo suelto. Recibís tus cartas, las abrís en tu celular una por una y te quedás con un PDF para guardar.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 44, justifyContent: 'center', alignItems: 'flex-start' }}>
              {[
                { n: '1', t: 'Te llega a tu WhatsApp', d: 'Un mensaje con tu nombre y tus 5 cartas, y dos botones: leer online o descargar el PDF. Si dejás tu email, también te la enviamos ahí.', img: '/img/tarot/whatsapp-mockup.jpg', alt: 'Mensaje de WhatsApp con tu tirada, la lectura online y el PDF' },
                { n: '2', t: 'La leés online, hecha para el celular', d: 'Tocás cada carta y leés su significado para tu momento. Con ambientación sonora, un resumen, un mensaje personal y claves para avanzar. Disponible 30 días.', img: '/img/tarot/lectura-mockup.jpg', alt: 'La lectura online en el celular con tus cartas y su interpretación' },
              ].map(item => (
                <div key={item.n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: 270 }}>
                  <Image
                    src={item.img}
                    alt={item.alt}
                    width={250} height={430}
                    style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 16px 56px rgba(0,0,0,0.65)' }}
                  />
                  <p style={{ fontSize: 11, color: GOLD_DIM, letterSpacing: '0.09em', textTransform: 'uppercase', fontWeight: 700, margin: 0, textAlign: 'center' }}>{item.n} · {item.t}</p>
                  <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, textAlign: 'center', margin: 0 }}>{item.d}</p>
                </div>
              ))}

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: 290 }}>
                <PdfViewer width={250} />
                <p style={{ fontSize: 11, color: GOLD_DIM, letterSpacing: '0.09em', textTransform: 'uppercase', fontWeight: 700, margin: 0 }}>3 · Y un PDF para guardar</p>
                <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, textAlign: 'center', margin: 0 }}>
                  3 páginas con diseño cuidado: tu tirada, la interpretación y tu mensaje final. Es tuyo para siempre.
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 48 }}>
              <CtaLink />
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            CÓMO FUNCIONA
        ══════════════════════════════════════════════════════════ */}
        <section data-tl-reveal style={{ position: 'relative', zIndex: 1, maxWidth: 960, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 60 }}>
            <p style={EYEBROW}>¿Cómo funciona?</p>
            <h2 style={{ ...H2, marginBottom: 8 }}>
              Cuatro pasos. Menos de 15 minutos.
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.46)', textAlign: 'center', marginBottom: 48 }}>
              Vos contás tu momento; las cartas y la lectura las ponemos nosotros.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: 16 }}>
              {STEPS.map((step) => (
                <div key={step.n} className="tl-step" style={{
                  padding: '26px 20px 22px', borderRadius: 16, position: 'relative',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                }}>
                  <span style={{
                    position: 'absolute', top: 14, right: 16,
                    fontSize: 30, fontWeight: 900,
                    color: 'rgba(251,191,36,0.10)', lineHeight: 1,
                  }}>{step.n}</span>
                  <div style={{ fontSize: 28, marginBottom: 14 }}>{step.icon}</div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.88)', marginBottom: 7 }}>{step.title}</p>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)', lineHeight: 1.62 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            BENEFICIOS
        ══════════════════════════════════════════════════════════ */}
        <section data-tl-reveal style={{ position: 'relative', zIndex: 1, maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 60 }}>
            <p style={EYEBROW}>Lo que te llevás</p>
            <h2 style={{ ...H2, marginBottom: 12 }}>
              Una tirada hecha<br />alrededor de tu momento.
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.48)', textAlign: 'center', marginBottom: 44, lineHeight: 1.6 }}>
              Tus cartas se sortean para vos y se leen con tu nombre, tu fecha y lo que quieras explorar, con una pregunta puntual o sin ella.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {BENEFITS.map((b) => (
                <div key={b.heading} className="tl-card" style={{
                  display: 'flex', flexDirection: 'column', gap: 10,
                  padding: '22px 20px', borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                }}>
                  <span style={{ fontSize: 28 }}>{b.icon}</span>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.90)', marginBottom: 5 }}>{b.heading}</p>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.52)', lineHeight: 1.62 }}>{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            ¿QUÉ SE PUEDE EXPLORAR?
        ══════════════════════════════════════════════════════════ */}
        <section data-tl-reveal style={{ position: 'relative', zIndex: 1, maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 60 }}>
            <p style={EYEBROW}>¿Qué podés explorar?</p>
            <h2 style={{ ...H2, marginBottom: 8 }}>
              Elegís el tema. La pregunta es opcional.
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.46)', textAlign: 'center', marginBottom: 44, lineHeight: 1.65, maxWidth: 500, marginLeft: 'auto', marginRight: 'auto' }}>
              Podés traer una pregunta puntual o simplemente el tema que te ronda. Cuanto más contexto compartas, más enfocada es la lectura.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 12 }}>
              {QUESTION_TYPES.map(({ icon, label }) => (
                <div key={label} className="tl-q-card" style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '16px 18px', borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  cursor: 'default',
                }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.80)', lineHeight: 1.3 }}>{label}</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: 44 }}>
              <CtaLink />
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            PRECIO + CTA CENTRAL
        ══════════════════════════════════════════════════════════ */}
        <section data-tl-reveal style={{ position: 'relative', zIndex: 1, maxWidth: 620, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{
            borderRadius: 22, padding: '44px 40px',
            background: 'linear-gradient(135deg, rgba(251,191,36,0.09) 0%, rgba(120,70,240,0.05) 100%)',
            border: '1px solid rgba(251,191,36,0.22)',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
              Una consulta presencial con tarotista:{' '}
              <span style={{ textDecoration: 'line-through', color: 'rgba(255,255,255,0.32)' }}>$U 2.000+</span>
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 22 }}>
              Tu tirada, sin salir de tu casa, en menos de 15 minutos:
            </p>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: precioUYU !== null ? 58 : 26, fontWeight: 900, color: 'white', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {precioUYU !== null ? <>$U&nbsp;{precioUYU}</> : 'Ver precio en el checkout'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', marginBottom: 32 }}>
              Pago único · sin renovaciones
            </p>
            <CtaLink size="lg" />
            <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: '6px 18px', justifyContent: 'center' }}>
              {['Pago seguro', 'Sin suscripción', 'Te llega en menos de 15 min', 'Garantía de devolución'].map(t => (
                <span key={t} style={{ fontSize: 12, color: 'rgba(255,255,255,0.34)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: GOLD_DIM }}>✓</span> {t}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            FAQ
        ══════════════════════════════════════════════════════════ */}
        <section data-tl-reveal style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto', padding: '0 24px 72px' }}>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 60 }}>
            <p style={EYEBROW}>Preguntas frecuentes</p>
            <h2 style={{ ...H2, marginBottom: 36 }}>
              Antes de comprar.
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FAQ.map((item) => <FaqItem key={item.q} q={item.q} a={item.a} />)}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            TRANSPARENCIA
        ══════════════════════════════════════════════════════════ */}
        <section data-tl-reveal style={{ position: 'relative', zIndex: 1, maxWidth: 620, margin: '0 auto', padding: '0 24px 64px' }}>
          <div style={{
            padding: '18px 22px', borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(251,191,36,0.42)', marginBottom: 8 }}>
              Transparencia
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', lineHeight: 1.72, margin: 0 }}>
              Esta lectura es generada por inteligencia artificial aplicando simbología de tarot
              tradicional a tu consulta. No predice el futuro ni reemplaza consejo profesional en
              ninguna área. Su propósito es ofrecerte una perspectiva simbólica para reflexionar.
            </p>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            CTA FINAL
        ══════════════════════════════════════════════════════════ */}
        <section data-tl-reveal style={{
          position: 'relative', zIndex: 1, maxWidth: 520,
          margin: '0 auto', padding: '0 24px 96px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', marginBottom: 14 }}>
            Tus cartas te esperan.
          </p>
          <h2 style={{ fontSize: 'clamp(22px, 4.5vw, 34px)', fontWeight: 800, color: 'white', marginBottom: 28, lineHeight: 1.28, letterSpacing: '-0.025em' }}>
            Si tu tirada no llega en 15 minutos,{' '}
            <span style={{ color: GOLD }}>te devolvemos el dinero.</span>
          </h2>
          <CtaLink size="lg" />
          <p style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.27)' }}>
            {precioTexto} · un solo pago · sin renovaciones automáticas
          </p>
        </section>

        {/* ══════════════════════════════════════════════════════════
            STICKY MOBILE CTA
        ══════════════════════════════════════════════════════════ */}
        {showSticky && (
          <div
            className="tl-sticky"
            role="complementary"
            aria-label="Acción de compra fija"
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
              padding: '12px 18px env(safe-area-inset-bottom)',
              background: 'rgba(8,5,20,0.97)',
              backdropFilter: 'blur(16px)',
              borderTop: '1px solid rgba(251,191,36,0.15)',
              display: 'flex', gap: 14, alignItems: 'center',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.90)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Tu tirada de Tarot
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.42)' }}>
                {precioTexto} · un pago · &lt; 15 min
              </p>
            </div>
            <Link
              href={CHECKOUT as never}
              style={{
                flexShrink: 0, padding: '11px 22px', borderRadius: 12,
                background: `linear-gradient(135deg, #c49008 0%, ${GOLD} 55%, #f2cc44 100%)`,
                color: '#0c0618', fontWeight: 800, fontSize: 14, textDecoration: 'none',
                boxShadow: '0 2px 16px rgba(251,191,36,0.28)',
                whiteSpace: 'nowrap',
              }}
            >
              Quiero mi tirada →
            </Link>
          </div>
        )}

      </div>
    </>
  );
}
