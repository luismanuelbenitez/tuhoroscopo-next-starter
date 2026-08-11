import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function restHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };
}

function periodRange(periodo: string): { desde: string; hasta: string } {
  const now = new Date();
  const hasta = now.toISOString();

  if (periodo === "hoy") {
    const desde = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    return { desde, hasta };
  }
  const dias = periodo === "7d" ? 7 : 30;
  const desde = new Date(now.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
  return { desde, hasta };
}

type LecturaRow = {
  estado: string;
  ia_costo_usd: string | null;
  ia_tokens_entrada: number | null;
  ia_tokens_salida: number | null;
  ia_modelo: string | null;
  generado_at: string | null;
  created_at: string;
  id: string;
  error_codigo: string | null;
  error_mensaje: string | null;
};

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;
  const hdrs = restHeaders(serviceRoleKey);

  const periodo = req.nextUrl.searchParams.get("periodo") ?? "7d";
  const { desde, hasta } = periodRange(periodo);

  const base = `${supabaseUrl}/rest/v1`;

  try {
    // ── 1. Lecturas del período ───────────────────────────────────────────
    const lecturasRes = await fetch(
      `${base}/tarot_lecturas?created_at=gte.${encodeURIComponent(desde)}&created_at=lte.${encodeURIComponent(hasta)}&select=id,estado,ia_costo_usd,ia_tokens_entrada,ia_tokens_salida,ia_modelo,generado_at,created_at,error_codigo,error_mensaje&order=created_at.asc&limit=2000`,
      { headers: hdrs, cache: "no-store" },
    );
    if (!lecturasRes.ok) throw new Error(`tarot_lecturas HTTP ${lecturasRes.status}`);
    const lecturas: LecturaRow[] = await lecturasRes.json().catch(() => []);

    // ── 2. KPIs ───────────────────────────────────────────────────────────
    const exitosas = lecturas.filter((l) => l.estado === "completada");
    const conError = lecturas.filter((l) => l.estado === "error");
    const total = lecturas.length;

    const costoTotal = exitosas.reduce((acc, l) => acc + (parseFloat(l.ia_costo_usd ?? "0") || 0), 0);
    const costoPromedio = exitosas.length > 0 ? costoTotal / exitosas.length : 0;
    const tasaExito = total > 0 ? exitosas.length / total : 0;
    const tokensEntradaAvg = exitosas.length > 0
      ? exitosas.reduce((a, l) => a + (l.ia_tokens_entrada ?? 0), 0) / exitosas.length
      : 0;
    const tokensSalidaAvg = exitosas.length > 0
      ? exitosas.reduce((a, l) => a + (l.ia_tokens_salida ?? 0), 0) / exitosas.length
      : 0;

    // ── 3. Serie temporal (lecturas por día) ──────────────────────────────
    const diaMap = new Map<string, { exitosas: number; con_error: number }>();
    for (const l of lecturas) {
      const ts = l.generado_at ?? l.created_at;
      const dia = ts ? ts.slice(0, 10) : null;
      if (!dia) continue;
      const cur = diaMap.get(dia) ?? { exitosas: 0, con_error: 0 };
      if (l.estado === "completada") cur.exitosas++;
      if (l.estado === "error") cur.con_error++;
      diaMap.set(dia, cur);
    }
    const seriesTemporal = Array.from(diaMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, v]) => ({ dia, ...v }));

    // ── 4. Costo por modelo (proxy de versión) ────────────────────────────
    const modeloMap = new Map<string, { total: number; costo_total: number; primera: string }>();
    for (const l of exitosas) {
      const modelo = l.ia_modelo ?? "(sin modelo)";
      const cur = modeloMap.get(modelo) ?? { total: 0, costo_total: 0, primera: l.created_at };
      cur.total++;
      cur.costo_total += parseFloat(l.ia_costo_usd ?? "0") || 0;
      modeloMap.set(modelo, cur);
    }
    const costoPorModelo = Array.from(modeloMap.entries())
      .sort(([, a], [, b]) => a.primera.localeCompare(b.primera))
      .map(([modelo, v]) => ({
        modelo,
        total_lecturas: v.total,
        costo_promedio: v.total > 0 ? v.costo_total / v.total : 0,
        costo_total: v.costo_total,
      }));

    // ── 5. Últimos 10 errores ─────────────────────────────────────────────
    const ultimosErrores = [...conError]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 10)
      .map((l) => ({
        id: l.id,
        error_codigo: l.error_codigo,
        error_mensaje: l.error_mensaje ? l.error_mensaje.slice(0, 120) : null,
        generado_at: l.generado_at,
        created_at: l.created_at,
      }));

    // ── 6. Tokens P50 / P90 (simple percentil de tokens_salida) ──────────
    const tokensSalida = exitosas
      .map((l) => l.ia_tokens_salida ?? 0)
      .filter((t) => t > 0)
      .sort((a, b) => a - b);

    function pct(arr: number[], p: number): number {
      if (arr.length === 0) return 0;
      const idx = Math.floor((p / 100) * (arr.length - 1));
      return arr[idx];
    }

    const tokensStats = {
      avg: Math.round(tokensSalidaAvg),
      p50: pct(tokensSalida, 50),
      p90: pct(tokensSalida, 90),
      p99: pct(tokensSalida, 99),
    };

    return NextResponse.json({
      ok: true,
      periodo,
      desde,
      hasta,
      kpis: {
        total,
        exitosas: exitosas.length,
        con_error: conError.length,
        tasa_exito: tasaExito,
        costo_total: costoTotal,
        costo_promedio: costoPromedio,
        tokens_entrada_avg: Math.round(tokensEntradaAvg),
        tokens_salida_avg: Math.round(tokensSalidaAvg),
      },
      series_temporal: seriesTemporal,
      costo_por_modelo: costoPorModelo,
      tokens_stats: tokensStats,
      ultimos_errores: ultimosErrores,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
