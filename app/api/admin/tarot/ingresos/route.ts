import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

// Ingresos (rediseño 2026-10-31): pagos aprobados de Tarot con lo que informó
// Mercado Pago (neto, comisión, medio), datos de la orden (cliente, tema,
// tráfico propio) y comparación con el período anterior. Por defecto excluye
// las compras hechas desde dispositivos internos (`incluir=1` las suma).
// La parte de Horóscopo (suscripciones) no cambió. Solo lectura.

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

const diaUy = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);

function periodoToDesde(periodo: string): string | null {
  const now = Date.now();
  // "Hoy" = desde la medianoche de Montevideo.
  if (periodo === "hoy") return new Date(`${diaUy(new Date().toISOString())}T00:00:00-03:00`).toISOString();
  if (periodo === "7d")  return new Date(now - 7  * 86_400_000).toISOString();
  if (periodo === "30d") return new Date(now - 30 * 86_400_000).toISOString();
  if (periodo === "90d") return new Date(now - 90 * 86_400_000).toISOString();
  return null; // "todo"
}

function isoWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // inicio de semana (domingo)
  return d.toISOString().slice(0, 10);
}

type PagoMp = {
  id: string; orden_id: string; monto: number | string | null; moneda: string; mp_payment_type: string | null;
  mp_payment_method_id: string | null; mp_installments: number | null; created_at: string;
  neto: string | null; fees: { amount?: number }[] | null;
};
type OrdenIng = { id: string; nombre_snapshot: string | null; tema: string | null; funnel_session_id: string | null; estado: string | null; utm_source: string | null };
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

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;
  const headers = { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey };
  const get = async (q: string) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${q}`, { headers, cache: "no-store" });
    return r.ok ? r.json().catch(() => []) : [];
  };

  const periodo = req.nextUrl.searchParams.get("periodo") ?? "30d";
  const incluir = req.nextUrl.searchParams.get("incluir") === "1";
  const desde   = periodoToDesde(periodo);
  // Período anterior de igual largo, para comparar (no aplica a "todo").
  const desdeAnterior = desde ? new Date(2 * new Date(desde).getTime() - Date.now()).toISOString() : null;

  const campos = "id,orden_id,monto,moneda,mp_payment_type,mp_payment_method_id,mp_installments,created_at,neto:webhook_payload->transaction_details->>net_received_amount,fees:webhook_payload->fee_details";
  const [pagosRaw, suscripciones] = (await Promise.all([
    get(`tarot_pagos?mp_status=eq.approved${desdeAnterior ? `&created_at=gte.${encodeURIComponent(desdeAnterior)}` : ""}&select=${campos}&order=created_at.desc&limit=2000`),
    get(`suscripciones?select=id,estado,preapproval_status_mp,currency_id,amount,fecha_activacion_definitiva,fecha_cancelacion,created_at&limit=2000`),
  ])) as [PagoMp[], Suscripcion[]];

  const ids = Array.from(new Set(pagosRaw.map((p) => p.orden_id).filter(Boolean)));
  const ordenes = ids.length
    ? ((await get(`tarot_ordenes?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,nombre_snapshot,tema,funnel_session_id,estado,utm_source`)) as OrdenIng[])
    : [];
  const sesiones = ordenes.filter((o) => o.funnel_session_id).map((o) => `"${o.funnel_session_id}"`);
  const internas = new Set(
    sesiones.length
      ? ((await get(`funnel_sessions?anonymous_id=in.(${sesiones.join(",")})&es_interno=eq.true&select=anonymous_id`)) as { anonymous_id: string }[]).map((x) => x.anonymous_id)
      : [],
  );
  const ordenDe = new Map(ordenes.map((o) => [o.id, o]));

  const todos = pagosRaw.map((p) => {
    const o = ordenDe.get(p.orden_id);
    const fees = Array.isArray(p.fees) ? p.fees.reduce((a, f) => a + (Number(f.amount) || 0), 0) : null;
    const monto = Number(p.monto ?? 0);
    return {
      id: p.id, orden_id: p.orden_id, created_at: p.created_at, moneda: p.moneda, monto,
      comision: fees,
      neto: p.neto != null && p.neto !== "" ? Number(p.neto) : fees != null ? monto - fees : null,
      medio: p.mp_payment_type, marca: p.mp_payment_method_id, cuotas: p.mp_installments ?? 1,
      cliente: o?.nombre_snapshot ?? null, tema: o?.tema ?? null, estado_orden: o?.estado ?? null, origen: o?.utm_source ?? null,
      interna: !!o?.funnel_session_id && internas.has(o.funnel_session_id),
    };
  });
  type Pago = (typeof todos)[number];
  const pagos = todos.filter((p) => incluir || !p.interna);
  const enActual = pagos.filter((p) => !desde || p.created_at >= desde);
  const enAnterior = desde ? pagos.filter((p) => p.created_at < desde) : [];

  const suma = (l: Pago[], k: "monto" | "comision" | "neto") => Math.round(l.reduce((a, p) => a + (Number(p[k]) || 0), 0) * 100) / 100;
  const resumir = (lista: Pago[]) => {
    const uyu = lista.filter((p) => p.moneda === "UYU");
    const ars = lista.filter((p) => p.moneda === "ARS");
    return {
      ventas: lista.length,
      uyu: { ventas: uyu.length, cobrado: suma(uyu, "monto"), comision: suma(uyu, "comision"), neto: suma(uyu, "neto") },
      ars: { ventas: ars.length, cobrado: suma(ars, "monto"), comision: suma(ars, "comision"), neto: suma(ars, "neto") },
    };
  };

  // Serie en pesos uruguayos: por día si el período es de hasta 30 días, si no por semana (últimas 12).
  const porDia = periodo === "hoy" || periodo === "7d" || periodo === "30d";
  const dias = periodo === "hoy" ? 1 : periodo === "7d" ? 7 : 30;
  const claveDe = (iso: string) => (porDia ? diaUy(iso) : isoWeek(new Date(iso)));
  const claves: string[] = porDia
    ? Array.from({ length: dias }, (_, i) => diaUy(new Date(Date.now() - (dias - 1 - i) * 86_400_000).toISOString()))
    : Array.from(new Set(Array.from({ length: 12 }, (_, i) => isoWeek(new Date(Date.now() - (11 - i) * 7 * 86_400_000)))));
  const serieMap = new Map(claves.map((k) => [k, { clave: k, cobrado: 0, ventas: 0 }]));
  for (const p of pagos) {
    if (p.moneda !== "UYU") continue;
    const s = serieMap.get(claveDe(p.created_at));
    if (s) { s.cobrado += p.monto; s.ventas += 1; }
  }
  const medios = new Map<string, number>();
  for (const p of enActual) medios.set(p.medio ?? "otro", (medios.get(p.medio ?? "otro") ?? 0) + 1);

  // ── Horóscopo (sin cambios) ──────────────────────────────────
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
  const fromDate = desde ? new Date(desde) : null;
  const thc_nuevas = fromDate
    ? suscripciones.filter((s) => new Date(s.created_at) >= fromDate).length
    : suscripciones.length;
  const thc_canceladas = fromDate
    ? suscripciones.filter((s) => s.fecha_cancelacion && new Date(s.fecha_cancelacion) >= fromDate).length
    : suscripciones.filter((s) => s.fecha_cancelacion).length;

  return NextResponse.json({
    ok: true,
    periodo,
    incluir,
    ttc: {
      actual: resumir(enActual),
      anterior: desde ? resumir(enAnterior) : null,
      internas_excluidas: incluir ? 0 : todos.filter((p) => p.interna && (!desde || p.created_at >= desde)).length,
      serie: { por: porDia ? "dia" : "semana", puntos: Array.from(serieMap.values()) },
      medios: Array.from(medios.entries()).map(([medio, ventas]) => ({ medio, ventas })),
      recientes: enActual.slice(0, 50),
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
    },
  });
}
