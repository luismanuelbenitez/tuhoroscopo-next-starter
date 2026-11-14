import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { gobernanzaGoogle } from "@/lib/gobernanzaAds/fuenteGoogle";
import { aplicarPropuesta, deshacerAccion } from "@/lib/gobernanzaAds/aplicarGoogle";
import { resumenConIa } from "@/lib/gobernanzaAds/resumenIa";
import { armarConfig, configPorDefecto, limpiarConfig, NEGATIVAS_UNIVERSALES } from "@/lib/gobernanzaAds/config";

// Módulo de gobernanza de Google Ads (2026-11-14).
// GET ?dias=14              → salud, KPIs, hallazgos, propuestas (Resumen, Diagnóstico, Cambios).
// GET ?vista=historial      → versiones de la configuración de la campaña.
// GET ?vista=acciones       → cambios aplicados desde el módulo.
// POST {accion:"validar"|"aplicar", propuesta_id, claves, acepto_espera}
//                           → Google revisa (validar) o aplica. Nunca sube el gasto
//                             (lib/googleAdsApi/escritura.ts, REGLA MÁXIMA 14/11).
// POST {accion:"deshacer", id}  → revierte un cambio aplicado.
// POST {accion:"resumen_ia", dias} → parte en palabras (Anthropic, a demanda).
// GET ?vista=config / POST {accion:"guardar_config", config} → ajustes del negocio (fase 3).
export const dynamic = "force-dynamic";
export const maxDuration = 300; // aplicar relee la cuenta después del cambio

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const vista = req.nextUrl.searchParams.get("vista");
    if (vista === "historial") {
      const filas = await rest("ads_config_historial?plataforma=eq.google&select=id,version,campana_nombre,vigente_desde,vigente_hasta,origen,cambios,analisis,resultados,resultados_at&order=vigente_desde.desc&limit=40");
      return NextResponse.json({ ok: true, versiones: filas });
    }
    if (vista === "acciones") {
      const filas = await rest("ads_gobernanza_acciones?select=id,propuesta_id,titulo,items,estado,error,en_espera,created_at,deshecha_at&order=created_at.desc&limit=30");
      return NextResponse.json({ ok: true, acciones: filas });
    }
    if (vista === "config") {
      const filas = (await rest("tarot_configuracion?clave=in.(gobernanza_google_ads,precio_base_uyu)&select=clave,valor")) as { clave: string; valor: string }[];
      const m = Object.fromEntries(filas.map((x) => [x.clave, x.valor]));
      let guardada: unknown = {};
      try { guardada = m.gobernanza_google_ads ? JSON.parse(m.gobernanza_google_ads) : {}; } catch { guardada = {}; }
      const precio = Number(m.precio_base_uyu) || 0;
      return NextResponse.json({ ok: true, guardada, precio, por_defecto: configPorDefecto(precio), efectiva: armarConfig(precio, guardada), universales: NEGATIVAS_UNIVERSALES });
    }
    const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias")) || 14, 1), 90);
    const r = await gobernanzaGoogle(rest, dias);
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as { accion?: string; propuesta_id?: string; claves?: unknown; acepto_espera?: boolean; id?: number; dias?: number };
  try {
    if (b.accion === "validar" || b.accion === "aplicar") {
      const claves = Array.isArray(b.claves) ? b.claves.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
      const r = await aplicarPropuesta(rest, { propuesta_id: String(b.propuesta_id ?? ""), claves, modo: b.accion, acepto_espera: b.acepto_espera === true });
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    if (b.accion === "deshacer") {
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, motivo: "id inválido" }, { status: 400 });
      const r = await deshacerAccion(rest, id);
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    if (b.accion === "resumen_ia") {
      const dias = Math.min(Math.max(Number(b.dias) || 14, 1), 90);
      const g = await gobernanzaGoogle(rest, dias);
      if (!g.ok) return NextResponse.json(g, { status: 409 });
      const r = await resumenConIa({
        periodo_dias: g.dias, moneda: g.moneda, costo_objetivo_por_venta: g.config.cpa_objetivo,
        salud: g.salud, numeros: g.kpis, revision: g.revision,
        hallazgos: g.hallazgos.map((h) => ({ columna: h.columna, gravedad: h.gravedad, titulo: h.titulo, detalle: h.detalle, accion: h.accion, falta: h.falta, objetos: h.objetos?.slice(0, 8) })),
      });
      return NextResponse.json(r, { status: r.ok ? 200 : 502 });
    }
    if (b.accion === "guardar_config") {
      const limpia = limpiarConfig((b as { config?: unknown }).config);
      if (!limpia.ok) return NextResponse.json(limpia, { status: 400 });
      await rest("tarot_configuracion?on_conflict=clave", {
        method: "POST",
        body: JSON.stringify({ clave: "gobernanza_google_ads", valor: JSON.stringify(limpia.config), tipo_valor: "json", updated_at: new Date().toISOString() }),
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      });
      return NextResponse.json({ ok: true, config: limpia.config });
    }
    return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
