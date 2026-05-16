'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { Loader2, Shield, Zap, CheckCircle2, MessageCircle } from 'lucide-react';
import LeadFormFields from '@/components/LeadFormFields';

// ── Lógica idéntica a /checkout ──────────────────────────────────────────────
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

// ── Mockup WhatsApp ───────────────────────────────────────────────────────────
function WAPreview() {
  return (
    <div className="bg-[#0b141a] rounded-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#1f2c33]/60 border-b border-white/8">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-base shrink-0 shadow-md">
          ✨
        </div>
        <div>
          <p className="text-white text-[13px] font-semibold leading-tight">Tu Horóscopo Cósmico</p>
          <p className="text-green-400 text-[11px]">en línea</p>
        </div>
      </div>

      {/* Messages */}
      <div className="px-4 py-5 space-y-3">
        <div className="flex justify-start">
          <div className="bg-[#1f2c33] rounded-2xl rounded-tl-none px-4 py-3 max-w-[90%] shadow-sm">
            <p className="text-white/90 text-sm leading-relaxed">
              🌟 <span className="font-medium">Buenos días, María.</span>
            </p>
            <p className="text-white/75 text-sm leading-relaxed mt-1">
              Tu signo <strong className="text-white/90">Géminis</strong> hoy trae energía de renovación. Es momento de soltar lo que ya no te sirve.
            </p>
            <p className="text-white/30 text-[10px] mt-2 text-right">08:00 ✓✓</p>
          </div>
        </div>

        <div className="flex justify-start">
          <div className="bg-[#1f2c33] rounded-2xl rounded-tl-none px-4 py-3 max-w-[90%] shadow-sm">
            <p className="text-white/90 text-sm font-medium">💜 Tu afirmación del día</p>
            <p className="text-white/75 text-sm italic mt-1">
              &ldquo;Soy capaz de crear la vida que quiero.&rdquo;
            </p>
            <p className="text-white/55 text-xs mt-2">
              Número de la suerte: <strong className="text-violet-300">7</strong>
              {' '}· Color: <strong className="text-violet-300">violeta</strong>
            </p>
            <p className="text-white/30 text-[10px] mt-2 text-right">08:01 ✓✓</p>
          </div>
        </div>

        <div className="flex justify-start">
          <div className="bg-[#1f2c33] rounded-2xl rounded-tl-none px-4 py-3 max-w-[90%] shadow-sm">
            <p className="text-white/55 text-[11px] uppercase tracking-wide font-medium">Foco: Bienestar mental</p>
            <p className="text-white/80 text-sm mt-1">Tomate 10 minutos sin pantallas hoy.</p>
            <p className="text-white/30 text-[10px] mt-2 text-right">08:01 ✓✓</p>
          </div>
        </div>
      </div>

      <p className="text-center text-white/35 text-[11px] pb-4">
        Así llega cada mañana a tu WhatsApp
      </p>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
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

      {/* Glow ambiente sutil — solo decorativo */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(109,40,217,0.25), transparent)' }}
      />

      {/* ── Hero compacto ────────────────────────────────────────── */}
      <div className="relative border-b border-white/8 py-6 px-4 text-center">
        <h1 className="text-2xl md:text-4xl font-extrabold text-white leading-tight mb-2">
          Tu guía diaria,{' '}
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            directo a WhatsApp.
          </span>
        </h1>

        <p className="text-white/75 text-sm md:text-base max-w-md mx-auto mb-4">
          Horóscopo, afirmación y número de la suerte, personalizados para vos, cada mañana.
        </p>

        {/* Precio + trust en una sola línea compacta */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className="bg-violet-950/70 border border-violet-700/40 rounded-full px-4 py-1.5 font-bold text-white">
            $U 390<span className="text-white/55 font-normal">/mes</span>
          </span>
          <span className="text-white/50">·</span>
          <span className="text-white/65">Sin apps</span>
          <span className="text-white/30">·</span>
          <span className="text-white/65">Sin spam</span>
          <span className="text-white/30">·</span>
          <span className="text-white/65">Cancelás cuando quieras</span>
        </div>
      </div>

      {/* ── Layout dos columnas ──────────────────────────────────── */}
      <div className="relative mx-auto max-w-5xl px-4 py-7 md:py-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-10 md:items-start">

          {/* FORMULARIO — orden 1 en mobile, derecha en desktop */}
          <div className="order-1 md:order-2 w-full md:w-[420px] md:shrink-0">
            <div
              className="rounded-2xl border border-white/10 bg-gray-900/90 p-6 md:p-8 backdrop-blur-sm"
              style={{ boxShadow: '0 0 0 1px rgba(139,92,246,0.15), 0 24px 64px rgba(0,0,0,0.6)' }}
            >
              {/* Encabezado del form */}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white leading-tight">
                  Activá tu suscripción
                </h2>
                <p className="text-white/60 text-sm mt-1">
                  Completá tus datos y empezás hoy.
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate>
                <LeadFormFields
                  formData={formData}
                  handleInputChange={handleInputChange}
                  isLoading={isLoading}
                  acepta={acepta}
                  handleCheckboxChange={handleCheckboxChange}
                />

                {error && (
                  <div className="mt-4 rounded-xl border border-red-700/50 bg-red-950/60 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                )}

                {/* CTA */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-6 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-[18px] text-lg font-bold text-white transition-all hover:from-violet-500 hover:to-fuchsia-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
                  style={{ boxShadow: '0 4px 24px rgba(139,92,246,0.45)' }}
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

                {/* Microcopy bajo el botón */}
                <p className="mt-3 text-center text-[12px] text-white/50">
                  Pago seguro · $U 390/mes · Cancelás cuando quieras
                </p>

                {/* Trust strip integrada — visible cerca del CTA */}
                <div className="mt-5 pt-5 border-t border-white/8 grid grid-cols-2 gap-2.5">
                  {[
                    { icon: <Shield size={13} />, text: 'Datos protegidos' },
                    { icon: <Zap size={13} />, text: 'Primer mensaje hoy' },
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

          {/* INFO DEL PRODUCTO — orden 2 en mobile, izquierda en desktop */}
          <div className="order-2 md:order-1 flex-1 space-y-5 min-w-0">

            <WAPreview />

            {/* Cómo funciona */}
            <div className="rounded-2xl border border-white/8 bg-gray-900/50 p-5 backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-4">
                ¿Cómo funciona?
              </p>
              <div className="space-y-5">
                {[
                  {
                    n: '1',
                    title: 'Completás el formulario',
                    desc: 'Nombre, signo, foco y WhatsApp. Un minuto.',
                  },
                  {
                    n: '2',
                    title: 'Confirmás tu WhatsApp',
                    desc: 'Te enviamos un mensaje de bienvenida. Lo respondés para activar.',
                  },
                  {
                    n: '3',
                    title: 'Recibís tu guía cada mañana',
                    desc: 'Directo a WhatsApp. Sin apps. Sin spam.',
                  },
                ].map(step => (
                  <div key={step.n} className="flex gap-4 items-start">
                    <div className="text-xl font-extrabold text-violet-500/80 leading-none w-5 shrink-0 mt-0.5">
                      {step.n}
                    </div>
                    <div>
                      <p className="text-white/90 font-semibold text-sm">{step.title}</p>
                      <p className="text-white/60 text-sm mt-0.5 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
