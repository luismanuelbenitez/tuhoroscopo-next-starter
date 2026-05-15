import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type DiagnosticoAdmin = {
  healthy?: boolean;
  warnings?: string[];
  estado_resumen?: string;
  accion_sugerida?: string;
};

type RawSuscripcion = {
  id?: number;
  suscriptor_id?: number | null;
  provider?: string | null;
  preapproval_id?: string | null;
  external_reference?: string | null;
  estado?: string | null;
  provisional?: boolean | null;
  auto_renovacion_activa?: boolean | null;
  preapproval_status_mp?: string | null;
  fecha_creacion?: string | null;
  fecha_activacion_provisional?: string | null;
  fecha_activacion_definitiva?: string | null;
  fecha_vencimiento_actual?: string | null;
  fecha_cancelacion?: string | null;
  reason?: string | null;
  currency_id?: string | null;
  amount?: number | null;
  frequency?: number | null;
  frequency_type?: string | null;
  // payer_email — PII, excluded
  // payer_id — PII, excluded
  // init_point — internal, excluded
  // sandbox_init_point — internal, excluded
  // back_url — internal, excluded
  codigo_descuento?: string | null;
  codigo_descuento_id?: number | null;
  descuento_estado?: string | null;
  descuento_metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  diagnostico_admin?: DiagnosticoAdmin | null;
};

function maskPreapprovalId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 8) return "****";
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.WHATSAPP_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", detalle: "SUPABASE_URL no configurada" },
      { status: 500 }
    );
  }
  if (!internalKey) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", detalle: "WHATSAPP_INTERNAL_KEY no configurada" },
      { status: 500 }
    );
  }
  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", detalle: "SUPABASE_SERVICE_ROLE_KEY no configurada" },
      { status: 500 }
    );
  }

  const { searchParams } = req.nextUrl;
  const efBody: Record<string, unknown> = { log: false };

  const suscriptorIdRaw = searchParams.get("suscriptor_id")?.trim();
  if (suscriptorIdRaw) {
    const parsed = parseInt(suscriptorIdRaw, 10);
    if (Number.isFinite(parsed)) efBody.suscriptor_id = parsed;
  }

  const estado = searchParams.get("estado")?.trim();
  if (estado) efBody.estado = estado;

  const provider = searchParams.get("provider")?.trim();
  if (provider) efBody.provider = provider;

  const preapprovalStatusMp = searchParams.get("preapproval_status_mp")?.trim();
  if (preapprovalStatusMp) efBody.preapproval_status_mp = preapprovalStatusMp;

  const descuentoEstado = searchParams.get("descuento_estado")?.trim();
  if (descuentoEstado) efBody.descuento_estado = descuentoEstado;

  if (searchParams.get("solo_vencidas") === "true") efBody.solo_vencidas = true;
  if (searchParams.get("solo_con_descuento") === "true") efBody.solo_con_descuento = true;

  const fechaDesde = searchParams.get("fecha_desde")?.trim();
  if (fechaDesde) efBody.fecha_desde = fechaDesde;

  const fechaHasta = searchParams.get("fecha_hasta")?.trim();
  if (fechaHasta) efBody.fecha_hasta = fechaHasta;

  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  efBody.limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;

  const offsetRaw = parseInt(searchParams.get("offset") ?? "0", 10);
  efBody.offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const efUrl = `${supabaseUrl}/functions/v1/ef_admin_listar_suscripciones`;

  let res: Response;
  try {
    res = await fetch(efUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify(efBody),
      cache: "no-store",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, motivo: "fetch_error", detalle: msg },
      { status: 502 }
    );
  }

  if (!res.ok) {
    let efMotivo: string | null = null;
    try {
      const errData = await res.json();
      efMotivo = errData.motivo ?? errData.message ?? errData.error ?? null;
    } catch {
      // sin JSON
    }
    return NextResponse.json(
      {
        ok: false,
        motivo: "ef_error",
        detalle: efMotivo
          ? `EF devolvió: ${efMotivo} (HTTP ${res.status})`
          : `Error ${res.status} desde Edge Function`,
        efStatus: res.status,
      },
      { status: 502 }
    );
  }

  const data = await res.json();

  const suscripciones = Array.isArray(data.suscripciones)
    ? (data.suscripciones as RawSuscripcion[]).map((s) => ({
        id: s.id ?? 0,
        suscriptor_id: s.suscriptor_id ?? null,
        provider: s.provider ?? null,
        preapproval_id_masked: maskPreapprovalId(s.preapproval_id),
        external_reference: s.external_reference ?? null,
        estado: s.estado ?? "",
        provisional: s.provisional ?? null,
        auto_renovacion_activa: s.auto_renovacion_activa ?? null,
        preapproval_status_mp: s.preapproval_status_mp ?? null,
        fecha_creacion: s.fecha_creacion ?? null,
        fecha_activacion_provisional: s.fecha_activacion_provisional ?? null,
        fecha_activacion_definitiva: s.fecha_activacion_definitiva ?? null,
        fecha_vencimiento_actual: s.fecha_vencimiento_actual ?? null,
        fecha_cancelacion: s.fecha_cancelacion ?? null,
        reason: s.reason ?? null,
        currency_id: s.currency_id ?? null,
        amount: s.amount ?? null,
        frequency: s.frequency ?? null,
        frequency_type: s.frequency_type ?? null,
        codigo_descuento: s.codigo_descuento ?? null,
        codigo_descuento_id: s.codigo_descuento_id ?? null,
        descuento_estado: s.descuento_estado ?? null,
        descuento_metadata: s.descuento_metadata ?? null,
        created_at: s.created_at ?? null,
        updated_at: s.updated_at ?? null,
        diagnostico_admin: s.diagnostico_admin
          ? {
              healthy: s.diagnostico_admin.healthy ?? true,
              warnings: s.diagnostico_admin.warnings ?? [],
              estado_resumen: s.diagnostico_admin.estado_resumen ?? "",
              accion_sugerida: s.diagnostico_admin.accion_sugerida ?? "",
            }
          : null,
      }))
    : [];

  return NextResponse.json({
    ok: data.ok ?? false,
    healthy: data.healthy ?? false,
    paginacion: data.paginacion ?? null,
    conteos_pagina: data.conteos_pagina ?? {},
    suscripciones,
    warnings: data.warnings ?? [],
  });
}
