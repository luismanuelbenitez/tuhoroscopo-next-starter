'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { Loader2, Shield, Zap, CheckCircle2, MessageCircle } from 'lucide-react';
import LeadFormFields from '@/components/LeadFormFields';

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

function WAPreview() {
  return (
    <div className="bg-[#0b141a] rounded-2xl border border-white/8 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-base shrink-0">
          ✨
        </div>
        <div>
          <p className="text-white text-sm font-semibold leading-tight">Tu Horóscopo Cósmico</p>
          <p className="text-green-400 text-xs">en línea</p>
        </div>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div className="flex justify-start">
          <div className="bg-[#1f2c33] rounded-xl rounded-tl-sm px-3 py-2.5 max-w-[88%]">
            <p className="text-white text-sm">🌟 Buenos días, María.</p>
            <p className="text-white/80 text-sm mt-1">
              Tu signo <strong>Géminis</strong> hoy viene con energía de renovación. Es momento de soltar lo que ya no te sirve.
            </p>
          </div>
        </div>
        <div className="flex justify-start">
          <div className="bg-[#1f2c33] rounded-xl rounded-tl-sm px-3 py-2.5 max-w-[88%]">
            <p className="text-white text-sm">💜 <strong>Tu afirmación del día:</strong></p>
            <p className="text-white/80 text-sm italic mt-1">&ldquo;Soy capaz de crear la vida que quiero.&rdquo;</p>
            <p className="text-white/60 text-xs mt-2">
              Número: <strong className="text-violet-400">7</strong> · Color: <strong className="text-violet-400">violeta</strong>
            </p>
          </div>
        </div>
        <div className="flex justify-start">
          <div className="bg-[#1f2c33] rounded-xl rounded-tl-sm px-3 py-2.5 max-w-[88%]">
            <p className="text-white/60 text-xs">Foco: <strong className="text-white">Bienestar mental</strong></p>
            <p className="text-white/80 text-sm mt-1">Tomate 10 minutos sin pantallas hoy.</p>
          </div>
        </div>
      </div>
      <p className="text-center text-white/25 text-[10px] pb-3">Así llega cada mañana a tu WhatsApp</p>
    </div>
  );
}

export default function Checkout2Content() {
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
        fuente: 'web-vercel-checkout2-v1',
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
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Hero strip */}
      <div className="bg-gradient-to-r from-violet-900/50 via-fuchsia-900/30 to-violet-900/50 border-b border-white/8 py-8 px-4 text-center">
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2 leading-tight">
          Tu guía diaria,{' '}
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            directo a WhatsApp.
          </span>
        </h1>
        <p className="text-white/65 text-sm md:text-base mb-5 max-w-lg mx-auto">
          Horóscopo, afirmación y número de la suerte — personalizados para vos — cada mañana.
        </p>
        <div className="inline-flex items-baseline gap-2 bg-black/30 rounded-full px-5 py-2 border border-white/10 mb-4">
          <span className="text-2xl font-extrabold text-white">$U 390</span>
          <span className="text-white/55 text-sm">/mes</span>
        </div>
        <div className="flex justify-center flex-wrap gap-x-5 gap-y-1.5 text-xs text-white/50">
          <span>✓ Sin apps</span>
          <span>✓ Sin spam</span>
          <span>✓ Solo WhatsApp</span>
          <span>✓ Cancelás cuando quieras</span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        <div className="flex flex-col md:flex-row gap-8 md:gap-10 md:items-start">

          {/* FORM — order-1 on mobile, order-2 on desktop */}
          <div className="order-1 md:order-2 w-full md:w-[420px] md:shrink-0">
            <div className="bg-gray-900 rounded-2xl border border-white/8 p-6 md:p-8 shadow-2xl">
              <h2 className="text-lg font-bold text-white mb-1">Activá tu suscripción</h2>
              <p className="text-white/50 text-sm mb-6">Empezás a recibir mensajes en minutos.</p>
              <form onSubmit={handleSubmit} noValidate>
                <LeadFormFields
                  formData={formData}
                  handleInputChange={handleInputChange}
                  isLoading={isLoading}
                  acepta={acepta}
                  handleCheckboxChange={handleCheckboxChange}
                />
                {error && (
                  <div className="mt-4 rounded-xl border border-red-800/60 bg-red-950/50 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-6 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-4 font-bold text-white text-base shadow-lg hover:from-violet-500 hover:to-fuchsia-500 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={18} className="animate-spin" />
                      Procesando…
                    </span>
                  ) : (
                    'Activar mi guía diaria'
                  )}
                </button>
                <p className="mt-3 text-center text-xs text-white/35">
                  Serás redirigido a Mercado Pago de forma segura.
                </p>
              </form>
            </div>
          </div>

          {/* PRODUCT INFO — order-2 on mobile, order-1 on desktop */}
          <div className="order-2 md:order-1 flex-1 space-y-5 min-w-0">

            <WAPreview />

            {/* Cómo funciona */}
            <div className="bg-gray-900/60 rounded-2xl border border-white/8 p-5">
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-4">
                ¿Cómo funciona?
              </p>
              <div className="space-y-4">
                {[
                  {
                    n: '1',
                    title: 'Completás el formulario',
                    desc: 'Nombre, signo, foco y número de WhatsApp. Un minuto.',
                  },
                  {
                    n: '2',
                    title: 'Confirmás tu WhatsApp',
                    desc: 'Te enviamos un mensaje de bienvenida. Lo respondés para activar tu cuenta.',
                  },
                  {
                    n: '3',
                    title: 'Recibís tu guía cada mañana',
                    desc: 'Sin apps. Sin spam. Solo tu mensaje del día, personalizado.',
                  },
                ].map(step => (
                  <div key={step.n} className="flex gap-4 items-start">
                    <div className="text-2xl font-extrabold text-violet-500 leading-none w-6 shrink-0 mt-0.5">
                      {step.n}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{step.title}</p>
                      <p className="text-white/50 text-sm mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: <Shield size={16} />, text: 'Datos protegidos' },
                { icon: <Zap size={16} />, text: 'Primer mensaje en minutos' },
                { icon: <CheckCircle2 size={16} />, text: 'Cancelás online cuando quieras' },
                { icon: <MessageCircle size={16} />, text: 'Solo WhatsApp. Sin apps.' },
              ].map(item => (
                <div
                  key={item.text}
                  className="bg-gray-900/50 rounded-xl border border-white/8 px-4 py-3 flex items-center gap-2.5"
                >
                  <span className="text-violet-400 shrink-0">{item.icon}</span>
                  <p className="text-white/60 text-xs leading-snug">{item.text}</p>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
