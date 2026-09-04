// ============================================================================
// 🧾 EDGE FUNCTION: ef_tarot_admin_detalle_facturacion
// Detalle de un registro de facturación + datos de la orden asociada
// (external_reference, estado) para el acceso rápido del admin.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, motivo: "json_invalido" }, 400); }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return jsonResponse({ ok: false, motivo: "id_requerido" }, 400);

  const { data: registro, error } = await supabase
    .from("tarot_registros_facturacion")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return jsonResponse({ ok: false, motivo: "detalle_error", error: error.message }, 500);
  if (!registro) return jsonResponse({ ok: false, motivo: "no_encontrado" }, 404);

  const { data: orden } = await supabase
    .from("tarot_ordenes")
    .select("external_reference, estado, created_at")
    .eq("id", registro.orden_id)
    .maybeSingle();

  return jsonResponse({
    ok: true,
    registro,
    orden: orden ? { external_reference: orden.external_reference, estado: orden.estado, created_at: orden.created_at } : null,
  });
});
