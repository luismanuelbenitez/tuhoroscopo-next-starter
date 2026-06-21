'use client';

import { User, MessageCircle, Zap, ShieldCheck } from 'lucide-react';

const DIFERENCIADORES = [
  {
    Icon: User,
    title: 'Personalizado para vos',
    desc: 'No es genérico. Cada mensaje está construido para tu signo específico y tu foco del día.',
  },
  {
    Icon: MessageCircle,
    title: 'Directo a WhatsApp',
    desc: 'Sin apps, sin descargas. Tu guía llega a las 8:30 de la mañana, directo donde ya estás.',
  },
  {
    Icon: Zap,
    title: '7 días a la semana',
    desc: 'De lunes a sábado tu guía diaria. Los domingos: balance semanal, intención y ritual especial.',
  },
  {
    Icon: ShieldCheck,
    title: 'Sin compromisos',
    desc: 'Cancelás cuando quieras desde el propio WhatsApp. Sin períodos mínimos, sin llamadas.',
  },
];

export default function Testimonios() {
  return (
    <div className="space-y-10">

      {/* Diferenciadores */}
      <div>
        <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest text-center mb-8">
          ¿Por qué Tu Oráculo?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DIFERENCIADORES.map(({ Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/8 p-5 flex gap-4"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <div className="shrink-0 mt-0.5">
                <Icon size={18} style={{ color: 'rgba(167,139,250,0.70)' }} />
              </div>
              <div>
                <p className="text-white/90 font-semibold text-sm mb-1">{title}</p>
                <p className="text-white/50 text-xs leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compartí tu experiencia */}
      <div
        className="rounded-2xl border border-violet-500/15 p-6 text-center"
        style={{ background: 'rgba(88,28,180,0.06)' }}
      >
        <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-3">
          ¿Ya probaste Tu Oráculo?
        </p>
        <p className="text-white/65 text-sm leading-relaxed mb-5 max-w-sm mx-auto">
          Contanos tu experiencia. Cada opinión nos ayuda a mejorar y a llegar a más personas.
        </p>
        <a
          href="mailto:hola@tuoraculo.uy?subject=Mi experiencia con Tu Oráculo"
          className="inline-block rounded-xl px-6 py-3 text-sm font-semibold transition-all active:scale-[0.98]"
          style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.30)', color: 'rgba(167,139,250,0.90)' }}
        >
          Compartir mi experiencia →
        </a>
      </div>

    </div>
  );
}
