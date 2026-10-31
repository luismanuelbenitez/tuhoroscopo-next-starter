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
  utm_source?: string | null;
  utm_campaign?: string | null;
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
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "SUPABASE_URL no configurada" }, { status: 500 });
  if (!internalKey)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "TAROT_INTERNAL_KEY no configurada" }, { status: 500 });
  if (!serviceRoleKey)
    return NextResponse.json({ ok: false, motivo: "config_error", detalle: "SUPABASE_SECRET_KEY no configurada" }, { status: 500 });
  return { supabaseUrl, internalKey, serviceRoleKey };
}

// Cortesía (2026-10-18): ef_tarot_admin_listar_ordenes no trae tipo_orden;
// se completa acá con una consulta liviana sobre los ids de la página (y el
// código usado), para no tener que redesplegar la EF. Best-effort: si falla,
// las órdenes se muestran como siempre.
async function cortesiasDePagina(
  supabaseUrl: string,
  serviceRoleKey: string,
  ids: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  try {
    const lista = ids.map(encodeURIComponent).join(",");
    const res = await fetch(
      `${supabaseUrl}/rest/v1/tarot_ordenes?id=in.(${lista})&tipo_orden=eq.cortesia&select=id`,
      { headers, cache: "no-store" },
    );
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return out;
    for (const r of rows) out.set(String(r.id), null);
    const resUsos = await fetch(
      `${supabaseUrl}/rest/v1/tarot_codigos_descuento_usos?orden_id=in.(${[...out.keys()].join(",")})&select=orden_id,codigo`,
      { headers, cache: "no-store" },
    );
    const usos = await resUsos.json().catch(() => []);
    if (Array.isArray(usos)) for (const u of usos) out.set(String(u.orden_id), u.codigo ?? null);
  } catch { /* best-effort */ }
  return out;
}

// Recorrido de cada orden de la página (2026-10-31), para la vista del admin:
// hitos del pipeline (de funnel_events), si el cliente abrió la lectura,
// intentos fallidos, costo de IA, código usado y si es tráfico propio.
// Solo lectura y en lote (5 consultas por página); si algo falla, la tabla
// se muestra igual sin estos datos.
type Recorrido = {
  pagado_at: string | null;
  lectura_at: string | null;
  pdf_at: string | null;
  whatsapp_at: string | null;
  abierta_at: string | null;
  aperturas: number;
  pdf_clicks: number;
  fallos_ia: number;
  costo_ia_usd: number;
  codigo: string | null;
  interna: boolean;
};

async function recorridoDePagina(
  supabaseUrl: string,
  serviceRoleKey: string,
  ids: string[],
): Promise<Map<string, Recorrido>> {
  const out = new Map<string, Recorrido>();
  if (ids.length === 0) return out;
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const lista = ids.map(encodeURIComponent).join(",");
  const get = async (q: string) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${q}`, { headers, cache: "no-store" });
    return r.ok ? await r.json() : [];
  };
  try {
    const eventos = "payment_approved,courtesy_order_confirmed,generation_succeeded,generation_failed,pdf_generated,whatsapp_sent,mobile_reading_opened,mobile_pdf_clicked";
    const [ords, evs, usos, lecs] = await Promise.all([
      get(`tarot_ordenes?id=in.(${lista})&select=id,funnel_session_id`),
      get(`funnel_events?order_id=in.(${lista})&event_name=in.(${eventos})&select=order_id,event_name,created_at&order=created_at.asc&limit=5000`),
      get(`tarot_codigos_descuento_usos?orden_id=in.(${lista})&select=orden_id,codigo`),
      get(`tarot_lecturas?orden_id=in.(${lista})&select=orden_id,ia_costo_usd`),
    ]);
    for (const id of ids) {
      out.set(id, { pagado_at: null, lectura_at: null, pdf_at: null, whatsapp_at: null, abierta_at: null,
        aperturas: 0, pdf_clicks: 0, fallos_ia: 0, costo_ia_usd: 0, codigo: null, interna: false });
    }
    for (const e of evs as { order_id: string; event_name: string; created_at: string }[]) {
      const r = out.get(e.order_id);
      if (!r) continue;
      switch (e.event_name) {
        case "payment_approved":
        case "courtesy_order_confirmed": r.pagado_at ??= e.created_at; break;
        case "generation_succeeded": r.lectura_at ??= e.created_at; break;
        case "generation_failed": r.fallos_ia += 1; break;
        case "pdf_generated": r.pdf_at ??= e.created_at; break;
        case "whatsapp_sent": r.whatsapp_at ??= e.created_at; break;
        case "mobile_reading_opened": r.abierta_at ??= e.created_at; r.aperturas += 1; break;
        case "mobile_pdf_clicked": r.pdf_clicks += 1; break;
      }
    }
    for (const u of usos as { orden_id: string; codigo: string | null }[]) {
      const r = out.get(u.orden_id);
      if (r && u.codigo) r.codigo = u.codigo;
    }
    for (const l of lecs as { orden_id: string; ia_costo_usd: number | string | null }[]) {
      const r = out.get(l.orden_id);
      if (r) r.costo_ia_usd += Number(l.ia_costo_usd ?? 0) || 0;
    }
    // Tráfico propio: orden hecha desde una sesión marcada como interna.
    const sesiones = (ords as { id: string; funnel_session_id: string | null }[]).filter((o) => o.funnel_session_id);
    if (sesiones.length > 0) {
      const listaS = sesiones.map((o) => `"${o.funnel_session_id}"`).join(",");
      const internas = new Set(((await get(`funnel_sessions?anonymous_id=in.(${listaS})&es_interno=eq.true&select=anonymous_id`)) as { anonymous_id: string }[]).map((s) => s.anonymous_id));
      for (const o of sesiones) {
        const r = out.get(o.id);
        if (r && internas.has(o.funnel_session_id as string)) r.interna = true;
      }
    }
  } catch { /* best-effort */ }
  return out;
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

  const orden_id = searchParams.get("orden_id");
  if (orden_id) efBody.orden_id = orden_id;

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

  const ids = ordenes.map((o) => o.id).filter(Boolean);
  const [cortesias, recorridos] = await Promise.all([
    cortesiasDePagina(supabaseUrl, serviceRoleKey, ids),
    recorridoDePagina(supabaseUrl, serviceRoleKey, ids),
  ]);
  const crudas = new Map((data.ordenes as RawOrden[] ?? []).map((o) => [o.id ?? "", o]));
  const ordenesConTipo = ordenes.map((o) => ({
    ...o,
    tipo_orden:      cortesias.has(o.id) ? "cortesia" : "venta",
    codigo_cortesia: cortesias.get(o.id) ?? null,
    utm_source:      crudas.get(o.id)?.utm_source ?? null,
    utm_campaign:    crudas.get(o.id)?.utm_campaign ?? null,
    recorrido:       recorridos.get(o.id) ?? null,
  }));

  return NextResponse.json({
    ok: data.ok ?? false,
    paginacion: data.paginacion ?? null,
    conteos_pagina: data.conteos_pagina ?? null,
    resumen_texto: data.resumen_texto ?? null,
    ordenes: ordenesConTipo,
  });
}
