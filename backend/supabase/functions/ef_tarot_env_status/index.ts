// ============================================================
// ef_tarot_env_status
// Devuelve estado booleano de secrets de Supabase Edge Functions.
//
// Propósito: permitir que el panel admin verifique si los secrets
// necesarios para el envío de WhatsApp están presentes en el
// runtime de Supabase Edge Functions, que es donde realmente
// se ejecuta el envío.
//
// Auth: Authorization: Bearer SUPABASE_SECRET_KEY
// Método: GET o POST
// Nunca devuelve valores — solo true/false.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const SUPABASE_SECRET_KEY = Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const WHATSAPP_TOKEN            = Deno.env.get("WHATSAPP_TOKEN")            ?? "";
const WHATSAPP_PHONE_NUMBER_ID  = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")  ?? "";

serve((req) => {
  const auth = req.headers.get("Authorization");
  if (!SUPABASE_SECRET_KEY || auth !== `Bearer ${SUPABASE_SECRET_KEY}`) {
    return new Response(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ok:                                    true,
    whatsapp_token_configurado:            !!WHATSAPP_TOKEN,
    whatsapp_phone_number_id_configurado:  !!WHATSAPP_PHONE_NUMBER_ID,
    source:                                "supabase_edge_secrets",
  }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
