import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { external_reference, estado, mp_status, params } = body;

    const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const ip             = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent      = req.headers.get('user-agent') ?? null;

    // Buscar orden_id por external_reference para correlacionar el log
    let ordenId: string | null = null;
    if (external_reference) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/tarot_ordenes?external_reference=eq.${encodeURIComponent(external_reference)}&select=id&limit=1`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
      );
      const rows = await res.json().catch(() => []);
      ordenId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
    }

    await fetch(`${supabaseUrl}/rest/v1/tarot_logs`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        Prefer:          'return=minimal',
        apikey:          serviceRoleKey,
        Authorization:   `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        orden_id:       ordenId,
        evento:         'back_url_arrived',
        nivel:          'info',
        mensaje:        'Usuario llegó a /tarot/estado tras el pago en MP',
        payload:        { external_reference, estado, mp_status, params: params ?? {} },
        ip,
        user_agent:     userAgent,
        funcion_origen: 'front_tarot_estado',
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[tarot/log-retorno]', e);
    return NextResponse.json({ ok: false });
  }
}
