// ============================================================================
// ef_tarot_whatsapp_media — Proxy protegido para media de WhatsApp inbound
// ============================================================================
//
// Los mensajes con media (imagen/documento/audio/video/sticker) solo
// persisten metadata (media_id, mime_type, filename) — nunca el archivo en
// sí, y nunca en un bucket público. Esta función es el ÚNICO camino para
// que el Admin vea el contenido real:
//
//   1) GET {GRAPH}/{media_id} (Bearer WHATSAPP_TOKEN)
//      → devuelve una url temporal (vence a los 5 min) + mime_type.
//   2) GET esa url (mismo Bearer) → bytes reales.
//   3) Se devuelven los bytes al Admin — solo si pasan los controles.
//
// El token de Meta NUNCA llega al navegador — todo el fetch es server-side.
// Gateada por x-internal-key, solo se llama desde la ruta admin protegida
// por sesión (app/api/admin/tarot/whatsapp/[id]/media/[mensajeId]/route.ts).
//
// ENDURECIMIENTO (2026-10-21, P0-a). El contenido lo elige quien nos
// escribe, así que se trata como hostil:
//   - el mensaje tiene que pertenecer a la conversación pedida;
//   - allowlist de tipos (los que Cloud API admite) + verificación de la
//     firma de bytes ("magic number"): un HTML/SVG/JS o un archivo cuyo
//     contenido no coincide con su tipo declarado se BLOQUEA (415);
//   - tope de tamaño;
//   - el Bearer de Meta solo se envía a hosts de Meta (la url de descarga
//     la devuelve Graph; se valida antes de mandarle el token);
//   - imagen/audio/video se sirven inline; documentos SIEMPRE como descarga
//     (attachment, application/octet-stream salvo PDF);
//   - cabeceras: nosniff + CSP sandbox (aunque algo pasara, no ejecuta).
// Media entrante: Meta conserva el media_id solo 7 días (P0-c pendiente).
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
// Token de producción de Tarot (2026-09-25): antes usaba WHATSAPP_TOKEN legacy, ya revocado
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TAROT_TOKEN_PROD") || Deno.env.get("WHATSAPP_TOKEN") || "";
// Base de la Graph API — misma versión que hoy (actualizarla es P1).
// Configurable solo para QA local (mock de Meta).
const GRAPH_BASE = Deno.env.get("WHATSAPP_GRAPH_BASE") || "https://graph.facebook.com/v18.0";
const MAX_BYTES = 25 * 1024 * 1024;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// Tipos admitidos (los de WhatsApp Cloud API). `inline`: se puede ver en el
// navegador; el resto se fuerza a descarga.
type Regla = { inline: boolean; firma?: (b: Uint8Array) => boolean };
const empieza = (b: Uint8Array, ...bytes: number[]) => bytes.every((x, i) => b[i] === x);
const ascii = (b: Uint8Array, desde: number, txt: string) => [...txt].every((c, i) => b[desde + i] === c.charCodeAt(0));
const REGLAS: Record<string, Regla> = {
  "image/jpeg": { inline: true, firma: (b) => empieza(b, 0xff, 0xd8, 0xff) },
  "image/png": { inline: true, firma: (b) => empieza(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) },
  "image/webp": { inline: true, firma: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP") },
  "audio/ogg": { inline: true, firma: (b) => ascii(b, 0, "OggS") },
  "audio/mpeg": { inline: true, firma: (b) => ascii(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  "audio/mp4": { inline: true, firma: (b) => ascii(b, 4, "ftyp") },
  "audio/aac": { inline: true, firma: (b) => (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) || ascii(b, 0, "ADIF") },
  "audio/amr": { inline: true, firma: (b) => ascii(b, 0, "#!AMR") },
  "video/mp4": { inline: true, firma: (b) => ascii(b, 4, "ftyp") },
  "video/3gpp": { inline: true, firma: (b) => ascii(b, 4, "ftyp") },
  "application/pdf": { inline: false, firma: (b) => ascii(b, 0, "%PDF-") },
  "text/plain": { inline: false },
  "application/msword": { inline: false },
  "application/vnd.ms-excel": { inline: false },
  "application/vnd.ms-powerpoint": { inline: false },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { inline: false },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { inline: false },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { inline: false },
};

const GRAPH_ES_MOCK = !GRAPH_BASE.startsWith("https://graph.facebook.com/");
function hostEsDeMeta(url: string): boolean {
  try {
    const u = new URL(url);
    // QA local: el mock de Meta, solo si WHATSAPP_GRAPH_BASE fue sobrescrita.
    if (GRAPH_ES_MOCK) return u.host === new URL(GRAPH_BASE).host;
    return u.protocol === "https:" && /(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net|fbcdn\.net)$/.test(u.hostname);
  } catch { return false; }
}

const bloquear = async (motivo: string, detalle: Record<string, unknown>) => {
  try {
    await supabase.from("tarot_logs").insert({
      evento: "wa_media_bloqueada", nivel: "warning", mensaje: `Media bloqueada: ${motivo}`,
      payload: detalle, funcion_origen: "ef_tarot_whatsapp_media",
    });
  } catch { /* no bloquea */ }
  return jsonResponse({ ok: false, motivo: "media_no_permitida", detalle: motivo }, 415);
};

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
  const conversacionId = typeof body.conversacion_id === "string" ? body.conversacion_id.trim() : "";
  if (!mensajeId || !conversacionId) return jsonResponse({ ok: false, motivo: "parametros_requeridos" }, 400);

  const { data: mensaje, error } = await supabase
    .from("tarot_whatsapp_mensajes")
    .select("media_id, mime_type, filename, tipo, conversacion_id, direccion")
    .eq("id", mensajeId)
    .maybeSingle();
  if (error) return jsonResponse({ ok: false, motivo: "error_query" }, 500);
  // Mismo 404 si no existe o es de otra conversación (no se revela cuál).
  if (!mensaje || mensaje.conversacion_id !== conversacionId || mensaje.direccion !== "inbound") {
    return jsonResponse({ ok: false, motivo: "mensaje_no_encontrado" }, 404);
  }
  if (!mensaje.media_id) return jsonResponse({ ok: false, motivo: "mensaje_sin_media" }, 404);

  try {
    const metaRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(mensaje.media_id)}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    if (!metaRes.ok) {
      // 400/404 típico: media_id vencido (Meta lo conserva 7 días).
      return jsonResponse({ ok: false, motivo: "meta_media_no_disponible", http_status: metaRes.status }, 502);
    }
    const meta = await metaRes.json() as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url || !hostEsDeMeta(meta.url)) return bloquear("url_de_descarga_no_es_de_meta", { mensaje_id: mensajeId });

    const mime = String(meta.mime_type ?? mensaje.mime_type ?? "").split(";")[0].trim().toLowerCase();
    const regla = REGLAS[mime];
    if (!regla) return bloquear("tipo_no_permitido", { mensaje_id: mensajeId, mime });
    if (typeof meta.file_size === "number" && meta.file_size > MAX_BYTES) return bloquear("demasiado_grande", { mensaje_id: mensajeId, bytes: meta.file_size });

    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, redirect: "error" });
    if (!fileRes.ok) {
      return jsonResponse({ ok: false, motivo: "meta_media_download_error", http_status: fileRes.status }, 502);
    }
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    if (bytes.length > MAX_BYTES) return bloquear("demasiado_grande", { mensaje_id: mensajeId, bytes: bytes.length });
    if (regla.firma && !regla.firma(bytes)) return bloquear("contenido_no_coincide_con_tipo", { mensaje_id: mensajeId, mime });

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
  } catch (e) {
    return jsonResponse({ ok: false, motivo: "excepcion", detalle: String(e).slice(0, 200) }, 500);
  }
});
