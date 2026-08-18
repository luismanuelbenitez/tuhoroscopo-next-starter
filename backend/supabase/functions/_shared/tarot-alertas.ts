// ============================================================
// _shared/tarot-alertas.ts — Helper canónico de alertas operativas TTC
//
// ARQUITECTURA:
//   Una alerta operativa es un evento del backend.
//   Email y Admin son canales de presentación del mismo evento.
//   La fuente canónica es dispararAlerta(). NUNCA crear eventos
//   directamente desde Next.js, React o APIs de presentación.
//
//   dispararAlerta() es responsable de:
//     1. Persistir el evento en tarot_alertas_eventos (siempre)
//     2. Enviar email si el canal email está activo (opcional)
//
//   Las Edge Functions solo llaman dispararAlerta().
//   Nunca lanza — las alertas son fire-and-forget y nunca deben
//   interrumpir el flujo principal de negocio.
// ============================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

export type AlertaTipo =
  | "nueva_venta"
  | "error_generacion"
  | "error_pdf"
  | "error_whatsapp"
  | "error_email_cliente"
  | "orden_trabada"
  | "reenvio_pendiente_autorizacion"
  | "pago_monto_incoherente";

export interface AlertaDatos {
  ordenId?:       string;
  ordenRef?:      string;
  clienteNombre?: string;
  importe?:       string;
  moneda?:        string;
  fecha?:         string;
  etapa?:         string;
  error?:         string;
}

const ETAPA_LABEL: Record<AlertaTipo, string> = {
  nueva_venta:         "Nueva venta",
  error_generacion:    "Generación de lectura",
  error_pdf:           "Generación de PDF",
  error_whatsapp:      "Envío por WhatsApp",
  error_email_cliente: "Envío de email al cliente",
  orden_trabada:       "Orden trabada",
  reenvio_pendiente_autorizacion: "Reenvío pendiente de autorización",
  pago_monto_incoherente: "Monto de pago incoherente (Mercado Pago)",
};

const SEVERIDAD: Record<AlertaTipo, "success" | "warning" | "error"> = {
  nueva_venta:         "success",
  orden_trabada:       "warning",
  error_generacion:    "error",
  error_pdf:           "error",
  error_whatsapp:      "error",
  error_email_cliente: "error",
  reenvio_pendiente_autorizacion: "warning",
  pago_monto_incoherente: "error",
};

function tituloMensaje(tipo: AlertaTipo, datos: AlertaDatos): { titulo: string; mensaje: string } {
  switch (tipo) {
    case "nueva_venta":
      return {
        titulo:  "Nueva venta",
        mensaje: datos.clienteNombre
          ? `${datos.clienteNombre} · ${datos.moneda ?? ""} ${datos.importe ?? "—"}`
          : `${datos.moneda ?? ""} ${datos.importe ?? "—"}`,
      };
    case "error_generacion":
      return { titulo: "Error de generación",        mensaje: datos.error?.substring(0, 200) ?? "Sin detalle" };
    case "error_pdf":
      return { titulo: "Error de PDF",               mensaje: datos.error?.substring(0, 200) ?? "Sin detalle" };
    case "error_whatsapp":
      return { titulo: "Error de WhatsApp",          mensaje: datos.error?.substring(0, 200) ?? "Sin detalle" };
    case "error_email_cliente":
      return { titulo: "Error de email al cliente",  mensaje: datos.error?.substring(0, 200) ?? "Sin detalle" };
    case "orden_trabada":
      return { titulo: "Orden trabada", mensaje: datos.etapa ? `Trabada en: ${datos.etapa}` : "Sin avance detectado" };
    case "reenvio_pendiente_autorizacion":
      return {
        titulo:  "Reenvío pendiente de autorización",
        mensaje: datos.error?.substring(0, 200) ?? "Solicitud de reenvío creada — requiere autorización en el admin",
      };
    case "pago_monto_incoherente":
      return {
        titulo:  "Monto de pago incoherente",
        mensaje: datos.error?.substring(0, 200) ?? "El monto aprobado por Mercado Pago no coincide con el precio de la orden — pipeline detenido",
      };
  }
}

function fmtFecha(iso?: string): string {
  try {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleString("es-UY", { timeZone: "America/Montevideo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso ?? new Date().toISOString();
  }
}

function htmlNuevaVenta(datos: AlertaDatos): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#111;font-family:sans-serif;">
<div style="max-width:560px;margin:32px auto;padding:28px;background:#1a1a1a;border-radius:10px;border:1px solid #2a2a2a;color:#e5e5e5;">
  <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;">Tu Tirada — Alerta operativa</p>
  <h2 style="margin:0 0 20px;font-size:20px;color:#fbbf24;">💰 Nueva venta</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 0;color:#9ca3af;width:110px;">Cliente</td><td style="padding:6px 0;font-weight:600;">${datos.clienteNombre ?? "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#9ca3af;">Importe</td><td style="padding:6px 0;font-weight:600;">${datos.moneda ?? ""}&nbsp;${datos.importe ?? "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#9ca3af;">Fecha/hora</td><td style="padding:6px 0;">${fmtFecha(datos.fecha)}</td></tr>
    <tr><td style="padding:6px 0;color:#9ca3af;vertical-align:top;">Orden</td><td style="padding:6px 0;font-family:monospace;font-size:12px;color:#d1d5db;">${datos.ordenRef ?? datos.ordenId ?? "—"}</td></tr>
  </table>
  <div style="margin-top:20px;padding:12px 16px;background:#052e16;border:1px solid #166534;border-radius:6px;">
    <span style="font-size:13px;color:#4ade80;font-weight:600;">✅ Estado: Pago aprobado</span>
  </div>
</div></body></html>`;
}

function htmlError(tipo: AlertaTipo, datos: AlertaDatos): string {
  const etiqueta = datos.etapa ?? ETAPA_LABEL[tipo];
  const errorSeguro = datos.error
    ? datos.error.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
                 .replace(/key[=:]\s*\S+/gi, "key=[REDACTED]")
                 .substring(0, 400)
    : null;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#111;font-family:sans-serif;">
<div style="max-width:560px;margin:32px auto;padding:28px;background:#1a1a1a;border-radius:10px;border:1px solid #2a2a2a;color:#e5e5e5;">
  <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;">Tu Tirada — Alerta operativa</p>
  <h2 style="margin:0 0 20px;font-size:20px;color:#f87171;">⚠️ Error: ${etiqueta}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 0;color:#9ca3af;width:110px;">Etapa</td><td style="padding:6px 0;font-weight:600;">${etiqueta}</td></tr>
    <tr><td style="padding:6px 0;color:#9ca3af;vertical-align:top;">Orden</td><td style="padding:6px 0;font-family:monospace;font-size:12px;color:#d1d5db;">${datos.ordenRef ?? datos.ordenId ?? "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#9ca3af;">Fecha/hora</td><td style="padding:6px 0;">${fmtFecha(datos.fecha)}</td></tr>
    ${errorSeguro ? `<tr><td style="padding:6px 0;color:#9ca3af;vertical-align:top;">Error</td><td style="padding:6px 0;font-family:monospace;font-size:11px;color:#fca5a5;word-break:break-all;">${errorSeguro}</td></tr>` : ""}
  </table>
  <div style="margin-top:20px;padding:10px 14px;background:#1c1917;border:1px solid #292524;border-radius:6px;">
    <a href="https://tuoraculo.uy/admin/tarot/ordenes" style="font-size:12px;color:#a78bfa;text-decoration:none;">Ver órdenes en el panel admin →</a>
  </div>
</div></body></html>`;
}

export async function dispararAlerta(
  supabase: SupabaseClient,
  tipo: AlertaTipo,
  datos: AlertaDatos,
): Promise<void> {
  try {
    // ── 1. Persistir evento interno (siempre, independiente del canal email) ──
    const { titulo, mensaje } = tituloMensaje(tipo, datos);
    const metadata: Record<string, string> = {};
    if (datos.ordenRef)      metadata.ordenRef      = datos.ordenRef;
    if (datos.clienteNombre) metadata.clienteNombre = datos.clienteNombre;
    if (datos.importe)       metadata.importe       = datos.importe;
    if (datos.moneda)        metadata.moneda        = datos.moneda;
    if (datos.etapa)         metadata.etapa         = datos.etapa;
    if (datos.error)         metadata.error         = datos.error.substring(0, 300);

    // ignoreDuplicates=true → ON CONFLICT DO NOTHING (idempotencia nueva_venta)
    await supabase.from("tarot_alertas_eventos").upsert(
      {
        tipo_alerta: tipo,
        severidad:   SEVERIDAD[tipo],
        titulo,
        mensaje,
        orden_id:    datos.ordenId ?? null,
        metadata,
      },
      { ignoreDuplicates: true },
    );

    // ── 2. Canal email: leer configuración ────────────────────────────────────
    const { data: cfg } = await supabase
      .from("tarot_alertas_config")
      .select("activa, usa_email_general, email_particular")
      .eq("tipo", tipo)
      .maybeSingle() as { data: { activa: boolean; usa_email_general: boolean; email_particular: string | null } | null };

    if (!cfg || !cfg.activa) return; // email desactivado — evento ya persistido arriba

    // ── 3. Resolver destino de email ──────────────────────────────────────────
    let destino: string;
    if (cfg.usa_email_general || !cfg.email_particular) {
      const { data: row } = await supabase
        .from("tarot_configuracion")
        .select("valor")
        .eq("clave", "TTC_ALERTAS_EMAIL_GENERAL")
        .eq("activo", true)
        .maybeSingle() as { data: { valor: string } | null };
      destino = row?.valor?.trim() ?? "";
    } else {
      destino = cfg.email_particular.trim();
    }

    if (!destino) return;

    // ── 4. Construir y enviar email ────────────────────────────────────────────
    const asunto = tipo === "nueva_venta"
      ? "💰 Nueva venta — Tu Tirada"
      : `⚠️ Error: ${datos.etapa ?? ETAPA_LABEL[tipo]} — Tu Tirada`;
    const html = tipo === "nueva_venta"
      ? htmlNuevaVenta(datos)
      : htmlError(tipo, datos);

    const resendKey  = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM") ?? "Tu Oráculo <hola@tuoraculo.uy>";
    if (!resendKey) return;

    await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ from: resendFrom, to: [destino], subject: asunto, html }),
    });

  } catch (err) {
    // Nunca propagar: las alertas son side-effect, nunca interrumpen el flujo principal
    console.warn(`[tarot-alertas] dispararAlerta(${tipo}) falló silenciosamente:`, String(err));
  }
}
