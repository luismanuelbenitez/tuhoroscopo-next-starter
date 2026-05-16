import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

const CAMPOS_PERMITIDOS = ["nombre", "signo", "contenido_preferido", "whatsapp", "email"] as const;
type CampoPermitido = (typeof CAMPOS_PERMITIDOS)[number];

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", detalle: "Variables de entorno faltantes" },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, motivo: "body_invalido", detalle: "JSON inválido en el body" },
      { status: 400 }
    );
  }

  // Validate id_suscriptor
  const idRaw = body.id_suscriptor;
  const idNum =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string"
      ? parseInt(idRaw, 10)
      : NaN;
  if (!Number.isFinite(idNum) || !Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json(
      { ok: false, motivo: "id_suscriptor_invalido", detalle: "id_suscriptor debe ser un entero positivo" },
      { status: 400 }
    );
  }

  // Build strict update object from allowlist only
  const updates: Partial<Record<CampoPermitido, string>> & { actualizado_en?: string } = {};

  for (const campo of CAMPOS_PERMITIDOS) {
    const val = body[campo];
    if (val !== undefined) {
      if (typeof val !== "string") {
        return NextResponse.json(
          { ok: false, motivo: "campo_invalido", detalle: `El campo '${campo}' debe ser string` },
          { status: 400 }
        );
      }
      updates[campo] = val.trim();
    }
  }

  // nombre es obligatorio si se envía y no puede quedar vacío
  if ("nombre" in updates && !updates.nombre) {
    return NextResponse.json(
      { ok: false, motivo: "nombre_invalido", detalle: "El nombre no puede estar vacío" },
      { status: 400 }
    );
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { ok: false, motivo: "sin_cambios", detalle: "No se enviaron campos para actualizar" },
      { status: 400 }
    );
  }

  updates.actualizado_en = new Date().toISOString();

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("suscriptores")
    .update(updates)
    .eq("id", idNum)
    .select("id, nombre, signo, contenido_preferido, whatsapp, email, actualizado_en")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, motivo: "db_error", detalle: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { ok: false, motivo: "no_encontrado", detalle: `Suscriptor ${idNum} no encontrado` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    id_suscriptor: idNum,
    actualizado: data,
  });
}
