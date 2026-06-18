import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const MP_ACCESS_TOKEN      = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
const NOTIF_URL            = Deno.env.get("MP_NOTIFICATION_URL") ?? "";
const MP_ENV               = Deno.env.get("MP_ENV") ?? "production";
const MP_TEST_PLAYER_EMAIL = Deno.env.get("MP_TEST_PLAYER_EMAIL") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function httpsOrNull(u: string | undefined): string | null {
  try {
    const x = new URL(u ?? "");
    return x.protocol === "https:" ? u!.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

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
    if (req.method !== "POST") return new Response("ok");
    const b = await req.json().catch(() => ({}));
    const { id_suscriptor, nombre = "Suscriptor", monto = 390, moneda = "UYU", payer_email } = b;
    if (!id_suscriptor) {
      return new Response(JSON.stringify({ error: "Falta id_suscriptor" }), { status: 400 });
    }

    const rawBackUrl = await getConfigValue(
      "THC_BACK_URL",
      "https://tuhoroscopo-next-starter.vercel.app/horoscopo/gracias",
    );
    const BACK_URL = httpsOrNull(rawBackUrl) ?? undefined;

    const email = MP_ENV === "sandbox" && MP_TEST_PLAYER_EMAIL
      ? MP_TEST_PLAYER_EMAIL
      : payer_email ?? `user_${Date.now()}@tuoraculo.uy`;

    const pref = {
      items: [{
        title:       `Suscripción Premium Tu Oráculo - ${nombre}`,
        quantity:    1,
        currency_id: String(moneda).toUpperCase().slice(0, 3),
        unit_price:  Number(monto) || 390,
      }],
      external_reference: String(id_suscriptor),
      payer:              email ? { email } : undefined,
      back_urls: BACK_URL ? { success: BACK_URL, pending: BACK_URL, failure: BACK_URL } : undefined,
      auto_return:        "approved",
      notification_url:   NOTIF_URL || undefined,
    };

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method:  "POST",
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body:    JSON.stringify(pref),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok || !data?.init_point) {
      return new Response(JSON.stringify({ error: "MP_PREF_ERROR", detalle: data }), { status: 502 });
    }

    return new Response(
      JSON.stringify({ init_point: data.init_point, preference_id: data.id }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "internal", detalle: String(e) }), { status: 500 });
  }
});
