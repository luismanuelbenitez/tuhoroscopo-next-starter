import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { headers } from "next/headers";
import { GoogleAnalytics } from "@next/third-parties/google";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { MetaPixel } from "@/components/MetaPixel";
import { StyledJsxRegistry } from "@/components/StyledJsxRegistry";
import { VercelInsights } from "@/components/VercelInsights";

export const metadata: Metadata = {
  metadataBase: new URL("https://tuoraculo.uy"),
  title: "Tu Oráculo",
  description: "Tarot: lectura personalizada con IA, directo a tu WhatsApp en menos de 15 minutos.",
  openGraph: {
    title: "Tu Oráculo",
    description: "Tarot: lectura personalizada, directo a tu WhatsApp en menos de 15 minutos.",
    // Sin `url` acá (Paquete SEO 1, 2026-10-21): heredada, hacía que TODAS las
    // páginas declararan og:url = home. Cada página indexable declara la suya
    // (lib/seo/metadataPagina, lib/seo/paginasSeo).
    siteName: "Tu Oráculo",
    images: [{ url: "/img/whatsapp/og.jpg", width: 1672, height: 941, alt: "Tu Oráculo" }],
    locale: "es_UY",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tu Oráculo",
    description: "Tarot: lectura personalizada, directo a tu WhatsApp en menos de 15 minutos.",
    images: ["/img/whatsapp/og.jpg"],
  },
  // Íconos (Paquete SEO 1, 2026-10-21): convenciones de archivo de Next en
  // app/ (favicon.ico 16/32/48, icon.png 48, apple-icon.png 180) — con un
  // app/favicon.ico presente Next ignora `icons` acá. Antes: el PNG de 512 px
  // / 430 KB del logo como ícono (se descargaba en cada página) y un
  // /icons/favicon.ico inexistente (404).
  verification: {
    other: {
      "facebook-domain-verification": "up4qonfp1o0te6emdp58buogl9ckug",
    },
  },
};

// Cormorant Garamond (marca) con next/font (Paquete SEO 2, 2026-10-21): se
// sirve desde el propio dominio, con preload y respaldo de métricas ajustadas
// (sin salto de layout). Reemplaza el @import de Google Fonts que estaba en
// GlobalHomeStyles (cadena HTML → CSS de Google → fuente, sin preload). Los
// componentes la usan vía var(--font-cormorant) (components/home/theme SERIF).
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-cormorant",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = headers().get("x-is-admin") === "1";
  const hideChrome = isAdmin || headers().get("x-hide-chrome") === "1";

  return (
    <html lang="es" className={cormorant.variable}>
      <body className="bg-cosmic min-h-screen flex flex-col">
        <StyledJsxRegistry>
          <AnalyticsProvider />
          {!hideChrome && <Header />}
          <main className="flex-1">{children}</main>
          {!hideChrome && <Footer />}
        </StyledJsxRegistry>
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
        {process.env.NEXT_PUBLIC_META_PIXEL_ID && (
          <MetaPixel pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID} />
        )}
        {/* Vercel Web Analytics + Speed Insights (2026-10-22): tráfico agregado
            y experiencia real. Diferidos, sin cookies; ver components/VercelInsights. */}
        <VercelInsights />
      </body>
    </html>
  );
}
