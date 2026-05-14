import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.WHATSAPP_INTERNAL_KEY;

  if (!supabaseUrl) {
    return NextResponse.json(
      { ok: false, motivo: "env_missing", detalle: "SUPABASE_URL no configurada" },
      { status: 500 }
    );
  }
  if (!internalKey) {
    return NextResponse.json(
      { ok: false, motivo: "env_missing", detalle: "WHATSAPP_INTERNAL_KEY no configurada" },
      { status: 500 }
    );
  }

  const efUrl = `${supabaseUrl}/functions/v1/ef_admin_metricas_basicas`;

  let res: Response;
  try {
    res = await fetch(efUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": internalKey,
      },
      body: JSON.stringify({ log: false }),
      cache: "no-store",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, motivo: "fetch_error", detalle: msg },
      { status: 502 }
    );
  }

  if (!res.ok) {
    let detalle = `Error ${res.status} desde Edge Function`;
    try {
      const errData = await res.json();
      if (errData.motivo) detalle = `EF devolvió: ${errData.motivo} (HTTP ${res.status})`;
    } catch {
      // respuesta sin JSON — usamos el detalle genérico
    }
    return NextResponse.json(
      { ok: false, motivo: "ef_error", detalle, efStatus: res.status },
      { status: 502 }
    );
  }

  const data = await res.json();

  return NextResponse.json({
    ok: data.ok ?? false,
    periodo: data.periodo,
    suscriptores: data.metricas?.suscriptores ?? null,
    suscripciones: data.metricas?.suscripciones ?? null,
  });
}
