import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import StaticPageLayout from '@/components/StaticPageLayout';
import { getPrecioSuscripcion } from '@/lib/getPrecioSuscripcion';

export default async function FAQ() {
  const precio = await getPrecioSuscripcion();

  const FAQS = [
    {
      q: '¿Qué recibo exactamente?',
      a: 'Cada mañana recibís un mensaje de WhatsApp con: tu horóscopo diario personalizado por signo, un consejo según el foco que elegiste (amor, trabajo, bienestar o general), tu número de la suerte del día con una idea práctica, tu color del día con un significado, y una pausa breve para arrancar con calma.',
    },
    {
      q: '¿Cuándo me llega el mensaje?',
      a: 'Los mensajes se envían temprano a la mañana, generalmente entre las 7 y las 9 AM (hora de Uruguay). El horario puede variar levemente. El primer mensaje llega poco después de confirmar tu WhatsApp al suscribirte.',
    },
    {
      q: '¿Necesito instalar alguna app?',
      a: 'No. Todo llega directamente a tu WhatsApp, que ya tenés instalado. Sin apps nuevas, sin contraseñas, sin configuraciones adicionales.',
    },
    {
      q: '¿Cuánto cuesta?',
      a: `La suscripción cuesta $U ${precio} por mes, IVA incluido. Sin cargos ocultos ni costos adicionales.`,
    },
    {
      q: '¿Cómo se paga?',
      a: 'El pago se procesa de forma segura a través de Mercado Pago. Podés pagar con tarjeta de crédito, débito u otros medios disponibles en Mercado Pago para Uruguay.',
    },
    {
      q: '¿Cómo cancelo?',
      a: 'Podés cancelar en cualquier momento desde tu perfil en Mercado Pago, o escribiéndonos a hola@tuoraculo.uy. Sin trámites complicados.',
    },
    {
      q: '¿Qué pasa después de suscribirme?',
      a: 'Una vez completado el pago, te enviamos un mensaje de bienvenida a tu WhatsApp. Respondés ese mensaje una vez para activar tu cuenta y a partir de la mañana siguiente empezás a recibir tu guía diaria.',
    },
    {
      q: '¿Qué hago si no me llega el mensaje?',
      a: 'Primero verificá que nuestro número esté guardado en tus contactos (eso evita que WhatsApp filtre el mensaje). Si después de 10 minutos de suscribirte no recibiste la bienvenida, escribinos a hola@tuoraculo.uy.',
    },
    {
      q: '¿Cómo pauso o cancelo los mensajes?',
      a: 'Respondé "BAJA" a cualquier mensaje nuestro y te damos de baja de inmediato. También podés escribirnos directamente si preferís pausarlos por un tiempo.',
    },
    {
      q: '¿El contenido es personalizado?',
      a: 'Sí. Cada mensaje se construye con tu nombre, tu signo zodiacal y el foco que elegiste. No es un mensaje genérico enviado a todos — está pensado para vos.',
    },
    {
      q: '¿Puedo cambiar mi foco o preferencia más adelante?',
      a: 'Por ahora el foco se configura al suscribirte. Si querés cambiarlo, escribinos a hola@tuoraculo.uy y lo actualizamos.',
    },
    {
      q: '¿Por qué me piden mi signo y mi preferencia?',
      a: 'Para personalizar tu mensaje. Tu signo define el horóscopo y el tono general. Tu foco determina el consejo práctico del día. Sin esos datos, el mensaje sería igual para todos.',
    },
  ];

  return (
    <StaticPageLayout>

      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-3">
          Dudas frecuentes
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
          Preguntas frecuentes
        </h1>
        <p className="text-white/70 text-base leading-relaxed">
          Todo lo que necesitás saber antes de suscribirte — o después.
        </p>
      </div>

      {/* Accordion */}
      <div className="space-y-2 mb-10">
        {FAQS.map((faq, i) => (
          <details
            key={i}
            className="group rounded-2xl border border-white/8 overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <summary className="px-5 py-4 flex items-center justify-between gap-3 cursor-pointer select-none">
              <span className="text-white/95 text-sm font-semibold">{faq.q}</span>
              <ChevronDown
                size={15}
                className="text-violet-400 shrink-0 transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <div className="px-5 pb-5">
              <div className="border-t border-white/6 pt-3">
                <p className="text-white/60 text-sm leading-relaxed">{faq.a}</p>
              </div>
            </div>
          </details>
        ))}
      </div>

      {/* ¿Quedó alguna duda? */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-8 text-center"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <p className="text-white/80 text-sm mb-1">¿Quedó alguna duda sin responder?</p>
        <Link href="/contacto" className="text-violet-400 text-sm hover:text-violet-300 transition-colors underline underline-offset-2">
          Escribinos desde la página de contacto
        </Link>
      </div>

      {/* CTA */}
      <div className="text-center">
        <a
          href="/horoscopo/checkout"
          className="inline-block rounded-xl bg-gradient-to-r from-violet-700 to-violet-500 px-8 py-3.5 text-sm font-bold text-white transition-all hover:from-violet-600 hover:to-violet-400"
          style={{ boxShadow: '0 4px 20px rgba(109,40,217,0.30)' }}
        >
          Activar mi guía diaria →
        </a>
        <p className="mt-2 text-[12px] text-white/40">$U {precio}/mes · IVA incluido · Sin apps · Cancelás cuando quieras</p>
      </div>

    </StaticPageLayout>
  );
}
