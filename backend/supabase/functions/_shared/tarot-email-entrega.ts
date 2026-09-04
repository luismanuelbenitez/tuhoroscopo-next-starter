// ============================================================
// _shared/tarot-email-entrega.ts — HTML del email de entrega de "Tu Tirada"
//
// Puerta de entrada al MISMO producto que WhatsApp — no una experiencia
// paralela: cabezal personalizado (mismo PNG real 1600×800, mismas 5
// cartas/orientaciones/mazo) → CTA principal a /lectura/<token> (misma
// experiencia mobile temporal, mismo token, mismos 30 días) → CTA
// secundario al mismo PDF. Nunca reproduce contenido narrativo
// (resumen/mensaje/nombres de cartas/pregunta) — eso es lo que el CTA
// revela, no el email (mismo principio que ya regía el email anterior,
// ver docs/product/DECISIONS.md 2026-08-16).
//
// Compartido por ef_tarot_enviar_email (envío real) y
// ef_tarot_admin_orden_experiencia (preview de admin, sin enviar nada) —
// mismo HTML en ambos casos, ninguno lo reimplementa por su cuenta.
// ============================================================

export interface DatosEmailEntrega {
  nombreCorto: string;
  /** null si el cabezal no se pudo generar/firmar — se omite la imagen, el resto del email sigue igual. */
  cabezalUrl: string | null;
  /** null si no hay acceso web disponible — se omite el CTA principal, nunca un link roto. */
  lecturaUrl: string | null;
  /** Siempre presente — requisito para que el envío exista (igual que antes de este sprint). */
  pdfUrl: string;
  /** "4 de octubre de 2026" — null si lecturaUrl es null. */
  expiraLecturaStr: string | null;
}

export function buildHtmlEntregaEmail(datos: DatosEmailEntrega): string {
  const { nombreCorto, cabezalUrl, lecturaUrl, pdfUrl, expiraLecturaStr } = datos;

  const cabezalBlock = cabezalUrl ? `
          <!-- Cabezal personalizado (mismo PNG real de WhatsApp) -->
          <tr>
            <td style="padding-bottom:28px;">
              ${lecturaUrl ? `<a href="${lecturaUrl}" style="display:block;text-decoration:none;border:0;">` : ""}
              <img src="${cabezalUrl}" alt="Tu Oráculo · Tu Tirada — cabezal personalizado con tus 5 cartas para ${nombreCorto}"
                   width="560"
                   style="display:block;width:100%;max-width:560px;height:auto;border-radius:14px;border:1px solid rgba(251,191,36,0.20);outline:none;text-decoration:none;" />
              ${lecturaUrl ? `</a>` : ""}
            </td>
          </tr>` : "";

  const ctaPrincipalBlock = lecturaUrl ? `
              <a href="${lecturaUrl}"
                 style="display:inline-block;background:linear-gradient(135deg,#c9930a,#f5c842);color:#0f0820;font-weight:700;font-size:16px;padding:16px 40px;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">
                🔮 Ver mi tirada
              </a>
              <p style="margin:14px 0 0;font-size:12px;color:rgba(255,255,255,0.35);">
                Tu lectura online estará disponible durante 30 días${expiraLecturaStr ? ` (hasta el ${expiraLecturaStr})` : ""}.
              </p>
              <div style="height:22px;line-height:22px;font-size:1px;">&nbsp;</div>` : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Tu Tirada · Tu Oráculo</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0820;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0d0820;min-height:100vh;">
    <tr>
      <td align="center" style="padding:32px 16px 48px;">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(251,191,36,0.45),transparent);margin-bottom:24px;"></div>
              <img src="https://tuoraculo.uy/img/logo/logo-isotipo.png" alt="Tu Oráculo" width="56" height="56" style="display:block;margin:0 auto 10px;border:0;outline:none;text-decoration:none;" />
              <p style="margin:0;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.30);">Tu Oráculo</p>
            </td>
          </tr>
${cabezalBlock}
          <!-- Mensaje + CTAs -->
          <tr>
            <td style="background:rgba(255,255,255,0.03);border:1px solid rgba(251,191,36,0.20);border-radius:14px;padding:28px 24px;text-align:center;">
              <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#ffffff;line-height:1.35;">
                Hola, <strong>${nombreCorto}</strong>.<br>Tu tirada ya está lista.
              </h1>
              <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.65;">
                Gracias por confiar en Tu Oráculo. Preparamos tu lectura personalizada a partir de tu consulta y de las cinco cartas que aparecieron para vos.
              </p>
${ctaPrincipalBlock}
              <a href="${pdfUrl}"
                 style="display:inline-block;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);color:#f0e9d8;font-weight:600;font-size:14px;padding:13px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">
                📜 Ver / descargar PDF
              </a>
              <p style="margin:14px 0 0;font-size:11px;color:rgba(255,255,255,0.25);">
                El PDF queda como tu versión para conservar.
              </p>
            </td>
          </tr>

          <!-- Spacer -->
          <tr><td style="height:36px;"></td></tr>

          <!-- Footer -->
          <tr>
            <td style="text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;">
              <p style="margin:0 0 10px;font-size:11px;color:rgba(255,255,255,0.22);line-height:1.65;">
                Esta lectura es generada con inteligencia artificial aplicando simbología del tarot tradicional.<br>
                No constituye una predicción del futuro ni reemplaza consejo profesional de ningún tipo.
              </p>
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.20);">
                Tu Oráculo &nbsp;·&nbsp;
                <a href="https://tuoraculo.uy" style="color:rgba(251,191,36,0.40);text-decoration:none;">tuoraculo.uy</a>
              </p>
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(251,191,36,0.25),transparent);margin-top:24px;"></div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}
