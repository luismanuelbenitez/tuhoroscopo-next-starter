'use client';
import { usePrecioSuscripcion } from '@/lib/usePrecioSuscripcion';

export default function StickyCTA() {
  const precio = usePrecioSuscripcion();
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div className="px-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <a
          href="/checkout"
          className="block text-center mx-auto w-[92vw] max-w-sm rounded-full py-4 font-semibold text-white"
          style={{
            background: 'linear-gradient(90deg, #5b21b6, #7c3aed)',
            boxShadow: '0 4px 20px rgba(109,40,217,0.40)',
          }}
        >
          Activar por $U {precio}/mes →
        </a>
      </div>
    </div>
  );
}
