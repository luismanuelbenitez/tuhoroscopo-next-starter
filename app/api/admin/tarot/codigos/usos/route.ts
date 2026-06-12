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

  const codigoId = searchParams.get('codigo_id')?.trim();
  if (codigoId) efBody.codigo_id = codigoId;

  const codigo = searchParams.get('codigo')?.trim();
  if (codigo) efBody.codigo = codigo;

  const estadoUso = searchParams.get('estado_uso')?.trim();
  if (estadoUso) efBody.estado_uso = estadoUso;

  const ordenId = searchParams.get('orden_id')?.trim();
  if (ordenId) efBody.orden_id = ordenId;

  const clienteId = searchParams.get('cliente_id')?.trim();
  if (clienteId) efBody.cliente_id = clienteId;

  const fechaDesde = searchParams.get('fecha_desde')?.trim();
  if (fechaDesde) efBody.fecha_desde = fechaDesde;

  const fechaHasta = searchParams.get('fecha_hasta')?.trim();
  if (fechaHasta) efBody.fecha_hasta = fechaHasta;

  const page    = parseInt(searchParams.get('page')     ?? '1',  10);
  const perPage = parseInt(searchParams.get('per_page') ?? '20', 10);
  efBody.page     = Number.isFinite(page)    && page    > 0 ? page    : 1;
  efBody.per_page = Number.isFinite(perPage) && perPage > 0 ? Math.min(100, perPage) : 20;

  let res: Response;
  try {
    res = await callEF(
      `${env.supabaseUrl}/functions/v1/ef_tarot_admin_listar_usos_codigo`,
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
