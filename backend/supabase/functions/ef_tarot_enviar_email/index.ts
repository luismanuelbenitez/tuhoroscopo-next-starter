// ============================================================
// ef_tarot_enviar_email v6 (+ auditoría de entrega — sin adjunto PDF)
// Email de ENTREGA: cabezal personalizado (mismo PNG de WhatsApp) + CTA
// principal a /lectura/<token> (misma experiencia mobile temporal, mismo
// token, 30 días) + CTA secundario al mismo PDF vía link — NO lleva el PDF
// adjunto (2026-09-04: se sacó el adjunto — ver sprint de auditoría de
// entrega por email en docs/product/DECISIONS.md). No reproduce contenido
// narrativo de la lectura (ver sección "Template HTML" más abajo).
// Invocado fire-and-forget desde ef_tarot_generar_pdf.
//
// Input: { orden_id, autorizacion_id?, token? }
//   `token`: acceso web ya creado por ef_tarot_generar_pdf cuando despachó
//   WhatsApp y Email juntos (mismo acceso compartido, ver "4.a" abajo). Sin
//   `token`, esta función crea el suyo (reenvío de email en solitario).
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
//
// LOGGING (sprint de auditoría, 2026-09-04): tarot_logs registra etapas
// técnicas del envío (preparado → intentando → aceptado/error por el
// proveedor) sin PII — nunca el email completo, nombre, pregunta, token ni
// HTML. `estado: "enviado"` en tarot_envios_email SOLO se escribe después
// de que Resend confirma aceptación (`res.ok`) — nunca antes.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { dispararAlerta } from "../_shared/tarot-alertas.ts";
import { verificarPermisoEnvio } from "../_shared/tarot-entregas.ts";
import { crearAccesoWeb } from "../_shared/tarot-accesos.ts";
import { generarImagenWhatsapp } from "../_shared/tarot-imagen-whatsapp.ts";
import { buildHtmlEntregaEmail } from "../_shared/tarot-email-entrega.ts";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM               = Deno.env.get("RESEND_FROM") ?? "Tu Oráculo <hola@tuoraculo.uy>";
const FN                        = "ef_tarot_enviar_email";

// Mismo bucket que _shared/tarot-imagen-whatsapp.ts (no se importa la
// constante de ahí para no tener que redesplegar ef_tarot_enviar_whatsapp
// por un cambio ajeno a la generación del cabezal — mismo criterio ya
// aplicado en ef_tarot_admin_orden_experiencia).
const BUCKET_ASSETS   = "tarot-assets";
// TTL propio del cabezal en el email — ver _shared/tarot-email-entrega.ts
// y el comentario junto a su uso más abajo para el razonamiento completo.
const EMAIL_IMG_TTL_SEG = 30 * 24 * 3600;

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
// DECISIÓN DE PRODUCTO (2026-09-04, ver docs/product/DECISIONS.md): el email
// ahora es una PUERTA de entrada a la misma experiencia que WhatsApp — cabezal
// personalizado + CTA principal a /lectura/<token> (misma lectura mobile
// temporal, mismo token, mismos 30 días) + CTA secundario al mismo PDF. Sigue
// sin reproducir contenido narrativo (resumen, mensaje final, nombres de
// cartas, pregunta) — eso es lo que el CTA revela, no el email. El HTML en sí
// vive en _shared/tarot-email-entrega.ts (buildHtmlEntregaEmail), compartido
// con el preview de admin — no se reimplementa acá.

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

async function enviarEmail(ordenId: string, autorizacionId: string | null, tokenCompartido: string | null): Promise<ResultadoEnvioEmail> {
  if (!RESEND_API_KEY) {
    await log(ordenId, "email_sin_key", "warning", "RESEND_API_KEY no configurada — email omitido");
    return { ok: false, motivo: "sin_key" };
  }

  // 1. Orden
  const { data: orden } = await supabase
    .from("tarot_ordenes")
    .select("id, cliente_id, nombre_snapshot, email_solicitado, email_snapshot")
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

  // 2. Email destino — SIEMPRE el snapshot de ESTA orden (lo que el
  // comprador tipeó en este checkout), nunca el perfil mutable del cliente.
  // Mismo principio "cliente canónico ≠ snapshot" ya aplicado a
  // nombre/teléfono en el resto del proyecto — tarot_clientes.email puede
  // quedar desactualizado (typo corregido en una compra posterior, cambio
  // de casilla, etc.) y un envío real terminó yéndose a una dirección
  // vieja/inexistente por leer de ahí. Fallback a tarot_clientes.email solo
  // para órdenes anteriores a la existencia de email_snapshot.
  let emailDestino = (orden as { email_snapshot?: string | null }).email_snapshot ?? null;
  if (!emailDestino) {
    const { data: cliente } = await supabase
      .from("tarot_clientes")
      .select("email")
      .eq("id", orden.cliente_id)
      .maybeSingle();
    emailDestino = cliente?.email ?? null;
  }

  if (!emailDestino) {
    await log(ordenId, "email_sin_email_cliente", "info",
      "Orden sin email — omitido", { cliente_id: orden.cliente_id });
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

  // 3.c Etapa "preparado": las verificaciones previas (orden, permiso, cliente
  // con email, PDF listo) pasaron — el envío va a intentarse. Sin PII: ni el
  // email ni el nombre viajan acá, solo el booleano/canal que pidió la orden.
  await log(ordenId, "email_preparado", "info", "Envío de email preparado — verificaciones previas OK", {
    email_solicitado: (orden as { email_solicitado?: boolean | null }).email_solicitado ?? null,
    canal: "email",
  });

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
  // Nombre desde el snapshot de la orden, NUNCA el perfil mutable del
  // cliente — mismo principio "cliente canónico ≠ snapshot" ya aplicado en
  // el cabezal de WhatsApp (antes este email usaba cliente.nombre_completo).
  const nombreCorto = ((orden as { nombre_snapshot?: string | null }).nombre_snapshot ?? "consultante").split(" ")[0];

  // 4.a Acceso web: MISMO mecanismo canónico que WhatsApp
  // (_shared/tarot-accesos.ts), nunca un token/página paralela. Si
  // ef_tarot_generar_pdf ya despachó WhatsApp y Email juntos, el token
  // compartido llega por parámetro y NO se vuelve a crear acá — evita
  // pisar el acceso que WhatsApp ya está usando (un solo acceso vigente
  // por orden). Sin token compartido (reenvío de email en solitario, sin
  // carrera posible), se crea acá mismo. Si falla, el email igual sale:
  // se omite el CTA "Ver mi tirada" en vez de mandar un link roto.
  let accesoToken: string | null = tokenCompartido;
  if (!accesoToken) {
    try {
      accesoToken = (await crearAccesoWeb(supabase, ordenId)).token;
    } catch (e) {
      await log(ordenId, "email_acceso_web_error", "warning",
        "No se pudo crear el acceso web de la lectura — el email se envía sin CTA 'Ver mi tirada'",
        { error: String(e) });
    }
  }

  let expiraLecturaStr: string | null = null;
  if (accesoToken) {
    const { data: accesoRow } = await supabase
      .from("tarot_accesos_web").select("expira_at").eq("orden_id", ordenId).maybeSingle();
    if (accesoRow?.expira_at) {
      expiraLecturaStr = new Date(accesoRow.expira_at)
        .toLocaleDateString("es-UY", { day: "numeric", month: "long", year: "numeric" });
    }
  }
  const lecturaUrl = accesoToken ? `https://tuoraculo.uy/lectura/${accesoToken}` : null;

  // 4.b PDF: mismo PDF existente, mismo mecanismo de acceso por token que ya
  // usa el segundo botón de WhatsApp (/api/lectura/<token>/pdf, siempre
  // firma una URL fresca) — más durable que el storage_url crudo (TTL 48h).
  // Sin token disponible, cae al mecanismo anterior (storage_url directo)
  // para que el CTA de PDF nunca quede roto.
  const pdfStorageUrl = pdfRow.storage_url;
  const pdfCtaUrl = accesoToken ? `https://tuoraculo.uy/api/lectura/${accesoToken}/pdf` : pdfStorageUrl;

  // 4.c Cabezal: el MISMO PNG real que genera/usa WhatsApp — nunca una
  // imagen distinta. generarImagenWhatsapp() reusa el archivo si ya existe
  // o lo compone si falta (idéntico a como lo hace WhatsApp); acá solo se
  // firma una URL propia con más vida (ver EMAIL_IMG_TTL_SEG arriba): la
  // señal por defecto dura 24h porque WhatsApp/Meta la descarga apenas se
  // envía, pero un email puede abrirse días después de recibido — con 24h
  // la imagen se rompería. Mismo archivo, mismo bucket privado, no se hace
  // público ni se genera una segunda versión. Si falla, el email sale
  // igual sin la imagen (CTA + PDF intactos).
  let cabezalUrl: string | null = null;
  try {
    const cabezal = await generarImagenWhatsapp(supabase, ordenId);
    if (cabezal) {
      const { data: signed } = await supabase.storage
        .from(BUCKET_ASSETS)
        .createSignedUrl(`tarot/whatsapp/${ordenId}.png`, EMAIL_IMG_TTL_SEG);
      cabezalUrl = signed?.signedUrl ?? null;
    }
  } catch (e) {
    await log(ordenId, "email_cabezal_error", "warning",
      "No se pudo generar/firmar el cabezal — el email se envía sin imagen",
      { error: String(e) });
  }

  // 5. Construir email — SIN adjunto (2026-09-04: se sacó el PDF adjunto,
  // ver header del archivo y docs/product/DECISIONS.md). `pdfStorageUrl` ya
  // no se descarga acá: el CTA "Ver / descargar PDF" (pdfCtaUrl, 4.b) es el
  // único acceso al PDF desde el email, igual que en WhatsApp.
  const html = buildHtmlEntregaEmail({ nombreCorto, cabezalUrl, lecturaUrl, pdfUrl: pdfCtaUrl, expiraLecturaStr });

  const emailPayload: Record<string, unknown> = {
    from:    RESEND_FROM,
    to:      [emailDestino],
    subject: `✨ Tu Tirada está lista, ${nombreCorto}`,
    html,
  };

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
      email_destino: emailDestino,
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
  await log(ordenId, "email_intentando_envio", "info", "Invocando proveedor de email", {
    envio_id: envioEmail?.id ?? null,
    intento: numeroIntento,
    proveedor: "resend",
  });

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
    // Sin PII: ni el email del cliente ni el body crudo del proveedor viajan acá
    // (el body ya queda persistido en tarot_envios_email.respuesta_raw, protegido
    // por RLS, no en tarot_logs). Solo lo técnico: status, envío, código/mensaje
    // de error acotado.
    await log(ordenId, "email_error", "error",
      `Resend respondió ${res.status}`,
      {
        envio_id: envioEmail?.id ?? null,
        intento: numeroIntento,
        proveedor: "resend",
        http_status: res.status,
        error_code: typeof resData?.name === "string" ? resData.name : null,
        error_message: typeof resData?.message === "string" ? resData.message.substring(0, 200) : null,
      });
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

  // Sin PII: sin email del cliente — el estado "aceptado por proveedor" ya
  // queda asociado a la orden vía orden_id, no hace falta el email acá.
  await log(ordenId, "email_enviado", "info",
    "Proveedor aceptó el envío",
    {
      envio_id: envioEmail?.id ?? null,
      intento: numeroIntento,
      proveedor: "resend",
      http_status: res.status,
      proveedor_message_id: resData?.id ?? null,
    });

  return {
    ok: true, estado: "enviado",
    envioId: envioEmail?.id ?? "", email: emailDestino,
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

  // Token de acceso web compartido con WhatsApp, cuando ef_tarot_generar_pdf
  // despachó ambos canales juntos — ver "4.a Acceso web" en enviarEmail().
  const tokenCompartido = typeof body.token === "string" && body.token.trim()
    ? body.token.trim()
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
    resultado = await enviarEmail(ordenId, autorizacionId, tokenCompartido);
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
