// ============================================================================
// 🔮 EDGE FUNCTION: ef_tarot_admin_listar_lecturas
// ============================================================================
//
// MÓDULO:
//   Tarot THC — Administración
//
// NOMBRE TÉCNICO:
//   ef_tarot_admin_listar_lecturas
//
// OBJETIVO:
//   Listar lecturas IA de Tarot con datos de tokens, costo y estado.
//
// QUÉ PERMITE VER:
//   - todas las lecturas
//   - por orden_id
//   - por estado (pendiente, generando, completada, error)
//   - por modelo IA usado
//   - solo lecturas vigentes (es_vigente = true)
//   - solo errores
//   - por rango de fechas
//
// QUÉ NO HACE:
//   - NO regenera lecturas.
//   - NO modifica datos de IA.
//   - NO llama a OpenAI ni a Anthropic.
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
//     "estado": "completada",
//     "ia_modelo": "claude-sonnet-4-6",
//     "solo_vigentes": true,
//     "solo_errores": false,
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
const FUNCION = "ef_tarot_admin_listar_lecturas";
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
  nivel = "info",
) {
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
// 🧠 DIAGNÓSTICO POR LECTURA
// ============================================================================
function diagnosticarLectura(l: Record<string, unknown>): Record<string, unknown> {
  const warnings: string[] = [];
  const estado = String(l.estado ?? "");

  if (estado === "error") warnings.push("lectura_con_error");
  if (l.numero_intento && Number(l.numero_intento) > 1) {
    warnings.push(`reintento_numero_${l.numero_intento}`);
  }
  if (l.es_vigente === false) warnings.push("lectura_no_vigente");

  // Costo alto (más de USD 0.10 por lectura)
  if (l.ia_costo_usd && Number(l.ia_costo_usd) > 0.10) {
    warnings.push("costo_ia_elevado");
  }

  const healthy = warnings.length === 0 || (warnings.length === 1 && warnings[0] === "lectura_no_vigente");
  const estado_resumen = estado === "error" ? "con_error" : estado === "completada" ? "ok" : estado;

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
    `🔮 Lecturas de Tarot`,
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
  const orden_id = normalizarUUID(body.orden_id);
  const estado = normalizarTexto(body.estado);
  const ia_modelo = normalizarTexto(body.ia_modelo);
  const solo_vigentes = normalizarBoolean(body.solo_vigentes, false);
  const solo_errores = normalizarBoolean(body.solo_errores, false);
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
  // Excluimos prompt_sistema y prompt_usuario del listado (pueden ser muy grandes).
  // El detalle completo se obtiene consultando por orden_id.
  let query = supabase
    .from("tarot_lecturas")
    .select(
      `id, orden_id, estado, numero_intento, es_vigente,
       ia_modelo, ia_tokens_entrada, ia_tokens_salida, ia_costo_usd,
       resumen_lectura, mensaje_final,
       error_codigo, error_mensaje,
       generado_at, created_at, updated_at`,
      { count: "exact" },
    );

  if (orden_id) query = query.eq("orden_id", orden_id);
  if (estado) query = query.eq("estado", estado);
  if (ia_modelo) query = query.eq("ia_modelo", ia_modelo);
  if (solo_vigentes) query = query.eq("es_vigente", true);
  if (solo_errores) query = query.eq("estado", "error");
  if (fecha_desde) query = query.gte("created_at", fecha_desde);
  if (fecha_hasta) query = query.lt("created_at", fecha_hasta);

  query = query
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // 6) Ejecutar
  const { data, error, count } = await query;
  if (error) {
    await registrarLog("listar_lecturas_error", { error: error.message }, "error");
    return jsonResponse({ ok: false, motivo: "listar_lecturas_error", error: error.message }, 500);
  }

  const lecturasRaw = Array.isArray(data) ? data : [];

  // 7) Enriquecer
  const lecturas = lecturasRaw.map((l) => ({
    ...l,
    diagnostico_admin: diagnosticarLectura(l as Record<string, unknown>),
  }));

  // 8) Métricas de costo en página
  const total_tokens_entrada = lecturas.reduce(
    (acc, l) => acc + (Number(l.ia_tokens_entrada) || 0),
    0,
  );
  const total_tokens_salida = lecturas.reduce(
    (acc, l) => acc + (Number(l.ia_tokens_salida) || 0),
    0,
  );
  const total_costo_usd = lecturas.reduce(
    (acc, l) => acc + (Number(l.ia_costo_usd) || 0),
    0,
  );

  const conteo_por_estado = lecturas.reduce((acc: Record<string, number>, l) => {
    const k = String(l.estado ?? "sin_estado");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  // 9) Warnings
  const warnings: string[] = [];
  if ((count ?? 0) > limit) warnings.push("hay_mas_resultados_que_el_limit");
  if (lecturas.some((l) => l.estado === "error")) warnings.push("hay_lecturas_con_error");
  if (solo_errores && estado) warnings.push("filtros_redundantes_estado_y_solo_errores");

  // 10) Resumen
  const filtros = { orden_id, estado, ia_modelo, solo_vigentes, solo_errores, fecha_desde, fecha_hasta };
  const resumen_texto = construirResumenTexto({ total: count ?? lecturas.length, limit, offset, filtros });

  // 11) Respuesta
  const response = {
    ok: true,
    healthy: lecturas.every(
      (l) => (l.diagnostico_admin as Record<string, unknown>)?.healthy === true,
    ),
    funcion: FUNCION,
    timestamp_utc: tsNow,
    resumen_texto,
    filtros: { ...filtros, limit, offset },
    paginacion: {
      total: count ?? lecturas.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null,
    },
    metricas_pagina: {
      total_tokens_entrada,
      total_tokens_salida,
      total_costo_usd: parseFloat(total_costo_usd.toFixed(6)),
      conteo_por_estado,
    },
    lecturas,
    warnings,
  };

  if (shouldLog) {
    await registrarLog(
      lecturas.length === 0 ? "listar_lecturas_sin_resultados" : "listar_lecturas_con_resultados",
      { filtros: response.filtros, paginacion: response.paginacion, warnings },
    );
  }

  return jsonResponse(response, 200);
});
