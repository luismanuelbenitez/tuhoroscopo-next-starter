import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

// Allowlist local — subconjunto de las 8 acciones del EF.
// Solo las acciones premium expuestas en esta sprint.
const ACCIONES_PERMITIDAS = [
  "activar_premium_manual",
  "desactivar_premium_manual",
  "cambiar_fecha_vencimiento",
  "cambiar_estado_suscripcion",
] as const;

type AccionPermitida = (typeof ACCIONES_PERMITIDAS)[number];

const ESTADOS_SUSCRIPCION_PERMITIDOS = [
  "pendiente_autorizacion",
  "activa",
  "suspendida",
  "cancelada_no_renueva",
  "finalizada",
] as const;

function isValidYYYYMMDD(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime());
}

type SuscriptorRaw = {
  estado_suscripcion?: string | null;
  estado_mensaje?: string | null;
  premium_activo?: boolean | null;
  whatsapp_confirmado?: boolean | null;
  fecha_inicio_premium?: string | null;
  fecha_vencimiento_premium?: string | null;
  fecha_baja?: string | null;
  motivo_baja?: string | null;
  actualizado_en?: string | null;
};

function sanitizarSuscriptor(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as SuscriptorRaw;
  return {
    estado_suscripcion: s.estado_suscripcion ?? null,
    estado_mensaje: s.estado_mensaje ?? null,
    premium_activo: s.premium_activo ?? null,
    whatsapp_confirmado: s.whatsapp_confirmado ?? null,
    fecha_inicio_premium: s.fecha_inicio_premium ?? null,
    fecha_vencimiento_premium: s.fecha_vencimiento_premium ?? null,
    fecha_baja: s.fecha_baja ?? null,
    motivo_baja: s.motivo_baja ?? null,
    actualizado_en: s.actualizado_en ?? null,
  };
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.WHATSAPP_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", detalle: "SUPABASE_URL no configurada" },
      { status: 500 }
    );
  }
  if (!internalKey) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", detalle: "WHATSAPP_INTERNAL_KEY no configurada" },
      { status: 500 }
    );
  }
  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", detalle: "SUPABASE_SERVICE_ROLE_KEY no configurada" },
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

  // --- Validate id_suscriptor ---
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

  // --- Validate accion ---
  const accion = typeof body.accion === "string" ? body.accion.trim() : "";
  if (!accion) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "accion_requerida",
        detalle: `Enviar accion. Permitidas: ${ACCIONES_PERMITIDAS.join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (!ACCIONES_PERMITIDAS.includes(accion as AccionPermitida)) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "accion_invalida",
        detalle: `Acción no permitida. Permitidas: ${ACCIONES_PERMITIDAS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // --- Validate motivo ---
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
  if (!motivo || motivo.length < 5) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "motivo_requerido",
        detalle: "El motivo es obligatorio y debe tener al menos 5 caracteres",
      },
      { status: 400 }
    );
  }

  // --- Build EF body ---
  const efBody: Record<string, unknown> = {
    id_suscriptor: idNum,
    accion,
    motivo,
    solicitado_por: "admin_panel",
  };

  // --- Action-specific validation ---
  if (accion === "activar_premium_manual" || accion === "cambiar_fecha_vencimiento") {
    const fecha =
      typeof body.fecha_vencimiento_premium === "string"
        ? body.fecha_vencimiento_premium.trim()
        : "";
    if (!fecha || !isValidYYYYMMDD(fecha)) {
      return NextResponse.json(
        {
          ok: false,
          motivo: "fecha_vencimiento_premium_invalida",
          detalle: "Enviar fecha_vencimiento_premium en formato YYYY-MM-DD",
        },
        { status: 400 }
      );
    }
    efBody.fecha_vencimiento_premium = fecha;
  }

  if (accion === "cambiar_estado_suscripcion") {
    const nuevoEstado =
      typeof body.nuevo_estado_suscripcion === "string"
        ? body.nuevo_estado_suscripcion.trim()
        : "";
    if (
      !nuevoEstado ||
      !ESTADOS_SUSCRIPCION_PERMITIDOS.includes(
        nuevoEstado as (typeof ESTADOS_SUSCRIPCION_PERMITIDOS)[number]
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          motivo: "nuevo_estado_suscripcion_invalido",
          detalle: `nuevo_estado_suscripcion debe ser uno de: ${ESTADOS_SUSCRIPCION_PERMITIDOS.join(", ")}`,
        },
        { status: 400 }
      );
    }
    efBody.nuevo_estado_suscripcion = nuevoEstado;
  }

  // --- Call EF ---
  const efUrl = `${supabaseUrl}/functions/v1/ef_admin_cambiar_estado_suscriptor`;

  let res: Response;
  try {
    res = await fetch(efUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify(efBody),
      cache: "no-store",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, motivo: "fetch_error", detalle: msg },
      { status: 502 }
    );
  }

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        motivo: "ef_respuesta_invalida",
        detalle: `HTTP ${res.status} sin JSON válido`,
      },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "ef_error",
        detalle: (data.motivo ?? data.mensaje ?? data.error ?? `Error ${res.status} desde Edge Function`) as string,
        efStatus: res.status,
      },
      { status: 502 }
    );
  }

  // --- Sanitize: excluir PII y notas_internas de suscriptor_anterior/actualizado ---
  return NextResponse.json({
    ok: true,
    accion: data.accion ?? accion,
    id_suscriptor: idNum,
    mensaje: (data.mensaje as string) ?? "Cambio administrativo aplicado correctamente.",
    suscriptor_anterior: sanitizarSuscriptor(data.suscriptor_anterior),
    suscriptor_actualizado: sanitizarSuscriptor(data.suscriptor_actualizado),
  });
}
