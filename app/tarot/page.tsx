import TarotLandingContent from './TarotLandingContent';
import { getPrecioTarot } from '@/lib/getPrecioTarot';

export const metadata = {
  title: 'Tarot — Tu Oráculo | Lectura personalizada por WhatsApp',
  description: 'Tirada de 5 cartas generada con IA, entregada por WhatsApp en minutos. Un pago único, sin suscripción.',
};

export default async function TarotPage() {
  const precioUYU = await getPrecioTarot();
  return <TarotLandingContent precioUYU={precioUYU} />;
}
