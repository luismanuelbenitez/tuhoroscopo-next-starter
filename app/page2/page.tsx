'use client';

import Link from 'next/link';
import { Shield, Sparkles, CheckCircle2, MessageCircle } from 'lucide-react';
import WAPreview from '@/components/WAPreview';

const CONTENIDO_MENSAJE = [
  { emoji: '🌐', title: 'Horóscopo', desc: 'Tu energía del día según tu signo zodiacal.' },
  { emoji: '💙', title: 'En foco', desc: 'Una guía breve adaptada a tu preferencia de contenido.' },
  { emoji: '🔢', title: 'Número', desc: 'Tu número del día con una intención concreta.' },
  { emoji: '🎨', title: 'Color', desc: 'Tu color y lo que conecta en este momento.' },
  { emoji: '🧘', title: 'Pausa', desc: 'Un momento breve de reflexión o respiración.' },
];

const PASOS = [
  { n: '01', title: 'Completás tus datos', desc: 'Nombre, signo zodiacal, qué querés trabajar y tu WhatsApp. Un minuto.' },
  { n: '02', title: 'Confirmás tu WhatsApp', desc: 'Te enviamos un mensaje. Lo respondés una vez para activar tu cuenta.' },
  { n: '03', title: 'Recibís tu guía cada mañana', desc: 'Tu mensaje personalizado, directo a WhatsApp. Sin apps. Sin spam.' },
];

export default function Page2() {
  return (
    <>
      <style jsx global>{`
        body { background-image: none !important; background-color: #080616 !important; }
        body::before { display: none !important; }
        header { padding-top: 0 !important; padding-bottom: 0 !important; }
      `}</style>

      <div
        className="min-h-screen text-white relative overflow-x-hidden"
        style={{ background: 'linear-gradient(180deg, #0c0720 0%, #0d0a20 50%, #090717 100%)' }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[480px]" style={{ background: 'radial-gradient(ellipse 90% 55% at 50% -8%, rgba(109,40,217,0.22), transparent)', zIndex: 0 }} />

        {/* HERO */}
        <section className="relative mx-auto max-w-5xl px-5 pt-12 md:pt-20 pb-10" style={{ zIndex: 1 }}>
          <div className="flex flex-col md:flex-row gap-12 md:gap-16 md:items-center">
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-violet-500/20 bg-violet-900/20 text-violet-300 text-[11px] tracking-widest uppercase">
                <Sparkles size={11} /> Mensajes diarios personalizados
              </div>

              <h1 className="text-4xl md:text-[3.1rem] font-extrabold text-white leading-[1.1] tracking-tight mb-5">
                Cada mañana,{' '}
                <span style={{ backgroundImage: 'linear-gradient(100deg, #c4b5fd 0%, #a78bfa 50%, #8b5cf6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  una guía hecha para vos.
                </span>
              </h1>

              <p className="text-white/60 text-base md:text-[1.05rem] max-w-[26rem] mx-auto md:mx-0 mb-8 leading-relaxed">
                Recibí tu horóscopo, tu foco del día, tu número de la suerte y tu color — personalizados por signo, directo a WhatsApp. Sin apps.
              </p>

              <div className="flex flex-wrap justify-center md:justify-start items-center gap-3 mb-7">
                <span className="font-bold text-white px-4 py-1.5 rounded-full border border-violet-500/25 text-sm" style={{ background: 'rgba(109,40,217,0.18)' }}>
                  $U 390<span className="text-white/45 font-normal">/mes</span>
                </span>
                {['Sin apps', 'Sin spam', 'Cancelás cuando quieras'].map(t => (
                  <span key={t} className="text-white/45 text-xs">{t}</span>
                ))}
              </div>

              <Link
                href="/checkout"
                className="inline-flex items-center justify-center w-full md:w-auto rounded-2xl px-10 py-4 text-base font-bold text-white transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #5b21b6 0%, #7c3aed 60%, #8b5cf6 100%)', boxShadow: '0 0 0 1px rgba(139,92,246,0.25), 0 8px 32px rgba(109,40,217,0.45)' }}
              >
                Activar mi guía diaria →
              </Link>
              <p className="mt-3 text-[11px] text-white/30 text-center md:text-left">
                Pago seguro vía Mercado Pago · Cancelás online cuando quieras
              </p>

              <div className="mt-6 flex flex-wrap justify-center md:justify-start gap-2">
                {[
                  { icon: <Shield size={12} />, text: 'Datos protegidos' },
                  { icon: <Sparkles size={12} />, text: 'Primer mensaje hoy' },
                  { icon: <CheckCircle2 size={12} />, text: 'Cancelás online' },
                  { icon: <MessageCircle size={12} />, text: 'Solo WhatsApp' },
                ].map(item => (
                  <span key={item.text} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] text-white/45 border border-white/[0.07]" style={{ background: 'rgba(255,255,255,0.025)' }}>
                    <span className="text-violet-400 shrink-0">{item.icon}</span>
                    {item.text}
                  </span>
                ))}
              </div>
            </div>

            {/* WAPreview desktop */}
            <div className="hidden md:flex flex-col w-[330px] shrink-0 gap-2">
              <p className="text-[10px] text-white/30 uppercase tracking-widest text-center">Así llega tu mensaje</p>
              <WAPreview />
            </div>
          </div>
        </section>

        {/* WAPreview mobile */}
        <section className="relative md:hidden px-5 pb-10" style={{ zIndex: 1 }}>
          <p className="text-[10px] text-white/30 uppercase tracking-widest text-center mb-3">Así llega tu mensaje</p>
          <WAPreview />
        </section>

        {/* LO QUE RECIBÍS */}
        <section className="relative mx-auto max-w-4xl px-5 pb-16 md:pb-20" style={{ zIndex: 1 }}>
          <div className="border-t border-white/5 pt-12">
            <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest text-center mb-2">Contenido de cada mensaje</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-10">Lo que recibís cada mañana</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {CONTENIDO_MENSAJE.map((item, i) => (
                <div
                  key={item.title}
                  className={`rounded-2xl p-5 border border-white/5 flex flex-col gap-2${i === 4 ? ' sm:col-span-2 lg:col-span-1' : ''}`}
                  style={{ background: 'rgba(255,255,255,0.025)' }}
                >
                  <span className="text-2xl leading-none">{item.emoji}</span>
                  <p className="text-white/90 font-semibold text-sm mt-1">{item.title}</p>
                  <p className="text-white/40 text-xs leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <section className="relative mx-auto max-w-4xl px-5 pb-16 md:pb-20" style={{ zIndex: 1 }}>
          <div className="border-t border-white/5 pt-12">
            <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest text-center mb-2">¿Cómo funciona?</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-10">Empezás en tres pasos</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PASOS.map(step => (
                <div key={step.n} className="rounded-2xl p-6 border border-white/5 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.025)' }}>
                  <p className="text-5xl font-black leading-none" style={{ backgroundImage: 'linear-gradient(135deg, rgba(167,139,250,0.6) 0%, rgba(109,40,217,0.2) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    {step.n}
                  </p>
                  <p className="text-white/90 font-semibold text-base">{step.title}</p>
                  <p className="text-white/45 text-sm leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="relative mx-auto max-w-sm px-5 pb-20 text-center" style={{ zIndex: 1 }}>
          <div className="rounded-3xl border border-violet-500/[0.12] p-8" style={{ background: 'linear-gradient(160deg, rgba(109,40,217,0.1) 0%, rgba(255,255,255,0.015) 100%)', boxShadow: '0 0 0 1px rgba(139,92,246,0.07), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
            <p className="text-white/45 text-sm mb-5">Empezá hoy. Tu primer mensaje llega en minutos.</p>
            <div className="mb-6">
              <span className="text-4xl font-extrabold text-white">$U 390</span>
              <span className="text-white/35 text-sm ml-1">/mes</span>
            </div>
            <Link
              href="/checkout"
              className="inline-flex items-center justify-center w-full rounded-2xl py-4 text-base font-bold text-white transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #5b21b6 0%, #7c3aed 60%, #8b5cf6 100%)', boxShadow: '0 0 0 1px rgba(139,92,246,0.25), 0 8px 32px rgba(109,40,217,0.45)' }}
            >
              Activar mi guía diaria →
            </Link>
            <p className="mt-4 text-[11px] text-white/25">Pago seguro · Cancelás cuando quieras</p>
          </div>
        </section>

      </div>
    </>
  );
}
