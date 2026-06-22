import { createClient } from "@supabase/supabase-js";

/**
 * Lee el precio base UYU del producto Tarot desde tarot_configuracion.
 * Usar solo en contextos server-side (API routes, Server Components).
 */
export async function getPrecioTarot(fallback = 590): Promise<number> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return fallback;

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await supabase
      .from("tarot_configuracion")
      .select("valor")
      .eq("clave", "precio_base_uyu")
      .maybeSingle();

    const precio = parseInt(data?.valor ?? "", 10);
    return isNaN(precio) || precio < 1 ? fallback : precio;
  } catch {
    return fallback;
  }
}
