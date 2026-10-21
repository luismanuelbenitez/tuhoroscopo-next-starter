import type { MetadataRoute } from "next";
import { SITIO } from "@/lib/seo/paginasSeo";

// robots.txt (2026-10-20). Criterio: robots.txt NO reemplaza a noindex.
// Las páginas que no deben indexarse (/lectura/[token], /opinion/[token],
// /mantenimiento) ya declaran noindex en su metadata y se dejan RASTREABLES
// a propósito: si se bloquearan acá, Google no podría leer ese noindex y la
// URL podría indexarse igual (sin contenido) si alguien la enlaza.
// Solo se bloquea /api/: son endpoints, no páginas.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITIO}/sitemap.xml`,
    host: SITIO,
  };
}
