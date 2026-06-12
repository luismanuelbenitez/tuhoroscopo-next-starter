import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

const TIPOS_VALIDOS = ['porcentaje', 'monto_fijo', 'precio_fijo'];

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function restHeaders(serviceRoleKey: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    ...extra,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: 'unauthorized' }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: 'config_error' }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const id = params.id;
  if (!id) return NextResponse.json({ ok: false, motivo: 'id_requerido' }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }

  const patch: Record<string, unknown> = { actualizado_por: 'admin_panel' };

  // tipo_descuento: si cambia hay que re-validar los campos de valor
  if (body.tipo_descuento !== undefined) {
    if (!TIPOS_VALIDOS.includes(body.tipo_descuento as string)) {
      return NextResponse.json({ ok: false, motivo: 'tipo_invalido' }, { status: 400 });
    }
    patch.tipo_descuento = body.tipo_descuento;
  }

  if (body.activo !== undefined) patch.activo = body.activo === true;

  if (body.descripcion !== undefined)
    patch.descripcion = body.descripcion ? String(body.descripcion).trim() || null : null;

  if (body.valor_descuento !== undefined) {
    const v = Number(body.valor_descuento);
    if (!Number.isFinite(v) || v <= 0) return NextResponse.json({ ok: false, motivo: 'valor_invalido' }, { status: 400 });
    patch.valor_descuento = v;
    // clear precio_fijo fields when switching to non-precio_fijo type
    patch.precio_fijo_uyu = null;
    patch.precio_fijo_ars = null;
  }

  if (body.precio_fijo_uyu !== undefined) patch.precio_fijo_uyu = Number(body.precio_fijo_uyu) || null;
  if (body.precio_fijo_ars !== undefined) patch.precio_fijo_ars = Number(body.precio_fijo_ars) || null;

  if (body.fecha_inicio !== undefined) patch.fecha_inicio = body.fecha_inicio || null;
  if (body.fecha_fin    !== undefined) patch.fecha_fin    = body.fecha_fin    || null;

  if (body.max_usos_total !== undefined) {
    const m = body.max_usos_total === '' || body.max_usos_total === null ? null : Number(body.max_usos_total);
    patch.max_usos_total = m && m > 0 ? m : null;
  }

  if (body.max_usos_por_cliente !== undefined) {
    const m = Number(body.max_usos_por_cliente);
    if (m > 0) patch.max_usos_por_cliente = m;
  }

  if (body.solo_nuevos_clientes !== undefined) patch.solo_nuevos_clientes = body.solo_nuevos_clientes === true;
  if (body.campania !== undefined) patch.campania = body.campania ? String(body.campania).trim() || null : null;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_codigos_descuento?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: restHeaders(serviceRoleKey, { Prefer: 'return=representation' }),
      body: JSON.stringify(patch),
      cache: 'no-store',
    },
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json({ ok: false, motivo: 'db_error', detalle: data?.message ?? `HTTP ${res.status}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, codigo: Array.isArray(data) ? data[0] : data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: 'unauthorized' }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: 'config_error' }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const id = params.id;
  if (!id) return NextResponse.json({ ok: false, motivo: 'id_requerido' }, { status: 400 });

  // Verificar que no tenga usos antes de borrar
  const check = await fetch(
    `${supabaseUrl}/rest/v1/tarot_codigos_descuento?id=eq.${encodeURIComponent(id)}&select=id,codigo,usos_actuales&limit=1`,
    { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey }, cache: 'no-store' },
  );
  const rows = await check.json().catch(() => null);
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ ok: false, motivo: 'no_encontrado' }, { status: 404 });
  }
  if ((rows[0].usos_actuales ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, motivo: 'tiene_usos', detalle: `El código "${rows[0].codigo}" tiene ${rows[0].usos_actuales} uso(s) y no puede eliminarse. Desactivalo en su lugar.` },
      { status: 409 },
    );
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_codigos_descuento?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    return NextResponse.json({ ok: false, motivo: 'db_error', detalle: `HTTP ${res.status}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
