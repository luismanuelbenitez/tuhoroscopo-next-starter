import TarotLandingContent from './TarotLandingContent';
import { getPrecioTarot } from '@/lib/getPrecioTarot';
import { getTestimoniosTarot, TESTIMONIOS_DEMO } from '@/lib/getTestimoniosTarot';

export const metadata = {
  title: 'Tarot personalizado | Tu Oráculo',
  description:
    'Tarot personalizado: 5 cartas interpretadas para vos. En menos de 15 minutos te llegan por WhatsApp: una lectura online hecha para el celular y un PDF para guardar. Un solo pago. Sin suscripción.',
};

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
  return <TarotLandingContent precioUYU={precioUYU} testimonios={testimonios} />;
}
