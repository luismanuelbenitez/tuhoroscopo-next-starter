// ============================================================================
// 🃏 EDGE FUNCTION: ef_tarot_admin_listar_ordenes
// ============================================================================
//
// MÓDULO:
//   Tarot THC — Administración
//
// NOMBRE TÉCNICO:
//   ef_tarot_admin_listar_ordenes
//
// OBJETIVO:
//   Listar órdenes de Tarot con filtros administrativos.
//   Incluye datos del cliente (nombre, teléfono, email) via JOIN.
//
// QUÉ PERMITE VER:
//   - todas las órdenes
//   - por estado (formulario_completo, pago_confirmado, lectura_lista, etc.)
//   - por tema (general, amor, trabajo, salud, dinero)
//   - por moneda (UYU, ARS, USD)
//   - por cliente_id
//   - por rango de fechas
//   - búsqueda por external_reference o notas_internas
//
// QUÉ NO HACE:
//   - NO modifica órdenes.
//   - NO regenera lecturas ni PDFs.
//   - NO toca Mercado Pago.
//   - NO envía WhatsApp.
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
//     "estado": "pago_confirmado",
//     "tema": "amor",
//     "moneda": "UYU",
//     "cliente_id": "uuid",
//     "buscar": "TAROT-",
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
const FUNCION = "ef_tarot_admin_listar_ordenes";
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
// 🧠 DIAGNÓSTICO POR ORDEN
// ============================================================================
function diagnosticarOrden(o: Record<string, unknown>): Record<string, unknown> {
  const warnings: string[] = [];
  const estado = String(o.estado ?? "");

  if (estado.startsWith("error_")) warnings.push("estado_de_error");
  if (estado === "error_critico") warnings.push("error_critico");
  if (estado === "cancelado") warnings.push("orden_cancelada");

  // Orden con pago iniciado pero sin confirmar hace más de 24h
  if (estado === "pago_iniciado" && o.created_at) {
    const horasDesdeCreacion =
      (Date.now() - new Date(String(o.created_at)).getTime()) / 3_600_000;
    if (horasDesdeCreacion > 24) warnings.push("pago_posiblemente_expirado");
  }

  // Formulario completo sin avanzar en más de 2h
  if (estado === "formulario_completo" && o.created_at) {
    const horasDesdeCreacion =
      (Date.now() - new Date(String(o.created_at)).getTime()) / 3_600_000;
    if (horasDesdeCreacion > 2) warnings.push("formulario_abandonado");
  }

  const healthy = warnings.length === 0;
  let estado_resumen = "ok";
  if (warnings.includes("error_critico")) estado_resumen = "error_critico";
  else if (warnings.includes("estado_de_error")) estado_resumen = "con_error";
  else if (warnings.includes("orden_cancelada")) estado_resumen = "cancelada";
  else if (warnings.includes("pago_posiblemente_expirado")) estado_resumen = "pago_expirado";
  else if (warnings.includes("formulario_abandonado")) estado_resumen = "abandonado";

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
}): string {
  const { total, limit, offset, filtros } = params;
  const activos = Object.entries(filtros)
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false)
    .map(([k, v]) => `${k}: ${String(v)}`);
  return [
    `🃏 Órdenes de Tarot`,
    ``,
    `Total encontrado: ${total}`,
    `Mostrando: ${limit}`,
    `Offset: ${offset}`,
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
  const estado = normalizarTexto(body.estado);
  const tema = normalizarTexto(body.tema);
  const moneda = normalizarTexto(body.moneda);
  const cliente_id = normalizarUUID(body.cliente_id);
  const buscar = normalizarTexto(body.buscar);
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
  let query = supabase
    .from("tarot_ordenes")
    .select(
      `id, cliente_id, tipo_tirada_id, mazo_id, estado, external_reference,
       pregunta_usuario, tema, precio_cobrado, moneda, idioma, origen_canal,
       utm_source, utm_medium, utm_campaign, notas_internas,
       created_at, updated_at,
       tarot_clientes ( nombre_completo, telefono, email )`,
      { count: "exact" },
    );

  if (estado) query = query.eq("estado", estado);
  if (tema) query = query.eq("tema", tema);
  if (moneda) query = query.eq("moneda", moneda);
  if (cliente_id) query = query.eq("cliente_id", cliente_id);
  if (fecha_desde) query = query.gte("created_at", fecha_desde);
  if (fecha_hasta) query = query.lt("created_at", fecha_hasta);

  if (buscar) {
    const term = `%${buscar}%`;
    query = query.or(
      [`external_reference.ilike.${term}`, `notas_internas.ilike.${term}`].join(","),
    );
  }

  query = query
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // 6) Ejecutar
  const { data, error, count } = await query;
  if (error) {
    await registrarLog("listar_ordenes_error", { error: error.message }, "error");
    return jsonResponse({ ok: false, motivo: "listar_ordenes_error", error: error.message }, 500);
  }

  const ordenesRaw = Array.isArray(data) ? data : [];

  // 7) Enriquecer
  const ordenes = ordenesRaw.map((o) => ({
    ...o,
    diagnostico_admin: diagnosticarOrden(o as Record<string, unknown>),
  }));

  // 8) Conteos en página
  const conteo_por_estado = ordenes.reduce((acc: Record<string, number>, o) => {
    const k = String(o.estado ?? "sin_estado");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const conteo_por_diagnostico = ordenes.reduce((acc: Record<string, number>, o) => {
    const k = String((o.diagnostico_admin as Record<string, unknown>)?.estado_resumen ?? "ok");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  // 9) Warnings
  const warnings: string[] = [];
  if ((count ?? 0) > limit) warnings.push("hay_mas_resultados_que_el_limit");
  if (ordenes.some((o) => String(o.estado ?? "").startsWith("error_"))) {
    warnings.push("hay_ordenes_con_error");
  }

  // 10) Resumen
  const filtros = { estado, tema, moneda, cliente_id, buscar, fecha_desde, fecha_hasta };
  const resumen_texto = construirResumenTexto({ total: count ?? ordenes.length, limit, offset, filtros });

  // 11) Respuesta
  const response = {
    ok: true,
    healthy: ordenes.every(
      (o) => (o.diagnostico_admin as Record<string, unknown>)?.healthy === true,
    ),
    funcion: FUNCION,
    timestamp_utc: tsNow,
    resumen_texto,
    filtros: { ...filtros, limit, offset },
    paginacion: {
      total: count ?? ordenes.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null,
    },
    conteos_pagina: {
      por_estado: conteo_por_estado,
      por_diagnostico: conteo_por_diagnostico,
    },
    ordenes,
    warnings,
  };

  if (shouldLog) {
    await registrarLog(
      ordenes.length === 0 ? "listar_ordenes_sin_resultados" : "listar_ordenes_con_resultados",
      { filtros: response.filtros, paginacion: response.paginacion, warnings },
    );
  }

  return jsonResponse(response, 200);
});
