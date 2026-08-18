import { createClient } from "@supabase/supabase-js";

/**
 * Lee el precio base UYU del producto Tarot desde la fuente canónica
 * (tarot_configuracion.precio_base_uyu). Usar solo en contextos server-side
 * (API routes, Server Components).
 *
 * Devuelve `null` si el precio no pudo verificarse — nunca inventa un precio
 * histórico (590) ni asume el vigente (690) como default. Un valor no
 * verificado no debe usarse para cobrar ni mostrarse como si lo fuera; el
 * caller decide cómo degradar la UI (ver docs/product/DECISIONS.md,
 * "Fuente única de precio de Tu Tirada").
 */
export async function getPrecioTarot(): Promise<number | null> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    console.error("[getPrecioTarot] SUPABASE_SECRET_KEY no configurada — precio no disponible");
    return null;
  }

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
    const { data, error } = await supabase
      .from("tarot_configuracion")
      .select("valor")
      .eq("clave", "precio_base_uyu")
      .maybeSingle();

    if (error) {
      console.error("[getPrecioTarot] error leyendo tarot_configuracion:", error.message);
      return null;
    }

    const precio = parseInt(data?.valor ?? "", 10);
    return isNaN(precio) || precio < 1 ? null : precio;
  } catch (err) {
    console.error("[getPrecioTarot] excepción:", err);
    return null;
  }
}
