'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronDown, Lock, Tag, X, Check, CheckCircle, AlertCircle, MessageCircle,
  ArrowLeft, User, Mail, PenLine, Zap, Sparkles, Loader2, Plus, ShieldCheck, Receipt, Headphones, FileText, Layers,
} from 'lucide-react';
import { cargarDiferidosYa, esperarTerceros } from '@/lib/cargaDiferida';
import { getStoredAttribution, getOrCreateSessionId, medirFormulario, trackCheckoutPaso, enviarEventosAhora } from '@/lib/analytics';
import { GOLD, SERIF, CREMA, CTA_GRADIENT } from '@/components/home/theme';
import { PaginaMarca } from '@/components/marca/PaginaMarca';
import { HeaderMarca } from '@/components/marca/HeaderMarca';
import { ConIcono, inputCheckout, inputBg } from '@/components/tarot/checkout/CampoCheckout';
import { FechaNacimiento } from '@/components/tarot/checkout/FechaNacimiento';
import { PieMarca } from '@/components/marca/PieMarca';
import { LogoMercadoPago } from '@/components/tarot/LogoMercadoPago';
import { metaInitiateCheckout } from '@/lib/metaPixel';
import { googleAdsInicioCheckout } from '@/lib/googleAds';
import { linkWhatsApp } from '@/lib/contacto';
import { pesosUY } from '@/lib/ctaTarot';
import { HojaLegal, type DocLegal } from '@/components/tarot/checkout/HojaLegal';
// Meta InitiateCheckout se dispara recién cuando existe una orden real creada
// (ver handleSubmit) — NO al montar la página. Ver docs/product/DECISIONS.md
// 2026-08-22 ("Meta funnel V1 — InitiateCheckout en el pago, no en la visita").

// PRECIO_BASE is now passed as prop from the server page

const PAISES = [
  { codigo: 'UY', bandera: '🇺🇾', prefijo: '+598', placeholder: '091234567',
    // 2026-11-14: "No compartimos tu número" (verdad). NO decir "solo lo
    // usamos para…": hay mensajes de feedback por WhatsApp planificados.
    hint: 'Ahí te llega tu lectura. No compartimos tu número.', maxDigits: 9 },
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
  decision:  '¿Cuál es el camino correcto para mí ahora? · ¿Es momento de hacer este cambio?',
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

const CLAVE_FORM_GUARDADO = 'tarotCheckoutForm';

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
    <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[13.5px] text-red-300">
      <AlertCircle size={14} className="shrink-0" />
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
  temaInicial, precioBase, codigoInicial, precioEspecialInicial = null, nombreInicial, nacimientoInicial, waNumero = '',
}: { temaInicial?: string; precioBase: number | null; codigoInicial?: string; precioEspecialInicial?: number | null; nombreInicial?: string; nacimientoInicial?: string; waNumero?: string }) {
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
  // Volver desde Mercado Pago (auditoría 2026-11-11): el checkout se sirve
  // con no-store y Chrome no lo guarda en memoria al ir y volver, así que el
  // formulario aparecía vacío. Se guarda en la pestaña (sessionStorage) por
  // 2 h; no pisa lo que llega por la URL y la casilla de Términos no se
  // guarda (se vuelve a marcar). /tarot/estado lo borra al confirmar el pago.
  const [formRestaurado, setFormRestaurado] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CLAVE_FORM_GUARDADO);
      const g = raw ? (JSON.parse(raw) as { t?: number; f?: Partial<Record<keyof FormState, unknown>> }) : null;
      if (g?.f && typeof g.t === 'number' && Date.now() - g.t < 2 * 3600_000) {
        const f = g.f;
        setForm(prev => {
          const n = { ...prev };
          (Object.keys(EMPTY) as (keyof FormState)[]).forEach((k) => {
            const v = f[k];
            if (!n[k] && typeof v === 'string' && v) n[k] = v.slice(0, 500);
          });
          return n;
        });
      } else if (raw) sessionStorage.removeItem(CLAVE_FORM_GUARDADO);
    } catch { /* sin almacenamiento: sigue igual */ }
    setFormRestaurado(true);
  }, []);
  useEffect(() => {
    if (!formRestaurado) return;
    try {
      if (Object.values(form).some(Boolean)) sessionStorage.setItem(CLAVE_FORM_GUARDADO, JSON.stringify({ t: Date.now(), f: form }));
    } catch { /* best-effort */ }
  }, [form, formRestaurado]);
  const paisInfo = PAISES.find(p => p.codigo === pais) ?? PAISES[0];
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  // Términos / Privacidad en una hoja encima del checkout (2026-11-15): no se sale del pago.
  const [docLegal, setDocLegal] = useState<DocLegal | null>(null);
  const abrirLegal = (doc: DocLegal) => (e: React.MouseEvent) => {
    // Ctrl/Cmd+clic o clic del medio: que abra la página en otra pestaña, como siempre.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDocLegal(doc);
    trackCheckoutPaso('legal_open', doc);
  };
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

  // Precio especial a la vista (opción A de Manuel, 2026-11-17): si llegó con un
  // código cuyo precio se pudo leer (page.tsx, sin validar), se muestra ya
  // aplicado. La validación real (límite por clienta) corre al escribir el
  // WhatsApp; si todavía no corrió, se hace antes de pagar (handleSubmit).
  // Si falla, el precio vuelve al normal con el aviso: nunca se cobra distinto
  // de lo que se ve.
  const previo = !descuento && !codigoError && precioEspecialInicial !== null && PRECIO_BASE !== null
    && !!codigoInicialValido && codigoCampo.trim().toUpperCase() === codigoInicialValido;
  const precioFinal = descuento?.precio_aplicado ?? (previo ? precioEspecialInicial : PRECIO_BASE);
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

  // Opcionales plegados (2026-11-14): se abren con un toque o solos si ya
  // tienen algo (por ejemplo, al volver de Mercado Pago).
  const [preguntaAbierta, setPreguntaAbierta] = useState(false);
  const [fechaAbierta, setFechaAbierta] = useState(false);
  const verPregunta = preguntaAbierta || !!form.pregunta;
  const verFecha = fechaAbierta || !!form.fecha_nacimiento;
  const [emailAbierto, setEmailAbierto] = useState(false);
  const verEmail = emailAbierto || !!form.email;

  // Después de elegir el tema por primera vez (2026-11-14, datos de 30 días:
  // 26 eligieron tema y solo 10 llegaron al nombre), la pantalla baja sola
  // hasta "Tus datos", sin abrir el teclado. Si el tema vino elegido desde
  // /tarot, no se mueve nada.
  const datosRef = useRef<HTMLElement>(null);
  const temasRef = useRef<HTMLFieldSetElement>(null);
  const yaGuioRef = useRef(false);
  function guiarADatos() {
    if (yaGuioRef.current) return;
    yaGuioRef.current = true;
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
      const nombre = document.getElementById('nombre');
      const temas = temasRef.current;
      if (!nombre || !temas) return;
      // Solo si el nombre no se ve. Baja lo justo: los temas (con el elegido)
      // quedan arriba y el nombre a la vista.
      if (nombre.getBoundingClientRect().bottom > window.innerHeight * 0.92) {
        const destino = temas.getBoundingClientRect().top - 12;
        window.scrollBy({ top: Math.max(0, destino), behavior: quieto ? 'auto' : 'smooth' });
      }
    }, 220);
  }

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

  // Cada validación reserva un uso del código (ef_tarot_validar_codigo): si ya
  // hay una en curso (la automática al escribir el WhatsApp), se reusa en vez
  // de lanzar otra (2026-11-17).
  const validacionRef = useRef<Promise<DescuentoAplicado | null> | null>(null);
  function handleValidarCodigo(): Promise<DescuentoAplicado | null> {
    if (validacionRef.current) return validacionRef.current;
    const p = validarCodigoAhora().finally(() => { validacionRef.current = null; });
    validacionRef.current = p;
    return p;
  }

  async function validarCodigoAhora(): Promise<DescuentoAplicado | null> {
    const codigo = codigoCampo.trim().toUpperCase();
    if (!codigo) return null;
    if (PRECIO_BASE === null) {
      setCodigoError('El precio no está disponible ahora mismo. Volvé a intentar en unos minutos.');
      return null;
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
        return null;
      }

      if (!data.valido) {
        trackCheckoutPaso('coupon_result', 'invalido');
        setCodigoError(data.error ?? 'Código inválido o expirado.');
        return null;
      }

      trackCheckoutPaso('coupon_result', data.orden_gratuita === true ? 'cortesia' : 'ok');

      const aplicado: DescuentoAplicado = {
        uso_id:             data.uso_id,
        precio_aplicado:    data.precio_aplicado,
        descuento_aplicado: data.descuento_aplicado,
        tipo_descuento:     data.tipo_descuento,
        orden_gratuita:     data.orden_gratuita === true,
      };
      setDescuento(aplicado);
      return aplicado;
    } catch {
      trackCheckoutPaso('coupon_result', 'red');
      setCodigoError('No se pudo verificar el código. Intentá de nuevo.');
      return null;
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
    // Precio especial a la vista pero todavía sin validar (2026-11-17): se
    // valida acá, antes de crear la orden. Si no se puede aplicar, se frena con
    // el aviso y el precio vuelve al normal en pantalla: nunca se cobra un
    // precio distinto del que la persona vio.
    let aplicado = descuento;
    if (!aplicado && previo) {
      if (enviandoRef.current) return;
      enviandoRef.current = true;
      setIsLoading(true);
      aplicado = await handleValidarCodigo();
      enviandoRef.current = false;
      setIsLoading(false);
      if (!aplicado) {
        trackCheckoutPaso('form_error', 'codigo');
        setError('No pudimos aplicar tu precio especial (mirá el aviso junto al código). Si querés, podés seguir con el precio normal.');
        return;
      }
    }
    const precioCobrar = aplicado?.precio_aplicado ?? PRECIO_BASE;
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
      codigo_descuento_uso_id: aplicado?.uso_id ?? null,
      precio_final:            precioCobrar,
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
        metaInitiateCheckout(precioCobrar ?? 0);
        trackCheckoutPaso('mp_redirect', aplicado ? 'con_codigo' : 'sin_codigo', precioCobrar ?? undefined);
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


  // ── Presentación (checkout nuevo, 2026-11-14) ─────────────────────────
  // Criterios: los temas en la primera pantalla del celular; el precio a la
  // vista desde el principio y escrito igual en todos lados ("$690", como en
  // Mercado Pago); opcionales plegados; fondo solo con CSS (sin imágenes: la
  // escena era lo más pesado de la página en el celular). Toda la lógica de
  // arriba es la del checkout vigente.
  const pesos = (n: number) => `$${n.toLocaleString('es-UY')}`;
  const precioTxt = precioFinal === null ? '' : pesos(precioFinal);
  const serifCrema = { fontFamily: SERIF, fontWeight: 700, color: CREMA } as const;
  const tituloSeccion = 'text-[21px] leading-tight';
  const enlaceOpcional = 'inline-flex items-start gap-2 min-h-[44px] py-2.5 text-[15px] font-medium text-left transition-colors hover:text-white';
  const etiquetaCampo = 'block mb-1.5 text-[15px] font-medium text-white/90';

  const INCLUYE = [
    { Icon: Layers, t: '5 cartas para tu consulta', c: '5 cartas' },
    { Icon: Sparkles, t: 'Interpretación de cada una', c: 'Interpretación' },
    { Icon: Headphones, t: 'Resumen en audio', c: 'Resumen en audio' },
    { Icon: FileText, t: 'PDF para guardar', c: 'PDF para guardar' },
  ];

  const tachado = (descuento || previo) && PRECIO_BASE !== null
    ? <span className="text-[14px] font-normal text-white/45 line-through mr-1.5">{pesos(PRECIO_BASE)}</span>
    : null;

  // Escritorio: tarjeta del producto al costado, fija mientras se completa.
  const resumenEscritorio = (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(24,14,46,0.92)', border: '1px solid rgba(240,197,90,0.30)', boxShadow: '0 12px 34px rgba(0,0,0,0.38)' }}>
      <p className="text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>Tu compra</p>
      <p className="mt-2 text-[19px] leading-snug" style={serifCrema}>Lectura de tarot personalizada</p>
      <ul className="mt-3 space-y-2 text-[14px] text-white/80">
        {INCLUYE.map(({ Icon, t }) => (
          <li key={t} className="flex items-center gap-2"><Icon size={15} className="shrink-0" style={{ color: GOLD }} />{t}</li>
        ))}
        <li className="flex items-center gap-2"><Zap size={15} className="shrink-0" style={{ color: GOLD }} />Lista en minutos</li>
      </ul>
      {!precioNoDisponible && (
        <div className="mt-4 pt-4 border-t border-white/10 flex items-end justify-between gap-3">
          <div>
            <p className="text-[14.5px] font-semibold text-white">Total</p>
            <p className="text-[12.5px] text-white/60">{esCortesia ? 'Lectura de cortesía' : 'Pesos uruguayos · pago único'}</p>
          </div>
          <p className="text-[26px] font-bold leading-none whitespace-nowrap" style={{ color: GOLD }}>
            {tachado}{esCortesia ? 'Sin cargo' : precioTxt}
          </p>
        </div>
      )}
    </div>
  );

  const despues = (
    <div className="rounded-2xl px-4 py-4 md:px-5" style={{ background: 'rgba(16,10,32,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="text-[12px] font-bold uppercase tracking-[0.16em] mb-3" style={{ color: GOLD }}>Qué pasa después</p>
      <ol className="space-y-3 text-[14.5px] text-white/85 leading-snug">
        {[
          esCortesia ? 'Confirmás tu lectura. No pasás por Mercado Pago.' : 'Pagás de forma segura en Mercado Pago.',
          'Volvés a Tu Oráculo y ves cómo se preparan tus cartas.',
          'Se abre tu lectura. El acceso también te llega por WhatsApp.',
        ].map((t, i) => (
          <li key={t} className="flex gap-3">
            <span className="shrink-0 flex items-center justify-center rounded-full text-[12.5px] font-bold" style={{ width: 24, height: 24, color: '#180e00', background: CTA_GRADIENT }}>{i + 1}</span>
            <span className="pt-0.5">{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <PaginaMarca
      fondo={
        // Fondo místico liviano: halos violeta y dorado + polvo de estrellas,
        // todo CSS. Queda detrás, sin competir con el formulario.
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 90% 38% at 50% 0%, rgba(118,64,200,0.30), transparent 72%), radial-gradient(ellipse 60% 30% at 85% 60%, rgba(240,197,90,0.05), transparent 70%), radial-gradient(ellipse 70% 30% at 10% 85%, rgba(118,64,200,0.12), transparent 70%)' }} />
          <div
            className="absolute inset-0"
            style={{
              opacity: 0.8,
              backgroundImage: 'radial-gradient(1px 1px at 20px 30px, rgba(255,240,200,0.55), transparent 60%), radial-gradient(1px 1px at 140px 90px, rgba(255,255,255,0.40), transparent 60%), radial-gradient(1.5px 1.5px at 90px 160px, rgba(240,197,90,0.55), transparent 60%), radial-gradient(1px 1px at 190px 210px, rgba(255,255,255,0.35), transparent 60%)',
              backgroundSize: '230px 240px',
              maskImage: 'linear-gradient(180deg, #000 0, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.6) 100%)',
              WebkitMaskImage: 'linear-gradient(180deg, #000 0, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.6) 100%)',
            }}
          />
        </div>
      }
    >
      <div className="relative">
        <HeaderMarca variante="minimo" />

        <div className="relative px-4 md:px-8 pt-1 md:pt-6 pb-10 md:pb-14">
          <div className="mx-auto max-w-[520px] md:max-w-none grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-5 md:gap-8 md:items-start">

            <div className="min-w-0">
              <Link
                href={'/tarot' as never}
                onClick={() => trackCheckoutPaso('checkout_back', 'volver_tarot')}
                className="inline-flex items-center gap-1.5 min-h-[40px] text-[14px] text-white/60 hover:text-white transition-colors"
              >
                <ArrowLeft size={15} />
                Volver
              </Link>

              <h1 style={{ ...serifCrema, fontSize: 'clamp(2.05rem, 4.2vw, 2.7rem)', lineHeight: 1.06 }}>
                Tu lectura empieza acá
              </h1>
              <p className="mt-2 text-[16px] leading-snug text-white/80">
                Elegí tu tema y en minutos tenés tu lectura.
              </p>

              {/* Celular: el producto y el precio en una franja, sin empujar
                  los temas fuera de la primera pantalla. */}
              {!precioNoDisponible && (
                <div
                  className="md:hidden mt-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                  style={{ background: 'rgba(24,14,46,0.92)', border: '1px solid rgba(240,197,90,0.30)' }}
                >
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-tight text-white">Lectura de 5 cartas</p>
                    <p className="mt-0.5 text-[13px] text-white/65">Interpretación, audio y PDF</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[22px] font-bold leading-none whitespace-nowrap" style={{ color: GOLD }}>{tachado}{esCortesia ? 'Sin cargo' : precioTxt}</p>
                    {!esCortesia && <p className="mt-1 text-[12.5px] text-white/65">pago único</p>}
                  </div>
                </div>
              )}

              <form
                ref={formRef}
                onSubmit={handleSubmit}
                noValidate
                className="mt-4 md:mt-6 rounded-2xl px-4 pt-5 pb-5 md:p-7 space-y-8"
                style={{ background: 'rgba(16,10,32,0.94)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 18px 48px rgba(0,0,0,0.45)' }}
              >
                {/* ── 1. Tema ── */}
                <fieldset ref={temasRef}>
                  <legend className={`${tituloSeccion} mb-3`} style={serifCrema}>¿Sobre qué querés preguntar?</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {TEMAS.map(t => {
                      const elegido = form.tema === t.value;
                      return (
                        <label
                          key={t.value}
                          className={`relative flex items-center gap-1.5 min-[390px]:gap-2 rounded-xl px-2.5 min-[390px]:px-3 min-h-[52px] text-[15px] leading-tight cursor-pointer transition-all border text-white/90 border-white/15 bg-white/[0.05] hover:border-white/30 has-[:checked]:font-semibold has-[:checked]:text-[#180e00] has-[:checked]:border-[#fbe39a] has-[:checked]:bg-[linear-gradient(180deg,#f6d77e,#e9b94a)] has-[:checked]:shadow-[0_0_14px_rgba(240,197,90,0.35)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#F0C55A]/60 ${erroresCampo.tema ? RING_ERROR + ' ring-1' : ''}`}
                        >
                          <input
                            type="radio"
                            name="tema"
                            value={t.value}
                            checked={elegido}
                            onChange={(e) => { handleChange(e); limpiarErrorCampo('tema'); guiarADatos(); }}
                            disabled={isLoading}
                            required
                            className="sr-only"
                          />
                          <span aria-hidden="true" className="text-[18px]">{t.emoji}</span>
                          {t.corto}
                        </label>
                      );
                    })}
                  </div>
                  <ErrorCampo texto={erroresCampo.tema} />

                  <div className="mt-2">
                    {!verPregunta ? (
                      <button
                        type="button"
                        onClick={() => { setPreguntaAbierta(true); trackCheckoutPaso('opcional_abierto', 'pregunta'); setTimeout(() => preguntaRef.current?.focus(), 50); }}
                        className={enlaceOpcional}
                        style={{ color: GOLD }}
                      >
                        <Plus size={17} className="shrink-0 mt-[2px]" />
                        <span>Escribir mi pregunta <span className="text-white/55 font-normal">(opcional)</span></span>
                      </button>
                    ) : (
                      <div className="pt-2">
                        <label htmlFor="pregunta" className={etiquetaCampo}>
                          Tu pregunta <span className="text-[13px] font-normal text-white/55">(opcional)</span>
                        </label>
                        <ConIcono Icon={PenLine} arriba>
                          <textarea
                            id="pregunta"
                            name="pregunta"
                            ref={preguntaRef}
                            rows={3}
                            className={`${inputCheckout} !h-auto min-h-[5.5rem] sm:min-h-0 pl-11 resize-none leading-relaxed`}
                            style={inputBg}
                            placeholder={`Ej: ${EJEMPLOS_POR_TEMA[form.tema] ?? EJEMPLOS_POR_TEMA['']}`}
                            value={form.pregunta}
                            onChange={handleChange}
                            disabled={isLoading}
                            maxLength={500}
                          />
                        </ConIcono>
                        <p className="mt-1.5 text-[13px] text-white/55">
                          Si no escribís nada, la lectura se enfoca en el tema que elegiste.
                          {form.pregunta.length > 400 && <span className="float-right">{form.pregunta.length}/500</span>}
                        </p>
                      </div>
                    )}
                  </div>
                </fieldset>

                {/* ── 2. Datos ── */}
                <section ref={datosRef} aria-labelledby="titulo-datos">
                  <h2 id="titulo-datos" className={`${tituloSeccion} mb-1`} style={serifCrema}>¿A dónde te la enviamos?</h2>
                  <p className="mb-4 text-[14px] text-white/60">Tu lectura es privada: solo la recibís vos.</p>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="nombre" className={etiquetaCampo}>Tu nombre</label>
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
                          aria-invalid={!!erroresCampo.nombre}
                        />
                      </ConIcono>
                      <ErrorCampo texto={erroresCampo.nombre} />
                    </div>

                    <div>
                      <label htmlFor="telefono" className={etiquetaCampo}>Tu WhatsApp</label>
                      <div className="flex gap-2 items-center">
                        <div className="relative shrink-0">
                          <select
                            value={pais}
                            onChange={e => { setPais(e.target.value); setForm(prev => ({ ...prev, telefono: '' })); }}
                            disabled={isLoading}
                            aria-label="País"
                            className="appearance-none rounded-xl pl-3 pr-8 ring-1 ring-white/15 h-12 text-white/85 font-medium focus:outline-none focus:ring-2 focus:ring-[#F0C55A]/55 disabled:opacity-60 cursor-pointer text-[16px] md:text-[14.5px]"
                            style={inputBg}
                          >
                            {PAISES.map(p => (
                              <option key={p.codigo} value={p.codigo} style={{ background: '#1a0a3a', color: 'white' }}>
                                {p.bandera} {p.prefijo}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <ConIcono Icon={MessageCircle}>
                            <input
                              id="telefono"
                              name="telefono"
                              className={`${inputCheckout} pl-11 ${
                                telefonoValido(form.telefono, pais)
                                  ? '!ring-emerald-500/55 focus:!ring-emerald-400/60'
                                  : erroresCampo.telefono ? RING_ERROR : ''
                              }`}
                              style={inputBg}
                              placeholder={paisInfo.placeholder}
                              type="tel"
                              inputMode="numeric"
                              autoComplete="tel-national"
                              enterKeyHint="done"
                              value={form.telefono}
                              onChange={(e) => {
                                const digits = normalizarTelefonoPegado(e.target.value, form.telefono, pais).slice(0, paisInfo.maxDigits);
                                setForm(prev => ({ ...prev, telefono: digits }));
                                limpiarErrorCampo('telefono');
                              }}
                              disabled={isLoading}
                              required
                              aria-invalid={!!erroresCampo.telefono}
                              aria-describedby="ayuda-telefono"
                            />
                          </ConIcono>
                        </div>
                      </div>
                      <div id="ayuda-telefono" aria-live="polite">
                        {telefonoValido(form.telefono, pais) ? (
                          <p className="mt-1.5 flex items-center gap-1.5 text-[13.5px] text-emerald-400">
                            <CheckCircle size={14} className="shrink-0" />
                            Listo: {formatearTelefono(form.telefono, pais)}
                          </p>
                        ) : form.telefono.length >= 3 ? (
                          <p className="mt-1.5 text-[13.5px] text-amber-300/90">
                            {form.telefono.length < 9
                              ? `Faltan ${9 - form.telefono.length} dígito${9 - form.telefono.length !== 1 ? 's' : ''}`
                              : 'El número debe empezar con 09'}
                          </p>
                        ) : erroresCampo.telefono ? (
                          <ErrorCampo texto={erroresCampo.telefono} />
                        ) : (
                          <p className="mt-1.5 text-[13.5px] text-white/60">Ahí te llega tu lectura. No compartimos tu número.</p>
                        )}
                      </div>
                    </div>

                    {/* Opcionales: plegados, se abren solos si ya tienen algo. */}
                    <div className="flex flex-col items-start">
                      {!verFecha ? (
                        <button type="button" onClick={() => { setFechaAbierta(true); trackCheckoutPaso('opcional_abierto', 'fecha'); }} className={enlaceOpcional} style={{ color: GOLD }}>
                          <Plus size={17} className="shrink-0 mt-[2px]" />
                          <span>Sumar mi fecha de nacimiento <span className="text-white/55 font-normal">(opcional)</span></span>
                        </button>
                      ) : (
                        <div className="w-full pb-2">
                          <label htmlFor="fecha_nacimiento" className={etiquetaCampo}>
                            Fecha de nacimiento <span className="text-[13px] font-normal text-white/55">(opcional)</span>
                          </label>
                          <FechaNacimiento
                            id="fecha_nacimiento"
                            valor={form.fecha_nacimiento}
                            onCambio={(v) => setForm(prev => ({ ...prev, fecha_nacimiento: v }))}
                            disabled={isLoading}
                          />
                          <p className="mt-1.5 text-[13px] text-white/55">Le suma detalle a tu lectura.</p>
                        </div>
                      )}

                      {!verEmail ? (
                        <button type="button" onClick={() => { setEmailAbierto(true); trackCheckoutPaso('opcional_abierto', 'email'); }} className={enlaceOpcional} style={{ color: GOLD }}>
                          <Plus size={17} className="shrink-0 mt-[2px]" />
                          <span>Recibirla también por email <span className="text-white/55 font-normal">(opcional)</span></span>
                        </button>
                      ) : (
                        <div className="w-full pt-2">
                          <label htmlFor="email" className={etiquetaCampo}>
                            Email <span className="text-[13px] font-normal text-white/55">(opcional)</span>
                          </label>
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
                              value={form.email}
                              onChange={(e) => { handleChange(e); limpiarErrorCampo('email'); }}
                              disabled={isLoading}
                              aria-invalid={!!erroresCampo.email}
                            />
                          </ConIcono>
                          <ErrorCampo texto={erroresCampo.email} />
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* ── 3. Pago ── */}
                <section aria-label="Pago" className="pt-6 border-t border-white/10">
                  {/* Qué se lleva, recordado justo antes de pagar (celular; en
                      escritorio está en la tarjeta del costado). */}
                  <p className="md:hidden mb-2 text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>Tu lectura incluye</p>
                  <ul className="md:hidden grid grid-cols-2 gap-x-3 gap-y-2 mb-4 text-[14px] text-white/85">
                    {INCLUYE.map(({ Icon, t, c }) => (
                      <li key={t} className="flex items-center gap-1.5 whitespace-nowrap"><Icon size={15} className="shrink-0" style={{ color: GOLD }} />{c}</li>
                    ))}
                  </ul>

                  {!precioNoDisponible && (
                    <div
                      className="flex items-center justify-between gap-3 rounded-xl px-4 py-3.5"
                      style={{ background: 'rgba(240,197,90,0.08)', border: '1px solid rgba(240,197,90,0.38)' }}
                    >
                      <div>
                        <p className="text-[16px] font-semibold text-white">Total a pagar</p>
                        <p className="text-[13px] text-white/65">{esCortesia ? 'Lectura de cortesía' : 'Pesos uruguayos'}</p>
                      </div>
                      <p className="text-[26px] font-bold leading-none whitespace-nowrap" style={{ color: GOLD }}>
                        {tachado}{esCortesia ? 'Sin cargo' : precioTxt}
                      </p>
                    </div>
                  )}

                  {/* Código: chico y al costado; un cupón a la vista hace que
                      quien no tiene uno salga a buscarlo. */}
                  <div className="mt-1">
                    {!descuento && !cuponAbierto ? (
                      <button
                        type="button"
                        onClick={() => { setCuponAbierto(true); trackCheckoutPaso('coupon_opened'); }}
                        className="inline-flex items-center gap-1.5 min-h-[40px] text-[13.5px] text-white/55 hover:text-white transition-colors"
                      >
                        <Tag size={13} />
                        <span className="underline underline-offset-4 decoration-white/25">Tengo un código</span>
                      </button>
                    ) : descuento ? (
                      <div className="flex items-center justify-between gap-3 min-h-[40px] text-[14px] text-emerald-400">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle size={15} className="shrink-0" />
                          <span>
                            <span className="font-semibold">{codigoCampo}</span>{' '}
                            {esCortesia ? 'aplicado: no necesitás pagar' : descuento.tipo_descuento === 'precio_fijo' ? '· precio especial aplicado' : `aplicado: ${descuento.tipo_descuento === 'porcentaje' && PRECIO_BASE !== null ? `${Math.round((descuento.descuento_aplicado / PRECIO_BASE) * 100)}% menos` : `${pesos(descuento.descuento_aplicado)} menos`}`}
                          </span>
                        </span>
                        <button type="button" onClick={handleQuitarCodigo} disabled={isLoading} className="p-2 -m-2 text-white/50 hover:text-white/80" aria-label="Quitar código">
                          <X size={16} />
                        </button>
                      </div>
                    ) : previo ? (
                      // Precio especial a la vista, todavía sin validar (2026-11-17).
                      <div className="flex items-center justify-between gap-3 min-h-[40px] text-[14px] text-emerald-400">
                        <span className="flex items-center gap-1.5">
                          {codigoValidando ? <Loader2 size={15} className="shrink-0 animate-spin" /> : <CheckCircle size={15} className="shrink-0" />}
                          <span><span className="font-semibold">{codigoCampo}</span> · precio especial aplicado</span>
                        </span>
                        <button type="button" onClick={handleQuitarCodigo} disabled={isLoading} className="p-2 -m-2 text-white/50 hover:text-white/80" aria-label="Quitar código">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="pt-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            aria-label="Código de descuento"
                            className="flex-1 min-w-0 rounded-xl px-4 h-11 ring-1 ring-white/15 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#F0C55A]/55 disabled:opacity-60 text-[16px] md:text-sm uppercase tracking-widest"
                            style={inputBg}
                            placeholder="TU-CODIGO"
                            value={codigoCampo}
                            onChange={e => { setCodigoCampo(e.target.value.toUpperCase()); setCodigoError(null); }}
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
                            className="rounded-xl px-4 h-11 text-sm font-semibold transition-colors hover:bg-[#F0C55A]/15 disabled:opacity-40 shrink-0"
                            style={{ color: GOLD, border: '1px solid rgba(240,197,90,0.45)' }}
                          >
                            {codigoValidando ? '...' : 'Aplicar'}
                          </button>
                        </div>
                        {codigoError && (
                          <p role="alert" className="mt-2 flex items-center gap-1.5 text-[13px] text-red-300"><AlertCircle size={13} className="shrink-0" />{codigoError}</p>
                        )}
                        {codigoInicialValido && !codigoError && (
                          <p className="mt-2 text-[13px]" style={{ color: GOLD }}>
                            {codigoValidando ? 'Aplicando tu código…' : 'Tu código se aplica al ingresar tu WhatsApp.'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <label className="mt-2 flex items-start gap-3 py-1 text-[14.5px] text-white/80 cursor-pointer leading-relaxed">
                    <input
                      type="checkbox"
                      name="acepta_terminos"
                      checked={aceptaTerminos}
                      onChange={e => { setAceptaTerminos(e.target.checked); limpiarErrorCampo('acepta_terminos'); }}
                      disabled={isLoading}
                      required
                      aria-invalid={!!erroresCampo.acepta_terminos}
                      className="mt-0.5 h-[22px] w-[22px] shrink-0 cursor-pointer accent-[#F0C55A]"
                    />
                    <span>
                      Soy mayor de 18 y acepto los{' '}
                      <a href="/terminos-del-servicio" onClick={abrirLegal('terminos')} className="underline underline-offset-2 hover:text-[#F0C55A]">Términos</a>{' '}
                      y la{' '}
                      <a href="/politica-de-privacidad" onClick={abrirLegal('privacidad')} className="underline underline-offset-2 hover:text-[#F0C55A]">Privacidad</a>.
                    </span>
                  </label>
                  <ErrorCampo texto={erroresCampo.acepta_terminos} />

                  {error && (
                    <div ref={errorRef} role="alert" className="mt-3 rounded-xl px-4 py-3 text-[14px] text-red-200 bg-red-900/25 border border-red-500/30">
                      {error}
                    </div>
                  )}
                  {precioNoDisponible && (
                    <div className="mt-3 rounded-xl px-4 py-3 text-[14px] text-amber-200 bg-amber-900/15 border border-amber-500/25">
                      El precio no está disponible en este momento. Recargá la página en unos minutos para poder pagar.
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading || precioNoDisponible}
                    aria-busy={!!fase}
                    className={`mt-4 relative overflow-hidden w-full rounded-xl px-4 py-3.5 min-h-[62px] text-[17px] leading-tight font-bold flex items-center justify-center gap-2 transition-all hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#100a20] focus-visible:ring-[#F0C55A] disabled:cursor-not-allowed ${precioNoDisponible ? 'opacity-60' : ''}`}
                    style={{ background: CTA_GRADIENT, color: '#180e00', boxShadow: fase ? '0 6px 30px rgba(240,197,90,0.55)' : '0 8px 28px rgba(240,197,90,0.38)' }}
                  >
                    {fase ? (
                      <>
                        {fase !== 'listo' && (
                          <span aria-hidden="true" className="boton-brillo pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)' }} />
                        )}
                        <span key={fase === 'orden' ? `orden-${pasoOrden}` : fase} className="fase-entra relative flex items-center gap-2 whitespace-nowrap text-[15.5px] min-[400px]:text-[16.5px]">
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
                    ) : precioNoDisponible ? (
                      'Precio no disponible'
                    ) : esCortesia ? (
                      <><Sparkles size={18} className="shrink-0" /> Recibir mi lectura →</>
                    ) : (
                      <span className="text-center [text-wrap:balance]">Pagar {precioTxt} y recibir mi&nbsp;lectura&nbsp;→</span>
                    )}
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
                  <p className="sr-only" aria-live="polite">
                    {fase === 'orden' ? TEXTOS_ORDEN[pasoOrden] : fase === 'pago' ? 'Conectando con Mercado Pago' : fase === 'listo' ? 'Listo, abriendo el pago' : ''}
                  </p>

                  {/* Garantías pegadas al botón. */}
                  {esCortesia ? (
                    <p className="mt-3 text-center text-[13.5px] text-white/65">Sin cargo · No se te pide ningún dato de pago</p>
                  ) : (
                    <div className="mt-3.5 flex flex-col items-center gap-2 text-[14px] text-white/80">
                      <p className="flex items-center gap-1.5">
                        <Receipt size={15} className="shrink-0" style={{ color: GOLD }} />
                        Pago único · Sin suscripción
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Lock size={14} className="shrink-0" style={{ color: GOLD }} />
                        Pago seguro con
                        <LogoMercadoPago alto={16} />
                      </p>
                    </div>
                  )}

                  <div className="mt-4 rounded-xl px-3.5 py-3 flex items-start gap-2.5 text-[14px] leading-snug text-white/80" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <ShieldCheck size={17} className="shrink-0 mt-[1px]" style={{ color: GOLD }} />
                    <span>Tu lectura llega en minutos. Si en 15 minutos no la recibiste, escribinos y te la reenviamos.</span>
                  </div>

                  {waNumero && (
                    <p className="mt-2 text-center text-[13.5px] text-white/60">
                      ¿Alguna duda antes de pagar?{' '}
                      <a
                        href={linkWhatsApp(waNumero, 'Hola! Estoy por comprar una lectura de Tarot y tengo una duda.')}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackCheckoutPaso('help_click', 'whatsapp')}
                        className="inline-flex items-center gap-1 min-h-[40px] underline underline-offset-2 hover:text-white/90"
                        style={{ color: GOLD }}
                      >
                        <MessageCircle size={13} className="shrink-0" />
                        Escribinos
                      </a>
                    </p>
                  )}
                </section>
              </form>

              <div className="md:hidden mt-5">{despues}</div>
            </div>

            <aside className="hidden md:block md:sticky md:top-6 space-y-4 md:mt-[138px]">
              {resumenEscritorio}
              {despues}
            </aside>
          </div>
        </div>

        <PieMarca minimo />
      </div>

      <HojaLegal
        doc={docLegal}
        precioTexto={PRECIO_BASE !== null ? pesosUY(PRECIO_BASE) : 'el precio que ves en el checkout'}
        onCerrar={() => setDocLegal(null)}
      />
    </PaginaMarca>
  );
}
