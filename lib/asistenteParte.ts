// Parte del Asistente CEO (2026-10-31): corre los chequeos, guarda el parte
// en tarot_asistente_informes y lo manda por email SOLO a Manuel.
// El destinatario es fijo a propósito: este módulo nunca le escribe a un
// cliente (regla permanente: nada se envía a clientes reales).

import { correrChequeos, type Chequeo, type Gravedad } from "@/lib/asistente";

const DESTINATARIO_UNICO = "mbenitezmdeo@gmail.com";
const BASE_URL = "https://tuoraculo.uy";

export type Rest = (q: string, init?: RequestInit) => Promise<any>;

export function restSupabase(): Rest | null {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !key) return null;
  return async (q, init) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${q}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };
}

export async function generarParte(rest: Rest, tipo: "diario" | "manual", enviarEmail: boolean) {
  const chequeo = await correrChequeos((q) => rest(q));
  let email_enviado_at: string | null = null;
  let email_error: string | null = null;
  if (enviarEmail) {
    try {
      await enviarEmailParte(chequeo, tipo);
      email_enviado_at = new Date().toISOString();
    } catch (e: unknown) {
      email_error = e instanceof Error ? e.message : String(e);
    }
  }
  const [fila] = await rest("tarot_asistente_informes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tipo, estado_general: chequeo.estado_general, resumen: chequeo.resumen, contenido: chequeo, email_enviado_at, email_error }),
  });
  return { id: fila?.id as string | undefined, chequeo, email_enviado_at, email_error };
}

const COLOR: Record<Gravedad | "bien", string> = { critico: "#f87171", atencion: "#fbbf24", info: "#93c5fd", bien: "#34d399" };
const ICONO: Record<string, string> = { critico: "🔴", atencion: "🟡", bien: "🟢" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function enviarEmailParte(c: Chequeo, tipo: "diario" | "manual") {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY no está configurada en Vercel");
  const from = process.env.RESEND_FROM ?? "Tu Oráculo <hola@tuoraculo.uy>";
  const fecha = new Date(c.generado_at).toLocaleDateString("es-UY", { timeZone: "America/Montevideo", weekday: "long", day: "numeric", month: "long" });
  const asunto = `${ICONO[c.estado_general]} Parte ${tipo === "diario" ? "diario" : "a pedido"} · ${fecha}`;

  const importantes = c.areas.flatMap((a) => a.hallazgos).filter((h) => h.gravedad === "critico" || h.gravedad === "atencion");
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 4px">Asistente CEO · Tu Oráculo</h2>
  <p style="margin:0 0 16px;color:#666;font-size:13px">${esc(fecha)}</p>
  <p style="font-size:15px;line-height:1.5;padding:12px 14px;border-radius:8px;background:#f6f6f6;border-left:4px solid ${COLOR[c.estado_general]}">${esc(c.resumen)}</p>
  ${importantes.length ? `<h3 style="margin:20px 0 8px">Para atender</h3>
  <ul style="padding-left:18px;line-height:1.5">${importantes.map((h) => `<li style="margin-bottom:8px"><b style="color:${COLOR[h.gravedad]}">●</b> <b>${esc(h.titulo)}</b>${h.detalle ? `<br><span style="color:#555">${esc(h.detalle)}</span>` : ""}${h.que_hacer ? `<br><span style="color:#333">→ ${esc(h.que_hacer)}</span>` : ""}${h.link ? ` <a href="${BASE_URL}${h.link}">Abrir</a>` : ""}</li>`).join("")}</ul>` : ""}
  <h3 style="margin:20px 0 8px">Por área</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    ${c.areas.map((a) => `<tr><td style="padding:8px;border-top:1px solid #eee;white-space:nowrap">${ICONO[a.estado]} <b>${esc(a.nombre)}</b></td><td style="padding:8px;border-top:1px solid #eee">${esc(a.titular)}<br><span style="color:#777">${a.metricas.map((m) => `${esc(m.label)}: ${esc(m.valor)}`).join(" · ")}</span></td></tr>`).join("")}
  </table>
  <p style="margin:20px 0 0"><a href="${BASE_URL}/admin/tarot/asistente" style="background:#b45309;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Ver el asistente</a></p>
  <p style="margin-top:20px;color:#999;font-size:11px">Este parte se envía solo a ${DESTINATARIO_UNICO}. Generado automáticamente; los números salen de la base de datos.</p>
</div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [DESTINATARIO_UNICO], subject: asunto, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
