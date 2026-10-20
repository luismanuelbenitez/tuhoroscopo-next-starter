// ============================================================
// ef_tarot_acceso_gracias — handoff /tarot/gracias → /lectura (2026-10-20)
//
// Devuelve el token público de /lectura de una orden SOLO si:
//   · lo pide el servidor de Next (x-internal-key) DESPUÉS de validar el
//     handoff efímero del navegador (cookie sellada, 6 h, atada a la orden —
//     ver lib/handoffGracias.ts). Esta función nunca se llama desde el browser.
//   · la orden está entregada y su lectura completada;
//   · el acceso web está activo y no venció;
//   · existe token_cifrado y, descifrado (AES-256-GCM, AAD = orden_id), su
//     SHA-256 coincide con el token_hash vigente (si el acceso se regeneró
//     por otra vía, no coincide → no se entrega nada).
// No genera tokens, no toca la expiración, no reenvía nada. Nunca loguea el
// token. Cualquier fallo → { ok: false } y /gracias degrada al estado actual.
// Autoaislada a propósito (no importa _shared/*).
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const CLAVE_CIFRADO_B64         = Deno.env.get("TAROT_ACCESO_CIFRADO_KEY") ?? "";
const FN = "ef_tarot_acceso_gracias";

const REF_RE = /^TAROT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTREGADOS = new Set(["entregado", "entregado_simulado"]);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function log(ordenId: string | null, evento: string, nivel: "info" | "warning", mensaje: string, payload: Record<string, unknown> = {}) {
  try {
    await supabase.from("tarot_logs").insert({ orden_id: ordenId, evento, nivel, mensaje, payload, funcion_origen: FN });
  } catch { /* best-effort */ }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function desdeB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function descifrar(cifrado: string, ordenId: string): Promise<string | null> {
  try {
    const [version, ivB64, datosB64] = cifrado.split(":");
    if (version !== "v1" || !ivB64 || !datosB64 || !CLAVE_CIFRADO_B64) return null;
    const raw = desdeB64(CLAVE_CIFRADO_B64);
    if (raw.length !== 32) return null;
    const clave = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const plano = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: desdeB64(ivB64), additionalData: new TextEncoder().encode(ordenId) },
      clave,
      desdeB64(datosB64),
    );
    return new TextDecoder().decode(plano);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (!TAROT_INTERNAL_KEY || req.headers.get("x-internal-key") !== TAROT_INTERNAL_KEY) {
    return json({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return json({ ok: false, motivo: "metodo_no_permitido" }, 405);

  const body = await req.json().catch(() => ({})) as { ref?: string };
  const ref = typeof body.ref === "string" ? body.ref.trim() : "";
  if (!REF_RE.test(ref)) return json({ ok: false, motivo: "ref_invalida" }, 400);

  const { data: orden } = await supabase.from("tarot_ordenes")
    .select("id, estado").eq("external_reference", ref).maybeSingle();
  if (!orden || !ENTREGADOS.has(orden.estado)) return json({ ok: false, motivo: "no_entregada" });

  const { count: lecturas } = await supabase.from("tarot_lecturas")
    .select("id", { count: "exact", head: true }).eq("orden_id", orden.id).eq("estado", "completada");
  if (!lecturas) return json({ ok: false, motivo: "lectura_no_completada" });

  const { data: acceso } = await supabase.from("tarot_accesos_web")
    .select("estado, expira_at, token_hash, token_cifrado").eq("orden_id", orden.id).maybeSingle();
  if (!acceso || acceso.estado !== "activo") return json({ ok: false, motivo: "acceso_inactivo" });
  if (new Date(acceso.expira_at).getTime() <= Date.now()) return json({ ok: false, motivo: "acceso_vencido" });
  if (!acceso.token_cifrado) return json({ ok: false, motivo: "sin_copia_cifrada" }); // órdenes anteriores

  const token = await descifrar(acceso.token_cifrado, orden.id);
  if (!token || (await sha256Hex(token)) !== acceso.token_hash) {
    await log(orden.id, "acceso_gracias_no_coincide", "warning", "La copia cifrada no corresponde al acceso vigente — no se entrega link (el acceso pudo regenerarse)");
    return json({ ok: false, motivo: "no_coincide" });
  }

  await log(orden.id, "acceso_gracias_entregado", "info", "Handoff /tarot/gracias → /lectura: link entregado al navegador de la compra");
  return json({ ok: true, token });
});
