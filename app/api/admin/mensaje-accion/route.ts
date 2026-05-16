import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

// Allowlist de acciones. Cada acción declara los estados de mensajes_enviados
// que acepta como entrada, evitando que se ejecute sobre un estado incorrecto.
const ACCIONES_PERMITIDAS = [
  "reintentar",
  "marcar_fallo_definitivo",
  "resetear_a_fallido",
] as const;

type AccionPermitida = (typeof ACCIONES_PERMITIDAS)[number];

const ESTADOS_REQUERIDOS: Record<AccionPermitida, string[]> = {
  reintentar: ["fallido"],
  marcar_fallo_definitivo: ["fallido"],
  resetear_a_fallido: ["fallo_definitivo"],
};

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.WHATSAPP_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !internalKey || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", detalle: "Variables de entorno faltantes" },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "body_invalido" }, { status: 400 });
  }

  // Validate id_mensaje
  const idRaw = body.id_mensaje;
  const idNum =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string"
      ? parseInt(idRaw, 10)
      : NaN;
  if (!Number.isFinite(idNum) || !Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json(
      { ok: false, motivo: "id_mensaje_invalido", detalle: "id_mensaje debe ser un entero positivo" },
      { status: 400 }
    );
  }

  // Validate accion
  const accion = typeof body.accion === "string" ? body.accion.trim() : "";
  if (!ACCIONES_PERMITIDAS.includes(accion as AccionPermitida)) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "accion_invalida",
        detalle: `Acciones válidas: ${ACCIONES_PERMITIDAS.join(", ")}`,
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Read current message estado — pre-check before acting
  const { data: msg, error: msgErr } = await supabase
    .from("mensajes_enviados")
    .select("id, estado, intentos")
    .eq("id", idNum)
    .single();

  if (msgErr || !msg) {
    return NextResponse.json(
      { ok: false, motivo: "mensaje_no_encontrado", detalle: `Mensaje ${idNum} no encontrado` },
      { status: 404 }
    );
  }

  // Validate current estado matches the action's allowed input states
  const estadosValidos = ESTADOS_REQUERIDOS[accion as AccionPermitida];
  if (!estadosValidos.includes(msg.estado)) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "estado_invalido_para_accion",
        detalle: `Acción '${accion}' requiere estado: ${estadosValidos.join(", ")}. Estado actual: '${msg.estado}'.`,
      },
      { status: 422 }
    );
  }

  const tsNow = new Date().toISOString();

  // ============================================================
  // ACCION: reintentar
  // Llama a ef_whatsapp_sender con forzar_reintento=true.
  // El sender tiene protección contra carreras: reclama el mensaje
  // pasándolo a "procesando" con filtro de estado antes de enviar.
  // ============================================================
  if (accion === "reintentar") {
    const efUrl = `${supabaseUrl}/functions/v1/ef_whatsapp_sender`;

    let efRes: Response;
    try {
      efRes = await fetch(efUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          "x-internal-key": internalKey,
        },
        body: JSON.stringify({ id_mensaje: idNum, forzar_reintento: true }),
        cache: "no-store",
      });
    } catch (e: unknown) {
      const msg2 = e instanceof Error ? e.message : String(e);
      await supabase.from("log_funciones").insert({
        nombre_funcion: "admin_panel_mensaje_accion",
        fecha_ejecucion: tsNow,
        resultado: "reintentar_fetch_error",
        detalle: { id_mensaje: idNum, accion, motivo, error: msg2 },
        exito: false,
        creado_por: "admin_panel",
      });
      return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: msg2 }, { status: 502 });
    }

    await supabase.from("log_funciones").insert({
      nombre_funcion: "admin_panel_mensaje_accion",
      fecha_ejecucion: tsNow,
      resultado: efRes.ok ? "reintentar_disparado" : "reintentar_ef_error",
      detalle: { id_mensaje: idNum, accion, motivo, ef_status: efRes.status },
      exito: efRes.ok,
      creado_por: "admin_panel",
    });

    if (!efRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          motivo: "ef_error",
          detalle: `ef_whatsapp_sender devolvió HTTP ${efRes.status}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      accion,
      id_mensaje: idNum,
      mensaje:
        "Reintento disparado al sender. El mensaje se procesará en segundos — actualizá el detalle para ver el nuevo estado.",
    });
  }

  // ============================================================
  // ACCION: marcar_fallo_definitivo
  // Cambia estado fallido → fallo_definitivo en DB.
  // El filtro .eq("estado","fallido") actúa como segunda validación.
  // No envía WhatsApp ni llama ningún EF.
  // ============================================================
  if (accion === "marcar_fallo_definitivo") {
    const { error: updErr } = await supabase
      .from("mensajes_enviados")
      .update({ estado: "fallo_definitivo" })
      .eq("id", idNum)
      .eq("estado", "fallido");

    if (updErr) {
      return NextResponse.json(
        { ok: false, motivo: "db_error", detalle: updErr.message },
        { status: 500 }
      );
    }

    await supabase.from("log_funciones").insert({
      nombre_funcion: "admin_panel_mensaje_accion",
      fecha_ejecucion: tsNow,
      resultado: "marcar_fallo_definitivo",
      detalle: { id_mensaje: idNum, accion, motivo, estado_anterior: "fallido" },
      exito: true,
      creado_por: "admin_panel",
    });

    return NextResponse.json({
      ok: true,
      accion,
      id_mensaje: idNum,
      mensaje:
        "Mensaje marcado como fallo definitivo. El CRON ya no lo reintentará automáticamente.",
    });
  }

  // ============================================================
  // ACCION: resetear_a_fallido
  // fallo_definitivo → fallido, intentos=0, limpia ultimo_error y reintentar_despues.
  // Permite que ef_whatsapp_reintentos lo retome en el próximo ciclo CRON.
  // ============================================================
  if (accion === "resetear_a_fallido") {
    const { error: updErr } = await supabase
      .from("mensajes_enviados")
      .update({
        estado: "fallido",
        intentos: 0,
        ultimo_error: null,
        reintentar_despues: null,
      })
      .eq("id", idNum)
      .eq("estado", "fallo_definitivo");

    if (updErr) {
      return NextResponse.json(
        { ok: false, motivo: "db_error", detalle: updErr.message },
        { status: 500 }
      );
    }

    await supabase.from("log_funciones").insert({
      nombre_funcion: "admin_panel_mensaje_accion",
      fecha_ejecucion: tsNow,
      resultado: "resetear_a_fallido",
      detalle: {
        id_mensaje: idNum,
        accion,
        motivo,
        estado_anterior: "fallo_definitivo",
        intentos_previos: msg.intentos,
      },
      exito: true,
      creado_por: "admin_panel",
    });

    return NextResponse.json({
      ok: true,
      accion,
      id_mensaje: idNum,
      mensaje:
        "Mensaje reseteado a fallido con intentos=0. El CRON (ef_whatsapp_reintentos) lo reintentará en el próximo ciclo.",
    });
  }

  return NextResponse.json({ ok: false, motivo: "accion_no_implementada" }, { status: 500 });
}
