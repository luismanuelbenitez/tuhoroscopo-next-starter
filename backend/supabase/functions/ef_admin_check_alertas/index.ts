// ef_admin_check_alertas
// Verifica umbrales de alertas y envía email via Resend si corresponde.
// Invocado por cron cada hora (minuto :30) y manualmente desde el panel.
//
// Requiere en Supabase Secrets:
//   TAROT_INTERNAL_KEY  → misma clave que usan otras EFs internas
//   RESEND_API_KEY      → API key de resend.com
//   RESEND_FROM         → remitente, ej: "Tu Oráculo <hola@tuoraculo.uy>"
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM               = Deno.env.get("RESEND_FROM") ?? "Tu Oráculo <hola@tuoraculo.uy>";
const ADMIN_URL                 = "https://tuhoroscopo-next-starter.vercel.app/admin";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ESTADOS_ERROR_TTC = ["error_lectura", "error_pdf", "error_whatsapp", "error_critico"];

async function getCfg(clave: string): Promise<string | null> {
  try {
    const { data } = await supabase.from("config").select("valor").eq("nombre", clave).maybeSingle();
    return data?.valor ?? null;
  } catch { return null; }
}

async function setCfg(clave: string, valor: string): Promise<void> {
  try {
    const { data } = await supabase.from("config").select("id").eq("nombre", clave).maybeSingle();
    if (data?.id) {
      await supabase.from("config").update({ valor }).eq("nombre", clave);
    } else {
      await supabase.from("config").insert({ nombre: clave, valor });
    }
  } catch { /* non-blocking */ }
}

async function contarAlertas() {
  const hace24h = new Date(Date.now() - 86_400_000).toISOString();
  const [r1, r2] = await Promise.all([
    supabase.from("tarot_ordenes").select("*", { count: "exact", head: true }).in("estado", ESTADOS_ERROR_TTC),
    supabase.from("mensajes_enviados").select("*", { count: "exact", head: true })
      .eq("resultado_envio", false).gte("fecha_hora", hace24h),
  ]);
  return { ordenesError: r1.count ?? 0, mensajesFallidos: r2.count ?? 0 };
}

async function enviarEmail(
  destino: string, ordenesError: number, mensajesFallidos: number, force: boolean,
): Promise<{ enviado: boolean; motivo?: string }> {
  if (!RESEND_API_KEY) return { enviado: false, motivo: "RESEND_API_KEY no configurada" };

  const items: string[] = [];
  if (ordenesError > 0)
    items.push(`<li><strong>${ordenesError}</strong> orden${ordenesError > 1 ? "es" : ""} de tarot en estado de error</li>`);
  if (mensajesFallidos > 0)
    items.push(`<li><strong>${mensajesFallidos}</strong> mensaje${mensajesFallidos > 1 ? "s" : ""} de WhatsApp fallido${mensajesFallidos > 1 ? "s" : ""} en las últimas 24h</li>`);

  const escogerAsunto = () => {
    if (force) return "Tu Oráculo · Email de prueba de alertas";
    const partes = [
      ordenesError > 0 ? `${ordenesError} error${ordenesError > 1 ? "es" : ""} tarot` : "",
      mensajesFallidos > 0 ? `${mensajesFallidos} msg fallido${mensajesFallidos > 1 ? "s" : ""}` : "",
    ].filter(Boolean);
    return `Tu Oráculo · Alerta: ${partes.join(", ")}`;
  };

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:system-ui,sans-serif;color:#e2e8f0;">
<div style="max-width:520px;margin:0 auto;padding:32px 24px;">
  <p style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(251,191,36,0.5);margin:0 0 10px;">Tu Oráculo · Alertas del sistema</p>
  <h1 style="font-size:20px;color:#fff;margin:0 0 20px;font-weight:600;">${force ? "Email de prueba" : "Situaciones que requieren atención"}</h1>
  ${items.length > 0 ? `
  <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.30);border-radius:10px;padding:20px 24px;margin-bottom:24px;">
    <ul style="margin:0;padding:0 0 0 16px;color:rgba(255,255,255,0.80);font-size:14px;line-height:2.2;">${items.join("")}</ul>
  </div>` : `<p style="color:rgba(255,255,255,0.5);font-size:14px;margin-bottom:24px;">El sistema de alertas está funcionando correctamente.</p>`}
  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px;">
    <a href="${ADMIN_URL}/tarot" style="display:inline-block;background:#1a1f2e;border:1px solid rgba(251,191,36,0.35);color:#fbbf24;font-size:13px;font-weight:500;padding:10px 18px;border-radius:8px;text-decoration:none;">Panel Tarot →</a>
    <a href="${ADMIN_URL}/horoscopo" style="display:inline-block;background:#1a1f2e;border:1px solid rgba(139,92,246,0.35);color:#a78bfa;font-size:13px;font-weight:500;padding:10px 18px;border-radius:8px;text-decoration:none;">Panel Horóscopo →</a>
  </div>
  <p style="color:rgba(255,255,255,0.20);font-size:11px;line-height:1.6;">Generado automáticamente. Para configurar alertas, ir a <a href="${ADMIN_URL}/config" style="color:rgba(251,191,36,0.40);text-decoration:none;">Panel → Configuración</a>.</p>
</div>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to: [destino], subject: escogerAsunto(), html }),
  });

  if (!res.ok) {
    const rb = await res.json().catch(() => ({}));
    console.error(`Resend error ${res.status}:`, rb);
    return { enviado: false, motivo: `Resend ${res.status}` };
  }
  return { enviado: true };
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }),
      { status: 401, headers: { "Content-Type": "application/json" } });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: { "Content-Type": "application/json" } });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ok, body is optional */ }
  const force = body?.force === true;

  try {
    // 1. Master toggle (skipped when forced desde el panel)
    if (!force) {
      const activo = await getCfg("ALERTAS_EMAIL_ACTIVO");
      if (activo !== "true") {
        return new Response(JSON.stringify({ ok: true, estado: "skip", motivo: "alertas desactivadas" }),
          { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }

    // 2. Leer toda la config de alertas en paralelo
    const [destino, cooldownStr, umbralOrdenesStr, umbralMensajesStr, ultimoEmail] = await Promise.all([
      getCfg("ALERTAS_EMAIL_DESTINO"),
      getCfg("ALERTAS_COOLDOWN_HORAS"),
      getCfg("ALERTAS_UMBRAL_ORDENES_ERROR"),
      getCfg("ALERTAS_UMBRAL_MENSAJES_FALLIDOS"),
      getCfg("ALERTAS_ULTIMO_EMAIL"),
    ]);

    if (!destino) {
      return new Response(JSON.stringify({ ok: false, motivo: "ALERTAS_EMAIL_DESTINO no configurado" }),
        { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const cooldownHoras = Math.max(1, parseInt(cooldownStr ?? "4"));
    const umbralOrdenes = Math.max(1, parseInt(umbralOrdenesStr ?? "1"));
    const umbralMensajes = Math.max(1, parseInt(umbralMensajesStr ?? "5"));

    // 3. Cooldown check
    if (!force && ultimoEmail) {
      const msDesde = Date.now() - new Date(ultimoEmail).getTime();
      const msEnfriar = cooldownHoras * 3_600_000;
      if (msDesde < msEnfriar) {
        const minutos = Math.ceil((msEnfriar - msDesde) / 60_000);
        return new Response(JSON.stringify({ ok: true, estado: "skip", motivo: `cooldown: ${minutos} min restantes` }),
          { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }

    // 4. Contar alertas actuales
    const { ordenesError, mensajesFallidos } = await contarAlertas();
    const hayAlertas = ordenesError >= umbralOrdenes || mensajesFallidos >= umbralMensajes;

    if (!hayAlertas && !force) {
      return new Response(JSON.stringify({ ok: true, estado: "ok", ordenesError, mensajesFallidos, motivo: "sin alertas activas" }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // 5. Enviar email
    const { enviado, motivo } = await enviarEmail(destino, ordenesError, mensajesFallidos, force);
    if (enviado) await setCfg("ALERTAS_ULTIMO_EMAIL", new Date().toISOString());

    return new Response(JSON.stringify({
      ok: true,
      estado: enviado ? "email_enviado" : "email_no_enviado",
      ordenesError, mensajesFallidos, destino, motivo,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error("ef_admin_check_alertas:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
