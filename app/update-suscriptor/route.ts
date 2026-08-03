import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id_suscriptor, ...updates } = body;

    if (!id_suscriptor) {
      return NextResponse.json(
        { resultado: "error", mensaje: "Falta id_suscriptor" },
        { status: 400 }
      );
    }

    // 🔑 Variables de entorno
    const EDGE_BASE = process.env.NEXT_PUBLIC_EDGE_BASE;
    const SRK = process.env.SUPABASE_SECRET_KEY;

    const url = `${EDGE_BASE}/ef_update_suscriptor`;

    // Proxy hacia la Edge Function
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SRK}`,
      },
      body: JSON.stringify({ id_suscriptor, ...updates }),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Error en update-suscriptor:", err);
    return NextResponse.json(
      { resultado: "error", mensaje: "Fallo en update-suscriptor" },
      { status: 500 }
    );
  }
}
