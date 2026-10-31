import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type RawPdf = {
  id?: string;
  orden_id?: string;
  lectura_id?: string;
  estado?: string;
  numero_intento?: number;
  storage_bucket?: string;
  storage_path?: string;
  storage_url?: string;
  tamano_bytes?: number;
  paginas?: number;
  plantilla_usada?: string;
  error_codigo?: string;
  error_mensaje?: string;
  generado_at?: string;
  url_expira_at?: string;
  created_at?: string;
  updated_at?: string;
  diagnostico_admin?: {
    healthy?: boolean;
    warnings?: string[];
    estado_resumen?: string;
  };
};

function getEnvOrError(): { supabaseUrl: string; internalKey: string; serviceRoleKey: string } | NextResponse {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "SUPABASE_URL no configurada" }, { status: 500 });
  if (!internalKey)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "TAROT_INTERNAL_KEY no configurada" }, { status: 500 });
  if (!serviceRoleKey)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "SUPABASE_SECRET_KEY no configurada" }, { status: 500 });
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

  const estado = searchParams.get("estado");
  if (estado) efBody.estado = estado;

  const plantilla_usada = searchParams.get("plantilla_usada");
  if (plantilla_usada) efBody.plantilla_usada = plantilla_usada;

  const soloErroresRaw = searchParams.get("solo_errores");
  if (soloErroresRaw === "true") efBody.solo_errores = true;

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
    res = await callEF(`${supabaseUrl}/functions/v1/ef_tarot_admin_listar_pdfs`, internalKey, serviceRoleKey, efBody);
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

  const pdfs = Array.isArray(data.pdfs)
    ? (data.pdfs as RawPdf[]).map((p) => ({
        id: p.id ?? "",
        orden_id: p.orden_id ?? "",
        lectura_id: p.lectura_id ?? "",
        estado: p.estado ?? "",
        numero_intento: p.numero_intento ?? 1,
        storage_bucket: p.storage_bucket ?? "",
        storage_path: p.storage_path ?? null,
        storage_url: p.storage_url ?? null,
        tamano_bytes: p.tamano_bytes ?? null,
        paginas: p.paginas ?? null,
        plantilla_usada: p.plantilla_usada ?? "",
        error_codigo: p.error_codigo ?? null,
        error_mensaje: p.error_mensaje ?? null,
        generado_at: p.generado_at ?? null,
        url_expira_at: p.url_expira_at ?? null,
        created_at: p.created_at ?? "",
        updated_at: p.updated_at ?? "",
        estado_resumen: p.diagnostico_admin?.estado_resumen ?? "ok",
        warnings: p.diagnostico_admin?.warnings ?? [],
      }))
    : [];

  // Datos de presentación de las órdenes de esta página (2026-10-31): cliente,
  // tema, estado de la orden, si es tráfico propio y cuántas veces el cliente
  // tocó "descargar PDF" desde su lectura. Solo lectura, en lote; si falla, la
  // tabla se muestra igual.
  const ordenes: Record<string, { cliente: string | null; tema: string | null; estado: string | null; interna: boolean; descargas: number }> = {};
  const ids = Array.from(new Set(pdfs.map((p) => p.orden_id).filter(Boolean)));
  if (ids.length > 0) {
    const rest = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
    const lista = ids.map(encodeURIComponent).join(",");
    const get = async (q: string) => {
      const r = await fetch(`${supabaseUrl}/rest/v1/${q}`, { headers: rest, cache: "no-store" });
      return r.ok ? await r.json() : [];
    };
    try {
      const [ords, clicks] = await Promise.all([
        get(`tarot_ordenes?id=in.(${lista})&select=id,nombre_snapshot,tema,estado,funnel_session_id`),
        get(`funnel_events?order_id=in.(${lista})&event_name=eq.mobile_pdf_clicked&select=order_id&limit=5000`),
      ]);
      const conSesion = (ords as { id: string; funnel_session_id: string | null }[]).filter((o) => o.funnel_session_id);
      const internas = conSesion.length
        ? new Set(((await get(`funnel_sessions?anonymous_id=in.(${conSesion.map((o) => `"${o.funnel_session_id}"`).join(",")})&es_interno=eq.true&select=anonymous_id`)) as { anonymous_id: string }[]).map((s) => s.anonymous_id))
        : new Set<string>();
      const porOrden = new Map<string, number>();
      for (const c of clicks as { order_id: string }[]) porOrden.set(c.order_id, (porOrden.get(c.order_id) ?? 0) + 1);
      for (const o of ords as { id: string; nombre_snapshot: string | null; tema: string | null; estado: string | null; funnel_session_id: string | null }[]) {
        ordenes[o.id] = {
          cliente: o.nombre_snapshot, tema: o.tema, estado: o.estado,
          interna: !!o.funnel_session_id && internas.has(o.funnel_session_id),
          descargas: porOrden.get(o.id) ?? 0,
        };
      }
    } catch { /* best-effort */ }
  }

  return NextResponse.json({
    ok: data.ok ?? false,
    paginacion: data.paginacion ?? null,
    metricas_pagina: data.metricas_pagina ?? null,
    pdfs,
    ordenes,
  });
}
