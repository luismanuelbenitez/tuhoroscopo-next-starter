import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type ClienteResumen = {
  nombre_completo?: string;
  telefono?: string;
  email?: string;
};

type RawOrden = {
  id?: string;
  cliente_id?: string;
  estado?: string;
  external_reference?: string;
  pregunta_usuario?: string;
  tema?: string;
  precio_cobrado?: number | string;
  moneda?: string;
  origen_canal?: string;
  notas_internas?: string;
  created_at?: string;
  updated_at?: string;
  tarot_clientes?: ClienteResumen | null;
  diagnostico_admin?: {
    healthy?: boolean;
    warnings?: string[];
    estado_resumen?: string;
  };
};

function getEnvOrError(): { supabaseUrl: string; internalKey: string; serviceRoleKey: string } | NextResponse {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "SUPABASE_URL no configurada" }, { status: 500 });
  if (!internalKey)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "TAROT_INTERNAL_KEY no configurada" }, { status: 500 });
  if (!serviceRoleKey)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "SUPABASE_SERVICE_ROLE_KEY no configurada" }, { status: 500 });
  return { supabaseUrl, internalKey, serviceRoleKey };
}

async function callEF(
  efUrl: string,
  internalKey: string,
  serviceRoleKey: string,
  efBody: Record<string, unknown>,
): Promise<Response> {
  return fetch(efUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "x-internal-key": internalKey,
    },
    body: JSON.stringify(efBody),
    cache: "no-store",
  });
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const env = getEnvOrError();
  if (env instanceof NextResponse) return env;
  const { supabaseUrl, internalKey, serviceRoleKey } = env;

  const { searchParams } = req.nextUrl;
  const efBody: Record<string, unknown> = { log: false };

  const estado = searchParams.get("estado");
  if (estado) efBody.estado = estado;

  const tema = searchParams.get("tema");
  if (tema) efBody.tema = tema;

  const moneda = searchParams.get("moneda");
  if (moneda) efBody.moneda = moneda;

  const cliente_id = searchParams.get("cliente_id");
  if (cliente_id) efBody.cliente_id = cliente_id;

  const buscar = searchParams.get("buscar")?.trim();
  if (buscar) efBody.buscar = buscar;

  const fecha_desde = searchParams.get("fecha_desde");
  if (fecha_desde) efBody.fecha_desde = fecha_desde;

  const fecha_hasta = searchParams.get("fecha_hasta");
  if (fecha_hasta) efBody.fecha_hasta = fecha_hasta;

  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  efBody.limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;

  const offsetRaw = parseInt(searchParams.get("offset") ?? "0", 10);
  efBody.offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  let res: Response;
  try {
    res = await callEF(`${supabaseUrl}/functions/v1/ef_tarot_admin_listar_ordenes`, internalKey, serviceRoleKey, efBody);
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  if (!res.ok) {
    let efMotivo: string | null = null;
    try { const err = await res.json(); efMotivo = err.motivo ?? err.error ?? null; } catch { /* noop */ }
    return NextResponse.json(
      { ok: false, motivo: "ef_error", detalle: efMotivo ? `EF devolvió: ${efMotivo} (HTTP ${res.status})` : `Error ${res.status}`, efStatus: res.status },
      { status: 502 },
    );
  }

  const data = await res.json();

  const ordenes = Array.isArray(data.ordenes)
    ? (data.ordenes as RawOrden[]).map((o) => ({
        id: o.id ?? "",
        cliente_id: o.cliente_id ?? "",
        cliente_nombre: o.tarot_clientes?.nombre_completo ?? "",
        cliente_telefono: o.tarot_clientes?.telefono ?? "",
        cliente_email: o.tarot_clientes?.email ?? "",
        estado: o.estado ?? "",
        external_reference: o.external_reference ?? "",
        pregunta_usuario: o.pregunta_usuario ?? "",
        tema: o.tema ?? "",
        precio_cobrado: o.precio_cobrado ?? 0,
        moneda: o.moneda ?? "",
        origen_canal: o.origen_canal ?? "",
        notas_internas: o.notas_internas ?? null,
        created_at: o.created_at ?? "",
        updated_at: o.updated_at ?? "",
        estado_resumen: o.diagnostico_admin?.estado_resumen ?? "ok",
        warnings: o.diagnostico_admin?.warnings ?? [],
      }))
    : [];

  return NextResponse.json({
    ok: data.ok ?? false,
    paginacion: data.paginacion ?? null,
    conteos_pagina: data.conteos_pagina ?? null,
    resumen_texto: data.resumen_texto ?? null,
    ordenes,
  });
}
