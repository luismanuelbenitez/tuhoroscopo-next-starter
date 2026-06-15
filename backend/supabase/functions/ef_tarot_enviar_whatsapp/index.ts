// ============================================================
// ef_tarot_enviar_whatsapp — Sprint 5
// Entrega el PDF de tarot al cliente via WhatsApp Cloud API.
//
// Input:  { orden_id, forzar? }
// Output: { ok, enviado, wa_message_id } | { ok: false, error }
//
// Estados: pdf_listo | error_whatsapp → enviando_whatsapp → entregado
//          Si supera max_reintentos_wa: → error_critico
//
// Sandbox: simula el envío (no llama a la API real), actualiza a entregado.
// Producción: llama a Meta WhatsApp Cloud API con mensaje tipo documento.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const WHATSAPP_TOKEN            = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID  = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";

const FN = "ef_tarot_enviar_whatsapp";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function now() { return new Date().toISOString(); }

async function log(
  ordenId: string,
  evento: string,
  nivel: "info" | "warning" | "error",
  mensaje: string,
  datos?: unknown,
  duracionMs?: number,
) {
  try {
    await supabase.from("tarot_logs").insert({
      orden_id: ordenId,
      funcion: FN,
      evento,
      nivel,
      mensaje,
      datos: datos ?? null,
      duracion_ms: duracionMs ?? null,
    });
  } catch { /* non-blocking */ }
}

// ── Tipos internos ─────────────────────────────────────────────
interface ConfigMap { [key: string]: string }
interface Orden     { id: string; estado: string; cliente_id: string }
interface Pdf       { id: string; storage_url: string | null }
interface Cliente   { id: string; telefono: string; nombre_completo: string | null }
interface Envio     { id: string; numero_intento: number; estado: string }

// ── Handler ────────────────────────────────────────────────────
serve(async (req) => {
  const key = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || key !== TAROT_INTERNAL_KEY) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const ordenId = String(body.orden_id ?? "").trim();
  if (!ordenId) return json({ ok: false, error: "ORDEN_ID_REQUERIDO" }, 400);

  const forzar = body.forzar === true;
  const t0 = Date.now();

  try {
    // ── 1. Configuración ────────────────────────────────────────
    const { data: cfgRows } = await supabase
      .from("tarot_configuracion")
      .select("clave, valor")
      .in("clave", ["mp_modo", "whatsapp_modo", "max_reintentos_wa"]);

    const cfg: ConfigMap = Object.fromEntries(
      (cfgRows ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]),
    );
    // whatsapp_modo is the authoritative control for WA sandbox/prod; falls back to mp_modo
    const esSandbox    = (cfg.whatsapp_modo ?? cfg.mp_modo) !== "production";
    const maxReintentos = Number(cfg.max_reintentos_wa ?? 3);

    // ── 2. Orden ─────────────────────────────────────────────────
    const { data: orden } = await supabase
      .from("tarot_ordenes")
      .select("id, estado, cliente_id")
      .eq("id", ordenId)
      .maybeSingle() as { data: Orden | null };

    if (!orden) return json({ ok: false, error: "ORDEN_NO_ENCONTRADA" }, 404);

    const ESTADOS_VALIDOS = new Set(["pdf_listo", "error_whatsapp"]);
    if (!ESTADOS_VALIDOS.has(orden.estado)) {
      await log(ordenId, "wa_estado_invalido", "warning",
        `Estado '${orden.estado}' no permite envío WhatsApp`);
      return json({ ok: false, error: "ESTADO_INVALIDO", estado: orden.estado }, 422);
    }

    // ── 3. PDF vigente con URL ────────────────────────────────────
    const { data: pdf } = await supabase
      .from("tarot_pdfs")
      .select("id, storage_url")
      .eq("orden_id", ordenId)
      .eq("es_vigente", true)
      .not("storage_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as { data: Pdf | null };

    if (!pdf?.storage_url) {
      await log(ordenId, "wa_pdf_no_disponible", "error",
        "No se encontró PDF vigente con URL para esta orden");
      return json({ ok: false, error: "PDF_NO_DISPONIBLE" }, 409);
    }

    // ── 4. Cliente ─────────────────────────────────────────────────
    const { data: cliente } = await supabase
      .from("tarot_clientes")
      .select("id, telefono, nombre_completo")
      .eq("id", orden.cliente_id)
      .maybeSingle() as { data: Cliente | null };

    if (!cliente?.telefono) {
      await log(ordenId, "wa_cliente_sin_telefono", "error",
        "Cliente no encontrado o sin teléfono registrado");
      return json({ ok: false, error: "CLIENTE_SIN_TELEFONO" }, 409);
    }

    // Normalizar teléfono: "+598091234567" → "598091234567"
    const telefonoDest = cliente.telefono.replace(/^\+/, "");

    // ── 5. Idempotencia: envío anterior ───────────────────────────
    const { data: envioAnterior } = await supabase
      .from("tarot_envios_whatsapp")
      .select("id, numero_intento, estado")
      .eq("orden_id", ordenId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as { data: Envio | null };

    if (envioAnterior?.estado === "enviado" && !forzar) {
      await log(ordenId, "wa_ya_enviado", "info",
        "WhatsApp ya fue enviado — ignorando. Usa forzar=true para reenviar.");
      return json({ ok: true, ya_enviado: true });
    }

    const intento = envioAnterior ? envioAnterior.numero_intento + 1 : 1;

    if (intento > maxReintentos && !forzar) {
      const tsNow = now();
      await supabase.from("tarot_ordenes")
        .update({ estado: "error_critico", updated_at: tsNow }).eq("id", ordenId);
      await log(ordenId, "wa_max_reintentos", "error",
        `Máximo de reintentos alcanzado (${maxReintentos}). Orden marcada error_critico.`);
      return json({ ok: false, error: "MAX_REINTENTOS_ALCANZADO" }, 422);
    }

    // ── 6. Crear registro envio + actualizar orden ─────────────────
    const { data: envio } = await supabase
      .from("tarot_envios_whatsapp")
      .insert({
        orden_id: ordenId,
        pdf_id: pdf.id,
        estado: "enviando",
        numero_intento: intento,
        telefono_destino: telefonoDest,
        proveedor_wa: "meta_cloud",
        updated_at: now(),
      })
      .select("id")
      .single();

    await supabase.from("tarot_ordenes")
      .update({ estado: "enviando_whatsapp", updated_at: now() }).eq("id", ordenId);

    await log(ordenId, "wa_iniciando", "info",
      `Iniciando envío WA (intento ${intento}/${maxReintentos}, sandbox=${esSandbox})`,
      { envio_id: envio?.id, pdf_id: pdf.id, telefono: telefonoDest });

    // ── 7. Envío ───────────────────────────────────────────────────
    let waMessageId: string | null = null;
    let envioOk     = false;
    let errorCode:   string | null = null;
    let errorMsg:    string | null = null;
    let respuestaRaw: unknown = null;

    if (esSandbox) {
      waMessageId  = `sandbox_${crypto.randomUUID()}`;
      envioOk      = true;
      respuestaRaw = { sandbox: true, simulado: true };
      await log(ordenId, "wa_sandbox_simulado", "info",
        "Modo sandbox: envío simulado exitoso (no se llamó a la API real)");
    } else {
      if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        throw new Error("WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados en env vars");
      }

      const nombrePila = cliente.nombre_completo?.split(" ")[0] ?? "aquí";
      const caption =
        `¡Hola ${nombrePila}! ✨ Tu lectura de tarot personalizada está lista. ` +
        `Encontrarás la interpretación completa de tus 5 cartas en el PDF adjunto. ` +
        `Que resuene con vos. 🔮`;

      const waBody = {
        messaging_product: "whatsapp",
        to: telefonoDest,
        type: "document",
        document: {
          link: pdf.storage_url,
          filename: "Tu_Lectura_de_Tarot.pdf",
          caption,
        },
      };

      const waRes = await fetch(
        `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(waBody),
        },
      );

      respuestaRaw = await waRes.json().catch(() => ({}));

      type WaOkResp  = { messages: { id: string }[] };
      type WaErrResp = { error: { code: number; message: string } };

      if (waRes.ok && (respuestaRaw as WaOkResp)?.messages?.length > 0) {
        waMessageId = (respuestaRaw as WaOkResp).messages[0]?.id ?? null;
        envioOk     = true;
      } else {
        const errObj = (respuestaRaw as WaErrResp)?.error;
        errorCode = String(errObj?.code ?? "WA_ERROR");
        errorMsg  = String(errObj?.message ?? "Error desconocido de WhatsApp");
      }
    }

    // ── 8. Actualizar resultado ────────────────────────────────────
    const tsNow = now();
    const durMs = Date.now() - t0;

    if (envioOk) {
      await supabase.from("tarot_envios_whatsapp").update({
        estado: "enviado",
        wa_message_id: waMessageId,
        wa_status: "sent",
        respuesta_raw: respuestaRaw,
        enviado_at: tsNow,
        updated_at: tsNow,
      }).eq("id", envio?.id);

      await supabase.from("tarot_ordenes")
        .update({ estado: "entregado", updated_at: tsNow }).eq("id", ordenId);

      await log(ordenId, "wa_enviado", "info",
        `PDF entregado por WhatsApp en ${durMs}ms`,
        { envio_id: envio?.id, wa_message_id: waMessageId, duracion_ms: durMs }, durMs);

      return json({ ok: true, enviado: true, wa_message_id: waMessageId });

    } else {
      await supabase.from("tarot_envios_whatsapp").update({
        estado: "error",
        wa_error_code: errorCode,
        wa_error_mensaje: errorMsg,
        respuesta_raw: respuestaRaw,
        updated_at: tsNow,
      }).eq("id", envio?.id);

      const estadoOrden = intento >= maxReintentos ? "error_critico" : "error_whatsapp";
      await supabase.from("tarot_ordenes")
        .update({ estado: estadoOrden, updated_at: tsNow }).eq("id", ordenId);

      await log(ordenId, "wa_error_envio", "error",
        `Error enviando WhatsApp (intento ${intento}/${maxReintentos}) → orden: ${estadoOrden}`,
        { error_code: errorCode, error_msg: errorMsg, respuesta: respuestaRaw, duracion_ms: durMs },
        durMs);

      return json({
        ok: false,
        error: "WA_SEND_ERROR",
        codigo: errorCode,
        mensaje: errorMsg,
        estado_orden: estadoOrden,
      });
    }

  } catch (err) {
    const errMsg = String(err);
    const durMs  = Date.now() - t0;
    await log(ordenId, "wa_excepcion", "error",
      "Excepción no controlada en ef_tarot_enviar_whatsapp",
      { error: errMsg, duracion_ms: durMs }, durMs);

    try {
      await supabase.from("tarot_ordenes")
        .update({ estado: "error_whatsapp", updated_at: now() }).eq("id", ordenId);
    } catch { /* best effort */ }

    return json({ ok: false, error: "EXCEPCION", mensaje: errMsg }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
