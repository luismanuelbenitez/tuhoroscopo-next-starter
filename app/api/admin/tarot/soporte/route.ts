import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { leerConfig, procesarConversacion, procesarPendientes, simularCaso } from "@/lib/soporte/motor";
import { aprobarCaso, cambiarEjemplo, guardarConfig, listarCasos, listarEjemplos, metricas, resolverCaso, versiones, type CambiosConfig } from "@/lib/soporte/acciones";
import { leerRegla } from "@/lib/reglasComerciales";
import { MODELOS } from "@/lib/analista/informe";

// Soporte Automatizado · etapa 1 (2026-11-16). Nada de esta ruta envía
// mensajes: arma borradores y textos para que Manuel los copie.
// GET  ?vista=casos&filtro=pendientes|humano|resueltos|todos
// GET  ?vista=cerebro   → config actual, versiones, ejemplos, regla de descuento, modelos
// GET  ?vista=numeros&dias=30
// POST {accion: aprobar|descartar|humano|procesar|simular|guardar_config|ejemplo, ...}
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const q = req.nextUrl.searchParams;
  try {
    const vista = q.get("vista") ?? "casos";
    if (vista === "cerebro") {
      const config = await leerConfig(rest);
      const [vs, ej, regla] = await Promise.all([versiones(rest), listarEjemplos(rest), config ? leerRegla(rest, config.politica.regla_descuento).catch(() => null) : null]);
      return NextResponse.json({ ok: true, config, versiones: vs, ejemplos: ej, regla, modelos: Object.entries(MODELOS).map(([id, m]) => ({ id, nombre: m.nombre, entrada: m.entrada, salida: m.salida })) });
    }
    if (vista === "numeros") return NextResponse.json({ ok: true, ...(await metricas(rest, Math.max(1, Math.min(365, Number(q.get("dias") ?? 30))))) });
    const config = await leerConfig(rest);
    return NextResponse.json({ ok: true, casos: await listarCasos(rest, q.get("filtro") ?? "pendientes"), config: config ? { activo: config.activo, modo_prueba: config.modo_prueba, version: config.version, modelo: config.modelo, intenciones: config.intenciones } : null });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const por = String(session.admin?.usuario ?? "admin").slice(0, 60);
  const b = (await req.json().catch(() => ({}))) as { accion?: string; id?: string; mensaje_id?: string; texto?: string; conversacion_id?: string; cambios?: CambiosConfig; nota?: string; activo?: boolean };
  try {
    switch (b.accion) {
      case "aprobar": {
        if (!b.id) return NextResponse.json({ ok: false, motivo: "falta_id" }, { status: 400 });
        const r = await aprobarCaso(rest, b.id, typeof b.texto === "string" ? b.texto : undefined, por);
        return NextResponse.json(r, { status: r.ok ? 200 : 400 });
      }
      case "descartar":
      case "humano":
        if (!b.id) return NextResponse.json({ ok: false, motivo: "falta_id" }, { status: 400 });
        return NextResponse.json(await resolverCaso(rest, b.id, b.accion === "descartar" ? "descartado" : "humano", por));
      case "procesar":
        if (b.conversacion_id) return NextResponse.json({ ok: true, resultados: [await procesarConversacion(rest, b.conversacion_id, "manual")] });
        return NextResponse.json(await procesarPendientes(rest, { max: 5, origen: "manual" }));
      case "simular":
        // Prueba: no guarda ni envía nada. Rearma el hilo hasta mensaje_id.
        if (!b.conversacion_id || !b.mensaje_id) return NextResponse.json({ ok: false, motivo: "faltan_datos" }, { status: 400 });
        return NextResponse.json(await simularCaso(rest, b.conversacion_id, b.mensaje_id));
      case "guardar_config": {
        const r = await guardarConfig(rest, b.cambios ?? {}, String(b.nota ?? ""), por);
        return NextResponse.json(r, { status: r.ok ? 200 : 400 });
      }
      case "ejemplo":
        if (!b.id) return NextResponse.json({ ok: false, motivo: "falta_id" }, { status: 400 });
        return NextResponse.json(await cambiarEjemplo(rest, b.id, !!b.activo));
      default:
        return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
