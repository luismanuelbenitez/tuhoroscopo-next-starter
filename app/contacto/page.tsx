import { Mail } from 'lucide-react';
import Link from 'next/link';
import StaticPageLayout from '@/components/StaticPageLayout';

export default function Contacto() {
  return (
    <StaticPageLayout>

      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-3">
          Soporte
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
          Contacto
        </h1>
        <p className="text-white/70 text-base leading-relaxed">
          Estamos para ayudarte. Si tenés una consulta sobre tu suscripción o el servicio, estas son las formas de comunicarte con nosotros.
        </p>
      </div>

      {/* Canal principal */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-4"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <h2 className="text-sm font-semibold text-violet-400 mb-3">Correo electrónico</h2>
        <p className="text-white/80 text-sm leading-relaxed mb-3">
          La forma más confiable de contactarnos. Respondemos en un plazo de 24 a 48 horas hábiles.
        </p>
        <a
          href="mailto:hola@tuoraculo.uy"
          className="inline-flex items-center gap-2 text-white font-semibold text-sm rounded-xl bg-gradient-to-r from-violet-700 to-violet-500 px-5 py-3 hover:from-violet-600 hover:to-violet-400 transition-all"
          style={{ boxShadow: '0 4px 20px rgba(109,40,217,0.28)' }}
        >
          <Mail size={14} />
          hola@tuoraculo.uy
        </a>
      </div>

      {/* Mensajes — dar de baja */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-4"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <h2 className="text-sm font-semibold text-violet-400 mb-3">Pausar o cancelar mensajes</h2>
        <p className="text-white/80 text-sm leading-relaxed">
          Si querés pausar o detener los mensajes de WhatsApp, respondé <span className="text-violet-300 font-semibold">BAJA</span> a cualquier mensaje nuestro. Lo procesamos de inmediato, sin preguntas.
        </p>
        <p className="text-white/60 text-sm mt-2">
          Para cancelar la suscripción de pago, podés hacerlo desde tu cuenta en Mercado Pago o escribirnos al correo de arriba.
        </p>
      </div>

      {/* Motivos frecuentes */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-10"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <h2 className="text-sm font-semibold text-violet-400 mb-4">Motivos de contacto más frecuentes</h2>
        <div className="space-y-2.5">
          {[
            'No recibí el mensaje de bienvenida después de suscribirme',
            'Quiero cambiar mi signo o preferencia de contenido',
            'Tengo una duda sobre el cobro en Mercado Pago',
            'Quiero pausar los mensajes por un período',
            'Tengo una sugerencia o comentario',
          ].map(motivo => (
            <div key={motivo} className="flex gap-3 items-start">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 shrink-0" />
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
          className="text-violet-400 text-sm hover:text-violet-300 transition-colors underline underline-offset-2"
        >
          Revisá las preguntas frecuentes →
        </Link>
      </div>

    </StaticPageLayout>
  );
}
