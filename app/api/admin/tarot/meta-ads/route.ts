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
    // Por campaña (Manuel 2026-11-04): ?campana=<id> o "todas". Sin el
    // parámetro se elige la campaña activa más reciente (si no hay activas, la
    // última). Con una campaña elegida, el período cubre toda su vida (≤ 90 d).
    const pedida = req.nextUrl.searchParams.get("campana");
    if (pedida && pedida !== "todas" && !/^\d{5,25}$/.test(pedida)) return NextResponse.json({ ok: false, motivo: "campana_invalida" }, { status: 400 });
    const lista = (await rest("meta_ads_objetos?nivel=eq.campana&select=id,estado,inicio,primer_visto_at")) as { id: string; estado: string | null; inicio: string | null; primer_visto_at: string }[];
    const reciente = (x: { inicio: string | null; primer_visto_at: string }) => new Date(x.inicio ?? x.primer_visto_at).getTime();
    const ordenadas = [...lista].sort((a, b) => reciente(b) - reciente(a));
    const campana = pedida === "todas" ? null : pedida ?? (ordenadas.find((c) => c.estado === "ACTIVE") ?? ordenadas[0])?.id ?? null;
    const elegida = lista.find((c) => c.id === campana);
    const diasPedidos = Number(req.nextUrl.searchParams.get("dias"));
    const diasCampana = elegida ? Math.ceil((Date.now() - reciente(elegida)) / 86_400_000) + 1 : 14;
    const dias = Math.min(Math.max(diasPedidos || diasCampana, 1), 90);
    const panel = (await rest("rpc/meta_ads_panel", { method: "POST", body: JSON.stringify({ p_dias: dias, p_campana: campana }) })) as MetaPanel;
    return NextResponse.json({ ok: true, configurado, campana_elegida: campana ?? "todas", dias_periodo: dias, ...panel, ...diagnosticar(panel) });
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
