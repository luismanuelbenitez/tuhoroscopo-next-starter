import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { leerRecorridos } from "@/lib/googleAdsApi/recorridos";

// Recorridos de Google Ads (2026-11-15): búsqueda → anuncio → página →
// checkout → venta, por tema. Solo lectura.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias")) || 30, 1), 90);
    return NextResponse.json(await leerRecorridos(rest, dias));
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
