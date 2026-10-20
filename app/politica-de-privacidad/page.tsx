import { PaginaInstitucional, EncabezadoInstitucional, PanelInstitucional, PANEL_INSTITUCIONAL } from '@/components/marca/PaginaInstitucional';
import { GOLD } from '@/components/home/theme';


const SECTIONS = [
  {
    title: '1. Datos que recopilamos',
    content: 'El responsable de Tu Oráculo es Luis Manuel Benítez Rodríguez, RUT 214998320016, Uruguay. Para el Tarot, al completar el checkout recopilamos: tu nombre, tu número de WhatsApp, el tema de tu consulta y, si los completás, tu fecha de nacimiento, tu email y tu pregunta puntual — estos tres últimos son opcionales. Si en algún momento contratás la Guía Diaria (horóscopo por suscripción, hoy no disponible), recopilamos tu nombre, tu signo zodiacal, tu número de WhatsApp y tu preferencia de contenido. En ambos casos, la información de pago es gestionada de forma segura por Mercado Pago — no almacenamos datos de tarjeta en nuestros servidores.',
  },
  {
    title: '2. Para qué usamos tu información',
    content: 'Tus datos se usan exclusivamente para generar y entregarte tu tirada (o tu mensaje diario, si contrataste la Guía Diaria) vía WhatsApp y, si lo pediste, por email; gestionar tu compra o suscripción; y responder consultas de soporte. No los compartimos con terceros con fines publicitarios ni los vendemos a nadie.',
  },
  {
    title: '3. Inteligencia artificial',
    content: 'La interpretación de tu tirada la genera un modelo de inteligencia artificial de Anthropic, al que le enviamos tu nombre, tu fecha de nacimiento (si la diste), el tema elegido y tu pregunta (si la escribiste) para que la lectura esté hecha en relación con vos. Para el resumen en audio usamos OpenAI, que transforma el texto de tu lectura en voz. Esa información se usa únicamente para generar tu lectura y su audio — no se usa para entrenar modelos de terceros ni se comparte con otros fines.',
  },
  {
    title: '4. WhatsApp y mensajes',
    content: 'Usamos tu número de WhatsApp únicamente para entregarte el contenido que contrataste: tu tirada, o tu mensaje diario si sos suscriptor de la Guía Diaria. Si sos suscriptor, podés dar de baja en cualquier momento respondiendo "BAJA" a cualquiera de nuestros mensajes.',
  },
  {
    title: '5. Opiniones y testimonios',
    content: 'Después de tu lectura podemos pedirte tu opinión. Si respondés, guardamos tu valoración (de 1 a 5 estrellas) y tu comentario, si lo escribís, para mejorar el servicio. Solo los publicamos si lo autorizás expresamente, con dos autorizaciones separadas: una para mostrarlo como testimonio en nuestro sitio web y otra para usarlo en piezas de comunicación de la marca. En ambos casos te identificamos únicamente con tu nombre y la inicial de tu apellido — nunca tu apellido completo, tu ciudad ni tus datos de contacto. Podés retirar tu autorización en cualquier momento escribiendo a hola@tuoraculo.uy.',
  },
  {
    title: '6. Proveedores técnicos',
    content: 'Utilizamos proveedores de confianza para operar el servicio: Mercado Pago para procesar pagos, Anthropic para generar la interpretación de las lecturas, OpenAI para convertir el resumen en audio, y plataformas de mensajería (WhatsApp Business, email) y hosting para entregar el contenido y mantener el sitio web. Estos proveedores tienen sus propias políticas de privacidad.',
  },
  {
    title: '7. Seguridad',
    content: 'Implementamos medidas técnicas razonables para proteger tus datos frente a accesos no autorizados, pérdida o divulgación indebida. Ningún sistema es infalible, pero tomamos la privacidad de nuestros usuarios con seriedad.',
  },
  {
    title: '8. Tus derechos',
    content: 'Podés solicitar en cualquier momento el acceso, la corrección o la eliminación de tus datos personales. Para hacerlo, escribinos a hola@tuoraculo.uy y lo gestionamos a la brevedad.',
  },
  {
    title: '9. Cambios en esta política',
    content: 'Podemos actualizar esta política si hay cambios en el servicio o en requisitos legales aplicables. Si los cambios son significativos, te avisamos por WhatsApp o en el sitio web.',
  },
];

export default function PoliticaPrivacidad() {
  return (
    <PaginaInstitucional>
      <EncabezadoInstitucional eyebrow="Legal" titulo="Política de privacidad">
        <p>En Tu Oráculo valoramos tu confianza. Esta política explica qué datos recopilamos y cómo los usamos.</p>
        <p className="text-white/45 text-[13px] mt-2">Última actualización: octubre 2026</p>
      </EncabezadoInstitucional>

      <div className="space-y-3 mb-10">
        {SECTIONS.map(section => (
          <PanelInstitucional key={section.title} titulo={section.title}>
            <p>{section.content}</p>
          </PanelInstitucional>
        ))}
      </div>

      <div className="rounded-2xl px-6 py-5 text-center" style={PANEL_INSTITUCIONAL}>
        <p className="text-white/70 text-[15px]">
          Consultas sobre privacidad:{' '}
          <a href="mailto:hola@tuoraculo.uy" className="underline underline-offset-2" style={{ color: GOLD }}>
            hola@tuoraculo.uy
          </a>
        </p>
      </div>
    </PaginaInstitucional>
  );
}
