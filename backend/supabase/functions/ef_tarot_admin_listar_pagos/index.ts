// ============================================================================
// 💳 EDGE FUNCTION: ef_tarot_admin_listar_pagos
// ============================================================================
//
// MÓDULO:
//   Tarot THC — Administración
//
// NOMBRE TÉCNICO:
//   ef_tarot_admin_listar_pagos
//
// OBJETIVO:
//   Listar pagos de Mercado Pago del módulo Tarot.
//
// QUÉ PERMITE VER:
//   - todos los pagos
//   - por orden_id
//   - por mp_status (pending, approved, in_process, rejected, cancelled, refunded, charged_back)
//   - por moneda (UYU, ARS, USD)
//   - por rango de fechas
//   - total recaudado en la página devuelta
//
// QUÉ NO HACE:
//   - NO procesa reembolsos.
//   - NO modifica estados de pago.
//   - NO llama a Mercado Pago.
//
// TIPO:
//   Read-only / listado administrativo.
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//   - Usa SUPABASE_SERVICE_ROLE_KEY.
//
// INPUT (POST body, todos opcionales):
//   {
//     "orden_id": "uuid",
//     "mp_status": "approved",
//     "moneda": "UYU",
//     "fecha_desde": "2026-05-01",
//     "fecha_hasta": "2026-06-01",
//     "limit": 50,
//     "offset": 0,
//     "log": false
//   }
//
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// 🔐 ENV
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FUNCION = "ef_tarot_admin_listar_pagos";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// 🧰 HELPERS
// ============================================================================
function nowUTCISO() {
  return new Date().toISOString();
}
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function normalizarTexto(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  return v ? v : null;
}
function normalizarBoolean(input: unknown, defaultValue = false): boolean {
  if (typeof input === "boolean") return input;
  return defaultValue;
}
function normalizarUUID(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return v;
  return null;
}
function normalizarLimit(input: unknown): number {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isInteger(n)) return 50;
  if (n < 1) return 50;
  if (n > 200) return 200;
  return n;
}
function normalizarOffset(input: unknown): number {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isInteger(n)) return 0;
  if (n < 0) return 0;
  return n;
}
function normalizarFecha(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString();
  }
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function readBodySafe(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

async function registrarLog(
  evento: string,
  payload: Record<string, unknown> = {},
  nivel: "debug" | "info" | "warning" | "error" | "critical" = "info",
) {
  if (nivel === "debug") {
    try {
      const { data: dbgCfg } = await supabase
        .from("tarot_configuracion").select("valor").eq("clave", "debug_mode").maybeSingle();
      if (dbgCfg?.valor !== "true") return;
    } catch { return; }
  }
  try {
    await supabase.from("tarot_logs").insert([{
      evento,
      nivel,
      funcion_origen: FUNCION,
      payload,
      mensaje: evento,
    }]);
  } catch (e) {
    console.error(`[${FUNCION}] Error registrando log`, e);
  }
}

// ============================================================================
// 🧠 DIAGNÓSTICO POR PAGO
// ============================================================================
function diagnosticarPago(p: Record<string, unknown>): Record<string, unknown> {
  const warnings: string[] = [];
  const mp_status = String(p.mp_status ?? "");

  if (mp_status === "rejected") warnings.push("pago_rechazado");
  if (mp_status === "cancelled") warnings.push("pago_cancelado");
  if (mp_status === "refunded") warnings.push("pago_reembolsado");
  if (mp_status === "charged_back") warnings.push("contracargo");

  // Link expirado
  if (p.link_expira_at) {
    if (new Date(String(p.link_expira_at)).getTime() < Date.now()) {
      warnings.push("link_pago_expirado");
    }
  }

  const healthy = warnings.length === 0;
  const estado_resumen = mp_status === "approved"
    ? "ok"
    : mp_status === "rejected"
    ? "rechazado"
    : mp_status === "pending" || mp_status === "in_process"
    ? "pendiente"
    : mp_status || "sin_estado";

  return { healthy, warnings, estado_resumen };
}

// ============================================================================
// 🧾 RESUMEN TEXTUAL
// ============================================================================
function construirResumenTexto(params: {
  total: number;
  limit: number;
  offset: number;
  filtros: Record<string, unknown>;
  total_aprobado: number;
  moneda_aprobado: string;
}): string {
  const { total, limit, offset, filtros, total_aprobado, moneda_aprobado } = params;
  const activos = Object.entries(filtros)
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false)
    .map(([k, v]) => `${k}: ${String(v)}`);
  return [
    `💳 Pagos Mercado Pago — Tarot`,
    ``,
    `Total encontrado: ${total}`,
    `Mostrando: ${limit}`,
    `Offset: ${offset}`,
    ``,
    `Total aprobado en página: ${moneda_aprobado} ${total_aprobado.toFixed(2)}`,
    ``,
    `Filtros: ${activos.length > 0 ? activos.join(" | ") : "sin filtros específicos"}`,
  ].join("\n");
}

// ============================================================================
// 🚀 HANDLER
// ============================================================================
serve(async (req) => {
  const tsNow = nowUTCISO();

  // 1) Seguridad
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }

  // 2) Método
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, motivo: "metodo_no_permitido", mensaje: "Usar POST." }, 405);
  }

  // 3) Parámetros
  const body = await readBodySafe(req);
  const orden_id = normalizarUUID(body.orden_id);
  const mp_status = normalizarTexto(body.mp_status);
  const moneda = normalizarTexto(body.moneda);
  const fecha_desde = normalizarFecha(body.fecha_desde);
  const fecha_hasta = normalizarFecha(body.fecha_hasta);
  const shouldLog = normalizarBoolean(body.log, false);
  const limit = normalizarLimit(body.limit);
  const offset = normalizarOffset(body.offset);

  // 4) Validación fechas
  if (fecha_desde && fecha_hasta) {
    if (new Date(fecha_hasta) <= new Date(fecha_desde)) {
      return jsonResponse({
        ok: false,
        motivo: "rango_fechas_invalido",
        mensaje: "fecha_hasta debe ser mayor que fecha_desde.",
      }, 400);
    }
  }

  // 5) Query
  // Excluimos webhook_payload (puede ser muy grande) del listado base.
  let query = supabase
    .from("tarot_pagos")
    .select(
      `id, orden_id,
       mp_preference_id, mp_payment_id, mp_external_reference,
       mp_status, mp_status_detail, mp_payment_type, mp_payment_method_id, mp_installments,
       monto, moneda,
       link_pago, link_expira_at,
       webhook_received_at, created_at, updated_at`,
      { count: "exact" },
    );

  if (orden_id) query = query.eq("orden_id", orden_id);
  if (mp_status) query = query.eq("mp_status", mp_status);
  if (moneda) query = query.eq("moneda", moneda);
  if (fecha_desde) query = query.gte("created_at", fecha_desde);
  if (fecha_hasta) query = query.lt("created_at", fecha_hasta);

  query = query
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // 6) Ejecutar
  const { data, error, count } = await query;
  if (error) {
    await registrarLog("listar_pagos_error", { error: error.message }, "error");
    return jsonResponse({ ok: false, motivo: "listar_pagos_error", error: error.message }, 500);
  }

  const pagosRaw = Array.isArray(data) ? data : [];

  // 7) Enriquecer
  const pagos = pagosRaw.map((p) => ({
    ...p,
    diagnostico_admin: diagnosticarPago(p as Record<string, unknown>),
  }));

  // 8) Métricas financieras en página
  const pagos_aprobados = pagos.filter((p) => p.mp_status === "approved");
  const total_aprobado = pagos_aprobados.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
  const moneda_aprobado = pagos_aprobados[0]?.moneda ?? moneda ?? "UYU";

  const conteo_por_status = pagos.reduce((acc: Record<string, number>, p) => {
    const k = String(p.mp_status ?? "sin_estado");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  // 9) Warnings
  const warnings: string[] = [];
  if ((count ?? 0) > limit) warnings.push("hay_mas_resultados_que_el_limit");
  if (pagos.some((p) => p.mp_status === "rejected")) warnings.push("hay_pagos_rechazados");
  if (pagos.some((p) => p.mp_status === "charged_back")) warnings.push("hay_contracargos");
  if (pagos.some((p) => p.mp_status === "refunded")) warnings.push("hay_reembolsos");

  // 10) Resumen
  const filtros = { orden_id, mp_status, moneda, fecha_desde, fecha_hasta };
  const resumen_texto = construirResumenTexto({
    total: count ?? pagos.length,
    limit,
    offset,
    filtros,
    total_aprobado,
    moneda_aprobado: String(moneda_aprobado),
  });

  // 11) Respuesta
  const response = {
    ok: true,
    healthy: pagos.every(
      (p) => (p.diagnostico_admin as Record<string, unknown>)?.healthy === true,
    ),
    funcion: FUNCION,
    timestamp_utc: tsNow,
    resumen_texto,
    filtros: { ...filtros, limit, offset },
    paginacion: {
      total: count ?? pagos.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null,
    },
    metricas_pagina: {
      total_aprobado: parseFloat(total_aprobado.toFixed(2)),
      moneda_aprobado,
      cantidad_aprobados: pagos_aprobados.length,
      conteo_por_status,
    },
    pagos,
    warnings,
  };

  if (shouldLog) {
    await registrarLog(
      pagos.length === 0 ? "listar_pagos_sin_resultados" : "listar_pagos_con_resultados",
      { filtros: response.filtros, paginacion: response.paginacion, warnings },
    );
  }

  return jsonResponse(response, 200);
});
