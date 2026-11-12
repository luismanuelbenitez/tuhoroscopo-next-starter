import Link from 'next/link';

import { PaginaInstitucional, EncabezadoInstitucional, PanelInstitucional, PANEL_INSTITUCIONAL, IndiceLegal, anclaSeccion } from '@/components/marca/PaginaInstitucional';
import { GOLD } from '@/components/home/theme';
import { getPrecioTarot } from '@/lib/getPrecioTarot';
import { REVALIDAR_MARKETING } from "@/lib/fetchSupabase";
import { metadataPagina } from '@/lib/seo/metadataPagina';

// Pregenerada; precio y testimonios se releen cada 60 s (lib/fetchSupabase).
export const revalidate = 60;

// Metadata propia (Paquete SEO 1, 2026-10-21): título, descripción, canonical y OG.
export const metadata = metadataPagina(
  '/terminos-del-servicio',
  'Términos del servicio | Tu Oráculo',
  'Condiciones de Tu Oráculo: qué es la lectura de Tarot, precio y pago único, entrega, arrepentimiento y devoluciones, y dónde reclamar.',
);

export default async function TerminosServicio() {
  const precioTarot = await getPrecioTarot({ revalidar: REVALIDAR_MARKETING });
  const precioTarotTexto = precioTarot !== null ? `$U ${precioTarot}` : 'el precio que ves en el checkout';

  // Revisión legal (2026-11-02): entrega por todos los canales, arrepentimiento
  // y devoluciones (Ley 17.250 art. 16), responsabilidad sin cláusula de tope
  // (art. 31), ley aplicable y dónde reclamar. Lenguaje simple, a pedido.
  const SECTIONS = [
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
      content: `La lectura cuesta ${precioTarotTexto}, en pesos uruguayos. Es un pago único y final: no se suman cargos, no hay suscripción ni renovación automática. El pago lo procesa Mercado Pago y nosotros nunca vemos los datos de tu tarjeta. Hoy no vendemos suscripciones; si en el futuro lo hacemos, te vamos a informar precio, renovación y cómo darte de baja antes de contratar.`,
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

  return (
    <PaginaInstitucional>
      <EncabezadoInstitucional eyebrow="Legal" titulo="Términos del servicio">
        <p>Estas condiciones regulan el uso de Tu Oráculo y de su lectura de Tarot.</p>
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
          Consultas legales:{' '}
          <a href="mailto:hola@tuoraculo.uy" className="underline underline-offset-2" style={{ color: GOLD }}>
            hola@tuoraculo.uy
          </a>
        </p>
          <p className="text-white/50 text-[13px] mt-3">
            ¿Buscás la{' '}
            <Link href="/politica-de-privacidad" className="underline underline-offset-2" style={{ color: GOLD }}>
              Política de privacidad
            </Link>
            ?
          </p>
      </div>
    </PaginaInstitucional>
  );
}
