// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Paquete SEO 2 (2026-10-21): AVIF primero (más liviano), WebP de respaldo.
  // Las imágenes pasan por el optimizador vía lib/imagen (getImageProps).
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    typedRoutes: true
  },
  // Horóscopo deshabilitado por ahora (2026-10-18): sus PÁGINAS redirigen a
  // la home. Temporales (307) para poder reactivarlo sin que los buscadores
  // lo den por definitivo. No se tocan APIs ni webhooks (/api/iniciar-checkout,
  // /api/webhook-mp, /update-suscriptor): siguen funcionando para cualquier
  // suscripción existente.
  // Indexación (Paquete SEO 1, 2026-10-21). Páginas transaccionales y
  // privadas fuera del índice con X-Robots-Tag, en un solo lugar y sin tocar
  // los flujos. NO se bloquean en robots.txt (Google tiene que poder leer
  // este header). /lectura y /opinion ya declaran noindex en su metadata.
  async headers() {
    return [
      { source: "/tarot/checkout", headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }] },
      { source: "/tarot/gracias", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      { source: "/tarot/estado", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/pdf/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] },
    ];
  },
  async redirects() {
    return [
      { source: "/horoscopo", destination: "/", permanent: false },
      { source: "/horoscopo/:path*", destination: "/", permanent: false },
      { source: "/checkout", destination: "/", permanent: false },
      { source: "/gracias", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
