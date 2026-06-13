'use client';

import { useState } from 'react';
import Link from 'next/link';
import ReactCountryFlag from 'react-country-flag';
import { ChevronDown, Lock, Tag, X, CheckCircle, AlertCircle } from 'lucide-react';

const GOLD = '#FFCE4D';
const GOLD_DIM = 'rgba(251,191,36,0.70)';
const PRECIO_BASE = 590;

const TEMAS = [
  { value: 'general',   label: '🧿 Situación general' },
  { value: 'amor',      label: '❤️  Amor y vínculos' },
  { value: 'trabajo',   label: '💼 Trabajo y proyectos' },
  { value: 'dinero',    label: '💰 Dinero y recursos' },
  { value: 'decision',  label: '🔮 Decisión personal' },
];

interface FormState {
  nombre: string;
  telefono: string;
  email: string;
  fecha_nacimiento: string;
  tema: string;
  pregunta: string;
}

interface DescuentoAplicado {
  uso_id: string;
  precio_aplicado: number;
  descuento_aplicado: number;
  tipo_descuento: string;
}

const EMPTY: FormState = {
  nombre: '',
  telefono: '',
  email: '',
  fecha_nacimiento: '',
  tema: '',
  pregunta: '',
};

const inputBase =
  'w-full rounded-xl bg-white/8 px-4 py-3 ring-1 ring-white/15 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/60 disabled:opacity-60';

export default function TarotCheckoutContent() {
  const [form, setForm]           = useState<FormState>(EMPTY);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [isLoading, setIsLoading]           = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  // Descuento
  const [codigoCampo, setCodigoCampo]         = useState('');
  const [codigoValidando, setCodigoValidando] = useState(false);
  const [codigoError, setCodigoError]         = useState<string | null>(null);
  const [descuento, setDescuento]             = useState<DescuentoAplicado | null>(null);

  const precioFinal = descuento?.precio_aplicado ?? PRECIO_BASE;

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleValidarCodigo() {
    const codigo = codigoCampo.trim().toUpperCase();
    if (!codigo) return;

    setCodigoValidando(true);
    setCodigoError(null);
    setDescuento(null);

    try {
      const res = await fetch('/api/tarot/validar-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo,
          moneda:      'UYU',
          precio_base: PRECIO_BASE,
          telefono:    form.telefono || undefined,
          email:       form.email    || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setCodigoError(data?.error ?? 'Error al validar el código.');
        return;
      }

      if (!data.valido) {
        setCodigoError(data.error ?? 'Código inválido o expirado.');
        return;
      }

      setDescuento({
        uso_id:             data.uso_id,
        precio_aplicado:    data.precio_aplicado,
        descuento_aplicado: data.descuento_aplicado,
        tipo_descuento:     data.tipo_descuento,
      });
    } catch {
      setCodigoError('No se pudo verificar el código. Intentá de nuevo.');
    } finally {
      setCodigoValidando(false);
    }
  }

  function handleQuitarCodigo() {
    setDescuento(null);
    setCodigoCampo('');
    setCodigoError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!aceptaTerminos) {
      setError('Necesitás aceptar los Términos del servicio para continuar.');
      return;
    }
    setError(null);
    setIsLoading(true);

    // Normalizar teléfono UY: 09XXXXXXX → +598XXXXXXXXX
    const phoneRaw = form.telefono.replace(/\D/g, '');
    const phone =
      phoneRaw.startsWith('0')
        ? `+598${phoneRaw.slice(1)}`
        : `+598${phoneRaw}`;

    const payload = {
      nombre_completo:  form.nombre.trim(),
      telefono:         phone,
      email:            form.email.trim() || null,
      fecha_nacimiento: form.fecha_nacimiento || null,
      tema:             form.tema,
      pregunta_usuario: form.pregunta.trim(),
      // Descuento (si se aplicó)
      codigo_descuento_uso_id: descuento?.uso_id ?? null,
      precio_final:            precioFinal,
      moneda:                  'UYU',
    };

    try {
      const res = await fetch('/api/tarot/crear-orden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        // Si el cupón expiró o ya no está reservado, limpiar el estado para que el usuario pueda re-aplicarlo
        if (data?.error === 'CODIGO_DESCUENTO_EXPIRADO' || data?.error === 'CODIGO_DESCUENTO_NO_RESERVADO') {
          setDescuento(null);
          setCodigoError('El código expiró. Volvé a aplicarlo antes de continuar.');
        }
        throw new Error(data?.message ?? data?.error ?? 'Error al crear la orden.');
      }
      if (data?.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error('No se recibió la URL de pago.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado. Intentá de nuevo.');
      setIsLoading(false);
    }
  }

  return (
    <>
      <style jsx global>{`
        body {
          background-image: none !important;
          background-color: #0e0b22 !important;
        }
        body::before { display: none !important; }
      `}</style>

      <div
        className="min-h-screen text-white"
        style={{ background: 'linear-gradient(180deg, #110927 0%, #0d0820 55%, #0e0b22 100%)' }}
      >
        {/* Gold glow top */}
        <div
          className="pointer-events-none fixed inset-x-0 top-0 h-72 z-0"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(251,191,36,0.07), transparent)' }}
        />

        <div className="relative z-[1] mx-auto max-w-5xl px-4 py-8 md:py-12">

          {/* Back link */}
          <Link
            href={'/tarot' as never}
            className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors mb-8"
          >
            ← Volver al inicio
          </Link>

          <div className="flex flex-col md:flex-row gap-8 md:gap-12 md:items-start">

            {/* ── Formulario ─────────────────────────────────────── */}
            <div className="flex-1">
              <div className="mb-6">
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: GOLD_DIM }}
                >
                  Tu consulta de tarot
                </p>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                  Completá tu consulta
                </h1>
                <p className="text-white/55 text-sm mt-2">
                  Cuanto más precisa sea tu pregunta, más útil será la lectura.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Nombre */}
                <div>
                  <label htmlFor="nombre" className="block text-sm text-white/80 mb-1">
                    Tu nombre <span className="text-white/35">(requerido)</span>
                  </label>
                  <input
                    id="nombre"
                    name="nombre"
                    className={inputBase}
                    placeholder="¿Cómo te llamás?"
                    value={form.nombre}
                    onChange={handleChange}
                    disabled={isLoading}
                    required
                  />
                </div>

                {/* Teléfono */}
                <div>
                  <label htmlFor="telefono" className="block text-sm text-white/80 mb-1">
                    Tu WhatsApp <span className="text-white/35">(requerido)</span>
                  </label>
                  <div className="flex gap-2 items-center">
                    <div className="flex items-center gap-2 rounded-xl bg-white/8 px-3 ring-1 ring-white/15 h-[52px] shrink-0">
                      <ReactCountryFlag
                        countryCode="UY"
                        svg
                        style={{ width: '24px', height: '18px', borderRadius: '2px' }}
                        title="Uruguay"
                        className="shadow-sm"
                      />
                      <span className="text-white/70 font-medium tracking-wide">+598</span>
                    </div>
                    <input
                      id="telefono"
                      name="telefono"
                      className="flex-1 rounded-xl bg-white/8 px-4 py-3 h-[52px] ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-amber-400/60 placeholder:text-white/40 disabled:opacity-60 text-white"
                      placeholder="099123456"
                      inputMode="numeric"
                      value={form.telefono}
                      onChange={handleChange}
                      disabled={isLoading}
                      required
                      pattern="09\d{7}"
                      title="Ingresá tu celular uruguayo sin el +598 (ej: 091234567)"
                    />
                  </div>
                  <p className="mt-1 text-xs text-white/45">Acá recibís la lectura.</p>
                </div>

                {/* Email (opcional) */}
                <div>
                  <label htmlFor="email" className="block text-sm text-white/80 mb-1">
                    Email <span className="text-white/35">(opcional)</span>
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    className={inputBase}
                    placeholder="tu@email.com"
                    value={form.email}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </div>

                {/* Fecha de nacimiento (opcional) */}
                <div>
                  <label htmlFor="fecha_nacimiento" className="block text-sm text-white/80 mb-1">
                    Fecha de nacimiento <span className="text-white/35">(opcional — ayuda a personalizar)</span>
                  </label>
                  <input
                    id="fecha_nacimiento"
                    name="fecha_nacimiento"
                    type="date"
                    className={`${inputBase} [color-scheme:dark]`}
                    value={form.fecha_nacimiento}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </div>

                {/* Tema */}
                <div className="relative">
                  <label htmlFor="tema" className="block text-sm text-white/80 mb-1">
                    Tema de la consulta <span className="text-white/35">(requerido)</span>
                  </label>
                  <select
                    id="tema"
                    name="tema"
                    className={`${inputBase} appearance-none pr-10`}
                    value={form.tema}
                    onChange={handleChange}
                    disabled={isLoading}
                    required
                  >
                    <option value="" disabled>Elegí un área</option>
                    {TEMAS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-9 h-5 w-5 text-white/50 pointer-events-none" />
                </div>

                {/* Pregunta */}
                <div>
                  <label htmlFor="pregunta" className="block text-sm text-white/80 mb-1">
                    Tu pregunta <span className="text-white/35">(requerido)</span>
                  </label>
                  <textarea
                    id="pregunta"
                    name="pregunta"
                    rows={4}
                    className={`${inputBase} resize-none`}
                    placeholder="Escribí lo que querés consultar. Cuanto más específica, mejor la lectura. Ej: ¿Debo aceptar esta propuesta de trabajo?"
                    value={form.pregunta}
                    onChange={handleChange}
                    disabled={isLoading}
                    required
                    maxLength={500}
                  />
                  <p className="mt-1 text-xs text-white/35 text-right">{form.pregunta.length}/500</p>
                </div>

                {/* ── Código de descuento ──────────────────────────── */}
                <div
                  className="rounded-xl p-4"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: GOLD_DIM }}>
                    <Tag size={12} />
                    Código de descuento
                    <span className="text-white/25 font-normal normal-case tracking-normal">(opcional)</span>
                  </p>

                  {descuento ? (
                    /* Código aplicado */
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-emerald-400">
                        <CheckCircle size={16} className="shrink-0" />
                        <span>
                          <span className="font-semibold">{codigoCampo}</span>
                          {' — '}
                          <span>
                            {descuento.tipo_descuento === 'porcentaje'
                              ? `${Math.round((descuento.descuento_aplicado / PRECIO_BASE) * 100)}% de descuento`
                              : `$U ${descuento.descuento_aplicado} de descuento`}
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleQuitarCodigo}
                        disabled={isLoading}
                        className="text-white/40 hover:text-white/70 transition-colors shrink-0"
                        aria-label="Quitar código"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    /* Input para ingresar código */
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 rounded-xl bg-white/8 px-4 py-2.5 ring-1 ring-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-amber-400/60 disabled:opacity-60 text-sm uppercase tracking-widest"
                        placeholder="TU-CODIGO"
                        value={codigoCampo}
                        onChange={e => {
                          setCodigoCampo(e.target.value.toUpperCase());
                          setCodigoError(null);
                        }}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleValidarCodigo())}
                        disabled={isLoading || codigoValidando}
                        maxLength={50}
                        spellCheck={false}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={handleValidarCodigo}
                        disabled={!codigoCampo.trim() || isLoading || codigoValidando}
                        className="rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        style={{ background: 'rgba(251,191,36,0.15)', color: GOLD, border: '1px solid rgba(251,191,36,0.3)' }}
                      >
                        {codigoValidando ? '...' : 'Aplicar'}
                      </button>
                    </div>
                  )}

                  {codigoError && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
                      <AlertCircle size={12} className="shrink-0" />
                      {codigoError}
                    </div>
                  )}
                </div>

                {/* Checkbox */}
                <div className="pt-1">
                  <label className="flex items-start gap-2 text-sm text-white/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aceptaTerminos}
                      onChange={e => setAceptaTerminos(e.target.checked)}
                      disabled={isLoading}
                      required
                      className="mt-0.5 accent-amber-400 shrink-0"
                    />
                    <span>
                      Leí y acepto la{' '}
                      <a href="/politica-de-privacidad" target="_blank" rel="noreferrer" className="underline hover:text-amber-300 transition-colors">
                        Política de privacidad
                      </a>{' '}
                      y los{' '}
                      <a href="/terminos-del-servicio" target="_blank" rel="noreferrer" className="underline hover:text-amber-300 transition-colors">
                        Términos del servicio
                      </a>
                      , incluyendo que la lectura es generada por IA con fines simbólicos.
                    </span>
                  </label>
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-xl px-4 py-3 text-sm text-red-300 bg-red-900/20 border border-red-500/25">
                    {error}
                  </div>
                )}

                {/* Submit */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full rounded-xl py-4 text-base font-bold transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                      background: 'linear-gradient(135deg, #d4a017 0%, #FFCE4D 60%, #f0c840 100%)',
                      color: '#0f0820',
                      boxShadow: '0 4px 20px rgba(251,191,36,0.28)',
                    }}
                  >
                    {isLoading ? 'Procesando...' : 'Ir al pago →'}
                  </button>

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-white/40">
                    <span className="flex items-center gap-1">
                      <Lock size={10} style={{ color: GOLD_DIM }} className="shrink-0" />
                      <span>Procesado por <strong className="text-white/60 font-semibold">Mercado Pago</strong></span>
                    </span>
                    <span className="text-white/20">·</span>
                    <span>
                      {descuento ? (
                        <>
                          <span className="line-through text-white/25 mr-1">${PRECIO_BASE}</span>
                          <span className="text-emerald-400 font-semibold">$U {precioFinal}</span>
                        </>
                      ) : (
                        `$U ${PRECIO_BASE}`
                      )}{' '}
                      · IVA incluido
                    </span>
                    <span className="text-white/20">·</span>
                    <span>Pago único</span>
                  </div>
                </div>

              </form>
            </div>

            {/* ── Sidebar ────────────────────────────────────────── */}
            <div className="w-full md:w-72 shrink-0 space-y-4">

              {/* Resumen */}
              <div
                className="rounded-2xl p-5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(251,191,36,0.18)' }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: GOLD_DIM }}>
                  Tu lectura incluye
                </p>
                <div className="space-y-2.5">
                  {[
                    { emoji: '🃏', text: 'Tirada de 5 cartas (Cruz Celta)' },
                    { emoji: '✍️', text: 'Lectura narrativa personalizada' },
                    { emoji: '💬', text: 'Entrega por WhatsApp' },
                    { emoji: '⏱️', text: 'En menos de 15 minutos' },
                    { emoji: '📎', text: 'Pago único · Sin suscripción' },
                  ].map(item => (
                    <div key={item.text} className="flex items-start gap-2">
                      <span className="text-sm leading-none mt-0.5 shrink-0">{item.emoji}</span>
                      <span className="text-white/65 text-sm leading-snug">{item.text}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 pt-4 border-t border-white/8">
                  <div className="flex items-end justify-between">
                    <span className="text-white/50 text-sm">Total</span>
                    <div className="text-right">
                      {descuento ? (
                        <>
                          <span className="text-sm line-through text-white/30 mr-2">$U {PRECIO_BASE}</span>
                          <span className="text-2xl font-extrabold text-emerald-400">$U {precioFinal}</span>
                        </>
                      ) : (
                        <span className="text-2xl font-extrabold text-white">$U {PRECIO_BASE}</span>
                      )}
                      <p className="text-[11px] text-white/40">IVA incluido</p>
                    </div>
                  </div>
                  {descuento && (
                    <div className="mt-2 rounded-lg px-3 py-1.5 text-xs text-emerald-400 bg-emerald-400/8 border border-emerald-400/20 flex items-center gap-1.5">
                      <Tag size={11} className="shrink-0" />
                      Ahorrás $U {descuento.descuento_aplicado}
                    </div>
                  )}
                </div>
              </div>

              {/* Cómo funciona */}
              <div
                className="rounded-2xl p-5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: GOLD_DIM }}>
                  ¿Qué pasa después?
                </p>
                <ol className="space-y-2.5">
                  {[
                    'Confirmás el pago en Mercado Pago.',
                    'Generamos tu lectura con IA.',
                    'La recibís por WhatsApp en minutos.',
                  ].map((step, i) => (
                    <li key={i} className="flex gap-2 items-start text-sm text-white/60">
                      <span
                        className="text-xs font-bold shrink-0 mt-0.5"
                        style={{ color: GOLD_DIM }}
                      >
                        {i + 1}.
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
