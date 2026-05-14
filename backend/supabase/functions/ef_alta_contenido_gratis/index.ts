// Edge Function: ef_alta_contenido_gratis
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// NUEVO: función para fecha y hora de Montevideo en ISO
function getFechaHoraMontevideoISO() {
  const ahora = new Date();
  const opciones = {
    timeZone: 'America/Montevideo',
    hour12: false
  };
  const fecha = ahora.toLocaleDateString('sv-SE', opciones);
  const hora = ahora.toLocaleTimeString('sv-SE', opciones);
  return `${fecha}T${hora}`;
}
serve(async (req)=>{
  const funcion = 'ef_alta_contenido_gratis';
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  async function registrarLog(nombreFuncion, resultado, detalle = {}, exito = true, creadoPor = 'system') {
    try {
      const { error } = await supabase.from('log_funciones').insert([
        {
          nombre_funcion: nombreFuncion,
          resultado,
          detalle,
          exito,
          creado_por: creadoPor
        }
      ]);
      if (error) console.error(`❌ Error al insertar log:`, error.message);
    } catch (e) {
      console.error(`❌ Excepción al insertar log:`, e.message);
    }
  }
  let body;
  try {
    body = await req.json();
  } catch (e) {
    await registrarLog(funcion, 'JSON inválido', {
      error: e.message
    }, false);
    return new Response(JSON.stringify({
      error: 'JSON inválido'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  const { contenido, fecha_envio_programada, emocion_dominante, ciclo_semana, signo, origen = 'desconocido' } = body;
  if (!contenido || !contenido.horoscopo || !contenido.frase_motivadora || !fecha_envio_programada || !emocion_dominante || !ciclo_semana || !signo) {
    await registrarLog(funcion, 'Faltan campos obligatorios', {
      ...body,
      origen
    }, false);
    return new Response(JSON.stringify({
      error: 'Faltan campos obligatorios'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // CAMBIADO: obtener fecha y hora de Montevideo
  const fecha_creacion = getFechaHoraMontevideoISO();
  // Verificar si ya existe
  const { data: existente, error: errorExistencia } = await supabase.from('contenido_gratis').select('id').eq('fecha_envio_programada', fecha_envio_programada).eq('signo', signo).maybeSingle();
  if (errorExistencia) {
    await registrarLog(funcion, 'Error al verificar duplicado', {
      signo,
      fecha_envio_programada,
      error: errorExistencia.message,
      origen
    }, false);
    return new Response(JSON.stringify({
      error: 'Error al verificar existencia previa'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  if (existente) {
    await registrarLog(funcion, 'Contenido ya existente', {
      funcion,
      origen,
      signo,
      fecha_envio_programada,
      resultado: 'duplicado'
    }, false);
    return new Response(JSON.stringify({
      resultado: 'ya_existe',
      mensaje: 'Ya existe contenido para esta fecha y signo',
      signo,
      fecha_envio_programada
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // Insertar
  const { data: insertado, error: errorInsert } = await supabase.from('contenido_gratis').insert([
    {
      contenido,
      generado: true,
      generado_por: 'chatgpt',
      emocion_dominante,
      ciclo_semana,
      fecha_envio_programada,
      fecha_creacion,
      signo
    }
  ]).select('id').single();
  if (errorInsert) {
    await registrarLog(funcion, 'Error al insertar contenido', {
      funcion,
      origen,
      signo,
      fecha_envio_programada,
      error: errorInsert.message
    }, false);
    return new Response(JSON.stringify({
      error: 'No se pudo guardar el contenido'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // Log exitoso
  const resultadoDetalle = {
    funcion,
    origen,
    id_contenido: insertado.id,
    signo,
    fecha_envio_programada,
    resultado: 'ok'
  };
  await registrarLog(funcion, 'Contenido gratis guardado', resultadoDetalle, true);
  return new Response(JSON.stringify({
    resultado: 'ok',
    ...resultadoDetalle
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
