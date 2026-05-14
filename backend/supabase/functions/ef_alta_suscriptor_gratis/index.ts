import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Función para registrar logs
async function registrarLog(supabase, nombreFuncion, resultado, detalle = {}, exito = true, creadoPor = 'system') {
  const { error } = await supabase.from('log_funciones').insert([
    {
      nombre_funcion: nombreFuncion,
      resultado,
      detalle,
      exito,
      creado_por: creadoPor
    }
  ]);
  if (error) console.error('Error al guardar el log:', error);
}
serve(async (req)=>{
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'));
  const funcion = 'alta_suscriptor_gratis';
  let body;
  try {
    body = await req.json();
  } catch (e) {
    await registrarLog(supabase, funcion, 'JSON inválido', {
      error: e.message
    }, false);
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'JSON inválido'
    }), {
      status: 400
    });
  }
  const { nombre, email, telefono, signo, fecha_nacimiento, preferencia_cosmica, origen = 'web' } = body;
  if (!nombre || !telefono || !signo) {
    await registrarLog(supabase, funcion, 'Datos faltantes', {
      nombre,
      telefono,
      signo
    }, false);
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'Faltan datos obligatorios: nombre, telefono o signo'
    }), {
      status: 400
    });
  }
  const whatsapp = '+598' + telefono.slice(1);
  // Validar duplicado
  const { data: existente, error: errorBusqueda } = await supabase.from('suscriptores').select('id').eq('whatsapp', whatsapp).maybeSingle();
  if (errorBusqueda) {
    await registrarLog(supabase, funcion, 'Error al buscar duplicado', {
      error: errorBusqueda.message
    }, false);
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'No se pudo verificar si el número ya está registrado'
    }), {
      status: 500
    });
  }
  if (existente) {
    const mensaje = `El número ${telefono} ya está registrado como suscriptor.`;
    await registrarLog(supabase, funcion, 'Número duplicado', {
      telefono,
      whatsapp
    }, false);
    return new Response(JSON.stringify({
      resultado: 'duplicado',
      mensaje
    }), {
      status: 409
    });
  }
  // Insertar nuevo suscriptor
  const { data, error } = await supabase.from('suscriptores').insert([
    {
      nombre,
      email,
      telefono,
      whatsapp,
      signo,
      fecha_nacimiento,
      preferencia_cosmica,
      tipo_suscripcion: 'gratis',
      estado_suscripcion: 'activa',
      fecha_alta: new Date().toISOString().split('T')[0],
      origen,
      token_wa_asociado: null,
      id_usuario_wa: null
    }
  ]).select();
  if (error) {
    await registrarLog(supabase, funcion, 'Error al insertar suscriptor', {
      error: error.message
    }, false);
    return new Response(JSON.stringify({
      resultado: 'error',
      mensaje: 'Error al registrar el suscriptor'
    }), {
      status: 500
    });
  }
  const id_suscriptor = data?.[0]?.id || null;
  await registrarLog(supabase, funcion, 'Suscripción gratuita registrada correctamente', {
    id: id_suscriptor
  });
  return new Response(JSON.stringify({
    resultado: 'ok',
    mensaje: 'Suscripción gratuita registrada correctamente',
    id_suscriptor
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
