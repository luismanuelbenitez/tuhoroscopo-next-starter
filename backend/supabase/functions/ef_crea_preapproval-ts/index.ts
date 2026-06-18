import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const MP_ACCESS_TOKEN    = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getConfigValue(clave: string, fallback: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("config")
      .select("valor")
      .eq("nombre", clave)
      .maybeSingle();
    return data?.valor ?? fallback;
  } catch {
    return fallback;
  }
}

serve(async (req) => {
  try {
    const body = await req.json();
    const { email, id_suscriptor, monto, moneda } = body;
    if (!email || !id_suscriptor) {
      return new Response(JSON.stringify({ error: "Faltan parámetros obligatorios" }), { status: 400 });
    }

    const backUrl = await getConfigValue(
      "THC_BACK_URL",
      "https://tuhoroscopo-next-starter.vercel.app/horoscopo/gracias",
    );

    const payload = {
      reason:             "Suscripción Premium Tu Oráculo",
      external_reference: id_suscriptor,
      back_url:           backUrl,
      payer_email:        email,
      auto_recurring: {
        frequency:          1,
        frequency_type:     "months",
        transaction_amount: monto ?? 390,
        currency_id:        moneda ?? "UYU",
        start_date:         new Date().toISOString(),
        end_date:           new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
      },
    };

    const res = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), { status: 500 });
    }

    return new Response(
      JSON.stringify({ init_point: data.init_point, preapproval_id: data.id }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error creando preapproval:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500 });
  }
});
