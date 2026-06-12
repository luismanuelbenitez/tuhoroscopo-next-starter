// ============================================================================
// ef_tarot_liberar_codigo
// Cancela una reserva de código y devuelve el cupo al pool.
// Llamar cuando el pago falla, expira, es rechazado, o el usuario abandona.
//
// INPUT (POST):
//   uso_id    uuid    requerido (o bien orden_id)
//   orden_id  uuid    opcional  (alternativa a uso_id)
//   motivo    string  opcional  'pago_rechazado' | 'pago_expirado' | 'orden_cancelada' | etc.
//
// OUTPUT:
//   { ok, uso_id, codigo_id, cupo_devuelto }
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY       = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FUNCION                  = "ef_tarot_liberar_codigo";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}
function nowISO() { return new Date().toISOString(); }

function normUUID(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : null;
}
function normTexto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim(); return s || null;
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
  orden_id?: string | null,
  cliente_id?: string | null,
) {
  if (nivel === "debug" && !dbg) return;
  try {
    await supabase.from("tarot_logs").insert([{
      evento, nivel, funcion_origen: FUNCION,
      payload, mensaje: evento,
      orden_id: orden_id ?? null,
      cliente_id: cliente_id ?? null,
    }]);
  } catch (e) { console.error(`[${FUNCION}] log error`, e); }
}

serve(async (req) => {
  // 1. Seguridad
  if (req.headers.get("x-internal-key") !== TAROT_INTERNAL_KEY)
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  if (req.method !== "POST")
    return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  const body    = await leerBody(req);
  const dbg     = await getDebugMode();

  const usoId   = normUUID(body.uso_id);
  const ordenId = normUUID(body.orden_id);
  const motivo  = normTexto(body.motivo) ?? "sin_motivo";

  await log("inicio", { uso_id: usoId, orden_id: ordenId, motivo }, "debug", dbg, ordenId);

  if (!usoId && !ordenId)
    return jsonResponse({ ok: false, motivo: "uso_id_o_orden_id_requerido" }, 400);

  // 2. Buscar el uso
  let query = supabase
    .from("tarot_codigos_descuento_usos")
    .select("id, codigo_id, codigo, orden_id, cliente_id, estado_uso");

  if (usoId)        query = query.eq("id", usoId);
  else if (ordenId) query = query.eq("orden_id", ordenId);

  const { data: uso, error: errUso } = await query.single();

  if (errUso || !uso) {
    await log("uso_no_encontrado", { uso_id: usoId, orden_id: ordenId }, "warning", true);
    return jsonResponse({ ok: false, motivo: "uso_no_encontrado" }, 404);
  }

  await log("uso_encontrado", { uso_id: uso.id, estado: uso.estado_uso }, "debug", dbg, uso.orden_id, uso.cliente_id);

  // 3. Validar estado — solo se puede liberar si estaba reservado
  if (uso.estado_uso === "cancelado" || uso.estado_uso === "expirado") {
    // Ya liberado → idempotente
    await log("ya_liberado", { uso_id: uso.id, estado: uso.estado_uso }, "debug", dbg, uso.orden_id, uso.cliente_id);
    return jsonResponse({
      ok: true, uso_id: uso.id, codigo_id: uso.codigo_id,
      cupo_devuelto: false, ya_estaba_liberado: true, estado: uso.estado_uso,
    });
  }

  if (uso.estado_uso === "aplicado") {
    // Un pago ya confirmado no se puede liberar desde aquí — necesita proceso de reembolso
    await log("intento_liberar_uso_aplicado", { uso_id: uso.id }, "warning", true, uso.orden_id, uso.cliente_id);
    return jsonResponse({ ok: false, motivo: "uso_ya_aplicado_no_se_puede_liberar" }, 409);
  }

  if (uso.estado_uso !== "reservado") {
    await log("estado_invalido_para_liberar", { uso_id: uso.id, estado: uso.estado_uso }, "warning", true, uso.orden_id, uso.cliente_id);
    return jsonResponse({ ok: false, motivo: "estado_invalido", estado_actual: uso.estado_uso }, 409);
  }

  // 4. Marcar como cancelado
  const { error: errUpdate } = await supabase
    .from("tarot_codigos_descuento_usos")
    .update({
      estado_uso:         "cancelado",
      fecha_cancelacion:  nowISO(),
      ultimo_error:       motivo !== "sin_motivo" ? motivo : null,
      actualizado_por:    FUNCION,
      metadata:           { motivo_liberacion: motivo },
    })
    .eq("id", uso.id);

  if (errUpdate) {
    await log("error_cancelando_uso", { uso_id: uso.id, error: errUpdate.message }, "error", true, uso.orden_id, uso.cliente_id);
    return jsonResponse({ ok: false, motivo: "error_cancelando_uso", detalle: errUpdate.message }, 500);
  }

  // 5. Devolver cupo al pool (decremento atómico)
  await supabase.rpc("tarot_decrementar_usos_codigo", { p_codigo_id: uso.codigo_id });
  await log("cupo_devuelto", { codigo_id: uso.codigo_id }, "debug", dbg, uso.orden_id, uso.cliente_id);

  // 6. Log de éxito
  await log("codigo_liberado_ok", {
    uso_id: uso.id, codigo_id: uso.codigo_id, codigo: uso.codigo, motivo,
  }, "info", true, uso.orden_id ?? ordenId, uso.cliente_id);

  return jsonResponse({
    ok:            true,
    uso_id:        uso.id,
    codigo_id:     uso.codigo_id,
    codigo:        uso.codigo,
    cupo_devuelto: true,
    motivo,
  });
});
