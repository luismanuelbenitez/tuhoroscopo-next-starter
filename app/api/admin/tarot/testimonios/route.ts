import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/adminSession';
import { restHeaders, resolverOrden, motivoDesdeError } from '@/lib/adminTestimonios';

export const dynamic = 'force-dynamic';

// Testimonios de Tu Tirada Tarot (tabla tarot_testimonios). La web solo
// muestra los que tienen publicado = true; la base impide publicar sin
// opinión, puntuación y autorización del cliente
// (chk_tarot_testimonios_publicable). El nombre se completa solo desde el
// cliente de la orden si no se carga a mano (trigger en la base).

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: 'unauthorized' }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: 'config_error' }, { status: 500 });

  const { searchParams } = req.nextUrl;
  const filtros: string[] = [];
  const publicado = searchParams.get('publicado');
  if (publicado === 'true' || publicado === 'false') filtros.push(`publicado=eq.${publicado}`);
  const estado = searchParams.get('estado_encuesta');
  if (estado) filtros.push(`estado_encuesta=eq.${encodeURIComponent(estado)}`);

  const select = 'id,opinion,puntuacion,nombre,ciudad,autoriza_publicacion,autoriza_difusion,campana_id,feedback_respuesta_id,publicado,publicado_at,orden_visual,canal,estado_encuesta,encuesta_enviada_at,respondida_at,notas_internas,created_at,orden_id,tarot_ordenes(external_reference)';
  const query = [`select=${select}`, ...filtros, 'order=created_at.desc', 'limit=200'].join('&');

  const res = await fetch(`${env.supabaseUrl}/rest/v1/tarot_testimonios?${query}`, {
    headers: restHeaders(env.serviceRoleKey),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json({ ok: false, motivo: 'db_error', detalle: data?.message ?? `HTTP ${res.status}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, testimonios: data });
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: 'unauthorized' }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: 'config_error' }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }

  const opinion = typeof body.opinion === 'string' ? body.opinion.trim() : '';
  if (!opinion) return NextResponse.json({ ok: false, motivo: 'opinion_requerida', detalle: 'La opinión es obligatoria.' }, { status: 400 });
  if (opinion.length > 600) return NextResponse.json({ ok: false, motivo: 'opinion_larga', detalle: 'Máximo 600 caracteres.' }, { status: 400 });

  const puntuacion = Number(body.puntuacion);
  if (!Number.isInteger(puntuacion) || puntuacion < 0 || puntuacion > 5) {
    return NextResponse.json({ ok: false, motivo: 'puntuacion_invalida', detalle: 'Las estrellas van de 0 a 5.' }, { status: 400 });
  }

  const record: Record<string, unknown> = {
    opinion,
    puntuacion,
    nombre: typeof body.nombre === 'string' && body.nombre.trim() ? body.nombre.trim() : null,
    ciudad: typeof body.ciudad === 'string' && body.ciudad.trim() ? body.ciudad.trim() : null,
    autoriza_publicacion: body.autoriza_publicacion === true,
    publicado: body.publicado === true,
    orden_visual: Number.isFinite(Number(body.orden_visual)) ? Math.trunc(Number(body.orden_visual)) : 0,
    canal: 'manual',
    estado_encuesta: 'respondida',
    respondida_at: new Date().toISOString(),
    notas_internas: typeof body.notas_internas === 'string' && body.notas_internas.trim() ? body.notas_internas.trim() : null,
  };

  if (typeof body.orden === 'string' && body.orden.trim()) {
    const orden = await resolverOrden(supabaseUrl, serviceRoleKey, body.orden);
    if ('error' in orden) {
      return NextResponse.json(
        { ok: false, motivo: orden.error, detalle: orden.error === 'orden_no_encontrada' ? 'No existe una orden con esa referencia.' : 'Error buscando la orden.' },
        { status: orden.error === 'orden_no_encontrada' ? 404 : 500 },
      );
    }
    record.orden_id = orden.id;
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/tarot_testimonios`, {
    method: 'POST',
    headers: restHeaders(serviceRoleKey, { Prefer: 'return=representation' }),
    body: JSON.stringify(record),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = motivoDesdeError(String(data?.message ?? data?.details ?? `HTTP ${res.status}`));
    return NextResponse.json({ ok: false, motivo: e.motivo, detalle: e.detalle }, { status: e.status });
  }

  return NextResponse.json({ ok: true, testimonio: Array.isArray(data) ? data[0] : data }, { status: 201 });
}
