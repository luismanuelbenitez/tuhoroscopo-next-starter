// ============================================================================
// 📨 EDGE FUNCTION: ef_tarot_solicitar_reenvio
// ============================================================================
//
// MÓDULO:
//   Tarot TTC — Gobernanza de entregas
//
// OBJETIVO:
//   Registrar una SOLICITUD de reenvío sobre una entrega ya exitosa.
//   Esto NO envía nada — solo crea el registro en estado
//   'pendiente_autorizacion'. El envío real solo ocurre después de que
//   un administrador la autoriza explícitamente (ef_tarot_autorizar_reenvio).
//
// QUÉ NO HACE:
//   - NO envía WhatsApp ni Email.
//   - NO autoriza nada por sí misma.
//   - NO permite solicitar reenvío si el canal nunca entregó exitosamente
//     (en ese caso corresponde un reintento normal, no un reenvío).
//
// IDEMPOTENCIA:
//   Solo puede existir una solicitud 'pendiente_autorizacion' por
//   orden+canal a la vez (índice único parcial). Si ya existe una,
//   se reutiliza en vez de crear un duplicado.
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//   - `solicitado_por` viene del caller (Next.js BFF, ya autenticado
//     vía requireAdminSession()) — esta EF confía en esa identidad,
//     igual que ef_tarot_confirmar_cobro_manual con `cobrado_por`.
//
// INPUT (POST body):
//   {
//     "orden_id": "uuid",
//     "canal": "whatsapp" | "email",
//     "motivo": "cliente_no_recibio" | "direccion_corregida" |
//               "solicitud_cliente" | "prueba_administrativa" | "otro",
//     "motivo_detalle": "texto libre, opcional (obligatorio si motivo=otro)",
//     "solicitado_por": "admin@dominio.com"
//   }
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { dispararAlerta } from "../_shared/tarot-alertas.ts";
import { verificarPermisoEnvio, type CanalEntrega } from "../_shared/tarot-entregas.ts";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FN = "ef_tarot_solicitar_reenvio";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MOTIVOS_VALIDOS = new Set([
  "cliente_no_recibio", "direccion_corregida", "solicitud_cliente", "prueba_administrativa", "otro",
]);
const CANALES_VALIDOS = new Set(["whatsapp", "email"]);

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

  const ordenId       = normalizarUUID(body.orden_id);
  const canal         = typeof body.canal === "string" ? body.canal.trim() : "";
  const motivo        = typeof body.motivo === "string" ? body.motivo.trim() : "";
  const motivoDetalle = typeof body.motivo_detalle === "string" ? body.motivo_detalle.trim().substring(0, 500) : null;
  const solicitadoPor = typeof body.solicitado_por === "string" ? body.solicitado_por.trim().substring(0, 150) : "";

  if (!ordenId) return jsonResponse({ ok: false, motivo: "orden_id_invalido" }, 400);
  if (!CANALES_VALIDOS.has(canal)) {
    return jsonResponse({ ok: false, motivo: "canal_invalido", canales_validos: [...CANALES_VALIDOS] }, 400);
  }
  if (!MOTIVOS_VALIDOS.has(motivo)) {
    return jsonResponse({ ok: false, motivo: "motivo_invalido", motivos_validos: [...MOTIVOS_VALIDOS] }, 400);
  }
  if (motivo === "otro" && !motivoDetalle) {
    return jsonResponse({ ok: false, motivo: "motivo_detalle_requerido", detalle: 'motivo_detalle es obligatorio cuando motivo="otro"' }, 400);
  }
  if (!solicitadoPor) {
    return jsonResponse({ ok: false, motivo: "solicitado_por_requerido" }, 400);
  }

  // 1. Orden debe existir
  const { data: orden } = await supabase
    .from("tarot_ordenes")
    .select("id, external_reference")
    .eq("id", ordenId)
    .maybeSingle();

  if (!orden?.id) return jsonResponse({ ok: false, motivo: "orden_no_encontrada" }, 404);

  // 2. Solo tiene sentido "solicitar reenvío" si hubo una entrega exitosa previa
  //    para ese canal. Si nunca se entregó, corresponde un reintento normal
  //    (botón "Reintentar WhatsApp"), no una solicitud administrativa.
  const permiso = await verificarPermisoEnvio(supabase, { ordenId, canal: canal as CanalEntrega });
  if (permiso.permitido) {
    return jsonResponse({
      ok: false, motivo: "sin_entrega_previa_exitosa",
      detalle: "Este canal nunca entregó exitosamente para esta orden — usá el reintento normal, no una solicitud de reenvío.",
    }, 409);
  }

  // 3. Idempotencia: reutilizar solicitud pendiente existente si la hay
  const { data: pendienteExistente } = await supabase
    .from("tarot_solicitudes_reenvio")
    .select("*")
    .eq("orden_id", ordenId)
    .eq("canal", canal)
    .eq("estado", "pendiente_autorizacion")
    .maybeSingle();

  if (pendienteExistente) {
    return jsonResponse({
      ok: true, ya_existia: true, solicitud: pendienteExistente,
      mensaje: "Ya existe una solicitud de reenvío pendiente de autorización para esta orden y canal.",
    });
  }

  // 4. Crear solicitud
  const { data: solicitud, error: errInsert } = await supabase
    .from("tarot_solicitudes_reenvio")
    .insert({
      orden_id: ordenId,
      canal,
      motivo,
      motivo_detalle: motivoDetalle,
      solicitado_por: solicitadoPor,
    })
    .select("*")
    .single();

  if (errInsert || !solicitud) {
    await registrarLog(ordenId, "solicitud_reenvio_error", "error",
      "No se pudo crear la solicitud de reenvío", { error: errInsert?.message });
    return jsonResponse({ ok: false, motivo: "error_al_crear_solicitud", detalle: errInsert?.message }, 500);
  }

  await registrarLog(ordenId, "solicitud_reenvio_creada", "info",
    `${solicitadoPor} solicitó reenvío por ${canal} — motivo: ${motivo}`,
    { solicitud_id: solicitud.id, canal, motivo, motivo_detalle: motivoDetalle });

  // 5. Alerta operativa (reutiliza dispararAlerta — persiste evento + email opcional)
  dispararAlerta(supabase, "reenvio_pendiente_autorizacion", {
    ordenId,
    ordenRef: orden.external_reference ?? undefined,
    etapa: `Reenvío por ${canal}`,
    error: `Motivo: ${motivo}${motivoDetalle ? ` — ${motivoDetalle}` : ""} (solicitado por ${solicitadoPor})`,
    fecha: new Date().toISOString(),
  }).catch(() => {});

  return jsonResponse({ ok: true, ya_existia: false, solicitud });
});
