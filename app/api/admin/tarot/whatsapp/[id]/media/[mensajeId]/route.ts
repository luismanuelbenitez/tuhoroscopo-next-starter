import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnvOrError(): { supabaseUrl: string; internalKey: string; serviceRoleKey: string } | NextResponse {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !internalKey || !serviceRoleKey)
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  return { supabaseUrl, internalKey, serviceRoleKey };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Proxy protegido: obtiene el media real de un mensaje de WhatsApp vía
// ef_tarot_whatsapp_media (que llama a la Graph API de Meta server-side).
// El token de Meta nunca llega al navegador — esta ruta solo reenvía bytes.
//
// Endurecido (2026-10-21, P0-a): la EF valida que el mensaje sea de esta
// conversación, aplica allowlist de tipos + firma de bytes y bloquea el
// resto. Acá, además, las cabeceras de seguridad se fijan SIEMPRE (no se
// confía en lo que venga): nosniff + CSP sandbox, para que el contenido que
// manda un desconocido nunca pueda ejecutarse en el dominio del Admin.
export async function GET(_req: NextRequest, { params }: { params: { id: string; mensajeId: string } }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  if (!UUID.test(params.id) || !UUID.test(params.mensajeId)) {
    return NextResponse.json({ ok: false, motivo: "parametros_invalidos" }, { status: 400 });
  }

  const env = getEnvOrError();
  if (env instanceof NextResponse) return env;

  let res: Response;
  try {
    res = await fetch(`${env.supabaseUrl}/functions/v1/ef_tarot_whatsapp_media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.serviceRoleKey}`,
        "x-internal-key": env.internalKey,
      },
      body: JSON.stringify({ mensaje_id: params.mensajeId, conversacion_id: params.id }),
      cache: "no-store",
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({ ok: false, motivo: "respuesta_invalida" }));
    return NextResponse.json(data, { status: res.status });
  }

  const disposition = res.headers.get("content-disposition") ?? "";
  const bytes = await res.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      // Solo inline si la EF lo marcó inline (imagen/audio/video verificados).
      "Content-Disposition": disposition.startsWith("inline") ? disposition : (disposition || "attachment"),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, max-age=300",
    },
  });
}
