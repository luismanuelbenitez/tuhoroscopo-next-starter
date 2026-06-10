// ============================================================================
// 🪵 EDGE FUNCTION: ef_tarot_admin_listar_logs
// ============================================================================
//
// MÓDULO:
//   Tarot THC — Administración
//
// NOMBRE TÉCNICO:
//   ef_tarot_admin_listar_logs
//
// OBJETIVO:
//   Listar el audit trail de tarot_logs con filtros administrativos.
//
// QUÉ PERMITE VER:
//   - todos los eventos del módulo Tarot
//   - por orden_id
//   - por cliente_id
//   - por evento (nombre del evento)
//   - por nivel (debug, info, warning, error, critical)
//   - por funcion_origen
//   - solo errores (nivel IN error, critical)
//   - por rango de fechas
//   - búsqueda libre en el log (filtrada en memoria sobre la página devuelta)
//
// QUÉ NO HACE:
//   - NO modifica logs.
//   - NO borra logs.
//   - NO reintenta procesos.
//
// TIPO:
//   Read-only / observabilidad.
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//   - Usa SUPABASE_SERVICE_ROLE_KEY.
//
// INPUT (POST body, todos opcionales):
//   {
//     "orden_id": "uuid",
//     "cliente_id": "uuid",
//     "evento": "orden_creada",
//     "nivel": "error",
//     "funcion_origen": "ef_tarot_generar_lectura",
//     "solo_errores": false,
//     "buscar": "timeout",
//     "fecha_desde": "2026-05-01",
//     "fecha_hasta": "2026-06-01",
//     "limit": 50,
//     "offset": 0,
//     "log": false
//   }
//
// NOTA SOBRE buscar:
//   Filtra en memoria sobre la página devuelta (serialización JSON del log).
//   Para búsquedas masivas, usar filtros SQL específicos.
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
const FUNCION = "ef_tarot_admin_listar_logs";
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

// ============================================================================
// 🔍 FILTRO POR TEXTO EN MEMORIA
// ----------------------------------------------------------------------------
// Serializa cada log como JSON y busca el término.
// Útil para soporte manual sobre la página devuelta.
// ============================================================================
function filtrarPorTexto(
  logs: Record<string, unknown>[],
  buscar: string | null,
): Record<string, unknown>[] {
  if (!buscar) return logs;
  const needle = buscar.toLowerCase();
  return logs.filter((log) => {
    try {
      return JSON.stringify(log).toLowerCase().includes(needle);
    } catch {
      return false;
    }
  });
}

// ============================================================================
// 🧾 RESUMEN TEXTUAL
// ============================================================================
function construirResumenTexto(params: {
  total: number;
  limit: number;
  offset: number;
  orden_id: string | null;
  cliente_id: string | null;
  evento: string | null;
  nivel: string | null;
  funcion_origen: string | null;
  solo_errores: boolean;
  buscar: string | null;
  fecha_desde: string | null;
  fecha_hasta: string | null;
}): string {
  const filtros: string[] = [];
  if (params.orden_id) filtros.push(`orden_id: ${params.orden_id}`);
  if (params.cliente_id) filtros.push(`cliente_id: ${params.cliente_id}`);
  if (params.evento) filtros.push(`evento: ${params.evento}`);
  if (params.nivel) filtros.push(`nivel: ${params.nivel}`);
  if (params.funcion_origen) filtros.push(`función: ${params.funcion_origen}`);
  if (params.solo_errores) filtros.push("solo errores");
  if (params.buscar) filtros.push(`buscar: ${params.buscar}`);
  if (params.fecha_desde) filtros.push(`desde: ${params.fecha_desde}`);
  if (params.fecha_hasta) filtros.push(`hasta: ${params.fecha_hasta}`);
  return [
    `🪵 Logs de Tarot`,
    ``,
    `Total encontrado: ${params.total}`,
    `Mostrando: ${params.limit}`,
    `Offset: ${params.offset}`,
    ``,
    `Filtros: ${filtros.length > 0 ? filtros.join(" | ") : "sin filtros específicos"}`,
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
  const cliente_id = normalizarUUID(body.cliente_id);
  const evento = normalizarTexto(body.evento);
  const nivel = normalizarTexto(body.nivel);
  const funcion_origen = normalizarTexto(body.funcion_origen);
  const solo_errores = normalizarBoolean(body.solo_errores, false);
  const buscar = normalizarTexto(body.buscar);
  const fecha_desde = normalizarFecha(body.fecha_desde);
  const fecha_hasta = normalizarFecha(body.fecha_hasta);
  const shouldLog = normalizarBoolean(body.log, false);
  const limit = normalizarLimit(body.limit);
  const offset = normalizarOffset(body.offset);

  // 4) Validaciones
  if (fecha_desde && fecha_hasta) {
    if (new Date(fecha_hasta) <= new Date(fecha_desde)) {
      return jsonResponse({
        ok: false,
        motivo: "rango_fechas_invalido",
        mensaje: "fecha_hasta debe ser mayor que fecha_desde.",
      }, 400);
    }
  }

  // nivel y solo_errores son incompatibles si nivel ya es error/critical
  if (solo_errores && nivel && !["error", "critical"].includes(nivel)) {
    return jsonResponse({
      ok: false,
      motivo: "filtros_incompatibles",
      mensaje: "solo_errores=true es incompatible con nivel distinto de 'error' o 'critical'.",
    }, 400);
  }

  // 5) Query
  let query = supabase
    .from("tarot_logs")
    .select(
      `id, orden_id, cliente_id, evento, nivel, mensaje,
       payload, duracion_ms, funcion_origen, ip, created_at`,
      { count: "exact" },
    );

  if (orden_id) query = query.eq("orden_id", orden_id);
  if (cliente_id) query = query.eq("cliente_id", cliente_id);
  if (evento) query = query.eq("evento", evento);
  if (funcion_origen) query = query.eq("funcion_origen", funcion_origen);

  if (solo_errores) {
    // error o critical
    query = query.in("nivel", ["error", "critical"]);
  } else if (nivel) {
    query = query.eq("nivel", nivel);
  }

  if (fecha_desde) query = query.gte("created_at", fecha_desde);
  if (fecha_hasta) query = query.lt("created_at", fecha_hasta);

  query = query
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // 6) Ejecutar
  const { data, error, count } = await query;
  if (error) {
    return jsonResponse({ ok: false, motivo: "listar_logs_error", error: error.message }, 500);
  }

  const logsRaw = Array.isArray(data) ? data : [];

  // 7) Filtro en memoria por buscar
  const logs = filtrarPorTexto(
    logsRaw as Record<string, unknown>[],
    buscar,
  );

  // 8) Conteos en página
  const conteo_por_nivel = logs.reduce((acc: Record<string, number>, log) => {
    const k = String(log.nivel ?? "sin_nivel");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const conteo_por_funcion = logs.reduce((acc: Record<string, number>, log) => {
    const k = String(log.funcion_origen ?? "sin_funcion");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const conteo_por_evento = logs.reduce((acc: Record<string, number>, log) => {
    const k = String(log.evento ?? "sin_evento");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  // 9) Warnings
  const warnings: string[] = [];
  if ((count ?? 0) > limit) warnings.push("hay_mas_resultados_que_el_limit");
  if (buscar && logs.length < logsRaw.length) {
    warnings.push("buscar_filtrado_en_memoria_sobre_pagina_actual");
  }
  if (logs.some((l) => l.nivel === "error" || l.nivel === "critical")) {
    warnings.push("resultado_incluye_logs_de_error");
  }
  if (logs.some((l) => l.nivel === "critical")) {
    warnings.push("resultado_incluye_logs_criticos");
  }

  // 10) Resumen
  const resumen_texto = construirResumenTexto({
    total: count ?? logsRaw.length,
    limit,
    offset,
    orden_id,
    cliente_id,
    evento,
    nivel,
    funcion_origen,
    solo_errores,
    buscar,
    fecha_desde,
    fecha_hasta,
  });

  // 11) Respuesta
  const response = {
    ok: true,
    healthy: logs.every((l) => l.nivel !== "error" && l.nivel !== "critical"),
    funcion: FUNCION,
    timestamp_utc: tsNow,
    resumen_texto,
    filtros: {
      orden_id,
      cliente_id,
      evento,
      nivel,
      funcion_origen,
      solo_errores,
      buscar,
      fecha_desde,
      fecha_hasta,
      limit,
      offset,
    },
    paginacion: {
      total_sql: count ?? logsRaw.length,
      total_devuelto: logs.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null,
    },
    conteos_pagina: {
      por_nivel: conteo_por_nivel,
      por_funcion: conteo_por_funcion,
      por_evento: conteo_por_evento,
    },
    logs,
    warnings,
  };

  // El log de esta función se escribe en tarot_logs solo si se solicita explícitamente,
  // para no contaminar el audit trail con consultas administrativas.
  if (shouldLog) {
    try {
      await supabase.from("tarot_logs").insert([{
        evento: logs.length === 0 ? "listar_logs_sin_resultados" : "listar_logs_con_resultados",
        nivel: "info",
        funcion_origen: FUNCION,
        payload: { filtros: response.filtros, paginacion: response.paginacion, warnings },
        mensaje: "consulta administrativa de logs",
      }]);
    } catch (e) {
      console.error(`[${FUNCION}] Error registrando log`, e);
    }
  }

  return jsonResponse(response, 200);
});
