// Edge Function: ef_renovar_premium_individual
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
serve(async (req)=>{
  const funcion = 'ef_renovar_premium_individual';
  let body;
  try {
    body = await req.json();
  } catch (error) {
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'JSON inválido'
    }), {
      status: 400
    });
  }
  const { id_suscriptor, meses = 1 } = body;
  if (!id_suscriptor) {
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'Falta el campo requerido: id_suscriptor'
    }), {
      status: 400
    });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  async function registrarLog(resultado, detalle = {}, exito = true, creadoPor = 'system') {
    const { error } = await supabase.from('log_funciones').insert([
      {
        nombre_funcion: funcion,
        resultado,
        detalle,
        exito,
        creado_por: creadoPor
      }
    ]);
    if (error) console.error('Error al registrar log:', error);
  }
  try {
    const { data: suscriptores, error: errorBusqueda } = await supabase.from('suscriptores').select('*').eq('id', id_suscriptor).eq('tipo_suscripcion', 'premium').eq('estado_suscripcion', 'activa').limit(1);
    if (errorBusqueda || !suscriptores || suscriptores.length === 0) {
      const msg = 'Suscriptor no encontrado o no es premium activo';
      await registrarLog(msg, {
        id_suscriptor
      }, false);
      return new Response(JSON.stringify({
        resultado: 'error',
        mensaje: msg
      }), {
        status: 404
      });
    }
    const suscriptor = suscriptores[0];
    const nuevaFecha = new Date(suscriptor.fecha_vencimiento_premium);
    nuevaFecha.setMonth(nuevaFecha.getMonth() + meses);
    const { error: errorUpdate } = await supabase.from('suscriptores').update({
      fecha_vencimiento_premium: nuevaFecha.toISOString().split('T')[0]
    }).eq('id', id_suscriptor);
    if (errorUpdate) {
      await registrarLog('Error actualizando vencimiento', {
        id_suscriptor,
        errorUpdate
      }, false);
      return new Response(JSON.stringify({
        resultado: 'error',
        mensaje: 'No se pudo actualizar la fecha de vencimiento'
      }), {
        status: 500
      });
    }
    await registrarLog('Renovación realizada correctamente', {
      id_suscriptor,
      meses
    });
    return new Response(JSON.stringify({
      resultado: 'ok',
      mensaje: 'Suscripción renovada exitosamente',
      nueva_fecha_vencimiento: nuevaFecha.toISOString().split('T')[0]
    }), {
      status: 200
    });
  } catch (error) {
    await registrarLog('Error inesperado', {
      error: error.message
    }, false);
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'Error inesperado al renovar suscripción'
    }), {
      status: 500
    });
  }
});
