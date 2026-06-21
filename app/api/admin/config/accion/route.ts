import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

const CLAVES_EDITABLES = [
  "APP_DEBUG_MODE", "WHATSAPP_MODO", "THC_BACK_URL", "TTC_BACK_URL", "MODO_MANTENIMIENTO",
  "ALERTAS_EMAIL_ACTIVO", "ALERTAS_EMAIL_DESTINO",
  "ALERTAS_COOLDOWN_HORAS", "ALERTAS_UMBRAL_ORDENES_ERROR", "ALERTAS_UMBRAL_MENSAJES_FALLIDOS",
  "THC_PRECIO_SUSCRIPCION", "OPENAI_MODEL",
] as const;
type ClaveEditable = (typeof CLAVES_EDITABLES)[number];

const VALORES_ENUM: Partial<Record<ClaveEditable, string[]>> = {
  APP_DEBUG_MODE:      ["true", "false"],
  WHATSAPP_MODO:       ["sandbox", "production"],
  MODO_MANTENIMIENTO:  ["true", "false"],
  ALERTAS_EMAIL_ACTIVO: ["true", "false"],
  OPENAI_MODEL:        ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o", "gpt-4.1"],
};

const CLAVES_NUMERO: ClaveEditable[] = [
  "ALERTAS_COOLDOWN_HORAS", "ALERTAS_UMBRAL_ORDENES_ERROR", "ALERTAS_UMBRAL_MENSAJES_FALLIDOS",
  "THC_PRECIO_SUSCRIPCION",
];

function validarValor(clave: ClaveEditable, valor: string): string | null {
  if (VALORES_ENUM[clave]) {
    if (!VALORES_ENUM[clave]!.includes(valor)) {
      return `Valores permitidos para ${clave}: ${VALORES_ENUM[clave]!.join(", ")}`;
    }
    return null;
  }
  if (clave === "THC_BACK_URL" || clave === "TTC_BACK_URL") {
    try {
      const url = new URL(valor);
      if (url.protocol !== "https:") return "Debe ser una URL HTTPS";
    } catch {
      return "URL inválida — debe comenzar con https://";
    }
    return null;
  }
  if (clave === "ALERTAS_EMAIL_DESTINO") {
    if (!valor || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) return "Email inválido";
    return null;
  }
  if (CLAVES_NUMERO.includes(clave)) {
    const n = parseInt(valor, 10);
    if (isNaN(n) || n < 1 || n > 9999) return "Debe ser un número entero entre 1 y 9999";
    return null;
  }
  return null;
}

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

  // URL, email, y número preservan case/formato; enum keys pasan a lowercase
  const CLAVES_PRESERVAR_CASE: string[] = ["THC_BACK_URL", "TTC_BACK_URL", "ALERTAS_EMAIL_DESTINO", "OPENAI_MODEL", ...CLAVES_NUMERO];
  const valorRaw = typeof body.valor === "string"
    ? (CLAVES_PRESERVAR_CASE.includes(clave) ? body.valor.trim() : body.valor.trim().toLowerCase())
    : "";
  const errorValor = validarValor(clave as ClaveEditable, valorRaw);
  if (errorValor) {
    return NextResponse.json({ ok: false, motivo: "valor_invalido", detalle: errorValor }, { status: 400 });
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
