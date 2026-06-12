// ============================================================================
// ef_tarot_admin_listar_usos_codigo
// Lista registros de uso de códigos de descuento para el panel admin.
//
// INPUT (POST):
//   codigo_id   uuid    opcional
//   codigo      string  opcional  (búsqueda exacta case-insensitive)
//   estado_uso  string  opcional  reservado | aplicado | cancelado | expirado
//   orden_id    uuid    opcional
//   cliente_id  uuid    opcional
//   fecha_desde string  opcional  ISO date  (filtro sobre created_at)
//   fecha_hasta string  opcional  ISO date
//   page        number  default 1
//   per_page    number  default 20, máx 100
//
// OUTPUT:
//   { ok, data, total, page, per_page, total_pages, resumen_estado }
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY       = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FUNCION                  = "ef_tarot_admin_listar_usos_codigo";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function normTexto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim(); return s || null;
}
function normUUID(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : null;
}
function normInt(v: unknown, def: number): number {
  const n = typeof v === "number" ? Math.round(v) : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}
async function leerBody(req: Request): Promise<Record<string, unknown>> {
  try { const b = await req.json(); return (b && typeof b === "object") ? b : {}; }
  catch { return {}; }
}

async function getDebugMode(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("tarot_configuracion").select("valor").eq("clave", "debug_mode").single();
    return data?.valor === "true";
  } catch { return false; }
}

async function log(
  evento: string,
  payload: Record<string, unknown>,
  nivel: "debug" | "info" | "warning" | "error",
  dbg: boolean,
) {
  if (nivel === "debug" && !dbg) return;
  try {
    await supabase.from("tarot_logs").insert([{
      evento, nivel, funcion_origen: FUNCION,
      payload, mensaje: evento,
      orden_id: null, cliente_id: null,
    }]);
  } catch (e) { console.error(`[${FUNCION}] log error`, e); }
}

serve(async (req) => {
  if (req.headers.get("x-internal-key") !== TAROT_INTERNAL_KEY)
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  if (req.method !== "POST")
    return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  const body    = await leerBody(req);
  const dbg     = await getDebugMode();

  const codigoId  = normUUID(body.codigo_id);
  const codigo    = normTexto(body.codigo);
  const estadoUso = normTexto(body.estado_uso);
  const ordenId   = normUUID(body.orden_id);
  const clienteId = normUUID(body.cliente_id);
  const fechaDesde = normTexto(body.fecha_desde);
  const fechaHasta = normTexto(body.fecha_hasta);
  const page      = normInt(body.page, 1);
  const perPage   = Math.min(normInt(body.per_page, 20), 100);
  const offset    = (page - 1) * perPage;

  await log("inicio", { codigoId, codigo, estadoUso, ordenId, clienteId, page, perPage }, "debug", dbg);

  let q = supabase
    .from("tarot_codigos_descuento_usos")
    .select("*", { count: "exact" });

  if (codigoId)  q = q.eq("codigo_id", codigoId);
  if (codigo)    q = q.ilike("codigo", codigo);
  if (estadoUso) q = q.eq("estado_uso", estadoUso);
  if (ordenId)   q = q.eq("orden_id", ordenId);
  if (clienteId) q = q.eq("cliente_id", clienteId);
  if (fechaDesde) q = q.gte("created_at", fechaDesde);
  if (fechaHasta) q = q.lte("created_at", `${fechaHasta}T23:59:59Z`);

  q = q.order("created_at", { ascending: false })
       .range(offset, offset + perPage - 1);

  const { data, error, count } = await q;

  if (error) {
    await log("error_listando", { error: error.message }, "error", true);
    return jsonResponse({ ok: false, motivo: "error_db", detalle: error.message }, 500);
  }

  // Conteos por estado (sobre los mismos filtros pero sin paginación)
  let qCount = supabase
    .from("tarot_codigos_descuento_usos")
    .select("estado_uso");
  if (codigoId)  qCount = qCount.eq("codigo_id", codigoId);
  if (codigo)    qCount = qCount.ilike("codigo", codigo);
  if (clienteId) qCount = qCount.eq("cliente_id", clienteId);
  if (fechaDesde) qCount = qCount.gte("created_at", fechaDesde);
  if (fechaHasta) qCount = qCount.lte("created_at", `${fechaHasta}T23:59:59Z`);
  const { data: estadoRows } = await qCount;

  const resumen_estado = {
    reservado: estadoRows?.filter(r => r.estado_uso === "reservado").length ?? 0,
    aplicado:  estadoRows?.filter(r => r.estado_uso === "aplicado").length  ?? 0,
    cancelado: estadoRows?.filter(r => r.estado_uso === "cancelado").length ?? 0,
    expirado:  estadoRows?.filter(r => r.estado_uso === "expirado").length  ?? 0,
  };

  await log("ok", { total: count, page, perPage }, "debug", dbg);

  return jsonResponse({
    ok:             true,
    data:           data ?? [],
    total:          count ?? 0,
    page,
    per_page:       perPage,
    total_pages:    Math.ceil((count ?? 0) / perPage),
    resumen_estado,
  });
});
