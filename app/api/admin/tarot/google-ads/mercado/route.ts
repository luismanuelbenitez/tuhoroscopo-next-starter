import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { consultarMercado, importarArchivo, leerMercado, type Mercado } from "@/lib/googleAdsApi/mercado";

// Palabras del mercado (2026-11-15): cuánta gente busca cada frase por mes.
// GET ?mercado=uy|us → tabla clasificada y resumen por tema.
// POST JSON {accion:"consultar", mercado} → Planificador de Google (solo lectura).
// POST multipart {mercado, archivo} → importa el archivo que descarga el Planificador.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const mercadoDe = (v: unknown): Mercado | null => (v === "uy" || v === "us" ? v : null);

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const mercado = mercadoDe(req.nextUrl.searchParams.get("mercado")) ?? "uy";
  try {
    return NextResponse.json(await leerMercado(rest, mercado));
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const fd = await req.formData();
      const mercado = mercadoDe(fd.get("mercado"));
      const archivo = fd.get("archivo");
      if (!mercado || !(archivo instanceof File)) return NextResponse.json({ ok: false, motivo: "datos_invalidos" }, { status: 400 });
      if (archivo.size > 8 * 1024 * 1024) return NextResponse.json({ ok: false, motivo: "archivo_grande", detalle: "Máximo 8 MB." }, { status: 400 });
      const r = await importarArchivo(rest, mercado, await archivo.arrayBuffer());
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    const b = (await req.json().catch(() => ({}))) as { accion?: string; mercado?: string };
    const mercado = mercadoDe(b.mercado);
    if (b.accion !== "consultar" || !mercado) return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
    const r = await consultarMercado(rest, mercado);
    return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "sin_acceso_basic" ? 403 : 502 });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
