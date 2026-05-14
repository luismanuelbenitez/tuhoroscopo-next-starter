// Edge Function: ef_genera_guarda_contenido_gratis
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// --- CONFIGURABLES ---
const MAX_LLAMADAS_IA = 12; // Límite de signos por ejecución
const FUNCION = "ef_genera_guarda_contenido_gratis";
const TIMEOUT_FETCH = 15000;
// --- UTILS ---
function fetchWithTimeout(resource, options = {}, timeout = TIMEOUT_FETCH) {
  return Promise.race([
    fetch(resource, options),
    new Promise((_, reject)=>setTimeout(()=>reject(new Error("Timeout en fetch")), timeout))
  ]);
}
function getFechaMontevideoISO() {
  const ahoraUTC = new Date();
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(ahoraUTC);
  const anio = parts.find((p)=>p.type === "year")?.value;
  const mes = parts.find((p)=>p.type === "month")?.value;
  const dia = parts.find((p)=>p.type === "day")?.value;
  return `${anio}-${mes}-${dia}`;
}
function getNumeroSemana(fechaISO) {
  const fecha = new Date(fechaISO);
  const temp = new Date(fecha.valueOf());
  const diaSemana = (fecha.getUTCDay() + 6) % 7;
  temp.setUTCDate(temp.getUTCDate() - diaSemana + 3);
  const primerJueves = new Date(temp.getUTCFullYear(), 0, 4);
  const diferencia = temp.valueOf() - primerJueves.valueOf();
  return 1 + Math.round(diferencia / (7 * 24 * 60 * 60 * 1000));
}
// --- LOGGING ---
async function registrarLog(supabase, resultado, detalle = {}, exito = true) {
  try {
    await supabase.from("log_funciones").insert([
      {
        nombre_funcion: FUNCION,
        resultado,
        detalle,
        exito,
        creado_por: "system",
        fecha_ejecucion: new Date().toISOString()
      }
    ]);
  } catch (_) {
  // No cortamos la función por un error de logging
  }
}
// --- MAIN ---
serve(async (req)=>{
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  let logResultado = "OK";
  let logDetalle = {};
  let logExito = true;
  try {
    let body = {};
    try {
      body = await req.json();
    } catch (e) {
      logResultado = "JSON inválido";
      logDetalle = {
        error: e.message
      };
      logExito = false;
      await registrarLog(supabase, logResultado, logDetalle, logExito);
      return new Response(JSON.stringify({
        error: logResultado
      }), {
        status: 400
      });
    }
    // Fecha objetivo y ciclo de semana
    const fechaObjetivo = body?.fecha || getFechaMontevideoISO();
    const cicloSemana = getNumeroSemana(fechaObjetivo).toString();
    // 1. Obtener todos los signos activos "gratis"
    const { data: suscriptores, error: errorSuscriptores } = await supabase.from("suscriptores").select("signo").eq("tipo_suscripcion", "gratis").eq("estado_suscripcion", "activa");
    if (errorSuscriptores) {
      logResultado = "Error consultando suscriptores";
      logDetalle = {
        error: errorSuscriptores.message
      };
      logExito = false;
      await registrarLog(supabase, logResultado, logDetalle, logExito);
      return new Response(JSON.stringify({
        error: logResultado
      }), {
        status: 500
      });
    }
    const signosUnicos = [
      ...new Set(suscriptores.map((s)=>s.signo).filter(Boolean))
    ];
    if (!signosUnicos.length) {
      logResultado = "No hay signos gratis activos";
      logDetalle = {};
      logExito = false;
      await registrarLog(supabase, logResultado, logDetalle, logExito);
      return new Response(JSON.stringify({
        error: logResultado
      }), {
        status: 500
      });
    }
    // 2. Emociones
    const { data: emociones, error: errorEmociones } = await supabase.from("emocion_dominante").select("nombre");
    if (errorEmociones || !emociones?.length) {
      logResultado = "No hay emociones disponibles";
      logDetalle = {
        error: errorEmociones?.message || "Vacío"
      };
      logExito = false;
      await registrarLog(supabase, logResultado, logDetalle, logExito);
      return new Response(JSON.stringify({
        error: logResultado
      }), {
        status: 500
      });
    }
    // 3. Plantilla
    const { data: plantilla } = await supabase.from("plantillas").select("contenido").eq("nombre", "prompt_contenido_gratis").maybeSingle();
    if (!plantilla?.contenido) {
      logResultado = "Plantilla no encontrada";
      logDetalle = {};
      logExito = false;
      await registrarLog(supabase, logResultado, logDetalle, logExito);
      return new Response(JSON.stringify({
        error: logResultado
      }), {
        status: 500
      });
    }
    // --- Procesamiento por signo ---
    let llamadasHechasIA = 0;
    const resultados = [];
    for (const signo of signosUnicos){
      // 1. ¿Ya existe contenido para ese día/signo?
      const { data: existente, error: errorExistente } = await supabase.from("contenido_gratis").select("id").eq("fecha_envio_programada", fechaObjetivo).eq("signo", signo).maybeSingle();
      if (errorExistente) {
        resultados.push({
          signo,
          estado: "error_existencia",
          detalle: errorExistente.message
        });
        continue;
      }
      if (existente) {
        resultados.push({
          signo,
          estado: "ya_existe"
        });
        continue;
      }
      if (llamadasHechasIA >= MAX_LLAMADAS_IA) {
        resultados.push({
          signo,
          estado: "limite_llamadas_ia"
        });
        continue;
      }
      // 2. Emoción random
      const emocionDominante = emociones[Math.floor(Math.random() * emociones.length)].nombre;
      // 3. Prompt
      const prompt = plantilla.contenido.replaceAll("{{signo}}", signo).replaceAll("{{fecha}}", fechaObjetivo).replaceAll("{{emocion_dominante}}", emocionDominante);
      // 4. Llamada IA
      let generado;
      try {
        llamadasHechasIA++;
        const responseIA = await fetchWithTimeout(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ef_openia_genera_contenido_gratis`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
          },
          body: JSON.stringify({
            prompt
          })
        }, TIMEOUT_FETCH);
        if (!responseIA.ok) {
          const errorText = await responseIA.text();
          throw new Error(`Error HTTP IA: ${errorText}`);
        }
        generado = await responseIA.json();
        if (!generado?.horoscopo || !generado?.frase_motivadora) {
          throw new Error("Respuesta IA inválida: " + JSON.stringify(generado));
        }
      } catch (e) {
        resultados.push({
          signo,
          estado: "error_ia",
          detalle: e.message
        });
        continue;
      }
      // 5. Insertar en contenido_gratis
      try {
        const bodyAlta = {
          signo,
          contenido: {
            horoscopo: generado.horoscopo,
            frase_motivadora: generado.frase_motivadora
          },
          emocion_dominante: emocionDominante,
          ciclo_semana: cicloSemana,
          fecha_envio_programada: fechaObjetivo,
          fecha_creacion: fechaObjetivo,
          origen: FUNCION
        };
        const responseAlta = await fetchWithTimeout(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ef_alta_contenido_gratis`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
          },
          body: JSON.stringify(bodyAlta)
        }, TIMEOUT_FETCH);
        if (!responseAlta.ok) {
          const errorText = await responseAlta.text();
          throw new Error(`Error HTTP alta: ${errorText}`);
        }
        const insertado = await responseAlta.json();
        if (insertado.resultado === "ok") {
          resultados.push({
            signo,
            estado: "generado",
            id: insertado.id_contenido
          });
        } else if (insertado.resultado === "ya_existe") {
          resultados.push({
            signo,
            estado: "ya_existe"
          });
        } else {
          // Nuevo: solo mostrar lo relevante del error para el detalle
          let errorMsg = "Respuesta inesperada";
          if (insertado.mensaje) errorMsg += `: ${insertado.mensaje}`;
          else if (insertado.error) errorMsg += `: ${insertado.error}`;
          else if (insertado.resultado) errorMsg += `: ${insertado.resultado}`;
          resultados.push({
            signo,
            estado: "error_guardado",
            detalle: errorMsg
          });
        }
      } catch (e) {
        resultados.push({
          signo,
          estado: "error_guardado",
          detalle: e.message
        });
        continue;
      }
    } // --- FIN for signos ---
    // Log único del proceso global:
    logResultado = "Proceso finalizado";
    logDetalle = {
      fecha_envio_programada: fechaObjetivo,
      ciclo_semana: cicloSemana,
      total_signos: signosUnicos.length,
      max_llamadas_ia: MAX_LLAMADAS_IA,
      llamadas_ia_usadas: llamadasHechasIA,
      resultados
    };
    logExito = true;
    await registrarLog(supabase, logResultado, logDetalle, logExito);
    return new Response(JSON.stringify({
      fecha_envio_programada: fechaObjetivo,
      ciclo_semana: cicloSemana,
      total_signos: signosUnicos.length,
      max_llamadas_ia: MAX_LLAMADAS_IA,
      llamadas_ia_usadas: llamadasHechasIA,
      resultados
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    // Log único de error crítico:
    logResultado = "Error inesperado";
    logDetalle = {
      error: e.message
    };
    logExito = false;
    await registrarLog(supabase, logResultado, logDetalle, logExito);
    return new Response(JSON.stringify({
      error: logResultado,
      detalle: e.message
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
