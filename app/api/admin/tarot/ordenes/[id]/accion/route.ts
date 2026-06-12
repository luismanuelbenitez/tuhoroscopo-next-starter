import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type Accion = "reintentar_lectura" | "reintentar_pdf";

const ESTADOS_VALIDOS: Record<Accion, string[]> = {
  reintentar_lectura: ["pago_confirmado", "error_lectura"],
  reintentar_pdf: ["lectura_lista", "error_pdf"],
};

const EF_MAP: Record<Accion, string> = {
  reintentar_lectura: "ef_tarot_generar_lectura",
  reintentar_pdf: "ef_tarot_generar_pdf",
};

const MENSAJE_OK: Record<Accion, string> = {
  reintentar_lectura: "Generación de lectura iniciada en segundo plano",
  reintentar_pdf: "Generación de PDF iniciada en segundo plano",
};

function getEnv(): { supabaseUrl: string; internalKey: string; serviceRoleKey: string } | null {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !internalKey || !serviceRoleKey) return null;
  return { supabaseUrl, internalKey, serviceRoleKey };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error", detalle: "Variables de entorno faltantes" }, { status: 500 });
  const { supabaseUrl, internalKey, serviceRoleKey } = env;

  const ordenId = params.id;
  if (!ordenId) return NextResponse.json({ ok: false, motivo: "orden_id_requerido" }, { status: 400 });

  let body: { accion?: string } = {};
  try { body = await req.json(); } catch { /* body vacío */ }

  const accion = body.accion as Accion | undefined;
  if (!accion || !["reintentar_lectura", "reintentar_pdf"].includes(accion)) {
    return NextResponse.json({ ok: false, motivo: "accion_invalida", detalle: 'accion debe ser "reintentar_lectura" o "reintentar_pdf"' }, { status: 400 });
  }

  // Verificar estado actual de la orden
  const restHeaders = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };

  let estadoActual: string;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/tarot_ordenes?id=eq.${encodeURIComponent(ordenId)}&select=id,estado&limit=1`,
      { headers: restHeaders, cache: "no-store" },
    );
    if (!res.ok) throw new Error(`REST ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, motivo: "orden_no_encontrada" }, { status: 404 });
    }
    estadoActual = rows[0].estado;
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  // Validar que el estado permita la acción
  if (!ESTADOS_VALIDOS[accion].includes(estadoActual)) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "estado_invalido",
        detalle: `La orden está en estado "${estadoActual}". Para "${accion}" se requiere uno de: ${ESTADOS_VALIDOS[accion].join(", ")}`,
      },
      { status: 422 },
    );
  }

  // Disparar EF fire-and-forget
  const efUrl = `${supabaseUrl}/functions/v1/${EF_MAP[accion]}`;
  const efBody: Record<string, unknown> = { orden_id: ordenId };

  fetch(efUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      "x-internal-key": internalKey,
    },
    body: JSON.stringify(efBody),
    cache: "no-store",
  }).catch(() => { /* fire-and-forget */ });

  return NextResponse.json({
    ok: true,
    accion,
    orden_id: ordenId,
    estado_previo: estadoActual,
    mensaje: MENSAJE_OK[accion],
  });
}
