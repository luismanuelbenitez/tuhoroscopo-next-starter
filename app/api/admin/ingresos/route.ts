import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function hdr(key: string) {
  return { Authorization: `Bearer ${key}`, apikey: key };
}

function periodoToDesde(periodo: string): string | null {
  const now = Date.now();
  if (periodo === "hoy") return new Date(new Date().toDateString()).toISOString();
  if (periodo === "7d")  return new Date(now - 7  * 86_400_000).toISOString();
  if (periodo === "30d") return new Date(now - 30 * 86_400_000).toISOString();
  if (periodo === "90d") return new Date(now - 90 * 86_400_000).toISOString();
  return null;
}

function isoWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function getLast8Weeks(): string[] {
  const weeks: string[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 86_400_000);
    weeks.push(isoWeek(d));
  }
  return [...new Set(weeks)];
}

type Pago = {
  id_pago: string;
  suscriptor_id: number | null;
  amount: number | null;
  currency: string | null;
  status: string;
  mp_payment_id: string | null;
  fecha_pago: string | null;
};

type Suscripcion = {
  id: string;
  estado: string;
  preapproval_status_mp: string | null;
  currency_id: string | null;
  amount: number | null;
  created_at: string;
  fecha_cancelacion: string | null;
};

type Suscriptor = {
  id: number;
  nombre: string | null;
  whatsapp: string | null;
};

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const periodo = req.nextUrl.searchParams.get("periodo") ?? "30d";
  const desde   = periodoToDesde(periodo);

  const pagosFiltro = desde
    ? `status=eq.approved&fecha_pago=gte.${encodeURIComponent(desde)}`
    : `status=eq.approved`;

  const [rPagos, rRecientes, rSuscripciones] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/pagos?${pagosFiltro}&select=id_pago,suscriptor_id,amount,currency,status,mp_payment_id,fecha_pago&order=fecha_pago.desc&limit=2000`,
      { headers: hdr(serviceRoleKey), cache: "no-store" },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/pagos?status=eq.approved&select=id_pago,suscriptor_id,amount,currency,mp_payment_id,fecha_pago&order=fecha_pago.desc&limit=20`,
      { headers: hdr(serviceRoleKey), cache: "no-store" },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/suscripciones?select=id,estado,preapproval_status_mp,currency_id,amount,created_at,fecha_cancelacion&limit=2000`,
      { headers: hdr(serviceRoleKey), cache: "no-store" },
    ),
  ]);

  const [pagos, recientes, suscripciones]: [Pago[], Pago[], Suscripcion[]] = await Promise.all([
    rPagos.ok       ? rPagos.json().catch(() => [])       : Promise.resolve([]),
    rRecientes.ok   ? rRecientes.json().catch(() => [])   : Promise.resolve([]),
    rSuscripciones.ok ? rSuscripciones.json().catch(() => []) : Promise.resolve([]),
  ]);

  // Nombres de suscriptores para los últimos pagos
  const suscriptorIds = [...new Set(recientes.map((p) => p.suscriptor_id).filter(Boolean))];
  let suscriptoresMap: Record<number, Suscriptor> = {};
  if (suscriptorIds.length > 0) {
    const ids = suscriptorIds.join(",");
    const rSusc = await fetch(
      `${supabaseUrl}/rest/v1/suscriptores?id=in.(${ids})&select=id,nombre,whatsapp`,
      { headers: hdr(serviceRoleKey), cache: "no-store" },
    );
    if (rSusc.ok) {
      const rows: Suscriptor[] = await rSusc.json().catch(() => []);
      suscriptoresMap = Object.fromEntries(rows.map((s) => [s.id, s]));
    }
  }

  // ── Agregación pagos (período) ──────────────────────────────
  let total_uyu = 0;
  let count_uyu = 0;
  const weekMap: Record<string, { uyu: number; count: number }> = {};

  for (const p of pagos) {
    const monto = Number(p.amount ?? 0);
    if ((p.currency ?? "UYU") === "UYU") {
      total_uyu += monto;
      count_uyu++;
    }
    const fechaStr = p.fecha_pago ?? "";
    if (fechaStr) {
      const w = isoWeek(new Date(fechaStr));
      if (!weekMap[w]) weekMap[w] = { uyu: 0, count: 0 };
      weekMap[w].uyu += monto;
      weekMap[w].count++;
    }
  }

  const weekStarts = getLast8Weeks();
  const por_semana = weekStarts.map((w) => ({
    semana: w,
    uyu:   weekMap[w]?.uyu   ?? 0,
    count: weekMap[w]?.count ?? 0,
  }));

  // ── MRR y activas (siempre sobre el total) ─────────────────
  const activas = suscripciones.filter(
    (s) => ["activa", "activa_provisional"].includes(s.estado) && s.preapproval_status_mp === "authorized",
  );
  let mrr_uyu = 0;
  let activas_uyu = 0;
  for (const s of activas) {
    const a = Number(s.amount ?? 0);
    if ((s.currency_id ?? "UYU") === "UYU") { mrr_uyu += a; activas_uyu++; }
  }

  // Nuevas y canceladas en el período
  const fromDate = desde ? new Date(desde) : null;
  const nuevas = fromDate
    ? suscripciones.filter((s) => new Date(s.created_at) >= fromDate).length
    : suscripciones.length;
  const canceladas = fromDate
    ? suscripciones.filter((s) => s.fecha_cancelacion && new Date(s.fecha_cancelacion) >= fromDate).length
    : suscripciones.filter((s) => s.fecha_cancelacion).length;

  // Distribución de estados (sobre el total)
  const estadoMap: Record<string, number> = {};
  for (const s of suscripciones) {
    estadoMap[s.estado] = (estadoMap[s.estado] ?? 0) + 1;
  }
  const por_estado = Object.entries(estadoMap)
    .map(([estado, count]) => ({ estado, count }))
    .sort((a, b) => b.count - a.count);

  // Últimos pagos con nombre de suscriptor
  const recientes_enriq = recientes.slice(0, 20).map((p) => {
    const s = p.suscriptor_id ? suscriptoresMap[p.suscriptor_id] : null;
    return {
      ...p,
      nombre:   s?.nombre  ?? null,
      whatsapp: s?.whatsapp ?? null,
    };
  });

  return NextResponse.json({
    ok: true,
    periodo,
    total_uyu:    Math.round(total_uyu),
    count_uyu,
    ticket_prom:  count_uyu > 0 ? Math.round(total_uyu / count_uyu) : 0,
    mrr_uyu:      Math.round(mrr_uyu),
    activas_uyu,
    activas_total: activas.length,
    nuevas,
    canceladas,
    total_suscripciones: suscripciones.length,
    por_semana,
    por_estado,
    recientes: recientes_enriq,
  });
}
