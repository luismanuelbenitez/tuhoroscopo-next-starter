// ============================================================
// _shared/tarot-accesos.ts — Acceso web temporal a "Tu Tirada"
//
// Token criptográficamente aleatorio (32 bytes, base64url) que NUNCA se
// persiste en texto plano — solo su hash SHA-256 vive en
// tarot_accesos_web.token_hash. Quien tiene el link accede, sin login;
// esto es acceso por posesión del enlace, no autenticación. Vence a los
// 30 días desde su creación (o desde la última regeneración).
//
// Una orden tiene a lo sumo un acceso vigente (índice único en orden_id):
// regenerar reutiliza la misma fila, extendiendo la expiración.
// ============================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const DIAS_VALIDEZ = 30;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generarTokenCrudo(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export interface AccesoWeb {
  token: string;
  path: string;
  expiraAt: string;
}

/**
 * Crea o regenera el acceso web de una orden. Idempotente en el sentido de
 * que siempre deja una única fila activa por orden — llamarla de nuevo
 * (ej. un reenvío) emite un token nuevo y extiende la expiración 30 días
 * más; el token anterior (si alguien lo guardó) deja de resolver.
 */
export async function crearAccesoWeb(
  supabase: SupabaseClient,
  ordenId: string,
): Promise<AccesoWeb> {
  const token = generarTokenCrudo();
  const tokenHash = await sha256Hex(token);
  const ahora = new Date();
  const expiraAt = new Date(ahora.getTime() + DIAS_VALIDEZ * 24 * 3600 * 1000).toISOString();

  const { error } = await supabase
    .from("tarot_accesos_web")
    .upsert(
      {
        orden_id: ordenId,
        token_hash: tokenHash,
        estado: "activo",
        expira_at: expiraAt,
        updated_at: ahora.toISOString(),
      },
      { onConflict: "orden_id" },
    );

  if (error) throw new Error("crearAccesoWeb: " + error.message);

  return { token, path: `/lectura/${token}`, expiraAt };
}
