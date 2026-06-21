'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shield, Sparkles, CheckCircle2, MessageCircle } from 'lucide-react';
import Testimonios from '@/components/Testimonios';
import StickyCTA from '@/components/StickyCTA';

export default function HomeContent() {
  const [showSticky, setShowSticky] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowSticky(window.scrollY > 480);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      {/*
       * body: suprime fondo cósmico (estrellas, nebulosas) para estética premium
       * coherente con /checkout. header: colapsa el <Header /> vacío para evitar
       * franja oscura en blanco encima del contenido.
       */}
      <style jsx global>{`
        body {
          background-image: none !important;
          background-color: #0e0b22 !important;
        }
        body::before {
          display: none !important;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hero-in   { animation: fadeUp 0.6s ease both; }
        .hero-in-2 { animation: fadeUp 0.6s 0.2s ease both; }
      `}</style>

      <div
        className="min-h-screen text-white relative z-[1]"
        style={{ background: 'linear-gradient(180deg, #110927 0%, #0d0820 55%, #0e0b22 100%)' }}
      >
        {/* Glow sutil */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(88,28,180,0.13), transparent)', zIndex: 0 }}
        />

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-5xl px-4 pt-6 md:pt-10 pb-6" style={{ zIndex: 1 }}>
          <div className="flex flex-col md:flex-row gap-8 md:gap-14 md:items-center">

            {/* Texto + CTA */}
            <div className="hero-in flex-1 text-center md:text-left">
              <div className="inline-block mb-5 px-3 py-1 rounded-full border border-violet-500/25 bg-violet-900/30 text-violet-300 text-xs tracking-widest uppercase">
                Mensajes diarios personalizados
              </div>

              <h1 className="text-3xl md:text-[2.9rem] font-extrabold text-white leading-tight mb-4">
                Cada mañana,{' '}
                <span className="bg-gradient-to-r from-violet-300 to-violet-500 bg-clip-text text-transparent">
                  una guía hecha para vos.
                </span>
              </h1>

              <p className="text-white/70 text-base md:text-lg max-w-lg mx-auto md:mx-0 mb-4 leading-relaxed">
                Horóscopo, foco del día, número y color de la suerte, y una pausa cósmica — personalizados para tu signo, directo a WhatsApp. Todos los días.
              </p>

              {/* Garantía */}
              <p className="flex items-center justify-center md:justify-start mb-6 text-[12px]" style={{ color: 'rgba(251,191,36,0.42)' }}>
                ✦ Cancelás cuando quieras. Sin trámites, sin llamadas.
              </p>

              <div className="flex flex-wrap justify-center md:justify-start gap-3 text-sm mb-8">
                <span className="bg-violet-950/80 border border-violet-600/30 rounded-full px-4 py-1.5 font-bold text-white">
                  $U 390<span className="text-white/55 font-normal">/mes · IVA incluido</span>
                </span>
                <span className="text-white/30">·</span>
                <span className="text-white/65">Sin apps</span>
                <span className="text-white/30">·</span>
                <span className="text-white/65">7 días a la semana</span>
                <span className="text-white/30">·</span>
                <span className="text-white/65">Cancelás cuando quieras</span>
              </div>

              <Link
                href="/checkout"
                className="inline-block w-full md:w-auto rounded-xl bg-gradient-to-r from-violet-700 to-violet-500 px-10 py-4 text-base font-bold text-white transition-all hover:from-violet-600 hover:to-violet-400 active:scale-[0.98]"
                style={{ boxShadow: '0 4px 24px rgba(109,40,217,0.35)' }}
              >
                Activar mi guía diaria →
              </Link>

              <p className="mt-3 text-center md:text-left text-[12px]" style={{ color: 'rgba(251,191,36,0.38)' }}>
                ✦ Cancelás cuando quieras. Sin trámites, sin llamadas.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-2 max-w-xs mx-auto md:mx-0">
                {[
                  { icon: <Shield size={13} />, text: 'Datos protegidos' },
                  { icon: <Sparkles size={13} />, text: 'Primer mensaje hoy' },
                  { icon: <CheckCircle2 size={13} />, text: 'Cancelás online' },
                  { icon: <MessageCircle size={13} />, text: 'Solo WhatsApp' },
                ].map(item => (
                  <div key={item.text} className="flex items-center gap-2 text-[12px] text-white/50">
                    <span className="text-violet-400 shrink-0">{item.icon}</span>
                    {item.text}
                  </div>
                ))}
              </div>
            </div>

            {/* WAPreview — oculto en mobile (se muestra abajo), visible en desktop */}
            <div className="hero-in-2 hidden md:block w-[340px] shrink-0">
              <img
                src="/img/horoscopo/phone-preview-thc.png"
                alt="Ejemplo de mensaje en WhatsApp"
                className="w-full h-auto"
              />
            </div>

          </div>
        </div>

        {/* WAPreview mobile — debajo del hero, full width */}
        <div className="relative md:hidden px-4 pb-6" style={{ zIndex: 1 }}>
          <img
                src="/img/horoscopo/phone-preview-thc.png"
                alt="Ejemplo de mensaje en WhatsApp"
                className="w-full h-auto"
              />
        </div>

        {/* ── Cómo funciona ─────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-4xl px-4 pb-12 md:pb-16" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest text-center mb-8">
              ¿Cómo funciona?
            </p>
            <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-0">
              {[
                {
                  n: '1',
                  title: 'Contanos sobre vos',
                  desc: 'Tu nombre, tu signo y en qué querés enfocarte. Solo toma un minuto.',
                },
                {
                  n: '2',
                  title: 'Activás en un clic',
                  desc: 'Te mandamos un primer mensaje. Lo respondés una vez y tu cuenta queda activa.',
                },
                {
                  n: '3',
                  title: 'Tu guía llega cada mañana',
                  desc: 'Personalizada para tu signo. A las 8:30 de la mañana, todos los días. Los domingos: balance semanal y ritual especial.',
                },
              ].flatMap((step, i, arr) => {
                const el = (
                  <div key={step.n} className="flex md:flex-col gap-4 md:gap-3 md:items-center md:text-center flex-1">
                    <div className="text-3xl md:text-4xl font-extrabold text-violet-500/70 leading-none shrink-0">
                      {step.n}
                    </div>
                    <div>
                      <p className="text-white/90 font-semibold text-sm md:text-base">{step.title}</p>
                      <p className="text-white/50 text-xs md:text-sm mt-1 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                );
                if (i < arr.length - 1) {
                  return [el, (
                    <div key={`arrow-${i}`} className="hidden md:flex items-start justify-center pt-4 px-2 text-violet-500/30 text-2xl font-thin shrink-0">›</div>
                  )];
                }
                return [el];
              })}
            </div>
          </div>
        </div>

        {/* ── Testimonios ───────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-4xl px-4 pb-14 md:pb-20" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <Testimonios />
          </div>
        </div>

        {/* ── CTA final ─────────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-md px-4 pb-16 text-center" style={{ zIndex: 1 }}>
          <div className="rounded-2xl border border-white/8 p-8" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-white/60 text-sm mb-2">Empezá hoy. Tu primer mensaje llega en minutos.</p>
            <div className="mb-6">
              <span className="text-3xl font-extrabold text-white">$U 390</span>
              <span className="text-white/55 text-sm ml-1">/mes · IVA incluido</span>
            </div>
            <Link
              href="/checkout"
              className="inline-block w-full rounded-xl bg-gradient-to-r from-violet-700 to-violet-500 py-4 text-base font-bold text-white transition-all hover:from-violet-600 hover:to-violet-400 active:scale-[0.98]"
              style={{ boxShadow: '0 4px 24px rgba(109,40,217,0.35)' }}
            >
              Activar mi guía diaria →
            </Link>
            <p className="mt-3 text-[12px]" style={{ color: 'rgba(251,191,36,0.38)' }}>✦ Cancelás cuando quieras. Sin trámites, sin llamadas.</p>
          </div>
        </div>

      </div>

      {showSticky && <StickyCTA />}
    </>
  );
}
