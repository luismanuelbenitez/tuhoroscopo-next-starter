import { Mail, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import StaticPageLayout from '@/components/StaticPageLayout';

const GOLD = '#F0C55A';
const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER ?? '';

export default function Contacto() {
  return (
    <StaticPageLayout>

      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
          Soporte
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
          Contacto
        </h1>
        <p className="text-white/70 text-base leading-relaxed">
          Estamos para ayudarte. Si tenés una consulta sobre tu tirada o tu pago, estas son las
          formas de comunicarte con nosotros.
        </p>
      </div>

      {/* Canales */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-4"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: GOLD }}>Correo electrónico</h2>
        <p className="text-white/80 text-sm leading-relaxed mb-3">
          La forma más confiable de contactarnos. Respondemos en un plazo de 24 a 48 horas
          hábiles.
        </p>
        <a
          href="mailto:hola@tuoraculo.uy"
          className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-5 py-3 transition-all"
          style={{
            background: `linear-gradient(135deg, #c49008 0%, ${GOLD} 55%, #f2cc44 100%)`,
            color: '#180e00',
            boxShadow: '0 4px 20px rgba(240,197,90,0.28)',
          }}
        >
          <Mail size={14} />
          hola@tuoraculo.uy
        </a>
      </div>

      {WA_NUMBER && (
        <div
          className="rounded-2xl border border-white/8 p-6 mb-4"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <h2 className="text-sm font-semibold mb-3" style={{ color: GOLD }}>WhatsApp</h2>
          <p className="text-white/80 text-sm leading-relaxed mb-3">
            Si ya compraste tu tirada, respondé directamente al mensaje que te llegó — es el
            camino más rápido. Si todavía no compraste y tenés una duda, también podés
            escribirnos acá.
          </p>
          <a
            href={`https://wa.me/${WA_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-5 py-3 transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)' }}
          >
            <MessageCircle size={14} />
            Escribinos por WhatsApp
          </a>
        </div>
      )}

      {/* No recibí mi tirada */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-4"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: GOLD }}>No recibí mi tirada</h2>
        <p className="text-white/80 text-sm leading-relaxed">
          Primero revisá que el número de WhatsApp esté bien escrito y mirá tu email (incluida la
          carpeta de spam, si pediste copia ahí). Si pasaron 15 minutos desde el pago y no
          recibiste nada, escribinos por cualquiera de los canales de arriba con el nombre y el
          teléfono que usaste al comprar — te la reenviamos de inmediato.
        </p>
      </div>

      {/* Motivos frecuentes */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-10"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: GOLD }}>Motivos de contacto más frecuentes</h2>
        <div className="space-y-2.5">
          {[
            'No recibí mi tirada después de pagar',
            'Tengo una duda sobre el cobro en Mercado Pago',
            'Quiero corregir un dato de mi consulta (nombre, teléfono, fecha)',
            'El enlace a mi lectura online dejó de funcionar',
            'Tengo una sugerencia o comentario',
          ].map(motivo => (
            <div key={motivo} className="flex gap-3 items-start">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: GOLD }} />
              <p className="text-white/65 text-sm">{motivo}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ link */}
      <div className="text-center mb-8">
        <p className="text-white/50 text-sm mb-2">¿Buscás una respuesta rápida?</p>
        <Link
          href="/faq"
          className="text-sm underline underline-offset-2 transition-colors"
          style={{ color: GOLD }}
        >
          Revisá las preguntas frecuentes →
        </Link>
      </div>

    </StaticPageLayout>
  );
}
