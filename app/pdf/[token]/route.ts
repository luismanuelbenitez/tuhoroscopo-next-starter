import { NextRequest, NextResponse } from "next/server";
import { resolverUrlPdfPublica } from "@/lib/tarotLecturaPublica";

export const dynamic = "force-dynamic";

// URL canónica pública para descargar el PDF de una tirada — pensada para
// el botón "Descargar PDF" del template de WhatsApp (`tu_tirada_lista_v1`),
// cuya URL dinámica DEBE llevar el parámetro como sufijo final
// (https://tuoraculo.uy/pdf/{{1}}), a diferencia de la ruta anterior
// (/api/lectura/[token]/pdf, que sigue existiendo por compatibilidad).
//
// Reutiliza el 100% de la validación/seguridad existente vía
// resolverUrlPdfPublica() (lib/tarotLecturaPublica.ts) → EF
// ef_tarot_lectura_publica: hash del token, estado=activo, expiración,
// resolución del PDF vigente — nada de eso se duplica acá.
//
// A diferencia de la ruta anterior (302 redirect a la signed URL de
// Storage), esta ruta hace PROXY del PDF: descarga los bytes server-side y
// los devuelve como respuesta propia. La URL visible en el navegador/cliente
// de WhatsApp queda siempre en tuoraculo.uy — nunca se expone la signed URL
// de Supabase Storage al cliente, ni siquiera en un header de redirect.
// Costo: un salto de red extra (Next.js → Storage → cliente) — aceptable
// para los tamaños reales de estos PDFs (few hundred KB, 3 páginas).
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params;
  const resultado = await resolverUrlPdfPublica(token);

  if (!resultado.ok) {
    const status = resultado.motivo === "no_encontrado" ? 404 : resultado.motivo === "expirado" ? 410 : 502;
    return NextResponse.json({ ok: false, motivo: resultado.motivo }, { status, headers: { "Cache-Control": "no-store" } });
  }

  const pdfRes = await fetch(resultado.url, { cache: "no-store" });
  if (!pdfRes.ok || !pdfRes.body) {
    return NextResponse.json({ ok: false, motivo: "pdf_fetch_error" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  return new NextResponse(pdfRes.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Tu-Tirada-Tu-Oraculo.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
