// ============================================================================
// ef_tarot_whatsapp_media — Proxy protegido para media de WhatsApp inbound
// ============================================================================
//
// Los mensajes con media (imagen/documento/audio/video/sticker) solo
// persisten metadata (media_id, mime_type, filename) — nunca el archivo en
// sí, y nunca en un bucket público. Esta función es el ÚNICO camino para
// que el Admin vea el contenido real:
//
//   1) GET https://graph.facebook.com/v18.0/{media_id} (Bearer WHATSAPP_TOKEN)
//      → devuelve una url temporal (vence en minutos) + mime_type.
//   2) GET esa url (mismo Bearer) → bytes reales.
//   3) Se devuelven los bytes al Admin con el content-type correcto.
//
// El token de Meta NUNCA llega al navegador — todo el fetch es server-side.
// Gateada por x-internal-key, solo se llama desde la ruta admin protegida
// por sesión (app/api/admin/tarot/whatsapp/[id]/media/[mensajeId]/route.ts).
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";

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
  if (!WHATSAPP_TOKEN) return jsonResponse({ ok: false, motivo: "whatsapp_token_no_configurado" }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, motivo: "json_invalido" }, 400); }

  const mensajeId = typeof body.mensaje_id === "string" ? body.mensaje_id.trim() : "";
  if (!mensajeId) return jsonResponse({ ok: false, motivo: "mensaje_id_requerido" }, 400);

  const { data: mensaje, error } = await supabase
    .from("tarot_whatsapp_mensajes")
    .select("media_id, mime_type, filename, tipo")
    .eq("id", mensajeId)
    .maybeSingle();
  if (error) return jsonResponse({ ok: false, motivo: "error_query", detalle: error.message }, 500);
  if (!mensaje?.media_id) return jsonResponse({ ok: false, motivo: "mensaje_sin_media" }, 404);

  try {
    const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mensaje.media_id}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    if (!metaRes.ok) {
      const detalle = await metaRes.text().catch(() => "");
      return jsonResponse({ ok: false, motivo: "meta_media_metadata_error", http_status: metaRes.status, detalle }, 502);
    }
    const meta = await metaRes.json() as { url?: string; mime_type?: string };
    if (!meta.url) return jsonResponse({ ok: false, motivo: "meta_sin_url" }, 502);

    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
    if (!fileRes.ok) {
      return jsonResponse({ ok: false, motivo: "meta_media_download_error", http_status: fileRes.status }, 502);
    }

    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    const contentType = meta.mime_type ?? mensaje.mime_type ?? "application/octet-stream";
    const filename = mensaje.filename ?? `${mensaje.tipo}-${mensajeId}`;

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return jsonResponse({ ok: false, motivo: "excepcion", detalle: String(e) }, 500);
  }
});
