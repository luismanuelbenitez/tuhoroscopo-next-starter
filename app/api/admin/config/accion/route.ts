import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

// Only APP_DEBUG_MODE can be toggled from the panel.
// All other config keys are read-only.
const CLAVES_EDITABLES = ["APP_DEBUG_MODE"] as const;
type ClaveEditable = (typeof CLAVES_EDITABLES)[number];

const VALORES_PERMITIDOS: Record<ClaveEditable, string[]> = {
  APP_DEBUG_MODE: ["true", "false"],
};

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "body_invalido" }, { status: 400 });
  }

  // Validate clave
  const clave = typeof body.clave === "string" ? body.clave.trim().toUpperCase() : "";
  if (!CLAVES_EDITABLES.includes(clave as ClaveEditable)) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "clave_no_editable",
        detalle: `Solo se puede editar: ${CLAVES_EDITABLES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Validate valor
  const valorRaw = typeof body.valor === "string" ? body.valor.trim().toLowerCase() : "";
  const valoresPermitidos = VALORES_PERMITIDOS[clave as ClaveEditable];
  if (!valoresPermitidos.includes(valorRaw)) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "valor_invalido",
        detalle: `Valores permitidos para ${clave}: ${valoresPermitidos.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Validate motivo
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
  if (motivo.length < 5) {
    return NextResponse.json(
      { ok: false, motivo: "motivo_requerido", detalle: "El motivo es obligatorio (mínimo 5 caracteres)" },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const tsNow = new Date().toISOString();

  // Read current value
  const { data: existing } = await supabase
    .from("config")
    .select("id, nombre, valor")
    .eq("nombre", clave)
    .maybeSingle();

  const valorAnterior = existing?.valor ?? null;

  // Upsert: update if exists, insert if not
  let dbError: { message: string } | null = null;
  if (existing?.id) {
    const { error } = await supabase
      .from("config")
      .update({ valor: valorRaw })
      .eq("id", existing.id);
    dbError = error;
  } else {
    const { error } = await supabase.from("config").insert({ nombre: clave, valor: valorRaw });
    dbError = error;
  }

  if (dbError) {
    await supabase.from("log_funciones").insert({
      nombre_funcion: "admin_panel_config_accion",
      fecha_ejecucion: tsNow,
      resultado: "config_update_error",
      detalle: { clave, valor: valorRaw, motivo, error: dbError.message },
      exito: false,
      creado_por: "admin_panel",
    });
    return NextResponse.json(
      { ok: false, motivo: "db_error", detalle: dbError.message },
      { status: 500 }
    );
  }

  await supabase.from("log_funciones").insert({
    nombre_funcion: "admin_panel_config_accion",
    fecha_ejecucion: tsNow,
    resultado: "config_update_ok",
    detalle: {
      clave,
      valor_anterior: valorAnterior,
      valor_nuevo: valorRaw,
      motivo,
      accion: existing?.id ? "update" : "insert",
    },
    exito: true,
    creado_por: "admin_panel",
  });

  return NextResponse.json({
    ok: true,
    clave,
    valor_anterior: valorAnterior,
    valor_nuevo: valorRaw,
    mensaje: `${clave} actualizado a '${valorRaw}'.`,
  });
}
