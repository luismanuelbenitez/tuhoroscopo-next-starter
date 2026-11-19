import { createClient } from "@supabase/supabase-js";
import { fetchSupabase } from "@/lib/fetchSupabase";
import { SELECT_TESTIMONIO, aTestimonio, type TestimonioTarot } from "@/lib/getTestimoniosTarot";

/**
 * Testimonios para las páginas SEO: SOLO los publicados en el admin Y con
 * autorización explícita del cliente para publicarse (autoriza_publicacion).
 * Más estricto que la landing a propósito (decisión de Manuel, 2026-10-20:
 * "no utilizar feedback no autorizado"). No modifica getTestimoniosTarot.
 * Ante cualquier problema devuelve [] y la página oculta la sección.
 */
export async function getTestimoniosAutorizados(max = 3, opciones?: { revalidar?: number }): Promise<TestimonioTarot[]> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) return [];
  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false },
      global: { fetch: fetchSupabase(opciones?.revalidar) },
    });
    const { data, error } = await supabase
      .from("tarot_testimonios")
      .select(SELECT_TESTIMONIO)
      .eq("publicado", true)
      .eq("autoriza_publicacion", true)
      .order("orden_visual", { ascending: true })
      .order("publicado_at", { ascending: false })
      .limit(max);
    if (error) return [];
    return ((data ?? []) as Parameters<typeof aTestimonio>[0][]).map(aTestimonio).filter((t): t is TestimonioTarot => t !== null);
  } catch {
    return [];
  }
}
