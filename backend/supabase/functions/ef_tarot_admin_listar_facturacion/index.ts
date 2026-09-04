// ============================================================================
// 🧾 EDGE FUNCTION: ef_tarot_admin_listar_facturacion
// Lista/filtra tarot_registros_facturacion + KPIs del rango filtrado.
// Solo admin (Next.js requireAdminSession siempre delante de esta EF).
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FUNCION = "ef_tarot_admin_listar_facturacion";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SELECT_COLUMNS =
  "id, codigo_interno, numero_interno, orden_id, cliente_id, fecha_venta, " +
  "producto_codigo, producto_nombre_snapshot, concepto, moneda, importe_bruto, descuento, importe_neto, " +
  "medio_pago, proveedor_pago, referencia_pago, datos_cliente_snapshot, " +
  "estado_registro, comprobante_solicitado, estado_comprobante, " +
  "tipo_comprobante, serie_comprobante, numero_comprobante, fecha_comprobante, origen_comprobante, " +
  "observaciones, anulado_at, anulado_motivo, anulado_por, created_at, updated_at";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}
function limitInt(v: unknown, def: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1) return def;
  return Math.min(n, max);
}
function offsetInt(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : 0;
}
function fechaISO(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// deno-lint-ignore no-explicit-any
function aplicarFiltros(query: any, f: Record<string, unknown>) {
  if (f.estado_registro) query = query.eq("estado_registro", f.estado_registro);
  if (f.estado_comprobante) query = query.eq("estado_comprobante", f.estado_comprobante);
  if (f.medio_pago) query = query.eq("medio_pago", f.medio_pago);
  if (f.producto_codigo) query = query.eq("producto_codigo", f.producto_codigo);
  if (typeof f.comprobante_solicitado === "boolean") query = query.eq("comprobante_solicitado", f.comprobante_solicitado);
  if (f.fecha_desde) query = query.gte("fecha_venta", f.fecha_desde as string);
  if (f.fecha_hasta) query = query.lt("fecha_venta", f.fecha_hasta as string);
  if (f.orden_id) query = query.eq("orden_id", f.orden_id);
  if (f.search) {
    const s = f.search as string;
    // Búsqueda sobre columnas propias + nombre/email del cliente (viven en
    // datos_cliente_snapshot jsonb — PostgREST soporta ->> dentro de .or()).
    // orden_id.eq solo se agrega si s parece un UUID, evita un error de
    // sintaxis en el filtro cuando el término buscado no lo es.
    const like = `%${s.replace(/[%_,()]/g, "")}%`;
    const esUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
    const clausulas = [
      `codigo_interno.ilike.${like}`,
      `referencia_pago.ilike.${like}`,
      `numero_comprobante.ilike.${like}`,
      `datos_cliente_snapshot->>nombre.ilike.${like}`,
      `datos_cliente_snapshot->>email.ilike.${like}`,
    ];
    if (esUUID) clausulas.push(`orden_id.eq.${s.trim()}`);
    query = query.or(clausulas.join(","));
  }
  return query;
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, motivo: "json_invalido" }, 400); }

  const filtros = {
    estado_registro: texto(body.estado_registro),
    estado_comprobante: texto(body.estado_comprobante),
    medio_pago: texto(body.medio_pago),
    producto_codigo: texto(body.producto_codigo),
    comprobante_solicitado: typeof body.comprobante_solicitado === "boolean" ? body.comprobante_solicitado : undefined,
    fecha_desde: fechaISO(body.fecha_desde),
    fecha_hasta: fechaISO(body.fecha_hasta),
    orden_id: texto(body.orden_id),
    search: texto(body.search),
  };
  const exportar = body.exportar === true;
  const limit = exportar ? 5000 : limitInt(body.limit, 50, 200);
  const offset = exportar ? 0 : offsetInt(body.offset);

  // ── Página / export ──────────────────────────────────────────
  let query = supabase.from("tarot_registros_facturacion").select(SELECT_COLUMNS, { count: "exact" });
  query = aplicarFiltros(query, filtros);
  query = query.order("numero_interno", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    return jsonResponse({ ok: false, motivo: "listar_error", error: error.message }, 500);
  }
  const registros = data ?? [];

  // ── KPIs sobre TODO el rango filtrado (no solo la página) ──────
  let kpiQuery = supabase
    .from("tarot_registros_facturacion")
    .select("importe_bruto, descuento, importe_neto, medio_pago, estado_registro, estado_comprobante, comprobante_solicitado");
  kpiQuery = aplicarFiltros(kpiQuery, filtros);
  const { data: kpiRows, error: kpiError } = await kpiQuery;
  if (kpiError) {
    return jsonResponse({ ok: false, motivo: "kpi_error", error: kpiError.message }, 500);
  }
  const filas = kpiRows ?? [];
  const activos = filas.filter((r) => r.estado_registro === "activo");
  const anulados = filas.filter((r) => r.estado_registro === "anulado");
  const mercadoPago = activos.filter((r) => r.medio_pago === "mercado_pago");
  const manual = activos.filter((r) => r.medio_pago === "manual");
  const sum = (arr: typeof filas, campo: "importe_bruto" | "descuento" | "importe_neto") =>
    arr.reduce((acc, r) => acc + (Number(r[campo]) || 0), 0);

  const facturacionBruta = sum(activos, "importe_bruto");
  const descuentosTotal = sum(activos, "descuento");
  const facturacionNeta = sum(activos, "importe_neto");
  const ticketPromedio = activos.length > 0 ? facturacionNeta / activos.length : 0;
  const comprobantesSolicitados = activos.filter((r) => r.comprobante_solicitado).length;
  const comprobantesEmitidos = activos.filter((r) => r.estado_comprobante === "emitido").length;
  const comprobantesPendientes = activos.filter((r) => r.estado_comprobante === "pendiente").length;

  const kpis = {
    ventas_registradas: activos.length,
    facturacion_bruta: parseFloat(facturacionBruta.toFixed(2)),
    descuentos_total: parseFloat(descuentosTotal.toFixed(2)),
    facturacion_neta: parseFloat(facturacionNeta.toFixed(2)),
    ticket_promedio: parseFloat(ticketPromedio.toFixed(2)),
    comprobantes_solicitados: comprobantesSolicitados,
    comprobantes_emitidos: comprobantesEmitidos,
    comprobantes_pendientes: comprobantesPendientes,
    cobros_mercado_pago: mercadoPago.length,
    cobros_manuales: manual.length,
    anulados: anulados.length,
  };

  return jsonResponse({
    ok: true,
    funcion: FUNCION,
    filtros: { ...filtros, limit, offset },
    paginacion: {
      total: count ?? registros.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null,
    },
    kpis,
    registros,
  });
});
