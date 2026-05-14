import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Tu Horóscopo Cósmico",
  description: "Astrología práctica y personalizada en tu WhatsApp ✨",
icons: {
  icon: [
    { url: "/icons/favicon.ico", type: "image/x-icon" },
    { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    { url: "/icons/favicon-512.png", sizes: "512x512", type: "image/png" },
  ],
  apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  // ❌ eliminar esto mientras no exista el SVG:
  // other: [{ rel: "icon", url: "/icons/favicon.svg", type: "image/svg+xml" }],
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
