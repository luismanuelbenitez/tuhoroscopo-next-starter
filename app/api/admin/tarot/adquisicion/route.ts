import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/tarot/adquisicion
//
// Datos crudos + derivados para el panel V1 de discovery comercial
// (docs/product/DECISIONS.md 2026-08-20). Reutiliza fuentes existentes:
//   - tarot_ordenes / tarot_pagos: ingresos, compradores (mismos estados
//     "pagado" que ya usa /api/admin/tarot/metricas e /ingresos)
//   - tarot_lecturas.ia_costo_usd: costo operativo IA (ya existía, nunca
//     agregado en un endpoint de negocio)
//   - campaign_costs: gasto publicitario (tabla ya existía en DB, vacía y
//     sin uso — ahora se lee/escribe acá)
//   - discovery_experimentos: presupuesto del experimento activo
//   - tarot_configuracion.tipo_cambio_usd_uyu: tipo de cambio manual
//
// NO reimplementa el funnel (ya existe en /api/admin/tarot/metricas) ni
// los totales de ingresos por semana (ya existen en /api/admin/tarot/ingresos)
// — el panel los consume por separado y los combina en el cliente.
// ============================================================================

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

// Mismo set que /api/admin/tarot/metricas — una orden "pagada" es la que
// llegó al menos a pago_confirmado. Fuente única de este estado de negocio.
const ESTADOS_PAGADO = [
  "pago_confirmado", "generando_lectura", "lectura_lista",
  "generando_pdf", "pdf_listo", "enviando_whatsapp", "entregado",
];

const VALID_PERIODS = new Set([1, 7, 30, 90]);

function cutoffFromParams(req: NextRequest): { desde: string; hasta: string | null; periodoDias: number | null } {
  const desdeParam = req.nextUrl.searchParams.get("desde");
  const hastaParam = req.nextUrl.searchParams.get("hasta");
  if (desdeParam) {
    // Personalizado: desde (requerido) + hasta (opcional, default ahora)
    return { desde: new Date(desdeParam).toISOString(), hasta: hastaParam ? new Date(hastaParam).toISOString() : null, periodoDias: null };
  }
  const periodoParam = parseInt(req.nextUrl.searchParams.get("periodo") ?? "30", 10);
  const periodoDias = VALID_PERIODS.has(periodoParam) ? periodoParam : 30;
  return { desde: new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000).toISOString(), hasta: null, periodoDias };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ── GET ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { desde, hasta, periodoDias } = cutoffFromParams(req);

  try {
    // ── Experimento activo ─────────────────────────────────────────────
    const { data: experimento } = await supabase
      .from("discovery_experimentos")
      .select("id, nombre, hipotesis, presupuesto, moneda, fecha_inicio, fecha_fin, activo, notas")
      .eq("activo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── Tipo de cambio manual ───────────────────────────────────────────
    const { data: cfgCambio } = await supabase
      .from("tarot_configuracion")
      .select("valor")
      .eq("clave", "tipo_cambio_usd_uyu")
      .maybeSingle();
    const tipoCambio = cfgCambio?.valor ? Number(cfgCambio.valor) : null;
    const tipoCambioValido = tipoCambio !== null && Number.isFinite(tipoCambio) && tipoCambio > 0 ? tipoCambio : null;

    // ── Gasto publicitario ──────────────────────────────────────────────
    // Total del experimento completo (todo el histórico de campaign_costs,
    // no filtrado por período — el presupuesto se consume acumulativamente)
    // y total del período seleccionado (para CAC/ROAS del período).
    const [{ data: gastoTotalRows }, { data: gastoPeriodoRows }, { data: gastoRecientes }] = await Promise.all([
      supabase.from("campaign_costs").select("amount, currency"),
      hasta
        ? supabase.from("campaign_costs").select("amount, currency").gte("date", desde.slice(0, 10)).lte("date", hasta.slice(0, 10))
        : supabase.from("campaign_costs").select("amount, currency").gte("date", desde.slice(0, 10)),
      supabase.from("campaign_costs").select("id, date, platform, utm_source, utm_campaign, amount, currency, impressions, clicks, notes").order("date", { ascending: false }).limit(20),
    ]);

    function sumarPorMoneda(rows: { amount: number; currency: string | null }[] | null): Record<string, number> {
      const acc: Record<string, number> = {};
      for (const r of rows ?? []) {
        const c = r.currency ?? "UYU";
        acc[c] = (acc[c] ?? 0) + num(r.amount);
      }
      return acc;
    }

    const gastoTotalExperimento = sumarPorMoneda(gastoTotalRows);
    const gastoPeriodo = sumarPorMoneda(gastoPeriodoRows);
    const gastoTotalUsd = gastoTotalExperimento.USD ?? 0;
    const gastoPeriodoUsd = gastoPeriodo.USD ?? 0;

    // ── Compradores + ingresos del período ──────────────────────────────
    const ordenesQuery = supabase
      .from("tarot_ordenes")
      .select("id, precio_cobrado, moneda, created_at")
      .in("estado", ESTADOS_PAGADO)
      .gte("created_at", desde);
    const { data: ordenesPagadas } = hasta
      ? await ordenesQuery.lte("created_at", hasta)
      : await ordenesQuery;

    const { data: pagosDeEsasOrdenes } = await supabase
      .from("tarot_pagos")
      .select("orden_id, cobro_manual")
      .in("orden_id", (ordenesPagadas ?? []).map((o) => o.id as string).length > 0 ? (ordenesPagadas ?? []).map((o) => o.id as string) : ["00000000-0000-0000-0000-000000000000"]);

    const cobroManualSet = new Set((pagosDeEsasOrdenes ?? []).filter((p) => p.cobro_manual === true).map((p) => p.orden_id as string));

    const ordenesUyu = (ordenesPagadas ?? []).filter((o) => (o.moneda as string) === "UYU");
    const ingresoNetoUyu = ordenesUyu.reduce((acc, o) => acc + num(o.precio_cobrado), 0);
    const compradoresTotal = (ordenesPagadas ?? []).length;
    const compradoresCobroManual = (ordenesPagadas ?? []).filter((o) => cobroManualSet.has(o.id as string)).length;
    const compradoresRealesMp = compradoresTotal - compradoresCobroManual;
    const ticketPromedioUyu = ordenesUyu.length > 0 ? ingresoNetoUyu / ordenesUyu.length : 0;

    // Descuentos: suma de descuento_aplicado para usos "aplicado" cuyas
    // órdenes están en el set de órdenes pagadas del período.
    const ordenIds = (ordenesPagadas ?? []).map((o) => o.id as string);
    let descuentosUyu = 0;
    if (ordenIds.length > 0) {
      const { data: usos } = await supabase
        .from("tarot_codigos_descuento_usos")
        .select("descuento_aplicado, moneda, orden_id, estado_uso")
        .in("orden_id", ordenIds)
        .eq("estado_uso", "aplicado")
        .eq("moneda", "UYU");
      descuentosUyu = (usos ?? []).reduce((acc, u) => acc + num(u.descuento_aplicado), 0);
    }
    const ventasBrutasUyu = ingresoNetoUyu + descuentosUyu;

    // ── Costo IA del período ────────────────────────────────────────────
    const lecturasQuery = supabase
      .from("tarot_lecturas")
      .select("ia_costo_usd, created_at")
      .eq("estado", "completada")
      .gte("created_at", desde);
    const { data: lecturasCosto } = hasta
      ? await lecturasQuery.lte("created_at", hasta)
      : await lecturasQuery;
    const costoIaTotalUsd = (lecturasCosto ?? []).reduce((acc, l) => acc + num(l.ia_costo_usd), 0);
    const costoIaPromedioUsd = (lecturasCosto ?? []).length > 0 ? costoIaTotalUsd / (lecturasCosto ?? []).length : null;

    // ── Derivados (fórmulas documentadas — ver docs/product/DECISIONS.md) ──
    // CAC = gasto publicitario (USD, período) / compradores atribuidos (período).
    // Requiere gasto > 0: con gasto = 0 (todavía no se cargó ningún gasto)
    // CAC no es "gratis", es "no disponible" — mostrar $0 acá sería
    // exactamente el caso que este sprint prohíbe explícitamente.
    const cacUsd = compradoresTotal > 0 && gastoPeriodoUsd > 0 ? gastoPeriodoUsd / compradoresTotal : null;

    // ROAS = ingresos atribuidos / gasto publicitario, en la MISMA moneda.
    // Requiere tipo de cambio manual válido para convertir ingreso UYU a USD.
    // Sin tipo de cambio cargado, ROAS es "no disponible" — nunca se inventa.
    const ingresoNetoUsd = tipoCambioValido ? ingresoNetoUyu / tipoCambioValido : null;
    const roas = tipoCambioValido && gastoPeriodoUsd > 0 && ingresoNetoUsd !== null
      ? ingresoNetoUsd / gastoPeriodoUsd
      : null;

    // Costo variable por orden: por ahora solo el costo IA es imputable de
    // forma confiable (PDF/WhatsApp/Email no tienen costo trackeado — ver
    // docs/modules/payment-mercadopago-reference.md). No se inventa un
    // costo por canal que no podemos conocer.
    const costoVariableUsdPorOrden = costoIaPromedioUsd;

    // Margen de contribución aproximado (UYU): ingreso neto - (gasto ads +
    // costo IA) convertidos a UYU si hay tipo de cambio; si no, se muestra
    // null y el panel debe indicar "no disponible", no asumir cero.
    const margenUyu = tipoCambioValido
      ? ingresoNetoUyu - (gastoPeriodoUsd * tipoCambioValido) - (costoIaTotalUsd * tipoCambioValido)
      : null;
    const margenPorOrdenUyu = margenUyu !== null && compradoresTotal > 0 ? margenUyu / compradoresTotal : null;

    return NextResponse.json({
      ok: true,
      periodo_dias: periodoDias,
      desde,
      hasta,
      experimento: experimento
        ? {
            nombre: experimento.nombre,
            hipotesis: experimento.hipotesis,
            presupuesto: num(experimento.presupuesto),
            moneda: experimento.moneda,
            fecha_inicio: experimento.fecha_inicio,
            fecha_fin: experimento.fecha_fin,
          }
        : null,
      tipo_cambio_usd_uyu: tipoCambioValido,
      gasto: {
        total_experimento_por_moneda: gastoTotalExperimento,
        total_periodo_por_moneda: gastoPeriodo,
        entradas_recientes: gastoRecientes ?? [],
      },
      costo_ia: {
        total_usd: costoIaTotalUsd,
        lecturas_contadas: (lecturasCosto ?? []).length,
        promedio_usd_por_lectura: costoIaPromedioUsd,
      },
      compradores: {
        total: compradoresTotal,
        cobro_manual: compradoresCobroManual,
        reales_mercado_pago: compradoresRealesMp,
      },
      ingresos: {
        bruto_uyu: ventasBrutasUyu,
        descuentos_uyu: descuentosUyu,
        neto_uyu: ingresoNetoUyu,
        ticket_promedio_uyu: ticketPromedioUyu,
      },
      derivados: {
        cac_usd: cacUsd,
        roas,
        costo_variable_usd_por_orden: costoVariableUsdPorOrden,
        margen_contribucion_uyu: margenUyu,
        margen_por_orden_uyu: margenPorOrdenUyu,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

// ── POST — registrar gasto publicitario ─────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, motivo: "json_invalido" }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date : null;
  const amount = Number(body.amount);
  if (!date || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, motivo: "date_y_amount_requeridos" }, { status: 400 });
  }

  const { error } = await supabase.from("campaign_costs").insert({
    date,
    platform: typeof body.platform === "string" && body.platform.trim() ? body.platform.trim() : "meta",
    utm_source: typeof body.utm_source === "string" ? body.utm_source.trim() || null : null,
    utm_campaign: typeof body.utm_campaign === "string" ? body.utm_campaign.trim() || null : null,
    amount,
    currency: typeof body.currency === "string" && body.currency.trim() ? body.currency.trim().toUpperCase() : "USD",
    impressions: Number.isFinite(Number(body.impressions)) && body.impressions !== "" && body.impressions != null ? Number(body.impressions) : null,
    clicks: Number.isFinite(Number(body.clicks)) && body.clicks !== "" && body.clicks != null ? Number(body.clicks) : null,
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
  });

  if (error) {
    return NextResponse.json({ ok: false, motivo: "insert_error", detalle: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
