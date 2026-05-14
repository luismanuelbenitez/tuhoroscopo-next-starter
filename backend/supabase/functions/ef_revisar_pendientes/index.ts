// ============================================================
// === Archivo: ef_procesar_vencimientos/index.ts
// === Descripción: Tarea programada (Cron Job) para
// === desactivar el premium a usuarios que cancelaron
// === y cuya fecha de vencimiento ya ha pasado.
// === (Versión Optimizada con 1 sola query)
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// 🔹 Helper para logging (sin cambios)
async function registrarLog(supabase, nombreFuncion, resultado, detalle = {}, exito = true, creadoPor = "system_cron") {
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
    }
  } catch (err) {
    console.error("Excepción al intentar guardar log:", err);
  }
}
serve(async (req)=>{
  const funcion = "ef_procesar_vencimientos";
  let supabase;
  try {
    // ===========================================
    // === INICIALIZACIÓN Y VALIDACIÓN DE ENV ===
    // ===========================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      console.error("Error fatal: Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
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
    await registrarLog(supabase, funcion, "START", {
      message: "Iniciando barrido de vencimientos..."
    });
    // ===========================================
    // === LÓGICA OPTIMIZADA (1 SOLA QUERY) ===
    // ===========================================
    //
    // En lugar de SELECT y luego UPDATE, combinamos todo en una sola
    // operación atómica de UPDATE...WHERE que también devuelve los datos.
    //
    const { data: updatedData, error: updateError } = await supabase.from("suscriptores").update({
      premium_activo: false,
      estado_suscripcion: "vencida" // O 'expirada'
    })// Los filtros del SELECT van directo al UPDATE:
    .eq("premium_activo", true).eq("auto_renovacion_activa", false) // <-- Clave: Solo los que cancelaron
    .lt("fecha_vencimiento_premium", new Date().toISOString()) // <-- Vencimiento es menor que AHORA
    .select("id"); // Devuelve los IDs actualizados
    if (updateError) {
      throw new Error(`Error al actualizar vencidos: ${updateError.message}`);
    }
    // Verificamos si la operación afectó a alguna fila
    if (!updatedData || updatedData.length === 0) {
      await registrarLog(supabase, funcion, "OK_NO_VENCIDOS", {
        message: "No se encontraron suscriptores para expirar."
      });
      return new Response(JSON.stringify({
        resultado: "ok",
        mensaje: "No hay vencimientos para procesar."
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // Si llegamos aquí, es que sí se actualizaron filas
    await registrarLog(supabase, funcion, "OK_PROCESADOS", {
      count: updatedData.length,
      ids_actualizados: updatedData.map((s)=>s.id)
    });
    return new Response(JSON.stringify({
      resultado: "ok",
      mensaje: `Procesados ${updatedData.length} vencimientos.`,
      actualizados: updatedData.map((s)=>s.id)
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("Error inesperado en ef_procesar_vencimientos:", err);
    if (supabase) {
      await registrarLog(supabase, funcion, "EXCEPTION", {
        error: err.message
      }, false);
    }
    return new Response(JSON.stringify({
      resultado: "error",
      mensaje: "Error inesperado en la función",
      detalle: err.message
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
