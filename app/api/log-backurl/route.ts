import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

    await fetch(`${SUPABASE_URL}/rest/v1/log_funciones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      },
      body: JSON.stringify([
        {
          nombre_funcion: "backurl_mercadopago",
          resultado: "PARAMS",
          detalle: body,
          exito: true,
          creado_por: "front",
        },
      ]),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error log-backurl:", e);
    return NextResponse.json({ ok: false });
  }
}
