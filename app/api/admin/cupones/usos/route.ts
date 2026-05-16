import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

function maskId(id: string | null | undefined): string | null {
  if (!id) return null;
  return `***${String(id).slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const codigoId = searchParams.get('codigo_id')?.trim();

  if (!codigoId) {
    return NextResponse.json({ ok: false, motivo: 'codigo_id requerido' }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, motivo: 'config_error' }, { status: 500 });
  }

  const cols = [
    'id',
    'estado_uso',
    'precio_original',
    'precio_aplicado',
    'valor_descuento_aplicado',
    'fecha_reserva',
    'fecha_aplicacion',
    'fecha_cancelacion',
    'preapproval_id',
    'payment_id',
    'aplicado_por',
    'ultimo_error',
    'creado_en',
  ].join(',');

  const url = `${supabaseUrl}/rest/v1/codigos_descuento_usos?codigo_id=eq.${encodeURIComponent(codigoId)}&select=${cols}&order=creado_en.desc&limit=25`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, motivo: 'db_error' }, { status: 502 });
    }

    const usos: Record<string, unknown>[] = await res.json();

    // Mask MP IDs before sending to browser
    const usosMasked = usos.map((u) => ({
      ...u,
      preapproval_id: maskId(u.preapproval_id as string | null),
      payment_id: maskId(u.payment_id as string | null),
    }));

    return NextResponse.json({ ok: true, usos: usosMasked });
  } catch (e) {
    return NextResponse.json(
      { ok: false, motivo: 'fetch_error', detalle: String(e) },
      { status: 502 }
    );
  }
}
