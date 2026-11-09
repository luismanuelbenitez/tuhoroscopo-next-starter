import { HomePageV2 } from "@/components/home2/HomePageV2";
import { getPrecioTarot } from "@/lib/getPrecioTarot";
import { REVALIDAR_MARKETING } from "@/lib/fetchSupabase";
import { metadataPagina } from "@/lib/seo/metadataPagina";
import { htmlJsonLd, jsonLdHome } from "@/lib/seo/jsonLd";

// Pregenerada; precio y testimonios se releen cada 60 s (lib/fetchSupabase).
export const revalidate = 60;

// Home (marca). Server Component solo para declarar metadata propia
// (Paquete SEO 1, 2026-10-21) y leer el precio en el servidor. Desde
// 2026-10-29 renderiza la home v2 ("la marca presenta, el Tarot
// protagoniza"); la anterior queda respaldada en /home-anterior.
export const metadata = metadataPagina(
  "/",
  "Tu Oráculo: tarot online personalizado y bienestar espiritual",
  "Tu Oráculo crea experiencias digitales de bienestar espiritual. Hoy: tarot online personalizado de 5 cartas, que te llega por WhatsApp en minutos.",
);

export default async function Page() {
  const precioUYU = await getPrecioTarot({ revalidar: REVALIDAR_MARKETING });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={htmlJsonLd(jsonLdHome())} />
      <HomePageV2 precioUYU={precioUYU} />
    </>
  );
}
