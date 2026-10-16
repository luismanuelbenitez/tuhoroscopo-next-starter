import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/adminSession';
import { restHeaders, resolverOrden, motivoDesdeError } from '@/lib/adminTestimonios';

export const dynamic = 'force-dynamic';

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: 'unauthorized' }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: 'config_error' }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }

  const patch: Record<string, unknown> = {};

  if (body.opinion !== undefined) {
    const opinion = typeof body.opinion === 'string' ? body.opinion.trim() : '';
    if (opinion.length > 600) return NextResponse.json({ ok: false, motivo: 'opinion_larga', detalle: 'Máximo 600 caracteres.' }, { status: 400 });
    patch.opinion = opinion || null;
  }
  if (body.puntuacion !== undefined) {
    const p = Number(body.puntuacion);
    if (!Number.isInteger(p) || p < 0 || p > 5) {
      return NextResponse.json({ ok: false, motivo: 'puntuacion_invalida', detalle: 'Las estrellas van de 0 a 5.' }, { status: 400 });
    }
    patch.puntuacion = p;
  }
  if (body.nombre !== undefined) patch.nombre = typeof body.nombre === 'string' && body.nombre.trim() ? body.nombre.trim() : null;
  if (body.ciudad !== undefined) patch.ciudad = typeof body.ciudad === 'string' && body.ciudad.trim() ? body.ciudad.trim() : null;
  if (body.autoriza_publicacion !== undefined) patch.autoriza_publicacion = body.autoriza_publicacion === true;
  if (body.publicado !== undefined) {
    patch.publicado = body.publicado === true;
    if (body.publicado !== true) patch.publicado_at = null;
  }
  if (body.orden_visual !== undefined && Number.isFinite(Number(body.orden_visual))) patch.orden_visual = Math.trunc(Number(body.orden_visual));
  if (body.notas_internas !== undefined) patch.notas_internas = typeof body.notas_internas === 'string' && body.notas_internas.trim() ? body.notas_internas.trim() : null;

  if (body.orden !== undefined) {
    if (typeof body.orden === 'string' && body.orden.trim()) {
      const orden = await resolverOrden(supabaseUrl, serviceRoleKey, body.orden);
      if ('error' in orden) {
        return NextResponse.json(
          { ok: false, motivo: orden.error, detalle: orden.error === 'orden_no_encontrada' ? 'No existe una orden con esa referencia.' : 'Error buscando la orden.' },
          { status: orden.error === 'orden_no_encontrada' ? 404 : 500 },
        );
      }
      patch.orden_id = orden.id;
    } else {
      patch.orden_id = null;
      patch.cliente_id = null;
    }
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, motivo: 'sin_cambios' }, { status: 400 });

  const res = await fetch(`${supabaseUrl}/rest/v1/tarot_testimonios?id=eq.${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    headers: restHeaders(serviceRoleKey, { Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = motivoDesdeError(String(data?.message ?? data?.details ?? `HTTP ${res.status}`));
    return NextResponse.json({ ok: false, motivo: e.motivo, detalle: e.detalle }, { status: e.status });
  }
  if (!Array.isArray(data) || data.length === 0) return NextResponse.json({ ok: false, motivo: 'no_encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true, testimonio: data[0] });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: 'unauthorized' }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: 'config_error' }, { status: 500 });

  const res = await fetch(`${env.supabaseUrl}/rest/v1/tarot_testimonios?id=eq.${encodeURIComponent(params.id)}`, {
    method: 'DELETE',
    headers: restHeaders(env.serviceRoleKey, { Prefer: 'return=representation' }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json({ ok: false, motivo: 'db_error', detalle: data?.message ?? `HTTP ${res.status}` }, { status: 500 });
  if (!Array.isArray(data) || data.length === 0) return NextResponse.json({ ok: false, motivo: 'no_encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
