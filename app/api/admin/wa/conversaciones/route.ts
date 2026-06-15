import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const { searchParams } = new URL(req.url);
  const estado  = searchParams.get('estado') ?? '';   // pendiente | auto_respondido | respondido | ignorado | ''
  const producto = searchParams.get('producto') ?? ''; // thc | ttc | desconocido | ''
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
  const offset  = parseInt(searchParams.get('offset') ?? '0');

  let query = `wa_conversaciones?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`;
  if (estado)   query += `&estado=eq.${encodeURIComponent(estado)}`;
  if (producto) query += `&producto=eq.${encodeURIComponent(producto)}`;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${query}`, {
      headers: {
        apikey:        serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Range-Unit':  'items',
        Range:         `${offset}-${offset + limit - 1}`,
        Prefer:        'count=exact',
      },
    });

    const data  = await res.json();
    const range = res.headers.get('content-range') ?? '';
    const total = parseInt(range.split('/')[1] ?? '0') || 0;

    return NextResponse.json({ ok: true, conversaciones: data, total, limit, offset });
  } catch (e) {
    console.error('[admin/wa/conversaciones]', e);
    return NextResponse.json({ ok: false, error: 'Error al obtener conversaciones' }, { status: 500 });
  }
}
