'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import ReactCountryFlag from 'react-country-flag';
import {
  ChevronDown, Lock, Tag, X, CheckCircle, AlertCircle, MessageCircle,
  ArrowLeft, User, Mail, Calendar, List, PenLine, Zap, Sparkles,
} from 'lucide-react';
import { getStoredAttribution, getOrCreateSessionId } from '@/lib/analytics';
import { GOLD, SERIF, CREMA, CTA_GRADIENT } from '@/components/home/theme';
import { PaginaMarca } from '@/components/marca/PaginaMarca';
import { HeaderMarca } from '@/components/marca/HeaderMarca';
import { ResumenCompra, ResumenCompacto } from '@/components/tarot/checkout/ResumenCompra';
import { QuePasaDespues } from '@/components/tarot/checkout/QuePasaDespues';
import { Etiqueta, ConIcono, Paso, inputCheckout, inputBg } from '@/components/tarot/checkout/CampoCheckout';
import { FondoCheckout } from '@/components/tarot/checkout/FondoCheckout';
import { metaInitiateCheckout } from '@/lib/metaPixel';
// Meta InitiateCheckout se dispara recién cuando existe una orden real creada
// (ver handleSubmit) — NO al montar la página. Ver docs/product/DECISIONS.md
// 2026-08-22 ("Meta funnel V1 — InitiateCheckout en el pago, no en la visita").

const MP_LOGO = '/img/tarot/generales/MP_RGB_HANDSHAKE_pluma_horizontal.png';
const TEXT_SHADOW = '0 2px 14px rgba(0,0,0,0.65)';
// PRECIO_BASE is now passed as prop from the server page

const PAISES = [
  { codigo: 'UY', bandera: '🇺🇾', prefijo: '+598', placeholder: '091234567',
    hint: 'Acá recibís la lectura. Ej: 091234567', maxDigits: 9 },
];

const TEMAS = [
  { value: 'general',   label: '🧿 Situación general' },
  { value: 'amor',      label: '❤️  Amor y vínculos' },
  { value: 'trabajo',   label: '💼 Trabajo y proyectos' },
  { value: 'dinero',    label: '💰 Dinero y recursos' },
  { value: 'salud',     label: '🌿 Salud y bienestar' },
  { value: 'decision',  label: '🔮 Decisión personal' },
];

const EJEMPLOS_POR_TEMA: Record<string, string> = {
  '':        '¿Debo aceptar esta propuesta de trabajo? · ¿Tiene futuro esta relación?',
  general:   '¿Qué energía me acompaña en este momento de mi vida?',
  amor:      '¿Tiene futuro esta relación? · ¿Es el momento de dar el siguiente paso?',
  trabajo:   '¿Debo aceptar esta propuesta? · ¿Qué me frena en mi carrera?',
  dinero:    '¿Qué bloquea mi prosperidad? · ¿Es buen momento para esta inversión?',
  salud:     '¿Qué necesita mi cuerpo o mi mente en este momento? · ¿Cómo recupero el equilibrio?',
  decision:  '¿Cuál es el camino correcto para mí ahora? · ¿Estoy listo para este cambio?',
};

// Valor por tema que se envía como pregunta_usuario cuando el cliente NO
// escribió nada (2026-09-27, ajustado 2026-09-27: ya no se muestra en el
// textarea — ver decisión "no toques código" en docs/product/DECISIONS.md.
// El textarea queda 100% en blanco hasta que el cliente escribe; esto solo
// define qué mandamos al backend en su lugar). "general" manda la
// combinación clásica (Salud, Dinero y Amor) porque le da a la IA una base
// temática real; los demás repiten la etiqueta del tema — redundante con el
// campo `tema` que la IA ya recibe por separado, pero da un piso mínimo de
// contexto en vez de mandar `null`.
const PREGUNTA_POR_TEMA: Record<string, string> = {
  general:  'Salud, Dinero y Amor',
  amor:     'Amor y vínculos',
  trabajo:  'Trabajo y proyectos',
  dinero:   'Dinero y recursos',
  salud:    'Salud y bienestar',
  decision: 'Decisión personal',
};

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
  // Cortesía (2026-10-18): lo decide el servidor (flag del código en
  // tarot_codigos_descuento), nunca el frontend.
  orden_gratuita: boolean;
}

const EMPTY: FormState = {
  nombre: '',
  telefono: '',
  email: '',
  fecha_nacimiento: '',
  tema: '',
  pregunta: '',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function telefonoValido(raw: string, pais: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (pais === 'UY') return /^09\d{7}$/.test(digits);
  if (pais === 'AR') return /^\d{10,11}$/.test(digits);
  return false;
}

function formatearTelefono(raw: string, pais: string): string {
  const digits = raw.replace(/\D/g, '');
  if (pais === 'UY' && digits.length === 9 && digits.startsWith('09')) {
    const sin0 = digits.slice(1);
    return `+598 ${sin0.slice(0, 2)} ${sin0.slice(2, 5)} ${sin0.slice(5)}`;
  }
  if (pais === 'AR' && digits.length >= 10) {
    return `+549 ${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return '';
}

export default function TarotCheckoutContent({
  temaInicial, precioBase, codigoInicial, nombreInicial, nacimientoInicial,
}: { temaInicial?: string; precioBase: number | null; codigoInicial?: string; nombreInicial?: string; nacimientoInicial?: string }) {
  const PRECIO_BASE = precioBase;
  // El precio no pudo verificarse contra la fuente canónica (tarot_configuracion.precio_base_uyu)
  // — no se muestra ni se permite pagar un precio no verificado (ver docs/product/DECISIONS.md).
  const precioNoDisponible = PRECIO_BASE === null;
  const temaValido = TEMAS.some(t => t.value === temaInicial) ? temaInicial! : '';
  // Precarga desde la URL (?nombre=&nacimiento=), usada por "Hacer otra
  // lectura" en /lectura (2026-10-18). Solo rellena campos editables; WhatsApp
  // y email NUNCA viajan en la URL (datos personales en logs/analytics).
  const nombreUrl = (nombreInicial ?? '').trim().slice(0, 100);
  const nacimientoUrl = /^\d{4}-\d{2}-\d{2}$/.test(nacimientoInicial ?? '') ? nacimientoInicial! : '';
  const [form, setForm]           = useState<FormState>({ ...EMPTY, tema: temaValido, nombre: nombreUrl, fecha_nacimiento: nacimientoUrl });
  const [pais, setPais]           = useState('UY');
  const paisInfo = PAISES.find(p => p.codigo === pais) ?? PAISES[0];
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [emailSolicitado, setEmailSolicitado] = useState(false);
  const [isLoading, setIsLoading]           = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  // Auto-activación del checkbox "recibir por email" (sprint de auditoría de
  // entrega, 2026-09-04): cuando el email pasa de inválido/vacío a válido, se
  // activa solo — pero deja de intentarlo en cuanto el usuario toca el switch
  // con la mano, en cualquier dirección, para no pelear contra una elección
  // manual en cada tecla (ver docs/product/DECISIONS.md).
  const emailEraValidoRef = useRef(false);
  const [emailEligioManualmente, setEmailEligioManualmente] = useState(false);
  useEffect(() => {
    const esValido = EMAIL_RE.test(form.email.trim());
    if (esValido && !emailEraValidoRef.current && !emailEligioManualmente) {
      setEmailSolicitado(true);
    }
    emailEraValidoRef.current = esValido;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.email]);

  // Descuento
  // Código precargado desde la URL (?codigo=…), p.ej. la oferta VOLVE20 de
  // /lectura cuando el acceso online venció (2026-10-17). Se valida recién
  // cuando hay un WhatsApp válido: así ef_tarot_validar_codigo controla el
  // límite de usos POR CLIENTE (sin teléfono/email ese control no corre).
  const codigoDesdeUrl = (codigoInicial ?? '').trim().toUpperCase();
  const codigoInicialValido = /^[A-Z0-9-]{3,50}$/.test(codigoDesdeUrl) ? codigoDesdeUrl : '';
  const [codigoCampo, setCodigoCampo]         = useState(codigoInicialValido);
  const autoAplicadoRef = useRef(false);
  const [codigoValidando, setCodigoValidando] = useState(false);
  const [codigoError, setCodigoError]         = useState<string | null>(null);
  const [descuento, setDescuento]             = useState<DescuentoAplicado | null>(null);

  const precioFinal = descuento?.precio_aplicado ?? PRECIO_BASE;
  // Lectura de cortesía: total $0 sin Mercado Pago. Solo cambia la UI; la
  // autorización se vuelve a verificar al crear la orden.
  const esCortesia = descuento?.orden_gratuita === true && precioFinal === 0;

  useEffect(() => {
    if (PRECIO_BASE === null) return; // sin precio verificado no reportamos analytics con un valor inventado
    // GA4 begin_checkout / funnel_events checkout_started: "el usuario
    // aterrizó en la página de checkout" (ver docstring de trackBeginCheckout
    // en lib/analytics.ts) — semántica deliberada, distinta de Meta
    // InitiateCheckout, no se cambia acá.
    import('@/lib/analytics').then(({ trackBeginCheckout }) => {
      trackBeginCheckout('tarot', PRECIO_BASE);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleValidarCodigo() {
    const codigo = codigoCampo.trim().toUpperCase();
    if (!codigo) return;
    if (PRECIO_BASE === null) {
      setCodigoError('El precio no está disponible ahora mismo. Volvé a intentar en unos minutos.');
      return;
    }

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
        orden_gratuita:     data.orden_gratuita === true,
      });
    } catch {
      setCodigoError('No se pudo verificar el código. Intentá de nuevo.');
    } finally {
      setCodigoValidando(false);
    }
  }

  useEffect(() => {
    if (!codigoInicialValido || autoAplicadoRef.current || descuento || codigoValidando) return;
    if (!telefonoValido(form.telefono, pais)) return;
    autoAplicadoRef.current = true;
    handleValidarCodigo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.telefono, pais]);

  function handleQuitarCodigo() {
    setDescuento(null);
    setCodigoCampo('');
    setCodigoError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (PRECIO_BASE === null) {
      setError('El precio no está disponible ahora mismo. Recargá la página o volvé a intentar en unos minutos.');
      return;
    }
    if (!aceptaTerminos) {
      setError('Necesitás aceptar los Términos del servicio para continuar.');
      return;
    }
    if (emailSolicitado && !EMAIL_RE.test(form.email.trim())) {
      setError('Ingresá un email válido para recibir también tu lectura por ese medio.');
      return;
    }
    setError(null);
    setIsLoading(true);

    // Normalizar teléfono al formato internacional para WhatsApp
    const phoneRaw = form.telefono.replace(/\D/g, '');
    let phone: string;
    if (pais === 'UY') {
      phone = phoneRaw.startsWith('0') ? `+598${phoneRaw.slice(1)}` : `+598${phoneRaw}`;
    } else {
      // Argentina: +549 + número (el 9 es requerido por WhatsApp para móviles AR)
      phone = `+549${phoneRaw}`;
    }

    // Atribución capturada en storeAttributionFromUrl() al aterrizar en /tarot —
    // se reenvía recién ahora, al confirmar la orden, para no acoplar el
    // checkout a que el usuario haya llegado con UTMs en esta misma carga.
    const attribution = getStoredAttribution();

    const payload = {
      nombre_completo:  form.nombre.trim(),
      telefono:         phone,
      email:            form.email.trim() || null,
      email_solicitado: emailSolicitado,
      fecha_nacimiento: form.fecha_nacimiento || null,
      tema:             form.tema,
      // El textarea visible queda vacío hasta que el cliente escribe; si no
      // escribió nada, mandamos el valor por tema (PREGUNTA_POR_TEMA) en su
      // lugar, sin haberlo mostrado nunca en pantalla.
      pregunta_usuario: form.pregunta.trim() || PREGUNTA_POR_TEMA[form.tema] || null,
      // Descuento (si se aplicó)
      codigo_descuento_uso_id: descuento?.uso_id ?? null,
      precio_final:            precioFinal,
      moneda:                  'UYU',
      // Atribución — sin esto, tarot_ordenes.utm_* queda null y no hay forma
      // de medir CAC por campaña (ver docs/product/DECISIONS.md 2026-08-20).
      utm_source:        attribution?.utm_source   ?? null,
      utm_medium:        attribution?.utm_medium   ?? null,
      utm_campaign:      attribution?.utm_campaign ?? null,
      utm_content:       attribution?.utm_content  ?? null,
      utm_term:          attribution?.utm_term     ?? null,
      funnel_session_id: getOrCreateSessionId() || null,
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
      // Cortesía: orden gratuita ya creada y en generación — directo a
      // /tarot/gracias, sin Mercado Pago y sin InitiateCheckout (no hay pago).
      if (data?.gratuita === true && data?.redirect_url) {
        try {
          sessionStorage.setItem('tarotCheckoutData', JSON.stringify({
            nombre: form.nombre.trim(),
          }));
        } catch { /* non-blocking */ }
        window.location.href = data.redirect_url;
        return;
      }
      if (data?.init_point) {
        try {
          sessionStorage.setItem('tarotCheckoutData', JSON.stringify({
            nombre: form.nombre.trim(),
          }));
        } catch { /* non-blocking */ }
        // Meta InitiateCheckout: recién acá existe una orden real (con
        // preferencia de Mercado Pago generada) — es el punto más cercano al
        // inicio real del pago sin arriesgar reportar un intento que nunca
        // llegó a ser una orden válida (ver docs/product/DECISIONS.md
        // 2026-08-22). value = precioFinal (con descuento si se aplicó),
        // igual criterio que usa Purchase más adelante con precio_cobrado.
        metaInitiateCheckout(precioFinal ?? 0);
        window.location.href = data.init_point;
      } else {
        throw new Error('No se recibió la URL de pago.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado. Intentá de nuevo.');
      setIsLoading(false);
    }
  }

  // Mismo esquema que Home y /tarot (PaginaMarca → escenario → header →
  // contenido). Solo presentación: todos los handlers y estados de arriba
  // son los mismos de antes del rediseño.
  return (
    <PaginaMarca fondo={<FondoCheckout />}>
      <div className="relative">
        <HeaderMarca variante="minimo" />

        <div className="relative px-5 md:px-8 pt-6 pb-10 md:pb-14">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_330px] gap-8 md:gap-7 md:items-start">

            {/* ── Columna formulario ─────────────────────────────── */}
            <div className="min-w-0">
              <Link
                href={'/tarot' as never}
                className="inline-flex items-center gap-1.5 text-[13px] text-white/60 hover:text-white transition-colors mb-6"
              >
                <ArrowLeft size={15} />
                Volver a Tarot
              </Link>

              {/* Velo oscuro detrás del título: el fondo tiene adornos (luna,
                  hojas) justo en esta zona — mismo recurso de legibilidad
                  que HeroTarot (text-shadow) más un degradé radial suave. */}
              <div className="relative isolate mb-6" style={{ textShadow: TEXT_SHADOW }}>
                <div
                  aria-hidden="true"
                  className="absolute -inset-x-8 -inset-y-6 -z-10 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse 75% 85% at 35% 50%, rgba(6,4,14,0.72), transparent 75%)' }}
                />
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: GOLD }}>
                  Tarot personalizado
                </p>
                <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(2rem, 4.2vw, 2.85rem)', lineHeight: 1.08, color: CREMA }}>
                  Completá tu experiencia
                </h1>
                <p className="text-white/75 text-[14.5px] leading-relaxed mt-3 max-w-[480px]">
                  Contanos un poco sobre vos y tu consulta. Podés hacer una pregunta puntual o simplemente recibir una lectura completa sobre tu momento actual.
                </p>
              </div>

              {/* Mobile: qué se compra y cuánto cuesta, antes del formulario. */}
              <div className="md:hidden mb-5">
                <ResumenCompacto
                  nombre={form.nombre}
                  precioBase={PRECIO_BASE}
                  precioFinal={precioNoDisponible ? null : precioFinal}
                  descuentoAplicado={descuento ? descuento.descuento_aplicado : null}
                />
              </div>

              <form
                onSubmit={handleSubmit}
                className="rounded-2xl p-5 md:p-6 space-y-5"
                style={{ background: 'rgba(12,7,24,0.78)', border: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(6px)', boxShadow: '0 18px 48px rgba(0,0,0,0.40)' }}
              >

                <Paso n={1} titulo="Tus datos" bajada="Así personalizamos tu lectura." />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">

                {/* Nombre */}
                <div>
                  <Etiqueta htmlFor="nombre" texto="Tu nombre" nota="requerido" />
                  <ConIcono Icon={User}>
                    <input
                      id="nombre"
                      name="nombre"
                      className={`${inputCheckout} pl-11`}
                      style={inputBg}
                      placeholder="¿Cómo te llamás?"
                      value={form.nombre}
                      onChange={handleChange}
                      disabled={isLoading}
                      required
                    />
                  </ConIcono>
                </div>

                {/* Teléfono */}
                <div>
                  <Etiqueta htmlFor="telefono" texto="Tu WhatsApp" nota="requerido" />
                  <div className="flex gap-2.5 items-center">
                    {/* Selector de país */}
                    <div className="relative shrink-0">
                      <select
                        value={pais}
                        onChange={e => {
                          setPais(e.target.value);
                          setForm(prev => ({ ...prev, telefono: '' }));
                        }}
                        disabled={isLoading}
                        aria-label="País"
                        className="appearance-none rounded-xl pl-4 pr-9 md:pl-3 md:pr-7 ring-1 ring-white/15 h-12 text-white/85 font-medium tracking-wide focus:outline-none focus:ring-2 focus:ring-[#F0C55A]/55 disabled:opacity-60 cursor-pointer text-[14px]"
                        style={inputBg}
                      >
                        {PAISES.map(p => (
                          <option key={p.codigo} value={p.codigo} style={{ background: '#1a0a3a', color: 'white' }}>
                            {p.codigo} {p.prefijo}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 md:right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <ConIcono Icon={MessageCircle} iconoClase="md:hidden">
                        <input
                          id="telefono"
                          name="telefono"
                          className={`${inputCheckout} pl-11 md:pl-4 ${
                            telefonoValido(form.telefono, pais)
                              ? '!ring-emerald-500/55 focus:!ring-emerald-400/60'
                              : ''
                          }`}
                          style={inputBg}
                          placeholder={paisInfo.placeholder}
                          inputMode="numeric"
                          value={form.telefono}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, paisInfo.maxDigits);
                            setForm(prev => ({ ...prev, telefono: digits }));
                          }}
                          disabled={isLoading}
                          required
                        />
                      </ConIcono>
                    </div>
                  </div>
                  {telefonoValido(form.telefono, pais) ? (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCircle size={12} className="shrink-0" />
                      <span>Número confirmado: <span className="font-semibold font-mono">{formatearTelefono(form.telefono, pais)}</span></span>
                    </div>
                  ) : form.telefono.length >= 3 ? (
                    <p className="mt-1.5 text-xs text-amber-300/80">
                      {pais === 'UY'
                        ? (form.telefono.length < 9
                            ? `Faltan ${9 - form.telefono.length} dígito${9 - form.telefono.length !== 1 ? 's' : ''}`
                            : 'El número debe comenzar con 09')
                        : (form.telefono.length < 10
                            ? `Faltan ${10 - form.telefono.length} dígito${10 - form.telefono.length !== 1 ? 's' : ''}`
                            : 'Ingresá el número sin el 0 inicial ni el 15')}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-white/55">{paisInfo.hint}</p>
                  )}
                </div>

                {/* Email (opcional, requerido solo si se pide como canal) */}
                <div>
                  <Etiqueta htmlFor="email" texto="Email" nota={emailSolicitado ? 'requerido' : 'opcional'}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={emailSolicitado}
                      aria-label="También quiero recibir mi lectura por email"
                      onClick={() => {
                        setEmailEligioManualmente(true);
                        setEmailSolicitado(v => !v);
                      }}
                      disabled={isLoading}
                      className="flex items-center gap-2 shrink-0 py-1.5 -my-1.5 disabled:opacity-50"
                    >
                      <span className="text-[12px] text-white/60 whitespace-nowrap">Recibir por email</span>
                      <span
                        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                        style={{ background: emailSolicitado ? GOLD : 'rgba(255,255,255,0.18)' }}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${emailSolicitado ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
                        />
                      </span>
                    </button>
                  </Etiqueta>
                  <ConIcono Icon={Mail}>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      className={`${inputCheckout} pl-11`}
                      style={inputBg}
                      placeholder="tu@email.com"
                      value={form.email}
                      onChange={handleChange}
                      disabled={isLoading}
                      required={emailSolicitado}
                    />
                  </ConIcono>
                </div>

                {/* Fecha de nacimiento (opcional) */}
                <div>
                  <Etiqueta htmlFor="fecha_nacimiento" texto="Fecha de nacimiento" nota="opcional" />
                  <ConIcono Icon={Calendar}>
                    <input
                      id="fecha_nacimiento"
                      name="fecha_nacimiento"
                      type="date"
                      className={`${inputCheckout} pl-11 [color-scheme:dark]`}
                      style={inputBg}
                      value={form.fecha_nacimiento}
                      onChange={handleChange}
                      disabled={isLoading}
                    />
                  </ConIcono>
                </div>
                </div>

                <Paso n={2} titulo="Tu consulta" bajada="Podés hacer una pregunta puntual o dejar que la lectura sea general." separado />

                {/* Tema */}
                <div>
                  <Etiqueta htmlFor="tema" texto="Tema de la consulta" nota="requerido" />
                  <div className="relative">
                    <ConIcono Icon={List}>
                      <select
                        id="tema"
                        name="tema"
                        className={`${inputCheckout} pl-11 pr-10 appearance-none cursor-pointer ${form.tema ? '' : 'text-white/40'}`}
                        style={inputBg}
                        value={form.tema}
                        onChange={handleChange}
                        disabled={isLoading}
                        required
                      >
                        <option value="" disabled style={{ background: '#1a0a3a' }}>Elegí un área</option>
                        {TEMAS.map(t => (
                          <option key={t.value} value={t.value} style={{ background: '#1a0a3a', color: 'white' }}>{t.label}</option>
                        ))}
                      </select>
                    </ConIcono>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none" />
                  </div>
                </div>

                {/* Pregunta (opcional) */}
                <div>
                  <Etiqueta htmlFor="pregunta" texto="Tu pregunta" nota="opcional" />
                  <ConIcono Icon={PenLine} arriba>
                    <textarea
                      id="pregunta"
                      name="pregunta"
                      rows={4}
                      className={`${inputCheckout} !h-auto pl-11 resize-none leading-relaxed`}
                      style={inputBg}
                      placeholder={`Si hay algo puntual que quieras explorar, contámelo. Si no, podés recibir una lectura abierta sobre tu momento actual.\nEj: ${EJEMPLOS_POR_TEMA[form.tema] ?? EJEMPLOS_POR_TEMA['']}`}
                      value={form.pregunta}
                      onChange={handleChange}
                      disabled={isLoading}
                      maxLength={500}
                    />
                  </ConIcono>
                  <p className="mt-1 text-xs text-white/45 text-right">{form.pregunta.length}/500</p>
                </div>

                <Paso n={3} titulo="Tu compra" bajada="Revisá y confirmá tu pago." separado />

                {/* ── Código de descuento ──────────────────────────── */}
                <div
                  className="rounded-xl p-4"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(240,197,90,0.20)' }}
                >
                  <p className="text-[13px] font-medium mb-3 flex items-center gap-1.5" style={{ color: GOLD }}>
                    <Tag size={14} />
                    Código de descuento
                    <span className="text-white/45 text-[12px] font-normal">(opcional)</span>
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
                            {descuento.tipo_descuento === 'porcentaje' && PRECIO_BASE !== null
                              ? `${Math.round((descuento.descuento_aplicado / PRECIO_BASE) * 100)}% de descuento`
                              : `$U ${descuento.descuento_aplicado} de descuento`}
                          </span>
                          {esCortesia && (
                            <span className="block text-[12px] text-white/60 mt-0.5">
                              Lectura de cortesía: no necesitás pagar.
                            </span>
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleQuitarCodigo}
                        disabled={isLoading}
                        className="text-white/50 hover:text-white/80 transition-colors shrink-0"
                        aria-label="Quitar código"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    /* Input para ingresar código */
                    <div className="flex gap-2.5">
                      <input
                        type="text"
                        aria-label="Código de descuento"
                        className="flex-1 min-w-0 rounded-xl px-4 h-11 ring-1 ring-white/15 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#F0C55A]/55 disabled:opacity-60 text-sm uppercase tracking-widest"
                        style={inputBg}
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
                        className="rounded-xl px-5 h-11 text-sm font-semibold transition-colors hover:bg-[#F0C55A]/15 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        style={{ color: GOLD, border: '1px solid rgba(240,197,90,0.45)' }}
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

                  {codigoInicialValido && !descuento && !codigoError && (
                    <p className="mt-2 text-xs" style={{ color: GOLD }}>
                      {codigoValidando
                        ? 'Aplicando tu código…'
                        : 'Tu código se aplica automáticamente al ingresar tu WhatsApp.'}
                    </p>
                  )}
                </div>

                {/* Checkbox */}
                <label className="flex items-start gap-3 text-[13.5px] text-white/75 cursor-pointer leading-relaxed">
                  <input
                    type="checkbox"
                    checked={aceptaTerminos}
                    onChange={e => setAceptaTerminos(e.target.checked)}
                    disabled={isLoading}
                    required
                    className="mt-1 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#F0C55A]"
                  />
                  <span>
                    Leí y acepto la{' '}
                    <a href="/politica-de-privacidad" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[#F0C55A] transition-colors">
                      Política de privacidad
                    </a>{' '}
                    y los{' '}
                    <a href="/terminos-del-servicio" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[#F0C55A] transition-colors">
                      Términos del servicio
                    </a>
                    , incluyendo que la lectura es generada por IA con fines simbólicos.
                  </span>
                </label>

                {/* Reassurance pre-pago */}
                <div
                  className="rounded-xl px-4 py-3.5 flex items-start gap-3"
                  style={{ background: 'rgba(240,197,90,0.06)', border: '1px solid rgba(240,197,90,0.40)' }}
                >
                  <Zap size={20} className="shrink-0 mt-0.5" style={{ color: GOLD }} fill={GOLD} />
                  <div>
                    <p className="text-[14px] font-semibold text-white/90">
                      Tu lectura llega por WhatsApp <span style={{ color: GOLD }}>en menos de 15 minutos</span>.
                    </p>
                    <p className="text-[12.5px] text-white/60 mt-0.5">
                      <span style={{ color: GOLD }}>✦</span> {esCortesia ? 'Sin cargo' : 'Pago único · Sin suscripción'} · Podés recibirla también por email.
                    </p>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-xl px-4 py-3 text-sm text-red-300 bg-red-900/20 border border-red-500/25">
                    {error}
                  </div>
                )}

                {/* Precio no disponible */}
                {precioNoDisponible && (
                  <div className="rounded-xl px-4 py-3 text-sm text-amber-200 bg-amber-900/15 border border-amber-500/25">
                    El precio no está disponible en este momento. Recargá la página en unos minutos para poder pagar.
                  </div>
                )}

                {/* Submit */}
                <div>
                  <button
                    type="submit"
                    disabled={isLoading || precioNoDisponible}
                    className="w-full rounded-xl py-4 text-[17px] font-bold flex items-center justify-center gap-2.5 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: CTA_GRADIENT, color: '#180e00', boxShadow: '0 6px 24px rgba(240,197,90,0.32)' }}
                  >
                    {!isLoading && !precioNoDisponible && (esCortesia
                      ? <Sparkles size={18} className="shrink-0" />
                      : <Lock size={18} className="shrink-0" />)}
                    {isLoading
                      ? 'Procesando...'
                      : precioNoDisponible
                        ? 'Precio no disponible'
                        : esCortesia
                          ? 'Obtener mi lectura →'
                          : `Pagar $U ${precioFinal} →`}
                  </button>

                  {esCortesia ? (
                    <p className="mt-3 text-center text-[12.5px] text-white/55">
                      Lectura de cortesía · Sin cargo · No se te pide ningún dato de pago
                    </p>
                  ) : (
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[12.5px] text-white/55">
                    <span className="flex items-center gap-1.5">
                      Procesado por
                      <img src={MP_LOGO} alt="Mercado Pago" style={{ height: 30, width: 'auto' }} />
                    </span>
                    <span className="text-white/25">·</span>
                    <span>Pago único</span>
                    <span className="text-white/25">·</span>
                    <span>Sin suscripción</span>
                  </div>
                  )}
                </div>

              </form>
            </div>

            {/* ── Columna lateral ────────────────────────────────── */}
            {/* Desktop: card completa + pasos. Mobile: solo los pasos, al final
                (el resumen compacto ya está arriba del formulario). */}
            <aside className="w-full space-y-5">
              <div className="hidden md:block">
              <ResumenCompra
                nombre={form.nombre}
                precioBase={PRECIO_BASE}
                precioFinal={precioNoDisponible ? null : precioFinal}
                descuentoAplicado={descuento ? descuento.descuento_aplicado : null}
              />
              </div>
              <QuePasaDespues />
            </aside>

          </div>
        </div>

        {/* Cierre simple, igual que /tarot (sin footer global). */}
        <style dangerouslySetInnerHTML={{ __html: "body > footer { display: none !important; }" }} />
        <p className="relative px-5 pb-10 mx-auto max-w-[560px] text-center text-[11.5px] leading-relaxed text-white/45">
          © {new Date().getFullYear()} Tu Oráculo · Operado por Luis Manuel Benítez Rodríguez · RUT 214998320016 · Uruguay. Todos los derechos reservados.
        </p>
      </div>
    </PaginaMarca>
  );
}
