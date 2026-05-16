'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { Loader2, Shield, Sparkles, CheckCircle2, MessageCircle } from 'lucide-react';
import LeadFormFields from '@/components/LeadFormFields';

// Colocar logo en: public/logo-thc.png
const LOGO_SRC = '/logo-thc.png';

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

// ── Separador entre secciones del mensaje ─────────────────────────────────────
function MsgDivider() {
  return <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '1px 0' }} />;
}

// ── Mockup WhatsApp ───────────────────────────────────────────────────────────
function WAPreview() {
  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: '#0b141a' }}>

      {/* Cabecera del chat */}
      <div
        className="flex items-center gap-3 px-4 py-2.5"
        style={{ background: '#202c33', borderBottom: '1px solid rgba(0,0,0,0.25)' }}
      >
        {/* Avatar con logo — fallback: círculo violeta si public/logo-thc.png no existe */}
        <div
          className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #5b21b6, #7c3aed)' }}
        >
          <img
            src={LOGO_SRC}
            alt="Tu Horóscopo Cósmico"
            className="w-full h-full object-cover"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight">Tu Horóscopo Cósmico</p>
          <p className="text-green-400 text-[11px]">en línea</p>
        </div>
        <span className="text-white/25 text-[11px] shrink-0">08:07</span>
      </div>

      {/* Área de chat */}
      <div style={{ padding: '12px 10px' }}>
        <div className="flex justify-start">

          {/* Burbuja — mensaje recibido */}
          <div
            className="rounded-2xl rounded-tl-none overflow-hidden"
            style={{ backgroundColor: '#202c33', maxWidth: '97%' }}
          >

            {/* Banner "TU MENSAJE DE HOY" */}
            <div
              className="text-center"
              style={{
                padding: '14px 16px 11px',
                background: 'linear-gradient(160deg, #2d1b69 0%, #1e0f4a 45%, #0f0820 100%)',
                borderBottom: '2px solid rgba(251,191,36,0.22)',
              }}
            >
              <p style={{ color: 'rgba(251,191,36,0.55)', fontSize: '10px', letterSpacing: '0.3em', marginBottom: '6px' }}>
                ☽ &nbsp; ✦ &nbsp; ☾
              </p>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: '16px', lineHeight: 1.2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Tu mensaje de hoy
              </p>
              <p style={{ color: 'rgba(251,191,36,0.35)', fontSize: '10px', letterSpacing: '0.25em', marginTop: '6px' }}>
                ✦ &nbsp; · &nbsp; ✦
              </p>
            </div>

            {/* Cuerpo */}
            <div style={{ padding: '12px 14px 8px', display: 'flex', flexDirection: 'column', gap: '7px' }}>

              <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: '13.5px', lineHeight: 1.45 }}>
                Hola María ✨
              </p>

              <MsgDivider />

              <div>
                <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: '13.5px', fontWeight: 600 }}>🌐 Horóscopo</p>
                <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: '13px', lineHeight: 1.5, marginTop: '2px' }}>
                  Hoy tu energía te invita a soltar lo que venís cargando. Enfocate en una sola cosa y hacela bien.
                </p>
              </div>

              <MsgDivider />

              <div>
                <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: '13.5px', fontWeight: 600 }}>💙 En foco</p>
                <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: '13px', lineHeight: 1.5, marginTop: '2px' }}>
                  En bienestar mental, bajá el ritmo antes de responder. Tu claridad aparece cuando dejás de correr.
                </p>
              </div>

              <MsgDivider />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '13px', lineHeight: 1.45 }}>
                  🔢 <strong style={{ fontWeight: 600 }}>Número:</strong>{' '}
                  <span style={{ color: 'rgba(196,181,253,0.95)' }}>7</span>{' '}
                  — conectá con tu intuición antes de decidir.
                </p>
                <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '13px', lineHeight: 1.45 }}>
                  🎨 <strong style={{ fontWeight: 600 }}>Color:</strong>{' '}
                  <span style={{ color: 'rgba(196,181,253,0.95)' }}>Violeta</span>{' '}
                  — conectá con tu calma interior.
                </p>
              </div>

              <MsgDivider />

              <div>
                <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: '13.5px', fontWeight: 600 }}>🧘 Pausa</p>
                <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: '13px', lineHeight: 1.5, marginTop: '2px' }}>
                  Respirá profundo tres veces antes de abrir el teléfono.
                </p>
              </div>

              <MsgDivider />

              <div>
                <p style={{ color: 'rgba(255,255,255,0.80)', fontSize: '13px' }}>✨ Estamos con vos</p>
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', marginTop: '2px' }}>
                  Si querés pausar los mensajes, escribí BAJA
                </p>
              </div>

              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', textAlign: 'right', marginTop: '2px' }}>
                08:07 ✓✓
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center pb-3" style={{ color: 'rgba(255,255,255,0.32)', fontSize: '11px' }}>
        Así llega tu mensaje cada mañana
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
    <>
      {/*
       * body: suprime fondo cósmico (estrellas, nebulosas) y el overlay fixed ::before.
       * header: el <Header /> global está vacío en esta ruta; se colapsa su py-6
       *   para que el hero empiece sin franja oscura vacía encima.
       * #checkout2-fields: tinte violeta sutil en inputs para salir del gris neutro.
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
        #checkout2-fields input,
        #checkout2-fields select {
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
                    <div id="checkout2-fields">
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
