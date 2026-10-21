import { HomePage } from "@/components/home/HomePage";
import { metadataPagina } from "@/lib/seo/metadataPagina";

// Home (marca). Server Component solo para declarar metadata propia
// (Paquete SEO 1, 2026-10-21); el contenido vive en components/home/HomePage.
export const metadata = metadataPagina(
  "/",
  "Tu Oráculo: tarot online personalizado y bienestar espiritual",
  "Tu Oráculo crea experiencias digitales de bienestar espiritual. Hoy: tarot online personalizado de 5 cartas, que te llega por WhatsApp en minutos.",
);

export default function Page() {
  return <HomePage />;
}
