'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronDown, Lock, Tag, X, Check, CheckCircle, AlertCircle, MessageCircle,
  ArrowLeft, User, Mail, PenLine, Zap, Sparkles, Loader2,
} from 'lucide-react';
import { cargarDiferidosYa, esperarTerceros } from '@/lib/cargaDiferida';
import { getStoredAttribution, getOrCreateSessionId, medirFormulario, trackCheckoutPaso, enviarEventosAhora } from '@/lib/analytics';
import { GOLD, SERIF, CREMA, CTA_GRADIENT } from '@/components/home/theme';
import { PaginaMarca } from '@/components/marca/PaginaMarca';
import { HeaderMarca } from '@/components/marca/HeaderMarca';
import { ResumenCompacto } from '@/components/tarot/checkout/ResumenCompra';
import { QuePasaDespues } from '@/components/tarot/checkout/QuePasaDespues';
import { Etiqueta, ConIcono, Paso, inputCheckout, inputBg } from '@/components/tarot/checkout/CampoCheckout';
import { FondoCheckout } from '@/components/tarot/checkout/FondoCheckout';
import { FechaNacimiento } from '@/components/tarot/checkout/FechaNacimiento';
import { PieMarca } from '@/components/marca/PieMarca';
import { LogoMercadoPago } from '@/components/tarot/LogoMercadoPago';
import { metaInitiateCheckout } from '@/lib/metaPixel';
import { googleAdsInicioCheckout } from '@/lib/googleAds';
import { linkWhatsApp } from '@/lib/contacto';
// Meta InitiateCheckout se dispara recién cuando existe una orden real creada
// (ver handleSubmit) — NO al montar la página. Ver docs/product/DECISIONS.md
// 2026-08-22 ("Meta funnel V1 — InitiateCheckout en el pago, no en la visita").

const TEXT_SHADOW = '0 2px 14px rgba(0,0,0,0.65)';
// PRECIO_BASE is now passed as prop from the server page

const PAISES = [
  { codigo: 'UY', bandera: '🇺🇾', prefijo: '+598', placeholder: '091234567',
    hint: 'Ahí te enviamos el acceso a tu lectura.', maxDigits: 9 },
];

const TEMAS = [
  { value: 'general',   emoji: '🧿', corto: 'Mi momento' },
  { value: 'amor',      emoji: '❤️', corto: 'Amor y vínculos' },
  { value: 'trabajo',   emoji: '💼', corto: 'Trabajo' },
  { value: 'dinero',    emoji: '💰', corto: 'Dinero' },
  { value: 'salud',     emoji: '🌿', corto: 'Salud y bienestar' },
  { value: 'decision',  emoji: '🔮', corto: 'Una decisión' },
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

const MENSAJES_CAMPO: Record<string, string> = {
  nombre: 'Escribí tu nombre.',
  telefono: 'Ingresá tu WhatsApp: ahí te llega la lectura.',
  tema: 'Elegí un tema para tu lectura.',
  acepta_terminos: 'Marcá la casilla para continuar.',
  email: 'Revisá tu email: no parece válido. Si no querés recibirla por email, dejalo vacío.',
};
const RING_ERROR = '!ring-red-400/60';

// Botón de pago por etapas (2026-11-06, Manuel): en vez de un "Procesando..."
// fijo, cuenta lo que pasa. "orden" rota sus textos mientras el servidor crea
// la orden; "pago" mientras se conecta con Mercado Pago; "listo" justo antes
// de salir. El ancho es la barrita de progreso del borde inferior.
type Fase = 'orden' | 'pago' | 'listo';
const TEXTOS_ORDEN = ['Preparando tu orden…', 'Guardando tu consulta…', 'Casi listo…'];
const TEXTOS_ORDEN_CORTESIA = ['Preparando tu lectura…', 'Guardando tu consulta…', 'Casi listo…'];
const PROGRESO: Record<Fase, { ancho: string; ms: number }> = {
  orden: { ancho: '55%', ms: 4500 },
  pago:  { ancho: '88%', ms: 900 },
  listo: { ancho: '100%', ms: 300 },
};
const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function ErrorCampo({ texto }: { texto?: string }) {
  if (!texto) return null;
  return (
    <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-red-300">
      <AlertCircle size={12} className="shrink-0" />
      {texto}
    </p>
  );
}

const EMAIL_RE =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function telefonoValido(raw: string, pais: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (pais === 'UY') return /^09\d{7}$/.test(digits);
  if (pais === 'AR') return /^\d{10,11}$/.test(digits);
  return false;
}

// Teléfono en formato internacional (E.164), tal como se envía al crear la
// orden. Se usa también al validar el código de descuento (2026-10-18) para
// que el cupo por cliente compare siempre el mismo formato.
function telefonoE164(raw: string, pais: string): string {
  const phoneRaw = raw.replace(/\D/g, '');
  if (pais === 'UY') {
    return phoneRaw.startsWith('0') ? `+598${phoneRaw.slice(1)}` : `+598${phoneRaw}`;
  }
  // Argentina: +549 + número (el 9 es requerido por WhatsApp para móviles AR)
  return `+549${phoneRaw}`;
}

// Autocompletar o pegar (2026-11-01): el teléfono puede llegar entero de
// golpe como "+598 99 123 456" o "99 123 456". Solo cuando entran varios
// dígitos a la vez se lleva al formato local 09XXXXXXX; tecleando no cambia nada.
function normalizarTelefonoPegado(valor: string, anterior: string, pais: string): string {
  const digits = valor.replace(/\D/g, '');
  if (pais !== 'UY' || digits.length - anterior.length < 2) return digits;
  if (digits.length === 11 && digits.startsWith('598')) return `0${digits.slice(3)}`;
  if (digits.length === 8 && digits.startsWith('9')) return `0${digits}`;
  return digits;
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
  temaInicial, precioBase, codigoInicial, nombreInicial, nacimientoInicial, waNumero = '',
}: { temaInicial?: string; precioBase: number | null; codigoInicial?: string; nombreInicial?: string; nacimientoInicial?: string; waNumero?: string }) {
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
  const [isLoading, setIsLoading]           = useState(false);
  // Bloqueo síncrono de doble envío: dos clics en el mismo tick llegan antes
  // de que isLoading deshabilite el botón (detectado en QA 2026-10-18).
  const enviandoRef = useRef(false);
  const [fase, setFase]                     = useState<Fase | null>(null);
  const [pasoOrden, setPasoOrden]           = useState(0);
  useEffect(() => {
    if (fase !== 'orden') return;
    setPasoOrden(0);
    const id = setInterval(() => setPasoOrden(n => Math.min(n + 1, TEXTOS_ORDEN.length - 1)), 1800);
    return () => clearInterval(id);
  }, [fase]);
  // Volver desde Mercado Pago con "atrás": el navegador puede restaurar la
  // página congelada con el botón en "Abriendo el pago…". Se reinicia.
  useEffect(() => {
    const alVolver = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      enviandoRef.current = false;
      setIsLoading(false);
      setFase(null);
    };
    window.addEventListener('pageshow', alVolver);
    return () => window.removeEventListener('pageshow', alVolver);
  }, []);
  const [error, setError]                   = useState<string | null>(null);
  // En el celular el aviso puede quedar fuera de la vista: se lleva la
  // pantalla hasta él (auditoría UX 2026-10-30, C6).
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  // Email (auditoría UX 2026-10-30, C3): sin interruptor "Recibir por email".
  // Si la persona escribe un email, se lo pide también por ese canal; vacío,
  // solo WhatsApp. Reemplaza el switch con auto-activación de 2026-09-04
  // (interruptor + campo para lo mismo generaba la duda de completar ambos).
  const emailSolicitado = form.email.trim() !== '';

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
  // Campo del código plegado detrás de un link (auditoría UX 2026-10-30, C1):
  // un cupón visible hace que quien no tiene uno salga a buscarlo. Abierto de
  // entrada si el código vino en la URL.
  const [cuponAbierto, setCuponAbierto]       = useState(!!codigoInicialValido);
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
    // Google Ads, acción secundaria (solo observación): mismo punto.
    googleAdsInicioCheckout(PRECIO_BASE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Analista de conversión (2026-11-01): dónde se frena la gente dentro del
  // formulario. Solo escucha (nombres de campo, nunca lo escrito); no cambia
  // ningún comportamiento del checkout.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => (formRef.current ? medirFormulario(formRef.current) : undefined), []);

  // Tema tocado antes de que la página termine de cargar (2026-11-06): el
  // botón se marca solo con CSS (radio nativo), y acá se pasa al estado para
  // que no haya que tocarlo de nuevo.
  useEffect(() => {
    const marcado = formRef.current?.querySelector<HTMLInputElement>('input[name="tema"]:checked');
    if (marcado && TEMAS.some(t => t.value === marcado.value)) {
      setForm(prev => (prev.tema ? prev : { ...prev, tema: marcado.value }));
    }
  }, []);

  // La pregunta crece con lo escrito, hasta ~12 líneas (2026-11-01).
  const preguntaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = preguntaRef.current;
    if (!el) return;
    // 'important': la clase !h-auto del campo le gana a un style.height común.
    el.style.removeProperty('height');
    if (form.pregunta) el.style.setProperty('height', `${Math.min(el.scrollHeight + 2, 320)}px`, 'important');
  }, [form.pregunta]);

  // Errores por campo (2026-11-01): reemplazan el globo gris del navegador
  // ("Completa este campo") por un aviso propio debajo de cada campo.
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});
  function limpiarErrorCampo(campo: string) {
    setErroresCampo(prev => {
      if (!prev[campo]) return prev;
      const { [campo]: _, ...resto } = prev;
      return resto;
    });
  }

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
          // Mismo formato que la orden (E.164); incompleto → no se manda.
          telefono:    telefonoValido(form.telefono, pais) ? telefonoE164(form.telefono, pais) : undefined,
          email:       form.email    || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        trackCheckoutPaso('coupon_result', 'error');
        setCodigoError(data?.error ?? 'Error al validar el código.');
        return;
      }

      if (!data.valido) {
        trackCheckoutPaso('coupon_result', 'invalido');
        setCodigoError(data.error ?? 'Código inválido o expirado.');
        return;
      }

      trackCheckoutPaso('coupon_result', data.orden_gratuita === true ? 'cortesia' : 'ok');

      setDescuento({
        uso_id:             data.uso_id,
        precio_aplicado:    data.precio_aplicado,
        descuento_aplicado: data.descuento_aplicado,
        tipo_descuento:     data.tipo_descuento,
        orden_gratuita:     data.orden_gratuita === true,
      });
    } catch {
      trackCheckoutPaso('coupon_result', 'red');
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
    trackCheckoutPaso('form_submit', descuento ? 'con_codigo' : 'sin_codigo', precioFinal ?? undefined);
    // El form va con noValidate: checkValidity() igual dispara los eventos
    // 'invalid' (los mide medirFormulario) pero sin el globo del navegador.
    const formEl = formRef.current;
    if (formEl && !formEl.checkValidity()) {
      const invalidos = Array.from(formEl.elements).filter(
        (el): el is HTMLInputElement => 'validity' in el && !(el as HTMLInputElement).validity.valid && !!(el as HTMLInputElement).name,
      );
      setErroresCampo(Object.fromEntries(invalidos.map(el => [el.name, MENSAJES_CAMPO[el.name] ?? 'Completá este campo.'])));
      const primero = invalidos[0];
      primero?.focus({ preventScroll: true });
      primero?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErroresCampo({});
    if (PRECIO_BASE === null) {
      trackCheckoutPaso('form_error', 'precio');
      setError('El precio no está disponible ahora mismo. Recargá la página o volvé a intentar en unos minutos.');
      return;
    }
    if (!aceptaTerminos) {
      trackCheckoutPaso('form_error', 'terminos');
      setError('Necesitás aceptar los Términos del servicio para continuar.');
      return;
    }
    if (emailSolicitado && !EMAIL_RE.test(form.email.trim())) {
      trackCheckoutPaso('form_error', 'email');
      setError('Revisá tu email: no parece válido. Si no querés recibirla por email, dejalo vacío.');
      return;
    }
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setError(null);
    setIsLoading(true);
    setFase('orden');

    // Solo en local (npm run dev) con ?simular_pago: recorre las etapas del
    // botón sin crear orden ni ir a Mercado Pago. En producción no existe.
    if (process.env.NODE_ENV === 'development' && new URLSearchParams(window.location.search).has('simular_pago')) {
      await esperar(3800);
      if (!esCortesia) { setFase('pago'); await esperar(900); }
      setFase('listo');
      await esperar(1600);
      enviandoRef.current = false;
      setIsLoading(false);
      setFase(null);
      return;
    }

    // Normalizar teléfono al formato internacional para WhatsApp
    const phone = telefonoE164(form.telefono, pais);

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

    // Motivo que se registra si algo falla (solo el código, nunca el mensaje).
    let motivoError = 'respuesta';
    try {
      const res = await fetch('/api/tarot/crear-orden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        motivoError = `orden:${typeof data?.error === 'string' ? data.error : res.status}`;
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
        trackCheckoutPaso('mp_redirect', 'cortesia', 0);
        enviarEventosAhora();
        setFase('listo');
        await esperar(500);
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
        trackCheckoutPaso('mp_redirect', descuento ? 'con_codigo' : 'sin_codigo', precioFinal ?? undefined);
        enviarEventosAhora();
        // Los SDKs de Meta y Google bajan diferidos (lib/cargaDiferida.ts):
        // si todavía no llegaron, se piden ya y se los espera (máx. 1,5 s) para
        // que InitiateCheckout salga antes de irse. El botón muestra la etapa.
        setFase('pago');
        cargarDiferidosYa();
        await Promise.all([esperar(600), esperarTerceros(1500)]);
        setFase('listo');
        await esperar(400);
        window.location.href = data.init_point;
      } else {
        motivoError = 'sin_link_pago';
        throw new Error('No se recibió la URL de pago.');
      }
    } catch (err: unknown) {
      trackCheckoutPaso('form_error', motivoError);
      setError(err instanceof Error ? err.message : 'Error inesperado. Intentá de nuevo.');
      setIsLoading(false);
      setFase(null);
      enviandoRef.current = false;
    }
  }

  // Mismo esquema que Home y /tarot (PaginaMarca → escenario → header →
  // contenido). Solo presentación: todos los handlers y estados de arriba
  // son los mismos de antes del rediseño.
  return (
    <PaginaMarca fondo={<FondoCheckout angosto />}>
      <div className="relative">
        <HeaderMarca variante="minimo" />

        <div className="relative px-5 md:px-8 pt-6 pb-10 md:pb-14">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_330px] gap-8 md:gap-7 md:items-start">

            {/* ── Columna formulario ─────────────────────────────── */}
            <div className="min-w-0">
              <Link
                href={'/tarot' as never}
                onClick={() => trackCheckoutPaso('checkout_back', 'volver_tarot')}
                // Celular: píldora oscura, el link caía sobre el sol del fondo (2026-11-01).
                className="inline-flex items-center gap-1.5 py-2 -my-2 text-[13.5px] text-white/80 hover:text-white transition-colors mb-4 max-md:rounded-full max-md:px-3 max-md:-mx-1 max-md:bg-black/45 max-md:text-white/90 max-md:backdrop-blur-sm"
                style={{ textShadow: TEXT_SHADOW }}
              >
                <ArrowLeft size={15} />
                Volver a Tarot
              </Link>

              {/* Velo oscuro detrás del título: el fondo tiene adornos (luna,
                  hojas) justo en esta zona — mismo recurso de legibilidad
                  que HeroTarot (text-shadow) más un degradé radial suave. */}
              <div className="relative isolate mb-5" style={{ textShadow: TEXT_SHADOW }}>
                <div
                  aria-hidden="true"
                  className="absolute -inset-x-8 -inset-y-6 -z-10 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse 75% 85% at 35% 50%, rgba(6,4,14,0.72), transparent 75%)' }}
                />
                {/* Antetítulo centrado entre dos filetes dorados (Manuel, 2026-11-11). */}
                <p className="flex items-center justify-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: GOLD }}>
                  <span aria-hidden="true" className="h-px w-10 md:w-16" style={{ background: `linear-gradient(90deg, transparent, ${GOLD})` }} />
                  Tarot personalizado
                  <span aria-hidden="true" className="h-px w-10 md:w-16" style={{ background: `linear-gradient(90deg, ${GOLD}, transparent)` }} />
                </p>
                <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(2rem, 4.2vw, 2.85rem)', lineHeight: 1.08, color: CREMA }}>
                  Tu lectura empieza acá
                </h1>
                <p className="text-white/90 md:text-white/75 text-[15px] leading-relaxed mt-2 max-w-[480px]">
                  Elegí el tema, hacé tu consulta si querés y accedé a tu lectura en minutos.
                </p>
              </div>

              {/* Móvil (2026-11-11, Manuel): sin la tarjeta resumen del producto
                  arriba del formulario; ya decidió la compra. El precio se ve
                  en el botón de pago. */}

              <form
                ref={formRef}
                onSubmit={handleSubmit}
                noValidate
                className="rounded-2xl p-5 md:p-6 space-y-5"
                style={{ background: 'rgba(12,7,24,0.78)', border: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(6px)', boxShadow: '0 18px 48px rgba(0,0,0,0.40)' }}
              >

                <Paso n={1} titulo="Tu consulta" bajada="Elegí un tema. La pregunta es opcional." />

                {/* Tema en botones (auditoría 2026-11-04): 28 visitas llegaron al
                    checkout en 21 días y 26 se fueron sin escribir nada; las 2
                    que empezaron pagaron. Se arranca por lo fácil y propio de la
                    consulta (un toque) en vez de pedir nombre y teléfono primero.
                    Mismo campo "tema" (radio requerido): validación y medición
                    iguales que con el selector. */}
                <fieldset>
                  <legend className="mb-2 text-[14px] font-medium text-white/90">
                    Tema de la consulta <span className="text-[12px] font-normal text-white/45">(requerido)</span>
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {/* El "elegido" se pinta con CSS (has-[:checked]) y no con el
                        estado de React (2026-11-06): así el botón responde al
                        toque aunque la página todavía no terminó de cargar (en 4G
                        lento eran ~4,5 s sin respuesta visible). */}
                    {TEMAS.map(t => {
                      const elegido = form.tema === t.value;
                      return (
                        <label
                          key={t.value}
                          className={`relative flex items-center gap-2 rounded-xl px-3 min-h-[50px] text-[14.5px] leading-tight cursor-pointer transition-all border text-white/85 border-white/15 bg-white/[0.045] has-[:checked]:font-semibold has-[:checked]:text-[#180e00] has-[:checked]:border-[#fbe39a] has-[:checked]:bg-[linear-gradient(180deg,#f6d77e,#e9b94a)] has-[:checked]:shadow-[0_0_14px_rgba(240,197,90,0.35)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#F0C55A]/60 ${erroresCampo.tema ? RING_ERROR + ' ring-1' : ''}`}
                        >
                          <input
                            type="radio"
                            name="tema"
                            value={t.value}
                            checked={elegido}
                            onChange={(e) => { handleChange(e); limpiarErrorCampo('tema'); }}
                            disabled={isLoading}
                            required
                            className="sr-only"
                          />
                          <span aria-hidden="true" className="text-[17px]">{t.emoji}</span>
                          {t.corto}
                        </label>
                      );
                    })}
                  </div>
                  <ErrorCampo texto={erroresCampo.tema} />
                </fieldset>

                {/* Pregunta (opcional) */}
                <div>
                  <Etiqueta htmlFor="pregunta" texto="Tu pregunta" nota="opcional" />
                  <ConIcono Icon={PenLine} arriba>
                    <textarea
                      id="pregunta"
                      name="pregunta"
                      ref={preguntaRef}
                      rows={3}
                      // Mobile (2026-11-01): el ejemplo solo, sin la frase que ya
                      // dice la bajada del paso 2; arranca en ~3 líneas y crece al
                      // escribir (antes 14rem fijos empujaban el botón de pago).
                      className={`${inputCheckout} !h-auto min-h-[5.5rem] sm:min-h-0 pl-11 resize-none leading-relaxed`}
                      style={inputBg}
                      placeholder={`Ej: ${EJEMPLOS_POR_TEMA[form.tema] ?? EJEMPLOS_POR_TEMA['']}`}
                      value={form.pregunta}
                      onChange={handleChange}
                      disabled={isLoading}
                      maxLength={500}
                    />
                  </ConIcono>
                  <p className="mt-1 text-xs text-white/45 text-right">{form.pregunta.length}/500</p>
                </div>

                <Paso n={2} titulo="Tus datos" bajada="Tu lectura es privada y se envía solo a vos." separado />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">

                {/* Nombre */}
                <div>
                  <Etiqueta htmlFor="nombre" texto="Tu nombre" nota="requerido" />
                  <ConIcono Icon={User}>
                    <input
                      id="nombre"
                      name="nombre"
                      className={`${inputCheckout} pl-11 ${erroresCampo.nombre ? RING_ERROR : ''}`}
                      style={inputBg}
                      placeholder="¿Cómo te llamás?"
                      autoComplete="given-name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      value={form.nombre}
                      onChange={(e) => { handleChange(e); limpiarErrorCampo('nombre'); }}
                      disabled={isLoading}
                      required
                    />
                  </ConIcono>
                  <ErrorCampo texto={erroresCampo.nombre} />
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
                        className="appearance-none rounded-xl pl-4 pr-9 md:pl-3 md:pr-7 ring-1 ring-white/15 h-12 text-white/85 font-medium tracking-wide focus:outline-none focus:ring-2 focus:ring-[#F0C55A]/55 disabled:opacity-60 cursor-pointer text-[16px] md:text-[14px]"
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
                              : erroresCampo.telefono ? RING_ERROR : ''
                          }`}
                          style={inputBg}
                          placeholder={paisInfo.placeholder}
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          enterKeyHint="next"
                          value={form.telefono}
                          onChange={(e) => {
                            const digits = normalizarTelefonoPegado(e.target.value, form.telefono, pais).slice(0, paisInfo.maxDigits);
                            setForm(prev => ({ ...prev, telefono: digits }));
                            limpiarErrorCampo('telefono');
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
                  ) : erroresCampo.telefono ? (
                    <ErrorCampo texto={erroresCampo.telefono} />
                  ) : (
                    <p className="mt-1.5 text-xs text-white/55">{paisInfo.hint}</p>
                  )}
                </div>

                {/* Email opcional: si se completa, la lectura llega también por email */}
                <div>
                  <Etiqueta htmlFor="email" texto="Email" nota="opcional" />
                  <ConIcono Icon={Mail}>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      className={`${inputCheckout} pl-11 ${erroresCampo.email ? RING_ERROR : ''}`}
                      style={inputBg}
                      placeholder="tu@email.com"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      enterKeyHint="next"
                      value={form.email}
                      onChange={(e) => { handleChange(e); limpiarErrorCampo('email'); }}
                      disabled={isLoading}
                    />
                  </ConIcono>
                  {erroresCampo.email
                    ? <ErrorCampo texto={erroresCampo.email} />
                    : <p className="mt-1.5 text-xs text-white/55">Si lo completás, también te enviamos la lectura por email.</p>}
                </div>

                {/* Fecha de nacimiento (opcional) */}
                <div>
                  <Etiqueta htmlFor="fecha_nacimiento" texto="Fecha de nacimiento" nota="opcional" />
                  <FechaNacimiento
                    id="fecha_nacimiento"
                    valor={form.fecha_nacimiento}
                    onCambio={(v) => setForm(prev => ({ ...prev, fecha_nacimiento: v }))}
                    disabled={isLoading}
                  />
                  <p className="mt-1.5 text-xs text-white/55">Para personalizar tu lectura.</p>
                </div>
                </div>

                <Paso n={3} titulo={esCortesia ? 'Confirmá tu lectura' : 'Realizá tu pago'} bajada={esCortesia ? 'Revisá los detalles y confirmá tu lectura.' : 'Pago único.'} separado />

                {/* Antes de pagar (2026-11-11, diseño de Manuel): entrega y
                    garantías en una sola caja, como lista. "Si no te llega…"
                    es lo mismo que dicen los Términos (punto 5). */}
                <div
                  className="rounded-xl px-4 py-4 flex items-start gap-3"
                  style={{ background: 'rgba(240,197,90,0.06)', border: '1px solid rgba(240,197,90,0.45)' }}
                >
                  <Zap size={22} className="shrink-0 mt-0.5" style={{ color: GOLD }} fill={GOLD} />
                  <div>
                    <p className="text-[15.5px] font-semibold leading-snug text-white">
                      Tu lectura estará lista{' '}
                      <span style={{ color: GOLD }}>en minutos.</span>
                    </p>
                    <ul className="mt-2 space-y-1">
                      {[esCortesia ? 'Al confirmar, vas directo a Tu Oráculo.' : 'Después de pagar volvés automáticamente a Tu Oráculo.', 'Podés seguir el proceso hasta que se abra tu lectura.', 'También te enviamos el acceso por WhatsApp.'].map((t) => (
                        <li key={t} className="flex items-start gap-2 text-[13.5px] text-white/80">
                          <Check size={15} strokeWidth={2.5} className="shrink-0 mt-0.5" style={{ color: GOLD }} />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* ── Código de descuento ──────────────────────────── */}
                {!descuento && !cuponAbierto ? (
                  <button
                    type="button"
                    onClick={() => { setCuponAbierto(true); trackCheckoutPaso('coupon_opened'); }}
                    className="self-start inline-flex items-center gap-1.5 py-2 text-[13.5px] text-white/65 hover:text-white transition-colors"
                  >
                    <Tag size={14} style={{ color: GOLD }} />
                    <span className="underline underline-offset-4 decoration-white/30">¿Tenés un código de descuento?</span>
                  </button>
                ) : (
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
                        className="flex-1 min-w-0 rounded-xl px-4 h-11 ring-1 ring-white/15 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#F0C55A]/55 disabled:opacity-60 text-[16px] md:text-sm uppercase tracking-widest"
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
                )}

                {/* Checkbox */}
                <label className="flex items-start gap-3 py-1 text-[13.5px] text-white/75 cursor-pointer leading-relaxed">
                  <input
                    type="checkbox"
                    name="acepta_terminos"
                    checked={aceptaTerminos}
                    onChange={e => { setAceptaTerminos(e.target.checked); limpiarErrorCampo('acepta_terminos'); }}
                    disabled={isLoading}
                    required
                    className="mt-0.5 h-[22px] w-[22px] shrink-0 cursor-pointer accent-[#F0C55A]"
                  />
                  {/* Texto legal (2026-11-02): mayoría de edad + aceptación. Entrega
                      inmediata y arrepentimiento (Términos 6), proveedores en el
                      exterior y datos sensibles (Privacidad 4 y 6) quedan en los
                      textos aceptados: sin sumar lectura al checkout, a pedido. */}
                  <span>
                    Soy mayor de 18 y acepto los{' '}
                    <a href="/terminos-del-servicio" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[#F0C55A] transition-colors">
                      Términos
                    </a>{' '}
                    y la{' '}
                    <a href="/politica-de-privacidad" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[#F0C55A] transition-colors">
                      Privacidad
                    </a>
                    .
                  </span>
                </label>
                {erroresCampo.acepta_terminos && <div className="!-mt-3"><ErrorCampo texto={erroresCampo.acepta_terminos} /></div>}

                {/* Error */}
                {error && (
                  <div ref={errorRef} role="alert" className="rounded-xl px-4 py-3 text-sm text-red-300 bg-red-900/20 border border-red-500/25">
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
                    aria-busy={!!fase}
                    className={`relative overflow-hidden w-full rounded-xl py-4 min-h-[60px] text-[17px] font-bold flex items-center justify-center gap-2.5 transition-all hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed ${precioNoDisponible ? 'opacity-60' : ''}`}
                    style={{ background: CTA_GRADIENT, color: '#180e00', boxShadow: fase ? '0 6px 30px rgba(240,197,90,0.55)' : '0 6px 24px rgba(240,197,90,0.32)' }}
                  >
                    {fase ? (
                      <>
                        {fase !== 'listo' && (
                          <span aria-hidden="true" className="boton-brillo pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)' }} />
                        )}
                        <span
                          key={fase === 'orden' ? `orden-${pasoOrden}` : fase}
                          className="fase-entra relative flex items-center gap-2 whitespace-nowrap text-[15px] min-[400px]:text-[16.5px]"
                        >
                          {fase === 'listo'
                            ? <CheckCircle size={20} className="shrink-0" strokeWidth={2.5} />
                            : <Loader2 size={19} className="shrink-0 animate-spin" strokeWidth={2.5} />}
                          {fase === 'orden'
                            ? (esCortesia ? TEXTOS_ORDEN_CORTESIA : TEXTOS_ORDEN)[pasoOrden]
                            : fase === 'pago'
                              ? 'Conectando con Mercado Pago…'
                              : esCortesia ? '¡Listo! Tu lectura va en camino' : '¡Listo! Abriendo el pago'}
                        </span>
                      </>
                    ) : (
                      <>
                        {!precioNoDisponible && (esCortesia
                          ? <Sparkles size={18} className="shrink-0" />
                          : <Lock size={18} className="shrink-0" />)}
                        {precioNoDisponible
                          ? 'Precio no disponible'
                          : esCortesia
                            ? 'Obtener mi lectura →'
                            : `Pagar $U ${precioFinal} →`}
                      </>
                    )}
                    {/* Barrita de progreso: siempre montada para que el ancho
                        se anime desde 0 al empezar cada etapa. */}
                    <span
                      aria-hidden="true"
                      className="absolute left-0 bottom-0 h-[3px] rounded-r-full"
                      style={{
                        width: fase ? PROGRESO[fase].ancho : '0%',
                        opacity: fase ? 1 : 0,
                        transition: `width ${fase ? PROGRESO[fase].ms : 0}ms ease-out`,
                        background: 'rgba(24,14,0,0.45)',
                      }}
                    />
                  </button>
                  {/* Para lectores de pantalla: anuncia cada etapa. */}
                  <p className="sr-only" aria-live="polite">
                    {fase === 'orden' ? TEXTOS_ORDEN[pasoOrden] : fase === 'pago' ? 'Conectando con Mercado Pago' : fase === 'listo' ? 'Listo, abriendo el pago' : ''}
                  </p>

                  {esCortesia ? (
                    <p className="mt-3 text-center text-[12.5px] text-white/55">
                      Lectura de cortesía · Sin cargo · No se te pide ningún dato de pago
                    </p>
                  ) : (
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[12.5px] text-white/55">
                    <span className="flex items-center gap-1.5">
                      Procesado por
                      <LogoMercadoPago alto={18} />
                    </span>
                    <span className="text-white/25">·</span>
                    <span>Pago único</span>
                    <span className="text-white/25">·</span>
                    <span>Sin suscripción</span>
                  </div>
                  )}

                  {/* Ayuda antes de pagar (2026-11-01): quien duda en el último
                      paso puede preguntar en vez de irse. Abre en otra pestaña
                      para no perder lo que ya completó. */}
                  {waNumero && (
                    <p className="mt-3 text-center text-[13px] text-white/60">
                      ¿Dudas antes de pagar?{' '}
                      <a
                        href={linkWhatsApp(waNumero, 'Hola! Estoy por comprar una lectura de Tarot y tengo una duda.')}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackCheckoutPaso('help_click', 'whatsapp')}
                        className="inline-flex items-center gap-1 py-2 underline underline-offset-2 hover:text-white/90"
                        style={{ color: GOLD }}
                      >
                        <MessageCircle size={13} className="shrink-0" />
                        Escribinos por WhatsApp
                      </a>
                    </p>
                  )}
                </div>

              </form>
            </div>

            {/* ── Columna lateral ────────────────────────────────── */}
            {/* Desktop (2026-11-11, Manuel): tarjeta chica + pasos (sin el bloque grande). Mobile: solo los pasos, al final
                (sin tarjeta resumen arriba del formulario). */}
            <aside className="w-full space-y-5">
              <div className="hidden md:block">
              <ResumenCompacto
                nombre={form.nombre}
                precioBase={PRECIO_BASE}
                precioFinal={precioNoDisponible ? null : precioFinal}
                descuentoAplicado={descuento ? descuento.descuento_aplicado : null}
              />
              </div>
              <QuePasaDespues cortesia={esCortesia} />
            </aside>

          </div>
        </div>

        {/* Pie mínimo: legales y Contacto, sin los enlaces de Tarot. */}
        <PieMarca minimo />
      </div>
    </PaginaMarca>
  );
}
