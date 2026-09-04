import { NextRequest, NextResponse } from "next/server";
import { resolverUrlPdfPublica } from "@/lib/tarotLecturaPublica";

export const dynamic = "force-dynamic";

// El PDF real vive en Storage privado con una signed URL que expira a las
// 48h (tarot_pdfs.storage_url). El botón "Descargar mi PDF" de la página
// mobile y el botón 2 del template de WhatsApp apuntan siempre a esta ruta
// propia, que firma una URL nueva en cada click — así el link sigue
// funcionando durante los 30 días de vida del token, no solo 48h.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params;
  const resultado = await resolverUrlPdfPublica(token);

  if (!resultado.ok) {
    const status = resultado.motivo === "no_encontrado" ? 404 : resultado.motivo === "expirado" ? 410 : 502;
    return NextResponse.json({ ok: false, motivo: resultado.motivo }, { status, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.redirect(resultado.url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
