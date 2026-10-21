import { SITIO } from "@/lib/seo/paginasSeo";

// Datos estructurados (Paquete SEO 2, 2026-10-21). Una sola fuente:
//  - Home: Organization + WebSite (identidad de la marca).
//  - /tarot: Product + Offer — la ÚNICA página que representa el producto.
//    Las landings por tema llevan solo sus migas (jsonLdSeo), para no
//    declarar el mismo producto en 5 URLs.
// Sin AggregateRating ni reviews: no se inventan puntajes. Sin precio
// verificable se omite la oferta (nunca un precio inventado).

const ORG_ID = `${SITIO}/#organizacion`;

export function jsonLdHome() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": ORG_ID,
      name: "Tu Oráculo",
      url: `${SITIO}/`,
      logo: `${SITIO}/img/logo/logo-isotipo.png`,
      email: "hola@tuoraculo.uy",
      areaServed: "UY",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Tu Oráculo",
      url: `${SITIO}/`,
      inLanguage: "es-UY",
      publisher: { "@id": ORG_ID },
    },
  ];
}

export function jsonLdTarot(precioUYU: number | null) {
  const url = `${SITIO}/tarot`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Tu Oráculo", item: `${SITIO}/` },
        { "@type": "ListItem", position: 2, name: "Tarot", item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Tarot personalizado — Tu Oráculo",
      description:
        "Tirada de tarot online de 5 cartas para tu consulta: interpretación carta por carta, resumen con audio, mensaje personal, claves prácticas y PDF. Entrega por WhatsApp y email.",
      brand: { "@type": "Brand", name: "Tu Oráculo" },
      image: `${SITIO}/img/whatsapp/og.jpg`,
      url,
      ...(precioUYU !== null && {
        offers: {
          "@type": "Offer",
          price: String(precioUYU),
          priceCurrency: "UYU",
          availability: "https://schema.org/InStock",
          url,
        },
      }),
    },
  ];
}

/** `<script type="application/ld+json">` seguro (escapa `<`). */
export function htmlJsonLd(datos: unknown) {
  return { __html: JSON.stringify(datos).replace(/</g, "\\u003c") };
}
