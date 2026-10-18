// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  // Horóscopo deshabilitado por ahora (2026-10-18): sus PÁGINAS redirigen a
  // la home. Temporales (307) para poder reactivarlo sin que los buscadores
  // lo den por definitivo. No se tocan APIs ni webhooks (/api/iniciar-checkout,
  // /api/webhook-mp, /update-suscriptor): siguen funcionando para cualquier
  // suscripción existente.
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
