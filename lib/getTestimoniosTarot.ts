import { createClient } from "@supabase/supabase-js";
import { fetchSupabase } from "@/lib/fetchSupabase";

export interface TestimonioTarot {
  id: string;
  opinion: string;
  puntuacion: number; // 0–5
  nombre: string | null;
  ciudad: string | null;
  // "✓ Lectura verificada" (2026-11-19, pedido de Manuel): la opinión está
  // atada a una orden que recibió su lectura. Sin tema ni fecha a la vista.
  verificada?: boolean;
}

const MAX_PUBLICADOS = 3;

// Columnas que se leen de tarot_testimonios, con el estado de su orden.
export const SELECT_TESTIMONIO = "id, opinion, puntuacion, nombre, ciudad, tarot_ordenes!tarot_testimonios_orden_id_fkey(estado)";

type FilaTestimonio = {
  id: string; opinion: string | null; puntuacion: number | null; nombre: string | null; ciudad: string | null;
  tarot_ordenes: { estado: string | null } | { estado: string | null }[] | null;
};

// Fila de la base → testimonio para mostrar. null si le falta opinión o nota.
export function aTestimonio(t: FilaTestimonio): TestimonioTarot | null {
  if (!t.opinion || t.puntuacion === null) return null;
  const orden = Array.isArray(t.tarot_ordenes) ? t.tarot_ordenes[0] : t.tarot_ordenes;
  return {
    id: t.id,
    opinion: t.opinion,
    puntuacion: Math.max(0, Math.min(5, t.puntuacion)),
    nombre: t.nombre,
    ciudad: t.ciudad,
    verificada: orden?.estado === "entregado",
  };
}

/**
 * Testimonios publicados de Tu Tirada Tarot (tarot_testimonios con
 * publicado = true), en el orden definido desde el admin. Usar solo
 * server-side (Server Components / API routes).
 *
 * Devuelve [] ante cualquier problema (tabla todavía no creada, credencial
 * ausente, error de red): la landing oculta la sección en ese caso — nunca
 * se muestran testimonios de relleno (ver docs/product/DECISIONS.md,
 * "No usar testimonios inventados").
 */
export async function getTestimoniosTarot(opciones?: { revalidar?: number }): Promise<TestimonioTarot[]> {
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
      .order("orden_visual", { ascending: true })
      .order("publicado_at", { ascending: false })
      .limit(MAX_PUBLICADOS);

    if (error) {
      console.error("[getTestimoniosTarot] error leyendo tarot_testimonios:", error.message);
      return [];
    }

    return ((data ?? []) as FilaTestimonio[]).map(aTestimonio).filter((t): t is TestimonioTarot => t !== null);
  } catch (err) {
    console.error("[getTestimoniosTarot] excepción:", err);
    return [];
  }
}

/**
 * SOLO para revisar el diseño en desarrollo (`/tarot?demo=testimonios`,
 * nunca en producción — ver app/tarot/page.tsx). Textos de ejemplo de la
 * referencia visual de Manuel, no son clientes reales.
 */
export const TESTIMONIOS_DEMO: TestimonioTarot[] = [
  { id: "demo-1", puntuacion: 5, nombre: "Carolina", ciudad: "Montevideo", opinion: "Me sorprendió la precisión y la claridad de la lectura. Sentí que hablaba directamente de mi situación." },
  { id: "demo-2", puntuacion: 5, nombre: "Martín", ciudad: "Canelones", opinion: "Recibí mi lectura en minutos y el audio es hermoso. La experiencia completa es realmente especial." },
  { id: "demo-3", puntuacion: 4, nombre: "Lucía", ciudad: "Maldonado", opinion: "Las cartas me dieron una perspectiva que necesitaba. El mensaje personal y las claves me ayudaron a tomar decisiones con más confianza." },
];
