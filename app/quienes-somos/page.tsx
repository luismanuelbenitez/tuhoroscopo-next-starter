import Link from 'next/link';
import StaticPageLayout from '@/components/StaticPageLayout';

export default function QuienesSomos() {
  return (
    <StaticPageLayout>

      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-3">
          El proyecto
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
          ¿Quiénes somos?
        </h1>
        <p className="text-white/70 text-base md:text-lg leading-relaxed max-w-xl">
          Tu Oráculo es una experiencia diaria de astrología práctica y lecturas de tarot, enviadas directo a tu WhatsApp.
        </p>
      </div>

      {/* Qué es */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-4"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <h2 className="text-base font-semibold text-violet-400 mb-3">¿Qué es?</h2>
        <p className="text-white/80 text-sm leading-relaxed mb-3">
          Es un servicio de mensajería personalizada que te acompaña al inicio del día. Combinamos astrología suave, claridad emocional y bienestar práctico para darte un punto de apoyo antes de arrancar.
        </p>
        <p className="text-white/80 text-sm leading-relaxed">
          No prometemos predicciones absolutas ni resultados mágicos. Lo que sí hacemos es darte un mensaje breve, concreto y pensado para vos — basado en tu signo, tu nombre y el área en la que querés enfocarte.
        </p>
      </div>

      {/* Qué recibís */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-4"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <h2 className="text-base font-semibold text-violet-400 mb-4">¿Qué recibís cada mañana?</h2>
        <div className="space-y-3">
          {[
            { emoji: '🌐', label: 'Horóscopo del día', desc: 'Personalizado para tu signo. Una lectura breve sobre la energía del día y cómo usarla a tu favor.' },
            { emoji: '💙', label: 'Foco del día', desc: 'Un consejo práctico según lo que elegiste trabajar: amor, trabajo, bienestar o un enfoque general.' },
            { emoji: '🔢', label: 'Número de la suerte', desc: 'Un número con una idea concreta para aplicar durante el día.' },
            { emoji: '🎨', label: 'Color del día', desc: 'Una referencia breve sobre qué puede aportar ese color a tu jornada.' },
            { emoji: '🧘', label: 'Pausa', desc: 'Un momento de respiración para empezar con calma antes de abrir el resto del teléfono.' },
          ].map(item => (
            <div key={item.label} className="flex gap-3 items-start">
              <span className="text-base leading-none mt-0.5 shrink-0">{item.emoji}</span>
              <div>
                <span className="text-white/90 text-sm font-semibold">{item.label}</span>
                <span className="text-white/60 text-sm"> — {item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Por qué WhatsApp */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-4"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <h2 className="text-base font-semibold text-violet-400 mb-3">¿Por qué WhatsApp?</h2>
        <p className="text-white/80 text-sm leading-relaxed">
          Porque ya lo usás. Sin instalar apps nuevas, sin contraseñas adicionales, sin notificaciones que se pierden. El mensaje llega donde ya estás, cuando empieza tu día.
        </p>
      </div>

      {/* Tono */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-10"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <h2 className="text-base font-semibold text-violet-400 mb-3">Nuestro enfoque</h2>
        <p className="text-white/80 text-sm leading-relaxed">
          Creemos en una astrología accesible y útil, sin misticismo exagerado ni promesas vacías. El objetivo es simple: que empieces el día con un poco más de claridad y un poco menos de ruido.
        </p>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/checkout"
          className="inline-block rounded-xl bg-gradient-to-r from-violet-700 to-violet-500 px-8 py-3.5 text-sm font-bold text-white transition-all hover:from-violet-600 hover:to-violet-400"
          style={{ boxShadow: '0 4px 20px rgba(109,40,217,0.30)' }}
        >
          Activar mi guía diaria →
        </Link>
        <p className="mt-2 text-[12px] text-white/40">$U 390/mes · IVA incluido · Cancelás cuando quieras</p>
      </div>

    </StaticPageLayout>
  );
}
