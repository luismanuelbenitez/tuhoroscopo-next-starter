// ============================================================
// === Archivo: app/api/iniciar-checkout/route.ts
// === Descripción: API Route unificada (Serverless Function)
// ===              para manejar el proceso de checkout completo.
// ===              1. Recibe datos del formulario.
// ===              2. Llama a EF para alta/update de suscriptor.
// ===              3. Llama a EF para crear preapproval en MP.
// ===              4. Devuelve el init_point de MP al frontend.
// ============================================================
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { UAParser } from 'ua-parser-js'; // Para parsear User Agent

// ===========================================
// === CONSTANTES Y CONFIGURACIÓN ===
// ===========================================

// Define los campos que esperamos recibir obligatoriamente desde el frontend
const REQUIRED_FIELDS = [
  'nombre',
  'telefono', // Normalizado (9 dígitos, empieza con 9)
  'signo',
  'contenido_preferido',
  'whatsapp', // Formato E.164 (+598...)
  'acepto_politicas',
] as const;

// Flag para activar logs detallados durante el desarrollo/depuración
const DEBUG_LOGS = true;

// ===========================================
// === HANDLER PRINCIPAL (POST) ===
// ===========================================
export async function POST(req: Request) {
  const funcion = 'api_iniciar_checkout'; // Identificador para logs
  if (DEBUG_LOGS) console.log(`🚀 [${funcion}] Función POST iniciada.`);

  try {
    // --- Parseo del Body ---
    // Intentamos parsear el JSON del body. Si falla, body será null.
    const body = await req.json().catch(() => null);
    if (DEBUG_LOGS) console.log(`🔍 [${funcion}] Body recibido:`, body);

    // Si no hay body, retornamos error temprano.
    if (!body) {
        console.error(`❌ [${funcion}] Body vacío o inválido.`);
        return NextResponse.json({ resultado: 'error', mensaje: 'No se recibieron datos' }, { status: 400 });
    }

    // --- Validación de Campos Requeridos ---
    // Iteramos sobre los campos definidos como obligatorios.
    for (const k of REQUIRED_FIELDS) {
      // Verificamos si el campo falta, es null o es un string vacío.
      // Hacemos una excepción para 'acepto_politicas' que puede ser 'false' antes de la validación específica.
      if (body?.[k] === undefined || body?.[k] === null || (typeof body?.[k] === 'string' && body?.[k].trim() === '')) {
        // Si no es el caso especial de 'acepto_politicas' siendo false, es un error.
        if (k !== 'acepto_politicas' || body?.[k] !== false) {
          console.error(`❌ [${funcion}] Falta campo obligatorio o está vacío:`, k, 'Body:', body);
          return NextResponse.json({ resultado: 'error', mensaje: `Falta ${k}` }, { status: 400 });
        }
      }
    }
    // Verificación específica para 'acepto_politicas'. Debe ser true.
    if (body?.acepto_politicas !== true) {
      console.error(`❌ [${funcion}] Política no aceptada:`, 'acepto_politicas:', body?.acepto_politicas);
      return NextResponse.json({ resultado: 'error', mensaje: `Debe aceptar la política de privacidad` }, { status: 400 });
    }

    // --- Lectura de Variables de Entorno ---
    // Obtenemos las URLs y claves necesarias desde las variables de entorno.
    const SUPABASE_URL_SERVER = process.env.SUPABASE_URL;
    const SRK = process.env.SUPABASE_SECRET_KEY;

    // Verificamos que las variables críticas existan.
    if (!SUPABASE_URL_SERVER || !SRK) {
      console.error(`❌ [${funcion}] Variables de entorno del SERVIDOR faltantes`);
      return NextResponse.json({ resultado: 'error', mensaje: 'Error de configuración del servidor [ENV]' }, { status: 500 });
    }
    // Construimos la URL base para llamar a las Edge Functions.
    const EDGE_BASE_URL = `${SUPABASE_URL_SERVER}/functions/v1`;

    // --- Preparación de Datos de Consentimiento ---
    // Extraemos información relevante de las cabeceras de la petición.
    const headersList = headers();
    const forwardedFor = headersList.get('x-forwarded-for'); // IP del cliente (puede tener proxies)
    const ip = forwardedFor?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '0.0.0.0'; // Intentamos obtener la IP real
    const fechaConsentimiento = new Date().toISOString(); // Fecha/hora actual en formato ISO
    const rawUserAgent = headersList.get('user-agent') || 'desconocido'; // Cadena User Agent cruda

    // Parseamos el User Agent para obtener información estructurada.
    const parser = new UAParser(rawUserAgent);
    const uaInfo = parser.getResult();
    // Creamos un string más legible con la información parseada.
    const userAgentLimpio = `${uaInfo.browser.name || 'N/D'} ${uaInfo.browser.version || ''} (${uaInfo.os.name || 'N/D'} ${uaInfo.os.version || ''})`;

    // ===========================================
    // === PASO 1: LLAMADA A EF ALTA SUSCRIPTOR ===
    // ===========================================
    const urlAlta = `${EDGE_BASE_URL}/ef_alta_suscriptor_premium`;

    // Construimos el payload específico que espera la Edge Function de alta.
    const payloadAlta = {
      nombre: body.nombre,
      telefono: body.telefono, // Ya normalizado (9 dígitos)
      signo: body.signo,
      contenido_preferido: body.contenido_preferido,
      whatsapp: body.whatsapp, // Formato E.164
      pais: body.pais || 'UY', // Usar valor del body o default 'UY'
      fuente: body.fuente || 'web-checkout-v2', // Usar valor del body o default
      acepto_politicas: body.acepto_politicas,
      version_politicas: body.version_politica || 'v1.0', // Asegurar plural
      medio_consentimiento: body.fuente || 'web-checkout-v2', // Similar a fuente
      ip_consentimiento: ip,
      user_agent: userAgentLimpio,
      fecha_consentimiento: fechaConsentimiento,
      tipo_suscripcion: 'premium', // Fijo para este flujo
    };
    // No necesitamos monto/moneda para el alta, los quitamos si venían del frontend
    delete (payloadAlta as any).monto;
    delete (payloadAlta as any).moneda;

    if (DEBUG_LOGS) console.log(`🌐 [${funcion}] Llamando a ${urlAlta}...`);
    if (DEBUG_LOGS) console.log(`📦 [${funcion}] Payload para alta:`, payloadAlta);

    // Realizamos la llamada a la Edge Function usando fetch.
    const resAlta = await fetch(urlAlta, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SRK}`, // Autenticación Service Role Key
        },
        body: JSON.stringify(payloadAlta),
        cache: 'no-store', // No cachear esta respuesta
    });

    let dataAlta;
    // --- Manejo de Respuesta de Alta Suscriptor ---
    if (!resAlta.ok) {
        console.error(`❌ [${funcion}] Error ${resAlta.status} desde ${urlAlta}`);
        try {
            dataAlta = await resAlta.json(); // Intentar parsear el error JSON
            console.error(`Detalle del error (JSON):`, dataAlta);
        } catch (e) {
            const errorTexto = await resAlta.text().catch(() => 'Respuesta ilegible');
            console.error(`Respuesta (no JSON) de Edge Function:`, errorTexto);
            dataAlta = { resultado: 'error', mensaje: 'Error en la función de alta', detalle: errorTexto };
        }
        // Devolvemos el error al frontend.
        return NextResponse.json(dataAlta, { status: resAlta.status || 500 });
    }

    // Si la respuesta fue OK, intentamos parsearla.
    try {
        dataAlta = await resAlta.json();
    } catch (e) {
        console.error(`❌ [${funcion}] Error al parsear JSON de respuesta OK de ${urlAlta}:`, e);
        const errorTexto = await resAlta.text().catch(() => 'Respuesta ilegible');
        console.error(`Respuesta (no JSON) de Edge Function (en OK):`, errorTexto);
        dataAlta = { resultado: 'error', mensaje: 'Respuesta de alta OK pero JSON inválido', detalle: errorTexto };
        return NextResponse.json(dataAlta, { status: 500 });
    }

    if (DEBUG_LOGS) console.log(`📩 [${funcion}] Respuesta OK de ${urlAlta}:`, { status: resAlta.status, data: dataAlta });

    // --- Extracción de ID del Suscriptor ---
    // Buscamos el ID en la respuesta de la función de alta.
    const id_suscriptor = dataAlta?.id_suscriptor;
    if (!id_suscriptor) {
        // Si no se encuentra el ID, es un error crítico en la lógica de la EF.
        console.error(`❌ [${funcion}] ${urlAlta} OK pero no devolvió 'id_suscriptor'. Respuesta:`, dataAlta);
        return NextResponse.json({ resultado: 'error', mensaje: 'ID de suscriptor no recibido tras el alta.' }, { status: 500 });
    }
    if (DEBUG_LOGS) console.log(`🆔 [${funcion}] ID Suscriptor obtenido: ${id_suscriptor}`);

    // ====================================================
    // === PASO 2: LLAMADA A EF CREAR SUSCRIPCIÓN (MP) ===
    // ====================================================
    const urlSuscripcion = `${EDGE_BASE_URL}/ef_crear_suscripcion`;

    // Construimos el payload para la EF que crea la suscripción en Mercado Pago.
    // Incluimos los datos necesarios para MP y para la lógica interna de la EF.
    const payloadSuscripcion = {
      id_suscriptor: id_suscriptor, // El ID obtenido en el paso anterior
      monto: body.monto || 390,     // Monto (del body o default)
      moneda: body.moneda || 'UYU', // Moneda (del body o default)
      // Datos adicionales para el campo 'reason' de MP y logs/matching en EF
      nombre: body.nombre,
      signo: body.signo,
      contenido_preferido: body.contenido_preferido,
      whatsapp: body.whatsapp, // Puede ser útil para 'payer_email' o logs
      email: body.email,       // Pasar si existe (para payer_email)
      telefono: body.telefono, // Pasar si la EF lo necesita para matching
    };

    if (DEBUG_LOGS) console.log(`🌐 [${funcion}] Llamando a ${urlSuscripcion}...`);
    if (DEBUG_LOGS) console.log(`📦 [${funcion}] Payload para suscripción:`, payloadSuscripcion);

    // Realizamos la llamada a la Edge Function.
    const resSuscripcion = await fetch(urlSuscripcion, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SRK}`,
        },
        body: JSON.stringify(payloadSuscripcion),
        cache: 'no-store',
    });

    let dataSuscripcion;
    // --- Manejo de Respuesta de Crear Suscripción ---
    if (!resSuscripcion.ok) {
        console.error(`❌ [${funcion}] Error ${resSuscripcion.status} desde ${urlSuscripcion}`);
        try {
            dataSuscripcion = await resSuscripcion.json();
            console.error(`Detalle del error (JSON):`, dataSuscripcion);
        } catch (e) {
            const errorTexto = await resSuscripcion.text().catch(() => 'Respuesta ilegible');
            console.error(`Respuesta (no JSON) de Edge Function:`, errorTexto);
            dataSuscripcion = { resultado: 'error', mensaje: 'Error en la función de suscripción', detalle: errorTexto };
        }
        // Devolvemos el error específico al frontend.
        return NextResponse.json(dataSuscripcion, { status: resSuscripcion.status || 500 });
    }

    // Si la respuesta fue OK, intentamos parsearla.
    try {
        dataSuscripcion = await resSuscripcion.json();
    } catch (e) {
        console.error(`❌ [${funcion}] Error al parsear JSON de respuesta OK de ${urlSuscripcion}:`, e);
        const errorTexto = await resSuscripcion.text().catch(() => 'Respuesta ilegible');
        console.error(`Respuesta (no JSON) de Edge Function (en OK):`, errorTexto);
        dataSuscripcion = { resultado: 'error', mensaje: 'Respuesta de suscripción OK pero JSON inválido', detalle: errorTexto };
        return NextResponse.json(dataSuscripcion, { status: 500 });
    }

    if (DEBUG_LOGS) console.log(`📩 [${funcion}] Respuesta OK de ${urlSuscripcion}:`, { status: resSuscripcion.status, data: dataSuscripcion });

    // --- Respuesta Final al Frontend ---
    // Si todo fue bien, devolvemos la respuesta de la EF de suscripción
    // (que debería contener 'init_point').
    return NextResponse.json(dataSuscripcion, { status: 200 });

  } catch (e: any) {
    // --- Manejo de Errores Inesperados (Catch Principal) ---
    // Captura cualquier error no manejado en los bloques try/catch anteriores.
    console.error(`🔥 [${funcion}] Error en Catch principal:`, e);
    return NextResponse.json(
        { resultado: 'error', mensaje: 'Fallo inesperado en el servidor', detalle: e.message },
        { status: 500 }
    );
  }
}

// ===========================================
// === HANDLER GET (HEALTHCHECK) ===
// ===========================================
// Permite verificar rápidamente si el endpoint está desplegado y funcionando.
export async function GET() {
  return NextResponse.json({ ok: true, message: "Iniciar Checkout endpoint is healthy" });
}

