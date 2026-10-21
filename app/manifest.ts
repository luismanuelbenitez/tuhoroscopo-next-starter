import type { MetadataRoute } from "next";

// Manifest web (Paquete SEO 1, 2026-10-21): nombre e íconos de la marca para
// navegadores y accesos directos. No convierte el sitio en PWA.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tu Oráculo",
    short_name: "Tu Oráculo",
    description: "Experiencias digitales de bienestar espiritual. Tarot online personalizado.",
    start_url: "/",
    display: "browser",
    background_color: "#0b0818",
    theme_color: "#0b0818",
    lang: "es-UY",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
