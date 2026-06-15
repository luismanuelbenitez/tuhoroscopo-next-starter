// ============================================================
// ef_tarot_enviar_email
// Envía el PDF de la lectura por email al cliente.
// Solo actúa si el cliente tiene email y si RESEND_API_KEY está configurada.
// Se invoca fire-and-forget desde ef_tarot_generar_pdf.
//
// Requiere en Supabase Secrets:
//   RESEND_API_KEY   → API key de resend.com (plan gratuito: 3.000 emails/mes)
//   RESEND_FROM      → dirección remitente, ej: "Tu Horóscopo Cósmico <hola@tuhoroscopo.com>"
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM               = Deno.env.get("RESEND_FROM") ?? "Tu Horóscopo Cósmico <hola@tuhoroscopo.com>";
const FN                        = "ef_tarot_enviar_email";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function log(
  ordenId: string | null, evento: string,
  nivel: "info" | "warning" | "error",
  mensaje: string, payload: unknown = {},
) {
  try {
    await supabase.from("tarot_logs").insert({
      orden_id: ordenId, evento, nivel, mensaje,
      payload: payload ?? {}, funcion_origen: FN,
    });
  } catch { /* non-blocking */ }
}

async function enviarEmail(ordenId: string): Promise<void> {
  if (!RESEND_API_KEY) {
    await log(ordenId, "email_sin_key", "warning",
      "RESEND_API_KEY no configurada — email omitido");
    return;
  }

  // 1. Leer datos de la orden + cliente
  const { data: orden } = await supabase
    .from("tarot_ordenes")
    .select("id, cliente_id, tema, pregunta_usuario")
    .eq("id", ordenId)
    .maybeSingle();

  if (!orden) {
    await log(ordenId, "email_orden_no_encontrada", "error", "Orden no encontrada");
    return;
  }

  const { data: cliente } = await supabase
    .from("tarot_clientes")
    .select("nombre_completo, email")
    .eq("id", orden.cliente_id)
    .maybeSingle();

  if (!cliente?.email) {
    await log(ordenId, "email_sin_email_cliente", "info",
      "Cliente sin email — email omitido", { cliente_id: orden.cliente_id });
    return;
  }

  // 2. Obtener URL firmada del PDF
  const { data: pdfRow } = await supabase
    .from("tarot_pdfs")
    .select("storage_url, url_expira_at")
    .eq("orden_id", ordenId)
    .eq("estado", "listo")
    .order("generado_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pdfRow?.storage_url) {
    await log(ordenId, "email_sin_pdf", "error",
      "No hay PDF listo para esta orden", { orden_id: ordenId });
    return;
  }

  const nombre    = cliente.nombre_completo ?? "consultante";
  const nombreCorto = nombre.split(" ")[0];
  const pdfUrl    = pdfRow.storage_url;
  const expira    = pdfRow.url_expira_at
    ? new Date(pdfRow.url_expira_at).toLocaleDateString("es-UY", { day: "numeric", month: "long" })
    : "48 horas";

  // 3. Construir y enviar el email via Resend
  const emailBody = {
    from:    RESEND_FROM,
    to:      [cliente.email],
    subject: `Tu Tirada Cósmica está lista, ${nombreCorto} ✨`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0e0b22;font-family:Georgia,serif;color:#e8e0f0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">

    <div style="text-align:center;margin-bottom:32px;">
      <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(251,191,36,0.60);margin:0 0 8px;">
        Tu Horóscopo Cósmico
      </p>
      <h1 style="font-size:24px;color:#fff;margin:0;font-weight:bold;">
        Tu lectura está lista, ${nombreCorto}.
      </h1>
    </div>

    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(251,191,36,0.25);border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="color:rgba(255,255,255,0.70);font-size:15px;line-height:1.65;margin:0 0 20px;">
        Tu Tirada Cósmica de 5 cartas está generada y lista para que la leas con calma.
        El PDF con la lectura completa está disponible en el siguiente enlace:
      </p>
      <div style="text-align:center;">
        <a href="${pdfUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#d4a017,#FFCE4D);color:#0f0820;font-weight:bold;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
          Ver mi lectura →
        </a>
      </div>
      <p style="color:rgba(255,255,255,0.30);font-size:11px;text-align:center;margin:16px 0 0;">
        El enlace está disponible hasta el ${expira}.
      </p>
    </div>

    <p style="color:rgba(255,255,255,0.30);font-size:11px;text-align:center;line-height:1.6;margin:0;">
      Esta lectura es generada con inteligencia artificial aplicando simbología tarot tradicional.
      No es una predicción del futuro ni reemplaza consejo profesional.<br><br>
      Tu Horóscopo Cósmico · <a href="https://tuhoroscopo.com" style="color:rgba(251,191,36,0.50);text-decoration:none;">tuhoroscopo.com</a>
    </p>

  </div>
</body>
</html>
    `.trim(),
  };

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(emailBody),
  });

  const resData = await res.json().catch(() => ({}));

  if (!res.ok) {
    await log(ordenId, "email_error", "error",
      `Resend respondió ${res.status}`,
      { email: cliente.email, status: res.status, body: resData });
    return;
  }

  await log(ordenId, "email_enviado", "info",
    `Email enviado a ${cliente.email}`,
    { email_id: resData?.id, email: cliente.email });
}

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

  // Fire-and-forget: responde inmediato, envía en background
  enviarEmail(ordenId).catch(err => {
    console.error(FN + " error para orden " + ordenId + ":", err);
  });

  return new Response(
    JSON.stringify({ ok: true, mensaje: "Procesando envío de email" }),
    { status: 202, headers: { "Content-Type": "application/json" } },
  );
});
