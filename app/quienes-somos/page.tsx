import Link from 'next/link';
import { PaginaInstitucional, EncabezadoInstitucional, PanelInstitucional } from '@/components/marca/PaginaInstitucional';
import { GOLD, CTA_GRADIENT } from '@/components/home/theme';

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <PanelInstitucional titulo={titulo}>{children}</PanelInstitucional>;
}

export default function QuienesSomos() {
  return (
    <PaginaInstitucional>

      <EncabezadoInstitucional eyebrow="La empresa" titulo="¿Quiénes somos?">
        <p className="max-w-xl mx-auto">
          Tu Oráculo es una empresa uruguaya que crea experiencias de autoconocimiento
          personalizadas, entregadas directo a tu WhatsApp. Hoy tenemos un producto disponible:{' '}
          <span className="text-white/90 font-semibold">Tarot</span>, lecturas personalizadas con
          inteligencia artificial.
        </p>
      </EncabezadoInstitucional>

      <div className="space-y-4">
      <Seccion titulo="Qué es Tu Oráculo">
        <p className="leading-relaxed mb-3">
          Somos una empresa uruguaya, operada por Luis Manuel Benítez Rodríguez (monotributista,
          RUT 214998320016), enfocada en construir experiencias digitales de autoconocimiento
          — tarot, y con el tiempo, otras miradas simbólicas — pensadas para el celular y
          entregadas donde ya estás: tu WhatsApp.
        </p>
        <p className="leading-relaxed">
          Por ahora nuestro único producto en producción es <strong className="text-white/95">Tarot</strong>.
          Estamos construyendo más experiencias para sumar a futuro — cuando eso pase, las vas a
          encontrar todas acá.
        </p>
      </Seccion>

      <Seccion titulo="Tarot — nuestro primer producto">
        <p className="leading-relaxed mb-3">
          Una lectura de tarot personalizada: se sortean 5 cartas para tu consulta y se
          interpretan en relación con tu nombre, tu fecha de nacimiento y lo que quieras
          explorar — con una pregunta puntual o sin ella. Es un pago único, sin suscripción.
        </p>
        <p className="leading-relaxed">
          En menos de 15 minutos te llega por WhatsApp (y por email, si lo pedís): una imagen con
          tu tirada, una lectura online pensada para el celular y un PDF para guardar. La
          interpretación la genera inteligencia artificial aplicando simbología del tarot
          tradicional — es una perspectiva simbólica para reflexionar, no una predicción.
        </p>
      </Seccion>

      <Seccion titulo="Por qué WhatsApp">
        <p className="leading-relaxed">
          Porque ya lo usás. Sin instalar apps nuevas, sin contraseñas, sin notificaciones que se
          pierden. Tu tirada llega donde ya estás, en el momento en que la necesitás — no cuando
          consigas un turno.
        </p>
      </Seccion>

      <Seccion titulo="Nuestro enfoque">
        <p className="leading-relaxed">
          Creemos en una experiencia honesta: sin misticismo exagerado ni promesas de futuro. Tu
          Tirada te ofrece otra perspectiva sobre tu momento — clara, privada, y a la altura de un
          producto que cuidamos como si fuera nuestro. Cada ajuste que hacemos (los textos, las
          imágenes, la lectura online) tiene ese mismo objetivo: que la experiencia se sienta tan
          cuidada como el consejo de alguien de confianza.
        </p>
      </Seccion>

      </div>

      {/* CTA */}
      <div className="text-center mt-10">
        <Link
          href="/tarot"
          className="inline-block rounded-xl px-8 py-4 text-[16px] font-bold transition-all hover:brightness-105"
          style={{ background: CTA_GRADIENT, color: '#180e00', boxShadow: '0 6px 24px rgba(240,197,90,0.32)' }}
        >
          Quiero mi tirada →
        </Link>
        <p className="mt-2 text-[12.5px] text-white/50">Pago único · sin suscripción · te llega en menos de 15 min</p>
      </div>

    </PaginaInstitucional>
  );
}
