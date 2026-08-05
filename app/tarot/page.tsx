import TarotLandingContent from './TarotLandingContent';
import { getPrecioTarot } from '@/lib/getPrecioTarot';

export const metadata = {
  title: 'Lectura de Tarot personalizada | Tu Oráculo',
  description:
    'Tirada de 5 cartas interpretada para tu pregunta real, entregada en PDF directo a tu WhatsApp en menos de 15 minutos. Un solo pago. Sin suscripción.',
};

export default async function TarotPage() {
  const precioUYU = await getPrecioTarot();
  return <TarotLandingContent precioUYU={precioUYU} />;
}
