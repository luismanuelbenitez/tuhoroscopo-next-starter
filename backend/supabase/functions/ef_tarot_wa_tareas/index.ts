// ============================================================================
// ef_tarot_wa_tareas — tareas periódicas de la bandeja de WhatsApp
// ============================================================================
// Invocada por pg_cron cada 15 min (migración 20261021000005), con
// x-internal-key = TAROT_INTERNAL_KEY (leída de Vault). Dos tareas:
//
//  1) Media pendiente: copia al bucket privado wa-media la media entrante
//     que no se pudo copiar al recibirla (hasta 5 intentos). Pasados 7 días
//     Meta ya no la tiene → 'vencida'.
//  2) Alerta "WhatsApp sin responder": por cada conversación cuyo último
//     mensaje del contacto lleva más de N min (tarot_configuracion
//     whatsapp_alerta_sin_respuesta_min, 30 por defecto) sin respuesta
//     manual, dispara UNA alerta wa_sin_responder (evento + email según
//     tarot_alertas_config). La auto-respuesta no cuenta como atendido.
//     Si el contacto vuelve a escribir después, se vuelve a avisar.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { guardarMedia } from "../_shared/wa-media.ts";
import { dispararAlerta } from "../_shared/tarot-alertas.ts";

const FN = "ef_tarot_wa_tareas";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const MEDIA_LOTE = 20;
const MEDIA_MAX_INTENTOS = 5;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

async function log(evento: string, nivel: "info" | "warning" | "error", mensaje: string, payload: Record<string, unknown> = {}) {
  try { await supabase.from("tarot_logs").insert({ evento, nivel, mensaje, payload, funcion_origen: FN }); } catch { /* no bloquea */ }
}

async function tareaMedia() {
  const hace7d = new Date(Date.now() - 7 * 86400000).toISOString();
  // Lo que ya pasó los 7 días sin copiarse: Meta lo borró.
  const { data: vencidas } = await supabase.from("tarot_whatsapp_mensajes")
    .update({ media_estado: "vencida" })
    .in("media_estado", ["pendiente", "error"]).lt("created_at", hace7d)
    .select("id");
  const { data: pendientes } = await supabase.from("tarot_whatsapp_mensajes")
    .select("id, conversacion_id, media_id, mime_type, media_intentos")
    .in("media_estado", ["pendiente", "error"]).gte("created_at", hace7d).lt("media_intentos", MEDIA_MAX_INTENTOS)
    .order("created_at", { ascending: true }).limit(MEDIA_LOTE);
  const resultados: Record<string, number> = {};
  for (const fila of pendientes ?? []) {
    const r = await guardarMedia(supabase, fila);
    resultados[r.estado] = (resultados[r.estado] ?? 0) + 1;
  }
  return { procesadas: (pendientes ?? []).length, ...resultados, vencidas: (vencidas ?? []).length };
}

async function tareaSinResponder() {
  const { data: cfg } = await supabase.from("tarot_configuracion").select("valor").eq("clave", "whatsapp_alerta_sin_respuesta_min").maybeSingle();
  const minutos = Math.max(5, Number(cfg?.valor ?? 30) || 30);
  const { data: filas, error } = await supabase.rpc("tarot_wa_conversaciones_sin_respuesta", { p_minutos: minutos });
  if (error) {
    await log("wa_sin_responder_error", "error", "No se pudo consultar conversaciones sin respuesta", { error: error.message });
    return { error: error.message };
  }
  let avisadas = 0;
  for (const f of (filas ?? []) as Array<{ conversacion_id: string; nombre: string | null; ultimo_inbound_at: string; preview: string | null }>) {
    // Se marca ANTES de avisar: si el email falla no se reintenta en loop
    // (el evento queda igual en el panel de alertas del admin).
    const { data: marcada } = await supabase.from("tarot_whatsapp_conversaciones")
      .update({ alerta_sin_respuesta_at: new Date().toISOString() })
      .eq("id", f.conversacion_id)
      .or(`alerta_sin_respuesta_at.is.null,alerta_sin_respuesta_at.lt.${f.ultimo_inbound_at}`)
      .select("id");
    if (!marcada?.length) continue; // otra ejecución ya avisó
    await dispararAlerta(supabase, "wa_sin_responder", {
      clienteNombre: (f.nombre ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 80) || undefined,
      fecha: f.ultimo_inbound_at,
      etapa: "WhatsApp sin responder",
      error: f.preview ?? undefined,
    });
    avisadas++;
  }
  return { minutos, candidatas: (filas ?? []).length, avisadas };
}

serve(async (req) => {
  if (!TAROT_INTERNAL_KEY || req.headers.get("x-internal-key") !== TAROT_INTERNAL_KEY) {
    return json({ ok: false, motivo: "unauthorized" }, 401);
  }
  const [media, sinResponder] = await Promise.all([
    tareaMedia().catch((e) => ({ error: String(e).slice(0, 200) })),
    tareaSinResponder().catch((e) => ({ error: String(e).slice(0, 200) })),
  ]);
  return json({ ok: true, media, sin_responder: sinResponder });
});
