import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: 'Cuerpo inválido' }, { status: 400 });
  }

  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
      TERMINOS_NO_ACEPTADOS:       'Debés aceptar los términos.',
      CONFIGURACION_INCOMPLETA:    'Error de configuración del sistema. Contactá soporte.',
      ERROR_CREAR_CLIENTE:         'Error al registrar tus datos. Intentá de nuevo.',
      ERROR_CREAR_ORDEN:           'Error al crear tu orden. Intentá de nuevo.',
      MP_TOKEN_NO_CONFIGURADO:     'El sistema de pago no está configurado. Contactá soporte.',
      MP_PREFERENCE_ERROR:         'No se pudo iniciar el pago. Intentá más tarde.',
      CODIGO_DESCUENTO_NO_ENCONTRADO: 'El código de descuento no es válido.',
      CODIGO_DESCUENTO_NO_RESERVADO:  'El código de descuento ya no está reservado.',
      CODIGO_DESCUENTO_EXPIRADO:      'Tu código de descuento expiró. Volvé a aplicarlo.',
    };
    const friendlyError = errorMap[data?.error as string] ?? 'Error inesperado. Intentá de nuevo.';
    return NextResponse.json(
      { ok: false, error: data?.error, message: friendlyError },
      { status: efRes.ok ? 500 : efRes.status },
    );
  }

  return NextResponse.json({
    ok:                 true,
    orden_id:           data.orden_id,
    external_reference: data.external_reference,
    // El checkout espera init_point
    init_point:         data.link_pago,
  });
}
