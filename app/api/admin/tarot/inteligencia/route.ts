import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { calcularCentro } from "@/lib/inteligencia/centro";
import { leerNegocio, NEGOCIO_POR_DEFECTO } from "@/lib/inteligencia/negocio";
import { calcularEstrategico } from "@/lib/estrategico";
import type { Atribucion } from "@/lib/inteligencia/canales";

// Inteligencia comercial (2026-11-24, fase 1).
// GET ?vista=centro&dias=30&atribucion=ultimo → Centro de control.
// GET ?vista=economia                          → modelo económico real + objetivos.
// POST {accion:"guardar_objetivos", ganancia_mensual_objetivo, cac_objetivo}
//                                              → objetivos del negocio (ic_negocios, fuente única).
// Solo lee datos y escribe los objetivos propios: nada toca Google, Meta, la web ni clientes.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DIAS = new Set([7, 14, 30, 90]);

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const q = req.nextUrl.searchParams;
  const negocio = q.get("negocio") || NEGOCIO_POR_DEFECTO;
  try {
    if (q.get("vista") === "economia") {
      const n = await leerNegocio(rest, negocio);
      if (!n) return NextResponse.json({ ok: false, motivo: "negocio_inexistente" }, { status: 404 });
      const [e90, costos] = await Promise.all([
        calcularEstrategico((x) => rest(x), 90, false),
        rest("tarot_costos?activo=eq.true&tipo=eq.fijo&select=nombre,monto,moneda,frecuencia,fecha_desde,fecha_hasta&order=nombre.asc"),
      ]);
      const p = e90.actual.plata;
      const v = p.ventas;
      return NextResponse.json({
        ok: true,
        negocio: n,
        referencia: {
          dias: 90, ventas: v,
          precio_promedio: v > 0 ? p.bruto / v : null,
          por_venta: v > 0 ? { comision: p.comision / v, ia: p.ia / v, audio: p.audio / v, whatsapp: p.wa / v, neto_cobrado: p.neto / v } : null,
          costo_variable: v > 0 ? (p.bruto - p.queda) / v : null,
          margen_contribucion: v > 0 ? p.queda / v : null,
        },
        fijos_mensuales: e90.fijos_mensuales,
        costos_fijos: costos,
        tipo_cambio: e90.tipo_cambio,
        costos_unitarios: e90.costos_unitarios,
      });
    }
    const dias = DIAS.has(Number(q.get("dias"))) ? Number(q.get("dias")) : 30;
    const atribucion: Atribucion = q.get("atribucion") === "primero" ? "primero" : "ultimo";
    const r = await calcularCentro((x) => rest(x), { negocio, dias, atribucion });
    return NextResponse.json(r, { status: r.ok ? 200 : 404 });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as { accion?: string; negocio?: string; ganancia_mensual_objetivo?: unknown; cac_objetivo?: unknown };
  if (b.accion !== "guardar_objetivos") return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
  const numero = (v: unknown, nombre: string, permiteCero: boolean): number | null | string => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || (!permiteCero && n === 0) || n > 1e9) return `${nombre}: tiene que ser un número ${permiteCero ? "de 0 o más" : "mayor que 0"}.`;
    return Math.round(n * 100) / 100;
  };
  const ganancia = numero(b.ganancia_mensual_objetivo, "Ganancia mensual", true);
  if (typeof ganancia === "string") return NextResponse.json({ ok: false, motivo: ganancia }, { status: 400 });
  const cac = numero(b.cac_objetivo, "CAC objetivo", false);
  if (typeof cac === "string") return NextResponse.json({ ok: false, motivo: cac }, { status: 400 });
  try {
    const id = b.negocio || NEGOCIO_POR_DEFECTO;
    const filas = (await rest(`ic_negocios?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ganancia_mensual_objetivo: ganancia, cac_objetivo: cac, updated_at: new Date().toISOString() }),
    })) as unknown[];
    if (!filas?.length) return NextResponse.json({ ok: false, motivo: "negocio_inexistente" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
