import type { Metadata } from "next";
import { SITIO } from "@/lib/seo/paginasSeo";

// Metadata de páginas INDEXABLES que no son landings SEO (2026-10-21,
// Paquete SEO 1): título absoluto propio, canonical a sí misma (sin
// parámetros), index/follow y Open Graph con SU url. Next no hace merge
// profundo de openGraph, por eso se repite la imagen acá.
//
// Política del dominio (ver docs/product/DECISIONS.md): toda página indexable
// lleva canonical absoluto a sí misma; las privadas/transaccionales llevan
// noindex (vía X-Robots-Tag en next.config) y nunca canonical.
const OG_IMAGEN = { url: "/img/whatsapp/og.jpg", width: 1672, height: 941, alt: "Tu Oráculo" };

export function metadataPagina(ruta: string, titulo: string, descripcion: string): Metadata {
  const url = `${SITIO}${ruta}`; // home: "https://tuoraculo.uy/" (forma que Next emite)
  return {
    title: { absolute: titulo },
    description: descripcion,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: titulo,
      description: descripcion,
      url,
      siteName: "Tu Oráculo",
      locale: "es_UY",
      type: "website",
      images: [OG_IMAGEN],
    },
    twitter: { card: "summary_large_image", title: titulo, description: descripcion, images: [OG_IMAGEN.url] },
  };
}
