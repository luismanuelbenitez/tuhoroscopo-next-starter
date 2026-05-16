import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

const ACCIONES_PERMITIDAS = ["reencolar", "cancelar_pendiente"] as const;
type AccionPermitida = (typeof ACCIONES_PERMITIDAS)[number];

const ESTADOS_REQUERIDOS: Record<AccionPermitida, string[]> = {
  reencolar: ["pendiente", "generado", "fallido", "fallo_definitivo"],
  cancelar_pendiente: ["encolado"],
};

function parseContenido(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

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

  // Validate id_contenido
  const idRaw = body.id_contenido;
  const idNum =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string"
      ? parseInt(idRaw, 10)
      : NaN;
  if (!Number.isFinite(idNum) || !Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json(
      { ok: false, motivo: "id_contenido_invalido", detalle: "id_contenido debe ser un entero positivo" },
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

  // Read current contenido state
  const { data: contenido, error: contenidoErr } = await supabase
    .from("contenido_premium")
    .select("id, id_suscriptor, contenido, tipo, estado_envio, fecha_envio_programada")
    .eq("id", idNum)
    .single();

  if (contenidoErr || !contenido) {
    return NextResponse.json(
      { ok: false, motivo: "contenido_no_encontrado", detalle: `Contenido #${idNum} no encontrado` },
      { status: 404 }
    );
  }

  // Validate estado matches action
  const estadosValidos = ESTADOS_REQUERIDOS[accion as AccionPermitida];
  if (!estadosValidos.includes(contenido.estado_envio)) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "estado_invalido_para_accion",
        detalle: `Acción '${accion}' requiere estado: ${estadosValidos.join(", ")}. Estado actual: '${contenido.estado_envio}'.`,
      },
      { status: 422 }
    );
  }

  // ============================================================
  // ACCION: reencolar
  // Inserta nueva fila en mensajes_enviados (outbox) para contenido
  // que no tiene mensaje activo (pendiente/procesando).
  // Verifica elegibilidad del suscriptor, resolución de plantilla y
  // construye metadata.variables igual que ef_run_encolador_premium.
  // ============================================================
  if (accion === "reencolar") {
    const idSuscriptor = contenido.id_suscriptor;
    if (!idSuscriptor) {
      return NextResponse.json(
        { ok: false, motivo: "sin_suscriptor", detalle: "El contenido no tiene suscriptor asignado" },
        { status: 422 }
      );
    }

    const { data: sus, error: susErr } = await supabase
      .from("suscriptores")
      .select("id, nombre, whatsapp, premium_activo, whatsapp_confirmado, estado_mensaje")
      .eq("id", idSuscriptor)
      .maybeSingle();

    if (susErr || !sus) {
      return NextResponse.json(
        { ok: false, motivo: "suscriptor_no_encontrado", detalle: `Suscriptor #${idSuscriptor} no encontrado` },
        { status: 404 }
      );
    }

    if (!sus.whatsapp) {
      return NextResponse.json(
        { ok: false, motivo: "sin_whatsapp", detalle: "El suscriptor no tiene número de WhatsApp" },
        { status: 422 }
      );
    }
    if (sus.premium_activo !== true) {
      return NextResponse.json(
        { ok: false, motivo: "premium_inactivo", detalle: "El suscriptor no tiene premium activo" },
        { status: 422 }
      );
    }
    if (sus.whatsapp_confirmado !== true) {
      return NextResponse.json(
        { ok: false, motivo: "whatsapp_no_confirmado", detalle: "El suscriptor no tiene WhatsApp confirmado" },
        { status: 422 }
      );
    }
    if (sus.estado_mensaje === "pausado_usuario") {
      return NextResponse.json(
        { ok: false, motivo: "mensajes_pausados", detalle: "El suscriptor tiene los mensajes pausados" },
        { status: 422 }
      );
    }

    // Idempotency: only block if there's a non-final active entry
    const { data: activoRows, error: activoErr } = await supabase
      .from("mensajes_enviados")
      .select("id, estado")
      .eq("tipo_mensaje", "premium")
      .eq("id_contenido", idNum)
      .in("estado", ["pendiente", "procesando"])
      .limit(1);

    if (activoErr) {
      return NextResponse.json(
        { ok: false, motivo: "db_error", detalle: activoErr.message },
        { status: 500 }
      );
    }

    if (activoRows && activoRows.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          motivo: "ya_encolado",
          detalle: `Ya existe un mensaje activo en la cola (id=${activoRows[0].id}, estado=${activoRows[0].estado}). No se puede reencolar.`,
        },
        { status: 422 }
      );
    }

    // Resolve template name from plantillas table
    const tipoContenido = String(contenido.tipo ?? "").trim().toLowerCase();
    const clavePlantilla =
      tipoContenido === "domingo" ? "contenido_premium_domingo" : "contenido_premium_diario";

    const { data: plantillaRow, error: plantillaErr } = await supabase
      .from("plantillas")
      .select("contenido")
      .eq("nombre", clavePlantilla)
      .maybeSingle();

    if (plantillaErr || !plantillaRow?.contenido) {
      return NextResponse.json(
        {
          ok: false,
          motivo: "plantilla_no_encontrada",
          detalle: `Plantilla '${clavePlantilla}' no encontrada en tabla plantillas`,
        },
        { status: 500 }
      );
    }

    const nombrePlantilla = plantillaRow.contenido as string;
    const c = parseContenido(contenido.contenido);

    let variables: Record<string, string>;
    if (tipoContenido === "domingo") {
      variables = {
        nombre: (sus.nombre as string) || "te",
        balance_semanal: (c.balance_semanal as string) ?? "",
        intencion_semana: (c.intencion_semana as string) ?? "",
        ritual_simple: (c.ritual_simple as string) ?? "",
        cierre_inspirador: (c.cierre_inspirador as string) ?? "",
      };
    } else {
      variables = {
        saludo_inicial: (c.saludo_inicial as string) ?? "",
        horoscopo: (c.horoscopo as string) ?? "",
        contenido_preferido: (c.contenido_preferido as string) ?? "",
        numero: String(c.numero ?? ""),
        color: (c.color as string) ?? "",
        pausa: (c.pausa as string) ?? "",
        pie_de_pagina: (c.pie_de_pagina as string) ?? "",
      };
    }

    const outboxRow = {
      fecha_hora: tsNow,
      whatsapp_destino: sus.whatsapp,
      tipo_mensaje: "premium",
      estado: "pendiente",
      id_suscriptor: idSuscriptor,
      id_contenido: idNum,
      canal_envio: "whatsapp",
      resultado_envio: null,
      mensaje_id_whatsapp: null,
      intentos: 0,
      ultimo_error: null,
      reintentar_despues: null,
      fecha_creado: tsNow,
      fecha_enviado: null,
      fecha_delivered: null,
      fecha_read: null,
      metadata: {
        origen: "admin_reencolar",
        tipo_contenido: contenido.tipo ?? null,
        fecha_envio_programada: contenido.fecha_envio_programada ?? null,
        variables,
        plantilla_clave: clavePlantilla,
        plantilla_resuelta: nombrePlantilla,
        motivo_admin: motivo,
      },
      nombre_plantilla: nombrePlantilla,
    };

    const { data: ins, error: insErr } = await supabase
      .from("mensajes_enviados")
      .insert([outboxRow])
      .select("id")
      .maybeSingle();

    if (insErr || !ins?.id) {
      await supabase.from("log_funciones").insert({
        nombre_funcion: "admin_panel_contenido_accion",
        fecha_ejecucion: tsNow,
        resultado: "reencolar_insert_error",
        detalle: { id_contenido: idNum, accion, motivo, error: insErr?.message },
        exito: false,
        creado_por: "admin_panel",
      });
      return NextResponse.json(
        { ok: false, motivo: "db_error", detalle: insErr?.message ?? "Insert falló" },
        { status: 500 }
      );
    }

    const idMensaje = ins.id;

    await supabase
      .from("contenido_premium")
      .update({ estado_envio: "encolado" })
      .eq("id", idNum);

    await supabase.from("log_funciones").insert({
      nombre_funcion: "admin_panel_contenido_accion",
      fecha_ejecucion: tsNow,
      resultado: "reencolar_ok",
      detalle: {
        id_contenido: idNum,
        id_mensaje: idMensaje,
        accion,
        motivo,
        estado_anterior: contenido.estado_envio,
      },
      exito: true,
      creado_por: "admin_panel",
    });

    return NextResponse.json({
      ok: true,
      accion,
      id_contenido: idNum,
      id_mensaje: idMensaje,
      mensaje:
        "Contenido encolado en mensajes_enviados (estado: pendiente). El sender lo procesará en el próximo ciclo.",
    });
  }

  // ============================================================
  // ACCION: cancelar_pendiente
  // Busca el mensaje activo (pendiente/procesando) para este contenido,
  // lo marca como fallo_definitivo, y resetea contenido_premium.estado_envio
  // a 'generado' para permitir re-encolado manual posterior.
  // ============================================================
  if (accion === "cancelar_pendiente") {
    const { data: activoRows, error: activoErr } = await supabase
      .from("mensajes_enviados")
      .select("id, estado")
      .eq("tipo_mensaje", "premium")
      .eq("id_contenido", idNum)
      .in("estado", ["pendiente", "procesando"])
      .limit(1);

    if (activoErr) {
      return NextResponse.json(
        { ok: false, motivo: "db_error", detalle: activoErr.message },
        { status: 500 }
      );
    }

    if (!activoRows || activoRows.length === 0) {
      // No active entry — reset contenido state anyway
      await supabase
        .from("contenido_premium")
        .update({ estado_envio: "generado" })
        .eq("id", idNum)
        .eq("estado_envio", "encolado");

      await supabase.from("log_funciones").insert({
        nombre_funcion: "admin_panel_contenido_accion",
        fecha_ejecucion: tsNow,
        resultado: "cancelar_pendiente_sin_outbox",
        detalle: { id_contenido: idNum, accion, motivo },
        exito: true,
        creado_por: "admin_panel",
      });

      return NextResponse.json({
        ok: true,
        accion,
        id_contenido: idNum,
        mensaje:
          "No había mensaje activo en la cola. Estado del contenido reseteado a 'generado'.",
      });
    }

    const idMensaje = activoRows[0].id;

    const { error: updMsgErr } = await supabase
      .from("mensajes_enviados")
      .update({ estado: "fallo_definitivo", ultimo_error: `Cancelado por admin: ${motivo}` })
      .eq("id", idMensaje)
      .in("estado", ["pendiente", "procesando"]);

    if (updMsgErr) {
      return NextResponse.json(
        { ok: false, motivo: "db_error", detalle: updMsgErr.message },
        { status: 500 }
      );
    }

    await supabase
      .from("contenido_premium")
      .update({ estado_envio: "generado" })
      .eq("id", idNum);

    await supabase.from("log_funciones").insert({
      nombre_funcion: "admin_panel_contenido_accion",
      fecha_ejecucion: tsNow,
      resultado: "cancelar_pendiente_ok",
      detalle: { id_contenido: idNum, id_mensaje: idMensaje, accion, motivo },
      exito: true,
      creado_por: "admin_panel",
    });

    return NextResponse.json({
      ok: true,
      accion,
      id_contenido: idNum,
      id_mensaje: idMensaje,
      mensaje:
        "Mensaje cancelado (marcado como fallo_definitivo). El contenido volvió a estado 'generado' y puede re-encolarse manualmente.",
    });
  }

  return NextResponse.json({ ok: false, motivo: "accion_no_implementada" }, { status: 500 });
}
