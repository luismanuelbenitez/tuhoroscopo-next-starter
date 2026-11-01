import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";

// Memoria del Analista de conversión (2026-11-01). GET: "lo que ya sabemos"
// (aprendizajes vigentes y descartados) y el plan de acción (todas las
// recomendaciones con su estado y evaluación). POST: crear, editar,
// descartar/reactivar y borrar aprendizajes.

const AREAS = new Set(["trafico", "pagina", "checkout", "pago", "postcompra", "oferta", "medicion", "otro"]);
const CONFIANZAS = new Set(["alta", "media", "baja"]);

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const [aprendizajes, recomendaciones] = await Promise.all([
      rest(`tarot_analista_aprendizajes?select=id,texto,area,confianza,evidencia,origen,activo,motivo_baja,informe_id,created_at,updated_at&order=activo.desc,updated_at.desc&limit=500`),
      rest(`tarot_analista_recomendaciones?select=id,informe_id,prioridad,accion,donde,impacto,esfuerzo,como_medir,estado,nota,estado_at,evaluacion_veredicto,evaluacion_texto,evaluado_at,created_at,informe:tarot_analista_informes!tarot_analista_recomendaciones_informe_id_fkey(created_at,foco)&order=created_at.desc&limit=500`),
    ]);
    return NextResponse.json({ ok: true, aprendizajes, recomendaciones });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = await req.json().catch(() => null);
  const mal = (detalle: string) => NextResponse.json({ ok: false, motivo: "invalido", detalle }, { status: 400 });
  const minimal = { Prefer: "return=minimal" };
  try {
    const id = typeof b?.id === "string" ? encodeURIComponent(b.id) : null;
    switch (b?.accion) {
      case "crear":
      case "editar": {
        const texto = String(b.texto ?? "").trim();
        if (texto.length < 3 || texto.length > 600) return mal("El texto va de 3 a 600 caracteres.");
        if (!AREAS.has(b.area)) return mal("Área inválida.");
        if (!CONFIANZAS.has(b.confianza)) return mal("Confianza inválida.");
        const campos = { texto, area: b.area, confianza: b.confianza, evidencia: String(b.evidencia ?? "").trim().slice(0, 1000) || null, updated_at: new Date().toISOString() };
        if (b.accion === "crear") await rest("tarot_analista_aprendizajes", { method: "POST", headers: minimal, body: JSON.stringify({ ...campos, origen: "manual" }) });
        else {
          if (!id) return mal("Falta id.");
          // Si Manuel corrige uno de la IA, pasa a ser suyo: la IA ya no lo pisa.
          await rest(`tarot_analista_aprendizajes?id=eq.${id}`, { method: "PATCH", headers: minimal, body: JSON.stringify({ ...campos, origen: "manual" }) });
        }
        return NextResponse.json({ ok: true });
      }
      case "descartar":
      case "reactivar":
        if (!id) return mal("Falta id.");
        await rest(`tarot_analista_aprendizajes?id=eq.${id}`, {
          method: "PATCH", headers: minimal,
          body: JSON.stringify(b.accion === "descartar"
            ? { activo: false, motivo_baja: String(b.motivo ?? "Descartado por el dueño").slice(0, 600), updated_at: new Date().toISOString() }
            : { activo: true, motivo_baja: null, updated_at: new Date().toISOString() }),
        });
        return NextResponse.json({ ok: true });
      case "borrar":
        if (!id) return mal("Falta id.");
        await rest(`tarot_analista_aprendizajes?id=eq.${id}`, { method: "DELETE" });
        return NextResponse.json({ ok: true });
      default:
        return mal("Acción inválida.");
    }
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
