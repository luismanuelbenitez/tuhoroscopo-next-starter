import { NextResponse } from 'next/server';

const APPROVED_ESTADOS = new Set(['pago_confirmado', 'lectura_generada', 'pdf_listo', 'enviado']);
const APPROVED_MP      = new Set(['approved', 'authorized', 'active']);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { external_reference, estado, mp_status, params } = body;

    const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const ip             = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent      = req.headers.get('user-agent') ?? null;

    // Buscar la orden completa por external_reference
    let ordenId:  string | null  = null;
    let canFirePurchase           = false;
    let purchaseValue:  number | null = null;
    let purchaseCurrency          = 'UYU';

    if (external_reference) {
      const fetchRes = await fetch(
        `${supabaseUrl}/rest/v1/tarot_ordenes?external_reference=eq.${encodeURIComponent(external_reference)}&select=id,estado,precio_final,moneda,analytics_purchase_sent_at&limit=1`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
      );
      const rows = await fetchRes.json().catch(() => []);
      const orden = Array.isArray(rows) ? rows[0] : null;

      if (orden) {
        ordenId         = orden.id;
        purchaseValue   = orden.precio_final ?? null;
        purchaseCurrency = orden.moneda ?? 'UYU';

        const isApproved = APPROVED_ESTADOS.has(orden.estado ?? '') || APPROVED_MP.has((mp_status ?? '').toLowerCase());
        const notTracked = !orden.analytics_purchase_sent_at;

        if (isApproved && notTracked) {
          // Actualización atómica: solo afecta la fila si analytics_purchase_sent_at sigue en NULL
          const patchRes = await fetch(
            `${supabaseUrl}/rest/v1/tarot_ordenes?id=eq.${orden.id}&analytics_purchase_sent_at=is.null`,
            {
              method:  'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Prefer:         'return=minimal,count=exact',
                apikey:         serviceRoleKey,
                Authorization:  `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({ analytics_purchase_sent_at: new Date().toISOString() }),
            },
          );
          // Si el servidor actualizó exactamente 1 fila, podemos disparar el evento
          const count = parseInt(patchRes.headers.get('content-range')?.split('/')[1] ?? '0', 10);
          canFirePurchase = count > 0;
        }
      }
    }

    // Log operativo (siempre, aunque el pago no esté confirmado)
    await fetch(`${supabaseUrl}/rest/v1/tarot_logs`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer:         'return=minimal',
        apikey:         serviceRoleKey,
        Authorization:  `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        orden_id:       ordenId,
        evento:         'back_url_arrived',
        nivel:          'info',
        mensaje:        'Usuario llegó a /tarot/estado tras el pago en MP',
        payload:        { external_reference, estado, mp_status, can_fire_purchase: canFirePurchase, params: params ?? {} },
        ip,
        user_agent:     userAgent,
        funcion_origen: 'front_tarot_estado',
      }),
    });

    return NextResponse.json({
      ok:                true,
      can_fire_purchase: canFirePurchase,
      transaction_id:    canFirePurchase ? (external_reference ?? null) : null,
      value:             canFirePurchase ? purchaseValue : null,
      currency:          purchaseCurrency,
    });
  } catch (e) {
    console.error('[tarot/log-retorno]', e);
    return NextResponse.json({ ok: false, can_fire_purchase: false });
  }
}
