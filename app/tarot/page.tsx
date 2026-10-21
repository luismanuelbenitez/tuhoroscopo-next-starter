import TarotLandingContent from './TarotLandingContent';
import { getPrecioTarot } from '@/lib/getPrecioTarot';
import { getTestimoniosTarot, TESTIMONIOS_DEMO } from '@/lib/getTestimoniosTarot';
import { metadataPagina } from '@/lib/seo/metadataPagina';
import { htmlJsonLd, jsonLdTarot } from '@/lib/seo/jsonLd';

// Página dueña de la intención principal "tarot online personalizado" y hub
// de las páginas por tema (Paquete SEO 1, 2026-10-21).
export const metadata = metadataPagina(
  '/tarot',
  'Tarot online personalizado: tu lectura de 5 cartas | Tu Oráculo',
  'Tarot online personalizado: 5 cartas interpretadas para tu consulta, con resumen en audio y PDF. Te llega por WhatsApp en minutos. Pago único, sin suscripción.',
);

export default async function TarotPage({
  searchParams,
}: {
  searchParams: { demo?: string };
}) {
  // ?demo=testimonios: solo en desarrollo, para revisar el diseño de las
  // cards sin publicar nada en la base. En producción se ignora siempre.
  const demoTestimonios = process.env.NODE_ENV !== 'production' && searchParams.demo === 'testimonios';

  const [precioUYU, testimonios] = await Promise.all([
    getPrecioTarot(),
    demoTestimonios ? Promise.resolve(TESTIMONIOS_DEMO) : getTestimoniosTarot(),
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={htmlJsonLd(jsonLdTarot(precioUYU))} />
      <TarotLandingContent precioUYU={precioUYU} testimonios={testimonios} />
    </>
  );
}
