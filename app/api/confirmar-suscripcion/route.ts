// app/api/confirmar-suscripcion/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { id_suscriptor, preapproval_id, status } = await req.json();

    if (!id_suscriptor || !preapproval_id || !status) {
      return NextResponse.json({ ok: false, error: "Faltan parámetros" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SECRET_KEY!;

    if (!url || !key)
      return NextResponse.json({ ok: false, error: "Faltan variables de entorno" }, { status: 500 });

    // Actualizamos el suscriptor
    const r = await fetch(`${url}/rest/v1/suscriptores?id=eq.${id_suscriptor}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        preapproval_id,
        preapproval_status: status,
        estado_suscripcion: status === "authorized" ? "activa" : "pendiente_autorizacion",
        auto_renovacion_activa: status === "authorized",
        premium_activo: status === "authorized",
        fecha_inicio_premium: status === "authorized" ? new Date().toISOString() : null,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error("Error al actualizar suscriptor:", err);
      return NextResponse.json({ ok: false, error: "Supabase error" }, { status: 502 });
    }

    const data = await r.json();
    console.log("✅ Suscriptor actualizado:", data);

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("❌ confirmar-suscripcion error:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
