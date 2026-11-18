import TarotCheckoutContent from './TarotCheckoutContent';
import { getPrecioTarot } from '@/lib/getPrecioTarot';
import { numeroWhatsApp } from '@/lib/contacto';
import { restSupabase } from '@/lib/asistenteParte';
import { precioPrevioConCodigo } from '@/lib/reglasComerciales';

export const metadata = {
  title: 'Consulta de Tarot — Tu Oráculo',
  description: 'Completá tu consulta de tarot. Entrega por WhatsApp en minutos.',
};

export default async function TarotCheckoutPage({
  searchParams,
}: {
  searchParams: { tema?: string; codigo?: string; nombre?: string; nacimiento?: string };
}) {
  const precioBase = await getPrecioTarot();
  // Llegó con un código (ej. botón "otra lectura", 2026-11-17): el precio
  // especial se muestra desde el principio. Solo se LEE el cupón; la
  // validación real sigue siendo al escribir el WhatsApp o antes de pagar.
  let precioEspecial: number | null = null;
  if (searchParams.codigo) {
    try {
      const rest = restSupabase();
      if (rest) precioEspecial = await precioPrevioConCodigo(rest, searchParams.codigo, precioBase);
    } catch {
      precioEspecial = null;
    }
  }
  return <TarotCheckoutContent temaInicial={searchParams.tema} precioBase={precioBase} codigoInicial={searchParams.codigo} precioEspecialInicial={precioEspecial} nombreInicial={searchParams.nombre} nacimientoInicial={searchParams.nacimiento} waNumero={numeroWhatsApp()} />;
}
