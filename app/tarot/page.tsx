import TarotLandingContent from './TarotLandingContent';
import { getPrecioTarot } from '@/lib/getPrecioTarot';

export const metadata = {
  title: 'Tu tirada de Tarot personalizada | Tu Oráculo',
  description:
    'Se sortean tus 5 cartas y se leen para vos. En menos de 15 minutos te llegan por WhatsApp: una lectura online hecha para el celular y un PDF para guardar. Un solo pago. Sin suscripción.',
};

export default async function TarotPage() {
  const precioUYU = await getPrecioTarot();
  return <TarotLandingContent precioUYU={precioUYU} />;
}
