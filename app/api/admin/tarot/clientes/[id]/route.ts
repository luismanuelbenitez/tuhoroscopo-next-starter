import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function restHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;
  const { id } = params;

  const h = restHeaders(serviceRoleKey);

  const [rCliente, rOrdenes, rCupones] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/tarot_clientes?id=eq.${id}` +
        `&select=id,nombre_completo,telefono,email,fecha_nacimiento,hora_nacimiento,` +
        `lugar_nacimiento,acepto_terminos,acepto_privacidad,version_terminos,created_at,updated_at`,
      { headers: h, cache: "no-store" },
    ),
    // Ordenes with embedded pagos (FK: tarot_pagos.orden_id → tarot_ordenes.id)
    fetch(
      `${supabaseUrl}/rest/v1/tarot_ordenes?cliente_id=eq.${id}` +
        `&select=id,estado,tema,pregunta_usuario,precio_cobrado,moneda,created_at,` +
        `tarot_pagos(id,mp_status,mp_payment_type,mp_installments,monto,moneda,created_at)` +
        `&order=created_at.desc&limit=20`,
      { headers: h, cache: "no-store" },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/tarot_codigos_descuento_usos?cliente_id=eq.${id}` +
        `&select=id,codigo,estado_uso,moneda,precio_original,precio_aplicado,descuento_aplicado,fecha_aplicacion` +
        `&order=created_at.desc&limit=10`,
      { headers: h, cache: "no-store" },
    ),
  ]);

  const [clienteArr, ordenes, cupones] = await Promise.all([
    rCliente.ok ? rCliente.json().catch(() => []) : [],
    rOrdenes.ok ? rOrdenes.json().catch(() => []) : [],
    rCupones.ok ? rCupones.json().catch(() => []) : [],
  ]);

  const cliente = Array.isArray(clienteArr) && clienteArr.length > 0 ? clienteArr[0] : null;
  if (!cliente) {
    return NextResponse.json({ ok: false, motivo: "cliente_no_encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, cliente, ordenes, cupones });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;
  const { id } = params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "body_invalido" }, { status: 400 });
  }

  const EDITABLES = ["nombre_completo", "email", "telefono", "fecha_nacimiento"] as const;
  const updates: Record<string, unknown> = {};
  for (const campo of EDITABLES) {
    if (body[campo] !== undefined) updates[campo] = body[campo] ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, motivo: "sin_cambios" }, { status: 400 });
  }

  if (updates.nombre_completo !== undefined) {
    const nombre = String(updates.nombre_completo ?? "").trim();
    if (!nombre) return NextResponse.json({ ok: false, motivo: "nombre_requerido" }, { status: 400 });
    updates.nombre_completo = nombre;
  }
  if (updates.email !== undefined && updates.email !== null) {
    updates.email = String(updates.email).trim() || null;
  }
  if (updates.telefono !== undefined && updates.telefono !== null) {
    updates.telefono = String(updates.telefono).trim() || null;
  }

  updates.updated_at = new Date().toISOString();

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_clientes?id=eq.${id}`,
    {
      method: "PATCH",
      headers: { ...restHeaders(serviceRoleKey), Prefer: "return=representation" },
      body: JSON.stringify(updates),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    return NextResponse.json(
      { ok: false, motivo: "db_error", detalle: (err.message as string) ?? `HTTP ${res.status}` },
      { status: 500 },
    );
  }

  const data = await res.json().catch(() => []) as unknown[];
  return NextResponse.json({
    ok: true,
    cliente: Array.isArray(data) && data.length > 0 ? data[0] : null,
  });
}
