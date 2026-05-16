'use client';

import Link from 'next/link';
import { Shield, Sparkles, CheckCircle2, MessageCircle } from 'lucide-react';
import WAPreview from '@/components/WAPreview';

export default function HomeContent() {
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
        header {
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }
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
        <div className="relative mx-auto max-w-5xl px-4 pt-10 md:pt-14 pb-6" style={{ zIndex: 1 }}>
          <div className="flex flex-col md:flex-row gap-8 md:gap-14 md:items-center">

            {/* Texto + CTA */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-block mb-5 px-3 py-1 rounded-full border border-violet-500/25 bg-violet-900/30 text-violet-300 text-xs tracking-widest uppercase">
                Mensajes diarios personalizados
              </div>

              <h1 className="text-3xl md:text-[2.9rem] font-extrabold text-white leading-tight mb-4">
                Cada mañana,{' '}
                <span className="bg-gradient-to-r from-violet-300 to-violet-500 bg-clip-text text-transparent">
                  una guía hecha para vos.
                </span>
              </h1>

              <p className="text-white/70 text-base md:text-lg max-w-lg mx-auto md:mx-0 mb-6 leading-relaxed">
                Recibí tu horóscopo, tu foco del día, tu número de la suerte y tu color — personalizados por signo, directo a WhatsApp. Sin apps.
              </p>

              <div className="flex flex-wrap justify-center md:justify-start gap-3 text-sm mb-8">
                <span className="bg-violet-950/80 border border-violet-600/30 rounded-full px-4 py-1.5 font-bold text-white">
                  $U 390<span className="text-white/55 font-normal">/mes</span>
                </span>
                <span className="text-white/30">·</span>
                <span className="text-white/65">Sin apps</span>
                <span className="text-white/30">·</span>
                <span className="text-white/65">Sin spam</span>
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

              <p className="mt-3 text-center md:text-left text-[12px] text-white/40">
                Pago seguro vía Mercado Pago · Cancelás online cuando quieras
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
            <div className="hidden md:block w-[340px] shrink-0">
              <WAPreview />
            </div>

          </div>
        </div>

        {/* WAPreview mobile — debajo del hero, full width */}
        <div className="relative md:hidden px-4 pb-6" style={{ zIndex: 1 }}>
          <WAPreview />
        </div>

        {/* ── Cómo funciona ─────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-4xl px-4 pb-12 md:pb-16" style={{ zIndex: 1 }}>
          <div className="border-t border-white/8 pt-10">
            <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest text-center mb-8">
              ¿Cómo funciona?
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  n: '1',
                  title: 'Completás tus datos',
                  desc: 'Nombre, signo zodiacal, qué querés trabajar y tu WhatsApp. Un minuto.',
                },
                {
                  n: '2',
                  title: 'Confirmás tu WhatsApp',
                  desc: 'Te enviamos un mensaje. Lo respondés una vez para activar tu cuenta.',
                },
                {
                  n: '3',
                  title: 'Recibís tu guía cada mañana',
                  desc: 'Tu mensaje personalizado, directo a WhatsApp. Sin apps. Sin spam.',
                },
              ].map(step => (
                <div key={step.n} className="flex md:flex-col gap-4 md:gap-3 md:items-center md:text-center">
                  <div className="text-3xl md:text-4xl font-extrabold text-violet-500/70 leading-none shrink-0">
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

        {/* ── CTA final ─────────────────────────────────────────────── */}
        <div className="relative mx-auto max-w-md px-4 pb-16 text-center" style={{ zIndex: 1 }}>
          <div className="rounded-2xl border border-white/8 p-8" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-white/60 text-sm mb-2">Empezá hoy. Tu primer mensaje llega en minutos.</p>
            <div className="mb-6">
              <span className="text-3xl font-extrabold text-white">$U 390</span>
              <span className="text-white/55 text-sm ml-1">/mes</span>
            </div>
            <Link
              href="/checkout"
              className="inline-block w-full rounded-xl bg-gradient-to-r from-violet-700 to-violet-500 py-4 text-base font-bold text-white transition-all hover:from-violet-600 hover:to-violet-400 active:scale-[0.98]"
              style={{ boxShadow: '0 4px 24px rgba(109,40,217,0.35)' }}
            >
              Activar mi guía diaria →
            </Link>
            <p className="mt-3 text-[12px] text-white/40">Pago seguro · Cancelás cuando quieras</p>
          </div>
        </div>

      </div>
    </>
  );
}
