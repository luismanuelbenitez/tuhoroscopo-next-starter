import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

// [id] = orden_id. Dispara un envío de email DIRECTO (sin solicitud/autorización)
// para una orden que todavía no tiene ningún intento de email — el mismo caso
// que el despacho automático de ef_tarot_generar_pdf cubre para una compra nueva.
// verificarPermisoEnvio() (_shared/tarot-entregas.ts) ya permite esto sin
// autorización cuando no existe un envío exitoso previo para el canal — este
// endpoint no le agrega gobernanza propia, solo la invoca.
//
// Para reenviar sobre un email que YA tuvo al menos un intento, usar el flujo
// existente: /api/admin/tarot/entregas/solicitar-reenvio (canal="email") →
// autorización → ef_tarot_enviar_email con autorizacion_id.
//
// El destino del email nunca sale del body de este request — sale exclusivamente
// de tarot_clientes.email vía la orden, dentro de ef_tarot_enviar_email. Este
// endpoint no reenvía ningún campo del body del cliente hacia la Edge Function.

function getEnv(): { supabaseUrl: string; internalKey: string; serviceRoleKey: string } | null {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !internalKey || !serviceRoleKey) return null;
  return { supabaseUrl, internalKey, serviceRoleKey };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, internalKey, serviceRoleKey } = env;

  const ordenId = params.id;
  if (!UUID_RE.test(ordenId)) {
    return NextResponse.json({ ok: false, motivo: "orden_id_invalido" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/ef_tarot_enviar_email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      // Sin autorizacion_id: es un envío directo, no un reenvío sobre un
      // éxito previo. Solo orden_id — el destino lo resuelve la propia EF.
      body: JSON.stringify({ orden_id: ordenId }),
      cache: "no-store",
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
