import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

function getEnv() {
  const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  return NextResponse.json({ ok: true, data });
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
