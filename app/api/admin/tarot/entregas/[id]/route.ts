import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

// [id] = orden_id. Devuelve la "película completa" de una orden: historial
// completo de WhatsApp, historial completo de Email, solicitudes de reenvío,
// y datos de orden/cliente/lectura/pdf. El detalle es por ORDEN, no por intento
// individual — los intentos son el historial dentro de cada canal.

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
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;
  const ordenId = params.id;
  const h = restHeaders(serviceRoleKey);

  const ordenArr = await fetch(
    `${supabaseUrl}/rest/v1/tarot_ordenes?id=eq.${ordenId}&select=id,estado,external_reference,created_at,cliente_id,email_solicitado,tarot_clientes(nombre_completo,telefono,email)`,
    { headers: h, cache: "no-store" },
  ).then((r) => (r.ok ? r.json().catch(() => []) : []));
  const orden = Array.isArray(ordenArr) && ordenArr.length > 0 ? ordenArr[0] : null;

  if (!orden) {
    return NextResponse.json({ ok: false, motivo: "orden_no_encontrada" }, { status: 404 });
  }

  const [waArr, emailArr, lecturaArr, pdfArr, solicitudesArr] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/tarot_envios_whatsapp?orden_id=eq.${ordenId}&select=*&order=created_at.desc`,
      { headers: h, cache: "no-store" }).then((r) => (r.ok ? r.json().catch(() => []) : [])),
    fetch(`${supabaseUrl}/rest/v1/tarot_envios_email?orden_id=eq.${ordenId}&select=*&order=created_at.desc`,
      { headers: h, cache: "no-store" }).then((r) => (r.ok ? r.json().catch(() => []) : [])),
    fetch(`${supabaseUrl}/rest/v1/tarot_lecturas?orden_id=eq.${ordenId}&es_vigente=eq.true&select=id`,
      { headers: h, cache: "no-store" }).then((r) => (r.ok ? r.json().catch(() => []) : [])),
    fetch(`${supabaseUrl}/rest/v1/tarot_pdfs?orden_id=eq.${ordenId}&estado=eq.listo&select=id&order=created_at.desc&limit=1`,
      { headers: h, cache: "no-store" }).then((r) => (r.ok ? r.json().catch(() => []) : [])),
    fetch(`${supabaseUrl}/rest/v1/tarot_solicitudes_reenvio?orden_id=eq.${ordenId}&select=*&order=solicitado_at.desc`,
      { headers: h, cache: "no-store" }).then((r) => (r.ok ? r.json().catch(() => []) : [])),
  ]);

  const lectura = Array.isArray(lecturaArr) && lecturaArr.length > 0 ? lecturaArr[0] : null;
  const pdf = Array.isArray(pdfArr) && pdfArr.length > 0 ? pdfArr[0] : null;

  return NextResponse.json({
    ok: true,
    orden,
    lectura,
    pdf,
    whatsapp: Array.isArray(waArr) ? waArr : [],
    email: Array.isArray(emailArr) ? emailArr : [],
    solicitudes: Array.isArray(solicitudesArr) ? solicitudesArr : [],
  });
}
