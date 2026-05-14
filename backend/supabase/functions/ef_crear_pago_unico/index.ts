// supabase/functions/ef_crear_pago_unico/index.ts
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
const RAW_BACK_URL = Deno.env.get("MP_BACK_URL") ?? "https://tuhoroscopocosmico.com/gracias-premium/";
const NOTIF_URL = Deno.env.get("MP_NOTIFICATION_URL") ?? ""; // mismo webhook
const MP_ENV = Deno.env.get("MP_ENV") ?? "production";
const MP_TEST_PLAYER_EMAIL = Deno.env.get("MP_TEST_PLAYER_EMAIL") ?? "";
function httpsOrNull(u) {
  try {
    const x = new URL(u ?? "");
    return x.protocol === "https:" ? u.replace(/\/+$/, "") : null;
  } catch  {
    return null;
  }
}
const BACK_URL = httpsOrNull(RAW_BACK_URL) ?? undefined;
serve(async (req)=>{
  try {
    if (req.method !== "POST") return new Response("ok");
    const b = await req.json().catch(()=>({}));
    const { id_suscriptor, nombre = "Suscriptor", monto = 390, moneda = "UYU", payer_email } = b;
    if (!id_suscriptor) {
      return new Response(JSON.stringify({
        error: "Falta id_suscriptor"
      }), {
        status: 400
      });
    }
    // en sandbox, usa email test si lo tienes configurado
    const email = MP_ENV === "sandbox" && MP_TEST_PLAYER_EMAIL ? MP_TEST_PLAYER_EMAIL : payer_email ?? `user_${Date.now()}@tuhoroscopocosmico.com`;
    const pref = {
      items: [
        {
          title: `Primer mes Premium THC - ${nombre}`,
          quantity: 1,
          currency_id: String(moneda).toUpperCase().slice(0, 3),
          unit_price: Number(monto) || 390
        }
      ],
      external_reference: String(id_suscriptor),
      payer: email ? {
        email
      } : undefined,
      back_urls: BACK_URL ? {
        success: BACK_URL,
        pending: BACK_URL,
        failure: BACK_URL
      } : undefined,
      auto_return: "approved",
      notification_url: NOTIF_URL || undefined
    };
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(pref)
    });
    const data = await r.json().catch(()=>({}));
    if (!r.ok || !data?.init_point) {
      return new Response(JSON.stringify({
        error: "MP_PREF_ERROR",
        detalle: data
      }), {
        status: 502
      });
    }
    return new Response(JSON.stringify({
      init_point: data.init_point,
      preference_id: data.id
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: "internal",
      detalle: String(e)
    }), {
      status: 500
    });
  }
});
