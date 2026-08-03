// app/api/crear-suscripcion/route.ts
import { NextResponse } from "next/server";

// ===========================================
// === API PROXY PARA CREAR SUSCRIPCIÓN ===
// ===========================================
// Esta API es llamada por 'PlanesClient.tsx'.
// Su único trabajo es tomar los datos del usuario (ya registrado)
// y los datos del plan, y pasarlos a la Edge Function
// 'ef_crear_suscripcion' para crear el link de pago.

export async function POST(req: Request) {
  const funcion = "api_crear_suscripcion";

  try {
    const body = await req.json();

    // ===========================================
    // === LECTURA DE VARIABLES DE ENTORNO ===
    // ===========================================
    const EDGE_BASE = process.env.EDGE_BASE; // ej: https://[ref].supabase.co/functions/v1
    const SRK = process.env.SUPABASE_SECRET_KEY;

    if (!EDGE_BASE || !SRK) {
        console.error("❌ [API] /crear-suscripcion: Faltan variables EDGE_BASE o SRK");
        return NextResponse.json( { resultado: "error", mensaje: "Error de configuración del servidor" }, { status: 500 });
    }

    // ===========================================
    // === VALIDACIÓN SIMPLE ===
    // ===========================================
    if (!body.id_suscriptor || !body.monto) {
        console.error("❌ [API] /crear-suscripcion: Faltan id_suscriptor o monto", body);
        return NextResponse.json( { resultado: "error", mensaje: "Faltan datos para crear la suscripción" }, { status: 400 });
    }
    
    // ===========================================
    // === LLAMADA (PROXY) A EDGE FUNCTION ===
    // ===========================================
    const url = `${EDGE_BASE}/ef_crear_suscripcion`;
    
    // El payload es lo que 'ef_crear_suscripcion' espera
    const payload = {
        id_suscriptor: body.id_suscriptor,
        nombre: body.nombre,
        whatsapp: body.whatsapp,
        signo: body.signo,
        contenido_preferido: body.contenido_preferido,
        email: body.email,
        monto: body.monto,
        moneda: body.moneda || "UYU",
    };

    console.log(`🌐 [API] /crear-suscripcion: Llamando a ${url} para id_suscriptor ${body.id_suscriptor}`);
    
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SRK}` },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    // ===========================================
    // === MANEJO DE RESPUESTA DE EDGE FUNCTION ===
    // ===========================================
    let data;
    if (!res.ok) {
        // Error de la Edge Function (ej. 409 duplicado, 500)
        console.error(`❌ Error ${res.status} desde ef_crear_suscripcion:`);
        try {
            data = await res.json();
            console.error("Detalle del error (JSON):", data);
        } catch (e) {
            const errorTexto = await res.text().catch(() => "Respuesta ilegible");
            console.error("Respuesta (no JSON) de Edge Function:", errorTexto);
            data = { resultado: "error", mensaje: "Error en la Edge Function", detalle: errorTexto };
        }
        return NextResponse.json(data, { status: res.status || 500 });
    }

    // Éxito
    data = await res.json();
    console.log("📩 [API] /crear-suscripcion: Respuesta OK de Supabase:", { status: res.status, data });

    // Devolvemos la respuesta (que debe incluir 'init_point')
    return NextResponse.json(data, { status: 200 });

  } catch (e: any) {
    console.error("🔥 Error en /api/crear-suscripcion (Catch principal):", e);
    return NextResponse.json(
      { resultado: "error", mensaje: "Fallo en el proxy", detalle: e.message },
      { status: 500 }
    );
  }
}
