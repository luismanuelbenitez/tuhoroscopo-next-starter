'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { GOLD, SERIF, CREMA, CTA_GRADIENT } from '@/components/home/theme';
import { seccionesTerminos, SECCIONES_PRIVACIDAD, LEGAL_ACTUALIZADO } from '@/lib/textosLegales';

// Términos y Privacidad encima del checkout (2026-11-15, pedido de Manuel):
// antes abrían otra pestaña y en el celular la persona salía del pago. Ahora
// sube una hoja desde abajo; se cierra con "Volver al pago", la ✕, tocando
// afuera, Escape o el botón "atrás" del celular, y el formulario queda
// exactamente como estaba. Menos es más: no marca la casilla por ella.

export type DocLegal = 'terminos' | 'privacidad';

const TITULOS: Record<DocLegal, string> = {
  terminos: 'Términos del servicio',
  privacidad: 'Política de privacidad',
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
  const secciones = doc === 'terminos' ? seccionesTerminos(precioTexto) : SECCIONES_PRIVACIDAD;

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
            <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>Legal</p>
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
