import Link from 'next/link';
import { MessageCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { PaginaInstitucional, EncabezadoInstitucional, PanelInstitucional, PANEL_INSTITUCIONAL } from '@/components/marca/PaginaInstitucional';
import { fluido } from '@/lib/imagen';
import { GOLD, CTA_GRADIENT } from '@/components/home/theme';
import { metadataPagina } from '@/lib/seo/metadataPagina';

// Metadata propia (Paquete SEO 1, 2026-10-21): título, descripción, canonical y OG.
export const metadata = metadataPagina(
  '/quienes-somos',
  'Quiénes somos: empresa uruguaya de bienestar espiritual | Tu Oráculo',
  'Tu Oráculo es una empresa uruguaya que crea experiencias digitales de bienestar espiritual. Conocé quién está detrás, cómo trabajamos y cómo usamos la IA.',
);

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

      {/* Imagen de marca y textos más cortos (auditoría UX 2026-10-30, Q3):
          antes eran 4 paneles de texto corrido. Foto con la lectura demo. */}
      <div className="relative overflow-hidden rounded-2xl mb-6 aspect-[16/10]" style={{ border: '1px solid rgba(240,197,90,0.28)', boxShadow: '0 12px 36px rgba(0,0,0,0.40)' }}>
        <img
          {...fluido('/img/home2/momento-lectura.webp', 1122, 1402, '(max-width: 767px) 92vw, 720px')}
          alt="Una lectura de Tu Oráculo abierta en el celular, de noche, entre velas y cartas"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '52% 58%' }}
        />
      </div>

      <div className="space-y-4">
      <Seccion titulo="Qué es Tu Oráculo">
        <p className="leading-relaxed">
          Una empresa uruguaya que crea experiencias digitales de autoconocimiento, pensadas para el
          celular y entregadas donde ya estás: tu WhatsApp. La opera Luis Manuel Benítez Rodríguez
          (monotributista, RUT 214998320016). Hoy el producto disponible es{' '}
          <strong className="text-white/95">Tarot</strong>; vamos a sumar más experiencias con el tiempo.
        </p>
      </Seccion>

      <Seccion titulo="Cómo es el Tarot">
        <p className="leading-relaxed">
          Se sortean 5 cartas para tu consulta y se interpretan con tu nombre, tu fecha de nacimiento
          y lo que quieras explorar. En menos de 15 minutos te llega por WhatsApp (y por email, si lo
          pedís): tu lectura online y un PDF para guardar. La interpretación la genera inteligencia
          artificial con la simbología del tarot tradicional: una perspectiva para reflexionar, no
          una predicción.
        </p>
      </Seccion>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { Icon: MessageCircle, t: 'Por WhatsApp', d: 'Sin apps, sin contraseñas, sin turnos. Llega donde ya estás.' },
          { Icon: ShieldCheck, t: 'Honesta', d: 'Sin misticismo exagerado ni promesas de futuro.' },
          { Icon: Sparkles, t: 'Cuidada', d: 'Cada texto, imagen y detalle pensados como el consejo de alguien de confianza.' },
        ].map(({ Icon, t, d }) => (
          <div key={t} className="rounded-2xl px-5 py-4 flex sm:flex-col gap-3.5 sm:gap-2 items-start" style={PANEL_INSTITUCIONAL}>
            <span className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 40, height: 40, border: '1px solid rgba(240,197,90,0.5)', background: 'rgba(240,197,90,0.06)' }}>
              <Icon size={18} aria-hidden="true" style={{ color: GOLD }} />
            </span>
            <div>
              <p className="font-semibold text-[15px] text-white/95">{t}</p>
              <p className="text-[14px] text-white/70 leading-snug mt-0.5">{d}</p>
            </div>
          </div>
        ))}
      </div>
      </div>

      {/* CTA */}
      <div className="text-center mt-10">
        <Link
          href="/tarot"
          className="inline-block rounded-xl px-8 py-4 text-[16px] font-bold transition-all hover:brightness-105"
          style={{ background: CTA_GRADIENT, color: '#180e00', boxShadow: '0 6px 24px rgba(240,197,90,0.32)' }}
        >
          Quiero mi lectura →
        </Link>
        <p className="mt-2 text-[12.5px] text-white/50">Pago único · sin suscripción · te llega en menos de 15 min</p>
      </div>

    </PaginaInstitucional>
  );
}
