'use client';

import { useEffect, useRef } from 'react';
import { X, CreditCard, Banknote, Wallet } from 'lucide-react';
import { GOLD, SERIF, CREMA, CTA_GRADIENT } from '@/components/home/theme';
import { seccionesTerminos, SECCIONES_PRIVACIDAD, LEGAL_ACTUALIZADO } from '@/lib/textosLegales';

// Términos y Privacidad encima del checkout (2026-11-15, pedido de Manuel):
// antes abrían otra pestaña y en el celular la persona salía del pago. Ahora
// sube una hoja desde abajo; se cierra con "Volver al pago", la ✕, tocando
// afuera, Escape o el botón "atrás" del celular, y el formulario queda
// exactamente como estaba. Menos es más: no marca la casilla por ella.
// 2026-11-25 (pedido de Manuel): la misma hoja explica los medios de pago
// ('pago') al tocar la línea "Tarjeta o efectivo…" debajo del botón de pago;
// el botón de pago no cambia. Nace de una clienta que preguntó por Abitab.

export type DocLegal = 'terminos' | 'privacidad' | 'pago';

const TITULOS: Record<DocLegal, string> = {
  terminos: 'Términos del servicio',
  privacidad: 'Política de privacidad',
  pago: 'Cómo podés pagar',
};

export function HojaLegal({ doc, precioTexto, onCerrar }: {
  doc: DocLegal | null;
  precioTexto: string;
  onCerrar: () => void;
}) {
  const cuerpoRef = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const abierta = doc !== null;
  // Entrada en el historial para que "atrás" cierre la hoja en vez de salir del checkout.
  const enHistorial = useRef(false);
  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;

  useEffect(() => {
    if (!abierta) return;
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    try { window.history.pushState({ hojaLegal: true }, ''); enHistorial.current = true; } catch { /* sin historial: igual funciona */ }
    const alVolver = () => { enHistorial.current = false; onCerrarRef.current(); };
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('popstate', alVolver);
    window.addEventListener('keydown', alTeclear);
    cerrarRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('popstate', alVolver);
      window.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflow;
      anterior?.focus?.({ preventScroll: true });
    };
  }, [abierta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al pasar de Términos a Privacidad (o al reabrir), arranca arriba.
  useEffect(() => { if (cuerpoRef.current) cuerpoRef.current.scrollTop = 0; }, [doc]);

  function cerrar() {
    // Si la hoja dejó una entrada en el historial, la saca con "atrás" (y el
    // popstate la cierra); así el botón atrás del celular no queda "gastado".
    if (enHistorial.current) { enHistorial.current = false; window.history.back(); return; }
    onCerrarRef.current();
  }

  if (!doc) return null;
  const secciones = doc === 'terminos' ? seccionesTerminos(precioTexto) : doc === 'privacidad' ? SECCIONES_PRIVACIDAD : [];

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={cerrar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hoja-legal-titulo"
        className="relative w-full md:max-w-[640px] flex flex-col rounded-t-3xl md:rounded-3xl overflow-hidden"
        style={{
          height: 'min(90dvh, 820px)',
          background: '#0f0920',
          border: '1px solid rgba(240,197,90,0.30)',
          boxShadow: '0 -12px 48px rgba(0,0,0,0.6)',
          animation: 'hojaLegalSube 220ms ease-out',
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: '@keyframes hojaLegalSube{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@media (prefers-reduced-motion:reduce){[role=dialog]{animation:none!important}}' }} />

        {/* Encabezado */}
        <div className="shrink-0 flex items-center justify-between gap-3 pl-5 pr-2 pt-3 pb-3 border-b" style={{ borderColor: 'rgba(240,197,90,0.18)' }}>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>{doc === 'pago' ? 'Medios de pago' : 'Legal'}</p>
            <h2 id="hoja-legal-titulo" className="truncate" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 24, lineHeight: 1.15, color: CREMA }}>
              {TITULOS[doc]}
            </h2>
          </div>
          <button
            ref={cerrarRef}
            type="button"
            onClick={cerrar}
            aria-label="Cerrar y volver al pago"
            className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full text-white/80 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0C55A]"
          >
            <X size={24} />
          </button>
        </div>

        {/* Texto */}
        <div ref={cuerpoRef} className="flex-1 overflow-y-auto overscroll-contain px-5 md:px-7 py-5" style={{ fontVariantNumeric: 'lining-nums' }}>
          {doc === 'pago' ? <MediosDePago /> : (<>
          <p className="text-[13px] text-white/55 mb-4">Última actualización: {LEGAL_ACTUALIZADO}</p>
          <div className="space-y-5">
            {secciones.map((s) => (
              <section key={s.title}>
                <h3 className="mb-1.5 text-[16px] font-semibold" style={{ color: CREMA }}>{s.title}</h3>
                <p className="text-[15px] leading-relaxed text-white/85">{s.content}</p>
              </section>
            ))}
          </div>
          <p className="mt-6 text-[14px] text-white/60">
            Consultas: <a href="mailto:hola@tuoraculo.uy" className="underline underline-offset-2" style={{ color: GOLD }}>hola@tuoraculo.uy</a>
          </p>
          </>)}
        </div>

        {/* Volver */}
        <div className="shrink-0 px-5 pt-3 border-t" style={{ borderColor: 'rgba(240,197,90,0.18)', paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
          <button
            type="button"
            onClick={cerrar}
            className="w-full rounded-xl px-4 py-3.5 min-h-[54px] text-[17px] font-bold active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0920] focus-visible:ring-[#F0C55A]"
            style={{ background: CTA_GRADIENT, color: '#180e00' }}
          >
            Volver al pago
          </button>
        </div>
      </div>
    </div>
  );
}

// Mini instructivo de medios de pago. Solo lo que Mercado Pago ofrece de
// verdad en este checkout (verificado 2026-11-25: tarjeta, efectivo en
// Redpagos y Abitab, y cuenta de Mercado Pago; no hace falta tener cuenta).
const PASOS_EFECTIVO = [
  'Tocá el botón «Pagar» de esta página.',
  'En Mercado Pago elegí «Efectivo» y después Abitab o Redpagos.',
  'Te da un código de pago. Pagalo en cualquier local antes de la fecha que figura en el cupón: tenés unos días.',
  'Cuando el pago se acredita, tu lectura se prepara sola y te llega el acceso por WhatsApp.',
];

function MediosDePago() {
  const caja = { background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(240,197,90,0.22)' };
  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-white/85">
        Pagás a través de Mercado Pago, de forma segura. No necesitás tener cuenta de Mercado Pago.
      </p>

      <section className="rounded-2xl px-4 py-4" style={caja}>
        <h3 className="flex items-center gap-2 text-[16px] font-semibold" style={{ color: CREMA }}>
          <CreditCard size={18} className="shrink-0" style={{ color: GOLD }} /> Con tarjeta
        </h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">
          Crédito, débito o prepaga. El pago se confirma al instante y tu acceso llega por WhatsApp en minutos.
        </p>
      </section>

      <section className="rounded-2xl px-4 py-4" style={caja}>
        <h3 className="flex items-center gap-2 text-[16px] font-semibold" style={{ color: CREMA }}>
          <Banknote size={18} className="shrink-0" style={{ color: GOLD }} /> En efectivo, en Abitab o Redpagos
        </h3>
        <ol className="mt-3 space-y-3">
          {PASOS_EFECTIVO.map((t, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-white/85">
              <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-[14px] font-bold" style={{ background: 'rgba(240,197,90,0.16)', color: GOLD }}>{i + 1}</span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[14px] leading-relaxed text-white/65">
          Con efectivo, tu lectura empieza cuando Mercado Pago acredita el pago, que puede tardar un rato.
        </p>
      </section>

      <section className="rounded-2xl px-4 py-4" style={caja}>
        <h3 className="flex items-center gap-2 text-[16px] font-semibold" style={{ color: CREMA }}>
          <Wallet size={18} className="shrink-0" style={{ color: GOLD }} /> Con tu cuenta de Mercado Pago
        </h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">
          Si tenés cuenta, podés pagar con tu dinero disponible o tus tarjetas guardadas.
        </p>
      </section>

      <p className="text-[14px] leading-relaxed text-white/65">
        Es un pago único, sin suscripción. Tu Oráculo nunca ve ni guarda los datos de tu tarjeta.
      </p>
    </div>
  );
}
