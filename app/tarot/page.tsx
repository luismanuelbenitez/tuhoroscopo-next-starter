import TarotLandingContent from './TarotLandingContent';
import { getPrecioTarot } from '@/lib/getPrecioTarot';
import { REVALIDAR_MARKETING } from '@/lib/fetchSupabase';
import { getTestimoniosTarot, TESTIMONIOS_DEMO } from '@/lib/getTestimoniosTarot';
import { metadataPagina } from '@/lib/seo/metadataPagina';
import { htmlJsonLd, jsonLdTarot } from '@/lib/seo/jsonLd';
import { numeroWhatsApp } from '@/lib/contacto';

// Página dueña de la intención principal "tarot online personalizado" y hub
// de las páginas por tema (Paquete SEO 1, 2026-10-21).
export const metadata = metadataPagina(
  '/tarot',
  'Lectura de tarot online personalizada: 5 cartas | Tu Oráculo',
  'Lectura de tarot online personalizada: 5 cartas interpretadas para tu consulta, con resumen en audio y PDF. Te llega por WhatsApp en minutos. Pago único, sin suscripción.',
);

// Pregenerada y entregada ya armada desde el CDN (2026-11-09, Nivel de
// Calidad de Google Ads: antes se armaba en cada visita en iad1, TTFB 1–1,6 s).
// Precio y testimonios se releen cada 60 s; el checkout y el cobro siguen
// leyendo el precio siempre fresco.
export const revalidate = 60;

export default async function TarotPage() {
  // Cards de testimonios de prueba: solo en desarrollo, con
  // TAROT_DEMO_TESTIMONIOS=1 (antes ?demo=testimonios, que obligaba a armar
  // la página en cada visita). En producción se ignora siempre.
  const demoTestimonios = process.env.NODE_ENV !== 'production' && process.env.TAROT_DEMO_TESTIMONIOS === '1';

  const [precioUYU, testimonios] = await Promise.all([
    getPrecioTarot({ revalidar: REVALIDAR_MARKETING }),
    demoTestimonios ? Promise.resolve(TESTIMONIOS_DEMO) : getTestimoniosTarot({ revalidar: REVALIDAR_MARKETING }),
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={htmlJsonLd(jsonLdTarot(precioUYU))} />
      <TarotLandingContent precioUYU={precioUYU} testimonios={testimonios} waNumero={numeroWhatsApp()} />
    </>
  );
}
