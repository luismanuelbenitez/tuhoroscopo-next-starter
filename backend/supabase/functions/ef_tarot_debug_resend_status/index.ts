// ============================================================
// ef_tarot_debug_resend_status — SOLO diagnóstico interno, temporal.
//
// Consulta el estado REAL de entrega de un email ya enviado vía Resend
// (GET /emails/:id) — Resend acepta el mensaje en el POST inicial (por
// eso proveedor_message_id existe en tarot_envios_email) pero eso NO
// prueba que el mensaje haya sido entregado; puede rebotar, quedar en
// spam, o ser bloqueado después de la aceptación. Este endpoint expone
// ese estado posterior para auditar sin adivinar.
//
// Gateada por x-internal-key. No forma parte del pipeline de entrega —
// nadie la llama automáticamente. Candidata a borrarse al cerrar el
// sprint de auditoría de email.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return new Response(JSON.stringify({ ok: false, motivo: "unauthorized" }), { status: 401 });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, motivo: "metodo_no_permitido" }), { status: 405 });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ ok: false, motivo: "resend_key_no_configurada" }), { status: 500 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  // "domains": diagnóstico puntual de SPF/DKIM/DMARC del dominio remitente —
  // no requiere un id de email.
  const path = body.domains === true ? "domains" : (id ? `emails/${id}` : "");
  if (!path) return new Response(JSON.stringify({ ok: false, motivo: "id_requerido" }), { status: 400 });

  const res = await fetch(`https://api.resend.com/${path}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  const data = await res.json().catch(() => ({}));

  return new Response(JSON.stringify({ ok: res.ok, http_status: res.status, resend: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
