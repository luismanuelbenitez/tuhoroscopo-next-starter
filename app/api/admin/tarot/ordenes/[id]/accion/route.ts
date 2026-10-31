import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

type Accion = "reintentar_lectura" | "reintentar_pdf" | "reintentar_whatsapp";

const ESTADOS_VALIDOS: Record<Accion, string[]> = {
  // error_critico: solo si se agotaron los intentos de la IA y no hay
  // lectura (lo valida ef_tarot_generar_lectura con nueva_ronda; ver abajo).
  reintentar_lectura:  ["pago_confirmado", "error_lectura", "error_critico"],
  reintentar_pdf:      ["lectura_lista", "error_pdf"],
  reintentar_whatsapp: ["pdf_listo", "error_whatsapp"],
};

const EF_MAP: Record<Accion, string> = {
  reintentar_lectura:  "ef_tarot_generar_lectura",
  reintentar_pdf:      "ef_tarot_generar_pdf",
  reintentar_whatsapp: "ef_tarot_enviar_whatsapp",
};

const MENSAJE_OK: Record<Accion, string> = {
  reintentar_lectura:  "Generación de lectura iniciada en segundo plano",
  reintentar_pdf:      "Generación de PDF iniciada en segundo plano",
  reintentar_whatsapp: "Envío WhatsApp iniciado en segundo plano",
};

function getEnv(): { supabaseUrl: string; internalKey: string; serviceRoleKey: string } | null {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
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
  if (!accion || !["reintentar_lectura", "reintentar_pdf", "reintentar_whatsapp"].includes(accion)) {
    return NextResponse.json({ ok: false, motivo: "accion_invalida", detalle: 'accion debe ser "reintentar_lectura", "reintentar_pdf" o "reintentar_whatsapp"' }, { status: 400 });
  }

  // Verificar estado actual de la orden
  const restHeaders = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };

  let estadoActual: string;
  let deckSlug: string | null = null;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/tarot_ordenes?id=eq.${encodeURIComponent(ordenId)}&select=id,estado,mazo_id&limit=1`,
      { headers: restHeaders, cache: "no-store" },
    );
    if (!res.ok) throw new Error(`REST ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, motivo: "orden_no_encontrada" }, { status: 404 });
    }
    estadoActual = rows[0].estado;

    // Resolver deck slug cuando se va a regenerar el PDF
    if (accion === "reintentar_pdf" && rows[0].mazo_id) {
      const resMazo = await fetch(
        `${supabaseUrl}/rest/v1/tarot_mazos?id=eq.${encodeURIComponent(rows[0].mazo_id)}&select=slug&limit=1`,
        { headers: restHeaders, cache: "no-store" },
      );
      if (resMazo.ok) {
        const mazos = await resMazo.json();
        deckSlug = mazos?.[0]?.slug ?? null;
      }
    }
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

  // Regla (2026-10-31, Manuel): "Reintentar lectura" solo si la orden NO
  // tiene una lectura completada. La misma regla la aplica la EF; acá se
  // rechaza antes para dar un motivo claro en el admin.
  if (accion === "reintentar_lectura") {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/tarot_lecturas?orden_id=eq.${encodeURIComponent(ordenId)}&estado=eq.completada&select=id&limit=1`,
        { headers: restHeaders, cache: "no-store" },
      );
      if (!res.ok) throw new Error(`REST ${res.status}`);
      const filas = await res.json();
      if (Array.isArray(filas) && filas.length > 0) {
        return NextResponse.json(
          { ok: false, motivo: "ya_tiene_lectura", detalle: "La orden ya tiene una lectura completada: no se genera otra." },
          { status: 422 },
        );
      }
    } catch (e: unknown) {
      return NextResponse.json({ ok: false, motivo: "db_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }

  // Disparar la EF. Se espera su respuesta (202 inmediato; el trabajo sigue
  // en la EF): un fetch sin await puede cortarse cuando esta ruta responde.
  const efUrl = `${supabaseUrl}/functions/v1/${EF_MAP[accion]}`;
  const efBody: Record<string, unknown> = { orden_id: ordenId };
  if (accion === "reintentar_pdf" && deckSlug) efBody.deck = deckSlug;
  // Ronda nueva de intentos tras agotar los de la IA (la EF verifica que
  // haya habido intentos, así un error_critico de otro origen no pasa).
  if (accion === "reintentar_lectura" && estadoActual === "error_critico") efBody.nueva_ronda = true;

  try {
    const resEf = await fetch(efUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify(efBody),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!resEf.ok) {
      return NextResponse.json({ ok: false, motivo: "ef_error", detalle: `${EF_MAP[accion]} respondió ${resEf.status}` }, { status: 502 });
    }
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "ef_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    accion,
    orden_id: ordenId,
    estado_previo: estadoActual,
    mensaje: MENSAJE_OK[accion],
  });
}
