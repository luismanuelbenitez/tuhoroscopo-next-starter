// ============================================================================
// 👤 EDGE FUNCTION: ef_tarot_admin_listar_clientes
// ============================================================================
//
// MÓDULO:
//   Tarot THC — Administración
//
// NOMBRE TÉCNICO:
//   ef_tarot_admin_listar_clientes
//
// OBJETIVO:
//   Listar clientes de Tarot con búsqueda por nombre, teléfono o email.
//
// QUÉ PERMITE VER:
//   - todos los clientes registrados
//   - búsqueda por nombre_completo, teléfono o email
//   - filtro por rango de fechas de registro
//
// QUÉ NO HACE:
//   - NO modifica clientes.
//   - NO borra clientes.
//   - NO toca órdenes, pagos ni lecturas.
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
//     "buscar": "Manuel",
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
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
const FUNCION = "ef_tarot_admin_listar_clientes";
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
// 🧾 RESUMEN TEXTUAL
// ============================================================================
function construirResumenTexto(params: {
  total: number;
  limit: number;
  offset: number;
  buscar: string | null;
  fecha_desde: string | null;
  fecha_hasta: string | null;
}): string {
  const { total, limit, offset, buscar, fecha_desde, fecha_hasta } = params;
  const filtros: string[] = [];
  if (buscar) filtros.push(`buscar: ${buscar}`);
  if (fecha_desde) filtros.push(`desde: ${fecha_desde}`);
  if (fecha_hasta) filtros.push(`hasta: ${fecha_hasta}`);
  return [
    `👤 Clientes de Tarot`,
    ``,
    `Total encontrado: ${total}`,
    `Mostrando: ${limit}`,
    `Offset: ${offset}`,
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
  if (internalKey !== WHATSAPP_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }

  // 2) Método
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, motivo: "metodo_no_permitido", mensaje: "Usar POST." }, 405);
  }

  // 3) Parámetros
  const body = await readBodySafe(req);
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
    .from("tarot_clientes")
    .select(
      `id, nombre_completo, telefono, email, fecha_nacimiento,
       acepto_terminos, acepto_terminos_at, acepto_privacidad, acepto_privacidad_at,
       version_terminos, deleted_at, created_at, updated_at`,
      { count: "exact" },
    );

  if (fecha_desde) query = query.gte("created_at", fecha_desde);
  if (fecha_hasta) query = query.lt("created_at", fecha_hasta);

  // Excluir eliminados lógicamente
  query = query.is("deleted_at", null);

  if (buscar) {
    const term = `%${buscar}%`;
    query = query.or(
      [
        `nombre_completo.ilike.${term}`,
        `telefono.ilike.${term}`,
        `email.ilike.${term}`,
      ].join(","),
    );
  }

  query = query
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // 6) Ejecutar
  const { data, error, count } = await query;
  if (error) {
    await registrarLog("listar_clientes_error", { error: error.message }, "error");
    return jsonResponse({ ok: false, motivo: "listar_clientes_error", error: error.message }, 500);
  }

  const clientes = Array.isArray(data) ? data : [];

  // 7) Warnings
  const warnings: string[] = [];
  if ((count ?? 0) > limit) warnings.push("hay_mas_resultados_que_el_limit");

  // 8) Resumen
  const resumen_texto = construirResumenTexto({
    total: count ?? clientes.length,
    limit,
    offset,
    buscar,
    fecha_desde,
    fecha_hasta,
  });

  // 9) Respuesta
  const response = {
    ok: true,
    funcion: FUNCION,
    timestamp_utc: tsNow,
    resumen_texto,
    filtros: { buscar, fecha_desde, fecha_hasta, limit, offset },
    paginacion: {
      total: count ?? clientes.length,
      limit,
      offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null,
    },
    clientes,
    warnings,
  };

  if (shouldLog) {
    await registrarLog(
      clientes.length === 0 ? "listar_clientes_sin_resultados" : "listar_clientes_con_resultados",
      { filtros: response.filtros, paginacion: response.paginacion, warnings },
    );
  }

  return jsonResponse(response, 200);
});
