import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { getPrecioTarot } from "@/lib/getPrecioTarot";
import { archivarRegla, crearCodigoPersonal, crearRegla, guardarRegla, leerReglas, type CambiosRegla, type NuevaRegla } from "@/lib/reglasComerciales";

// Reglas comerciales (2026-11-16; crear y archivar 2026-11-17).
// GET  → reglas (también las archivadas) + historial + evidencia (códigos, usos, ventas).
// POST {accion:"crear", regla, nota}                       → regla nueva (nace apagada salvo que se pida activa).
// POST {accion:"archivar"|"restaurar", clave, nota}       → "eliminar" = archivar: nunca se borra.
// POST {accion:"guardar", clave, cambios, nota}          → cambia la regla (nota obligatoria, queda en el historial).
// POST {accion:"codigo_personal", clave, nombre, tema?, nacimiento?} → crea el código personal (ej. CAMILAVIP) y arma link + mensaje.
// Nada de esto le manda un mensaje a nadie: el mensaje se copia y lo envía Manuel.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    return NextResponse.json({ ok: true, reglas: await leerReglas(rest) });
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
  const b = (await req.json().catch(() => ({}))) as {
    accion?: string; clave?: string; cambios?: CambiosRegla; nota?: string; nombre?: string; tema?: string; nacimiento?: string; regla?: NuevaRegla;
  };
  try {
    if (b.accion === "crear") {
      if (!b.regla) return NextResponse.json({ ok: false, motivo: "falta_regla" }, { status: 400 });
      const r = await crearRegla(rest, b.regla, String(b.nota ?? ""), por, await getPrecioTarot());
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    if (!b.clave || typeof b.clave !== "string") return NextResponse.json({ ok: false, motivo: "falta_clave" }, { status: 400 });
    if (b.accion === "archivar" || b.accion === "restaurar") {
      const r = await archivarRegla(rest, b.clave, b.accion === "archivar", String(b.nota ?? ""), por);
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    if (b.accion === "guardar") {
      const r = await guardarRegla(rest, b.clave, b.cambios ?? {}, String(b.nota ?? ""), por);
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    if (b.accion === "codigo_personal") {
      if (!b.nombre?.trim()) return NextResponse.json({ ok: false, motivo: "falta_nombre" }, { status: 400 });
      const r = await crearCodigoPersonal(rest, b.clave, { nombre: b.nombre, tema: b.tema, nacimiento: b.nacimiento }, por);
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
