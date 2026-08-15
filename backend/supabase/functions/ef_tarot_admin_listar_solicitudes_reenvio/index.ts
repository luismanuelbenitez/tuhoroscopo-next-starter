// ============================================================================
// 🔐 EDGE FUNCTION: ef_tarot_admin_listar_solicitudes_reenvio
// ============================================================================
//
// MÓDULO:
//   Tarot TTC — Administración / Gobernanza de entregas
//
// OBJETIVO:
//   Listar solicitudes de reenvío (cola de autorización pendiente + historial),
//   con datos de orden/cliente vía JOIN. Alimenta la pestaña "Solicitudes"
//   de /admin/tarot/entregas.
//
// QUÉ NO HACE:
//   - NO crea ni autoriza solicitudes (ver ef_tarot_solicitar_reenvio /
//     ef_tarot_autorizar_reenvio).
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//
// INPUT (POST body, todos opcionales):
//   { "estado": "pendiente_autorizacion", "orden_id": "uuid", "limit": 50, "offset": 0 }
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "Content-Type": "application/json" } });
}
function normalizarTexto(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  return v ? v : null;
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
async function readBodySafe(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch { return {}; }
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== TAROT_INTERNAL_KEY) return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  const body = await readBodySafe(req);
  const estado = normalizarTexto(body.estado);
  const orden_id = normalizarUUID(body.orden_id);
  const limit = normalizarLimit(body.limit);
  const offset = normalizarOffset(body.offset);

  let query = supabase
    .from("tarot_solicitudes_reenvio")
    .select(`*, tarot_ordenes ( external_reference, tarot_clientes ( nombre_completo ) )`, { count: "exact" });

  if (estado) query = query.eq("estado", estado);
  if (orden_id) query = query.eq("orden_id", orden_id);

  query = query.order("solicitado_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return jsonResponse({ ok: false, motivo: "listar_solicitudes_error", error: error.message }, 500);

  return jsonResponse({
    ok: true,
    filtros: { estado, orden_id, limit, offset },
    paginacion: {
      total: count ?? (data?.length ?? 0),
      limit, offset,
      next_offset: (count ?? 0) > offset + limit ? offset + limit : null,
    },
    solicitudes: data ?? [],
  });
});
