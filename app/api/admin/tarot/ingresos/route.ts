import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function restHeaders(serviceRoleKey: string) {
  return { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey };
}

function periodoToDesde(periodo: string): string | null {
  const now = Date.now();
  if (periodo === "hoy") return new Date(new Date().toDateString()).toISOString();
  if (periodo === "7d")  return new Date(now - 7  * 86_400_000).toISOString();
  if (periodo === "30d") return new Date(now - 30 * 86_400_000).toISOString();
  if (periodo === "90d") return new Date(now - 90 * 86_400_000).toISOString();
  return null; // "todo"
}

function isoWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // start of week (Sunday)
  return d.toISOString().slice(0, 10);
}

function getLast8WeekStarts(): string[] {
  const weeks: string[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 86_400_000);
    weeks.push(isoWeek(d));
  }
  return [...new Set(weeks)];
}

type TarotPago = {
  id: string;
  orden_id: string;
  monto: number | null;
  moneda: string;
  mp_status: string;
  mp_payment_type: string | null;
  created_at: string;
};

type Suscripcion = {
  id: string;
  estado: string;
  preapproval_status_mp: string | null;
  currency_id: string;
  amount: number | null;
  fecha_activacion_definitiva: string | null;
  fecha_cancelacion: string | null;
  created_at: string;
};

type PorSemana = { semana: string; uyu: number; ars: number; count: number };

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const periodo = req.nextUrl.searchParams.get("periodo") ?? "30d";
  const desde   = periodoToDesde(periodo);

  // Fetch TTC pagos (solo aprobados, con select minimal)
  const ttcFilter = desde
    ? `mp_status=eq.approved&created_at=gte.${encodeURIComponent(desde)}`
    : `mp_status=eq.approved`;

  // Fetch THC suscripciones — siempre completo para MRR, pero marcamos las del período
  const [rTtcPagos, rTtcRecientes, rSuscripciones] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/tarot_pagos?${ttcFilter}&select=id,orden_id,monto,moneda,mp_payment_type,created_at&order=created_at.desc&limit=500`,
      { headers: restHeaders(serviceRoleKey), cache: "no-store" },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/tarot_pagos?mp_status=eq.approved&select=id,orden_id,monto,moneda,mp_payment_type,created_at&order=created_at.desc&limit=20`,
      { headers: restHeaders(serviceRoleKey), cache: "no-store" },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/suscripciones?select=id,estado,preapproval_status_mp,currency_id,amount,fecha_activacion_definitiva,fecha_cancelacion,created_at&limit=2000`,
      { headers: restHeaders(serviceRoleKey), cache: "no-store" },
    ),
  ]);

  const [ttcPagos, ttcRecientes, suscripciones]: [TarotPago[], TarotPago[], Suscripcion[]] =
    await Promise.all([
      rTtcPagos.ok    ? rTtcPagos.json().catch(() => [])    : Promise.resolve([]),
      rTtcRecientes.ok ? rTtcRecientes.json().catch(() => []) : Promise.resolve([]),
      rSuscripciones.ok ? rSuscripciones.json().catch(() => []) : Promise.resolve([]),
    ]);

  // ── TTC aggregation ──────────────────────────────────────────
  let ttc_total_uyu = 0, ttc_total_ars = 0, ttc_count_uyu = 0, ttc_count_ars = 0;
  const weekMap: Record<string, PorSemana> = {};

  for (const p of ttcPagos) {
    const monto = Number(p.monto ?? 0);
    if (p.moneda === "UYU") { ttc_total_uyu += monto; ttc_count_uyu++; }
    else if (p.moneda === "ARS") { ttc_total_ars += monto; ttc_count_ars++; }

    const w = isoWeek(new Date(p.created_at));
    if (!weekMap[w]) weekMap[w] = { semana: w, uyu: 0, ars: 0, count: 0 };
    if (p.moneda === "UYU") weekMap[w].uyu += monto;
    else if (p.moneda === "ARS") weekMap[w].ars += monto;
    weekMap[w].count++;
  }

  // Last 8 weeks ordered, filling gaps
  const weekStarts = getLast8WeekStarts();
  const por_semana: PorSemana[] = weekStarts.map((w) => weekMap[w] ?? { semana: w, uyu: 0, ars: 0, count: 0 });

  // ── THC aggregation ──────────────────────────────────────────
  const ESTADOS_ACTIVOS = new Set(["activo", "provisional"]);
  const thc_activas = suscripciones.filter((s) =>
    ESTADOS_ACTIVOS.has(s.estado) && s.preapproval_status_mp === "authorized",
  );
  let thc_mrr_uyu = 0, thc_mrr_ars = 0, thc_activas_uyu = 0, thc_activas_ars = 0;
  for (const s of thc_activas) {
    const a = Number(s.amount ?? 0);
    if (s.currency_id === "UYU") { thc_mrr_uyu += a; thc_activas_uyu++; }
    else if (s.currency_id === "ARS") { thc_mrr_ars += a; thc_activas_ars++; }
  }

  // Nuevas y canceladas en el período
  const fromDate = desde ? new Date(desde) : null;
  const thc_nuevas = fromDate
    ? suscripciones.filter((s) => new Date(s.created_at) >= fromDate).length
    : suscripciones.length;
  const thc_canceladas = fromDate
    ? suscripciones.filter((s) => s.fecha_cancelacion && new Date(s.fecha_cancelacion) >= fromDate).length
    : suscripciones.filter((s) => s.fecha_cancelacion).length;

  // Distribución por estado
  const estadoMap: Record<string, { count: number; currency_id: string }> = {};
  for (const s of suscripciones) {
    const key = s.estado;
    if (!estadoMap[key]) estadoMap[key] = { count: 0, currency_id: s.currency_id };
    estadoMap[key].count++;
  }
  const thc_por_estado = Object.entries(estadoMap)
    .map(([estado, v]) => ({ estado, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    ok: true,
    periodo,
    ttc: {
      total_uyu: Math.round(ttc_total_uyu * 100) / 100,
      total_ars: Math.round(ttc_total_ars * 100) / 100,
      count_uyu: ttc_count_uyu,
      count_ars: ttc_count_ars,
      ticket_prom_uyu: ttc_count_uyu > 0 ? Math.round(ttc_total_uyu / ttc_count_uyu) : 0,
      ticket_prom_ars: ttc_count_ars > 0 ? Math.round(ttc_total_ars / ttc_count_ars) : 0,
      por_semana,
      recientes: ttcRecientes.slice(0, 20),
    },
    thc: {
      activas_total: thc_activas.length,
      activas_uyu: thc_activas_uyu,
      activas_ars: thc_activas_ars,
      mrr_uyu: Math.round(thc_mrr_uyu),
      mrr_ars: Math.round(thc_mrr_ars),
      nuevas_periodo: thc_nuevas,
      canceladas_periodo: thc_canceladas,
      total_suscripciones: suscripciones.length,
      por_estado: thc_por_estado,
    },
  });
}
