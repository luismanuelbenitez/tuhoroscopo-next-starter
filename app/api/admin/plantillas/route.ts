import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

function supabaseClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

// GET /api/admin/plantillas — devuelve todas las plantillas de prompts IA
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const supabase = supabaseClient();
  const { data, error } = await supabase
    .from("plantillas")
    .select("id, nombre, descripcion, contenido, creado_en, activo")
    .order("nombre");

  if (error) {
    return NextResponse.json({ ok: false, motivo: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, plantillas: data ?? [] });
}

// PUT /api/admin/plantillas — actualiza el contenido de una plantilla por nombre
export async function PUT(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  let body: { nombre?: string; contenido?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "JSON inválido" }, { status: 400 });
  }

  const { nombre, contenido } = body;

  if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
    return NextResponse.json({ ok: false, motivo: "Falta nombre" }, { status: 400 });
  }
  if (typeof contenido !== "string" || !contenido.trim()) {
    return NextResponse.json({ ok: false, motivo: "Falta contenido" }, { status: 400 });
  }

  const supabase = supabaseClient();
  const { data: existing, error: errFind } = await supabase
    .from("plantillas")
    .select("id")
    .eq("nombre", nombre.trim())
    .maybeSingle();

  if (errFind) {
    return NextResponse.json({ ok: false, motivo: errFind.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, motivo: `Plantilla '${nombre}' no encontrada` }, { status: 404 });
  }

  const { error: errUpdate } = await supabase
    .from("plantillas")
    .update({ contenido: contenido.trim() })
    .eq("nombre", nombre.trim());

  if (errUpdate) {
    return NextResponse.json({ ok: false, motivo: errUpdate.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mensaje: `Plantilla '${nombre}' actualizada` });
}
