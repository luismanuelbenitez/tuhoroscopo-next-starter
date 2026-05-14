/**
 * Registra un log en la tabla log_funciones de Supabase.
 * @param supabase Instancia del cliente Supabase
 * @param nombreFuncion Nombre identificador de la función
 * @param resultado Texto resumen del resultado (ej: "OK", "ERROR", etc.)
 * @param detalle Objeto con información adicional (json)
 * @param exito Booleano: true si fue exitoso, false si falló
 * @param creadoPor Texto opcional indicando quién ejecutó (ej: 'system', 'usuario', etc.)
 */ export async function registrarLog(supabase, nombreFuncion, resultado, detalle = {}, exito = true, creadoPor = 'system') {
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
    if (error) {
      console.error('Error al guardar el log:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Excepción al intentar guardar log:', err);
    return false;
  }
}
