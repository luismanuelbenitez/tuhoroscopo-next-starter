import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { event_name, session_id, order_id, product_id, product_name, path, value, currency, metadata } = body;
    if (!event_name) return NextResponse.json({ ok: false });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false } },
    );

    await supabase.from('funnel_events').insert({
      session_id:   session_id  ?? null,
      order_id:     order_id    ?? null,
      event_name,
      product_id:   product_id  ?? null,
      product_name: product_name ?? null,
      path:         path        ?? null,
      value:        value       ?? null,
      currency:     currency    ?? 'UYU',
      metadata:     metadata    ?? {},
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
