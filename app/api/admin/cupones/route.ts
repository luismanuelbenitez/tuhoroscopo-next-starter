import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

const TIPOS_NO_MVP = ['primera_cuota', 'dias_gratis', 'meses_gratis'];

type CuponRaw = {
  id: string;
  codigo: string;
  descripcion: string | null;
  tipo_descuento: string;
  valor_descuento: number | null;
  moneda: string | null;
  precio_recurrente_normal: number | null;
  precio_primera_cuota: number | null;
  cantidad_ciclos_descuento: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  max_usos_total: number | null;
  usos_actuales: number;
  max_usos_por_usuario: number | null;
  solo_nuevos_usuarios: boolean | null;
  solo_usuarios_existentes: boolean | null;
  aplica_a_producto: string | null;
  aplica_a_plan: string | null;
  activo: boolean;
  metadata: Record<string, unknown> | null;
  creado_en: string | null;
  actualizado_en: string | null;
  creado_por: string | null;
  actualizado_por: string | null;
};

function cuponVencido(c: CuponRaw): boolean {
  if (!c.fecha_fin) return false;
  return new Date(c.fecha_fin) < new Date();
}

function usosAgotados(c: CuponRaw): boolean {
  if (c.max_usos_total === null) return false;
  return c.usos_actuales >= c.max_usos_total;
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, motivo: 'config_error', detalle: 'Variables de entorno no configuradas' },
      { status: 500 }
    );
  }

  const { searchParams } = req.nextUrl;
  const busqueda = searchParams.get('busqueda')?.trim().toLowerCase() ?? '';
  const activoFilter = searchParams.get('activo') ?? '';   // 'true' | 'false' | ''
  const tipoFilter = searchParams.get('tipo') ?? '';
  const vencidosOnly = searchParams.get('vencidos') === 'true';
  const productoFilter = searchParams.get('producto')?.trim() ?? '';
  const planFilter = searchParams.get('plan')?.trim() ?? '';

  // Build PostgREST params — fetch all and filter client-side where needed
  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('order', 'creado_en.desc');
  params.set('limit', '500');

  if (activoFilter === 'true') params.set('activo', 'eq.true');
  if (activoFilter === 'false') params.set('activo', 'eq.false');
  if (tipoFilter) params.set('tipo_descuento', `eq.${tipoFilter}`);
  if (productoFilter) params.set('aplica_a_producto', `eq.${productoFilter}`);
  if (planFilter) params.set('aplica_a_plan', `eq.${planFilter}`);

  let cupones: CuponRaw[] = [];
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/codigos_descuento?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json(
        { ok: false, motivo: 'db_error', detalle: errText },
        { status: 502 }
      );
    }
    cupones = await res.json();
  } catch (e) {
    return NextResponse.json(
      { ok: false, motivo: 'fetch_error', detalle: String(e) },
      { status: 502 }
    );
  }

  // Client-side filters that PostgREST can't do easily
  if (busqueda) {
    cupones = cupones.filter(
      (c) =>
        c.codigo.toLowerCase().includes(busqueda) ||
        (c.descripcion ?? '').toLowerCase().includes(busqueda)
    );
  }
  if (vencidosOnly) {
    cupones = cupones.filter(cuponVencido);
  }

  // Compute summary from the (possibly filtered) list
  const ahora = new Date();
  const vencidos = cupones.filter((c) => c.fecha_fin && new Date(c.fecha_fin) < ahora);
  const activos = cupones.filter(
    (c) => c.activo && !(c.fecha_fin && new Date(c.fecha_fin) < ahora)
  );
  const inactivos = cupones.filter((c) => !c.activo);
  const usosTotales = cupones.reduce((s, c) => s + (c.usos_actuales ?? 0), 0);

  // Get total applied usages count (separate table)
  let aplicadosTotales = 0;
  try {
    const usosRes = await fetch(
      `${supabaseUrl}/rest/v1/codigos_descuento_usos?select=id&estado_uso=eq.aplicado&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          Prefer: 'count=exact',
        },
        cache: 'no-store',
      }
    );
    const rangeHeader = usosRes.headers.get('content-range');
    if (rangeHeader) {
      const match = rangeHeader.match(/\/(\d+)$/);
      if (match) aplicadosTotales = parseInt(match[1], 10);
    }
  } catch {
    // non-fatal — leave at 0
  }

  // Attach computed flags to each coupon
  const result = cupones.map((c) => ({
    ...c,
    computed: {
      vencido: cuponVencido(c),
      usos_agotados: usosAgotados(c),
      tipo_no_soportado_mvp: TIPOS_NO_MVP.includes(c.tipo_descuento),
    },
  }));

  return NextResponse.json({
    ok: true,
    resumen: {
      total: cupones.length,
      activos: activos.length,
      inactivos: inactivos.length,
      vencidos: vencidos.length,
      usos_totales: usosTotales,
      aplicados_totales: aplicadosTotales,
    },
    cupones: result,
  });
}
