import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type RawPago = {
  id?: string;
  orden_id?: string;
  mp_preference_id?: string;
  mp_payment_id?: string;
  mp_external_reference?: string;
  mp_status?: string;
  mp_status_detail?: string;
  mp_payment_type?: string;
  mp_payment_method_id?: string;
  mp_installments?: number;
  monto?: number | string;
  moneda?: string;
  link_pago?: string;
  link_expira_at?: string;
  webhook_received_at?: string;
  created_at?: string;
  updated_at?: string;
  cobro_manual?: boolean;
  cobro_manual_motivo?: string | null;
  cobro_manual_observacion?: string | null;
  cobro_manual_at?: string | null;
  cobro_manual_por?: string | null;
  orden_estado?: string | null;
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

  const mp_status = searchParams.get("mp_status");
  if (mp_status) efBody.mp_status = mp_status;

  const moneda = searchParams.get("moneda");
  if (moneda) efBody.moneda = moneda;

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
    res = await callEF(`${supabaseUrl}/functions/v1/ef_tarot_admin_listar_pagos`, internalKey, serviceRoleKey, efBody);
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

  // Excluimos webhook_payload (payload crudo de MP, voluminoso y no necesario en tabla).
  const pagos = Array.isArray(data.pagos)
    ? (data.pagos as RawPago[]).map((p) => ({
        id: p.id ?? "",
        orden_id: p.orden_id ?? "",
        mp_preference_id: p.mp_preference_id ?? null,
        mp_payment_id: p.mp_payment_id ?? null,
        mp_external_reference: p.mp_external_reference ?? null,
        mp_status: p.mp_status ?? null,
        mp_status_detail: p.mp_status_detail ?? null,
        mp_payment_type: p.mp_payment_type ?? null,
        mp_payment_method_id: p.mp_payment_method_id ?? null,
        mp_installments: p.mp_installments ?? 1,
        monto: p.monto ?? null,
        moneda: p.moneda ?? null,
        link_pago: p.link_pago ?? null,
        link_expira_at: p.link_expira_at ?? null,
        webhook_received_at: p.webhook_received_at ?? null,
        created_at: p.created_at ?? "",
        updated_at: p.updated_at ?? "",
        cobro_manual: p.cobro_manual ?? false,
        cobro_manual_motivo: p.cobro_manual_motivo ?? null,
        cobro_manual_observacion: p.cobro_manual_observacion ?? null,
        cobro_manual_at: p.cobro_manual_at ?? null,
        cobro_manual_por: p.cobro_manual_por ?? null,
        orden_estado: p.orden_estado ?? null,
        estado_resumen: p.diagnostico_admin?.estado_resumen ?? "ok",
        warnings: p.diagnostico_admin?.warnings ?? [],
      }))
    : [];

  // Datos de presentación (2026-10-31), solo lectura y en lote por página:
  // - de Mercado Pago (del payload guardado): comisión, neto, fecha de
  //   aprobación y de liberación del dinero, cuotas y monto devuelto;
  // - de la orden: cliente, tema, origen (UTM), estado de la entrega y si es
  //   tráfico propio. Si algo falla, la tabla se muestra igual.
  const extra = await extrasDePagina(supabaseUrl, serviceRoleKey, pagos.map((p) => p.id), pagos.map((p) => p.orden_id));
  const pagosConExtra = pagos.map((p) => ({ ...p, mp: extra.mp.get(p.id) ?? null, orden: extra.ordenes.get(p.orden_id) ?? null }));

  return NextResponse.json({
    ok: data.ok ?? false,
    paginacion: data.paginacion ?? null,
    metricas_pagina: data.metricas_pagina ?? null,
    pagos: pagosConExtra,
  });
}

type ExtraMp = {
  neto: number | null; comision: number | null; aprobado_at: string | null;
  liberacion_at: string | null; liberacion_estado: string | null; devuelto: number | null;
};
type ExtraOrden = {
  cliente: string | null; tema: string | null; utm_source: string | null; utm_campaign: string | null;
  estado: string | null; interna: boolean;
};

async function extrasDePagina(
  supabaseUrl: string,
  serviceRoleKey: string,
  pagoIds: string[],
  ordenIds: string[],
): Promise<{ mp: Map<string, ExtraMp>; ordenes: Map<string, ExtraOrden> }> {
  const mp = new Map<string, ExtraMp>();
  const ordenes = new Map<string, ExtraOrden>();
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const get = async (q: string) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${q}`, { headers, cache: "no-store" });
    return r.ok ? await r.json() : [];
  };
  const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  try {
    const ids = pagoIds.filter(Boolean).map(encodeURIComponent).join(",");
    const oids = Array.from(new Set(ordenIds.filter(Boolean))).map(encodeURIComponent).join(",");
    const [filasMp, filasO] = await Promise.all([
      ids ? get(`tarot_pagos?id=in.(${ids})&select=id,neto:webhook_payload->transaction_details->>net_received_amount,fees:webhook_payload->fee_details,aprobado:webhook_payload->>date_approved,liberacion:webhook_payload->>money_release_date,liberacion_estado:webhook_payload->>money_release_status,devuelto:webhook_payload->>transaction_amount_refunded`) : [],
      oids ? get(`tarot_ordenes?id=in.(${oids})&select=id,nombre_snapshot,tema,utm_source,utm_campaign,estado,funnel_session_id`) : [],
    ]);
    for (const f of filasMp as Record<string, unknown>[]) {
      const fees = Array.isArray(f.fees) ? (f.fees as { amount?: number }[]) : [];
      mp.set(String(f.id), {
        neto: num(f.neto),
        comision: fees.length ? fees.reduce((a, x) => a + (Number(x.amount) || 0), 0) : null,
        aprobado_at: (f.aprobado as string) ?? null,
        liberacion_at: (f.liberacion as string) ?? null,
        liberacion_estado: (f.liberacion_estado as string) ?? null,
        devuelto: num(f.devuelto),
      });
    }
    const conSesion = (filasO as { id: string; funnel_session_id: string | null }[]).filter((o) => o.funnel_session_id);
    const internas = conSesion.length
      ? new Set(((await get(`funnel_sessions?anonymous_id=in.(${conSesion.map((o) => `"${o.funnel_session_id}"`).join(",")})&es_interno=eq.true&select=anonymous_id`)) as { anonymous_id: string }[]).map((s) => s.anonymous_id))
      : new Set<string>();
    for (const o of filasO as Record<string, unknown>[]) {
      ordenes.set(String(o.id), {
        cliente: (o.nombre_snapshot as string) ?? null,
        tema: (o.tema as string) ?? null,
        utm_source: (o.utm_source as string) ?? null,
        utm_campaign: (o.utm_campaign as string) ?? null,
        estado: (o.estado as string) ?? null,
        interna: !!o.funnel_session_id && internas.has(o.funnel_session_id as string),
      });
    }
  } catch { /* best-effort */ }
  return { mp, ordenes };
}
