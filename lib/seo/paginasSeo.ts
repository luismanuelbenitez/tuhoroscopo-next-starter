import type { Metadata } from "next";

// Páginas SEO de intención (2026-10-20). Encapsuladas: viven bajo
// /tarot/<slug>, no se enlazan todavía desde el resto del sitio (decisión de
// Manuel: el enganche se decide después). El sitemap las lista desde acá.
//
// Cada página resuelve UNA intención distinta (ver docs/product/DECISIONS.md,
// "Páginas SEO de intención"). Si se agrega una, sumarla acá y en el sitemap
// sale sola.

export const SITIO = "https://tuoraculo.uy";

export type PaginaSeoDef = {
  slug: string;          // ruta completa, ej. "/tarot/amor"
  titulo: string;        // <title> (la plantilla no agrega sufijo: va completo)
  descripcion: string;   // meta description (~150–160 caracteres)
  migaja: string;        // nombre corto para BreadcrumbList
};

export const PAGINAS_SEO = {
  uruguay: {
    slug: "/tarot/online-uruguay",
    titulo: "Tarot online en Uruguay: tu lectura por WhatsApp | Tu Oráculo",
    descripcion:
      "Tarot online desde Uruguay: 5 cartas para tu consulta, pago en pesos con Mercado Pago y tu lectura por WhatsApp en minutos. Pago único, sin suscripción.",
    migaja: "Tarot online en Uruguay",
  },
  personalizada: {
    slug: "/tarot/lectura-personalizada",
    titulo: "Lectura de tarot personalizada: qué recibís y cómo es | Tu Oráculo",
    descripcion:
      "Qué hace personal a una lectura de tarot: tu pregunta, tus 5 cartas, interpretación carta por carta, resumen con audio, mensaje personal y PDF.",
    migaja: "Lectura de tarot personalizada",
  },
  amor: {
    slug: "/tarot/amor",
    titulo: "Tarot del amor: una lectura para tu vínculo | Tu Oráculo",
    descripcion:
      "Tarot del amor para mirar tu vínculo con más claridad: cómo leen las 5 cartas una consulta de pareja, qué preguntas funcionan y qué esperar de la lectura.",
    migaja: "Tarot del amor",
  },
  trabajo: {
    slug: "/tarot/trabajo-y-dinero",
    titulo: "Tarot de trabajo y dinero: claridad para tus decisiones | Tu Oráculo",
    descripcion:
      "Tarot para trabajo, proyectos y dinero: cómo una lectura de 5 cartas te ayuda a mirar un cambio laboral o tu relación con la plata, con claves prácticas.",
    migaja: "Tarot de trabajo y dinero",
  },
  decisiones: {
    slug: "/tarot/decisiones",
    titulo: "Tarot para tomar una decisión: más que un sí o un no | Tu Oráculo",
    descripcion:
      "Tarot para tomar una decisión: por qué una lectura de 5 cartas aporta más que un sí o un no, cómo formular tu pregunta y qué te llevás para decidir.",
    migaja: "Tarot para tomar una decisión",
  },
} satisfies Record<string, PaginaSeoDef>;

export type ClavePaginaSeo = keyof typeof PAGINAS_SEO;

const OG_IMAGEN = { url: "/img/whatsapp/og.jpg", width: 1672, height: 941, alt: "Tu Oráculo — Tarot" };

/** Metadata completa de una página SEO: canonical absoluto, OG, index. */
export function metadataSeo(clave: ClavePaginaSeo): Metadata {
  const p = PAGINAS_SEO[clave];
  const url = `${SITIO}${p.slug}`;
  return {
    title: { absolute: p.titulo },
    description: p.descripcion,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: p.titulo,
      description: p.descripcion,
      url,
      siteName: "Tu Oráculo",
      locale: "es_UY",
      type: "website",
      images: [OG_IMAGEN],
    },
    twitter: {
      card: "summary_large_image",
      title: p.titulo,
      description: p.descripcion,
      images: [OG_IMAGEN.url],
    },
  };
}

/** JSON-LD: migas (Tu Oráculo › Tarot › página) + producto con su oferta real. */
export function jsonLdSeo(clave: ClavePaginaSeo, precioUYU: number | null) {
  const p = PAGINAS_SEO[clave];
  const url = `${SITIO}${p.slug}`;
  const migas = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Tu Oráculo", item: `${SITIO}/` },
      { "@type": "ListItem", position: 2, name: "Tarot", item: `${SITIO}/tarot` },
      { "@type": "ListItem", position: 3, name: p.migaja, item: url },
    ],
  };
  // Sin AggregateRating ni reviews: no se inventan puntajes. Sin precio
  // verificable, se omite la oferta (nunca un precio inventado).
  const producto = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Tarot personalizado — Tu Oráculo",
    description:
      "Lectura de tarot online de 5 cartas para tu consulta: interpretación carta por carta, resumen con audio, mensaje personal, claves prácticas y PDF. Entrega por WhatsApp y email.",
    brand: { "@type": "Brand", name: "Tu Oráculo" },
    image: `${SITIO}/img/whatsapp/og.jpg`,
    url,
    ...(precioUYU !== null && {
      offers: {
        "@type": "Offer",
        price: String(precioUYU),
        priceCurrency: "UYU",
        availability: "https://schema.org/InStock",
        url: `${SITIO}/tarot/checkout`,
      },
    }),
  };
  return [migas, producto];
}
