// Inteligencia comercial (2026-11-24): canales de adquisición normalizados.
//
// Toda la consola habla de canales, no de plataformas: Google Ads es el
// primero integrado, Meta ya se reutiliza, y sumar otro canal (Microsoft,
// TikTok, email, referidos…) es agregar su regla acá y su fuente de gasto en
// gasto.ts. Las pantallas no cambian.
//
// La fuente de cada visita ya la clasifica la web al registrarla
// (lib/visitantes/clasificar.ts → funnel_sessions.fuente); acá solo se agrupa.

export type Canal = "google_ads" | "meta_ads" | "seo" | "social" | "mensajeria" | "referidos" | "directo" | "otro";

export const CANALES: { id: Canal; nombre: string; pago: boolean }[] = [
  { id: "google_ads", nombre: "Google Ads", pago: true },
  { id: "meta_ads", nombre: "Meta Ads", pago: true },
  { id: "seo", nombre: "Búsqueda orgánica", pago: false },
  { id: "social", nombre: "Redes (sin pago)", pago: false },
  { id: "mensajeria", nombre: "WhatsApp y email", pago: false },
  { id: "referidos", nombre: "Referidos y otras campañas", pago: false },
  { id: "directo", nombre: "Directo", pago: false },
  { id: "otro", nombre: "Otros", pago: false },
];
export const NOMBRE_CANAL = Object.fromEntries(CANALES.map((c) => [c.id, c.nombre])) as Record<Canal, string>;

/** Canal de una visita a partir de la fuente que guardó la web. */
export function canalDeFuente(fuente: string | null | undefined): Canal {
  switch (fuente) {
    case "Google Ads": return "google_ads";
    case "Meta Ads": return "meta_ads";
    case "Google orgánico": case "Otros buscadores": return "seo";
    case "Instagram": case "Facebook": return "social";
    case "WhatsApp": case "Email": return "mensajeria";
    case "Campaña (otra)": case "Referencia": return "referidos";
    case "Directo": case null: case undefined: case "": return "directo";
    default: return "otro";
  }
}

/** Modelos de atribución: a qué canal se le cuenta cada venta (una sola vez). */
export type Atribucion = "ultimo" | "primero";
export const ATRIBUCIONES: { id: Atribucion; nombre: string; ayuda: string }[] = [
  { id: "ultimo", nombre: "Último contacto", ayuda: "La venta es del canal de la visita en la que compró." },
  { id: "primero", nombre: "Primer contacto", ayuda: "La venta es del canal por el que esa persona llegó la primera vez." },
];
