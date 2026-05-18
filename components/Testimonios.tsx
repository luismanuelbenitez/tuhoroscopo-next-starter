'use client';

const testimonios = [
  {
    cita: "El mensaje de cada mañana me ayuda a arrancar el día con foco. Desde que lo recibo soy más consciente de cómo uso mi energía.",
    autor: "Lucía M.",
    contexto: "Aries",
  },
  {
    cita: "Dudé mucho al principio, pero el primer mensaje me convenció. Los consejos de bienestar son muy acertados para mi signo.",
    autor: "Valentina S.",
    contexto: "Capricornio",
  },
  {
    cita: "Perfecto para leer en el desayuno. Corto, claro y siempre dice algo que siento que necesitaba escuchar ese día.",
    autor: "Sofía L.",
    contexto: "Libra",
  },
];

export default function Testimonios() {
  return (
    <div>
      <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest text-center mb-8">
        Lo que dicen nuestras suscriptoras
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {testimonios.map((t, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/8 p-5 overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <div className="flex gap-0.5 mb-3">
              {[...Array(5)].map((_, s) => (
                <span key={s} style={{ color: 'rgba(251,191,36,0.85)', fontSize: '13px' }}>★</span>
              ))}
            </div>
            <blockquote className="text-white/70 text-sm leading-relaxed mb-4 italic">
              &ldquo;{t.cita}&rdquo;
            </blockquote>
            <footer className="text-xs">
              <span className="font-semibold text-white/70">{t.autor}</span>
              <span className="text-white/40 ml-1">· {t.contexto}</span>
            </footer>
          </div>
        ))}
      </div>
    </div>
  );
}
