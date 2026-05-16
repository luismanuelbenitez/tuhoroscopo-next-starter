import { Suspense } from 'react';
import CheckoutContent from './CheckoutContent';

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#0e0b22' }} />}>
      <CheckoutContent />
    </Suspense>
  );
}
