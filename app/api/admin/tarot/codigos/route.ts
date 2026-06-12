import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey    = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !internalKey || !serviceRoleKey) return null;
  return { supabaseUrl, internalKey, serviceRoleKey };
}

async function callEF(url: string, key: string, bearer: string, body: Record<string, unknown>) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
      'x-internal-key': key,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: 'unauthorized' }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: 'config_error' }, { status: 500 });

  const { searchParams } = req.nextUrl;
  const efBody: Record<string, unknown> = {};

  const search = searchParams.get('search')?.trim();
  if (search) efBody.search = search;

  const tipo = searchParams.get('tipo_descuento')?.trim();
  if (tipo) efBody.tipo_descuento = tipo;

  const activo = searchParams.get('activo');
  if (activo === 'true')  efBody.activo = true;
  if (activo === 'false') efBody.activo = false;

  const orden = searchParams.get('orden');
  if (orden) efBody.orden = orden;

  const page    = parseInt(searchParams.get('page')     ?? '1',  10);
  const perPage = parseInt(searchParams.get('per_page') ?? '20', 10);
  efBody.page     = Number.isFinite(page)    && page    > 0 ? page    : 1;
  efBody.per_page = Number.isFinite(perPage) && perPage > 0 ? Math.min(100, perPage) : 20;

  let res: Response;
  try {
    res = await callEF(
      `${env.supabaseUrl}/functions/v1/ef_tarot_admin_listar_codigos`,
      env.internalKey,
      env.serviceRoleKey,
      efBody,
    );
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: 'fetch_error', detalle: String(e) }, { status: 502 });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    return NextResponse.json(
      { ok: false, motivo: 'ef_error', efStatus: res.status, detalle: data?.motivo ?? '' },
      { status: 502 },
    );
  }

  return NextResponse.json(data);
}
