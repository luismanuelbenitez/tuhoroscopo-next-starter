// supabase/functions/ef_webhook_suscripcion/index.ts
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
serve(async (req)=>{
  try {
    const event = await req.json();
    console.log("🔔 Webhook recibido:", event);
    if (event.type === "payment" && event.data?.id) {
      // Consultar el pago en Mercado Pago
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${event.data.id}`, {
        headers: {
          Authorization: `Bearer ${Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")}`
        }
      });
      const pago = await mpRes.json();
      const idSuscriptor = pago.metadata?.id_suscriptor;
      if (pago.status === "approved") {
        await supabase.from("suscriptores").update({
          activo: true
        }).eq("id", idSuscriptor);
        await supabase.from("pagos").insert({
          id_suscriptor: idSuscriptor,
          estado: "aprobado",
          monto: pago.transaction_amount,
          id_pago_mp: pago.id
        });
      } else if (pago.status === "cancelled" || pago.status === "rejected") {
        await supabase.from("suscriptores").update({
          activo: false
        }).eq("id", idSuscriptor);
        await supabase.from("pagos").insert({
          id_suscriptor: idSuscriptor,
          estado: pago.status,
          monto: pago.transaction_amount,
          id_pago_mp: pago.id
        });
      }
    }
    return new Response("OK", {
      status: 200
    });
  } catch (err) {
    console.error("❌ Error webhook:", err);
    return new Response("Error", {
      status: 500
    });
  }
});
