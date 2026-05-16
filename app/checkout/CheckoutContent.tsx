'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { Loader2, Shield, Sparkles, CheckCircle2, MessageCircle } from 'lucide-react';
import LeadFormFields from '@/components/LeadFormFields';
import WAPreview from '@/components/WAPreview';

function normalizarUY(num: string): { telefono: string; whatsapp: string } {
  const digits = num.replace(/\D/g, '');
  if (!/^09\d{7}$/.test(digits)) {
    throw new Error(`Número de WhatsApp inválido (UY): ${num}`);
  }
  const telefono = digits.slice(1);
  const whatsapp = `+598${telefono}`;
  return { telefono, whatsapp };
}

interface FormData {
  name: string;
  signo: string;
  contenidoPreferido: string;
  whatsapp: string;
}

export default function CheckoutContent() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    signo: '',
    contenidoPreferido: '',
    whatsapp: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'whatsapp') {
      setFormData(prev => ({ ...prev, [name]: value.replace(/\D/g, '') }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    setError(null);
  };

  const handleCheckboxChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAcepta(e.target.checked);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!acepta) {
      setError('Debes aceptar la Política de Privacidad para continuar.');
      return;
    }
    if (!formData.name.trim() || !formData.signo || !formData.contenidoPreferido || !formData.whatsapp.trim()) {
      setError('Por favor, completá todos los campos.');
      return;
    }
    if (!/^09\d{7}$/.test(formData.whatsapp)) {
      setError('El número de WhatsApp debe comenzar con 09 y tener 9 dígitos (ej: 099123456).');
      return;
    }

    try {
      sessionStorage.setItem('checkoutData', JSON.stringify({
        name: formData.name.trim(),
        signo: formData.signo,
        contenidoPreferido: formData.contenidoPreferido,
        whatsapp: formData.whatsapp,
      }));
    } catch (e) {
      console.warn('No se pudo guardar sessionStorage:', e);
    }

    setIsLoading(true);

    try {
      const { telefono, whatsapp } = normalizarUY(formData.whatsapp);

      const payload = {
        nombre: formData.name.trim(),
        telefono,
        whatsapp,
        signo: formData.signo,
        contenido_preferido: formData.contenidoPreferido,
        pais: 'UY',
        fuente: 'web-vercel-checkout-v3',
        version_politicas: 'v1.0',
        acepto_politicas: acepta,
      };

      const response = await fetch('/api/iniciar-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Error iniciando checkout');
      }

      const result = await response.json();

      if (!result?.init_point) {
        throw new Error('No se recibió el link de pago');
      }

      window.location.href = result.init_point;
    } catch (err: unknown) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado.');
    }
  };

  return (
    <>
      {/*
       * body: suprime fondo cósmico (estrellas, nebulosas) y el overlay fixed ::before.
       * header: el <Header /> global está vacío en esta ruta; se colapsa su py-6
       *   para que el hero empiece sin franja oscura vacía encima.
       * #checkout-fields: tinte violeta sutil en inputs para salir del gris neutro.
       */}
      <style jsx global>{`
        body {
          background-image: none !important;
          background-color: #0e0b22 !important;
        }
        body::before {
          display: none !important;
        }
        header {
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }
        #checkout-fields input,
        #checkout-fields select {
          background-color: rgba(88, 40, 180, 0.07) !important;
        }
      `}</style>

      <div
        className="min-h-screen text-white relative z-[1]"
        style={{ background: 'linear-gradient(180deg, #110927 0%, #0d0820 55%, #0e0b22 100%)' }}
      >

        {/* Glow sutil detrás del contenido */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-56"
          style={{ background: 'radial-gradient(ellipse 65% 55% at 50% 0%, rgba(88,28,180,0.11), transparent)', zIndex: 0 }}
        />

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="relative border-b border-white/8 py-5 px-4 text-center" style={{ zIndex: 1 }}>

          <h1 className="text-2xl md:text-[2.6rem] font-extrabold text-white leading-tight mb-2">
            Cada mañana,{' '}
            <span className="bg-gradient-to-r from-violet-300 to-violet-500 bg-clip-text text-transparent">
              una guía hecha para vos.
            </span>
          </h1>

          <p className="text-white/70 text-sm md:text-base max-w-md mx-auto mb-4 leading-relaxed">
            Tu horóscopo, tu número de la suerte y tu consejo del día — personalizados y directo a WhatsApp.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            <span className="bg-violet-950/80 border border-violet-600/30 rounded-full px-4 py-1.5 font-bold text-white">
              $U 390<span className="text-white/55 font-normal">/mes</span>
            </span>
            <span className="text-white/30">·</span>
            <span className="text-white/65">Sin apps</span>
            <span className="text-white/30">·</span>
            <span className="text-white/65">Sin spam</span>
            <span className="text-white/30">·</span>
            <span className="text-white/65">Cancelás cuando quieras</span>
          </div>

        </div>

        {/* ── Layout dos columnas ──────────────────────────────────── */}
        <div className="relative mx-auto max-w-5xl px-4 py-6 md:py-10" style={{ zIndex: 1 }}>
          <div className="flex flex-col md:flex-row gap-6 md:gap-10 md:items-start">

            {/* FORMULARIO — orden 1 en mobile, derecha en desktop */}
            <div className="order-1 md:order-2 w-full md:w-[420px] md:shrink-0">
              <div
                className="rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 0 0 1px rgba(109,40,217,0.22), 0 28px 72px rgba(0,0,0,0.75)' }}
              >
                <div style={{ height: '2px', background: 'linear-gradient(90deg, #5b21b6 0%, #7c3aed 100%)' }} />

                <div className="p-6 md:p-8" style={{ background: '#0d0b1e' }}>

                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-white leading-tight">Activá tu suscripción</h2>
                    <p className="text-white/60 text-sm mt-1">Tu primer mensaje llega en minutos.</p>
                  </div>

                  <form onSubmit={handleSubmit} noValidate>
                    <div id="checkout-fields">
                      <LeadFormFields
                        formData={formData}
                        handleInputChange={handleInputChange}
                        isLoading={isLoading}
                        acepta={acepta}
                        handleCheckboxChange={handleCheckboxChange}
                      />
                    </div>

                    {error && (
                      <div className="mt-4 rounded-xl border border-red-700/50 bg-red-950/60 px-4 py-3 text-sm text-red-300">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="mt-6 w-full rounded-xl bg-gradient-to-r from-violet-700 to-violet-500 py-[16px] text-base font-bold text-white transition-all hover:from-violet-600 hover:to-violet-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
                      style={{ boxShadow: '0 4px 24px rgba(109,40,217,0.35)' }}
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 size={20} className="animate-spin" />
                          Procesando…
                        </span>
                      ) : (
                        'Activar mi guía diaria →'
                      )}
                    </button>

                    <p className="mt-3 text-center text-[12px] text-white/50">
                      Pago seguro · $U 390/mes · Cancelás cuando quieras
                    </p>

                    <div className="mt-5 pt-5 border-t border-white/8 grid grid-cols-2 gap-2.5">
                      {[
                        { icon: <Shield size={13} />, text: 'Datos protegidos' },
                        { icon: <Sparkles size={13} />, text: 'Primer mensaje hoy' },
                        { icon: <CheckCircle2 size={13} />, text: 'Cancelás online' },
                        { icon: <MessageCircle size={13} />, text: 'Solo WhatsApp' },
                      ].map(item => (
                        <div key={item.text} className="flex items-center gap-2 text-[12px] text-white/55">
                          <span className="text-violet-400 shrink-0">{item.icon}</span>
                          {item.text}
                        </div>
                      ))}
                    </div>
                  </form>

                </div>
              </div>
            </div>

            {/* INFO DEL PRODUCTO — orden 2 en mobile, izquierda en desktop */}
            <div className="order-2 md:order-1 flex-1 space-y-4 min-w-0">

              <WAPreview />

              {/* Cómo funciona — compacto */}
              <div
                className="rounded-2xl border border-white/8 p-4"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-3">
                  ¿Cómo funciona?
                </p>
                <div className="space-y-3">
                  {[
                    { n: '1', title: 'Completás el formulario', desc: 'Nombre, signo, foco y WhatsApp. Un minuto.' },
                    { n: '2', title: 'Confirmás tu WhatsApp', desc: 'Te enviamos un mensaje. Respondés una vez para activar.' },
                    { n: '3', title: 'Tu guía llega cada mañana', desc: 'Directo a WhatsApp. Sin apps. Sin spam.' },
                  ].map(step => (
                    <div key={step.n} className="flex gap-3 items-start">
                      <div className="text-lg font-extrabold text-violet-500/80 leading-none w-5 shrink-0 mt-0.5">
                        {step.n}
                      </div>
                      <div>
                        <p className="text-white/90 font-semibold text-sm">{step.title}</p>
                        <p className="text-white/55 text-xs mt-0.5 leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
