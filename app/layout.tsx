import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Tu Oráculo",
  description: "Guía diaria personalizada y lecturas de tarot, directo a tu WhatsApp.",
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
