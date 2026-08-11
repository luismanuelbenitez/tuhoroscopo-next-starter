import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function hdrs(key: string): Record<string, string> {
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

  // 1. Fetch lectura
  const rLectura = await fetch(
    `${supabaseUrl}/rest/v1/tarot_lecturas?id=eq.${id}` +
      `&select=id,orden_id,estado,numero_intento,es_vigente,ia_modelo,` +
      `ia_tokens_entrada,ia_tokens_salida,ia_costo_usd,contenido_json,` +
      `resumen_lectura,mensaje_final,error_codigo,error_mensaje,error_detalle,` +
      `generado_at,created_at,updated_at&limit=1`,
    { headers: hdrs(serviceRoleKey), cache: "no-store" },
  );

  const lecturaArr = await (rLectura.ok ? rLectura.json().catch(() => []) : Promise.resolve([]));
  const lectura = Array.isArray(lecturaArr) && lecturaArr.length > 0 ? lecturaArr[0] : null;
  if (!lectura) return NextResponse.json({ ok: false, motivo: "lectura_no_encontrada" }, { status: 404 });

  // 2. Fetch orden
  const rOrden = await fetch(
    `${supabaseUrl}/rest/v1/tarot_ordenes?id=eq.${lectura.orden_id}` +
      `&select=id,estado,tema,pregunta_usuario,precio_cobrado,moneda,cliente_id,created_at&limit=1`,
    { headers: hdrs(serviceRoleKey), cache: "no-store" },
  );
  const ordenArr = await (rOrden.ok ? rOrden.json().catch(() => []) : Promise.resolve([]));
  const orden = Array.isArray(ordenArr) && ordenArr.length > 0 ? ordenArr[0] : null;

  // 3. Fetch cliente
  let cliente = null;
  if (orden?.cliente_id) {
    const rCliente = await fetch(
      `${supabaseUrl}/rest/v1/tarot_clientes?id=eq.${orden.cliente_id}` +
        `&select=id,nombre_completo,email,fecha_nacimiento,hora_nacimiento,lugar_nacimiento&limit=1`,
      { headers: hdrs(serviceRoleKey), cache: "no-store" },
    );
    const clienteArr = await (rCliente.ok ? rCliente.json().catch(() => []) : Promise.resolve([]));
    cliente = Array.isArray(clienteArr) && clienteArr.length > 0 ? clienteArr[0] : null;
  }

  // 4. Fetch narrative review
  const rReview = await fetch(
    `${supabaseUrl}/rest/v1/tarot_narrative_reviews?lectura_id=eq.${id}` +
      `&select=id,comprension,personalizacion,narrativa,descubrimiento,consejos,mensaje_final_eval,` +
      `riesgos,frase_memorable,observaciones,evaluador,prompt_version,fecha,created_at` +
      `&order=created_at.desc&limit=1`,
    { headers: hdrs(serviceRoleKey), cache: "no-store" },
  );
  const reviewArr = await (rReview.ok ? rReview.json().catch(() => []) : Promise.resolve([]));
  const review = Array.isArray(reviewArr) && reviewArr.length > 0 ? reviewArr[0] : null;

  return NextResponse.json({ ok: true, lectura, orden, cliente, review });
}
