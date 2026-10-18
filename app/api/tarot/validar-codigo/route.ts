import { NextResponse } from 'next/server';

const MOTIVOS: Record<string, string> = {
  codigo_requerido:              'Ingresá un código.',
  moneda_invalida:               'Moneda no válida.',
  precio_base_invalido:          'Precio base inválido.',
  codigo_no_encontrado:          'El código no existe.',
  codigo_inactivo:               'Este código no está activo.',
  fuera_de_vigencia:             'Este código todavía no está vigente.',
  codigo_expirado:               'Este código ya venció.',
  moneda_no_aplica:              'Este código no aplica para tu moneda.',
  cupo_agotado:                  'Este código ya no tiene cupo disponible.',
  limite_por_cliente_alcanzado:  'Ya utilizaste este código.',
  solo_nuevos_clientes:          'Este código es exclusivo para nuevos clientes.',
  error_calculo_descuento:       'Error al calcular el descuento.',
};

async function esCodigoDeCortesia(supabaseUrl: string, serviceRoleKey: string, codigoId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/tarot_codigos_descuento?id=eq.${encodeURIComponent(codigoId)}&select=habilita_orden_gratuita&limit=1`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }, cache: 'no-store' },
    );
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows[0]?.habilita_orden_gratuita === true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.codigo || !body?.precio_base || !body?.moneda) {
    return NextResponse.json({ ok: false, error: 'Parámetros requeridos: codigo, precio_base, moneda' }, { status: 400 });
  }

  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  const internalKey    = process.env.TAROT_INTERNAL_KEY;

  if (!supabaseUrl || !serviceRoleKey || !internalKey) {
    console.error('[tarot/validar-codigo] Variables de entorno faltantes');
    return NextResponse.json({ ok: false, error: 'Error de configuración del servidor' }, { status: 500 });
  }

  let efRes: Response;
  try {
    efRes = await fetch(`${supabaseUrl}/functions/v1/ef_tarot_validar_codigo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        'x-internal-key': internalKey,
      },
      body: JSON.stringify({
        codigo:      String(body.codigo).trim(),
        moneda:      String(body.moneda).toUpperCase(),
        precio_base: Number(body.precio_base),
        telefono:    body.telefono  ?? undefined,
        email:       body.email     ?? undefined,
        cliente_id:  body.cliente_id ?? undefined,
        orden_id:    body.orden_id   ?? undefined,
        origen:      'formulario_web',
      }),
      cache: 'no-store',
    });
  } catch (e) {
    console.error('[tarot/validar-codigo] Fetch error:', e);
    return NextResponse.json({ ok: false, error: 'No se pudo conectar con el servidor' }, { status: 502 });
  }

  const data = await efRes.json().catch(() => null);

  if (!efRes.ok) {
    return NextResponse.json({ ok: false, error: 'Error al validar el código' }, { status: 502 });
  }

  if (!data?.valido) {
    const motivo = data?.motivo as string | undefined;
    return NextResponse.json({
      ok:     true,
      valido: false,
      error:  MOTIVOS[motivo ?? ''] ?? 'Código inválido o expirado.',
      motivo,
    });
  }

  // Cortesía (2026-10-18): el flag vive en tarot_codigos_descuento y se lee
  // acá, server-side — el frontend nunca decide qué código es gratuito. Solo
  // cambia la UI (total $0, CTA sin pago); la autorización real se vuelve a
  // verificar en ef_tarot_crear_orden al crear la orden.
  const ordenGratuita = Number(data.precio_aplicado) === 0 && data.codigo_id
    ? await esCodigoDeCortesia(supabaseUrl, serviceRoleKey, String(data.codigo_id))
    : false;

  return NextResponse.json({
    ok:                 true,
    valido:             true,
    orden_gratuita:     ordenGratuita,
    uso_id:             data.uso_id,
    codigo_id:          data.codigo_id,
    tipo_descuento:     data.tipo_descuento,
    precio_original:    data.precio_original,
    precio_aplicado:    data.precio_aplicado,
    descuento_aplicado: data.descuento_aplicado,
    moneda:             data.moneda,
    expira_at:          data.expira_at,
  });
}
