// supabase/functions/ef_crea_preapproval/index.ts
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
serve(async (req)=>{
  try {
    const body = await req.json();
    const { email, id_suscriptor, monto, moneda } = body;
    if (!email || !id_suscriptor) {
      return new Response(JSON.stringify({
        error: "Faltan parámetros obligatorios"
      }), {
        status: 400
      });
    }
    const payload = {
      reason: "Suscripción Premium Tu Horóscopo Cósmico",
      external_reference: id_suscriptor,
      back_url: "https://tuhoroscopocosmico.com/gracias",
      payer_email: email,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: monto ?? 390,
        currency_id: moneda ?? "UYU",
        start_date: new Date().toISOString(),
        end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
      }
    };
    const res = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({
        error: data
      }), {
        status: 500
      });
    }
    // Lo que te interesa devolver al frontend es el init_point
    return new Response(JSON.stringify({
      init_point: data.init_point,
      preapproval_id: data.id
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("Error creando preapproval:", err);
    return new Response(JSON.stringify({
      error: "Error interno"
    }), {
      status: 500
    });
  }
});
