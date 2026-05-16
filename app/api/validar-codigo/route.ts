import { NextResponse } from 'next/server';

const TIPOS_PERMITIDOS_MVP = ['porcentaje', 'monto_fijo'];

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.codigo) {
      return NextResponse.json({ ok: false, error: 'Código requerido' }, { status: 400 });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const INTERNAL_KEY = process.env.WHATSAPP_INTERNAL_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY || !INTERNAL_KEY) {
      console.error('[validar-codigo] Faltan variables de entorno');
      return NextResponse.json({ ok: false, error: 'Error interno de configuración' }, { status: 500 });
    }

    const efRes = await fetch(`${SUPABASE_URL}/functions/v1/ef_validar_codigo_descuento`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'x-internal-key': INTERNAL_KEY,
      },
      body: JSON.stringify({
        codigo: String(body.codigo).trim().toUpperCase(),
        id_suscriptor: body.id_suscriptor ?? undefined,
        whatsapp: body.whatsapp ?? undefined,
        email: body.email ?? undefined,
        precio_base: body.precio_base ?? 390,
      }),
      cache: 'no-store',
    });

    const data = await efRes.json().catch(() => null);

    if (!efRes.ok || !data?.ok) {
      return NextResponse.json({
        ok: false,
        error: data?.mensaje_usuario || data?.error || 'Código inválido o expirado',
      });
    }

    if (!TIPOS_PERMITIDOS_MVP.includes(data.tipo_descuento)) {
      return NextResponse.json({
        ok: false,
        error: 'Este tipo de descuento no está disponible actualmente',
      });
    }

    return NextResponse.json({
      ok: true,
      codigo_id: data.codigo_id,
      tipo_descuento: data.tipo_descuento,
      precio_original: data.precio_original,
      precio_aplicado: data.precio_aplicado,
      valor_descuento_aplicado: data.valor_descuento_aplicado,
      mensaje_usuario: data.mensaje_usuario,
    });
  } catch (err) {
    console.error('[validar-codigo] Excepción:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
