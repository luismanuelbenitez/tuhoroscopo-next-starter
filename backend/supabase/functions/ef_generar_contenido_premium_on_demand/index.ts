// ============================================================================
// === Edge Function: ef_generar_contenido_premium_on_demand ==================
// ============================================================================
// - Genera contenido premium HOY para un suscriptor específico
// - SOLO si no existe aún
// - Reutiliza las funciones OpenAI existentes
// - Devuelve id_contenido
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const FN = "ef_generar_contenido_premium_on_demand";
const EDGE_BASE_URL = Deno.env.get("EDGE_BASE_URL");
const INTERNAL_TOKEN = Deno.env.get("INTERNAL_TOKEN");
function nowUTCISO() {
  return new Date().toISOString();
}
// Fecha YYYY-MM-DD en zona Montevideo
function todayMVD() {
  const d = new Date();
  const fmt = (opt)=>new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Montevideo",
      ...opt
    }).format(d);
  return `${fmt({
    year: "numeric"
  })}-${fmt({
    month: "2-digit"
  })}-${fmt({
    day: "2-digit"
  })}`;
}
async function registrarLog(resultado, detalle = {}, exito = true) {
  try {
    await supabase.from("log_funciones").insert({
      nombre_funcion: FN,
      resultado,
      detalle,
      exito,
      creado_por: "system",
      fecha_registro: nowUTCISO()
    });
  } catch  {}
}
serve(async (req)=>{
  try {
    const body = await req.json();
    const id_suscriptor = Number(body.id_suscriptor);
    if (!id_suscriptor) {
      return new Response(JSON.stringify({
        error: "id_suscriptor requerido"
      }), {
        status: 400
      });
    }
    // -----------------------------------------------------------------------
    // 1) Buscar suscriptor
    // -----------------------------------------------------------------------
    const { data: s, error: errS } = await supabase.from("suscriptores").select("id, nombre, signo, contenido_preferido").eq("id", id_suscriptor).single();
    if (errS || !s) {
      await registrarLog("suscriptor_no_encontrado", {
        id_suscriptor
      }, false);
      return new Response(JSON.stringify({
        error: "Suscriptor no existe"
      }), {
        status: 404
      });
    }
    // -----------------------------------------------------------------------
    // 2) Determinar tipo HOY
    // -----------------------------------------------------------------------
    const hoy = new Date();
    const esDomingo = hoy.getUTCDay() === 0;
    const tipo = esDomingo ? "domingo" : "diario";
    const fechaMVD = todayMVD();
    // -----------------------------------------------------------------------
    // 3) Verificar si ya existe contenido HOY
    // -----------------------------------------------------------------------
    const { data: existente } = await supabase.from("contenido_premium").select("id").eq("id_suscriptor", id_suscriptor).eq("tipo", tipo).gte("fecha_envio_programada", `${fechaMVD}T00:00:00-03:00`).lte("fecha_envio_programada", `${fechaMVD}T23:59:59-03:00`).maybeSingle();
    if (existente?.id) {
      await registrarLog("contenido_ya_existente", {
        id_suscriptor,
        id_contenido: existente.id
      });
      return new Response(JSON.stringify({
        id_contenido: existente.id,
        reutilizado: true
      }), {
        status: 200
      });
    }
    // -----------------------------------------------------------------------
    // 4) Generar contenido vía OpenAI
    // -----------------------------------------------------------------------
    const endpointIA = esDomingo ? "ef_openia_genera_contenido_premium_domingo" : "ef_openia_genera_contenido_premium";
    const prompt = `
Actuá como astrólogo contemporáneo, empático y enfocado en bienestar emocional.

Usuario:
- Nombre: ${s.nombre}
- Preferencia: ${s.contenido_preferido}

Reglas:
- No mencionar el signo.
- Estilo cercano, claro y emocional.
- JSON estricto con 7 campos.
`;
    const respIA = await fetch(`${EDGE_BASE_URL}/${endpointIA}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${INTERNAL_TOKEN}`
      },
      body: JSON.stringify({
        prompt
      })
    });
    if (!respIA.ok) {
      const txt = await respIA.text();
      await registrarLog("error_openai", {
        txt
      }, false);
      return new Response(JSON.stringify({
        error: "Fallo OpenAI"
      }), {
        status: 502
      });
    }
    const contenido = await respIA.json();
    // -----------------------------------------------------------------------
    // 5) Guardar contenido
    // -----------------------------------------------------------------------
    const { data: nuevo, error: errIns } = await supabase.from("contenido_premium").insert({
      id_suscriptor,
      tipo,
      fecha_envio_programada: nowUTCISO(),
      estado_envio: "pendiente",
      contenido
    }).select().single();
    if (errIns) {
      await registrarLog("error_insert_contenido", {
        errIns
      }, false);
      return new Response(JSON.stringify({
        error: "No se pudo guardar"
      }), {
        status: 500
      });
    }
    await registrarLog("contenido_generado_on_demand", {
      id_suscriptor,
      id_contenido: nuevo.id,
      tipo
    });
    return new Response(JSON.stringify({
      id_contenido: nuevo.id,
      generado: true
    }), {
      status: 200
    });
  } catch (e) {
    await registrarLog("fatal_exception", {
      error: String(e)
    }, false);
    return new Response(JSON.stringify({
      error: "Error interno"
    }), {
      status: 500
    });
  }
});
