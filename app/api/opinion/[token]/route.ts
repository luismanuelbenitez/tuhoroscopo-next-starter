import { NextResponse } from "next/server";
import { registrarFeedback } from "@/lib/feedbackPublico";

// Envío de la mini web de feedback. Idempotente: una respuesta por link
// (la segunda devuelve ok + ya_respondida, sin duplicar nada).
const MENSAJES: Record<string, string> = {
  rating_invalido: "Elegí de 1 a 5 estrellas para enviar tu opinión.",
  expirado: "Este enlace ya venció.",
  invalido: "No encontramos este enlace.",
  version_desactualizada: "Actualizamos los textos de autorización. Recargá la página y volvé a enviar tu opinión.",
  error: "No pudimos guardar tu opinión. Probá de nuevo.",
};

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, mensaje: MENSAJES.error }, { status: 400 });

  const resultado = await registrarFeedback(params.token, {
    rating: Number(body.rating),
    comentario: typeof body.comentario === "string" ? body.comentario : "",
    autorizaSitio: body.autoriza_sitio === true,
    autorizaDifusion: body.autoriza_difusion === true,
    versionSitio: String(body.version_sitio ?? ""),
    versionDifusion: String(body.version_difusion ?? ""),
    userAgent: req.headers.get("user-agent"),
  });

  if (resultado === "registrada" || resultado === "ya_respondida") {
    return NextResponse.json({ ok: true, resultado });
  }
  const status = resultado === "rating_invalido" ? 400 : resultado === "invalido" ? 404 : resultado === "expirado" ? 410 : resultado === "version_desactualizada" ? 409 : 500;
  return NextResponse.json({ ok: false, resultado, mensaje: MENSAJES[resultado] ?? MENSAJES.error }, { status });
}
