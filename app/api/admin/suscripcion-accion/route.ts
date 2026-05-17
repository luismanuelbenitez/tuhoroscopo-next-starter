import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

const ACCIONES_PERMITIDAS = ["renovar_premium"] as const;
type AccionPermitida = (typeof ACCIONES_PERMITIDAS)[number];

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
    return NextResponse.json({ ok: false, motivo: "body_invalido" }, { status: 400 });
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

  const tsNow = new Date().toISOString();

  // ============================================================
  // ACCION: renovar_premium
  // Extiende fecha_vencimiento_premium N meses en suscriptores.
  // Solo permitido si premium_activo=true y estado_suscripcion='activa'.
  // Implementado directo vía Supabase (no llama EF).
  // ============================================================
  if (accion === "renovar_premium") {
    // Validate meses
    const mesesRaw = body.meses;
    const meses =
      typeof mesesRaw === "number"
        ? mesesRaw
        : typeof mesesRaw === "string"
        ? parseInt(mesesRaw, 10)
        : NaN;
    if (!Number.isFinite(meses) || !Number.isInteger(meses) || meses < 1 || meses > 12) {
      return NextResponse.json(
        { ok: false, motivo: "meses_invalido", detalle: "meses debe ser un entero entre 1 y 12" },
        { status: 400 }
      );
    }

    const { data: sus, error: susErr } = await supabase
      .from("suscriptores")
      .select("id, nombre, premium_activo, estado_suscripcion, fecha_vencimiento_premium")
      .eq("id", idNum)
      .maybeSingle();

    if (susErr || !sus) {
      return NextResponse.json(
        { ok: false, motivo: "suscriptor_no_encontrado", detalle: `Suscriptor #${idNum} no encontrado` },
        { status: 404 }
      );
    }

    if (sus.premium_activo !== true) {
      return NextResponse.json(
        {
          ok: false,
          motivo: "premium_inactivo",
          detalle: "El suscriptor no tiene premium activo. La renovación manual solo aplica a suscriptores con premium activo.",
        },
        { status: 422 }
      );
    }

    if (sus.estado_suscripcion !== "activa") {
      return NextResponse.json(
        {
          ok: false,
          motivo: "suscripcion_no_activa",
          detalle: `El estado de suscripción es '${sus.estado_suscripcion}'. La renovación manual solo aplica a suscripciones activas.`,
        },
        { status: 422 }
      );
    }

    const fechaAnterior = sus.fecha_vencimiento_premium as string | null;

    // Calculate new expiry: extend from current fecha_vencimiento_premium, or from today if null
    const base = fechaAnterior ? new Date(fechaAnterior) : new Date();
    const nuevaFecha = new Date(base);
    nuevaFecha.setMonth(nuevaFecha.getMonth() + meses);
    const nuevaFechaIso = nuevaFecha.toISOString().split("T")[0]; // date only

    const { error: updErr } = await supabase
      .from("suscriptores")
      .update({ fecha_vencimiento_premium: nuevaFechaIso })
      .eq("id", idNum);

    if (updErr) {
      await supabase.from("log_funciones").insert({
        nombre_funcion: "admin_panel_suscripcion_accion",
        fecha_ejecucion: tsNow,
        resultado: "renovar_premium_update_error",
        detalle: { id_suscriptor: idNum, accion, motivo, meses, error: updErr.message },
        exito: false,
        creado_por: "admin_panel",
      });
      return NextResponse.json(
        { ok: false, motivo: "db_error", detalle: updErr.message },
        { status: 500 }
      );
    }

    await supabase.from("log_funciones").insert({
      nombre_funcion: "admin_panel_suscripcion_accion",
      fecha_ejecucion: tsNow,
      resultado: "renovar_premium_ok",
      detalle: {
        id_suscriptor: idNum,
        nombre_suscriptor: sus.nombre,
        accion,
        motivo,
        meses_agregados: meses,
        fecha_anterior: fechaAnterior,
        nueva_fecha_vencimiento: nuevaFechaIso,
      },
      exito: true,
      creado_por: "admin_panel",
    });

    return NextResponse.json({
      ok: true,
      accion,
      id_suscriptor: idNum,
      meses_agregados: meses,
      fecha_anterior: fechaAnterior,
      nueva_fecha_vencimiento: nuevaFechaIso,
      mensaje: `Premium extendido ${meses} mes${meses > 1 ? "es" : ""}. Nuevo vencimiento: ${nuevaFechaIso}.`,
    });
  }

  return NextResponse.json({ ok: false, motivo: "accion_no_implementada" }, { status: 500 });
}
