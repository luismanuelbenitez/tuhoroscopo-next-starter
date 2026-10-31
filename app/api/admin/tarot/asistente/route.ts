import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { correrChequeos } from "@/lib/asistente";
import { generarParte, restSupabase } from "@/lib/asistenteParte";

// Asistente CEO (2026-10-31). GET: corre los chequeos en vivo y trae el
// historial de partes (o un parte puntual con ?informe=<id>). POST: marcar
// un hallazgo como listo / ignorado, volver a mostrarlo, o generar y enviar
// el parte ahora (solo al email de Manuel). Nada de esto toca clientes.

const OCULTAR_HORAS = { listo: 24, ignorado: 24 * 7 } as const;

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const informe = req.nextUrl.searchParams.get("informe");
    if (informe) {
      const [fila] = await rest(`tarot_asistente_informes?id=eq.${encodeURIComponent(informe)}&select=*`);
      return NextResponse.json({ ok: !!fila, informe: fila ?? null });
    }
    const [chequeo, historial] = await Promise.all([
      correrChequeos((q) => rest(q)),
      rest(`tarot_asistente_informes?select=id,tipo,estado_general,resumen,email_enviado_at,email_error,created_at&order=created_at.desc&limit=14`),
    ]);
    return NextResponse.json({ ok: true, chequeo, historial, email_configurado: !!process.env.RESEND_API_KEY, cron_configurado: !!process.env.CRON_SECRET });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = await req.json().catch(() => null);
  try {
    switch (b?.accion) {
      case "ocultar": {
        const estado = b.estado === "ignorado" ? "ignorado" : "listo";
        if (typeof b.clave !== "string" || !b.clave) return NextResponse.json({ ok: false, motivo: "falta_clave" }, { status: 400 });
        await rest("tarot_asistente_hallazgos", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({ clave: b.clave.slice(0, 300), estado, oculto_hasta: new Date(Date.now() + OCULTAR_HORAS[estado] * 3600_000).toISOString(), updated_at: new Date().toISOString() }),
        });
        return NextResponse.json({ ok: true });
      }
      case "mostrar_todos":
        await rest("tarot_asistente_hallazgos?clave=neq.__ninguna__", { method: "DELETE" });
        return NextResponse.json({ ok: true });
      case "enviar_parte": {
        const r = await generarParte(rest, "manual", true);
        return NextResponse.json({ ok: true, email_enviado: !!r.email_enviado_at, email_error: r.email_error });
      }
      default:
        return NextResponse.json({ ok: false, motivo: "accion_desconocida" }, { status: 400 });
    }
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
