// ============================================================================
// ❌ EDGE FUNCTION: ef_tarot_rechazar_reenvio
// ============================================================================
//
// MÓDULO:
//   Tarot TTC — Gobernanza de entregas
//
// OBJETIVO:
//   Acción administrativa complementaria a ef_tarot_autorizar_reenvio.
//   Cierra una solicitud 'pendiente_autorizacion' como 'rechazada', sin
//   despachar ningún envío. Completa el ciclo de vida:
//
//   pendiente_autorizacion
//     ├── autorizada → ejecutada   (ef_tarot_autorizar_reenvio)
//     └── rechazada                (esta EF)
//
// QUÉ NO HACE:
//   - NO envía nada, NO llama a ninguna EF de canal.
//   - NO borra la solicitud ni ningún dato histórico.
//   - NO afecta verificarPermisoEnvio(): una solicitud 'rechazada' nunca
//     matchea su condición `estado='autorizada'`, así que estructuralmente
//     jamás puede habilitar un reenvío — sin necesidad de tocar ese archivo.
//
// FLUJO:
//   Transición atómica pendiente_autorizacion → rechazada
//   (0 filas afectadas = ya fue autorizada/ejecutada/rechazada por otra
//   request, o no existe → 409). Mismo patrón que ef_tarot_autorizar_reenvio.
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//   - `rechazado_por` viene del caller (Next.js BFF, ya autenticado).
//
// INPUT (POST body):
//   {
//     "solicitud_id": "uuid",
//     "rechazado_por": "admin@dominio.com",
//     "motivo_rechazo": "solicitud_duplicada" | "no_corresponde" |
//                        "prueba_administrativa" | "otro",
//     "motivo_rechazo_detalle": "texto libre, opcional"
//   }
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FN = "ef_tarot_rechazar_reenvio";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MOTIVOS_RECHAZO_VALIDOS = new Set([
  "solicitud_duplicada", "no_corresponde", "prueba_administrativa", "otro",
]);

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

  const solicitudId          = normalizarUUID(body.solicitud_id);
  const rechazadoPor         = typeof body.rechazado_por === "string" ? body.rechazado_por.trim().substring(0, 150) : "";
  const motivoRechazo        = typeof body.motivo_rechazo === "string" ? body.motivo_rechazo.trim() : "";
  const motivoRechazoDetalle = typeof body.motivo_rechazo_detalle === "string" ? body.motivo_rechazo_detalle.trim().substring(0, 500) : null;

  if (!solicitudId) return jsonResponse({ ok: false, motivo: "solicitud_id_invalido" }, 400);
  if (!rechazadoPor) return jsonResponse({ ok: false, motivo: "rechazado_por_requerido" }, 400);
  if (!MOTIVOS_RECHAZO_VALIDOS.has(motivoRechazo)) {
    return jsonResponse({ ok: false, motivo: "motivo_rechazo_invalido", motivos_validos: [...MOTIVOS_RECHAZO_VALIDOS] }, 400);
  }
  if (motivoRechazo === "otro" && !motivoRechazoDetalle) {
    return jsonResponse({ ok: false, motivo: "motivo_rechazo_detalle_requerido", detalle: 'motivo_rechazo_detalle es obligatorio cuando motivo_rechazo="otro"' }, 400);
  }

  // Transición atómica: solo avanza si sigue pendiente_autorizacion.
  // Si ya fue autorizada, ejecutada o rechazada por otra request, 0 filas.
  const ahora = new Date().toISOString();
  const { data: solicitud, error: errUpdate } = await supabase
    .from("tarot_solicitudes_reenvio")
    .update({
      estado: "rechazada",
      rechazado_por: rechazadoPor,
      rechazado_at: ahora,
      motivo_rechazo: motivoRechazo,
      motivo_rechazo_detalle: motivoRechazoDetalle,
      updated_at: ahora,
    })
    .eq("id", solicitudId)
    .eq("estado", "pendiente_autorizacion")
    .select("*")
    .maybeSingle();

  if (errUpdate) {
    return jsonResponse({ ok: false, motivo: "error_al_rechazar", detalle: errUpdate.message }, 500);
  }
  if (!solicitud) {
    // 0 filas: ya fue autorizada, ejecutada, rechazada, o no existe.
    return jsonResponse({ ok: false, motivo: "solicitud_no_pendiente_o_inexistente" }, 409);
  }

  await registrarLog(solicitud.orden_id, "solicitud_reenvio_rechazada", "info",
    `${rechazadoPor} rechazó el reenvío por ${solicitud.canal} — motivo: ${motivoRechazo}`,
    { solicitud_id: solicitud.id, canal: solicitud.canal, motivo_rechazo: motivoRechazo, motivo_rechazo_detalle: motivoRechazoDetalle });

  return jsonResponse({ ok: true, solicitud });
});
