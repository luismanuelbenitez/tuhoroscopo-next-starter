import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { crearCodigoPersonal, guardarRegla, leerReglas, type CambiosRegla } from "@/lib/reglasComerciales";

// Reglas comerciales (2026-11-16).
// GET  → reglas + historial + evidencia (códigos, usos, ventas).
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
    accion?: string; clave?: string; cambios?: CambiosRegla; nota?: string; nombre?: string; tema?: string; nacimiento?: string;
  };
  if (!b.clave || typeof b.clave !== "string") return NextResponse.json({ ok: false, motivo: "falta_clave" }, { status: 400 });
  try {
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
