import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function hdrs(serviceRoleKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };
}

export async function GET(_req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const [alertasRes, emailRes] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/tarot_alertas_config?select=tipo,activa,usa_email_general,email_particular,descripcion&order=tipo.asc`,
      { headers: hdrs(serviceRoleKey), cache: "no-store" },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/tarot_configuracion?clave=eq.TTC_ALERTAS_EMAIL_GENERAL&activo=eq.true&select=valor`,
      { headers: hdrs(serviceRoleKey), cache: "no-store" },
    ),
  ]);

  if (!alertasRes.ok) {
    return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 502 });
  }

  const alertas = await alertasRes.json().catch(() => []);
  const emailRows = emailRes.ok ? await emailRes.json().catch(() => []) : [];
  const emailGeneral: string = emailRows[0]?.valor ?? "";

  return NextResponse.json({ ok: true, alertas, emailGeneral });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  let body: {
    emailGeneral?: string;
    alertas?: { tipo: string; activa: boolean; usa_email_general: boolean; email_particular: string | null }[];
  } = {};
  try { body = await req.json(); } catch { /* noop */ }

  const errors: string[] = [];
  const now = new Date().toISOString();

  if (typeof body.emailGeneral === "string") {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/tarot_configuracion?clave=eq.TTC_ALERTAS_EMAIL_GENERAL`,
      {
        method: "PATCH",
        headers: hdrs(serviceRoleKey),
        body: JSON.stringify({ valor: body.emailGeneral.trim(), updated_at: now }),
        cache: "no-store",
      },
    );
    if (!r.ok) errors.push("emailGeneral");
  }

  if (Array.isArray(body.alertas)) {
    await Promise.all(
      body.alertas.map(async (a) => {
        const r = await fetch(
          `${supabaseUrl}/rest/v1/tarot_alertas_config?tipo=eq.${encodeURIComponent(a.tipo)}`,
          {
            method: "PATCH",
            headers: hdrs(serviceRoleKey),
            body: JSON.stringify({
              activa:            Boolean(a.activa),
              usa_email_general: Boolean(a.usa_email_general),
              email_particular:  a.email_particular?.trim() || null,
              updated_at:        now,
            }),
            cache: "no-store",
          },
        );
        if (!r.ok) errors.push(a.tipo);
      }),
    );
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { ok: false, motivo: "db_error", detalle: `Fallaron: ${errors.join(", ")}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
