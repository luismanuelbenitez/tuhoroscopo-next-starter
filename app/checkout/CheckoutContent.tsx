'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { Loader2, Lock, Shield, Sparkles, CheckCircle2, MessageCircle, Tag, X } from 'lucide-react';
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

interface DescuentoAplicado {
  codigo: string;
  codigo_id: string;
  tipo_descuento: string;
  precio_original: number;
  precio_aplicado: number;
  valor_descuento_aplicado: number;
  mensaje_usuario: string;
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
  const [codigoInput, setCodigoInput] = useState('');
  const [codigoLoading, setCodigoLoading] = useState(false);
  const [codigoError, setCodigoError] = useState<string | null>(null);
  const [descuento, setDescuento] = useState<DescuentoAplicado | null>(null);

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

  const handleAplicarCodigo = async () => {
    const codigo = codigoInput.trim().toUpperCase();
    if (!codigo) return;
    setCodigoLoading(true);
    setCodigoError(null);
    try {
      const res = await fetch('/api/validar-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, precio_base: 390 }),
      });
      const data = await res.json();
      if (data.ok) {
        setDescuento({ ...data, codigo });
      } else {
        setCodigoError(data.error || 'Código inválido o expirado');
      }
    } catch {
      setCodigoError('Error al verificar el código');
    } finally {
      setCodigoLoading(false);
    }
  };

  const handleRemoverCodigo = () => {
    setDescuento(null);
    setCodigoInput('');
    setCodigoError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!acepta) {
      setError('Necesitás aceptar la Política de Privacidad para continuar.');
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

      const payload: Record<string, unknown> = {
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
      if (descuento) {
        payload.codigo_descuento = descuento.codigo;
        payload.codigo_descuento_id = descuento.codigo_id;
      }

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
            Tu horóscopo, tu número de la suerte y tu consejo del día — personalizado y directo a WhatsApp.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            <span className="bg-violet-950/80 border border-violet-600/30 rounded-full px-4 py-1.5 font-bold text-white">
              $U 390<span className="text-white/55 font-normal">/mes · IVA incluido</span>
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

                    {/* Código de descuento */}
                    <div className="mt-4">
                      {descuento ? (
                        <div className="rounded-xl border border-green-700/40 bg-green-950/40 px-4 py-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold text-green-400 mb-0.5 flex items-center gap-1.5">
                              <Tag size={11} />
                              Descuento aplicado — {descuento.codigo}
                            </p>
                            <p className="text-[12px] text-white/65">{descuento.mensaje_usuario}</p>
                            <p className="text-sm font-bold text-white mt-1">
                              $U {descuento.precio_aplicado}
                              <span className="text-white/40 line-through ml-2 text-xs font-normal">
                                $U {descuento.precio_original}
                              </span>
                              <span className="text-white/55 text-xs font-normal">/mes</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoverCodigo}
                            disabled={isLoading}
                            className="text-white/40 hover:text-white/70 shrink-0 mt-0.5"
                            aria-label="Quitar código"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-[12px] text-white/45 mb-1.5">
                            ¿Tenés un código de descuento?
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={codigoInput}
                              onChange={e => {
                                setCodigoInput(e.target.value.toUpperCase());
                                setCodigoError(null);
                              }}
                              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAplicarCodigo())}
                              placeholder="TU-CODIGO"
                              className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                              style={{ background: 'rgba(88,40,180,0.07)' }}
                              disabled={isLoading || codigoLoading}
                              maxLength={32}
                            />
                            <button
                              type="button"
                              onClick={handleAplicarCodigo}
                              disabled={!codigoInput.trim() || isLoading || codigoLoading}
                              className="rounded-lg border border-violet-600/35 bg-violet-900/45 px-3 py-2 text-sm text-violet-300 font-semibold hover:bg-violet-900/75 transition-colors disabled:opacity-45"
                            >
                              {codigoLoading ? <Loader2 size={14} className="animate-spin" /> : 'Aplicar'}
                            </button>
                          </div>
                          {codigoError && (
                            <p className="mt-1.5 text-[12px] text-red-400">{codigoError}</p>
                          )}
                        </div>
                      )}
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
                        `Activar por $U ${descuento ? descuento.precio_aplicado : 390}/mes →`
                      )}
                    </button>

                    <p className="mt-2 text-center text-[11px]" style={{ color: 'rgba(251,191,36,0.38)' }}>
                      ✦ Cancelás cuando quieras. Sin trámites, sin llamadas.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-white/45">
                      <span className="flex items-center gap-1">
                        <Lock size={10} className="text-violet-400 shrink-0" />
                        <span>Procesado por <strong className="text-white/65 font-semibold">Mercado Pago</strong></span>
                      </span>
                      <span className="text-white/20">·</span>
                      <span>{descuento ? `$U ${descuento.precio_aplicado}/mes · IVA inc.` : '$U 390/mes · IVA inc.'}</span>
                      <span className="text-white/20">·</span>
                      <span>Cancelás cuando quieras</span>
                    </div>

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
                    { n: '1', title: 'Contanos sobre vos', desc: 'Nombre, signo y foco. Solo toma un minuto.' },
                    { n: '2', title: 'Activás en un clic', desc: 'Respondés nuestro primer mensaje y quedás activa.' },
                    { n: '3', title: 'Tu guía llega cada mañana', desc: 'Directo a WhatsApp. Sin apps, sin spam.' },
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
