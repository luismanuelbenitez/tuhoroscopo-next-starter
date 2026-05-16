import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

const TIPOS_PERMITIDOS_CREAR = ['porcentaje', 'monto_fijo'];
const CAMPOS_SEGUROS_EDITAR = [
  'descripcion',
  'activo',
  'fecha_inicio',
  'fecha_fin',
  'max_usos_total',
  'max_usos_por_usuario',
  'aplica_a_producto',
  'aplica_a_plan',
];

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function sanitizeStr(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  return String(v).trim();
}

function sanitizeNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sanitizeBool(v: unknown, fallback: boolean): boolean {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return fallback;
}

function sanitizeDate(v: unknown): string | null {
  const s = sanitizeStr(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

type ValidationResult = { ok: true } | { ok: false; error: string };

function validateCodigo(codigo: string | null): ValidationResult {
  if (!codigo) return { ok: false, error: 'El código es obligatorio.' };
  if (!/^[A-Z0-9_\-]{2,32}$/.test(codigo))
    return { ok: false, error: 'Código inválido. Usá solo letras mayúsculas, números, guiones o guiones bajos (2–32 caracteres).' };
  return { ok: true };
}

function validateValor(tipo: string, valor: number | null): ValidationResult {
  if (valor === null) return { ok: false, error: 'El valor del descuento es obligatorio.' };
  if (tipo === 'porcentaje') {
    if (valor < 1 || valor > 100) return { ok: false, error: 'Para porcentaje, el valor debe ser entre 1 y 100.' };
  } else if (tipo === 'monto_fijo') {
    if (valor <= 0) return { ok: false, error: 'Para monto fijo, el valor debe ser mayor a 0.' };
  }
  return { ok: true };
}

function validateFechas(inicio: string | null, fin: string | null): ValidationResult {
  if (inicio && fin) {
    if (new Date(fin) < new Date(inicio))
      return { ok: false, error: 'La fecha de fin no puede ser anterior a la de inicio.' };
  }
  return { ok: true };
}

function validateMax(val: number | null, label: string): ValidationResult {
  if (val !== null && (!Number.isInteger(val) || val < 1))
    return { ok: false, error: `${label} debe ser un entero positivo.` };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function dbGet(url: string, key: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function dbPost(url: string, key: string, body: Record<string, unknown>) {
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

async function dbPatch(url: string, key: string, body: Record<string, unknown>) {
  return fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return err('No autorizado', 401);

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return err('Error de configuración', 500);

  const BASE = `${supabaseUrl}/rest/v1/codigos_descuento`;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('Body inválido');
  }

  const accion = String(body.accion ?? '');

  // =========================================================================
  // CREAR
  // =========================================================================
  if (accion === 'crear') {
    const codigo = sanitizeStr(body.codigo)?.toUpperCase() ?? null;
    const descripcion = sanitizeStr(body.descripcion);
    const tipo = sanitizeStr(body.tipo_descuento);
    const valor = sanitizeNum(body.valor_descuento);
    const activo = sanitizeBool(body.activo, true);
    const fechaInicio = sanitizeDate(body.fecha_inicio);
    const fechaFin = sanitizeDate(body.fecha_fin);
    const maxUsos = sanitizeNum(body.max_usos_total);
    const maxUsosPorUser = sanitizeNum(body.max_usos_por_usuario) ?? 1;
    const precioNormal = sanitizeNum(body.precio_recurrente_normal) ?? 390;
    const producto = sanitizeStr(body.aplica_a_producto) ?? 'premium';
    const plan = sanitizeStr(body.aplica_a_plan) ?? 'mensual';
    const moneda = 'UYU';

    // Validaciones
    const vCodigo = validateCodigo(codigo);
    if (!vCodigo.ok) return err(vCodigo.error);

    if (!tipo || !TIPOS_PERMITIDOS_CREAR.includes(tipo))
      return err(`Tipo de descuento inválido. Solo se permiten: ${TIPOS_PERMITIDOS_CREAR.join(', ')}.`);

    const vValor = validateValor(tipo, valor);
    if (!vValor.ok) return err(vValor.error);

    const vFechas = validateFechas(fechaInicio, fechaFin);
    if (!vFechas.ok) return err(vFechas.error);

    const vMaxUsos = validateMax(maxUsos, 'Máximo de usos totales');
    if (!vMaxUsos.ok) return err(vMaxUsos.error);

    const vMaxPorUser = validateMax(maxUsosPorUser, 'Máximo de usos por usuario');
    if (!vMaxPorUser.ok) return err(vMaxPorUser.error);

    if (precioNormal <= 0) return err('El precio recurrente normal debe ser mayor a 0.');

    // Verificar que el código no exista ya
    const existing = await dbGet(
      `${BASE}?codigo=eq.${encodeURIComponent(codigo!)}&select=id`,
      serviceRoleKey
    );
    if (existing) return err(`Ya existe un cupón con el código "${codigo}".`);

    const payload: Record<string, unknown> = {
      codigo: codigo!,
      tipo_descuento: tipo,
      valor_descuento: valor,
      activo,
      moneda,
      precio_recurrente_normal: precioNormal,
      aplica_a_producto: producto,
      aplica_a_plan: plan,
      usos_actuales: 0,
      max_usos_por_usuario: maxUsosPorUser,
      creado_por: 'admin_panel',
      actualizado_por: 'admin_panel',
    };
    if (descripcion) payload.descripcion = descripcion;
    if (fechaInicio) payload.fecha_inicio = fechaInicio;
    if (fechaFin) payload.fecha_fin = fechaFin;
    if (maxUsos !== null) payload.max_usos_total = maxUsos;

    const res = await dbPost(BASE, serviceRoleKey, payload);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Duplicate key error
      if (detail.includes('duplicate') || detail.includes('unique')) {
        return err(`Ya existe un cupón con el código "${codigo}".`);
      }
      return err(`Error al guardar: ${detail}`, 502);
    }

    const rows = await res.json().catch(() => []);
    return NextResponse.json({ ok: true, cupon: Array.isArray(rows) ? rows[0] : rows });
  }

  // =========================================================================
  // EDITAR
  // =========================================================================
  if (accion === 'editar') {
    const id = sanitizeStr(body.id);
    if (!id) return err('id requerido');

    // Fetch current record to check usos_actuales and existence
    const actual = await dbGet(
      `${BASE}?id=eq.${encodeURIComponent(id)}&select=id,codigo,tipo_descuento,valor_descuento,usos_actuales`,
      serviceRoleKey
    );
    if (!actual) return err('Cupón no encontrado', 404);

    const tieneUsos = (actual.usos_actuales ?? 0) > 0;

    // Build update payload — always allowed fields
    const update: Record<string, unknown> = {
      actualizado_en: new Date().toISOString(),
      actualizado_por: 'admin_panel',
    };

    // Fields always editable
    for (const campo of CAMPOS_SEGUROS_EDITAR) {
      if (campo in body) {
        if (campo === 'activo') {
          update.activo = sanitizeBool(body.activo, actual.activo ?? true);
        } else if (['fecha_inicio', 'fecha_fin'].includes(campo)) {
          update[campo] = sanitizeDate(body[campo]);
        } else if (['max_usos_total', 'max_usos_por_usuario'].includes(campo)) {
          update[campo] = sanitizeNum(body[campo]);
        } else {
          const v = sanitizeStr(body[campo]);
          update[campo] = v;
        }
      }
    }

    // Validate editable-always fields
    const vFechas = validateFechas(
      (update.fecha_inicio as string | null) ?? null,
      (update.fecha_fin as string | null) ?? null
    );
    if (!vFechas.ok) return err(vFechas.error);

    if ('max_usos_total' in update) {
      const v = validateMax(update.max_usos_total as number | null, 'Máximo de usos totales');
      if (!v.ok) return err(v.error);
    }
    if ('max_usos_por_usuario' in update) {
      const v = validateMax(update.max_usos_por_usuario as number | null, 'Máximo de usos por usuario');
      if (!v.ok) return err(v.error);
    }

    // Extra fields only when no usos yet
    if (!tieneUsos) {
      if ('tipo_descuento' in body) {
        const tipo = sanitizeStr(body.tipo_descuento);
        if (!tipo || !TIPOS_PERMITIDOS_CREAR.includes(tipo))
          return err(`Tipo de descuento inválido. Solo: ${TIPOS_PERMITIDOS_CREAR.join(', ')}.`);
        update.tipo_descuento = tipo;
      }
      if ('valor_descuento' in body) {
        const tipo = (update.tipo_descuento as string) ?? actual.tipo_descuento;
        const valor = sanitizeNum(body.valor_descuento);
        const vv = validateValor(tipo, valor);
        if (!vv.ok) return err(vv.error);
        update.valor_descuento = valor;
      }
      if ('precio_recurrente_normal' in body) {
        const p = sanitizeNum(body.precio_recurrente_normal);
        if (p !== null && p <= 0) return err('El precio recurrente normal debe ser mayor a 0.');
        update.precio_recurrente_normal = p;
      }
    }

    const res = await dbPatch(
      `${BASE}?id=eq.${encodeURIComponent(id)}`,
      serviceRoleKey,
      update
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return err(`Error al actualizar: ${detail}`, 502);
    }

    const rows = await res.json().catch(() => []);
    return NextResponse.json({
      ok: true,
      cupon: Array.isArray(rows) ? rows[0] : rows,
      tenia_usos: tieneUsos,
    });
  }

  // =========================================================================
  // TOGGLE ACTIVO
  // =========================================================================
  if (accion === 'toggle_activo') {
    const id = sanitizeStr(body.id);
    const nuevoActivo = body.activo;
    if (!id) return err('id requerido');
    if (typeof nuevoActivo !== 'boolean') return err('activo debe ser boolean');

    const actual = await dbGet(
      `${BASE}?id=eq.${encodeURIComponent(id)}&select=id,codigo`,
      serviceRoleKey
    );
    if (!actual) return err('Cupón no encontrado', 404);

    const res = await dbPatch(
      `${BASE}?id=eq.${encodeURIComponent(id)}`,
      serviceRoleKey,
      {
        activo: nuevoActivo,
        actualizado_en: new Date().toISOString(),
        actualizado_por: 'admin_panel',
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return err(`Error al cambiar estado: ${detail}`, 502);
    }

    return NextResponse.json({ ok: true, activo: nuevoActivo, codigo: actual.codigo });
  }

  return err(`Acción desconocida: "${accion}"`);
}
