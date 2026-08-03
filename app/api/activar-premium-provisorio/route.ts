import { NextResponse } from "next/server";

// === FUNCIONES AUXILIARES ===

/**
 * Calcula la fecha de vencimiento añadiendo un mes exacto a la fecha de inicio.
 */
const getFechaVencimientoMensual = (startDate: Date): string => {
  const nextMonth = new Date(startDate);
  // Añade 1 mes a la fecha de inicio
  nextMonth.setMonth(startDate.getMonth() + 1); 
  return nextMonth.toISOString();
};

/**
 * Registra un evento en la tabla log_funciones de Supabase.
 */
async function logFunction(supabaseUrl: string, serviceKey: string, logData: any) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/log_funciones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify([logData]),
    });
  } catch (error) {
    // Si el log falla, solo imprimimos el error, pero no bloqueamos el flujo principal.
    console.error("Error al registrar log de función:", error); 
  }
}

// === API ROUTE PRINCIPAL (LÓGICA CORREGIDA) ===

export async function POST(req: Request) {
  const currentTimestamp = new Date();
  const logDetails = { creado_por: "backurl-provisional" }; // Log con nuevo nombre

  // 1. EXTRAER y VALIDAR Parámetros de Entrada (CORREGIDO)
  try {
    // CORRECCIÓN: Solo leemos los campos que el frontend SÍ envía
    const { id_suscriptor, preapproval_id } = await req.json();

    // CORRECCIÓN: Validamos solo esos dos campos
    if (!id_suscriptor || !preapproval_id) {
      await logFunction(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
          nombre_funcion: "backurl-provisional",
          resultado: "ERROR_PARAMS",
          detalle: { error: "Faltan id_suscriptor o preapproval_id", campos_recibidos: { id_suscriptor, preapproval_id } },
          exito: false, ...logDetails
      });
      return NextResponse.json(
        { ok: false, error: "Faltan id_suscriptor o preapproval_id" },
        { status: 400 }
      );
    }

    // 2. Validar Variables de Entorno
    const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SECRET_KEY) {
      return NextResponse.json(
        { ok: false, error: "Faltan variables de entorno de Supabase" },
        { status: 500 }
      );
    }
    
    const supabaseUrl = NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = SUPABASE_SECRET_KEY;
    
    // 3. Definir Cuerpo de Actualización (LÓGICA CORREGIDA: Siempre provisional)
    // Esta función solo da acceso inmediato. El webhook confirmará.
    const updateBody: Record<string, any> = {
      estado_suscripcion: "activa_provisional",
      premium_activo: true, // ¡Le damos acceso ya!
      premium_pendiente_confirmacion: true, // Queda pendiente hasta el webhook
      preapproval_id,
      preapproval_status: "authorized", // Asumimos autorizado porque MP lo redirigió
      preapproval_actualizado_en: currentTimestamp.toISOString(),
      auto_renovacion_activa: true, 
      fecha_inicio_premium: currentTimestamp.toISOString(), // Seteamos fechas provisorias
      fecha_vencimiento_premium: getFechaVencimientoMensual(currentTimestamp),
    };

    // 4. Ejecutar PATCH en Supabase
    const r = await fetch(
      `${supabaseUrl}/rest/v1/suscriptores?id=eq.${id_suscriptor}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify(updateBody),
      }
    );

    // 5. Manejo de error de Supabase
    if (!r.ok) {
      const err = await r.text();
      console.error("❌ Error actualizando suscriptor en Supabase (Provisional):", err);
      await logFunction(supabaseUrl, serviceKey, {
        nombre_funcion: "backurl-provisional",
        resultado: "ERROR_DB",
        detalle: { id_suscriptor, preapproval_id, error: err },
        exito: false, ...logDetails
      });
      return NextResponse.json({ ok: false, error: "Error en Supabase" }, { status: 500 });
    }

    const data = await r.json();

    // 6. Registrar log de función exitoso
    await logFunction(supabaseUrl, serviceKey, {
      nombre_funcion: "backurl-provisional",
      resultado: "OK_ACTIVACION_PROVISIONAL",
      detalle: { id_suscriptor, preapproval_id, estado_final: updateBody.estado_suscripcion },
      exito: true, ...logDetails
    });

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("❌ Error en la ruta backurl-provisional:", e);
    return NextResponse.json({ ok: false, error: "Error interno del servidor" }, { status: 500 });
  }
}