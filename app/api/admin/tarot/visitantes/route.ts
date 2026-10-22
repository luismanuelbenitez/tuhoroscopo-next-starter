import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

// Inteligencia de visitantes (2026-10-22). Solo admin. Todo sale agregado de
// funciones SQL (visitantes_panel / visitantes_sesiones / visitantes_sesion_detalle),
// ejecutables únicamente con service role.
export const dynamic = "force-dynamic";

const txt = (v: string | null, max = 120) => (v && v.trim() ? v.trim().slice(0, max) : null);

function rango(sp: URLSearchParams): { desde: string; hasta: string } {
  const hasta = sp.get("hasta") ? new Date(`${sp.get("hasta")}T23:59:59.999-03:00`) : new Date();
  const dias = Math.min(Math.max(Number(sp.get("dias") ?? 30) || 30, 1), 400);
  const desde = sp.get("desde") ? new Date(`${sp.get("desde")}T00:00:00-03:00`) : new Date(hasta.getTime() - dias * 86400000);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const sp = req.nextUrl.searchParams;
  const accion = sp.get("accion") ?? "panel";

  if (accion === "sesion") {
    const id = txt(sp.get("id"), 64);
    if (!id) return NextResponse.json({ ok: false, motivo: "id_requerido" }, { status: 400 });
    const { data, error } = await supabase.rpc("visitantes_sesion_detalle", { p_sesion: id });
    if (error) return NextResponse.json({ ok: false, motivo: "error_query", detalle: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ...data });
  }

  const { desde, hasta } = rango(sp);
  const filtros = {
    p_desde: desde, p_hasta: hasta,
    p_interno: sp.get("interno") === "1",
    p_fuente: txt(sp.get("fuente")), p_campana: txt(sp.get("campana")),
    p_dispositivo: txt(sp.get("dispositivo"), 20), p_region: txt(sp.get("region"), 20),
  };

  if (accion === "sesiones") {
    const solo = ["todas", "checkout", "compra", "abandono"].includes(sp.get("solo") ?? "") ? sp.get("solo")! : "todas";
    const { data, error } = await supabase.rpc("visitantes_sesiones", {
      ...filtros, p_solo: solo,
      p_limite: Math.min(Number(sp.get("limite") ?? 50) || 50, 200),
      p_offset: Math.max(Number(sp.get("offset") ?? 0) || 0, 0),
    });
    if (error) return NextResponse.json({ ok: false, motivo: "error_query", detalle: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ...data });
  }

  const { data, error } = await supabase.rpc("visitantes_panel", filtros);
  if (error) return NextResponse.json({ ok: false, motivo: "error_query", detalle: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, desde, hasta, ...data });
}
