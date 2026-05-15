import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

// Raw shapes from ef_admin_resumen_diario — only fields we whitelist
type RawMensajeEnviado = {
  tipo_mensaje?: string;
  nombre_plantilla?: string | null;
  fecha_enviado?: string;
};

type RawMensajeFallido = {
  tipo_mensaje?: string;
  nombre_plantilla?: string | null;
  estado?: string;
  intentos?: number;
  ultimo_error?: string | null;
  fecha_ultimo_intento?: string | null;
};

type RawError = {
  nombre_funcion?: string;
  resultado?: string;
  fecha_ejecucion?: string;
};

export async function GET() {
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

  const efUrl = `${supabaseUrl}/functions/v1/ef_admin_resumen_diario`;

  let res: Response;
  try {
    res = await fetch(efUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify({ log: false }),
      cache: "no-store",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, motivo: "fetch_error", detalle: msg },
      { status: 502 }
    );
  }

  if (!res.ok) {
    let efMotivo: string | null = null;
    try {
      const errData = await res.json();
      efMotivo = errData.motivo ?? errData.message ?? errData.error ?? null;
    } catch {
      // sin JSON
    }
    return NextResponse.json(
      {
        ok: false,
        motivo: "ef_error",
        detalle: efMotivo
          ? `EF devolvió: ${efMotivo} (HTTP ${res.status})`
          : `Error ${res.status} desde Edge Function`,
        efStatus: res.status,
      },
      { status: 502 }
    );
  }

  const data = await res.json();

  // Sanitize arrays: whitelist only non-PII fields.
  // Removed: id, id_suscriptor, whatsapp_destino, mensaje_id_whatsapp, detalle, fecha_creado
  const enviados = Array.isArray(data.ultimos_mensajes_enviados_del_dia)
    ? (data.ultimos_mensajes_enviados_del_dia as RawMensajeEnviado[]).map((m) => ({
        tipo_mensaje: m.tipo_mensaje ?? "",
        nombre_plantilla: m.nombre_plantilla ?? null,
        fecha_enviado: m.fecha_enviado ?? "",
      }))
    : [];

  const fallidos = Array.isArray(data.ultimos_mensajes_fallidos_actuales)
    ? (data.ultimos_mensajes_fallidos_actuales as RawMensajeFallido[]).map((m) => ({
        tipo_mensaje: m.tipo_mensaje ?? "",
        nombre_plantilla: m.nombre_plantilla ?? null,
        estado: m.estado ?? "",
        intentos: m.intentos ?? 0,
        ultimo_error: m.ultimo_error ?? null,
        fecha_ultimo_intento: m.fecha_ultimo_intento ?? null,
      }))
    : [];

  const errores = Array.isArray(data.ultimos_errores_del_dia)
    ? (data.ultimos_errores_del_dia as RawError[]).map((e) => ({
        nombre_funcion: e.nombre_funcion ?? "",
        resultado: e.resultado ?? "",
        fecha_ejecucion: e.fecha_ejecucion ?? "",
      }))
    : [];

  return NextResponse.json({
    ok: data.ok ?? false,
    ultimos_mensajes_enviados: enviados,
    ultimos_mensajes_fallidos: fallidos,
    ultimos_errores: errores,
  });
}
