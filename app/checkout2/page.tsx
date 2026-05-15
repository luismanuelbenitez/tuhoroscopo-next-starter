import { Suspense } from 'react';
import Checkout2Content from './Checkout2Content';

export default function Checkout2Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <Checkout2Content />
    </Suspense>
  );
}
