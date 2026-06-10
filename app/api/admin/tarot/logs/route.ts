import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type RawLog = {
  id?: string;
  orden_id?: string;
  cliente_id?: string;
  evento?: string;
  nivel?: string;
  mensaje?: string;
  payload?: Record<string, unknown>;
  duracion_ms?: number;
  funcion_origen?: string;
  created_at?: string;
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

  const orden_id = searchParams.get("orden_id");
  if (orden_id) efBody.orden_id = orden_id;

  const cliente_id = searchParams.get("cliente_id");
  if (cliente_id) efBody.cliente_id = cliente_id;

  const evento = searchParams.get("evento");
  if (evento) efBody.evento = evento;

  const nivel = searchParams.get("nivel");
  if (nivel) efBody.nivel = nivel;

  const funcion_origen = searchParams.get("funcion_origen");
  if (funcion_origen) efBody.funcion_origen = funcion_origen;

  const soloErroresRaw = searchParams.get("solo_errores");
  if (soloErroresRaw === "true") efBody.solo_errores = true;

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
    res = await callEF(`${supabaseUrl}/functions/v1/ef_tarot_admin_listar_logs`, internalKey, serviceRoleKey, efBody);
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

  const logs = Array.isArray(data.logs)
    ? (data.logs as RawLog[]).map((l) => ({
        id: l.id ?? "",
        orden_id: l.orden_id ?? null,
        cliente_id: l.cliente_id ?? null,
        evento: l.evento ?? "",
        nivel: l.nivel ?? "info",
        mensaje: l.mensaje ?? null,
        payload: l.payload ?? {},
        duracion_ms: l.duracion_ms ?? null,
        funcion_origen: l.funcion_origen ?? null,
        created_at: l.created_at ?? "",
      }))
    : [];

  return NextResponse.json({
    ok: data.ok ?? false,
    paginacion: data.paginacion ?? null,
    conteos_pagina: data.conteos_pagina ?? null,
    logs,
  });
}
