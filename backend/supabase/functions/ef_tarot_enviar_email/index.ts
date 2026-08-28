// ============================================================
// ef_tarot_enviar_email v4 (+ persistencia estructurada + gobernanza de entregas)
// Email de ENTREGA con PDF adjunto — no reproduce contenido narrativo de la
// lectura (el PDF es el artefacto principal de la experiencia, ver sección
// "Template HTML" más abajo y docs/product/DECISIONS.md 2026-08-16).
// Invocado fire-and-forget desde ef_tarot_generar_pdf.
//
// Input: { orden_id, autorizacion_id? }
//
// Secrets requeridos:
//   RESEND_API_KEY            → API key de resend.com
//   RESEND_FROM               → "Tu Oráculo <hola@tuoraculo.uy>"
//   TAROT_INTERNAL_KEY        → clave interna
//
// GOBERNANZA DE ENTREGA:
//   Persiste cada intento en tarot_envios_email (antes solo dejaba una línea
//   de texto en tarot_logs, sin control de idempotencia posible). Si ya
//   existe un envío exitoso previo para esta orden, NINGÚN envío nuevo se
//   ejecuta salvo que venga con un `autorizacion_id` válido (solicitud de
//   reenvío autorizada por un admin, consumible una sola vez). La decisión
//   vive en _shared/tarot-entregas.ts (verificarPermisoEnvio) — único punto
//   canónico, compartido con ef_tarot_enviar_whatsapp.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.192.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { dispararAlerta } from "../_shared/tarot-alertas.ts";
import { verificarPermisoEnvio } from "../_shared/tarot-entregas.ts";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM               = Deno.env.get("RESEND_FROM") ?? "Tu Oráculo <hola@tuoraculo.uy>";
const FN                        = "ef_tarot_enviar_email";

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
//
// DECISIÓN DE PRODUCTO (2026-08-16, ver docs/product/DECISIONS.md):
// el PDF es el artefacto principal de la experiencia Tu Tirada — el momento de
// descubrir la lectura ocurre ahí, no en el email. Este email es exclusivamente
// una pieza de entrega/transición: identifica el envío, confirma que la lectura
// está lista, y da un CTA claro al PDF. NUNCA reproduce contenido narrativo
// (resumen, mensaje final, nombres de cartas, pregunta) — eso sería spoilear
// la revelación que el PDF está diseñado para dar.

function buildHtml(opts: {
  nombreCorto:  string;
  pdfUrl:       string;
  expiraStr:    string;
}): string {
  const { nombreCorto, pdfUrl, expiraStr } = opts;

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
            <td style="padding-bottom:32px;text-align:center;">
              <!-- Gold top line -->
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(251,191,36,0.45),transparent);margin-bottom:28px;"></div>

              <img src="https://tuoraculo.uy/img/logo/logo-isotipo.png" alt="Tu Oráculo" width="64" height="64" style="display:block;margin:0 auto 12px;border:0;outline:none;text-decoration:none;" />
              <p style="margin:0 0 18px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.30);">Tu Oráculo</p>

              <h1 style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:normal;color:#ffffff;line-height:1.30;">
                Tu Tirada<br>está lista, <strong>${nombreCorto}</strong>.
              </h1>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background:rgba(255,255,255,0.03);border:1px solid rgba(251,191,36,0.20);border-radius:14px;padding:28px 24px;text-align:center;">
              <p style="margin:0 0 22px;font-family:Georgia,serif;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.6;">
                Tus 5 cartas ya fueron interpretadas.<br>Buscá unos minutos de tranquilidad para leerla.
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

// Ventana de deduplicación para envíos concurrentes (doble clic / refresh /
// retry simultáneo). No es un mecanismo de gobernanza nuevo — es una guarda
// barata contra la carrera de dos requests que ambas pasan verificarPermisoEnvio()
// casi al mismo tiempo (ninguna ve todavía el envío de la otra porque ninguna
// terminó de insertar su fila). 30s cubre holgadamente el tiempo real de un
// envío (fetch de PDF + Resend, normalmente 1-3s).
const VENTANA_DEDUP_MS = 30_000;

export type ResultadoEnvioEmail =
  | { ok: true; estado: "enviado"; envioId: string; email: string; numeroIntento: number; esReenvio: boolean }
  | { ok: false; motivo: string; detalle?: string };

async function enviarEmail(ordenId: string, autorizacionId: string | null): Promise<ResultadoEnvioEmail> {
  if (!RESEND_API_KEY) {
    await log(ordenId, "email_sin_key", "warning", "RESEND_API_KEY no configurada — email omitido");
    return { ok: false, motivo: "sin_key" };
  }

  // 1. Orden
  const { data: orden } = await supabase
    .from("tarot_ordenes")
    .select("id, cliente_id")
    .eq("id", ordenId)
    .maybeSingle();

  if (!orden) {
    await log(ordenId, "email_orden_no_encontrada", "error", "Orden no encontrada");
    return { ok: false, motivo: "orden_no_encontrada" };
  }

  // 1.b Gobernanza de entrega: único punto de decisión (_shared/tarot-entregas.ts).
  // `autorizacion_id` es la única forma de reenviar sobre un email ya exitoso.
  const permiso = await verificarPermisoEnvio(supabase, {
    ordenId, canal: "email", autorizacionId,
  });

  if (!permiso.permitido) {
    await log(ordenId, "email_reenvio_bloqueado", "warning",
      `Envío bloqueado — ${permiso.motivo}`,
      { motivo: permiso.motivo, autorizacion_id: autorizacionId });
    return { ok: false, motivo: permiso.motivo };
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
    return { ok: false, motivo: "sin_email_cliente" };
  }

  // 3. PDF
  const { data: pdfRow } = await supabase
    .from("tarot_pdfs")
    .select("id, storage_url, url_expira_at")
    .eq("orden_id", ordenId)
    .eq("estado", "listo")
    .order("generado_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pdfRow?.storage_url) {
    await log(ordenId, "email_sin_pdf", "error", "No hay PDF listo para esta orden");
    return { ok: false, motivo: "sin_pdf" };
  }

  // 3.b Guarda anti-duplicado: si ya hay un envío en curso muy reciente para
  // esta orden (carrera de doble clic / retry concurrente), no arrancar uno
  // nuevo. verificarPermisoEnvio() ya autorizó este envío (no hay éxito previo),
  // pero eso no dice nada sobre si OTRO request ya está procesando el mismo
  // envío en paralelo — esta guarda es lo que evita ese duplicado.
  const { data: enCurso } = await supabase
    .from("tarot_envios_email")
    .select("id, created_at")
    .eq("orden_id", ordenId)
    .eq("estado", "enviando")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (enCurso?.id && (Date.now() - new Date(enCurso.created_at).getTime()) < VENTANA_DEDUP_MS) {
    await log(ordenId, "email_envio_en_curso", "warning",
      "Ya hay un envío en curso para esta orden — se omite duplicado",
      { envio_en_curso_id: enCurso.id });
    return { ok: false, motivo: "envio_en_curso" };
  }

  // 4. Datos de presentación
  const nombreCorto = (cliente.nombre_completo ?? "consultante").split(" ")[0];
  const pdfUrl      = pdfRow.storage_url;
  const expiraStr   = pdfRow.url_expira_at
    ? new Date(pdfRow.url_expira_at).toLocaleDateString("es-UY", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "48 horas";

  // 5. Adjuntar PDF como base64
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

  // 6. Construir email
  const html = buildHtml({ nombreCorto, pdfUrl, expiraStr });

  const emailPayload: Record<string, unknown> = {
    from:    RESEND_FROM,
    to:      [cliente.email],
    subject: `✨ Tu Tirada está lista, ${nombreCorto}`,
    html,
  };

  if (pdfBase64) {
    emailPayload.attachments = [{
      filename: `Tu Tirada - ${nombreCorto}.pdf`,
      content:  pdfBase64,
    }];
  }

  // 6.b Registrar intento (persistencia estructurada — antes solo existía tarot_logs).
  // La constraint UNIQUE(orden_id, numero_intento) en tarot_envios_email es la
  // protección REAL contra duplicados por carrera — el chequeo de "enCurso" de
  // arriba (3.b) cubre el caso común pero, al no ser atómico contra el INSERT,
  // dos requests casi simultáneas pueden pasarlo ambas (confirmado con una
  // carrera real en QA: dos envíos concurrentes llegaron a mandar dos emails
  // reales antes de que existiera esta constraint). Con la constraint, la
  // segunda request en llegar falla acá con unique_violation (23505) — se
  // aborta ANTES de llamar a Resend, en vez de reintentar con otro número
  // (reintentar podría volver a chocar contra otra carrera y no aporta nada:
  // el pedido original de "enviar por email" ya está en curso en la otra request).
  const numeroIntentoBase = (
    await supabase.from("tarot_envios_email").select("*", { count: "exact", head: true }).eq("orden_id", ordenId)
  ).count ?? 0;
  const numeroIntento = numeroIntentoBase + 1;

  const { data: envioEmail, error: errInsertEnvio } = await supabase
    .from("tarot_envios_email")
    .insert({
      orden_id: ordenId,
      pdf_id: pdfRow.id,
      estado: "enviando",
      numero_intento: numeroIntento,
      email_destino: cliente.email,
      proveedor_email: "resend",
      es_reenvio: permiso.esReenvio,
      solicitud_reenvio_id: permiso.esReenvio ? permiso.solicitudId : null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (errInsertEnvio) {
    const esCarrera = errInsertEnvio.code === "23505"; // unique_violation
    await log(ordenId, "email_envio_en_curso", "warning",
      esCarrera
        ? "Carrera de envío detectada por constraint única — otra request ya está procesando este envío"
        : "No se pudo registrar el intento de envío — se aborta sin llamar a Resend",
      { error: errInsertEnvio.message, codigo: errInsertEnvio.code });
    return { ok: false, motivo: esCarrera ? "envio_en_curso" : "error_registro_envio" };
  }

  // 7. Enviar
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
    if (envioEmail?.id) {
      await supabase.from("tarot_envios_email").update({
        estado: "error",
        error_codigo: String(res.status),
        error_mensaje: JSON.stringify(resData).substring(0, 500),
        respuesta_raw: resData,
        updated_at: new Date().toISOString(),
      }).eq("id", envioEmail.id);
    }
    await log(ordenId, "email_error", "error",
      `Resend respondió ${res.status}`,
      { email: cliente.email, status: res.status, body: resData });
    // Alerta: error de email al cliente (fire-and-forget)
    dispararAlerta(supabase, "error_email_cliente", {
      ordenId,
      error: `Resend respondió ${res.status}`,
      fecha: new Date().toISOString(),
    }).catch(() => {});
    return { ok: false, motivo: "resend_error", detalle: `Resend respondió ${res.status}` };
  }

  if (envioEmail?.id) {
    await supabase.from("tarot_envios_email").update({
      estado: "enviado",
      proveedor_message_id: resData?.id ?? null,
      respuesta_raw: resData,
      enviado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", envioEmail.id);
  }

  await log(ordenId, "email_enviado", "info",
    `Email enviado a ${cliente.email}${pdfBase64 ? " con PDF adjunto" : " (solo link)"}`,
    { email_id: resData?.id, email: cliente.email, pdf_adjunto: !!pdfBase64 });

  return {
    ok: true, estado: "enviado",
    envioId: envioEmail?.id ?? "", email: cliente.email,
    numeroIntento, esReenvio: permiso.esReenvio,
  };
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

  const autorizacionId = typeof body.autorizacion_id === "string" && body.autorizacion_id.trim()
    ? body.autorizacion_id.trim()
    : null;

  // CRÍTICO (2026-08-27): antes esto era `enviarEmail(...).catch(...)` SIN
  // await, seguido de un `return` inmediato. Supabase Edge Runtime no
  // garantiza que una tarea en segundo plano termine después de que la
  // response ya fue devuelta — sin EdgeRuntime.waitUntil() (no usado en este
  // proyecto), el runtime puede cortar la ejecución a mitad de camino. Eso
  // causaba que ef_tarot_enviar_email nunca completara: cero filas en
  // tarot_envios_email, cero logs, incluso en los primeros chequeos de la
  // función. Confirmado empíricamente: ~10% de las órdenes con email
  // configurado (2 de 19 en las últimas 2 semanas) terminaron con 0 intentos
  // de email pese a canal_entrega_principal='both'. La misma clase de bug
  // NO afecta a ef_tarot_enviar_whatsapp porque ese handler ya espera
  // (`await`) todo su trabajo antes de responder — se replica exactamente
  // ese patrón, ya probado, en vez de introducir un mecanismo nuevo.
  let resultado: ResultadoEnvioEmail;
  try {
    resultado = await enviarEmail(ordenId, autorizacionId);
  } catch (err) {
    console.error(`${FN} — error para orden ${ordenId}:`, err);
    resultado = { ok: false, motivo: "error_inesperado", detalle: String(err) };
  }

  const status = resultado.ok
    ? 200
    : resultado.motivo === "envio_en_curso"
      ? 409
      : 200;

  return new Response(
    JSON.stringify(resultado),
    { status, headers: { "Content-Type": "application/json" } },
  );
});
