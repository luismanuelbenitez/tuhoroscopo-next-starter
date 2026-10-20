import { NextResponse } from 'next/server';
import { emitirHandoffGracias } from '@/lib/handoffGracias';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: 'Cuerpo inválido' }, { status: 400 });
  }

  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[tarot/crear-orden] Variables de entorno faltantes');
    return NextResponse.json({ ok: false, error: 'Error de configuración del servidor' }, { status: 500 });
  }

  // Captura evidencia de consentimiento: IP real del usuario y navegador
  const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
  const userAgent    = req.headers.get('user-agent') ?? '';

  let efRes: Response;
  try {
    efRes = await fetch(`${supabaseUrl}/functions/v1/ef_tarot_crear_orden`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        Authorization:     `Bearer ${serviceRoleKey}`,
        // Reenviar headers del usuario real para que el EF capture IP y User-Agent correctos
        ...(forwardedFor && { 'x-forwarded-for': forwardedFor }),
        ...(userAgent    && { 'user-agent':       userAgent    }),
      },
      body: JSON.stringify({
        ...body,
        // Confirmados en el checkbox del formulario
        acepto_terminos:   true,
        acepto_privacidad: true,
        pagina_origen:     '/tarot/checkout',
        version_terminos:  'v1.0',
      }),
      cache: 'no-store',
    });
  } catch (e) {
    console.error('[tarot/crear-orden] Fetch error:', e);
    return NextResponse.json({ ok: false, error: 'No se pudo conectar con el servidor de pago' }, { status: 502 });
  }

  const data = await efRes.json().catch(() => null);

  if (!efRes.ok || !data?.ok) {
    const errorMap: Record<string, string> = {
      NOMBRE_REQUERIDO:            'El nombre es requerido.',
      TELEFONO_REQUERIDO:          'El teléfono es requerido.',
      TELEFONO_INVALIDO:           'El teléfono ingresado no es válido.',
      EMAIL_REQUERIDO_PARA_CANAL_SOLICITADO: 'Ingresá un email válido para recibir también tu lectura por ese medio.',
      TERMINOS_NO_ACEPTADOS:       'Debés aceptar los términos.',
      CONFIGURACION_INCOMPLETA:    'Error de configuración del sistema. Contactá soporte.',
      ERROR_CREAR_CLIENTE:         'Error al registrar tus datos. Intentá de nuevo.',
      ERROR_CREAR_ORDEN:           'Error al crear tu orden. Intentá de nuevo.',
      MP_TOKEN_TAROT_TEST_MISSING: 'El sistema de pago no está configurado. Contactá soporte.',
      MP_TOKEN_TAROT_PROD_MISSING: 'El sistema de pago no está configurado. Contactá soporte.',
      MP_MODO_INVALIDO:            'Error de configuración del sistema de pago. Contactá soporte.',
      MP_PREFERENCE_ERROR:         'No se pudo iniciar el pago. Intentá más tarde.',
      CODIGO_DESCUENTO_NO_ENCONTRADO: 'El código de descuento no es válido.',
      CODIGO_DESCUENTO_NO_RESERVADO:  'El código de descuento ya no está reservado.',
      CODIGO_DESCUENTO_EXPIRADO:      'Tu código de descuento expiró. Volvé a aplicarlo.',
      CODIGO_CORTESIA_NO_VIGENTE:     'Este código ya no está vigente.',
      CODIGO_CORTESIA_LIMITE_CLIENTE: 'Ya utilizaste este código.',
      ORDEN_SIN_IMPORTE_NO_AUTORIZADA: 'Este código no se puede usar para una lectura sin cargo.',
    };
    const friendlyError = errorMap[data?.error as string] ?? 'Error inesperado. Intentá de nuevo.';
    return NextResponse.json(
      { ok: false, error: data?.error, message: friendlyError },
      { status: efRes.ok ? 500 : efRes.status },
    );
  }

  // Handoff efímero para /tarot/gracias → /lectura (2026-10-20): cookie
  // sellada atada a ESTA orden en ESTE navegador. Nunca bloquea el checkout.
  if (typeof data.external_reference === 'string') {
    try { await emitirHandoffGracias(data.external_reference); } catch { /* sin handoff: /gracias degrada */ }
  }

  // Cortesía (2026-10-18): orden gratuita, sin Mercado Pago. El checkout va
  // directo a /tarot/gracias con la misma referencia que usaría MP.
  if (data.gratuita === true && data.external_reference) {
    return NextResponse.json({
      ok:                 true,
      gratuita:           true,
      orden_id:           data.orden_id,
      external_reference: data.external_reference,
      redirect_url:       `/tarot/gracias?ref=${encodeURIComponent(data.external_reference)}&estado=exitoso`,
    });
  }

  return NextResponse.json({
    ok:                 true,
    orden_id:           data.orden_id,
    external_reference: data.external_reference,
    // El checkout espera init_point
    init_point:         data.link_pago,
  });
}
