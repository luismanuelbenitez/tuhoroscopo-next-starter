import type { Metadata } from "next";
import { HomePage } from "@/components/home/HomePage";

// Respaldo de la home anterior a la v2 (reemplazada el 2026-10-29). Fuera
// del índice y sin canonical: solo para comparar o volver atrás (en ese
// caso, app/page.tsx vuelve a renderizar <HomePage />).
export const metadata: Metadata = {
  title: "Tu Oráculo — Home anterior (respaldo)",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <HomePage />;
}
