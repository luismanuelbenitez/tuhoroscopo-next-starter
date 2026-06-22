import { Suspense } from 'react';
import CheckoutContent from './CheckoutContent';
import { getPrecioSuscripcion } from '@/lib/getPrecioSuscripcion';

export default async function CheckoutPage() {
  const precioBase = await getPrecioSuscripcion();
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#0e0b22' }} />}>
      <CheckoutContent precioBase={precioBase} />
    </Suspense>
  );
}
