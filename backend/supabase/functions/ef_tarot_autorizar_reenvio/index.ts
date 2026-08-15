// ============================================================================
// ✅ EDGE FUNCTION: ef_tarot_autorizar_reenvio
// ============================================================================
//
// MÓDULO:
//   Tarot TTC — Gobernanza de entregas
//
// OBJETIVO:
//   Segunda acción explícita del flujo de reenvío. Autoriza una solicitud
//   'pendiente_autorizacion' y despacha el envío real UNA sola vez.
//   El mismo administrador puede solicitar Y autorizar (V1) — lo que importa
//   es que sean dos acciones distintas y trazadas, no doble control de personas.
//
// FLUJO:
//   1. Transición atómica pendiente_autorizacion → autorizada
//      (0 filas afectadas = ya fue autorizada/rechazada por otra request → 409).
//   2. Dispatch fire-and-forget a ef_tarot_enviar_whatsapp / ef_tarot_enviar_email
//      con { orden_id, autorizacion_id }. La EF de canal es quien, vía
//      verificarPermisoEnvio() (_shared/tarot-entregas.ts), consume
//      atómicamente autorizada → ejecutada y recién ahí envía. Este paso
//      NUNCA usa `forzar` — forzar no tiene poder sobre una entrega exitosa.
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//   - `autorizado_por` viene del caller (Next.js BFF, ya autenticado).
//
// INPUT (POST body):
//   { "solicitud_id": "uuid", "autorizado_por": "admin@dominio.com" }
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FN = "ef_tarot_autorizar_reenvio";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const EF_POR_CANAL: Record<string, string> = {
  whatsapp: "ef_tarot_enviar_whatsapp",
  email:    "ef_tarot_enviar_email",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function normalizarUUID(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return v;
  return null;
}

async function registrarLog(
  ordenId: string | null, evento: string,
  nivel: "info" | "warning" | "error", mensaje: string, payload: unknown = {},
) {
  try {
    await supabase.from("tarot_logs").insert({
      orden_id: ordenId, evento, nivel, mensaje, payload: payload ?? {}, funcion_origen: FN,
    });
  } catch (e) { console.error("tarot_logs insert falló:", e); }
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return jsonResponse({ ok: false, motivo: "json_invalido" }, 400);
  }

  const solicitudId   = normalizarUUID(body.solicitud_id);
  const autorizadoPor = typeof body.autorizado_por === "string" ? body.autorizado_por.trim().substring(0, 150) : "";

  if (!solicitudId) return jsonResponse({ ok: false, motivo: "solicitud_id_invalido" }, 400);
  if (!autorizadoPor) return jsonResponse({ ok: false, motivo: "autorizado_por_requerido" }, 400);

  // 1. Transición atómica: solo avanza si sigue pendiente_autorizacion.
  const ahora = new Date().toISOString();
  const { data: solicitud, error: errUpdate } = await supabase
    .from("tarot_solicitudes_reenvio")
    .update({ estado: "autorizada", autorizado_por: autorizadoPor, autorizado_at: ahora, updated_at: ahora })
    .eq("id", solicitudId)
    .eq("estado", "pendiente_autorizacion")
    .select("*")
    .maybeSingle();

  if (errUpdate) {
    return jsonResponse({ ok: false, motivo: "error_al_autorizar", detalle: errUpdate.message }, 500);
  }
  if (!solicitud) {
    // 0 filas: ya fue autorizada, ejecutada, rechazada, o no existe.
    return jsonResponse({ ok: false, motivo: "solicitud_no_pendiente_o_inexistente" }, 409);
  }

  await registrarLog(solicitud.orden_id, "solicitud_reenvio_autorizada", "info",
    `${autorizadoPor} autorizó el reenvío por ${solicitud.canal}`,
    { solicitud_id: solicitud.id, canal: solicitud.canal, motivo: solicitud.motivo });

  // 2. Dispatch fire-and-forget del envío real. La EF de canal consume la
  //    autorización de un solo uso vía verificarPermisoEnvio(). Nunca `forzar`.
  const efNombre = EF_POR_CANAL[solicitud.canal];
  fetch(`${SUPABASE_URL}/functions/v1/${efNombre}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "x-internal-key": TAROT_INTERNAL_KEY,
    },
    body: JSON.stringify({ orden_id: solicitud.orden_id, autorizacion_id: solicitud.id }),
  }).catch(() => {});

  return jsonResponse({
    ok: true,
    solicitud,
    mensaje: "Reenvío autorizado. El envío se está procesando en segundo plano.",
  });
});
