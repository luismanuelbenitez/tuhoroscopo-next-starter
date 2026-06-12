// ============================================================================
// ef_tarot_admin_listar_codigos
// Lista códigos de descuento con estadísticas de uso para el panel admin.
//
// INPUT (POST):
//   search          string  opcional  busca en codigo y descripcion
//   tipo_descuento  string  opcional  porcentaje | monto_fijo | precio_fijo
//   activo          bool    opcional
//   page            number  default 1
//   per_page        number  default 20, máx 100
//   orden           string  created_at_desc (def) | codigo_asc | usos_desc
//
// OUTPUT:
//   { ok, data, total, page, per_page, total_pages, resumen }
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY       = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FUNCION                  = "ef_tarot_admin_listar_codigos";

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

const ORDEN_MAP: Record<string, { column: string; ascending: boolean }> = {
  created_at_desc: { column: "created_at",    ascending: false },
  codigo_asc:      { column: "codigo",         ascending: true  },
  usos_desc:       { column: "usos_actuales",  ascending: false },
};

serve(async (req) => {
  if (req.headers.get("x-internal-key") !== TAROT_INTERNAL_KEY)
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  if (req.method !== "POST")
    return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  const body    = await leerBody(req);
  const dbg     = await getDebugMode();

  const search        = normTexto(body.search);
  const tipo          = normTexto(body.tipo_descuento);
  const page          = normInt(body.page, 1);
  const perPage       = Math.min(normInt(body.per_page, 20), 100);
  const offset        = (page - 1) * perPage;
  const activoFiltro  = body.activo === true ? true : body.activo === false ? false : null;
  const ordenKey      = normTexto(body.orden) ?? "created_at_desc";
  const orden         = ORDEN_MAP[ordenKey] ?? ORDEN_MAP["created_at_desc"];

  await log("inicio", { search, tipo, page, perPage, activo: activoFiltro, orden: ordenKey }, "debug", dbg);

  // Página de resultados con filtros
  let q = supabase
    .from("tarot_codigos_descuento")
    .select("*", { count: "exact" });

  if (activoFiltro !== null) q = q.eq("activo", activoFiltro);
  if (tipo)   q = q.eq("tipo_descuento", tipo);
  if (search) q = q.or(`codigo.ilike.%${search}%,descripcion.ilike.%${search}%`);

  q = q.order(orden.column, { ascending: orden.ascending })
       .range(offset, offset + perPage - 1);

  const { data, error, count } = await q;

  if (error) {
    await log("error_listando", { error: error.message }, "error", true);
    return jsonResponse({ ok: false, motivo: "error_db", detalle: error.message }, 500);
  }

  // Resumen global (sin filtros)
  const { data: todos } = await supabase
    .from("tarot_codigos_descuento")
    .select("activo, usos_actuales, max_usos_total, fecha_fin");

  const ahora = Date.now();
  const resumen = {
    total:          todos?.length ?? 0,
    activos:        todos?.filter(r => r.activo && (!r.fecha_fin || new Date(r.fecha_fin).getTime() > ahora)).length ?? 0,
    inactivos:      todos?.filter(r => !r.activo).length ?? 0,
    vencidos:       todos?.filter(r => r.fecha_fin && new Date(r.fecha_fin).getTime() < ahora).length ?? 0,
    cupos_agotados: todos?.filter(r => r.max_usos_total !== null && r.usos_actuales >= r.max_usos_total).length ?? 0,
    usos_totales:   todos?.reduce((s: number, r) => s + (r.usos_actuales ?? 0), 0) ?? 0,
  };

  await log("ok", { total: count, page, perPage }, "debug", dbg);

  return jsonResponse({
    ok:          true,
    data:        data ?? [],
    total:       count ?? 0,
    page,
    per_page:    perPage,
    total_pages: Math.ceil((count ?? 0) / perPage),
    resumen,
  });
});
