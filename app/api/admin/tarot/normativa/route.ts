import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

// Normativa y cumplimiento (2026-10-22): registro INFORMATIVO de pendientes.
// Solo lectura + actualización de campos de seguimiento. No ejecuta ninguna
// acción correctiva (decisión del propietario).
export const dynamic = "force-dynamic";

const cliente = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const PERMITIDOS: Record<string, string[]> = {
  verificacion: ["confirmado", "pendiente", "descartado"],
  riesgo: ["bajo", "medio", "alto"],
  prioridad: ["baja", "media", "alta"],
  resolucion: ["abierto", "en_curso", "resuelto", "descartado"],
};

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const { data, error } = await cliente().from("admin_normativa").select("*").order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, motivo: "error_query", detalle: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false, motivo: "id_requerido" }, { status: 400 });
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [campo, valores] of Object.entries(PERMITIDOS)) {
    const v = body[campo];
    if (typeof v === "string" && valores.includes(v)) cambios[campo] = v;
  }
  if (typeof body.notas === "string") cambios.notas = body.notas.slice(0, 2000);
  const { error } = await cliente().from("admin_normativa").update(cambios).eq("id", id);
  if (error) return NextResponse.json({ ok: false, motivo: "error_update", detalle: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
