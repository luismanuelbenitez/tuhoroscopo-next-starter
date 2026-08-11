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

  const [configRes, versionsRes, mazosRes, configGlobalRes] = await Promise.all([
    fetch(
      `${base}/tarot_producto_config?activa=eq.true&select=id,nombre,version,tipo_tirada_id,current_prompt_version_id,ia_modelo,ia_max_tokens,ia_temperatura&limit=1`,
      { headers: h, cache: "no-store" },
    ),
    fetch(
      `${base}/tarot_prompt_versiones?select=id,label,created_at&order=created_at.desc&limit=30`,
      { headers: h, cache: "no-store" },
    ),
    fetch(
      `${base}/tarot_mazos?activo=eq.true&select=id,nombre&limit=5`,
      { headers: h, cache: "no-store" },
    ),
    fetch(
      `${base}/tarot_configuracion?clave=in.(ia_modelo,ia_temperatura,ia_max_tokens)&activo=eq.true&select=clave,valor`,
      { headers: h, cache: "no-store" },
    ),
  ]);

  const [configArr, versionsArr, mazosArr, globalCfgArr] = await Promise.all([
    configRes.json().catch(() => []),
    versionsRes.json().catch(() => []),
    mazosRes.json().catch(() => []),
    configGlobalRes.json().catch(() => []),
  ]);

  const config = Array.isArray(configArr) && configArr.length > 0 ? configArr[0] : null;
  const mazo = Array.isArray(mazosArr) && mazosArr.length > 0 ? mazosArr[0] : null;

  const globalCfg: Record<string, string> = {};
  if (Array.isArray(globalCfgArr)) {
    for (const row of globalCfgArr) globalCfg[row.clave] = row.valor;
  }

  // Posiciones de la tirada activa
  let posiciones: unknown[] = [];
  if (config?.tipo_tirada_id) {
    const pRes = await fetch(
      `${base}/tarot_posiciones_tirada?tipo_tirada_id=eq.${config.tipo_tirada_id}&select=numero,nombre,descripcion&order=numero&limit=5`,
      { headers: h, cache: "no-store" },
    );
    const pArr = await pRes.json().catch(() => []);
    posiciones = Array.isArray(pArr) ? pArr : [];
  }

  // Cartas disponibles en el mazo activo
  let cartasDisponibles = 0;
  if (mazo?.id) {
    const cRes = await fetch(
      `${base}/tarot_cartas?mazo_id=eq.${mazo.id}&activa=eq.true&select=id,nombre_es,significado_normal,significado_invertido,keywords`,
      { headers: h, cache: "no-store" },
    );
    const cArr = await cRes.json().catch(() => []);
    cartasDisponibles = Array.isArray(cArr) ? cArr.length : 0;
  }

  const defaultModelo =
    (config?.ia_modelo) ||
    globalCfg.ia_modelo ||
    "claude-sonnet-4-6";
  const defaultTemperatura =
    config?.ia_temperatura != null
      ? Number(config.ia_temperatura)
      : Number(globalCfg.ia_temperatura ?? "0.8");
  const defaultMaxTokens =
    config?.ia_max_tokens != null
      ? Number(config.ia_max_tokens)
      : Number(globalCfg.ia_max_tokens ?? "4000");

  return NextResponse.json({
    ok: true,
    config,
    posiciones,
    mazo,
    cartas_disponibles: cartasDisponibles,
    versions: Array.isArray(versionsArr) ? versionsArr : [],
    defaults: {
      ia_modelo: defaultModelo,
      ia_temperatura: defaultTemperatura,
      ia_max_tokens: defaultMaxTokens,
    },
    anthropic_disponible: !!(process.env.NEXT_PUBLIC_EDGE_BASE && process.env.TAROT_INTERNAL_KEY),
  });
}
