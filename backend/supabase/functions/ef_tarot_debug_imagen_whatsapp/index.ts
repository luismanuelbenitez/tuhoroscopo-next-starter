// ============================================================
// ef_tarot_debug_imagen_whatsapp — SOLO QA interno
//
// Genera el cabezal de WhatsApp de una orden y devuelve el PNG crudo (o lo
// sube a Storage con forzar:true) para poder revisarlo visualmente durante
// el desarrollo del layout. Mismo patrón que ef_tarot_laboratorio (ya
// existente) para lecturas: herramienta de ingeniería gateada por
// x-internal-key, nunca expuesta al flujo de entrega real ni al cliente.
// No la llama ef_tarot_enviar_whatsapp ni ningún otro paso del pipeline.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { generarImagenWhatsapp } from "../_shared/tarot-imagen-whatsapp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return new Response(JSON.stringify({ ok: false, motivo: "unauthorized" }), { status: 401 });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, motivo: "metodo_no_permitido" }), { status: 405 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* body vacío = defaults */ }

  const ordenId = typeof body.orden_id === "string" ? body.orden_id.trim() : "";
  const debugLayout = body.debugLayout === true;
  const forzar = body.forzar !== false; // default true: siempre regenera en modo debug

  if (!ordenId) {
    return new Response(JSON.stringify({ ok: false, motivo: "orden_id_requerido" }), { status: 400 });
  }

  const t0 = Date.now();
  const resultado = await generarImagenWhatsapp(supabase, ordenId, { forzar, debugLayout });
  const durMs = Date.now() - t0;

  if (!resultado) {
    return new Response(JSON.stringify({ ok: false, motivo: "generacion_fallo", duracion_ms: durMs }), { status: 500 });
  }

  if (resultado.bytes) {
    return new Response(resultado.bytes as unknown as BodyInit, {
      status: 200,
      headers: { "Content-Type": "image/png", "X-Duracion-Ms": String(durMs), "X-Bytes": String(resultado.bytes.length) },
    });
  }

  return new Response(JSON.stringify({ ok: true, signedUrl: resultado.signedUrl, duracion_ms: durMs }), { status: 200 });
});
