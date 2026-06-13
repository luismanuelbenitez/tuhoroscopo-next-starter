import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function restHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, apikey: key };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;
  const { id } = params;

  const [rLectura, rOrden] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/tarot_lecturas?id=eq.${id}` +
        `&select=id,orden_id,estado,numero_intento,es_vigente,ia_modelo,` +
        `ia_tokens_entrada,ia_tokens_salida,ia_costo_usd,contenido_json,` +
        `resumen_lectura,mensaje_final,error_codigo,error_mensaje,error_detalle,` +
        `generado_at,created_at,updated_at`,
      { headers: restHeaders(serviceRoleKey), cache: "no-store" },
    ),
    // Fetch orden for reintentar action context
    fetch(
      `${supabaseUrl}/rest/v1/tarot_ordenes?id=eq.${params.id}`,
      { headers: restHeaders(serviceRoleKey), cache: "no-store" },
    ),
  ]);

  const arr = await (rLectura.ok ? rLectura.json().catch(() => []) : Promise.resolve([]));
  const lectura = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  if (!lectura) {
    return NextResponse.json({ ok: false, motivo: "lectura_no_encontrada" }, { status: 404 });
  }

  // Fetch orden_id from lectura to get orden state
  const rOrden2 = await fetch(
    `${supabaseUrl}/rest/v1/tarot_ordenes?id=eq.${lectura.orden_id}&select=id,estado`,
    { headers: restHeaders(serviceRoleKey), cache: "no-store" },
  );
  const ordenArr = await (rOrden2.ok ? rOrden2.json().catch(() => []) : Promise.resolve([]));
  const orden = Array.isArray(ordenArr) && ordenArr.length > 0 ? ordenArr[0] : null;

  return NextResponse.json({ ok: true, lectura, orden });
}
