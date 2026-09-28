import StaticPageLayout from '@/components/StaticPageLayout';

const GOLD = '#F0C55A';

const SECTIONS = [
  {
    title: '1. Datos que recopilamos',
    content: 'El responsable de Tu Oráculo es Luis Manuel Benítez Rodríguez, RUT 214998320016, Uruguay. Para Tu Tirada (tarot), al completar el checkout recopilamos: tu nombre, tu número de WhatsApp, el tema de tu consulta y, si los completás, tu fecha de nacimiento, tu email y tu pregunta puntual — estos tres últimos son opcionales. Si en algún momento contratás la Guía Diaria (horóscopo por suscripción), recopilamos tu nombre, tu signo zodiacal, tu número de WhatsApp y tu preferencia de contenido. En ambos casos, la información de pago es gestionada de forma segura por Mercado Pago — no almacenamos datos de tarjeta en nuestros servidores.',
  },
  {
    title: '2. Para qué usamos tu información',
    content: 'Tus datos se usan exclusivamente para generar y entregarte tu tirada (o tu mensaje diario, si contrataste la Guía Diaria) vía WhatsApp y, si lo pediste, por email; gestionar tu compra o suscripción; y responder consultas de soporte. No los compartimos con terceros con fines publicitarios ni los vendemos a nadie.',
  },
  {
    title: '3. Inteligencia artificial',
    content: 'La interpretación de tu tirada la genera un modelo de inteligencia artificial de Anthropic, al que le enviamos tu nombre, tu fecha de nacimiento (si la diste), el tema elegido y tu pregunta (si la escribiste) para que la lectura esté hecha en relación con vos. Esa información se usa únicamente para generar tu lectura — no se usa para entrenar modelos de terceros ni se comparte con otros fines.',
  },
  {
    title: '4. WhatsApp y mensajes',
    content: 'Usamos tu número de WhatsApp únicamente para entregarte el contenido que contrataste: tu tirada, o tu mensaje diario si sos suscriptor de la Guía Diaria. Si sos suscriptor, podés dar de baja en cualquier momento respondiendo "BAJA" a cualquiera de nuestros mensajes.',
  },
  {
    title: '5. Proveedores técnicos',
    content: 'Utilizamos proveedores de confianza para operar el servicio: Mercado Pago para procesar pagos, Anthropic para generar la interpretación de las lecturas, y plataformas de mensajería (WhatsApp Business, email) y hosting para entregar el contenido y mantener el sitio web. Estos proveedores tienen sus propias políticas de privacidad.',
  },
  {
    title: '6. Seguridad',
    content: 'Implementamos medidas técnicas razonables para proteger tus datos frente a accesos no autorizados, pérdida o divulgación indebida. Ningún sistema es infalible, pero tomamos la privacidad de nuestros usuarios con seriedad.',
  },
  {
    title: '7. Tus derechos',
    content: 'Podés solicitar en cualquier momento el acceso, la corrección o la eliminación de tus datos personales. Para hacerlo, escribinos a hola@tuoraculo.uy y lo gestionamos a la brevedad.',
  },
  {
    title: '8. Cambios en esta política',
    content: 'Podemos actualizar esta política si hay cambios en el servicio o en requisitos legales aplicables. Si los cambios son significativos, te avisamos por WhatsApp o en el sitio web.',
  },
];

export default function PoliticaPrivacidad() {
  return (
    <StaticPageLayout>

      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
          Legal
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
          Política de privacidad
        </h1>
        <p className="text-white/70 text-sm leading-relaxed">
          En Tu Oráculo valoramos tu confianza. Esta política explica qué datos recopilamos y cómo los usamos.
        </p>
        <p className="text-white/40 text-xs mt-2">Última actualización: septiembre 2026</p>
      </div>

      {/* Sections */}
      <div className="space-y-3 mb-10">
        {SECTIONS.map(section => (
          <div
            key={section.title}
            className="rounded-2xl border border-white/8 px-5 py-4"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <h2 className="text-sm font-semibold mb-2" style={{ color: GOLD }}>{section.title}</h2>
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
            className="transition-colors"
            style={{ color: GOLD }}
          >
            hola@tuoraculo.uy
          </a>
        </p>
      </div>

    </StaticPageLayout>
  );
}
