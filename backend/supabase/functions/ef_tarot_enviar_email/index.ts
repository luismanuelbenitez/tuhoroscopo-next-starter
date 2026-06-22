// ============================================================
// ef_tarot_enviar_email v2
// Email premium con PDF adjunto + resumen de la tirada.
// Invocado fire-and-forget desde ef_tarot_generar_pdf.
//
// Secrets requeridos:
//   RESEND_API_KEY            → API key de resend.com
//   RESEND_FROM               → "Tu Oráculo <hola@tuoraculo.uy>"
//   TAROT_INTERNAL_KEY        → clave interna
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.192.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM               = Deno.env.get("RESEND_FROM") ?? "Tu Oráculo <hola@tuoraculo.uy>";
const FN                        = "ef_tarot_enviar_email";

const ROMAN = ["I", "II", "III", "IV", "V"];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Logging ──────────────────────────────────────────────────────────────────

async function log(
  ordenId: string | null,
  evento: string,
  nivel: "info" | "warning" | "error",
  mensaje: string,
  payload: unknown = {},
) {
  try {
    await supabase.from("tarot_logs").insert({
      orden_id: ordenId, evento, nivel, mensaje,
      payload: payload ?? {}, funcion_origen: FN,
    });
  } catch { /* non-blocking */ }
}

// ── Template HTML ─────────────────────────────────────────────────────────────

type Carta = { numero: number; nombre_carta: string; nombre_posicion: string; invertida: boolean };

function buildHtml(opts: {
  nombreCorto:  string;
  tema:         string;
  pregunta:     string | null;
  cartas:       Carta[];
  resumen:      string | null;
  mensajeFinal: string | null;
  pdfUrl:       string;
  expiraStr:    string;
}): string {
  const { nombreCorto, tema, pregunta, cartas, resumen, mensajeFinal, pdfUrl, expiraStr } = opts;

  const cartasHtml = cartas
    .sort((a, b) => a.numero - b.numero)
    .map(c => {
      const roman = ROMAN[c.numero - 1] ?? String(c.numero);
      const inv   = c.invertida ? ' <span style="color:rgba(167,139,250,0.6);font-size:11px;">(invertida)</span>' : "";
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="width:28px;vertical-align:top;padding-top:1px;">
                  <span style="font-family:Georgia,serif;font-size:11px;color:rgba(251,191,36,0.55);letter-spacing:0.05em;">${roman}.</span>
                </td>
                <td style="vertical-align:top;">
                  <span style="font-size:12px;color:rgba(255,255,255,0.45);letter-spacing:0.06em;text-transform:uppercase;">${c.nombre_posicion}</span><br>
                  <span style="font-family:Georgia,serif;font-size:15px;color:#f0e8ff;font-weight:600;">${c.nombre_carta}${inv}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }).join("");

  const resumenHtml = resumen
    ? `<div style="margin-bottom:28px;">
        <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(251,191,36,0.55);">Lo que la tirada revela</p>
        <p style="margin:0;font-family:Georgia,serif;font-size:15px;color:rgba(255,255,255,0.80);line-height:1.70;">${resumen}</p>
       </div>`
    : "";

  const mensajeHtml = mensajeFinal
    ? `<div style="border-left:2px solid rgba(251,191,36,0.35);padding-left:16px;margin-bottom:28px;">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(251,191,36,0.55);">Un mensaje para vos</p>
        <p style="margin:0;font-family:Georgia,serif;font-size:15px;font-style:italic;color:rgba(255,255,255,0.75);line-height:1.70;">"${mensajeFinal}"</p>
       </div>`
    : "";

  const temaLabel = pregunta
    ? `<p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.1em;text-transform:uppercase;">Tu consulta</p>
       <p style="margin:0;font-family:Georgia,serif;font-size:15px;color:rgba(255,255,255,0.65);font-style:italic;">"${pregunta}"</p>`
    : `<p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.1em;text-transform:uppercase;">Tema</p>
       <p style="margin:0;font-family:Georgia,serif;font-size:15px;color:rgba(255,255,255,0.65);">${tema}</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Tu Tirada Cósmica · Tu Oráculo</title>
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
            <td style="padding-bottom:32px;text-align:center;">
              <!-- Gold top line -->
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(251,191,36,0.45),transparent);margin-bottom:28px;"></div>

              <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(251,191,36,0.55);">☽ &nbsp;✦&nbsp; ☾</p>
              <p style="margin:0 0 18px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.30);">Tu Oráculo</p>

              <h1 style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:normal;color:#ffffff;line-height:1.30;">
                Tu Tirada Cósmica<br>está lista, <strong>${nombreCorto}</strong>.
              </h1>
            </td>
          </tr>

          <!-- Tema / Pregunta -->
          <tr>
            <td style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:18px 22px;margin-bottom:24px;">
              ${temaLabel}
            </td>
          </tr>

          <!-- Spacer -->
          <tr><td style="height:24px;"></td></tr>

          <!-- Las 5 cartas -->
          <tr>
            <td style="background:rgba(88,28,180,0.10);border:1px solid rgba(139,92,246,0.20);border-radius:12px;padding:20px 22px;">
              <p style="margin:0 0 14px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(251,191,36,0.55);">Tus 5 cartas</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${cartasHtml}
              </table>
            </td>
          </tr>

          <!-- Spacer -->
          <tr><td style="height:28px;"></td></tr>

          <!-- Resumen + Mensaje final -->
          <tr>
            <td>
              ${resumenHtml}
              ${mensajeHtml}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background:rgba(255,255,255,0.03);border:1px solid rgba(251,191,36,0.20);border-radius:14px;padding:28px 24px;text-align:center;">
              <p style="margin:0 0 6px;font-size:11px;color:rgba(255,255,255,0.40);letter-spacing:0.1em;text-transform:uppercase;">Tu lectura completa</p>
              <p style="margin:0 0 22px;font-family:Georgia,serif;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.6;">
                El PDF con la interpretación carta por carta,<br>el resumen de la tirada y tus próximos pasos.
              </p>
              <a href="${pdfUrl}"
                 style="display:inline-block;background:linear-gradient(135deg,#c9930a,#f5c842);color:#0f0820;font-weight:700;font-size:15px;padding:15px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">
                Abrir mi lectura →
              </a>
              <p style="margin:16px 0 0;font-size:11px;color:rgba(255,255,255,0.25);">
                El PDF también está adjunto a este email.<br>
                El enlace expira el ${expiraStr}.
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
              <!-- Gold bottom line -->
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

// ── Core ──────────────────────────────────────────────────────────────────────

async function enviarEmail(ordenId: string): Promise<void> {
  if (!RESEND_API_KEY) {
    await log(ordenId, "email_sin_key", "warning", "RESEND_API_KEY no configurada — email omitido");
    return;
  }

  // 1. Orden
  const { data: orden } = await supabase
    .from("tarot_ordenes")
    .select("id, cliente_id, tema, pregunta_usuario")
    .eq("id", ordenId)
    .maybeSingle();

  if (!orden) {
    await log(ordenId, "email_orden_no_encontrada", "error", "Orden no encontrada");
    return;
  }

  // 2. Cliente
  const { data: cliente } = await supabase
    .from("tarot_clientes")
    .select("nombre_completo, email")
    .eq("id", orden.cliente_id)
    .maybeSingle();

  if (!cliente?.email) {
    await log(ordenId, "email_sin_email_cliente", "info",
      "Cliente sin email — omitido", { cliente_id: orden.cliente_id });
    return;
  }

  // 3. PDF
  const { data: pdfRow } = await supabase
    .from("tarot_pdfs")
    .select("storage_url, url_expira_at")
    .eq("orden_id", ordenId)
    .eq("estado", "listo")
    .order("generado_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pdfRow?.storage_url) {
    await log(ordenId, "email_sin_pdf", "error", "No hay PDF listo para esta orden");
    return;
  }

  // 4. Lectura vigente (resumen + mensaje final)
  const { data: lectura } = await supabase
    .from("tarot_lecturas")
    .select("id, resumen_lectura, mensaje_final")
    .eq("orden_id", ordenId)
    .eq("es_vigente", true)
    .maybeSingle();

  // 5. Cartas de la tirada (nombre + posición + orientación)
  let cartas: Carta[] = [];
  if (lectura?.id) {
    const { data: lc } = await supabase
      .from("tarot_lecturas_cartas")
      .select(`
        numero_posicion,
        invertida,
        tarot_cartas!inner(nombre_es),
        tarot_posiciones_tirada!inner(nombre)
      `)
      .eq("lectura_id", lectura.id)
      .order("numero_posicion");

    if (lc) {
      cartas = lc.map((r: any) => ({
        numero:          r.numero_posicion,
        nombre_carta:    r.tarot_cartas?.nombre_es   ?? "—",
        nombre_posicion: r.tarot_posiciones_tirada?.nombre ?? `Posición ${r.numero_posicion}`,
        invertida:       r.invertida ?? false,
      }));
    }
  }

  // 6. Datos de presentación
  const nombreCorto = (cliente.nombre_completo ?? "consultante").split(" ")[0];
  const pdfUrl      = pdfRow.storage_url;
  const expiraStr   = pdfRow.url_expira_at
    ? new Date(pdfRow.url_expira_at).toLocaleDateString("es-UY", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "48 horas";

  // 7. Adjuntar PDF como base64
  let pdfBase64: string | null = null;
  try {
    const pdfResp = await fetch(pdfUrl, { signal: AbortSignal.timeout(15_000) });
    if (pdfResp.ok) {
      const bytes = new Uint8Array(await pdfResp.arrayBuffer());
      pdfBase64   = encodeBase64(bytes);
    }
  } catch (err) {
    await log(ordenId, "email_pdf_fetch_warning", "warning",
      "No se pudo adjuntar el PDF — se envía solo el link", { error: String(err) });
  }

  // 8. Construir email
  const html = buildHtml({
    nombreCorto,
    tema:         orden.tema        ?? "Tirada general",
    pregunta:     orden.pregunta_usuario ?? null,
    cartas,
    resumen:      lectura?.resumen_lectura  ?? null,
    mensajeFinal: lectura?.mensaje_final    ?? null,
    pdfUrl,
    expiraStr,
  });

  const emailPayload: Record<string, unknown> = {
    from:    RESEND_FROM,
    to:      [cliente.email],
    subject: `✨ Tu Tirada Cósmica está lista, ${nombreCorto}`,
    html,
  };

  if (pdfBase64) {
    emailPayload.attachments = [{
      filename: `tirada-cosmica-${nombreCorto.toLowerCase()}.pdf`,
      content:  pdfBase64,
    }];
  }

  // 9. Enviar
  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(emailPayload),
  });

  const resData = await res.json().catch(() => ({}));

  if (!res.ok) {
    await log(ordenId, "email_error", "error",
      `Resend respondió ${res.status}`,
      { email: cliente.email, status: res.status, body: resData });
    return;
  }

  await log(ordenId, "email_enviado", "info",
    `Email enviado a ${cliente.email}${pdfBase64 ? " con PDF adjunto" : " (solo link)"}`,
    { email_id: resData?.id, email: cliente.email, pdf_adjunto: !!pdfBase64 });
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  const key = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || key !== TAROT_INTERNAL_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }),
      { status: 401, headers: { "Content-Type": "application/json" } });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: { "Content-Type": "application/json" } });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: "JSON_INVALIDO" }),
      { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const ordenId = String(body?.orden_id ?? "").trim();
  if (!ordenId) {
    return new Response(JSON.stringify({ ok: false, error: "ORDEN_ID_REQUERIDO" }),
      { status: 400, headers: { "Content-Type": "application/json" } });
  }

  enviarEmail(ordenId).catch(err => {
    console.error(`${FN} — error para orden ${ordenId}:`, err);
  });

  return new Response(
    JSON.stringify({ ok: true, mensaje: "Procesando envío de email" }),
    { status: 202, headers: { "Content-Type": "application/json" } },
  );
});
