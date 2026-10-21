import type { MetadataRoute } from "next";
import { PAGINAS_SEO, SITIO } from "@/lib/seo/paginasSeo";

// sitemap.xml (2026-10-20). Solo páginas públicas e indexables. Quedan fuera:
// flujo de compra (/tarot/checkout, /tarot/gracias, /tarot/estado), accesos
// privados por token (/lectura, /opinion, /pdf), admin, mantenimiento y las
// rutas que hoy redirigen (/horoscopo, /checkout, /gracias).
const PUBLICAS: { ruta: string; prioridad: number }[] = [
  { ruta: "/", prioridad: 1 },
  { ruta: "/tarot", prioridad: 0.9 },
  { ruta: "/faq", prioridad: 0.5 },
  { ruta: "/quienes-somos", prioridad: 0.4 },
  { ruta: "/contacto", prioridad: 0.3 },
  { ruta: "/politica-de-privacidad", prioridad: 0.2 },
  { ruta: "/terminos-del-servicio", prioridad: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const publicas = PUBLICAS.map(({ ruta, prioridad }) => ({
    url: `${SITIO}${ruta}`, // home con barra final: igual que su canonical
    changeFrequency: "monthly" as const,
    priority: prioridad,
  }));
  const seo = Object.values(PAGINAS_SEO).map((p) => ({
    url: `${SITIO}${p.slug}`,
    lastModified: new Date("2026-10-20"),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
  return [...publicas, ...seo];
}
