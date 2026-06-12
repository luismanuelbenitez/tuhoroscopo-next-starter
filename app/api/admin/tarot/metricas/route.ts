import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

async function countTable(
  base: string,
  table: string,
  filters: string,
  headers: Record<string, string>,
): Promise<number> {
  const url = `${base}/${table}?select=id&limit=1${filters ? `&${filters}` : ""}`;
  const res = await fetch(url, { headers: { ...headers, Prefer: "count=exact" } });
  const range = res.headers.get("content-range");
  if (!range) return 0;
  const match = range.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });

  const { supabaseUrl, serviceRoleKey } = env;
  const base = `${supabaseUrl}/rest/v1`;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  const hoyISO = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const ESTADOS_PAGADO = "pago_confirmado,generando_lectura,lectura_lista,generando_pdf,pdf_listo,enviando_whatsapp,entregado";
  const ESTADOS_ERROR = "error_lectura,error_pdf,error_whatsapp,error_critico";

  try {
    const [
      totalOrdenes,
      ordenesHoy,
      ordenesPagadas,
      ordenesCompletadas,
      ordenesError,
      totalLecturas,
      lecturasHoy,
      totalPdfs,
      pdfsHoy,
      totalClientes,
    ] = await Promise.all([
      countTable(base, "tarot_ordenes", "", headers),
      countTable(base, "tarot_ordenes", `created_at=gte.${hoyISO}`, headers),
      countTable(base, "tarot_ordenes", `estado=in.(${ESTADOS_PAGADO})`, headers),
      countTable(base, "tarot_ordenes", "estado=eq.entregado", headers),
      countTable(base, "tarot_ordenes", `estado=in.(${ESTADOS_ERROR})`, headers),
      countTable(base, "tarot_lecturas", "es_vigente=eq.true", headers),
      countTable(base, "tarot_lecturas", `es_vigente=eq.true&created_at=gte.${hoyISO}`, headers),
      countTable(base, "tarot_pdfs", "estado=eq.generado", headers),
      countTable(base, "tarot_pdfs", `estado=eq.generado&created_at=gte.${hoyISO}`, headers),
      countTable(base, "tarot_clientes", "", headers),
    ]);

    return NextResponse.json({
      ok: true,
      ordenes: {
        total: totalOrdenes,
        hoy: ordenesHoy,
        pagadas: ordenesPagadas,
        completadas: ordenesCompletadas,
        con_error: ordenesError,
      },
      lecturas: {
        total: totalLecturas,
        hoy: lecturasHoy,
      },
      pdfs: {
        total: totalPdfs,
        hoy: pdfsHoy,
      },
      clientes: {
        total: totalClientes,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
