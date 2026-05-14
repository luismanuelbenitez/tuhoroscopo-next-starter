// supabase/functions/ef_alta_suscriptor_premium/index.ts
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// 🔹 Helper para logging embebido
async function registrarLog(supabase, nombreFuncion, resultado, detalle = {}, exito = true, creadoPor = "system") {
  try {
    const { error } = await supabase.from("log_funciones").insert([
      {
        nombre_funcion: nombreFuncion,
        resultado,
        detalle,
        exito,
        creado_por: creadoPor
      }
    ]);
    if (error) {
      console.error("Error al guardar el log:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Excepción al intentar guardar log:", err);
    return false;
  }
}
serve(async (req)=>{
  const funcion = "ef_alta_suscriptor_premium";
  let supabase;
  let body;
  try {
    // ===========================================
    // === INICIALIZACIÓN Y VALIDACIÓN DE ENV ===
    // ===========================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      console.error("Error fatal: Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Edge Function");
      return new Response(JSON.stringify({
        resultado: "error",
        mensaje: "Configuración interna del servidor (EF)"
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    supabase = createClient(supabaseUrl, supabaseKey);
    try {
      body = await req.json();
    } catch  {
      await registrarLog(supabase, funcion, "Error: JSON inválido", {}, false);
      return new Response(JSON.stringify({
        resultado: "error",
        mensaje: "JSON inválido"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // ===========================================
    // === EXTRACCIÓN DE CAMPOS (CORREGIDO) ===
    // ===========================================
    const { nombre, telefono, signo, contenido_preferido, id_pago_mp = null, origen = "web", whatsapp, acepto_politicas, version_politicas, medio_consentimiento, ip_consentimiento, user_agent, fecha_consentimiento } = body;
    // ===========================================
    // === VALIDACIÓN DE CAMPOS REQUERIDOS (CORREGIDO) ===
    // ===========================================
    if (!nombre || !telefono || !signo || !contenido_preferido || acepto_politicas === undefined || !version_politicas) {
      await registrarLog(supabase, funcion, "Error: Faltan campos requeridos", {
        body_recibido: body
      }, false);
      return new Response(JSON.stringify({
        resultado: "error",
        mensaje: "Faltan campos requeridos desde la API Route"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    const whatsappFinal = whatsapp && whatsapp.startsWith("+598") ? whatsapp : `+598${telefono.replace(/^9/, "")}`;
    console.log("[ef_alta_suscriptor_premium] DEBUG inputs", {
      telefono_raw: telefono,
      whatsapp_raw: whatsapp,
      telefono_type: typeof telefono,
      whatsapp_type: typeof whatsapp,
      telefono_trim: typeof telefono === "string" ? telefono.trim() : telefono,
      whatsapp_trim: typeof whatsapp === "string" ? whatsapp.trim() : whatsapp,
      telefono_digits: String(telefono ?? "").replace(/\D/g, ""),
      whatsapp_digits: String(whatsapp ?? "").replace(/\D/g, "")
    });
    console.log("[ef_alta_suscriptor_premium] DEBUG whatsappFinal", {
      whatsappFinal,
      computed_from: whatsapp && String(whatsapp).trim() ? "whatsapp" : "telefono"
    });
    // ===========================================
    // === LÓGICA DE DUPLICADOS (SIN CAMBIOS) ===
    // ===========================================
    const { data: existentes, error: errorBusqueda } = await supabase.from("suscriptores").select("id, estado_suscripcion").eq("whatsapp", whatsappFinal);
    if (errorBusqueda) {
      await registrarLog(supabase, funcion, "Error buscando duplicado", {
        errorBusqueda
      }, false);
      return new Response(JSON.stringify({
        resultado: "error",
        mensaje: "Error verificando duplicado"
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    if (existentes && existentes.length > 0) {
      const existente = existentes[0];
      if ([
        "activa",
        "activa_provisional"
      ].includes(existente.estado_suscripcion)) {
        await registrarLog(supabase, funcion, "Número duplicado con premium activo", {
          telefono,
          whatsappFinal,
          estado: existente.estado_suscripcion
        }, false);
        return new Response(JSON.stringify({
          resultado: "duplicado",
          mensaje: `El número ${telefono} ya tiene una suscripción activa.`,
          id_suscriptor: existente.id
        }), {
          status: 409,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      // ===========================================
      // === ACTUALIZACIÓN DE SUSCRIPTOR EXISTENTE (SIN CAMBIOS) ===
      // ===========================================
      const { error: errorUpdate } = await supabase.from("suscriptores").update({
        nombre,
        telefono,
        signo,
        contenido_preferido,
        origen,
        whatsapp: whatsappFinal,
        actualizado_en: new Date().toISOString()
      }).eq("id", existente.id);
      if (errorUpdate) {
        await registrarLog(supabase, funcion, "Error actualizando duplicado", {
          errorUpdate
        }, false);
        return new Response(JSON.stringify({
          resultado: "error",
          mensaje: "No se pudo actualizar el suscriptor existente"
        }), {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      await registrarLog(supabase, funcion, "Suscriptor existente actualizado", {
        id: existente.id,
        telefono
      });
      return new Response(JSON.stringify({
        resultado: "ok",
        mensaje: "Suscriptor existente actualizado correctamente",
        id_suscriptor: existente.id
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // ===========================================
    // === INSERCIÓN DE NUEVO SUSCRIPTOR (CORREGIDO) ===
    // ===========================================
    const { data, error } = await supabase.from("suscriptores").insert([
      {
        nombre,
        telefono,
        whatsapp: whatsappFinal,
        signo,
        contenido_preferido,
        tipo_suscripcion: "premium",
        estado_suscripcion: "pendiente_autorizacion",
        fecha_alta: new Date().toISOString().split("T")[0],
        origen,
        id_pago_mp,
        actualizado_en: new Date().toISOString(),
        // --- CAMPOS DE CONSENTIMIENTO ---
        acepto_politicas: acepto_politicas ?? false,
        version_politicas,
        medio_consentimiento,
        ip_consentimiento,
        user_agent,
        fecha_consentimiento
      }
    ]).select().single();
    if (error) {
      await registrarLog(supabase, funcion, "Error insertando suscriptor", {
        error
      }, false);
      console.error("Error detalle insert:", error);
      return new Response(JSON.stringify({
        resultado: "error",
        mensaje: "No se pudo registrar el suscriptor",
        detalle: error.message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    const id_suscriptor = data?.id;
    await registrarLog(supabase, funcion, "Suscriptor registrado OK", {
      id_suscriptor,
      telefono
    });
    return new Response(JSON.stringify({
      resultado: "ok",
      mensaje: "Suscriptor registrado correctamente",
      id_suscriptor
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("Error inesperado en Edge Function:", err);
    if (supabase) {
      await registrarLog(supabase, funcion, "Error inesperado", {
        error: err.message
      }, false);
    }
    return new Response(JSON.stringify({
      resultado: "error",
      mensaje: "Error inesperado en la función"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
