import { createClient } from "@supabase/supabase-js";
import type { TestimonioTarot } from "@/lib/getTestimoniosTarot";

/**
 * Testimonios para las páginas SEO: SOLO los publicados en el admin Y con
 * autorización explícita del cliente para publicarse (autoriza_publicacion).
 * Más estricto que la landing a propósito (decisión de Manuel, 2026-10-20:
 * "no utilizar feedback no autorizado"). No modifica getTestimoniosTarot.
 * Ante cualquier problema devuelve [] y la página oculta la sección.
 */
export async function getTestimoniosAutorizados(max = 3): Promise<TestimonioTarot[]> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) return [];
  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
    const { data, error } = await supabase
      .from("tarot_testimonios")
      .select("id, opinion, puntuacion, nombre, ciudad")
      .eq("publicado", true)
      .eq("autoriza_publicacion", true)
      .order("orden_visual", { ascending: true })
      .order("publicado_at", { ascending: false })
      .limit(max);
    if (error) return [];
    return (data ?? [])
      .filter((t) => t.opinion && t.puntuacion !== null)
      .map((t) => ({
        id: t.id,
        opinion: t.opinion,
        puntuacion: Math.max(0, Math.min(5, t.puntuacion)),
        nombre: t.nombre,
        ciudad: t.ciudad,
      }));
  } catch {
    return [];
  }
}
