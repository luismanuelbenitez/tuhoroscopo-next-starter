// ============================================================================
// ef_tarot_whatsapp_media — Proxy protegido para media de WhatsApp inbound
// ============================================================================
//
// Único camino para que el Admin vea la media que nos mandan. Gateada por
// x-internal-key; solo se llama desde la ruta admin protegida por sesión
// (app/api/admin/tarot/whatsapp/[id]/media/[mensajeId]/route.ts). El token
// de Meta nunca llega al navegador.
//
// Fuente (2026-10-21, P0-c): el bucket PRIVADO wa-media, donde la ingesta
// copia la media al recibirla (Meta la borra a los 7 días). Si todavía no
// está copiada, se copia ahora (vía _shared/wa-media.ts) y se sirve.
//
// Endurecimiento (P0-a): el mensaje tiene que ser de la conversación pedida;
// allowlist + firma de bytes (también al leer del bucket: defensa en
// profundidad); imagen/audio/video inline, documentos SIEMPRE como descarga;
// nosniff + CSP sandbox.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { guardarMedia, motivoBloqueo, normalizarMime, REGLAS, MEDIA_BUCKET, type Bytes } from "../_shared/wa-media.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function logBloqueo(motivo: string, detalle: Record<string, unknown>) {
  try {
    await supabase.from("tarot_logs").insert({
      evento: "wa_media_bloqueada", nivel: "warning", mensaje: `Media bloqueada: ${motivo}`,
      payload: detalle, funcion_origen: "ef_tarot_whatsapp_media",
    });
  } catch { /* no bloquea */ }
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, motivo: "json_invalido" }, 400); }

  const mensajeId = typeof body.mensaje_id === "string" ? body.mensaje_id.trim() : "";
  const conversacionId = typeof body.conversacion_id === "string" ? body.conversacion_id.trim() : "";
  if (!mensajeId || !conversacionId) return jsonResponse({ ok: false, motivo: "parametros_requeridos" }, 400);

  const { data: mensaje, error } = await supabase
    .from("tarot_whatsapp_mensajes")
    .select("id, media_id, mime_type, filename, tipo, conversacion_id, direccion, media_ruta, media_estado, media_intentos")
    .eq("id", mensajeId)
    .maybeSingle();
  if (error) return jsonResponse({ ok: false, motivo: "error_query" }, 500);
  // Mismo 404 si no existe o es de otra conversación (no se revela cuál).
  if (!mensaje || mensaje.conversacion_id !== conversacionId || mensaje.direccion !== "inbound") {
    return jsonResponse({ ok: false, motivo: "mensaje_no_encontrado" }, 404);
  }
  if (!mensaje.media_id) return jsonResponse({ ok: false, motivo: "mensaje_sin_media" }, 404);
  if (mensaje.media_estado === "bloqueada") {
    await logBloqueo("ya_bloqueada", { mensaje_id: mensajeId, mime: mensaje.mime_type });
    return jsonResponse({ ok: false, motivo: "media_no_permitida", detalle: "bloqueada" }, 415);
  }

  let bytes: Bytes | null = null;
  let mime = normalizarMime(mensaje.mime_type);

  if (mensaje.media_ruta) {
    const { data: blob, error: dlErr } = await supabase.storage.from(MEDIA_BUCKET).download(mensaje.media_ruta);
    if (!dlErr && blob) bytes = new Uint8Array(await blob.arrayBuffer());
  }
  if (!bytes) {
    const r = await guardarMedia(supabase, mensaje);
    if (r.estado === "guardada") { bytes = r.bytes; mime = r.mime; }
    else if (r.estado === "bloqueada") {
      await logBloqueo(r.motivo, { mensaje_id: mensajeId, mime });
      return jsonResponse({ ok: false, motivo: "media_no_permitida", detalle: r.motivo }, 415);
    } else if (r.estado === "vencida") {
      return jsonResponse({ ok: false, motivo: "media_vencida", detalle: "Meta ya no la conserva (más de 7 días) y no llegó a copiarse" }, 410);
    } else {
      return jsonResponse({ ok: false, motivo: "media_no_disponible", detalle: r.motivo }, 502);
    }
  }

  // Defensa en profundidad: se re-valida lo que sale del bucket.
  const bloqueo = motivoBloqueo(mime, bytes);
  if (bloqueo) {
    await logBloqueo(bloqueo, { mensaje_id: mensajeId, mime, origen: "bucket" });
    return jsonResponse({ ok: false, motivo: "media_no_permitida", detalle: bloqueo }, 415);
  }
  const regla = REGLAS[mime];
  const seguro = (mensaje.filename ?? `${mensaje.tipo}-${mensajeId}`).replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const contentType = regla.inline || mime === "application/pdf" ? mime : "application/octet-stream";
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${regla.inline ? "inline" : "attachment"}; filename="${seguro}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
});
