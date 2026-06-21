import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

// Keys in public.config that contain sensitive values — display redacted
const SENSITIVE_CONFIG_KEYS = [
  "whatsapp_internal_key",
  "supabase_anon_key",
  "supabase_service_role_key",
  "anon_key",
  "service_role",
  "token",
  "secret",
  "password",
  "key",
];

// Keys in public.configuracion that are sensitive
const SENSITIVE_CONFIGURACION_FIELDS = new Set([
  "whatsapp_token_app",
]);

function isSensitiveConfigKey(nombre: string): boolean {
  const lower = nombre.toLowerCase();
  return SENSITIVE_CONFIG_KEYS.some((p) => lower.includes(p));
}

function redactConfigValue(nombre: string, valor: string): string {
  if (isSensitiveConfigKey(nombre)) return "***redacted***";
  return valor;
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Read public.config (key-value)
  const [configRes, configuracionRes] = await Promise.all([
    supabase
      .from("config")
      .select("id, nombre, valor, created_at")
      .order("nombre"),
    supabase
      .from("configuracion")
      .select(
        "id, whatsapp_token_app, whatsapp_phone_number_id, whatsapp_business_id, nombre_plantilla, url_webhook_premium, url_webhook_gratis, link_pago_premium, precio_actual, version_flujo, admin_contacto"
      )
      .limit(1)
      .maybeSingle(),
  ]);

  const warnings: string[] = [];

  if (configRes.error) warnings.push(`config: ${configRes.error.message}`);
  if (configuracionRes.error) warnings.push(`configuracion: ${configuracionRes.error.message}`);

  // Sanitize public.config
  const configRows = Array.isArray(configRes.data) ? configRes.data : [];
  const config = configRows.map((row) => ({
    id: row.id,
    nombre: row.nombre,
    valor: redactConfigValue(String(row.nombre ?? ""), String(row.valor ?? "")),
    es_sensible: isSensitiveConfigKey(String(row.nombre ?? "")),
    created_at: row.created_at ?? null,
    editable: ["APP_DEBUG_MODE", "WHATSAPP_MODO", "THC_BACK_URL", "TTC_BACK_URL", "MODO_MANTENIMIENTO", "THC_PRECIO_SUSCRIPCION", "OPENAI_MODEL"].includes(String(row.nombre).toUpperCase()),
  }));

  // Sanitize public.configuracion
  const raw = configuracionRes.data;
  const configuracion = raw
    ? {
        id: raw.id,
        whatsapp_token_app: SENSITIVE_CONFIGURACION_FIELDS.has("whatsapp_token_app")
          ? "***redacted***"
          : raw.whatsapp_token_app,
        whatsapp_phone_number_id: raw.whatsapp_phone_number_id,
        whatsapp_business_id: raw.whatsapp_business_id,
        nombre_plantilla: raw.nombre_plantilla,
        url_webhook_premium: raw.url_webhook_premium,
        url_webhook_gratis: raw.url_webhook_gratis,
        link_pago_premium: raw.link_pago_premium,
        precio_actual: raw.precio_actual,
        version_flujo: raw.version_flujo,
        admin_contacto: raw.admin_contacto,
      }
    : null;

  return NextResponse.json({
    ok: true,
    config,
    configuracion,
    warnings,
    nota: "Campos sensibles aparecen como ***redacted***. APP_DEBUG_MODE y WHATSAPP_MODO son editables desde el panel.",
  });
}
