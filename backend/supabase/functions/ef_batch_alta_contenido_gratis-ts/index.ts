// Edge Function: ef_batch_alta_contenido_gratis
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
serve(async (req)=>{
  const funcion = 'ef_batch_alta_contenido_gratis';
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  async function registrarLog(nombreFuncion, resultado, detalle = {}, exito = true, creadoPor = 'system') {
    try {
      const { error } = await supabase.from('log_funciones').insert([
        {
          nombre_funcion: nombreFuncion,
          resultado,
          detalle,
          exitoso: exito,
          creado_por: creadoPor
        }
      ]);
      if (error) console.error('❌ Error al guardar log:', error.message);
    } catch (e) {
      console.error('❌ Excepción al guardar log:', e.message);
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
      status: 400
    });
  }
  const { entradas = [], origen = 'desconocido' } = body;
  if (!Array.isArray(entradas) || entradas.length === 0) {
    return new Response(JSON.stringify({
      error: 'Entradas vacías o mal formateadas'
    }), {
      status: 400
    });
  }
  const resultados = [];
  let todosGenerados = true;
  for (const entrada of entradas){
    const { contenido, fecha_envio_programada, emocion_dominante, ciclo_semana, signo } = entrada;
    if (!contenido || !contenido.horoscopo || !contenido.frase_motivadora || !fecha_envio_programada || !emocion_dominante || !ciclo_semana || !signo) {
      await registrarLog(funcion, 'Faltan campos obligatorios', {
        entrada,
        origen
      }, false);
      resultados.push({
        signo,
        estado: 'error: faltan campos'
      });
      todosGenerados = false;
      continue;
    }
    const fecha_creacion = new Date().toISOString().split('T')[0];
    const { data: existente, error: errorExist } = await supabase.from('contenido_gratis').select('id').eq('fecha_envio_programada', fecha_envio_programada).eq('signo', signo).maybeSingle();
    if (errorExist) {
      await registrarLog(funcion, 'Error al verificar duplicado', {
        signo,
        fecha_envio_programada,
        error: errorExist.message,
        origen
      }, false);
      resultados.push({
        signo,
        estado: 'error al verificar duplicado'
      });
      todosGenerados = false;
      continue;
    }
    if (existente) {
      await registrarLog(funcion, 'Contenido ya existente', {
        funcion,
        origen,
        signo,
        fecha_envio_programada,
        resultado: 'duplicado'
      }, false);
      resultados.push({
        signo,
        estado: 'contenido ya existe'
      });
      todosGenerados = false;
      continue;
    }
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
      resultados.push({
        signo,
        estado: 'error al guardar'
      });
      todosGenerados = false;
      continue;
    }
    const resultadoDetalle = {
      funcion,
      origen,
      id_contenido: insertado.id,
      signo,
      fecha_envio_programada,
      resultado: 'contenido generado'
    };
    await registrarLog(funcion, 'Contenido guardado correctamente', resultadoDetalle, true);
    resultados.push({
      signo,
      estado: 'contenido generado'
    });
  }
  const resultadoFinal = {
    resultado: todosGenerados ? 'ok' : 'ok_con_observaciones',
    signos_procesados: resultados
  };
  return new Response(JSON.stringify(resultadoFinal), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
