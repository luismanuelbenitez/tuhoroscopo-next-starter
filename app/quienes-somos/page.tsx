import Link from 'next/link';
import StaticPageLayout from '@/components/StaticPageLayout';

const GOLD = '#F0C55A';

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-white/8 p-6 mb-4"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      <h2 className="text-base font-semibold mb-3" style={{ color: GOLD }}>{titulo}</h2>
      {children}
    </div>
  );
}

export default function QuienesSomos() {
  return (
    <StaticPageLayout>

      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
          La empresa
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
          ¿Quiénes somos?
        </h1>
        <p className="text-white/70 text-base md:text-lg leading-relaxed max-w-xl">
          Tu Oráculo es una empresa uruguaya que crea experiencias de autoconocimiento
          personalizadas, entregadas directo a tu WhatsApp. Hoy tenemos un producto disponible:{' '}
          <span className="text-white/90 font-semibold">Tu Tirada</span>, lecturas de tarot con
          inteligencia artificial.
        </p>
      </div>

      <Seccion titulo="Qué es Tu Oráculo">
        <p className="text-white/80 text-sm leading-relaxed mb-3">
          Somos una empresa uruguaya, operada por Luis Manuel Benítez Rodríguez (monotributista,
          RUT 214998320016), enfocada en construir experiencias digitales de autoconocimiento
          — tarot, y con el tiempo, otras miradas simbólicas — pensadas para el celular y
          entregadas donde ya estás: tu WhatsApp.
        </p>
        <p className="text-white/80 text-sm leading-relaxed">
          Por ahora nuestro único producto en producción es <strong className="text-white/95">Tu Tirada</strong>.
          Estamos construyendo más experiencias para sumar a futuro — cuando eso pase, las vas a
          encontrar todas acá.
        </p>
      </Seccion>

      <Seccion titulo="Tu Tirada — nuestro primer producto">
        <p className="text-white/80 text-sm leading-relaxed mb-3">
          Una lectura de tarot personalizada: se sortean 5 cartas para tu consulta y se
          interpretan en relación con tu nombre, tu fecha de nacimiento y lo que quieras
          explorar — con una pregunta puntual o sin ella. Es un pago único, sin suscripción.
        </p>
        <p className="text-white/80 text-sm leading-relaxed">
          En menos de 15 minutos te llega por WhatsApp (y por email, si lo pedís): una imagen con
          tu tirada, una lectura online pensada para el celular y un PDF para guardar. La
          interpretación la genera inteligencia artificial aplicando simbología del tarot
          tradicional — es una perspectiva simbólica para reflexionar, no una predicción.
        </p>
      </Seccion>

      <Seccion titulo="Por qué WhatsApp">
        <p className="text-white/80 text-sm leading-relaxed">
          Porque ya lo usás. Sin instalar apps nuevas, sin contraseñas, sin notificaciones que se
          pierden. Tu tirada llega donde ya estás, en el momento en que la necesitás — no cuando
          consigas un turno.
        </p>
      </Seccion>

      <Seccion titulo="Nuestro enfoque">
        <p className="text-white/80 text-sm leading-relaxed">
          Creemos en una experiencia honesta: sin misticismo exagerado ni promesas de futuro. Tu
          Tirada te ofrece otra perspectiva sobre tu momento — clara, privada, y a la altura de un
          producto que cuidamos como si fuera nuestro. Cada ajuste que hacemos (los textos, las
          imágenes, la lectura online) tiene ese mismo objetivo: que la experiencia se sienta tan
          cuidada como el consejo de alguien de confianza.
        </p>
      </Seccion>

      {/* CTA */}
      <div className="text-center mt-8">
        <Link
          href="/tarot"
          className="inline-block rounded-xl px-8 py-3.5 text-sm font-bold"
          style={{
            background: `linear-gradient(135deg, #c49008 0%, ${GOLD} 55%, #f2cc44 100%)`,
            color: '#180e00',
            boxShadow: '0 4px 20px rgba(240,197,90,0.30)',
          }}
        >
          Quiero mi tirada →
        </Link>
        <p className="mt-2 text-[12px] text-white/40">Pago único · sin suscripción · te llega en menos de 15 min</p>
      </div>

    </StaticPageLayout>
  );
}
