import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
serve(async (req)=>{
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  try {
    const body = await req.json();
    const { id_suscriptor, ...updates } = body;
    if (!id_suscriptor) {
      return new Response(JSON.stringify({
        resultado: "error",
        mensaje: "Falta id_suscriptor"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // 🔹 aseguramos que no toque estado si no corresponde
    delete updates.estado_suscripcion;
    delete updates.tipo_suscripcion;
    const { data, error } = await supabase.from("suscriptores").update({
      ...updates,
      actualizado_en: new Date().toISOString()
    }).eq("id", id_suscriptor).select();
    if (error) {
      return new Response(JSON.stringify({
        resultado: "error",
        mensaje: error.message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    return new Response(JSON.stringify({
      resultado: "ok",
      data
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      resultado: "error",
      mensaje: "Error inesperado"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
