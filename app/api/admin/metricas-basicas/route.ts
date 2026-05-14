import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

const EF_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ef_admin_metricas_basicas`;

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const res = await fetch(EF_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": process.env.WHATSAPP_INTERNAL_KEY ?? "",
    },
    body: JSON.stringify({ log: false }),
  });

  if (!res.ok) {
    return NextResponse.json({ ok: false, motivo: "ef_error" }, { status: 502 });
  }

  const data = await res.json();

  return NextResponse.json({
    ok: data.ok ?? false,
    periodo: data.periodo,
    suscriptores: data.metricas?.suscriptores ?? null,
    suscripciones: data.metricas?.suscripciones ?? null,
  });
}
