import TarotCheckoutContent from './TarotCheckoutContent';

export const metadata = {
  title: 'Consulta de Tarot — Tu Oráculo',
  description: 'Completá tu consulta de tarot. Entrega por WhatsApp en minutos.',
};

export default function TarotCheckoutPage({
  searchParams,
}: {
  searchParams: { tema?: string };
}) {
  return <TarotCheckoutContent temaInicial={searchParams.tema} />;
}
