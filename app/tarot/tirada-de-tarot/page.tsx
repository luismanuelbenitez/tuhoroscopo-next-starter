import TiradaDeTarotContent from './TiradaDeTarotContent';
import { getPrecioTarot } from '@/lib/getPrecioTarot';
import { REVALIDAR_MARKETING } from '@/lib/fetchSupabase';
import { getTestimoniosTarot } from '@/lib/getTestimoniosTarot';
import { metadataPagina } from '@/lib/seo/metadataPagina';
import { htmlJsonLd, jsonLdTarot } from '@/lib/seo/jsonLd';
import { numeroWhatsApp } from '@/lib/contacto';

// Página de la búsqueda "tirada de tarot" (2026-11-17, regla G14): la frase
// que más ventas trajo de Google Ads. Misma experiencia que /tarot.
export const metadata = metadataPagina(
  '/tarot/tirada-de-tarot',
  'Tirada de tarot online: 5 cartas en minutos | Tu Oráculo',
  'Hacé tu tirada de tarot online: elegís el tema y recibís 5 cartas interpretadas, con resumen en audio y PDF. Te llega por WhatsApp en minutos. Pago único con Mercado Pago, sin suscripción.',
);

// Pregenerada, como /tarot: precio y testimonios se releen cada 60 s.
export const revalidate = 60;

export default async function TiradaDeTarotPage() {
  const [precioUYU, testimonios] = await Promise.all([
    getPrecioTarot({ revalidar: REVALIDAR_MARKETING }),
    getTestimoniosTarot({ revalidar: REVALIDAR_MARKETING }),
  ]);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={htmlJsonLd(jsonLdTarot(precioUYU, { ruta: '/tarot/tirada-de-tarot', nombre: 'Tirada de tarot' }))}
      />
      <TiradaDeTarotContent precioUYU={precioUYU} testimonios={testimonios} waNumero={numeroWhatsApp()} />
    </>
  );
}
