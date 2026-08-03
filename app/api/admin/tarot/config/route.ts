import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function headers(serviceRoleKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };
}

// Claves que no exponemos en el panel (UUIDs internos, buckets de storage)
const CLAVES_OCULTAS = new Set([
  "mazo_default",
  "tipo_tirada_default",
  "storage_bucket_assets",
  "storage_bucket_pdfs",
]);

export async function GET(_req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tarot_configuracion?activo=eq.true&es_secreto=eq.false&select=clave,valor,tipo_valor,descripcion&order=clave.asc`,
    { headers: headers(serviceRoleKey), cache: "no-store" },
  );

  if (!res.ok) return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 502 });

  const rows: { clave: string; valor: string; tipo_valor: string; descripcion: string | null }[] =
    await res.json().catch(() => []);

  const data = rows.filter((r) => !CLAVES_OCULTAS.has(r.clave));

  // Consulta el estado de los secrets desde el runtime de Supabase Edge Functions,
  // que es donde realmente ocurre el envío de WhatsApp.
  // Timeout de 5s para no bloquear la carga del panel si la EF no responde.
  let envStatus: Record<string, unknown> = { ef_unreachable: true };
  try {
    const efRes = await fetch(
      `${supabaseUrl}/functions/v1/ef_tarot_env_status`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${serviceRoleKey}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (efRes.ok) {
      const efData = await efRes.json().catch(() => null);
      if (efData?.ok) {
        envStatus = {
          whatsapp_token_configurado:          efData.whatsapp_token_configurado,
          whatsapp_phone_id_configurado:       efData.whatsapp_phone_number_id_configurado,
          source:                              "supabase_edge_secrets",
        };
      }
    }
  } catch {
    // timeout o EF no disponible — el panel mostrará estado indeterminado
  }

  return NextResponse.json({ ok: true, data, env_status: envStatus });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const { supabaseUrl, serviceRoleKey } = env;

  let body: { updates?: Record<string, string> } = {};
  try { body = await req.json(); } catch { /* noop */ }

  const updates = body.updates;
  if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, motivo: "updates_requerido" }, { status: 400 });
  }

  // PATCH cada clave individualmente (Supabase REST filtra por clave)
  const errors: string[] = [];
  await Promise.all(
    Object.entries(updates).map(async ([clave, valor]) => {
      if (CLAVES_OCULTAS.has(clave)) return; // silently skip hidden keys
      const r = await fetch(
        `${supabaseUrl}/rest/v1/tarot_configuracion?clave=eq.${encodeURIComponent(clave)}&activo=eq.true`,
        {
          method: "PATCH",
          headers: headers(serviceRoleKey),
          body: JSON.stringify({ valor: String(valor) }),
          cache: "no-store",
        },
      );
      if (!r.ok) errors.push(clave);
    }),
  );

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: `Fallaron: ${errors.join(", ")}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
