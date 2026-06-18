import StaticPageLayout from '@/components/StaticPageLayout';

const SECTIONS = [
  {
    title: '1. Datos que recopilamos',
    content: 'Al suscribirte recopilamos: tu nombre, tu signo zodiacal, tu número de WhatsApp, tu preferencia de contenido (amor, trabajo, bienestar o general). Estos son los únicos datos personales que solicitamos directamente. La información de pago es gestionada de forma segura por Mercado Pago — no almacenamos datos de tarjeta en nuestros servidores.',
  },
  {
    title: '2. Para qué usamos tu información',
    content: 'Tus datos se usan exclusivamente para: enviarte tu mensaje diario personalizado vía WhatsApp, gestionar tu suscripción y responder consultas de soporte. No los compartimos con terceros con fines publicitarios ni los vendemos a nadie.',
  },
  {
    title: '3. WhatsApp y mensajes',
    content: 'Usamos tu número de WhatsApp únicamente para entregar el contenido al que te suscribiste. Los mensajes son de naturaleza informativa y de bienestar. Podés dar de baja tu suscripción en cualquier momento respondiendo "BAJA" a cualquiera de nuestros mensajes.',
  },
  {
    title: '4. Proveedores técnicos',
    content: 'Utilizamos proveedores de confianza para operar el servicio: Mercado Pago para procesar pagos, y plataformas de mensajería y hosting para entregar los mensajes y mantener el sitio web. Estos proveedores tienen sus propias políticas de privacidad.',
  },
  {
    title: '5. Seguridad',
    content: 'Implementamos medidas técnicas razonables para proteger tus datos frente a accesos no autorizados, pérdida o divulgación indebida. Ningún sistema es infalible, pero tomamos la privacidad de nuestros usuarios con seriedad.',
  },
  {
    title: '6. Tus derechos',
    content: 'Podés solicitar en cualquier momento el acceso, la corrección o la eliminación de tus datos personales. Para hacerlo, escribinos a hola@tuoraculo.uy y lo gestionamos a la brevedad.',
  },
  {
    title: '7. Cambios en esta política',
    content: 'Podemos actualizar esta política si hay cambios en el servicio o en requisitos legales aplicables. Si los cambios son significativos, te avisamos por WhatsApp o en el sitio web.',
  },
];

export default function PoliticaPrivacidad() {
  return (
    <StaticPageLayout>

      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-3">
          Legal
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
          Política de privacidad
        </h1>
        <p className="text-white/70 text-sm leading-relaxed">
          En Tu Oráculo valoramos tu confianza. Esta política explica qué datos recopilamos y cómo los usamos.
        </p>
        <p className="text-white/40 text-xs mt-2">Última actualización: 2025</p>
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
          Consultas sobre privacidad:{' '}
          <a
            href="mailto:hola@tuoraculo.uy"
            className="text-violet-400 hover:text-violet-300 transition-colors"
          >
            hola@tuoraculo.uy
          </a>
        </p>
      </div>

    </StaticPageLayout>
  );
}
