// ============================================================================
// ef_tarot_aplicar_codigo
// Confirma el uso de un código reservado al verificarse el pago.
// Llamar desde el webhook de MP cuando mp_status = 'approved'.
//
// INPUT (POST):
//   uso_id               uuid    requerido (o bien orden_id)
//   orden_id             uuid    opcional  (alternativa a uso_id para lookup)
//   mp_payment_id        string  opcional
//   mp_external_reference string opcional
//   precio_aplicado      number  opcional  (override del precio final real cobrado)
//
// OUTPUT:
//   { ok, uso_id, codigo_id, estado_anterior, precio_aplicado, descuento_aplicado }
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY       = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FUNCION                  = "ef_tarot_aplicar_codigo";

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
function normNumero(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return isFinite(n) && n >= 0 ? n : null;
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

  const body      = await leerBody(req);
  const dbg       = await getDebugMode();

  const usoId             = normUUID(body.uso_id);
  const ordenId           = normUUID(body.orden_id);
  const mpPaymentId       = normTexto(body.mp_payment_id);
  const mpExtRef          = normTexto(body.mp_external_reference);
  const precioAplic       = normNumero(body.precio_aplicado);

  await log("inicio", { uso_id: usoId, orden_id: ordenId, mp_payment_id: mpPaymentId }, "debug", dbg, ordenId);

  if (!usoId && !ordenId)
    return jsonResponse({ ok: false, motivo: "uso_id_o_orden_id_requerido" }, 400);

  // 2. Buscar el uso (por uso_id o por orden_id)
  let query = supabase
    .from("tarot_codigos_descuento_usos")
    .select("id, codigo_id, codigo, orden_id, cliente_id, estado_uso, precio_original, precio_aplicado, descuento_aplicado, moneda");

  if (usoId)        query = query.eq("id", usoId);
  else if (ordenId) query = query.eq("orden_id", ordenId);

  const { data: uso, error: errUso } = await query.single();

  if (errUso || !uso) {
    await log("uso_no_encontrado", { uso_id: usoId, orden_id: ordenId }, "warning", true);
    return jsonResponse({ ok: false, motivo: "uso_no_encontrado" }, 404);
  }

  await log("uso_encontrado", { uso_id: uso.id, estado: uso.estado_uso }, "debug", dbg, uso.orden_id, uso.cliente_id);

  // 3. Validar estado
  if (uso.estado_uso === "aplicado") {
    // Ya aplicado → idempotente
    await log("ya_aplicado", { uso_id: uso.id }, "debug", dbg, uso.orden_id, uso.cliente_id);
    return jsonResponse({
      ok: true, uso_id: uso.id, codigo_id: uso.codigo_id,
      estado_anterior: "aplicado", ya_estaba_aplicado: true,
      precio_aplicado: uso.precio_aplicado, descuento_aplicado: uso.descuento_aplicado,
    });
  }

  if (!["reservado"].includes(uso.estado_uso)) {
    await log("estado_invalido_para_aplicar", { uso_id: uso.id, estado: uso.estado_uso }, "warning", true, uso.orden_id, uso.cliente_id);
    return jsonResponse({ ok: false, motivo: "estado_invalido", estado_actual: uso.estado_uso }, 409);
  }

  // 4. Actualizar uso → aplicado
  const updateData: Record<string, unknown> = {
    estado_uso:       "aplicado",
    fecha_aplicacion: nowISO(),
    actualizado_por:  FUNCION,
  };
  if (mpPaymentId) updateData.mp_payment_id       = mpPaymentId;
  if (mpExtRef)    updateData.mp_external_reference = mpExtRef;
  if (ordenId && !uso.orden_id) updateData.orden_id = ordenId;
  if (precioAplic !== null) {
    // Si el precio final cobrado difiere del calculado (descuentos extra, redondeos), actualizamos
    updateData.precio_aplicado    = precioAplic;
    updateData.descuento_aplicado = Math.max(0, (uso.precio_original ?? precioAplic) - precioAplic);
  }

  const { error: errUpdate } = await supabase
    .from("tarot_codigos_descuento_usos")
    .update(updateData)
    .eq("id", uso.id);

  if (errUpdate) {
    await log("error_actualizando_uso", { uso_id: uso.id, error: errUpdate.message }, "error", true, uso.orden_id, uso.cliente_id);
    return jsonResponse({ ok: false, motivo: "error_actualizando_uso", detalle: errUpdate.message }, 500);
  }

  await log("codigo_aplicado_ok", {
    uso_id: uso.id, codigo_id: uso.codigo_id, codigo: uso.codigo,
    mp_payment_id: mpPaymentId, precio_aplicado: updateData.precio_aplicado ?? uso.precio_aplicado,
  }, "info", true, uso.orden_id ?? ordenId, uso.cliente_id);

  return jsonResponse({
    ok:                 true,
    uso_id:             uso.id,
    codigo_id:          uso.codigo_id,
    codigo:             uso.codigo,
    estado_anterior:    "reservado",
    precio_aplicado:    updateData.precio_aplicado ?? uso.precio_aplicado,
    descuento_aplicado: updateData.descuento_aplicado ?? uso.descuento_aplicado,
    moneda:             uso.moneda,
  });
});
