import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

const TABLA_POR_CANAL: Record<string, string> = {
  whatsapp: "tarot_envios_whatsapp",
  email: "tarot_envios_email",
};

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function restHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, apikey: key };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;
  const { id } = params;

  const canal = req.nextUrl.searchParams.get("canal");
  const tabla = canal ? TABLA_POR_CANAL[canal] : null;
  if (!tabla) {
    return NextResponse.json({ ok: false, motivo: "canal_invalido", detalle: "Usar ?canal=whatsapp o ?canal=email" }, { status: 400 });
  }

  const h = restHeaders(serviceRoleKey);

  const arr = await fetch(
    `${supabaseUrl}/rest/v1/${tabla}?id=eq.${id}&select=*`,
    { headers: h, cache: "no-store" },
  ).then((r) => (r.ok ? r.json().catch(() => []) : []));

  const envio = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  if (!envio) {
    return NextResponse.json({ ok: false, motivo: "entrega_no_encontrada" }, { status: 404 });
  }

  const ordenArr = await fetch(
    `${supabaseUrl}/rest/v1/tarot_ordenes?id=eq.${envio.orden_id}&select=id,estado,external_reference,cliente_id,tarot_clientes(nombre_completo,telefono,email)`,
    { headers: h, cache: "no-store" },
  ).then((r) => (r.ok ? r.json().catch(() => []) : []));
  const orden = Array.isArray(ordenArr) && ordenArr.length > 0 ? ordenArr[0] : null;

  const lecturaArr = await fetch(
    `${supabaseUrl}/rest/v1/tarot_lecturas?orden_id=eq.${envio.orden_id}&es_vigente=eq.true&select=id`,
    { headers: h, cache: "no-store" },
  ).then((r) => (r.ok ? r.json().catch(() => []) : []));
  const lectura = Array.isArray(lecturaArr) && lecturaArr.length > 0 ? lecturaArr[0] : null;

  const solicitudesArr = await fetch(
    `${supabaseUrl}/rest/v1/tarot_solicitudes_reenvio?orden_id=eq.${envio.orden_id}&canal=eq.${canal}&select=*&order=solicitado_at.desc`,
    { headers: h, cache: "no-store" },
  ).then((r) => (r.ok ? r.json().catch(() => []) : []));

  return NextResponse.json({
    ok: true,
    canal,
    entrega: envio,
    orden,
    lectura,
    solicitudes: Array.isArray(solicitudesArr) ? solicitudesArr : [],
  });
}
