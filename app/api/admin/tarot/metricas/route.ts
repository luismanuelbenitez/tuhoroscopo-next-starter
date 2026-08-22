import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { createClient } from "@supabase/supabase-js";
import { fetchResumenClientesUnicos } from "@/lib/tarotClientesUnicos";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  if (!supabaseUrl || !serviceRoleKey || !internalKey) return null;
  return { supabaseUrl, serviceRoleKey, internalKey };
}

// Cuenta filas usando el header content-range de PostgREST (sin traer datos).
async function countTable(
  base: string,
  table: string,
  filters: string,
  headers: Record<string, string>,
): Promise<number> {
  const url = `${base}/${table}?select=id&limit=1${filters ? `&${filters}` : ""}`;
  const res = await fetch(url, { headers: { ...headers, Prefer: "count=exact" } });
  const range = res.headers.get("content-range");
  if (!range) return 0;
  const match = range.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// Filtra funnel_events a tarot solamente.
// product_id = 'tarot_one_shot' cubre eventos de EFs (siempre lo setean) y
// frontend (trackViewItem/trackBeginCheckout/trackLandingViewed pasados con key='tarot').
// El OR con path cubre landing_viewed si product_id llegó null por alguna razón.
function funnelFilter(eventName: string, cutoffISO: string): string {
  return (
    `event_name=eq.${eventName}` +
    `&created_at=gte.${cutoffISO}` +
    `&or=(product_id.eq.tarot_one_shot,path.like./tarot*)`
  );
}

// Devuelve proporción redondeada a 4 decimales. 0 si divisor = 0.
function safeRate(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 10000) / 10000;
}

const VALID_PERIODS = new Set([1, 7, 30, 90]);

const ESTADOS_PAGADO = [
  "pago_confirmado", "generando_lectura", "lectura_lista",
  "generando_pdf", "pdf_listo", "enviando_whatsapp", "entregado",
];

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });

  const { supabaseUrl, serviceRoleKey, internalKey } = env;
  const base = `${supabaseUrl}/rest/v1`;
  const restHeaders = {
    apikey:        serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  const periodoParam = parseInt(req.nextUrl.searchParams.get("periodo") ?? "30", 10);
  const periodoDias  = VALID_PERIODS.has(periodoParam) ? periodoParam : 30;
  const cutoffISO    = new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000).toISOString();

  const hoyISO      = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const ESTADOS_ERR = "error_lectura,error_pdf,error_whatsapp,error_critico";

  try {
    // ── Todas las counts en una sola ronda paralela ────────────────────────
    const [
      totalOrdenes, ordenesHoy, ordenesPagadas, ordenesCompletadas, ordenesError,
      totalLecturas, lecturasHoy,
      totalPdfs, pdfsHoy,
      cVisitas, cProducto, cCheckout, cPagos,
      cLecturaOk, cPdfOk, cWaOk,
      cLecturaFail, cPdfFail, cWaFail,
      cReclamosTotal, cReclamosAbiertos,
      resumenClientes,
    ] = await Promise.all([
      // Métricas existentes (sin cambios)
      countTable(base, "tarot_ordenes", "", restHeaders),
      countTable(base, "tarot_ordenes", `created_at=gte.${hoyISO}`, restHeaders),
      countTable(base, "tarot_ordenes", `estado=in.(${ESTADOS_PAGADO.join(",")})`, restHeaders),
      countTable(base, "tarot_ordenes", "estado=eq.entregado", restHeaders),
      countTable(base, "tarot_ordenes", `estado=in.(${ESTADOS_ERR})`, restHeaders),
      countTable(base, "tarot_lecturas", "es_vigente=eq.true", restHeaders),
      countTable(base, "tarot_lecturas", `es_vigente=eq.true&created_at=gte.${hoyISO}`, restHeaders),
      // "listo" es el estado real de éxito que escribe ef_tarot_generar_pdf.
      // "generado" es un valor legacy que el CHECK de tarot_pdfs todavía permite
      // pero que el pipeline actual nunca escribe — filtrar por él da 0 siempre.
      countTable(base, "tarot_pdfs", "estado=eq.listo", restHeaders),
      countTable(base, "tarot_pdfs", `estado=eq.listo&created_at=gte.${hoyISO}`, restHeaders),
      // Funnel de validación — conteos de funnel_events
      countTable(base, "funnel_events", funnelFilter("landing_viewed",        cutoffISO), restHeaders),
      countTable(base, "funnel_events", funnelFilter("product_viewed",         cutoffISO), restHeaders),
      countTable(base, "funnel_events", funnelFilter("checkout_started",       cutoffISO), restHeaders),
      countTable(base, "funnel_events", funnelFilter("payment_approved",       cutoffISO), restHeaders),
      countTable(base, "funnel_events", funnelFilter("generation_succeeded",   cutoffISO), restHeaders),
      countTable(base, "funnel_events", funnelFilter("pdf_generated",          cutoffISO), restHeaders),
      countTable(base, "funnel_events", funnelFilter("whatsapp_sent",          cutoffISO), restHeaders),
      countTable(base, "funnel_events", funnelFilter("generation_failed",      cutoffISO), restHeaders),
      countTable(base, "funnel_events", funnelFilter("pdf_generation_failed",  cutoffISO), restHeaders),
      countTable(base, "funnel_events", funnelFilter("whatsapp_failed",        cutoffISO), restHeaders),
      // Reclamos desde tarot_ordenes — filtrados por período (igual que UTM y funnel)
      countTable(base, "tarot_ordenes", `has_complaint=eq.true&created_at=gte.${cutoffISO}`, restHeaders),
      countTable(base, "tarot_ordenes", `has_complaint=eq.true&follow_up_status=is.null&created_at=gte.${cutoffISO}`, restHeaders),
      // Clientes únicos / recurrentes — fuente canónica única (Regla 3),
      // ver lib/tarotClientesUnicos.ts y docs/product/DECISIONS.md 2026-08-22.
      // clientes_unicos_total y clientes_recurrentes_historico son históricos
      // (no dependen del período), el "periodo" acá solo se pasa por
      // consistencia con el resto del endpoint.
      fetchResumenClientesUnicos({ supabaseUrl, internalKey, serviceRoleKey, periodo: periodoDias }),
    ]);

    if (!resumenClientes.ok) {
      return NextResponse.json(
        { ok: false, motivo: "clientes_unicos_error", detalle: resumenClientes.detalle ?? resumenClientes.motivo },
        { status: 502 },
      );
    }
    const totalClientes = resumenClientes.resumen.clientes_unicos_total;
    const clientesRecurrentes = resumenClientes.resumen.clientes_recurrentes_historico;

    // ── UTM: fuente autoritativa = columnas de tarot_ordenes ─────────────
    // No usamos funnel_events.metadata para UTM — la orden tiene los valores nativamente.
    // Fallback metadata solo si en el futuro tarot_ordenes.utm_source estuviera vacío.
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: ordenesUtm } = await supabase
      .from("tarot_ordenes")
      .select("utm_source, utm_campaign, precio_cobrado, moneda")
      .in("estado", ESTADOS_PAGADO)
      .gte("created_at", cutoffISO);

    type UtmEntry = { utm_source: string; utm_campaign: string | null; ventas: number; total_uyu: number };
    const utmMap = new Map<string, UtmEntry>();
    for (const o of (ordenesUtm ?? [])) {
      const src = (o.utm_source  as string | null) ?? "(directo)";
      const cmp = (o.utm_campaign as string | null) ?? null;
      const key = `${src}::${cmp ?? ""}`;
      const cur = utmMap.get(key);
      const monto = (o.moneda as string) === "UYU" ? Number(o.precio_cobrado ?? 0) : 0;
      if (cur) {
        cur.ventas    += 1;
        cur.total_uyu += monto;
      } else {
        utmMap.set(key, { utm_source: src, utm_campaign: cmp, ventas: 1, total_uyu: monto });
      }
    }
    const ventasPorUtm = Array.from(utmMap.values())
      .sort((a, b) => b.ventas - a.ventas)
      .slice(0, 10);

    // ── Respuesta ─────────────────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      // Campos existentes — sin cambios para no romper el dashboard actual
      ordenes: {
        total:      totalOrdenes,
        hoy:        ordenesHoy,
        pagadas:    ordenesPagadas,
        completadas: ordenesCompletadas,
        con_error:  ordenesError,
      },
      lecturas: { total: totalLecturas, hoy: lecturasHoy },
      pdfs:     { total: totalPdfs,     hoy: pdfsHoy     },
      // clientes.total: hasta 2026-08-21 era un COUNT crudo de tarot_clientes
      // (registros, no personas). Desde 2026-08-22 es clientes_unicos_total
      // de la fuente canónica de identidad — mismo shape de campo, valor
      // corregido. Ver docs/product/DECISIONS.md 2026-08-22.
      clientes: { total: totalClientes },
      // Campos nuevos S6
      funnel: {
        periodo_dias:         periodoDias,
        visitas:              cVisitas,
        vistas_producto:      cProducto,
        checkout_iniciado:    cCheckout,
        pagos_aprobados:      cPagos,
        lectura_ok:           cLecturaOk,
        pdf_ok:               cPdfOk,
        whatsapp_ok:          cWaOk,
        lectura_fallida:      cLecturaFail,
        pdf_fallido:          cPdfFail,
        whatsapp_fallido:     cWaFail,
        conv_visita_a_pago:   safeRate(cPagos,    cVisitas),
        conv_checkout_a_pago: safeRate(cPagos,    cCheckout),
        conv_pago_a_whatsapp: safeRate(cWaOk,     cPagos),
        clientes_recurrentes: clientesRecurrentes,
      },
      ventas_por_utm: ventasPorUtm,
      reclamos: {
        total:    cReclamosTotal,
        abiertos: cReclamosAbiertos,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
