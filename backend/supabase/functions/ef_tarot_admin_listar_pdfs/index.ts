// ============================================================================
// 📄 EDGE FUNCTION: ef_tarot_admin_listar_pdfs
// ============================================================================
//
// MÓDULO:
//   Tarot THC — Administración
//
// NOMBRE TÉCNICO:
//   ef_tarot_admin_listar_pdfs
//
// OBJETIVO:
//   Listar PDFs generados del módulo Tarot con su estado, plantilla y URL.
//
// QUÉ PERMITE VER:
//   - todos los PDFs
//   - por orden_id
//   - por estado (pendiente, generando, generado, error_generacion, invalidado)
//   - por plantilla usada
//   - por rango de fechas
//   - si la URL firmada está por vencer
//
// QUÉ NO HACE:
//   - NO regenera PDFs.
//   - NO borra archivos de Storage.
//   - NO modifica estados.
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
//     "estado": "generado",
//     "plantilla_usada": "mistico-v2",
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
const FUNCION = "ef_tarot_admin_listar_pdfs";
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
// 🧠 DIAGNÓSTICO POR PDF
// ============================================================================
function diagnosticarPdf(p: Record<string, unknown>): Record<string, unknown> {
  const warnings: string[] = [];
  const estado = String(p.estado ?? "");

  if (estado === "error_generacion") warnings.push("pdf_con_error");
  if (estado === "invalidado") warnings.push("pdf_invalidado");
  if (p.numero_intento && Number(p.numero_intento) > 1) {
    warnings.push(`reintento_numero_${p.numero_intento}`);
  }

  // URL firmada por vencer en menos de 2 horas
  if (p.url_expira_at) {
    const horasRestantes =
      (new Date(String(p.url_expira_at)).getTime() - Date.now()) / 3_600_000;
    if (horasRestantes < 2 && horasRestantes > 0) warnings.push("url_proxima_a_vencer");
    if (horasRestantes <= 0) warnings.push("url_expirada");
  }

  // PDF generado sin storage_url
  if (estado === "generado" && !p.storage_url) warnings.push("generado_sin_url");

  const healthy = warnings.length === 0;
  const estado_resumen = estado === "error_generacion" ? "con_error" : estado === "generado" ? "ok" : estado;

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
    `📄 PDFs de Tarot`,
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
  const plantilla_usada = normalizarTexto(body.plantilla_usada);
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
  let query = supabase
    .from("tarot_pdfs")
    .select(
      `id, orden_id, lectura_id, estado, numero_intento,
       storage_bucket, storage_path, storage_url,
       tamano_bytes, paginas, plantilla_usada, hash_archivo,
       error_codigo, error_mensaje,
       generado_at, url_expira_at, created_at, updated_at`,
      { count: "exact" },
    );

  if (orden_id) query = query.eq("orden_id", orden_id);
  if (estado) query = query.eq("estado", estado);
  if (plantilla_usada) query = query.eq("plantilla_usada", plantilla_usada);
  if (solo_errores) query = query.eq("estado", "error_generacion");
  if (fecha_desde) query = query.gte("created_at", fecha_desde);
  if (fecha_hasta) query = query.lt("created_at", fecha_hasta);

  query = query
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // 6) Ejecutar
  const { data, error, count } = await query;
  if (error) {
    await registrarLog("listar_pdfs_error", { error: error.message }, "error");
    return jsonResponse({ ok: false, motivo: "listar_pdfs_error", error: error.message }, 500);
  }

  const pdfsRaw = Array.isArray(data) ? data : [];

  // 7) Enriquecer
  const pdfs = pdfsRaw.map((p) => ({
    ...p,
    diagnostico_admin: diagnosticarPdf(p as Record<string, unknown>),
  }));

  // 8) Conteos en página
  const conteo_por_estado = pdfs.reduce((acc: Record<string, number>, p) => {
    const k = String(p.estado ?? "sin_estado");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const total_bytes = pdfs.reduce((acc, p) => acc + (Number(p.tamano_bytes) || 0), 0);

  // 9) Warnings
  const warnings: string[] = [];
  if ((count ?? 0) > limit) warnings.push("hay_mas_resultados_que_el_limit");
  if (pdfs.some((p) => p.estado === "error_generacion")) warnings.push("hay_pdfs_con_error");
  if (pdfs.some((p) => {
    const d = p.diagnostico_admin as Record<string, unknown>;
    return (d?.warnings as string[])?.includes("url_expirada");
  })) {
    warnings.push("hay_urls_expiradas");
  }

  // 10) Resumen
  const filtros = { orden_id, estado, plantilla_usada, solo_errores, fecha_desde, fecha_hasta };
  const resumen_texto = construirResumenTexto({ total: count ?? pdfs.length, limit, offset, filtros });

  // 11) Respuesta
  const response = {
    ok: true,
    healthy: pdfs.every(
      (p) => (p.diagnostico_admin as Record<string, unknown>)?.healthy === true,
    ),
    funcion: FUNCION,
    timestamp_utc: tsNow,
    resumen_texto,
    filtros: { ...filtros, limit, offset },
    paginacion: {
      total: count ?? pdfs.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null,
    },
    metricas_pagina: {
      total_bytes,
      total_kb: parseFloat((total_bytes / 1024).toFixed(2)),
      conteo_por_estado,
    },
    pdfs,
    warnings,
  };

  if (shouldLog) {
    await registrarLog(
      pdfs.length === 0 ? "listar_pdfs_sin_resultados" : "listar_pdfs_con_resultados",
      { filtros: response.filtros, paginacion: response.paginacion, warnings },
    );
  }

  return jsonResponse(response, 200);
});
