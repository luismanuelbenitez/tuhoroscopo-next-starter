import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { metaConfig } from "@/lib/metaAds/graph";
import { sincronizar } from "@/lib/metaAds/sync";
import { diagnosticar, type MetaPanel } from "@/lib/metaAds/diagnostico";

// Meta Ads (2026-11-02), solo lectura. GET: datos del panel + diagnóstico;
// ?objeto=<id> devuelve la configuración completa de una campaña / conjunto /
// anuncio y su historial. POST {accion:"sincronizar", dias}: lee Meta ahora.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const configurado = !!metaConfig();
  try {
    const objeto = req.nextUrl.searchParams.get("objeto");
    if (objeto) {
      if (!/^\d{5,25}$/.test(objeto)) return NextResponse.json({ ok: false, motivo: "id_invalido" }, { status: 400 });
      const [filas, cambios] = await Promise.all([
        rest(`meta_ads_objetos?id=eq.${objeto}&select=*`),
        rest(`meta_ads_cambios?objeto_id=eq.${objeto}&order=detectado_at.desc&limit=20&select=*`),
      ]);
      return NextResponse.json({ ok: true, objeto: (filas as unknown[])[0] ?? null, cambios });
    }
    const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias")) || 14, 1), 90);
    const panel = (await rest("rpc/meta_ads_panel", { method: "POST", body: JSON.stringify({ p_dias: dias }) })) as MetaPanel;
    return NextResponse.json({ ok: true, configurado, ...panel, ...diagnosticar(panel) });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { accion?: string; dias?: number };
  if (body.accion !== "sincronizar") return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
  const dias = Math.min(Math.max(Number(body.dias) || 3, 1), 90);
  const r = await sincronizar(rest, { dias, origen: dias > 28 ? "inicial" : "manual" });
  return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "sin_configurar" ? 400 : 502 });
}
