import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

const TIPOS_VALIDOS = ['porcentaje', 'monto_fijo', 'precio_fijo'] as const;
type TipoDescuento = typeof TIPOS_VALIDOS[number];

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey    = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !internalKey || !serviceRoleKey) return null;
  return { supabaseUrl, internalKey, serviceRoleKey };
}

function restHeaders(serviceRoleKey: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    ...extra,
  };
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

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: 'unauthorized' }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: 'config_error' }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }

  // Validar campos requeridos
  const codigo = typeof body.codigo === 'string' ? body.codigo.trim().toUpperCase() : '';
  if (!codigo) return NextResponse.json({ ok: false, motivo: 'codigo_requerido' }, { status: 400 });

  const tipo = body.tipo_descuento as TipoDescuento;
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ ok: false, motivo: 'tipo_invalido', detalle: 'tipo_descuento debe ser porcentaje, monto_fijo o precio_fijo' }, { status: 400 });
  }

  const record: Record<string, unknown> = {
    codigo,
    tipo_descuento: tipo,
    activo: body.activo !== false,
    max_usos_por_cliente: Number(body.max_usos_por_cliente ?? 1) || 1,
    solo_nuevos_clientes: body.solo_nuevos_clientes === true,
    creado_por: 'admin_panel',
  };

  if (tipo === 'precio_fijo') {
    const uyu = Number(body.precio_fijo_uyu);
    const ars = Number(body.precio_fijo_ars);
    if (!uyu || !ars) return NextResponse.json({ ok: false, motivo: 'precio_fijo_requerido', detalle: 'precio_fijo_uyu y precio_fijo_ars son requeridos para tipo precio_fijo' }, { status: 400 });
    record.precio_fijo_uyu = uyu;
    record.precio_fijo_ars = ars;
  } else {
    const valor = Number(body.valor_descuento);
    if (!valor || valor <= 0) return NextResponse.json({ ok: false, motivo: 'valor_requerido', detalle: 'valor_descuento requerido y debe ser mayor a 0' }, { status: 400 });
    if (tipo === 'porcentaje' && valor > 100) return NextResponse.json({ ok: false, motivo: 'valor_invalido', detalle: 'El porcentaje no puede superar 100' }, { status: 400 });
    record.valor_descuento = valor;
  }

  if (body.descripcion) record.descripcion = String(body.descripcion).trim() || null;
  if (body.fecha_inicio) record.fecha_inicio = body.fecha_inicio;
  if (body.fecha_fin)    record.fecha_fin    = body.fecha_fin;
  if (body.max_usos_total != null && body.max_usos_total !== '') {
    const max = Number(body.max_usos_total);
    if (max > 0) record.max_usos_total = max;
  }
  if (body.campania) record.campania = String(body.campania).trim() || null;

  const res = await fetch(`${supabaseUrl}/rest/v1/tarot_codigos_descuento`, {
    method: 'POST',
    headers: restHeaders(serviceRoleKey, { Prefer: 'return=representation' }),
    body: JSON.stringify(record),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const detalle = data?.message ?? data?.details ?? `HTTP ${res.status}`;
    const isUnique = detalle?.includes?.('unique') || detalle?.includes?.('duplicate');
    return NextResponse.json(
      { ok: false, motivo: isUnique ? 'codigo_duplicado' : 'db_error', detalle },
      { status: isUnique ? 409 : 500 },
    );
  }

  return NextResponse.json({ ok: true, codigo: Array.isArray(data) ? data[0] : data }, { status: 201 });
}
