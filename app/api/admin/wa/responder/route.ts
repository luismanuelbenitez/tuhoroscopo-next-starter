import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const waToken        = process.env.WHATSAPP_TOKEN ?? '';
  const waPhoneId      = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';

  if (!waToken || !waPhoneId) {
    return NextResponse.json(
      { ok: false, error: 'WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados en env' },
      { status: 500 },
    );
  }

  let body: { id: string; numero_wa: string; respuesta: string; admin: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 });
  }

  const { id, numero_wa, respuesta, admin } = body;
  if (!id || !numero_wa || !respuesta?.trim()) {
    return NextResponse.json({ ok: false, error: 'Faltan campos requeridos' }, { status: 400 });
  }

  // 1. Enviar mensaje de texto libre vía WA Cloud API
  const waRes = await fetch(
    `https://graph.facebook.com/v18.0/${waPhoneId}/messages`,
    {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${waToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   numero_wa,
        type: 'text',
        text: { body: respuesta.trim() },
      }),
    },
  );

  const waData = await waRes.json().catch(() => ({}));

  if (!waRes.ok) {
    console.error('[admin/wa/responder] WA error', waData);
    return NextResponse.json(
      { ok: false, error: 'Error al enviar por WhatsApp', detalle: waData },
      { status: 502 },
    );
  }

  // 2. Marcar conversación como respondida en DB
  await fetch(
    `${supabaseUrl}/rest/v1/wa_conversaciones?id=eq.${encodeURIComponent(id)}`,
    {
      method:  'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey:         serviceRoleKey,
        Authorization:  `Bearer ${serviceRoleKey}`,
        Prefer:         'return=minimal',
      },
      body: JSON.stringify({
        estado:          'respondido',
        respuesta_texto: respuesta.trim(),
        respondido_at:   new Date().toISOString(),
        respondido_por:  admin ?? 'admin',
      }),
    },
  );

  return NextResponse.json({ ok: true, wa_message_id: waData?.messages?.[0]?.id ?? null });
}
