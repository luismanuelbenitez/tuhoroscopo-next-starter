// Textos legales en un solo lugar (2026-11-15). Los usan las páginas
// /terminos-del-servicio y /politica-de-privacidad y la hoja que se abre
// encima del checkout (components/tarot/checkout/HojaLegal.tsx), para que
// nunca queden dos versiones distintas.

export type SeccionLegal = { title: string; content: string };

export const LEGAL_ACTUALIZADO = 'noviembre 2026';

// Revisión legal (2026-11-02): entrega por todos los canales, arrepentimiento
// y devoluciones (Ley 17.250 art. 16), responsabilidad sin cláusula de tope
// (art. 31), ley aplicable y dónde reclamar. Lenguaje simple, a pedido.
// `precioTexto`: el precio ya formateado ("$690") o un texto de respaldo.
export function seccionesTerminos(precioTexto: string): SeccionLegal[] {
  return [
    {
      title: '1. Quién presta el servicio',
      content: 'Tu Oráculo es un servicio de Luis Manuel Benítez Rodríguez, empresa unipersonal registrada en Uruguay, RUT 214998320016. Contacto: hola@tuoraculo.uy.',
    },
    {
      title: '2. Qué es tu lectura',
      content: 'Es una lectura de Tarot de 5 cartas sobre la consulta que nos dejás en el formulario. La escribe inteligencia artificial aplicando la simbología del tarot tradicional. Te la entregamos por WhatsApp (y por email, si lo pedís) con un enlace para leerla en la web, un PDF para guardar y un resumen en audio.',
    },
    {
      title: '3. Quién puede comprar',
      content: 'Tenés que ser mayor de 18 años. La lectura es para tu uso personal: no podés revenderla ni usarla con fines comerciales.',
    },
    {
      title: '4. Precio y pago',
      content: `La lectura cuesta ${precioTexto}, en pesos uruguayos. Es un pago único y final: no se suman cargos, no hay suscripción ni renovación automática. El pago lo procesa Mercado Pago y nosotros nunca vemos los datos de tu tarjeta. Hoy no vendemos suscripciones; si en el futuro lo hacemos, te vamos a informar precio, renovación y cómo darte de baja antes de contratar.`,
    },
    {
      title: '5. Entrega',
      content: 'Tu lectura se genera y se envía apenas se confirma el pago: suele llegar en pocos minutos, y como máximo en 15. Si no te llega, escribinos y te la reenviamos. Si por un problema nuestro no podemos entregártela, te devolvemos el 100% de lo que pagaste.',
    },
    {
      title: '6. Arrepentimiento y devoluciones',
      content: 'Tenés 5 días hábiles desde la compra para arrepentirte, como prevé la Ley de Relaciones de Consumo. Si todavía no recibiste tu lectura, te devolvemos el total. Como la lectura es contenido digital que se entrega al instante, al comprar pedís que la preparemos de inmediato. Aun así, si tu lectura llegó incompleta, con fallas o no corresponde a tu consulta, la hacemos de nuevo o te devolvemos el dinero, lo que prefieras. Para cualquiera de estos casos escribinos a hola@tuoraculo.uy o por WhatsApp; la devolución se hace por Mercado Pago, al mismo medio de pago.',
    },
    {
      title: '7. Qué es y qué no es una lectura de Tarot',
      content: 'El contenido tiene carácter simbólico y de reflexión personal. No predice el futuro y no reemplaza asesoramiento profesional (psicológico, médico, legal, financiero ni de ningún otro tipo). Las decisiones que tomes son tuyas.',
    },
    {
      title: '8. Responsabilidad',
      content: 'Nos comprometemos a entregarte el servicio tal como se describe acá. No respondemos por decisiones que tomes basándote en una lectura, por su carácter simbólico. Nada de estos Términos limita los derechos que te da la ley como consumidor.',
    },
    {
      title: '9. Propiedad intelectual',
      content: 'Los textos, diseños e imágenes de Tu Oráculo son nuestros. Tu lectura es para vos: podés guardarla y compartirla con quien quieras, pero no reproducirla ni venderla con fines comerciales.',
    },
    {
      title: '10. Tus datos',
      content: 'Cómo usamos y protegemos tu información está en la Política de privacidad, que forma parte de estos Términos.',
    },
    {
      title: '11. Cambios en estos Términos',
      content: 'Podemos actualizar estos Términos. Cada compra se rige por los Términos vigentes en el momento en que la hiciste.',
    },
    {
      title: '12. Ley aplicable y reclamos',
      content: 'Estos Términos se rigen por las leyes de Uruguay. Si tenés un problema, escribinos primero: lo resolvemos rápido.',
    },
  ];
}

// Revisión legal (2026-11-02): medición y publicidad, IP de la orden,
// proveedores con su país (transferencia internacional, Ley 18.331 art. 23),
// datos sensibles, conservación y plazo de respuesta a derechos (5 días hábiles).
export const SECCIONES_PRIVACIDAD: SeccionLegal[] = [
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
