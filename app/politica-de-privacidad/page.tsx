import { PaginaInstitucional, EncabezadoInstitucional, PanelInstitucional, PANEL_INSTITUCIONAL, IndiceLegal, anclaSeccion } from '@/components/marca/PaginaInstitucional';
import { GOLD } from '@/components/home/theme';
import { metadataPagina } from '@/lib/seo/metadataPagina';

// Metadata propia (Paquete SEO 1, 2026-10-21): título, descripción, canonical y OG.
export const metadata = metadataPagina(
  '/politica-de-privacidad',
  'Política de privacidad | Tu Oráculo',
  'Qué datos recopila Tu Oráculo, para qué los usamos, con qué proveedores y en qué países se procesan, cómo usamos la inteligencia artificial y cómo ejercer tus derechos.',
);


// Revisión legal (2026-11-02): medición y publicidad, IP de la orden,
// proveedores con su país (transferencia internacional, Ley 18.331 art. 23),
// datos sensibles, conservación y plazo de respuesta a derechos (5 días hábiles).
const SECTIONS = [
  {
    title: '1. Quién cuida tus datos',
    content: 'El responsable es Luis Manuel Benítez Rodríguez (Tu Oráculo), RUT 214998320016, Uruguay. Para cualquier tema de privacidad escribinos a hola@tuoraculo.uy.',
  },
  {
    title: '2. Qué datos recopilamos',
    content: 'Cuando comprás una lectura: tu nombre, tu WhatsApp y el tema de tu consulta; y, solo si los completás, tu fecha de nacimiento, tu email y tu pregunta. Del pago se encarga Mercado Pago: nosotros solo recibimos la confirmación y el monto, nunca los datos de tu tarjeta. Al crear la orden también guardamos la dirección IP y el tipo de navegador, por seguridad y para prevenir fraudes. Cuando navegás el sitio registramos qué páginas visitás, de dónde llegaste (por ejemplo, un anuncio), el tipo de dispositivo y la ciudad aproximada, junto con un identificador anónimo guardado en tu navegador. Esa medición no guarda tu IP.',
  },
  {
    title: '3. Para qué los usamos',
    content: 'Para generar y entregarte tu lectura; gestionar tu compra y su registro de venta; ayudarte si nos escribís; entender cómo se usa el sitio para mejorarlo; y medir si nuestros anuncios funcionan. No vendemos tus datos a nadie.',
  },
  {
    title: '4. Tu pregunta y los datos sensibles',
    content: 'Para tu lectura no hace falta que cuentes datos de salud, religión, vida sexual ni datos de otras personas. Si igual los incluís en tu pregunta, los usamos solo para generar tu lectura y con la misma protección que el resto de tu información.',
  },
  {
    title: '5. Inteligencia artificial',
    content: 'Tu lectura la escribe un modelo de inteligencia artificial de Anthropic. Le enviamos tu nombre, el tema, las cartas y, si los diste, tu fecha de nacimiento y tu pregunta. El resumen en audio lo genera OpenAI a partir del texto de tu lectura. Ninguno de los dos usa esta información para entrenar sus modelos.',
  },
  {
    title: '6. Proveedores y dónde se procesan tus datos',
    content: 'Usamos proveedores especializados. Algunos están fuera de Uruguay: la base de datos (Supabase) funciona en Brasil; el sitio web (Vercel), la inteligencia artificial (Anthropic y OpenAI), el envío de emails (Resend), WhatsApp y la medición de anuncios (Meta) y la analítica (Google) funcionan principalmente en Estados Unidos. Mercado Pago procesa los pagos. Cada uno recibe solo lo necesario para su tarea. Al aceptar esta política al comprar, das tu consentimiento para esa transferencia internacional.',
  },
  {
    title: '7. Medición, cookies y publicidad',
    content: 'Usamos el píxel de Meta y Google Analytics, que guardan cookies en tu navegador. Con ellos les avisamos a Meta y a Google cuando visitás el sitio, empezás una compra o comprás, para medir los anuncios y mostrárselos a personas con intereses parecidos. Esos avisos no incluyen tu pregunta ni el contenido de tu lectura. También usamos la analítica de Vercel, que no usa cookies. Podés borrar o bloquear las cookies desde tu navegador y ajustar tus preferencias de anuncios en Facebook, Instagram y Google.',
  },
  {
    title: '8. WhatsApp y mensajes',
    content: 'Usamos tu WhatsApp y, si lo diste, tu email para entregarte la lectura y hablar con vos sobre ella. Solo te mandaríamos promociones si lo aceptás por separado, y siempre podrías darte de baja.',
  },
  {
    title: '9. Opiniones y testimonios',
    content: 'Después de tu lectura podemos pedirte tu opinión. Si respondés, guardamos tu valoración (de 1 a 5 estrellas) y tu comentario, si lo escribís, para mejorar el servicio. Solo los publicamos si lo autorizás expresamente, con dos autorizaciones separadas: una para mostrarlo como testimonio en nuestro sitio web y otra para usarlo en piezas de comunicación de la marca. En ambos casos te identificamos únicamente con tu nombre y la inicial de tu apellido — nunca tu apellido completo, tu ciudad ni tus datos de contacto. Podés retirar tu autorización en cualquier momento escribiendo a hola@tuoraculo.uy.',
  },
  {
    title: '10. Cuánto tiempo los guardamos',
    content: 'Los datos de tu compra los guardamos mientras sean necesarios para darte el servicio y el tiempo que exigen las normas comerciales y tributarias para los registros de venta. El enlace a tu lectura en la web vence a los 30 días; tu PDF queda con vos. Podés pedirnos que borremos tus datos en cualquier momento, salvo lo que la ley nos obligue a conservar.',
  },
  {
    title: '11. Seguridad',
    content: 'Protegemos tus datos con medidas técnicas razonables: acceso restringido, conexiones cifradas y enlaces privados para tu lectura. Ningún sistema es infalible, pero tomamos tu privacidad en serio.',
  },
  {
    title: '12. Tus derechos',
    content: 'Podés pedirnos acceso a tus datos, corregirlos, actualizarlos o eliminarlos escribiendo a hola@tuoraculo.uy. Te respondemos dentro de los 5 días hábiles. Si no quedás conforme, podés reclamar ante la Unidad Reguladora y de Control de Datos Personales (URCDP) de Uruguay.',
  },
  {
    title: '13. Menores de edad',
    content: 'Tu Oráculo es para mayores de 18 años. Si nos enteramos de que una compra la hizo un menor, borramos sus datos.',
  },
  {
    title: '14. Cambios en esta política',
    content: 'Si cambiamos algo importante, lo avisamos en el sitio web. La fecha de la última actualización está arriba de todo.',
  },
];

export default function PoliticaPrivacidad() {
  return (
    <PaginaInstitucional>
      <EncabezadoInstitucional eyebrow="Legal" titulo="Política de privacidad">
        <p>En Tu Oráculo valoramos tu confianza. Esta política explica qué datos recopilamos y cómo los usamos.</p>
        <p className="text-white/45 text-[13px] mt-2">Última actualización: noviembre 2026</p>
      </EncabezadoInstitucional>

      <IndiceLegal titulos={SECTIONS.map(s => s.title)} />
      <div className="space-y-3 mb-10">
        {SECTIONS.map(section => (
          <PanelInstitucional key={section.title} id={anclaSeccion(section.title)} titulo={section.title}>
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
