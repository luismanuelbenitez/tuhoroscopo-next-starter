import { createClient } from "@supabase/supabase-js";

/**
 * Lee el precio de suscripción mensual desde la tabla config.
 * Usar solo en contextos server-side (API routes, Server Components).
 */
export async function getPrecioSuscripcion(fallback = 390): Promise<number> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return fallback;

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await supabase
      .from("config")
      .select("valor")
      .eq("nombre", "THC_PRECIO_SUSCRIPCION")
      .maybeSingle();

    const precio = parseInt(data?.valor ?? "", 10);
    return isNaN(precio) || precio < 1 ? fallback : precio;
  } catch {
    return fallback;
  }
}
