import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function hdrs(key: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key };
}

export async function GET(_req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;
  const base = `${supabaseUrl}/rest/v1`;
  const h = hdrs(serviceRoleKey);

  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);
  const hoyStr = hoyInicio.toISOString();

  const [
    configRes,
    globalCfgRes,
    niRulesRes,
    benchmarkEvalRes,
    lecturaHoyRes,
    errorRecienteRes,
    promptVersionRes,
  ] = await Promise.all([
    fetch(
      `${base}/tarot_producto_config?activa=eq.true&select=id,nombre,version,current_prompt_version_id,ia_modelo,updated_at&limit=1`,
      { headers: h, cache: "no-store" },
    ),
    fetch(
      `${base}/tarot_configuracion?clave=in.(ia_modelo,ia_temperatura,ia_max_tokens,mp_modo,whatsapp_modo,canal_entrega_principal)&activo=eq.true&select=clave,valor`,
      { headers: h, cache: "no-store" },
    ),
    fetch(
      `${base}/tarot_narrative_rules?select=id,estado`,
      { headers: h, cache: "no-store" },
    ),
    fetch(
      `${base}/tarot_benchmark_evaluaciones?select=caso_id`,
      { headers: h, cache: "no-store" },
    ),
    fetch(
      `${base}/tarot_lecturas?created_at=gte.${encodeURIComponent(hoyStr)}&select=id,estado`,
      { headers: h, cache: "no-store" },
    ),
    fetch(
      `${base}/tarot_lecturas?estado=eq.error&select=id,error_codigo,error_mensaje,created_at&order=created_at.desc&limit=5`,
      { headers: h, cache: "no-store" },
    ),
    // placeholder — filled after we know current_prompt_version_id
    Promise.resolve(null as Response | null),
  ]);

  const [configArr, globalCfgArr, niRulesArr, benchmarkEvalArr, lecturasHoyArr, erroresArr] =
    await Promise.all([
      configRes.json().catch(() => []),
      globalCfgRes.json().catch(() => []),
      niRulesRes.json().catch(() => []),
      benchmarkEvalRes.json().catch(() => []),
      lecturaHoyRes.json().catch(() => []),
      errorRecienteRes.json().catch(() => []),
    ]);

  const config = Array.isArray(configArr) && configArr.length > 0 ? configArr[0] : null;
  const globalCfg: Record<string, string> = {};
  if (Array.isArray(globalCfgArr)) {
    for (const row of globalCfgArr) globalCfg[row.clave] = row.valor;
  }

  // Fetch current prompt version label
  let promptVersionLabel: string | null = null;
  if (config?.current_prompt_version_id) {
    const pvRes = await fetch(
      `${base}/tarot_prompt_versiones?id=eq.${encodeURIComponent(config.current_prompt_version_id)}&select=id,label,created_at&limit=1`,
      { headers: h, cache: "no-store" },
    );
    const pvArr = await pvRes.json().catch(() => []);
    if (Array.isArray(pvArr) && pvArr.length > 0) {
      promptVersionLabel = pvArr[0].label ?? null;
    }
  }

  // NI rules breakdown
  const niRules = Array.isArray(niRulesArr) ? niRulesArr : [];
  const niTotal = niRules.length;
  const niAprobadas = niRules.filter((r: { estado: string }) => r.estado === "Aprobada").length;
  const niImplementadas = niRules.filter((r: { estado: string }) => r.estado === "Implementada").length;

  // Benchmark distinct casos evaluados
  const benchmarkEvals = Array.isArray(benchmarkEvalArr) ? benchmarkEvalArr : [];
  const casosEvaluados = new Set(benchmarkEvals.map((e: { caso_id: string }) => e.caso_id)).size;

  // Lecturas de hoy
  const lecturasHoy = Array.isArray(lecturasHoyArr) ? lecturasHoyArr : [];
  const lecturasHoyTotal = lecturasHoy.length;
  const lecturasHoyExitosas = lecturasHoy.filter((l: { estado: string }) => l.estado === "completada").length;
  const lecturasHoyError = lecturasHoy.filter((l: { estado: string }) => l.estado === "error").length;

  return NextResponse.json({
    ok: true,
    prompt: {
      version: config?.version ?? null,
      version_label: promptVersionLabel,
      ia_modelo_override: config?.ia_modelo ?? null,
      updated_at: config?.updated_at ?? null,
    },
    modelo: {
      global: globalCfg.ia_modelo ?? "claude-sonnet-4-6",
      temperatura: globalCfg.ia_temperatura ?? "0.8",
      max_tokens: globalCfg.ia_max_tokens ?? "4000",
    },
    entrega: {
      mp_modo: globalCfg.mp_modo ?? null,
      whatsapp_modo: globalCfg.whatsapp_modo ?? null,
      canal: globalCfg.canal_entrega_principal ?? null,
    },
    ni: {
      total: niTotal,
      aprobadas: niAprobadas,
      implementadas: niImplementadas,
    },
    benchmark: {
      casos_evaluados: casosEvaluados,
    },
    lecturas_hoy: {
      total: lecturasHoyTotal,
      exitosas: lecturasHoyExitosas,
      errores: lecturasHoyError,
    },
    errores_recientes: Array.isArray(erroresArr) ? erroresArr.slice(0, 5) : [],
  });
}
