import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

interface RegistroExport {
  numero_interno: number;
  codigo_interno: string;
  fecha_venta: string;
  orden_id: string;
  producto_nombre_snapshot: string;
  datos_cliente_snapshot: { nombre?: string | null; email?: string | null } | null;
  moneda: string;
  importe_neto: number;
  medio_pago: string;
  referencia_pago: string | null;
  estado_registro: string;
  comprobante_solicitado: boolean;
  estado_comprobante: string;
  tipo_comprobante: string | null;
  serie_comprobante: string | null;
  numero_comprobante: string | null;
  fecha_comprobante: string | null;
}

// Columnas de export — deliberadamente NO incluye payloads técnicos, tokens
// ni secretos (Task L). datos_cliente_snapshot solo aporta nombre/email,
// nunca teléfono ni documento en el CSV.
function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function aCsv(registros: RegistroExport[]): string {
  const encabezado = [
    "numero_interno", "codigo_interno", "fecha", "orden_id", "producto", "nombre_cliente", "email",
    "moneda", "importe_neto", "medio_pago", "referencia_pago", "estado_registro",
    "comprobante_solicitado", "estado_comprobante", "tipo_comprobante", "serie_comprobante",
    "numero_comprobante", "fecha_comprobante",
  ];
  const filas = registros.map((r) => [
    r.numero_interno, r.codigo_interno, r.fecha_venta, r.orden_id, r.producto_nombre_snapshot,
    r.datos_cliente_snapshot?.nombre ?? "", r.datos_cliente_snapshot?.email ?? "",
    r.moneda, r.importe_neto, r.medio_pago, r.referencia_pago ?? "", r.estado_registro,
    r.comprobante_solicitado ? "si" : "no", r.estado_comprobante,
    r.tipo_comprobante ?? "", r.serie_comprobante ?? "", r.numero_comprobante ?? "", r.fecha_comprobante ?? "",
  ].map(csvEscape).join(","));
  return [encabezado.join(","), ...filas].join("\n");
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !internalKey || !serviceRoleKey) {
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  }

  const { searchParams } = req.nextUrl;
  const efBody: Record<string, unknown> = { exportar: true };
  const passthrough = [
    "estado_registro", "estado_comprobante", "medio_pago", "producto_codigo",
    "fecha_desde", "fecha_hasta", "search",
  ];
  for (const key of passthrough) {
    const v = searchParams.get(key);
    if (v) efBody[key] = v;
  }
  const comprobanteSolicitado = searchParams.get("comprobante_solicitado");
  if (comprobanteSolicitado === "true") efBody.comprobante_solicitado = true;
  if (comprobanteSolicitado === "false") efBody.comprobante_solicitado = false;

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/ef_tarot_admin_listar_facturacion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify(efBody),
      cache: "no-store",
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ ok: false, motivo: "ef_error" }, { status: 502 });
  }

  const data = await res.json();
  const csv = aCsv((data.registros ?? []) as RegistroExport[]);
  const fecha = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="facturacion-tarot-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
