import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { headers } from "next/headers";

export const metadata: Metadata = {
  metadataBase: new URL("https://tuoraculo.uy"),
  title: "Tu Oráculo",
  description: "Claridad cuando más la necesitás. Horóscopo diario y lectura de tarot, directo a tu WhatsApp.",
  openGraph: {
    title: "Tu Oráculo",
    description: "Claridad cuando más la necesitás.",
    url: "https://tuoraculo.uy",
    siteName: "Tu Oráculo",
    images: [{ url: "/img/whatsapp/og.jpg", width: 1200, height: 630, alt: "Tu Oráculo" }],
    locale: "es_UY",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tu Oráculo",
    description: "Claridad cuando más la necesitás.",
    images: ["/img/whatsapp/og.jpg"],
  },
icons: {
  icon: [
    { url: "/img/logo/logo-isotipo.png", sizes: "512x512", type: "image/png" },
    { url: "/icons/favicon.ico", type: "image/x-icon" },
  ],
  apple: { url: "/img/logo/logo-isotipo.png", sizes: "180x180", type: "image/png" },
},
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = headers().get("x-is-admin") === "1";

  return (
    <html lang="es">
      <body className="bg-cosmic min-h-screen flex flex-col">
        {!isAdmin && <Header />}
        <main className="flex-1">{children}</main>
        {!isAdmin && <Footer />}
      </body>
    </html>
  );
}
