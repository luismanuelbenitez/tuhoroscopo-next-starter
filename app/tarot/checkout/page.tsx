import TarotCheckoutContent from './TarotCheckoutContent';
import { getPrecioTarot } from '@/lib/getPrecioTarot';

export const metadata = {
  title: 'Consulta de Tarot — Tu Oráculo',
  description: 'Completá tu consulta de tarot. Entrega por WhatsApp en minutos.',
};

export default async function TarotCheckoutPage({
  searchParams,
}: {
  searchParams: { tema?: string };
}) {
  const precioBase = await getPrecioTarot();
  return <TarotCheckoutContent temaInicial={searchParams.tema} precioBase={precioBase} />;
}
