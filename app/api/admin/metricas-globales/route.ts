import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function hdrs(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function countRest(
  base: string,
  table: string,
  filter: string,
  headers: Record<string, string>,
): Promise<number> {
  const url = `${base}/${table}?select=id&limit=1${filter ? `&${filter}` : ""}`;
  try {
    const res = await fetch(url, { headers: { ...headers, Prefer: "count=exact" }, cache: "no-store" });
    const range = res.headers.get("content-range");
    const m = range?.match(/\/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  } catch {
    return 0;
  }
}

async function fetchRows<T>(
  base: string,
  table: string,
  select: string,
  filter: string,
  headers: Record<string, string>,
  limit = 2000,
): Promise<T[]> {
  const url = `${base}/${table}?select=${select}${filter ? `&${filter}` : ""}&limit=${limit}`;
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    return res.json().catch(() => []);
  } catch {
    return [];
  }
}

const ESTADOS_ERROR_TTC = "error_lectura,error_pdf,error_whatsapp,error_critico";
const ESTADOS_ACTIVOS_THC = new Set(["activo", "provisional"]);

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const base = `${supabaseUrl}/rest/v1`;
  const h = hdrs(serviceRoleKey);

  const dias = Math.max(1, Math.min(365, parseInt(req.nextUrl.searchParams.get("periodo") ?? "30")));
  const desdeISO = new Date(Date.now() - dias * 86_400_000).toISOString();
  const desdeDate = desdeISO.slice(0, 10); // YYYY-MM-DD para columnas tipo date
  const hace24hISO = new Date(Date.now() - 86_400_000).toISOString();

  const [
    thcActivos,
    thcActivosWaOk,
    thcActivosWaPendiente,
    thcAltasPeriodo,
    thcMensajesEnviados,
    thcMensajesFallidos24h,
    thcMensajesPendientes,
    thcPagosRows,
    suscripcionesRows,
    ttcOrdenesPeriodo,
    ttcCompletadasPeriodo,
    ttcEnErrorActivo,
    ttcClientesTotal,
    ttcPagosRows,
  ] = await Promise.all([
    countRest(base, "suscriptores", "premium_activo=eq.true", h),
    countRest(base, "suscriptores", "premium_activo=eq.true&whatsapp_confirmado=eq.true", h),
    countRest(base, "suscriptores", "premium_activo=eq.true&whatsapp_confirmado=eq.false", h),
    countRest(base, "suscriptores", `fecha_alta=gte.${desdeDate}`, h),
    countRest(base, "mensajes_enviados", `fecha_hora=gte.${encodeURIComponent(desdeISO)}`, h),
    countRest(base, "mensajes_enviados", `fecha_hora=gte.${encodeURIComponent(hace24hISO)}&resultado_envio=eq.false`, h),
    countRest(base, "mensajes_enviados", "estado=eq.pendiente", h),
    fetchRows<{ amount: string | number; status: string }>(
      base, "pagos", "amount,status",
      `status=eq.approved&created_at=gte.${encodeURIComponent(desdeISO)}`, h,
    ),
    fetchRows<{ estado: string; preapproval_status_mp: string | null; currency_id: string; amount: number | null }>(
      base, "suscripciones", "estado,preapproval_status_mp,currency_id,amount", "", h, 2000,
    ),
    countRest(base, "tarot_ordenes", `created_at=gte.${encodeURIComponent(desdeISO)}`, h),
    countRest(base, "tarot_ordenes", `estado=eq.entregado&created_at=gte.${encodeURIComponent(desdeISO)}`, h),
    countRest(base, "tarot_ordenes", `estado=in.(${ESTADOS_ERROR_TTC})`, h),
    countRest(base, "tarot_clientes", "", h),
    fetchRows<{ monto: string | number; moneda: string }>(
      base, "tarot_pagos", "monto,moneda",
      `mp_status=eq.approved&created_at=gte.${encodeURIComponent(desdeISO)}`, h,
    ),
  ]);

  // THC ingresos: suma de pagos aprobados en el período
  const thcIngresosPeriodo = thcPagosRows.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);

  // THC MRR via suscripciones activas
  let thcMrrUyu = 0, thcMrrArs = 0, thcSubsActivas = 0;
  for (const s of suscripcionesRows) {
    if (ESTADOS_ACTIVOS_THC.has(s.estado) && s.preapproval_status_mp === "authorized") {
      thcSubsActivas++;
      if (s.currency_id === "UYU") thcMrrUyu += Number(s.amount ?? 0);
      else if (s.currency_id === "ARS") thcMrrArs += Number(s.amount ?? 0);
    }
  }

  // TTC ingresos: suma por moneda
  let ttcIngresosUyu = 0, ttcIngresosArs = 0;
  for (const p of ttcPagosRows) {
    const m = Number(p.monto ?? 0);
    if (p.moneda === "UYU") ttcIngresosUyu += m;
    else if (p.moneda === "ARS") ttcIngresosArs += m;
  }

  return NextResponse.json({
    ok: true,
    periodo: dias,
    thc: {
      activos: thcActivos,
      activos_wa_ok: thcActivosWaOk,
      activos_wa_pendiente: thcActivosWaPendiente,
      altas_periodo: thcAltasPeriodo,
      mensajes_enviados_periodo: thcMensajesEnviados,
      mensajes_fallidos_24h: thcMensajesFallidos24h,
      mensajes_pendientes: thcMensajesPendientes,
      ingresos_periodo: Math.round(thcIngresosPeriodo),
      mrr_uyu: Math.round(thcMrrUyu),
      mrr_ars: Math.round(thcMrrArs),
      subs_activas: thcSubsActivas,
    },
    ttc: {
      ordenes_periodo: ttcOrdenesPeriodo,
      completadas_periodo: ttcCompletadasPeriodo,
      en_error_activo: ttcEnErrorActivo,
      clientes_total: ttcClientesTotal,
      ingresos_periodo_uyu: Math.round(ttcIngresosUyu),
      ingresos_periodo_ars: Math.round(ttcIngresosArs),
    },
    alertas: {
      ordenes_en_error: ttcEnErrorActivo,
      mensajes_fallidos_24h: thcMensajesFallidos24h,
      wa_pendiente: thcActivosWaPendiente,
    },
  });
}
