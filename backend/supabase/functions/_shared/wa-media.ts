// Media entrante de WhatsApp (2026-10-21, P0-c).
//
// Meta conserva la media que nos mandan solo 7 días. Por eso se copia al
// bucket PRIVADO "wa-media" apenas llega (ef_tarot_wa_ingesta, en segundo
// plano), con reintentos (ef_tarot_wa_tareas) y, como último recurso, al
// verla en el Admin (ef_tarot_whatsapp_media).
//
// El contenido lo elige quien nos escribe → se trata como hostil: allowlist
// de tipos + verificación de firma de bytes; el token de Meta solo viaja a
// hosts de Meta. Lo que no pasa los controles NO se guarda (media_estado =
// 'bloqueada') y nunca se sirve.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { GRAPH_BASE } from "./wa-graph.ts";

export const MEDIA_BUCKET = "wa-media";
export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;
const TOKEN = Deno.env.get("WHATSAPP_TAROT_TOKEN_PROD") || Deno.env.get("WHATSAPP_TOKEN") || "";

type Regla = { inline: boolean; firma?: (b: Uint8Array) => boolean };
const empieza = (b: Uint8Array, ...bytes: number[]) => bytes.every((x, i) => b[i] === x);
const ascii = (b: Uint8Array, desde: number, txt: string) => [...txt].every((c, i) => b[desde + i] === c.charCodeAt(0));
export const REGLAS: Record<string, Regla> = {
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

export const normalizarMime = (m: unknown) => String(m ?? "").split(";")[0].trim().toLowerCase();

/** null = permitido; si no, el motivo del bloqueo. */
export function motivoBloqueo(mime: string, bytes: Uint8Array): string | null {
  const regla = REGLAS[mime];
  if (!regla) return "tipo_no_permitido";
  if (bytes.length > MEDIA_MAX_BYTES) return "demasiado_grande";
  if (regla.firma && !regla.firma(bytes)) return "contenido_no_coincide_con_tipo";
  return null;
}

const GRAPH_ES_MOCK = !GRAPH_BASE.startsWith("https://graph.facebook.com/");
export function hostEsDeMeta(url: string): boolean {
  try {
    const u = new URL(url);
    if (GRAPH_ES_MOCK) return u.host === new URL(GRAPH_BASE).host; // QA local
    return u.protocol === "https:" && /(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net|fbcdn\.net)$/.test(u.hostname);
  } catch { return false; }
}

export type Bytes = Uint8Array<ArrayBuffer>;

async function sha256hex(bytes: Bytes) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
}

type FilaMedia = { id: string; conversacion_id: string; media_id: string | null; mime_type: string | null; media_intentos?: number | null };
export type ResultadoGuardado =
  | { estado: "guardada"; ruta: string; mime: string; bytes: Bytes }
  | { estado: "bloqueada" | "vencida" | "error"; motivo: string };

/** Descarga de Meta, valida y guarda en el bucket. Actualiza la fila. */
export async function guardarMedia(supabase: SupabaseClient, fila: FilaMedia): Promise<ResultadoGuardado> {
  const intentos = (fila.media_intentos ?? 0) + 1;
  const marcar = (patch: Record<string, unknown>) =>
    supabase.from("tarot_whatsapp_mensajes").update({ media_intentos: intentos, ...patch }).eq("id", fila.id);
  if (!fila.media_id) return { estado: "error", motivo: "sin_media_id" };
  if (!TOKEN) { await marcar({ media_estado: "error" }); return { estado: "error", motivo: "token_no_configurado" }; }
  try {
    const metaRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(fila.media_id)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!metaRes.ok) {
      // 400/404 de Meta: el media_id ya no existe (pasaron los 7 días).
      const vencida = metaRes.status === 400 || metaRes.status === 404;
      await marcar({ media_estado: vencida ? "vencida" : "error" });
      return { estado: vencida ? "vencida" : "error", motivo: `meta_${metaRes.status}` };
    }
    const meta = await metaRes.json() as { url?: string; mime_type?: string; file_size?: number };
    const mime = normalizarMime(meta.mime_type ?? fila.mime_type);
    if (!meta.url || !hostEsDeMeta(meta.url)) { await marcar({ media_estado: "bloqueada" }); return { estado: "bloqueada", motivo: "url_de_descarga_no_es_de_meta" }; }
    if (!REGLAS[mime]) { await marcar({ media_estado: "bloqueada" }); return { estado: "bloqueada", motivo: "tipo_no_permitido" }; }
    if (typeof meta.file_size === "number" && meta.file_size > MEDIA_MAX_BYTES) { await marcar({ media_estado: "bloqueada" }); return { estado: "bloqueada", motivo: "demasiado_grande" }; }

    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN}` }, redirect: "error" });
    if (!fileRes.ok) { await marcar({ media_estado: "error" }); return { estado: "error", motivo: `descarga_${fileRes.status}` }; }
    const bytes: Bytes = new Uint8Array(await fileRes.arrayBuffer());
    const bloqueo = motivoBloqueo(mime, bytes);
    if (bloqueo) { await marcar({ media_estado: "bloqueada" }); return { estado: "bloqueada", motivo: bloqueo }; }

    const ruta = `${fila.conversacion_id}/${fila.id}`;
    const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(ruta, bytes, { contentType: mime, upsert: true });
    if (upErr) { await marcar({ media_estado: "error" }); return { estado: "error", motivo: `storage: ${upErr.message}`.slice(0, 200) }; }
    await marcar({ media_estado: "guardada", media_ruta: ruta, media_bytes: bytes.length, media_sha256: await sha256hex(bytes), mime_type: mime });
    return { estado: "guardada", ruta, mime, bytes };
  } catch (e) {
    await marcar({ media_estado: "error" });
    return { estado: "error", motivo: String(e).slice(0, 200) };
  }
}
