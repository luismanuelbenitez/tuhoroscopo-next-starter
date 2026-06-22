'use client';
import { usePrecioSuscripcion } from '@/lib/usePrecioSuscripcion';

export default function SubscriptionSummary() {
  const precio = usePrecioSuscripcion();
  return (
    <div className="px-0 py-0">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl bg-cosmic-surface/70 border border-white/10 p-6 md:p-8 shadow-glow backdrop-blur-sm">
          <div className="mx-auto max-w-xl text-center">
            <span className="inline-block text-[13px] tracking-widest uppercase text-cosmic-gold/90 bg-black/20 border border-white/10 rounded-full px-3 py-1 mb-6">
              Sin app. Solo WhatsApp.
            </span>
            <h1 className="text-white text-2xl md:text-3xl font-extrabold">
              Suscripción premium mensual
            </h1>
            <div className="my-4">
              <span className="text-4xl md:text-5xl font-extrabold text-white">$U {precio}</span>
              <span className="text-white/80 font-semibold ml-1">/mes</span>
            </div>
            <ul className="text-white/80 text-sm space-y-1 mb-6">
              <li>Empezás hoy. Cancelás cuando quieras.</li>
              <li>Recibí tu primer mensaje en minutos.</li>
            </ul>
            {/* El botón de pago ahora vive en CheckoutContent.tsx */}
            {/* <p className="text-white/55 text-xs mt-3">
              Serás redirigido a Mercado Pago para finalizar el pago de forma segura.
            </p> */}
          </div>
          <div className="mt-6 text-center text-[11px] text-white/50">
            Tus datos están protegidos. Podés cancelar online en cualquier momento.
          </div>
        </div>
      </div>
    </div>
  )
}