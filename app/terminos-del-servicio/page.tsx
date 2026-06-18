import Link from 'next/link';
import StaticPageLayout from '@/components/StaticPageLayout';

const SECTIONS = [
  {
    title: '1. Descripción del servicio',
    content: 'Tu Oráculo ofrece dos productos: (a) una suscripción mensual de mensajes diarios personalizados entregados vía WhatsApp ("Guía Diaria"), y (b) lecturas de tarot individuales generadas por inteligencia artificial y entregadas vía WhatsApp ("Tarot"). Ambos productos son de uso personal y no comercial.',
  },
  {
    title: '2. Condiciones de uso',
    content: 'Al usar cualquiera de nuestros servicios aceptás estos Términos en su totalidad. Debés ser mayor de 18 años para suscribirte o contratar una lectura. No podés usar el servicio con fines comerciales, revender el contenido ni reproducirlo sin autorización.',
  },
  {
    title: '3. Guía Diaria — Suscripción mensual',
    content: 'La Guía Diaria tiene un costo de $U 390 por mes, IVA incluido, con renovación automática mensual. Podés cancelar en cualquier momento desde tu perfil en Mercado Pago o escribiéndonos a hola@tuoraculo.uy. La cancelación detiene la renovación siguiente; no hay reembolso proporcional por el mes en curso salvo que la cancelación ocurra dentro de las primeras 24 horas del cargo.',
  },
  {
    title: '4. Tarot — Pago único',
    content: 'Las lecturas de tarot son un producto de pago único de $U 590, IVA incluido, sin suscripción ni renovación automática. Cada contratación corresponde a una lectura individual sobre la consulta especificada en el formulario. El pago se procesa a través de Mercado Pago.',
  },
  {
    title: '5. Contenido generado por inteligencia artificial',
    content: 'Las lecturas de Tarot son generadas íntegramente por modelos de inteligencia artificial aplicando simbología del tarot tradicional a la consulta del usuario. El contenido tiene exclusivamente carácter simbólico y de reflexión personal. No constituye asesoramiento profesional de ningún tipo (psicológico, médico, legal, financiero ni de ninguna otra índole). Tu Oráculono garantiza resultados ni la exactitud de ninguna interpretación. El usuario asume la responsabilidad por el uso que haga del contenido recibido.',
  },
  {
    title: '6. Entregas y tiempos',
    content: 'La Guía Diaria se entrega cada mañana, generalmente entre las 7 y las 9 AM (hora de Uruguay). Las lecturas de Tarot se entregan en menos de 15 minutos tras la confirmación del pago, salvo problemas técnicos imprevistos. En caso de demora mayor, nos ponemos en contacto con el usuario.',
  },
  {
    title: '7. Pagos y seguridad',
    content: 'Todos los pagos son procesados por Mercado Pago. Tu Oráculono almacena datos de tarjeta ni información de pago sensible en sus servidores. Las disputas de pago deben gestionarse directamente con Mercado Pago de acuerdo a sus políticas.',
  },
  {
    title: '8. Limitación de responsabilidad',
    content: 'THC ofrece contenido de bienestar, astrología práctica y simbología tarot con fines recreativos y de reflexión. No somos responsables por decisiones tomadas en base al contenido de nuestros mensajes o lecturas. La responsabilidad total de Tu Oráculoante cualquier reclamación se limita al importe abonado por el servicio en cuestión.',
  },
  {
    title: '9. Propiedad intelectual',
    content: 'El contenido generado por Tu Oráculo(mensajes, lecturas, diseños) es propiedad de Tu Oráculo. Podés usarlo para uso personal, pero no reproducirlo, distribuirlo ni comercializarlo sin autorización escrita.',
  },
  {
    title: '10. Modificaciones',
    content: 'Nos reservamos el derecho de actualizar estos Términos en cualquier momento. Cambios significativos serán comunicados por WhatsApp o en el sitio web. El uso continuado del servicio después de notificada una actualización implica aceptación de los nuevos términos.',
  },
  {
    title: '11. Contacto',
    content: 'Para cualquier consulta relacionada con estos Términos, escribinos a hola@tuoraculo.uy.',
  },
];

export default function TerminosServicio() {
  return (
    <StaticPageLayout>

      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-3">
          Legal
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
          Términos del servicio
        </h1>
        <p className="text-white/70 text-sm leading-relaxed">
          Estas condiciones regulan el uso de todos los productos de Tu Oráculo, incluyendo la Guía Diaria y las lecturas de Tarot.
        </p>
        <p className="text-white/40 text-xs mt-2">Última actualización: mayo 2026</p>
      </div>

      {/* Sections */}
      <div className="space-y-3 mb-10">
        {SECTIONS.map(section => (
          <div
            key={section.title}
            className="rounded-2xl border border-white/8 px-5 py-4"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <h2 className="text-sm font-semibold text-violet-400 mb-2">{section.title}</h2>
            <p className="text-white/70 text-sm leading-relaxed">{section.content}</p>
          </div>
        ))}
      </div>

      {/* Contacto */}
      <div
        className="rounded-2xl border border-white/8 p-5 text-center"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <p className="text-white/60 text-sm">
          Consultas legales:{' '}
          <a
            href="mailto:hola@tuoraculo.uy"
            className="text-violet-400 hover:text-violet-300 transition-colors"
          >
            hola@tuoraculo.uy
          </a>
        </p>
        <p className="text-white/40 text-xs mt-3">
          ¿Buscás la{' '}
          <Link href="/politica-de-privacidad" className="text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2">
            Política de privacidad
          </Link>
          ?
        </p>
      </div>

    </StaticPageLayout>
  );
}
