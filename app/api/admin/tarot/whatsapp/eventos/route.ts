import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

// Eventos crudos del webhook de Meta (whatsapp_webhook_events) vía
// ef_tarot_admin_whatsapp. GET ?accion=resumen | listar | detalle
export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !internalKey || !serviceRoleKey) {
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  }

  const { searchParams } = req.nextUrl;
  const accion = searchParams.get("accion") ?? "listar";
  const body: Record<string, unknown> = {};
  if (accion === "resumen") {
    body.accion = "eventos_resumen";
  } else if (accion === "detalle") {
    body.accion = "evento_detalle";
    body.id = searchParams.get("id");
  } else {
    body.accion = "eventos_listar";
    const categoria = searchParams.get("categoria");
    if (categoria) body.categoria = categoria;
    const limit = searchParams.get("limit");
    if (limit) body.limit = parseInt(limit, 10);
    const offset = searchParams.get("offset");
    if (offset) body.offset = parseInt(offset, 10);
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ef_tarot_admin_whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
